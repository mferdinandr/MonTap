import { Market } from '@/features/trading/types';

const CATEGORY_ORDER: Market['category'][] = [
  'crypto',
  'forex',
  'indices',
  'commodities',
  'stocks',
];

const FOREX_BASES = ['EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const STOCK_LIKE = ['AAPL', 'GOOGL', 'TSLA', 'NVDA', 'MSFT', 'AMZN'];
const INDEX_LIKE = ['SPY', 'QQQ', 'DXY'];
const COMMODITY_LIKE = ['XAU', 'XAG', 'WTI', 'BRENT'];

export function formatMarketPair(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('USD') && upper.length > 3) {
    const base = symbol.slice(0, -3);
    return `${base}/USD`;
  }
  return `${symbol}/USD`;
}

export function inferMarketCategory(symbol: string): Market['category'] {
  const upper = symbol.toUpperCase();
  const base = upper.endsWith('USD') ? upper.slice(0, -3) : upper;

  if (FOREX_BASES.includes(base) && upper.endsWith('USD')) return 'forex';
  if (COMMODITY_LIKE.includes(base)) return 'commodities';
  if (INDEX_LIKE.includes(base)) return 'indices';
  if (STOCK_LIKE.includes(base)) return 'stocks';

  // Default: treat unknown as stocks if it looks like equity ticker, otherwise crypto
  if (upper.endsWith('USD') && base.length <= 5) return 'stocks';
  return 'crypto';
}

export function inferTradingViewSymbol(symbol: string, category: Market['category']): string {
  const upper = symbol.toUpperCase();
  const base = upper.endsWith('USD') ? upper.slice(0, -3) : upper;

  // Explicit mappings
  const explicit: Record<string, string> = {
    EURUSD: 'OANDA:EURUSD',
    GBPUSD: 'OANDA:GBPUSD',
    XAUUSD: 'OANDA:XAUUSD',
    XAGUSD: 'OANDA:XAGUSD',
    QQQUSD: 'NASDAQ:QQQ',
    SPYUSD: 'AMEX:SPY',
    AAPLUSD: 'NASDAQ:AAPL',
    GOOGLUSD: 'NASDAQ:GOOGL',
    NVDAUSD: 'NASDAQ:NVDA',
    TSLAUSD: 'NASDAQ:TSLA',
  };
  if (explicit[upper]) return explicit[upper];

  if (category === 'forex') return `OANDA:${upper}`;
  if (category === 'commodities') return `OANDA:${upper}`;
  if (category === 'indices') return `AMEX:${base}`;
  if (category === 'stocks') return `NASDAQ:${base}`;

  // Crypto fallback
  return `BINANCE:${base}USDT`;
}

export function mergeMarketsWithOracle(
  baseMarkets: Market[],
  oracleSymbols: string[],
): Market[] {
  const map = new Map<string, Market>();
  baseMarkets.forEach((m) => map.set(m.symbol.toUpperCase(), m));

  oracleSymbols.forEach((rawSymbol) => {
    const symbol = rawSymbol.toUpperCase();
    if (map.has(symbol)) return;

    const category = inferMarketCategory(symbol);
    map.set(symbol, {
      symbol,
      category,
      tradingViewSymbol: inferTradingViewSymbol(symbol, category),
      maxLeverage: 100,
    });
  });

  const markets = Array.from(map.values());
  markets.sort((a, b) => {
    const catOrder = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (catOrder !== 0) return catOrder;
    return a.symbol.localeCompare(b.symbol);
  });
  return markets;
}

export function formatDynamicUsd(value: number): string {
  if (!Number.isFinite(value)) return '$--';
  const intPart = Math.floor(Math.abs(value));
  const digits = intPart >= 10 ? 2 : 5;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
