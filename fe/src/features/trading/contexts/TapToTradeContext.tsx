'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface TapToTradeContextType {
  isActive: boolean;
  setIsActive: (active: boolean) => void;

  asset: string;
  setAsset: (asset: string) => void;

  collateralPerTap: number;
  setCollateralPerTap: (amount: number) => void;
}

const TapToTradeContext = createContext<TapToTradeContextType | undefined>(undefined);

export const TapToTradeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [asset, setAsset] = useState('BTC');
  const [collateralPerTap, setCollateralPerTap] = useState(10);

  return (
    <TapToTradeContext.Provider
      value={{
        isActive,
        setIsActive,
        asset,
        setAsset,
        collateralPerTap,
        setCollateralPerTap,
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
