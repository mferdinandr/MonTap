import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { PricePoint } from '../types';
import { DEFAULT_GRID_X_SECONDS } from '../constants';

interface UseChartInteractionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  scrollOffset: number;
  verticalOffset: number;
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>;
  setVerticalOffset: React.Dispatch<React.SetStateAction<number>>;
  setIsFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  hoveredCell: string | null;
  isPlacingBet: boolean;
  isBinaryTradingEnabled?: boolean;
  isInteractionLocked?: boolean;
  multiTapEnabled?: boolean;
  resolveCellFromPoint?: (point: { x: number; y: number }) => string | null;
  onCellClick?: (
    targetPrice: number,
    targetTime: number,
    entryPrice: number,
    entryTime: number,
  ) => void;
  onCellPress?: (x: number, y: number) => void;
  priceHistory: PricePoint[];
  currentPrice: number;
  gridIntervalSeconds?: number;
  gridYDollars: number; // Required for calculation
}

export const useChartInteraction = ({
  canvasRef,
  scrollOffset,
  verticalOffset,
  setScrollOffset,
  setVerticalOffset,
  setIsFocusMode,
  hoveredCell,
  isPlacingBet,
  isBinaryTradingEnabled = true,
  isInteractionLocked = false,
  multiTapEnabled = false,
  resolveCellFromPoint,
  onCellClick,
  onCellPress,
  priceHistory,
  currentPrice,
  gridIntervalSeconds = DEFAULT_GRID_X_SECONDS,
  gridYDollars,
}: UseChartInteractionProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartScrollOffset, setDragStartScrollOffset] = useState(0);
  const [dragStartVerticalOffset, setDragStartVerticalOffset] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const multiTapVisitedRef = useRef<Set<string>>(new Set());

  const GRID_X_SECONDS = gridIntervalSeconds;

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return null;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      return { x: mouseX, y: mouseY };
    },
    [canvasRef],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const point = getCanvasPoint(e);
      if (point) setMousePos(point);
      setIsDragging(true);
      setHasMoved(false);
      setDragStartX(e.clientX);
      setDragStartY(e.clientY);
      setDragStartScrollOffset(scrollOffset);
      setDragStartVerticalOffset(verticalOffset);
      multiTapVisitedRef.current = new Set();

      // Multi-tap: immediately bet + highlight the cell under the initial click
      if (multiTapEnabled && isBinaryTradingEnabled && point && resolveCellFromPoint && onCellClick) {
        const cell = resolveCellFromPoint(point);
        if (cell) {
          multiTapVisitedRef.current.add(cell);
          setSelectedCells((prev) => new Set(prev).add(cell));

          const [timestampStr, priceLevelStr] = cell.split('_');
          const gridStartTime = parseInt(timestampStr);
          const gridBottomPrice = parseFloat(priceLevelStr);
          const targetTime = gridStartTime + GRID_X_SECONDS;
          const targetPrice = gridBottomPrice + gridYDollars / 2;
          onCellClick(targetPrice, targetTime, 0, gridStartTime);
        }
      }
    },
    [getCanvasPoint, scrollOffset, verticalOffset, multiTapEnabled, isBinaryTradingEnabled, resolveCellFromPoint, onCellClick, GRID_X_SECONDS, gridYDollars],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(e);
      if (point) setMousePos(point);

      if (isDragging) {
        e.preventDefault();

        // Multi-tap mode: trigger bet on each new cell entered during drag
        if (multiTapEnabled && isBinaryTradingEnabled && point && resolveCellFromPoint && onCellClick) {
          const cell = resolveCellFromPoint(point);
          if (cell && !multiTapVisitedRef.current.has(cell)) {
            multiTapVisitedRef.current.add(cell);
            setHasMoved(true);

            // Highlight cell immediately (purple selected color)
            setSelectedCells((prev) => new Set(prev).add(cell));

            const [timestampStr, priceLevelStr] = cell.split('_');
            const gridStartTime = parseInt(timestampStr);
            const gridBottomPrice = parseFloat(priceLevelStr);
            const targetTime = gridStartTime + GRID_X_SECONDS;
            const targetPrice = gridBottomPrice + gridYDollars / 2;
            const entryPrice =
              priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : currentPrice;
            onCellClick(targetPrice, targetTime, entryPrice, gridStartTime);
          }
          return; // don't scroll in multi-tap mode
        }

        const deltaX = dragStartX - e.clientX;
        const deltaY = dragStartY - e.clientY;

        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          setHasMoved(true);
          if (!isInteractionLocked) {
            setIsFocusMode(false);
            setScrollOffset(dragStartScrollOffset + deltaX);
            setVerticalOffset(dragStartVerticalOffset - deltaY);
          }
        }
      }
    },
    [
      isDragging,
      multiTapEnabled,
      isBinaryTradingEnabled,
      resolveCellFromPoint,
      onCellClick,
      dragStartX,
      dragStartY,
      dragStartScrollOffset,
      dragStartVerticalOffset,
      setIsFocusMode,
      isInteractionLocked,
      getCanvasPoint,
      priceHistory,
      currentPrice,
      GRID_X_SECONDS,
      gridYDollars,
    ],
  );

  const handleMouseUp = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);
    if (point) setMousePos(point);
    const resolvedCell =
      point && resolveCellFromPoint ? resolveCellFromPoint(point) : hoveredCell;

    if (isDragging && !hasMoved && resolvedCell && onCellClick) {
      if (!isBinaryTradingEnabled) {
        toast.error('Press Start Trading to place bets');
        setIsDragging(false);
        setIsFocusMode(true);
        return;
      }
      if (isPlacingBet) {
        toast.error('Please wait, placing bet...');
        setIsDragging(false);
        return;
      }

      if (point && onCellPress) onCellPress(point.x, point.y);

        // Cell interaction logic
        const [timestampStr, priceLevelStr] = resolvedCell.split('_');
        const gridStartTime = parseInt(timestampStr);
        const gridBottomPrice = parseFloat(priceLevelStr);

        // Use END time of grid cell as targetTime
        const targetTime = gridStartTime + GRID_X_SECONDS;

        // Use CENTER of grid cell as target price
        const targetPrice = gridBottomPrice + gridYDollars / 2;

        // Get current price from latest price history
        const entryPrice =
          priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : currentPrice;

        // Use grid START time as entry time
        const entryTime = gridStartTime;

        // Toggle cell selection
        setSelectedCells((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(resolvedCell)) {
            newSet.delete(resolvedCell);
          } else {
            newSet.add(resolvedCell);
          }
          return newSet;
        });

      onCellClick(targetPrice, targetTime, entryPrice, entryTime);
    }

      // Enforce "Always Stick": Re-enable focus mode immediately after interaction ends
      // This ensures the user has to "hold" to drag/view elsewhere, but it snaps back on release.
      setIsDragging(false);
      setIsFocusMode(true);
    },
    [
      isDragging,
      hasMoved,
      hoveredCell,
      isPlacingBet,
      isBinaryTradingEnabled,
      priceHistory,
      currentPrice,
      onCellClick,
      onCellPress,
      GRID_X_SECONDS,
      gridYDollars,
      setIsFocusMode,
      getCanvasPoint,
      resolveCellFromPoint,
    ],
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInteractionLocked) return;
      const scrollStep = 50;

      switch (e.key.toLowerCase()) {
        case 'arrowleft':
          e.preventDefault();
          setIsFocusMode(false);
          setScrollOffset((prev) => prev - scrollStep);
          break;
        case 'arrowright':
          e.preventDefault();
          setIsFocusMode(false);
          setScrollOffset((prev) => prev + scrollStep);
          break;
        case 'arrowup':
          e.preventDefault();
          setIsFocusMode(false);
          setVerticalOffset((prev) => prev + scrollStep);
          break;
        case 'arrowdown':
          e.preventDefault();
          setIsFocusMode(false);
          setVerticalOffset((prev) => prev - scrollStep);
          break;
        case 'c':
          e.preventDefault();
          setIsFocusMode((prev) => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setIsFocusMode, setScrollOffset, setVerticalOffset, isInteractionLocked]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    mousePos,
    isDragging,
    hasMoved,
    selectedCells,
    setSelectedCells,
  };
};
