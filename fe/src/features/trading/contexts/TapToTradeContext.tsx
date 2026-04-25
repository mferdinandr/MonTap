'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { useSignMessage } from 'wagmi';
import { toast } from 'sonner';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours


export interface SessionKey {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  expiresAt: number; // unix ms
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
}

const TapToTradeContext = createContext<TapToTradeContextType | undefined>(undefined);

export const TapToTradeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [asset, setAsset] = useState('BTC');
  const [collateralPerTap, setCollateralPerTap] = useState(10);
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const { signMessageAsync } = useSignMessage();

  const createSession = useCallback(async (traderAddress: `0x${string}`): Promise<boolean> => {
    setIsCreatingSession(true);
    try {
      // Generate ephemeral session key
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      const expiresAt = Date.now() + SESSION_DURATION_MS;

      // Ask user to sign once
      const message = `Authorize session key ${account.address} for MonadBlitz until ${expiresAt}`;
      const authSignature = await signMessageAsync({ message });

      // Backend verifies + funds session key with MON (for gas)
      const res = await fetch(`${BACKEND_URL}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trader: traderAddress,
          sessionKeyAddress: account.address,
          expiresAt,
          authSignature,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        toast.error(`Session failed: ${data.error}`);
        return false;
      }

      setSessionKey({ privateKey, address: account.address, expiresAt });
      toast.success(`Session active — ${data.funding.usdc} USDC & ${data.funding.mon} MON funded`);
      return true;
    } catch (err: any) {
      if (err?.message?.includes('User rejected')) {
        toast.error('Session authorization cancelled');
      } else {
        toast.error(err?.message || 'Failed to create session');
      }
      return false;
    } finally {
      setIsCreatingSession(false);
    }
  }, [signMessageAsync]);

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
