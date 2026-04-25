import React from 'react';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { calculateMultiplier } from '@/components/charts/PerSecondChart/utils';
import { ALL_MARKETS } from '@/features/trading/constants/markets';

interface MobileOneTapOrderCardProps {
  order: any;
}

const MobileOneTapOrderCard = ({ order }: MobileOneTapOrderCardProps) => {
  const getLogoUrl = (symbol: string) => {
    const market = ALL_MARKETS.find((m) => m.symbol === symbol || m.binanceSymbol === symbol);
    return (
      market?.logoUrl ||
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png`
    );
  };

  // Parse bet amount
  let betAmount = 0;
  if (typeof order.betAmount === 'string') {
    const parsed = parseFloat(order.betAmount);
    betAmount = isNaN(parsed) ? 0 : parsed;
  } else if (typeof order.betAmount === 'number') {
    betAmount = order.betAmount;
  }

  // Parse prices for calculation
  const entryPriceNum = parseFloat(order.entryPrice) / 100000000;
  const targetPriceNum = parseFloat(order.targetPrice) / 100000000;

  // Recalculate multiplier
  const displayMultiplier = calculateMultiplier(
    entryPriceNum,
    targetPriceNum,
    order.entryTime,
    order.targetTime,
  );

  return (
    <div className="bg-[#131B26] p-4 rounded-lg border border-gray-800 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={getLogoUrl(order.symbol)}
            alt={order.symbol}
            className="w-8 h-8 rounded-full bg-slate-800"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
          <div>
            <span className="font-bold text-white text-base block">
              {formatMarketPair(order.symbol)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-blue-300">
            {(displayMultiplier / 100).toFixed(2)}x
          </div>
          <div className="text-xs text-yellow-500 font-medium">Active</div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-4 text-xs border-t border-gray-800 pt-3">
        <div className="flex justify-between">
          <span className="text-gray-500">Bet Amount</span>
          <span className="text-white font-medium">${betAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Target Time</span>
          <span className="text-white font-mono">
            {new Date(order.targetTime * 1000).toLocaleTimeString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Entry Price</span>
          <span className="text-white font-mono">${entryPriceNum.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Target Price</span>
          <span className="text-white font-mono">${targetPriceNum.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default MobileOneTapOrderCard;
