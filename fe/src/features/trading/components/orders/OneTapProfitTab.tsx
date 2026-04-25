import { useBinaryOrders } from '@/features/trading/hooks/useBinaryOrders';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { calculateMultiplier } from '@/components/charts/PerSecondChart/utils';
import { ALL_MARKETS } from '@/features/trading/constants/markets';
import MobileOneTapOrderCard from './MobileOneTapOrderCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function OneTapProfitTab() {
  const { orders, isLoading } = useBinaryOrders();

  // Filter for ACTIVE orders only
  const activeOrders = orders.filter((o) => o.status === 'ACTIVE');

  // Helper to get logo URL
  const getLogoUrl = (symbol: string) => {
    const market = ALL_MARKETS.find((m) => m.symbol === symbol || m.binanceSymbol === symbol);
    return (
      market?.logoUrl ||
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png`
    );
  };

  if (isLoading && orders.length === 0) {
    return <div className="text-center py-16 text-gray-500">Loading active bets...</div>;
  }

  if (activeOrders.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        No active bets. Place a One Tap Profit bet to see it here.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Desktop View: Table */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader className="bg-[#0B1017] sticky top-0 z-10">
            <TableRow className="border-b border-gray-800 hover:bg-transparent">
              <TableHead className="font-medium">MARKET</TableHead>
              <TableHead className="text-right font-medium">BET AMOUNT</TableHead>
              <TableHead className="text-right font-medium">MULTIPLIER</TableHead>
              <TableHead className="text-right font-medium">STATUS</TableHead>
              <TableHead className="text-right font-medium">EXPIRES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeOrders.map((order) => {
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
                <TableRow
                  key={order.betId}
                  className="hover:bg-gray-800/30 transition-colors border-gray-800/50"
                >
                  {/* Market */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={getLogoUrl(order.symbol)}
                        alt={order.symbol}
                        className="w-5 h-5 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';
                        }}
                      />
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">
                          {formatMarketPair(order.symbol)}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  {/* Bet Amount */}
                  <TableCell className="text-right">
                    <span className="text-white font-medium">
                      ${betAmount > 0 ? betAmount.toFixed(2) : '0.00'}
                    </span>
                  </TableCell>

                  {/* Multiplier */}
                  <TableCell className="text-right">
                    <span className="text-blue-300 font-bold">
                      {(displayMultiplier / 100).toFixed(2)}x
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell className="text-right">
                    <span className="font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded text-xs">
                      {order.status}
                    </span>
                  </TableCell>

                  {/* Time */}
                  <TableCell className="text-right">
                    <span className="text-yellow-400 text-xs font-mono">
                      {new Date(order.targetTime * 1000).toLocaleTimeString()}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile View: Cards */}
      <div className="md:hidden space-y-4 p-4 overflow-y-auto flex-1">
        {activeOrders.map((order) => (
          <MobileOneTapOrderCard key={`onetap-card-${order.betId}`} order={order} />
        ))}
      </div>
    </div>
  );
}
