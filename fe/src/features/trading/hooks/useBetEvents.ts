'use client';

import { useEffect, useCallback, useReducer } from 'react';
import { useWatchContractEvent, useReadContract, useAccount } from 'wagmi';
import { toast } from 'sonner';
import { TAP_BET_MANAGER_ADDRESS } from '@/config/contracts';
import type { ActiveBetCell } from '@/features/trading/components/TradingGrid';

// Minimal ABI — only events and reads we need
const TAP_BET_MANAGER_ABI = [
  {
    type: 'event',
    name: 'BetWon',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'payout', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BetExpired',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: true },
    ],
  },
  {
    type: 'function',
    name: 'getUserBets',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBet',
    inputs: [{ name: 'betId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'betId', type: 'uint256' },
          { name: 'user', type: 'address' },
          { name: 'symbol', type: 'bytes32' },
          { name: 'targetPrice', type: 'uint256' },
          { name: 'collateral', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'multiplier', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'direction', type: 'uint8' },
          { name: 'placedAt', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

type BetMap = Map<string, ActiveBetCell>;

type Action =
  | { type: 'set'; bets: ActiveBetCell[] }
  | { type: 'remove'; betId: string };

function betReducer(state: BetMap, action: Action): BetMap {
  const next = new Map(state);
  if (action.type === 'set') {
    // Rebuild map from fresh list
    next.clear();
    action.bets.forEach((b) => next.set(b.betId, b));
  } else {
    next.delete(action.betId);
  }
  return next;
}

export function useBetEvents(currentPriceBigInt: bigint) {
  const { address } = useAccount();
  const [activeBetMap, dispatch] = useReducer(betReducer, new Map<string, ActiveBetCell>());

  // Polling fallback: read user bets every 5s
  const { data: betIds, refetch } = useReadContract({
    address: TAP_BET_MANAGER_ADDRESS,
    abi: TAP_BET_MANAGER_ABI,
    functionName: 'getUserBets',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // Sync bets from on-chain list whenever betIds or price changes
  useEffect(() => {
    if (!betIds || currentPriceBigInt === 0n) return;
    // We can only map by price band if we have current price
    // For now store raw betIds; real mapping done per bet via getBet
    // This is a simplified version — full implementation would batch-read each bet
    // The cell mapping happens in WinDetector on solver side; here we just track IDs
    // Without calling getBet per ID we can't map to grid cells here;
    // the BetWon/BetExpired events handle removals. Start with empty until events fire.
    dispatch({ type: 'set', bets: [] });
  }, [betIds, currentPriceBigInt]);

  // Watch BetWon event
  useWatchContractEvent({
    address: TAP_BET_MANAGER_ADDRESS,
    abi: TAP_BET_MANAGER_ABI,
    eventName: 'BetWon',
    onLogs(logs) {
      logs.forEach((log: any) => {
        const betId = log.args?.betId?.toString();
        const payout = log.args?.payout;
        if (betId) {
          dispatch({ type: 'remove', betId });
          const usdcPayout = payout ? (Number(payout) / 1e6).toFixed(2) : '?';
          toast.success(`Bet #${betId} WON! +$${usdcPayout} USDC`);
        }
      });
      refetch();
    },
  });

  // Watch BetExpired event
  useWatchContractEvent({
    address: TAP_BET_MANAGER_ADDRESS,
    abi: TAP_BET_MANAGER_ABI,
    eventName: 'BetExpired',
    onLogs(logs) {
      logs.forEach((log: any) => {
        const betId = log.args?.betId?.toString();
        if (betId) {
          dispatch({ type: 'remove', betId });
          toast.error(`Bet #${betId} expired`);
        }
      });
      refetch();
    },
  });

  return {
    activeBets: Array.from(activeBetMap.values()),
    refetch,
  };
}
