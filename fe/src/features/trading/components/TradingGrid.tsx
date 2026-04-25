'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  PRICE_BANDS,
  TIME_BUCKETS,
  MULTIPLIER_TABLE,
  bandTargetPrice,
} from '@/features/trading/lib/multiplierEngine';
import { usePlaceBet } from '@/features/trading/hooks/usePlaceBet';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';

export interface ActiveBetCell {
  betId: string;
  direction: 'UP' | 'DOWN';
  bandIndex: number;
  bucketIndex: number;
  expiry: number; // unix seconds
}

interface TradingGridProps {
  currentPrice: number; // USD price as float
  activeBets?: ActiveBetCell[];
}

function formatPrice(price: bigint): string {
  const usd = Number(price) / 1e8;
  return usd >= 1000
    ? '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatMultiplier(basisValue: number): string {
  return (basisValue / 100).toFixed(0) + 'x';
}

function cellKey(direction: 'UP' | 'DOWN', band: number, bucket: number) {
  return `${direction}-${band}-${bucket}`;
}

export default function TradingGrid({ currentPrice, activeBets = [] }: TradingGridProps) {
  const { isActive, asset, collateralPerTap } = useTapToTrade();
  const { placeBet, isPending } = usePlaceBet();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [placingCell, setPlacingCell] = useState<string | null>(null);

  // Tick every second for countdown timers
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const activeBetMap = new Map<string, ActiveBetCell>(
    activeBets.map((b) => [cellKey(b.direction, b.bandIndex, b.bucketIndex), b]),
  );

  const currentPriceBigInt = BigInt(Math.round(currentPrice * 1e8));

  const handleCellClick = useCallback(
    async (direction: 'UP' | 'DOWN', bandIndex: number, bucketIndex: number) => {
      if (!isActive || isPending || currentPrice === 0) return;
      const key = cellKey(direction, bandIndex, bucketIndex);
      setPlacingCell(key);

      const targetPrice = bandTargetPrice(currentPriceBigInt, bandIndex, direction);
      const expirySeconds = TIME_BUCKETS[bucketIndex].maxSeconds;
      const expectedMultiplier = MULTIPLIER_TABLE[bandIndex][bucketIndex];

      try {
        const tx = await placeBet({
          symbolName: asset,
          targetPrice,
          collateralUsdc: collateralPerTap,
          expirySeconds,
          expectedMultiplier,
        });
        if (tx) toast.success(`Bet placed! ${formatMultiplier(expectedMultiplier)} on ${asset}`);
      } catch (err: any) {
        toast.error(err?.message || 'Failed to place bet');
      } finally {
        setPlacingCell(null);
      }
    },
    [isActive, isPending, currentPrice, currentPriceBigInt, asset, collateralPerTap, placeBet],
  );

  const renderCell = (direction: 'UP' | 'DOWN', bandIndex: number, bucketIndex: number) => {
    const multiplier = MULTIPLIER_TABLE[bandIndex][bucketIndex];
    const targetPrice = currentPriceBigInt > 0n
      ? bandTargetPrice(currentPriceBigInt, bandIndex, direction)
      : 0n;
    const key = cellKey(direction, bandIndex, bucketIndex);
    const activeBet = activeBetMap.get(key);
    const isPlacing = placingCell === key;
    const countdown = activeBet ? Math.max(0, activeBet.expiry - now) : null;

    const isUp = direction === 'UP';
    const baseColor = isUp
      ? 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800/30'
      : 'bg-red-950/40 hover:bg-red-900/50 border-red-800/30';
    const activeColor = isUp
      ? 'border-emerald-400 shadow-emerald-400/20'
      : 'border-red-400 shadow-red-400/20';
    const multiplierColor = isUp ? 'text-emerald-300' : 'text-red-300';

    return (
      <button
        key={key}
        onClick={() => handleCellClick(direction, bandIndex, bucketIndex)}
        disabled={!isActive || isPending}
        className={`
          relative flex flex-col items-center justify-center p-2 rounded border text-center
          transition-all duration-150 cursor-pointer select-none
          ${baseColor}
          ${activeBet ? `${activeColor} shadow-md animate-pulse` : ''}
          ${!isActive ? 'opacity-40 cursor-not-allowed' : ''}
          ${isPlacing ? 'opacity-70 scale-95' : ''}
          min-h-[56px]
        `}
      >
        <span className={`text-base font-bold leading-tight ${multiplierColor}`}>
          {formatMultiplier(multiplier)}
        </span>
        {targetPrice > 0n && (
          <span className="text-[10px] text-slate-400 mt-0.5 leading-none">
            {formatPrice(targetPrice)}
          </span>
        )}
        {countdown !== null && (
          <span className="absolute top-0.5 right-1 text-[9px] font-mono text-yellow-300">
            {countdown}s
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="text-left px-2 py-1 text-slate-500 font-normal w-16">Band</th>
            {TIME_BUCKETS.map((t) => (
              <th key={t.label} className="text-center px-1 py-1 text-slate-400 font-semibold">
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* UP rows — band 5 (highest multiplier) at top, band 0 at bottom */}
          {[...PRICE_BANDS].reverse().map((band, reversedIdx) => {
            const bandIndex = PRICE_BANDS.length - 1 - reversedIdx;
            return (
              <tr key={`up-${bandIndex}`}>
                <td className="px-2 py-0.5 text-slate-500 text-[10px] whitespace-nowrap">
                  ▲ {band.label}
                </td>
                {TIME_BUCKETS.map((_, bucketIndex) => (
                  <td key={bucketIndex} className="px-1 py-0.5">
                    {renderCell('UP', bandIndex, bucketIndex)}
                  </td>
                ))}
              </tr>
            );
          })}

          {/* Current price separator */}
          <tr>
            <td colSpan={6} className="py-1 px-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-yellow-500/50" />
                <span className="text-yellow-400 font-mono font-bold text-sm whitespace-nowrap">
                  {currentPrice > 0
                    ? formatPrice(currentPriceBigInt)
                    : '—'}
                </span>
                <div className="flex-1 h-px bg-yellow-500/50" />
              </div>
            </td>
          </tr>

          {/* DOWN rows — band 0 at top, band 5 at bottom */}
          {PRICE_BANDS.map((band, bandIndex) => (
            <tr key={`down-${bandIndex}`}>
              <td className="px-2 py-0.5 text-slate-500 text-[10px] whitespace-nowrap">
                ▼ {band.label}
              </td>
              {TIME_BUCKETS.map((_, bucketIndex) => (
                <td key={bucketIndex} className="px-1 py-0.5">
                  {renderCell('DOWN', bandIndex, bucketIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {!isActive && (
        <p className="text-center text-slate-500 text-xs mt-2">
          Start Trading to place bets
        </p>
      )}
    </div>
  );
}
