'use client';

import { useState, useCallback } from 'react';
import PriceTicker from '@/components/layout/PriceTicker';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { useDynamicTitle } from '@/hooks/utils/useDynamicTitle';
import TradingChart from '@/features/trading/components/charts/TradingChart';
import SessionControls from '@/features/trading/components/SessionControls';
import { useMarketWebSocket, BetWonEvent } from '@/features/trading/hooks/useMarketWebSocket';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

export default function TradePageContent() {
  const { activeMarket, currentPrice } = useMarket();
  const { address } = useEmbeddedWallet();
  const [winPopup, setWinPopup] = useState<{ payout: number } | null>(null);

  const priceValue = currentPrice ? parseFloat(currentPrice) : null;
  const pairName = activeMarket?.symbol || 'BTC/USDT';
  useDynamicTitle(priceValue, pairName);

  const handleBetWon = useCallback(
    (event: BetWonEvent) => {
      if (!address) return;
      if (event.trader.toLowerCase() !== address.toLowerCase()) return;
      const payout = Number(BigInt(event.payout)) / 1e6; // USDC 6 decimals
      setWinPopup({ payout });
      setTimeout(() => setWinPopup(null), 3000);
    },
    [address],
  );

  const baseMarkets = activeMarket ? [activeMarket] : [];
  useMarketWebSocket(baseMarkets, handleBetWon);

  return (
    <main className="bg-trading-dark text-text-primary h-screen flex flex-col overflow-hidden">
      {/* Win popup */}
      {winPopup && (
        <div className="fixed left-1/7 top-1/3 z-[9999] flex items-start justify-center pointer-events-none transition ease-in-out delay-75">
          <div
            className="bg-green-500 border border-green-400 rounded-2xl px-10 py-6 text-center shadow-2xl"
            style={{ animation: 'popIn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards' }}
          >
            <div className="text-white/80 text-sm font-medium mb-1">YOU WON!</div>
            <div className="text-white text-4xl font-bold">+${winPopup.payout.toFixed(2)}</div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-row min-h-0">
        <div className="flex-1 min-w-0 overflow-hidden">
          <TradingChart />
        </div>
        <div className="w-72 shrink-0 flex flex-col border-l border-border-muted bg-[#0B1017] h-full overflow-hidden">
          <SessionControls />
        </div>
      </div>

      <PriceTicker />
    </main>
  );
}
