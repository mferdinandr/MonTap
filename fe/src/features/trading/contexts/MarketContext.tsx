'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Market } from '@/features/trading/types';
import { ALL_MARKETS } from '@/features/trading/constants/markets';

interface SelectedPosition {
  positionId: bigint;
  symbol: string;
  entryPrice: number;
  isLong: boolean;
}

interface MarketContextType {
  activeMarket: Market;
  setActiveMarket: (market: Market) => void;
  currentPrice: string;
  setCurrentPrice: (price: string) => void;
  timeframe: string;
  setTimeframe: (timeframe: string) => void;
  selectedPosition: SelectedPosition | null;
  setSelectedPosition: (position: SelectedPosition | null) => void;
  chartPositions: boolean;
  setChartPositions: (show: boolean) => void;
}

const MarketContext = createContext<MarketContextType | undefined>(undefined);

export const MarketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeMarket, setActiveMarket] = useState<Market>(ALL_MARKETS[0]);
  const [currentPrice, setCurrentPrice] = useState<string>('0');
  const [timeframe, setTimeframe] = useState<string>('1'); // Default 1 minute
  const [selectedPosition, setSelectedPosition] = useState<SelectedPosition | null>(null);
  const [chartPositions, setChartPositions] = useState<boolean>(true);

  return (
    <MarketContext.Provider
      value={{
        activeMarket,
        setActiveMarket,
        currentPrice,
        setCurrentPrice,
        timeframe,
        setTimeframe,
        selectedPosition,
        setSelectedPosition,
        chartPositions,
        setChartPositions,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
};

export const useMarket = () => {
  const context = useContext(MarketContext);
  if (context === undefined) {
    throw new Error('useMarket must be used within a MarketProvider');
  }
  return context;
};
