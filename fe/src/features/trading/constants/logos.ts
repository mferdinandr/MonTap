import { ALL_MARKETS } from './markets';

export const MARKET_LOGOS = ALL_MARKETS.reduce((acc, market) => {
  if (market.logoUrl) {
    acc[market.symbol] = market.logoUrl;
  }
  return acc;
}, {} as Record<string, string>);
