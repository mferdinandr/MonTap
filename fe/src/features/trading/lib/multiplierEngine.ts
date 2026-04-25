// TypeScript mirror of MultiplierEngine.sol — identical band boundaries and table values

export const PRICE_BANDS = [
  { label: '0–0.5%',  minBps: 0,    maxBps: 50   },
  { label: '0.5–1%',  minBps: 51,   maxBps: 100  },
  { label: '1–2%',    minBps: 101,  maxBps: 200  },
  { label: '2–5%',    minBps: 201,  maxBps: 500  },
  { label: '5–10%',   minBps: 501,  maxBps: 1000 },
  { label: '>10%',    minBps: 1001, maxBps: Infinity },
] as const;

export const TIME_BUCKETS = [
  { label: '1m',  maxSeconds: 60   },
  { label: '5m',  maxSeconds: 300  },
  { label: '15m', maxSeconds: 900  },
  { label: '30m', maxSeconds: 1800 },
  { label: '1h',  maxSeconds: 3600 },
] as const;

// multiplierTable[priceBand][timeBucket] — basis 100 (800 = 8x)
export const MULTIPLIER_TABLE: number[][] = [
  // band 0: 0–0.5%
  [150, 120, 110, 105, 102],
  // band 1: 0.5–1%
  [600, 400, 250, 180, 130],
  // band 2: 1–2%
  [1500, 800, 500, 300, 200],
  // band 3: 2–5%
  [5000, 2500, 1200, 600, 350],
  // band 4: 5–10%
  [20000, 8000, 3000, 1500, 700],
  // band 5: >10%
  [50000, 20000, 8000, 3000, 1500],
];

export function getPriceBand(distanceBps: number): number {
  if (distanceBps <= 50)   return 0;
  if (distanceBps <= 100)  return 1;
  if (distanceBps <= 200)  return 2;
  if (distanceBps <= 500)  return 3;
  if (distanceBps <= 1000) return 4;
  return 5;
}

export function getTimeBucket(timeToExpiry: number): number {
  if (timeToExpiry <= 60)   return 0;
  if (timeToExpiry <= 300)  return 1;
  if (timeToExpiry <= 900)  return 2;
  if (timeToExpiry <= 1800) return 3;
  return 4;
}

export function getMultiplier(
  currentPrice: bigint,
  targetPrice: bigint,
  timeToExpiry: number,
): number {
  if (currentPrice === 0n) return 0;
  const diff = targetPrice >= currentPrice
    ? targetPrice - currentPrice
    : currentPrice - targetPrice;
  const distanceBps = Number((diff * 10000n) / currentPrice);
  const band = getPriceBand(distanceBps);
  const bucket = getTimeBucket(timeToExpiry);
  return MULTIPLIER_TABLE[band][bucket];
}

/** Returns the absolute target price for a given band (lower boundary midpoint) for display */
export function bandTargetPrice(currentPrice: bigint, bandIndex: number, direction: 'UP' | 'DOWN'): bigint {
  const band = PRICE_BANDS[bandIndex];
  const midBps = Math.round((band.minBps + Math.min(band.maxBps, band.minBps + 50)) / 2);
  const delta = (currentPrice * BigInt(midBps)) / 10000n;
  return direction === 'UP' ? currentPrice + delta : currentPrice - delta;
}
