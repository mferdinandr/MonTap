'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { maxUint256 } from 'viem';
import { useSignMessage, useWriteContract, usePublicClient } from 'wagmi';
import { toast } from 'sonner';
import { TAP_BET_MANAGER_ADDRESS, USDC_ADDRESS } from '@/config/contracts';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

const SESSION_KEY_ABI = [
  {
    type: 'function',
    name: 'authorizeSessionKey',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

export interface SessionKey {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  expiresAt: number; // unix ms
  trader: `0x${string}`;
}

interface TapToTradeContextType {
  isActive: boolean;
  setIsActive: (active: boolean) => void;

  asset: string;
  setAsset: (asset: string) => void;

  collateralPerTap: number;
  setCollateralPerTap: (amount: number) => void;

  sessionKey: SessionKey | null;
  isCreatingSession: boolean;
  createSession: (traderAddress: `0x${string}`) => Promise<boolean>;
  clearSession: () => void;

  multiTapEnabled: boolean;
  setMultiTapEnabled: (v: boolean) => void;
}

const TapToTradeContext = createContext<TapToTradeContextType | undefined>(undefined);

export const TapToTradeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [asset, setAsset] = useState('BTC');
  const [collateralPerTap, setCollateralPerTap] = useState(10);
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [multiTapEnabled, setMultiTapEnabled] = useState(false);

  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const createSession = useCallback(async (traderAddress: `0x${string}`): Promise<boolean> => {
    setIsCreatingSession(true);
    try {
      // 1. Generate ephemeral session key
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      const expiresAt = Date.now() + SESSION_DURATION_MS;

      // 2. Sign to authorize backend to fund session key with MON
      toast.loading('Sign to authorize session…', { id: 'session' });
      const message = `Authorize session key ${account.address} for MonadBlitz until ${expiresAt}`;
      const authSignature = await signMessageAsync({ message });

      // 3. Backend funds session key with MON for gas
      toast.loading('Funding session key with gas…', { id: 'session' });
      const res = await fetch(`${BACKEND_URL}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trader: traderAddress, sessionKeyAddress: account.address, expiresAt, authSignature }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(`Session failed: ${data.error}`, { id: 'session' });
        return false;
      }

      // 4. Approve TapBetManager to spend trader's USDC (if not already)
      const currentAllowance = publicClient
        ? (await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [traderAddress, TAP_BET_MANAGER_ADDRESS],
          }) as bigint)
        : 0n;

      if (currentAllowance === 0n) {
        toast.loading('Approve USDC for trading… (1/2)', { id: 'session' });
        const approveTx = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [TAP_BET_MANAGER_ADDRESS, maxUint256],
        });
        await publicClient?.waitForTransactionReceipt({ hash: approveTx });
      }

      // 5. Authorize session key on TapBetManager (one popup)
      toast.loading('Authorize session key on-chain… (2/2)', { id: 'session' });
      const authTx = await writeContractAsync({
        address: TAP_BET_MANAGER_ADDRESS,
        abi: SESSION_KEY_ABI,
        functionName: 'authorizeSessionKey',
        args: [account.address],
      });
      await publicClient?.waitForTransactionReceipt({ hash: authTx });

      setSessionKey({ privateKey, address: account.address, expiresAt, trader: traderAddress });
      toast.success('Session active! Tap to trade without popups.', { id: 'session' });
      return true;
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        toast.error('Cancelled', { id: 'session' });
      } else {
        toast.error(msg || 'Failed to create session', { id: 'session' });
      }
      return false;
    } finally {
      setIsCreatingSession(false);
    }
  }, [signMessageAsync, writeContractAsync, publicClient]);

  const clearSession = useCallback(() => {
    setSessionKey(null);
    setIsActive(false);
  }, []);

  return (
    <TapToTradeContext.Provider
      value={{
        isActive,
        setIsActive,
        asset,
        setAsset,
        collateralPerTap,
        setCollateralPerTap,
        sessionKey,
        isCreatingSession,
        createSession,
        clearSession,
        multiTapEnabled,
        setMultiTapEnabled,
      }}
    >
      {children}
    </TapToTradeContext.Provider>
  );
};

export const useTapToTrade = () => {
  const context = useContext(TapToTradeContext);
  if (context === undefined) {
    throw new Error('useTapToTrade must be used within a TapToTradeProvider');
  }
  return context;
};
