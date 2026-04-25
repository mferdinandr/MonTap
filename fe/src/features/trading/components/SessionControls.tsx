'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';
import { useBinaryOrders, BinaryOrder } from '@/features/trading/hooks/useBinaryOrders';

const COLLATERAL_PRESETS = [1, 5, 10] as const;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// ── Mock whale addresses ────────────────────────────────────────────────────
const WHALE_NAMES = [
  '0x7f4a…c291', '0x3b1e…88fa', '0xd923…1a04', '0x05cc…7e3b',
  '0xa811…294d', '0x6fe2…b502', '0x1d3a…9c17', '0x8847…e631',
  '0x2c90…5f44', '0xf103…a9b8',
];

interface WhaleBet {
  id: string;
  trader: string;
  symbol: 'BTC' | 'ETH';
  direction: 'UP' | 'DOWN';
  amount: number;
  multiplier: number;
  targetTime: number;
  addedAt: number;
}

function randomWhale(now: number): WhaleBet {
  const symbol = Math.random() > 0.4 ? 'BTC' : 'ETH';
  const direction = Math.random() > 0.5 ? 'UP' : 'DOWN';
  const amounts = [500, 750, 1000, 1500, 2000, 2500, 5000];
  const multipliers = [150, 200, 300, 500, 800, 1000];
  const durations = [15, 20, 30, 45, 60];
  return {
    id: Math.random().toString(36).slice(2),
    trader: WHALE_NAMES[Math.floor(Math.random() * WHALE_NAMES.length)],
    symbol,
    direction,
    amount: amounts[Math.floor(Math.random() * amounts.length)],
    multiplier: multipliers[Math.floor(Math.random() * multipliers.length)],
    targetTime: now + durations[Math.floor(Math.random() * durations.length)],
    addedAt: now,
  };
}

function seedWhales(count: number): WhaleBet[] {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => ({
    ...randomWhale(now),
    targetTime: now + 10 + i * 7,
  }));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeLeft(targetTime: number): string {
  const secs = Math.max(0, targetTime - Math.floor(Date.now() / 1000));
  if (secs <= 0) return 'Settling…';
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatAgo(ts: number): string {
  const secs = Math.floor(Date.now() / 1000) - ts;
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function MultiplierBadge({ multiplier }: { multiplier: number }) {
  const mx = multiplier / 100;
  const color = mx < 2 ? 'text-orange-400' : mx < 5 ? 'text-yellow-400' : 'text-green-400';
  return <span className={`font-bold text-xs ${color}`}>{mx.toFixed(2)}x</span>;
}

function DirectionBadge({ direction }: { direction: 'UP' | 'DOWN' }) {
  return (
    <span
      className={`text-[10px] font-bold px-1 rounded ${
        direction === 'UP' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
      }`}
    >
      {direction === 'UP' ? '▲' : '▼'}
    </span>
  );
}

// ── Sub-sections ─────────────────────────────────────────────────────────────

function MyPositionRow({ bet }: { bet: BinaryOrder }) {
  const amount =
    typeof bet.betAmount === 'number'
      ? bet.betAmount.toFixed(2)
      : parseFloat(bet.betAmount as string).toFixed(2);

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 hover:bg-zinc-800/30">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <DirectionBadge direction={bet.direction} />
          <span className="text-xs text-slate-300">{bet.symbol}</span>
        </div>
        <span className="text-[10px] text-slate-500">${amount} USDC</span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <MultiplierBadge multiplier={bet.multiplier} />
        <span className="text-[10px] font-mono text-yellow-400">
          {formatTimeLeft(bet.targetTime)}
        </span>
      </div>
    </div>
  );
}

function HistoryRow({ bet }: { bet: BinaryOrder }) {
  const amount =
    typeof bet.betAmount === 'number'
      ? bet.betAmount.toFixed(2)
      : parseFloat(bet.betAmount as string).toFixed(2);
  const won = bet.status === 'WON';

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/40 hover:bg-zinc-800/20">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <DirectionBadge direction={bet.direction} />
          <span className="text-xs text-slate-400">{bet.symbol}</span>
          <span
            className={`text-[10px] font-semibold px-1 rounded ${
              won ? 'bg-green-900/40 text-green-400' : 'bg-zinc-700/60 text-slate-500'
            }`}
          >
            {won ? 'WON' : 'EXP'}
          </span>
        </div>
        <span className="text-[10px] text-slate-600">${amount} USDC</span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <MultiplierBadge multiplier={bet.multiplier} />
        <span className="text-[10px] text-slate-600">{formatAgo(bet.entryTime)}</span>
      </div>
    </div>
  );
}

