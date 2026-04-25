'use client';

import { useCallback, useState, useRef } from 'react';
import {
  useWriteContract,
  useReadContract,
  useAccount,
  usePublicClient,
} from 'wagmi';
import { createWalletClient, createPublicClient, http, maxUint256, keccak256, toBytes, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TAP_BET_MANAGER_ADDRESS, USDC_ADDRESS } from '@/config/contracts';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? 'https://testnet-rpc.monad.xyz'] },
  },
} as const;

const TAP_BET_MANAGER_ABI = [
  {
    type: 'function',
    name: 'placeBet',
    inputs: [
      { name: 'symbol', type: 'bytes32' },
      { name: 'targetPrice', type: 'uint256' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'collateral', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'expectedMultiplier', type: 'uint256' },
    ],
    outputs: [{ name: 'betId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'placeBetFor',
    inputs: [
      { name: 'trader', type: 'address' },
      { name: 'symbol', type: 'bytes32' },
      { name: 'targetPrice', type: 'uint256' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'collateral', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'expectedMultiplier', type: 'uint256' },
    ],
    outputs: [{ name: 'betId', type: 'uint256' }],
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

export interface PlaceBetParams {
  symbolName: string;
  targetPrice: bigint;
  entryPrice?: bigint;
  collateralUsdc: number;
  expirySeconds: number;
  expectedMultiplier: number;
}

export function usePlaceBet() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { sessionKey } = useTapToTrade();
  const [isApproving, setIsApproving] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nonce manager — shared init promise prevents race condition on rapid bets
  const sessionNonceRef = useRef<number | null>(null);
  const lastSessionKeyRef = useRef<string | null>(null);
  const nonceFetchingRef = useRef<Promise<number> | null>(null);

  const { writeContractAsync } = useWriteContract();

  // Allowance check for the connected wallet (fallback path)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, TAP_BET_MANAGER_ADDRESS] : undefined,
    query: { enabled: !!address && !sessionKey },
  });

  const placeBet = useCallback(async (params: PlaceBetParams): Promise<`0x${string}` | null> => {
    setError(null);

    const collateral = parseUnits(params.collateralUsdc.toString(), 6);
    const symbolBytes32 = keccak256(toBytes(params.symbolName));
    const expiry = BigInt(Math.floor(Date.now() / 1000) + params.expirySeconds);
    const entryPrice = params.entryPrice ?? 0n;

    // ── Session key path: sign + send directly, no popup ──────────────────────
    if (sessionKey) {
      if (sessionKey.expiresAt <= Date.now()) {
        throw new Error('Session expired — please start a new session');
      }

      setIsPlacing(true);
      try {
        const account = privateKeyToAccount(sessionKey.privateKey);
        const transport = http(process.env.NEXT_PUBLIC_RPC_URL);
        const sessionPublicClient = createPublicClient({ chain: MONAD_TESTNET, transport });
        const sessionClient = createWalletClient({ account, chain: MONAD_TESTNET, transport });

        // Reset nonce tracking when session key changes
        if (lastSessionKeyRef.current !== sessionKey.address) {
          lastSessionKeyRef.current = sessionKey.address;
          sessionNonceRef.current = null;
          nonceFetchingRef.current = null;
        }

        // Atomic nonce init — if two bets race here, both await the same promise
        if (sessionNonceRef.current === null) {
          if (!nonceFetchingRef.current) {
            nonceFetchingRef.current = sessionPublicClient
              .getTransactionCount({ address: account.address, blockTag: 'pending' })
              .then((n) => { sessionNonceRef.current = n; return n; })
              .finally(() => { nonceFetchingRef.current = null; });
          }
          await nonceFetchingRef.current;
        }
        const nonce = sessionNonceRef.current!++;

        // Session key calls placeBetFor — USDC pulled from trader's wallet (already approved)
        const tx = await sessionClient.writeContract({
          address: TAP_BET_MANAGER_ADDRESS,
          abi: TAP_BET_MANAGER_ABI,
          functionName: 'placeBetFor',
          args: [sessionKey.trader, symbolBytes32, params.targetPrice, entryPrice, collateral, expiry, BigInt(params.expectedMultiplier)],
          gas: 500000n,
          nonce,
        });

        setIsPlacing(false);
        return tx;
      } catch (err: unknown) {
        // Reset nonce so next bet re-fetches from chain (in case of revert/dropped tx)
        sessionNonceRef.current = null;
        nonceFetchingRef.current = null;
        setIsApproving(false);
        setIsPlacing(false);
        throw err; // re-throw so TradingGrid's catch shows toast.error
      }
    }

    // ── Fallback: connected wallet path (requires popup each time) ─────────────
    if (!address) { setError('Wallet not connected'); return null; }
    if (!publicClient) { setError('Public client unavailable'); return null; }

    try {
      const currentAllowance = allowance ?? 0n;
      if (currentAllowance < collateral) {
        setIsApproving(true);
        const approveTx = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [TAP_BET_MANAGER_ADDRESS, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        await refetchAllowance();
        setIsApproving(false);
      }

      setIsPlacing(true);
      const tx = await writeContractAsync({
        address: TAP_BET_MANAGER_ADDRESS,
        abi: TAP_BET_MANAGER_ABI,
        functionName: 'placeBet',
        args: [symbolBytes32, params.targetPrice, entryPrice, collateral, expiry, BigInt(params.expectedMultiplier)],
      });

      setIsPlacing(false);
      return tx;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsApproving(false);
      setIsPlacing(false);
      return null;
    }
  }, [address, allowance, sessionKey, publicClient, writeContractAsync, refetchAllowance]);

  return {
    placeBet,
    isApproving,
    isPlacing,
    isPending: isApproving || isPlacing,
    error,
  };
}
