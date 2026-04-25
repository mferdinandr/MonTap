// Grid Trading Types

export interface GridConfig {
  // X-axis (Time) configuration
  timeMultiplier: number; // Multiplier untuk timeframe (e.g., 2 = 2x interval)
  
  // Y-axis (Price) configuration
  priceGridSize: number; // Size of each price grid in percentage or absolute value
  priceGridType: 'percentage' | 'absolute'; // Type of price grid
  
  // Grid display
  enabled: boolean;
  showLabels: boolean;
}

export interface GridCell {
  id: string;
  timeIndex: number; // Index dalam array candle
  priceLevel: number; // Price level dari grid cell
  timestamp: number; // Unix timestamp
  isAboveCurrentPrice: boolean; // true = limit sell, false = limit buy
}

export interface GridOrder {
  cellId: string;
  orderType: 'buy' | 'sell';
  price: number;
  amount: number;
  timestamp: number;
  status: 'pending' | 'filled' | 'cancelled';
}

export interface TapToTradeState {
  selectedCells: Set<string>;
  pendingOrders: GridOrder[];
  gridConfig: GridConfig;
}

// Default configuration
export const DEFAULT_GRID_CONFIG: GridConfig = {
  timeMultiplier: 1,
  priceGridSize: 0.5, // 0.5% per grid
  priceGridType: 'percentage',
  enabled: false,
  showLabels: true,
};
