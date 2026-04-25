export type Direction = 'UP' | 'DOWN';
export type BetStatus = 'ACTIVE' | 'WON' | 'EXPIRED';

export interface ActiveBet {
  betId: bigint;
  user: string;
  symbol: string;       // hex-encoded bytes32 (keccak256 of symbol string)
  symbolName: string;   // e.g. "BTC"
  targetPrice: bigint;  // 8-decimal unsigned
  collateral: bigint;   // USDC 6-decimal
  multiplier: bigint;   // basis-100 (800 = 8x)
  direction: Direction;
  expiry: bigint;       // unix seconds
  placedAt: bigint;     // unix seconds
}

export interface PriceUpdate {
  symbol: string;       // e.g. "BTC"
  priceId: string;      // Pyth price feed ID (0x-prefixed)
  price: bigint;        // 8-decimal
  publishTime: number;  // unix seconds
}

// Pyth price feed configs
export interface AssetConfig {
  symbol: string;
  pythPriceId: string;
}

export const SUPPORTED_ASSETS: AssetConfig[] = [
  {
    symbol: 'BTC',
    pythPriceId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  },
  {
    symbol: 'ETH',
    pythPriceId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  },
  {
    symbol: 'MON',
    pythPriceId: process.env.PYTH_MON_PRICE_ID ?? '',
  },
];
