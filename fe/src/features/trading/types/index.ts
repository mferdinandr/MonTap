export interface Market {
  symbol: string;
  tradingViewSymbol: string;
  logoUrl?: string;
  binanceSymbol?: string;
  category: 'crypto' | 'forex' | 'indices' | 'commodities' | 'stocks';
  maxLeverage?: number;
}

export interface MarketData {
  price?: string;
  priceChange?: string;
  priceChangePercent?: string;
  high24h?: string;
  low24h?: string;
  volume24h?: string;
}

export interface FuturesData {
  fundingRate: string;
  nextFundingTime: number;
  openInterest?: string;
  openInterestValue: string;
}

export interface OraclePrice {
  price: number;
}

export interface Bet {
  betId: string;
  symbol: string;
  targetPrice: string;
  targetTime: number;
  entryPrice: string;
  entryTime: number;
  direction: 'UP' | 'DOWN';
  collateral: number;
  multiplier: number;
  status: 'ACTIVE' | 'WON' | 'EXPIRED';
}
