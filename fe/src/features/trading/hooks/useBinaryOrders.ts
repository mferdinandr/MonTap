import { useState, useEffect, useCallback, useRef } from 'react';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export interface BinaryOrder {
  betId: string;
  symbol: string;
  direction: 'UP' | 'DOWN';
  betAmount: string | number;
  targetPrice: string;
  entryPrice: string;
  entryTime: number;
  targetTime: number;
  multiplier: number;
  status: 'ACTIVE' | 'WON' | 'EXPIRED' | 'LOST' | 'CANCELLED';
  trader?: string;
  settledAt?: number;
  settlePrice?: string;
  createdAt?: number;
}

function normalizeBet(bet: any): BinaryOrder {
  const targetPrice = parseFloat(bet.targetPrice) / 1e8;
  const entryPrice = parseFloat(bet.entryPrice ?? bet.targetPrice) / 1e8;
  const direction: 'UP' | 'DOWN' = bet.direction ?? (targetPrice >= entryPrice ? 'UP' : 'DOWN');
  return {
    ...bet,
    direction,
    status: bet.status ?? 'ACTIVE',
  };
}

export function useBinaryOrders(onWin?: (bet: BinaryOrder) => void) {
  const [orders, setOrders] = useState<BinaryOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { address } = useEmbeddedWallet();
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  const fetchOrders = useCallback(async () => {
    if (!address) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Primary: fast in-memory query (active bets only)
      const activeRes = await fetch(`${BACKEND_URL}/api/one-tap/active?trader=${address}`);
      const activeData = activeRes.ok ? await activeRes.json() : null;
      const activeBets: BinaryOrder[] = (activeData?.success && activeData.data)
        ? activeData.data.map(normalizeBet)
        : [];

      // Secondary: on-chain historical query for settled bets (won/expired)
      // Run in background — don't block active display
      let historicalBets: BinaryOrder[] = [];
      try {
        const histRes = await fetch(`${BACKEND_URL}/api/one-tap/bets?trader=${address}`);
        const histData = histRes.ok ? await histRes.json() : null;
        if (histData?.success && histData.data) {
          historicalBets = histData.data
            .map(normalizeBet)
            .filter((b: BinaryOrder) => b.status !== 'ACTIVE'); // active already covered above
        }
      } catch {
        // Historical query failing (slow RPC) is non-fatal
      }

      // Merge: active bets first, then history (dedup by betId)
      const seen = new Set<string>();
      const merged: BinaryOrder[] = [];
      for (const b of [...activeBets, ...historicalBets]) {
        if (!seen.has(b.betId)) {
          seen.add(b.betId);
          merged.push(b);
        }
      }

      // Detect newly won bets
      if (onWin) {
        for (const bet of merged) {
          const prev = prevStatusRef.current.get(bet.betId);
          if (bet.status === 'WON' && prev && prev !== 'WON') {
            onWin(bet);
          }
        }
      }
      // Update prev status map
      for (const bet of merged) {
        prevStatusRef.current.set(bet.betId, bet.status);
      }

      setOrders(merged);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  return { orders, isLoading, refetch: fetchOrders };
}
