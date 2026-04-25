'use client';

import { MarketProvider } from '@/features/trading/contexts/MarketContext';
import { TapToTradeProvider } from '@/features/trading/contexts/TapToTradeContext';
import TradePageContent from '@/features/trading/components/trade-content/TradePageContent';

export default function TradePage() {
  return (
    <MarketProvider>
      <TapToTradeProvider>
        <TradePageContent />
      </TapToTradeProvider>
    </MarketProvider>
  );
}