function WhaleRow({ whale, isNew }: { whale: WhaleBet; isNew: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 border-b border-zinc-800/40 transition-all duration-700 ${
        isNew ? 'bg-violet-900/20' : 'hover:bg-zinc-800/20'
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <DirectionBadge direction={whale.direction} />
          <span className="text-xs text-slate-300">{whale.symbol}</span>
          <span className="text-[10px] text-slate-500 font-mono">{whale.trader}</span>
        </div>
        <span className="text-[10px] font-semibold text-amber-400">
          ${whale.amount.toLocaleString('en-US')} USDC
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <MultiplierBadge multiplier={whale.multiplier} />
        <span className="text-[10px] font-mono text-yellow-400">
          {formatTimeLeft(whale.targetTime)}
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SessionControls() {
  const { isActive, setIsActive, collateralPerTap, setCollateralPerTap } = useTapToTrade();
  const { orders: myOrders, isLoading } = useBinaryOrders();
  const [, tick] = useState(0);

  // Whale state
  const [whales, setWhales] = useState<WhaleBet[]>(() => seedWhales(5));
  const newWhaleIdsRef = useRef<Set<string>>(new Set());

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Whale feed — add a new whale bet every 4–9s, remove expired ones
  useEffect(() => {
    const schedule = () => {
      const delay = 4000 + Math.random() * 5000;
      return setTimeout(() => {
        const now = Math.floor(Date.now() / 1000);
        const newWhale = randomWhale(now);
        newWhaleIdsRef.current.add(newWhale.id);
        setWhales((prev) => {
          const alive = prev.filter((w) => w.targetTime > now);
          return [newWhale, ...alive].slice(0, 8);
        });
        // Remove "new" highlight after 2s
        setTimeout(() => {
          newWhaleIdsRef.current.delete(newWhale.id);
          tick((n) => n + 1);
        }, 2000);
        timerRef.current = schedule();
      }, delay);
    };
    const timerRef = { current: null as ReturnType<typeof setTimeout> | null };
    timerRef.current = schedule();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const myActiveBets = myOrders.filter((o) => o.status === 'ACTIVE');
  const myHistory = myOrders.filter((o) => o.status !== 'ACTIVE').slice(0, 10);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Collateral + Start/Stop */}
      <div className="flex flex-col gap-2 px-3 py-3 border-b border-border-muted shrink-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-500 mr-1">Collateral:</span>
          {COLLATERAL_PRESETS.map((amt) => (
            <button
              key={amt}
              onClick={() => setCollateralPerTap(amt)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                collateralPerTap === amt
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-slate-400 hover:text-white'
              }`}
            >
              ${amt}
            </button>
          ))}
          <input
            type="number"
            value={COLLATERAL_PRESETS.includes(collateralPerTap as any) ? '' : collateralPerTap}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v > 0) setCollateralPerTap(v);
            }}
            placeholder="Custom"
            className="w-14 px-2 py-1 rounded text-xs bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-violet-500"
            min="1"
          />
        </div>
        <button
          onClick={() => setIsActive(!isActive)}
          className={`w-full py-2 rounded font-semibold text-sm transition-all ${
            isActive
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-violet-600 hover:bg-violet-700 text-white'
          }`}
        >
          {isActive ? 'Stop Trading' : 'Start Trading'}
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex flex-col flex-1 overflow-y-auto min-h-0">

        {/* ── MY POSITIONS ── */}
        <div className="px-3 py-2 border-b border-border-muted shrink-0 sticky top-0 bg-[#0d0d14] z-10">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            My Positions
            {myActiveBets.length > 0 && (
              <span className="ml-1.5 bg-violet-600 text-white rounded-full px-1.5 py-0.5 text-[10px]">
                {myActiveBets.length}
              </span>
            )}
          </span>
        </div>

        {/* Active */}
        {isLoading ? (
          <p className="text-xs text-slate-500 px-3 py-3">Loading…</p>
        ) : myActiveBets.length === 0 ? (
          <p className="text-xs text-slate-600 px-3 py-3">No active positions</p>
        ) : (
          myActiveBets.map((bet) => <MyPositionRow key={bet.betId} bet={bet} />)
        )}

        {/* History */}
        {myHistory.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1 shrink-0">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">History</span>
            </div>
            {myHistory.map((bet) => <HistoryRow key={bet.betId} bet={bet} />)}
          </>
        )}

        {/* ── WHALE DETECTOR ── */}
        <div className="px-3 py-2 border-t border-b border-border-muted mt-2 shrink-0 sticky top-[33px] bg-[#0d0d14] z-10">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              🐋 Whale Detector
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          </div>
        </div>

        {whales.length === 0 ? (
          <p className="text-xs text-slate-600 px-3 py-3">No whale activity</p>
        ) : (
          whales.map((whale) => (
            <WhaleRow
              key={whale.id}
              whale={whale}
              isNew={newWhaleIdsRef.current.has(whale.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
