'use client';

import { useCallback, useState } from 'react';
import {
  useWriteContract,
  useReadContract,
  useAccount,
  usePublicClient,
} from 'wagmi';
import { maxUint256, keccak256, toBytes, parseUnits } from 'viem';
import { TAP_BET_MANAGER_ADDRESS, USDC_ADDRESS } from '@/config/contracts';

// Minimal ABIs — only functions we need
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
  symbolName: string;       // e.g. "BTC"
  targetPrice: bigint;      // 8-decimal
  entryPrice: bigint;       // 8-decimal — current price at click time
  collateralUsdc: number;   // human-readable USDC amount (e.g. 10)
  expirySeconds: number;    // seconds from now (e.g. 300)
  expectedMultiplier: number; // basis-100 from multiplierEngine.ts
}

export function usePlaceBet() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [isApproving, setIsApproving] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  // Check current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, TAP_BET_MANAGER_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  const placeBet = useCallback(async (params: PlaceBetParams): Promise<`0x${string}` | null> => {
    if (!address) { setError('Wallet not connected'); return null; }
    if (!publicClient) { setError('Public client unavailable'); return null; }
    setError(null);

    const collateral = parseUnits(params.collateralUsdc.toString(), 6);
    const symbolBytes32 = keccak256(toBytes(params.symbolName));
    const expiry = BigInt(Math.floor(Date.now() / 1000) + params.expirySeconds);

    try {
      // 1. Approve if needed
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

      // 2. Place bet
      setIsPlacing(true);
      const tx = await writeContractAsync({
        address: TAP_BET_MANAGER_ADDRESS,
        abi: TAP_BET_MANAGER_ABI,
        functionName: 'placeBet',
        args: [
          symbolBytes32,
          params.targetPrice,
          params.entryPrice,
          collateral,
          expiry,
          BigInt(params.expectedMultiplier),
        ],
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
  }, [address, allowance, writeContractAsync, refetchAllowance]);

  return {
    placeBet,
    isApproving,
    isPlacing,
    isPending: isApproving || isPlacing,
    error,
  };
}
