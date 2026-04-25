'use client';

import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PerSecondChartProps } from './types';
import { DEFAULT_GRID_X_SECONDS, DEFAULT_GRID_Y_PERCENT } from './constants';
import { calculateMultiplier } from './utils';
import { Bet } from '../../../features/trading/types';

// Hooks
import { useChartDimensions } from './hooks/useChartDimensions';
import { usePriceHistory } from './hooks/usePriceHistory';
import { useChartFocus } from './hooks/useChartFocus';
import { useChartInteraction } from './hooks/useChartInteraction';

const PerSecondChart: React.FC<PerSecondChartProps> = ({
  symbol,
  currentPrice,
  betAmount = '10',
  isBinaryTradingEnabled = false,
  tradeMode = 'one-tap-profit',
  onCellClick,
  isPlacingBet = false,
  multiTapEnabled = false,
  activeBets = [],
  logoUrl,
  gridIntervalSeconds = DEFAULT_GRID_X_SECONDS,
  gridPriceStep,
  gridAnchorPrice,
  gridAnchorTime,
  yAxisSide = 'right',
  showXAxis = true,
  showYAxis = true,
  positionMarkers = [],
  pendingMarkers = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resolveCellFromPointRef = useRef<((point: { x: number; y: number }) => string | null) | null>(
    null,
  );
  const clickAnimationsRef = useRef<Array<{
    xLeft: number; yTop: number; w: number; h: number; startMs: number;
  }>>([]);
  const cellBoundsMapRef = useRef<Map<string, { xLeft: number; yTop: number; w: number; h: number }>>(new Map());

  // State lifted from hooks for shared access
  const [scrollOffset, setScrollOffset] = useState(0);
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(true);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [displayBets, setDisplayBets] = useState<Bet[]>([]);
  const betCacheRef = useRef<Map<string, { bet: Bet; lastSeen: number }>>(new Map());
  const [hoveredCellInfo, setHoveredCellInfo] = useState<{
    targetPrice: number;
    targetCenterPrice?: number;
    targetTime: number;
    multiplier: number;
  } | null>(null);

  // 1. Dimensions
  const dimensions = useChartDimensions(canvasRef);

  // 2. Data & History
  const { priceHistory, interpolatedHistory } = usePriceHistory(symbol, currentPrice);

  // 3. Initial Price (Anchor)
  const initialPriceRef = useRef<number>(0);
  const [initialPrice, setInitialPrice] = useState<number>(0);

  useEffect(() => {
    if (currentPrice > 0 && initialPriceRef.current === 0) {
      initialPriceRef.current = currentPrice;
      setInitialPrice(currentPrice);
    }
  }, [currentPrice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  // Derived constants
  // ensure we never have 0 grid step (avoids division by zero in drawing)
  const basePrice = initialPrice > 0 ? initialPrice : currentPrice > 0 ? currentPrice : 1000; // Fallback to 1000 if no price
  const GRID_Y_DOLLARS = gridPriceStep || basePrice * DEFAULT_GRID_Y_PERCENT;

  // 4. Focus & Auto-scroll
  const { blinkState } = useChartFocus({
    isFocusMode,
    interpolatedHistory,
    dimensions,
    gridIntervalSeconds,
    initialPrice,
    currentPrice,
    gridYDollars: GRID_Y_DOLLARS,
    setScrollOffset,
    setVerticalOffset,
  });

  const isInteractionLocked = tradeMode === 'one-tap-profit';
  const suppressHoverPreview = isInteractionLocked && isCoarsePointer;

  // 5. Interaction (Mouse/Keyboard)
  const {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    mousePos,
    isDragging,
    selectedCells,
    setSelectedCells,
  } = useChartInteraction({
    canvasRef,
    scrollOffset,
    verticalOffset,
    setScrollOffset,
    setVerticalOffset,
    setIsFocusMode,
    hoveredCell,
    isPlacingBet,
    isBinaryTradingEnabled,
    isInteractionLocked,
    multiTapEnabled,
    resolveCellFromPoint: (point) => resolveCellFromPointRef.current?.(point) ?? null,
    onCellClick,
    onCellPress: (_x, _y) => {
      const bounds = hoveredCell ? cellBoundsMapRef.current.get(hoveredCell) : null;
      if (bounds) {
        clickAnimationsRef.current.push({ ...bounds, startMs: Date.now() });
      }
    },
    priceHistory,
    currentPrice,
    gridIntervalSeconds,
    gridYDollars: GRID_Y_DOLLARS,
  });

  const isGridInteractive = tradeMode !== 'quick-tap' && Boolean(onCellClick);

  useEffect(() => {
    const cache = betCacheRef.current;
    cache.clear();
    setDisplayBets([]);
  }, [symbol]);

  useEffect(() => {
    const nowSeconds = Date.now() / 1000;
    const retentionSeconds =
      tradeMode === 'one-tap-profit' ? 3600 : Math.max(60, gridIntervalSeconds * 30);
    const cache = betCacheRef.current;

    activeBets
      .filter((bet) => bet.symbol === symbol)
      .forEach((bet) => {
        cache.set(bet.betId, { bet, lastSeen: nowSeconds });
      });

    cache.forEach((value, key) => {
      if (nowSeconds - value.lastSeen > retentionSeconds) {
        cache.delete(key);
      }
    });

    setDisplayBets(Array.from(cache.values()).map((value) => value.bet));
  }, [activeBets, gridIntervalSeconds, symbol, tradeMode]);

  useEffect(() => {
    if (isInteractionLocked) {
      setScrollOffset(0);
      setVerticalOffset(0);
      setIsFocusMode(true);
    }
  }, [isInteractionLocked]);

  useEffect(() => {
    if (tradeMode === 'quick-tap') {
      setHoveredCell(null);
      setHoveredCellInfo(null);
      setSelectedCells(new Set());
    }
  }, [tradeMode, setSelectedCells]);

  // 6. Drawing Logic (View)
  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0 || interpolatedHistory.length === 0) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Define margins
    const Y_AXIS_WIDTH = 80;
    const X_AXIS_HEIGHT = 30;

    const leftMargin = showYAxis && yAxisSide === 'left' ? Y_AXIS_WIDTH : 0;
    const rightMargin = showYAxis && yAxisSide === 'right' ? Y_AXIS_WIDTH : 0;
    const bottomMargin = showXAxis ? X_AXIS_HEIGHT : 0;

    const chartWidth = canvas.width - leftMargin - rightMargin;
    const chartHeight = canvas.height - bottomMargin;

    // Draw background for margins
    ctx.fillStyle = '#000000';
    if (leftMargin > 0) ctx.fillRect(0, 0, leftMargin, canvas.height);
    if (rightMargin > 0) ctx.fillRect(leftMargin + chartWidth, 0, rightMargin, canvas.height);
    if (bottomMargin > 0) ctx.fillRect(0, chartHeight, canvas.width, bottomMargin);

    // Calculate grid square size
    const targetVerticalGrids = 11;
    const gridSizePixels = chartHeight / targetVerticalGrids;
    const pixelsPerDollar = gridSizePixels / GRID_Y_DOLLARS;
    const priceRangeToShow = chartHeight / pixelsPerDollar;

    const priceAnchor = initialPrice > 0 ? initialPrice : currentPrice;
    const baseDisplayMinPrice = priceAnchor - priceRangeToShow / 2;
    const baseDisplayMaxPrice = priceAnchor + priceRangeToShow / 2;

    const verticalPriceShift = verticalOffset / pixelsPerDollar;
    const displayMinPrice = baseDisplayMinPrice + verticalPriceShift;
    const displayMaxPrice = baseDisplayMaxPrice + verticalPriceShift;

    const gridWidthPixels = gridSizePixels;
    const pixelsPerSecond = gridWidthPixels / gridIntervalSeconds;

    // Helpers
    const priceToY = (price: number): number => {
      return (
        chartHeight -
        ((price - displayMinPrice) / (displayMaxPrice - displayMinPrice)) * chartHeight
      );
    };

    const nowX = chartWidth * 0.2;

    const timeToX = (timestamp: number): number => {
      const now = Date.now();
      const secondsFromNow = (timestamp - now) / 1000;
      return leftMargin + nowX + secondsFromNow * pixelsPerSecond - scrollOffset;
    };

    // --- Draw Grid ---
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);

    const largeBufferGrids = 50;
    const priceDecimals =
      GRID_Y_DOLLARS < 0.0001 ? 6 : GRID_Y_DOLLARS < 0.01 ? 4 : GRID_Y_DOLLARS < 1 ? 2 : 1;
    const anchorPrice = gridAnchorPrice ?? 0;
    const lowestPriceIndex = Math.floor(
      (displayMinPrice - largeBufferGrids * GRID_Y_DOLLARS - anchorPrice) / GRID_Y_DOLLARS,
    );
    const highestPriceIndex = Math.ceil(
      (displayMaxPrice + largeBufferGrids * GRID_Y_DOLLARS - anchorPrice) / GRID_Y_DOLLARS,
    );

    const activeBetMap = new Map<string, Bet>();
    displayBets.forEach((bet) => {
      const targetPrice = parseFloat(bet.targetPrice);
      if (!Number.isFinite(targetPrice)) return;
      const baseLevel = targetPrice - GRID_Y_DOLLARS / 2;
      const entryTime =
        bet.entryTime > 1000000000000 ? Math.floor(bet.entryTime / 1000) : bet.entryTime;
      const priceIndex = Math.round((baseLevel - anchorPrice) / GRID_Y_DOLLARS);
      const priceKey = (anchorPrice + priceIndex * GRID_Y_DOLLARS).toFixed(priceDecimals);
      const cellKey = `${entryTime}_${priceKey}`;
      activeBetMap.set(cellKey, bet);
    });

    for (let priceIndex = lowestPriceIndex; priceIndex <= highestPriceIndex; priceIndex += 1) {
      const price = parseFloat((anchorPrice + priceIndex * GRID_Y_DOLLARS).toFixed(priceDecimals));
      const y = priceToY(price);
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(leftMargin + chartWidth, y);
      ctx.stroke();

      if (showYAxis) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px monospace';

        // Prevent label overlap with the top-right header if on right side
        if (yAxisSide === 'right' && y < 100) {
          // Skip
        } else {
          const xLabel = yAxisSide === 'left' ? 5 : leftMargin + chartWidth + 5;
          ctx.fillText(`$${price.toFixed(priceDecimals)}`, xLabel, y + 4);
        }
      }
    }
    ctx.setLineDash([]);

    // --- Draw Vertical Grid (Time) ---
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);

    const now = Date.now();
    const visibleTimeRangeSeconds = chartWidth / pixelsPerSecond + 60;
    const lowestTimeLevel = now - (visibleTimeRangeSeconds * 1000) / 2;
    const highestTimeLevel = now + visibleTimeRangeSeconds * 1000;

    let lowestTimeRounded: number;
    if (gridAnchorTime !== undefined) {
      const anchorMs = gridAnchorTime * 1000;
      const stepMs = gridIntervalSeconds * 1000;
      lowestTimeRounded = Math.floor((lowestTimeLevel - anchorMs) / stepMs) * stepMs + anchorMs;
    } else {
      lowestTimeRounded =
        Math.floor(lowestTimeLevel / (gridIntervalSeconds * 1000)) * (gridIntervalSeconds * 1000);
    }

    const highestTimeRounded =
      lowestTimeRounded +
      Math.ceil((highestTimeLevel - lowestTimeRounded) / (gridIntervalSeconds * 1000)) *
        (gridIntervalSeconds * 1000);

    resolveCellFromPointRef.current = (point) => {
      if (
        point.x < leftMargin ||
        point.x > leftMargin + chartWidth ||
        point.y < 0 ||
        point.y > chartHeight
      ) {
        return null;
      }

      const nowMs = Date.now();
      const secondsFromNow = (point.x + scrollOffset - leftMargin - nowX) / pixelsPerSecond;
      const timeAtPointMs = nowMs + secondsFromNow * 1000;
      const stepMs = gridIntervalSeconds * 1000;
      const anchorMs = gridAnchorTime !== undefined ? gridAnchorTime * 1000 : undefined;
      const gridStartTimeMs =
        anchorMs !== undefined
          ? Math.floor((timeAtPointMs - anchorMs) / stepMs) * stepMs + anchorMs
          : Math.floor(timeAtPointMs / stepMs) * stepMs;
      const gridEntryTime = Math.floor(gridStartTimeMs / 1000);

      const priceAtPoint =
        displayMinPrice +
        ((chartHeight - point.y) / chartHeight) * (displayMaxPrice - displayMinPrice);
      const priceIndex = Math.floor((priceAtPoint - anchorPrice) / GRID_Y_DOLLARS);
      const priceLevel = parseFloat((anchorPrice + priceIndex * GRID_Y_DOLLARS).toFixed(priceDecimals));

      const nowSeconds = Date.now() / 1000;
      const currentGridStart =
        Math.floor(nowSeconds / gridIntervalSeconds) * gridIntervalSeconds;
      const minSelectableGridStart = currentGridStart + gridIntervalSeconds * 2;
      if (gridEntryTime < minSelectableGridStart) return null;

      return `${gridEntryTime}_${priceLevel.toFixed(priceDecimals)}`;
    };

    for (
      let timestamp = lowestTimeRounded;
      timestamp <= highestTimeRounded;
      timestamp += gridIntervalSeconds * 1000
    ) {
      const x = timeToX(timestamp);

      if (x >= leftMargin - 10 && x <= leftMargin + chartWidth + 10) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, chartHeight);
        ctx.stroke();

        if (showXAxis) {
          const nowMs =
            interpolatedHistory.length > 0
              ? interpolatedHistory[interpolatedHistory.length - 1].time
              : Date.now();
          const offsetSeconds = Math.round((timestamp - nowMs) / 1000);
          const timeLabel =
            offsetSeconds > 0
              ? `+${offsetSeconds}s`
              : offsetSeconds < 0
              ? `${offsetSeconds}s`
              : '0s';

          ctx.fillStyle = '#94a3b8';
          ctx.font = '9px monospace';
          const textWidth = ctx.measureText(timeLabel).width;

          if (x - textWidth / 2 >= leftMargin && x + textWidth / 2 <= leftMargin + chartWidth) {
            ctx.fillText(timeLabel, x - textWidth / 2, chartHeight + 18);
          }
        }
      }
    }
    ctx.setLineDash([]);

    // --- Draw Unplayable Area Overlay ---
    const nowTs = Date.now() / 1000;
    const currentGridStartTs = Math.floor(nowTs / gridIntervalSeconds) * gridIntervalSeconds;
    // const minSelectableGridStartTs = currentGridStartTs + gridIntervalSeconds * 1.5; // (Old ref)

    let headX = leftMargin + nowX;
    if (interpolatedHistory.length > 0) {
      const latestPoint = interpolatedHistory[interpolatedHistory.length - 1];
      headX = timeToX(latestPoint.time);
    }

    if (headX > leftMargin) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(leftMargin, 0, headX - leftMargin, chartHeight);

      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(headX, 0);
      ctx.lineTo(headX, chartHeight);
      ctx.stroke();
    }

    // --- Draw Cells (Interaction) ---
    let currentHoveredCellId: string | null = null;
    const nowSeconds = Date.now() / 1000;

    for (let priceIndex = lowestPriceIndex; priceIndex <= highestPriceIndex; priceIndex += 1) {
      const priceLevel = parseFloat(
        (anchorPrice + priceIndex * GRID_Y_DOLLARS).toFixed(priceDecimals),
      );
      const yTop = priceToY(priceLevel + GRID_Y_DOLLARS);
      const yBottom = priceToY(priceLevel);

      for (
        let timestamp = lowestTimeRounded;
        timestamp <= highestTimeRounded;
        timestamp += gridIntervalSeconds * 1000
      ) {
        const xLeft = timeToX(timestamp);
        const xRight = timeToX(timestamp + gridIntervalSeconds * 1000);

        if (xRight < -10 || xLeft > chartWidth + 10) continue;

        // Check for active bet in this cell
        const gridEntryTime = Math.floor(timestamp / 1000);
        const cellId = `${gridEntryTime}_${priceLevel.toFixed(priceDecimals)}`;

        // Find matching active bet
        const activeBet = activeBetMap.get(cellId);

        // Skip past grids IF:
        // 1. No active bet on it
        // 2. The *entire* grid is in the past (endTime < now)
        // 3. Not hovering/dragging (optional, but keep it clean)
        const gridEndTime = gridEntryTime + gridIntervalSeconds;
        if (!activeBet && gridEndTime < nowSeconds) {
          continue;
        }

        const boxWidth = xRight - xLeft;
        const boxHeight = Math.abs(yBottom - yTop);
        cellBoundsMapRef.current.set(cellId, { xLeft, yTop, w: boxWidth, h: boxHeight });

        // Check hover
        if (
          isGridInteractive &&
          mousePos &&
          mousePos.x >= xLeft &&
          mousePos.x <= xRight &&
          mousePos.y >= yTop &&
          mousePos.y <= yBottom &&
          mousePos.x <= chartWidth &&
          mousePos.y <= chartHeight
        ) {
          const currentGridStart =
            Math.floor(nowSeconds / gridIntervalSeconds) * gridIntervalSeconds;
          const minSelectableGridStart = currentGridStart + gridIntervalSeconds * 2;

          if (gridEntryTime >= minSelectableGridStart) {
            currentHoveredCellId = cellId;
          }
        }

        const isSelected = selectedCells.has(cellId);
        const isHovered = isGridInteractive && hoveredCell === cellId && !suppressHoverPreview;

        const currentGridStartDraw =
          Math.floor(nowSeconds / gridIntervalSeconds) * gridIntervalSeconds;
        const minSelectableGridStartDraw = currentGridStartDraw + gridIntervalSeconds * 2;
        const isSelectableFuture =
          isGridInteractive && gridEntryTime >= minSelectableGridStartDraw;

        // Fade uses continuous time so the effect is smooth as the boundary sweeps through
        // fadeEnd = continuous selectable boundary; cells fade over 1 grid interval AFTER crossing it
        const fadeEnd = nowSeconds + gridIntervalSeconds * 2;     // continuous boundary
        const fadeStart = fadeEnd - gridIntervalSeconds * 0.3;   // fade over 30% of 1 grid = fast
        const cellAlpha = (isSelected || activeBet)
          ? 1.0
          : gridEntryTime >= fadeEnd
          ? 1.0                                                  // fully selectable
          : gridEntryTime >= fadeStart
          ? (gridEntryTime - fadeStart) / gridIntervalSeconds   // fading (0→1 as cell exits)
          : 0.0;                                                 // fully gone

        // Default colors
        let cellColor = '59, 130, 246'; // Blue
        if (tradeMode === 'open-position') {
          const cellCenterPrice = priceLevel + GRID_Y_DOLLARS / 2;
          const currentPriceVal =
            priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : currentPrice;
          const isLong = cellCenterPrice < currentPriceVal;
          cellColor = isLong ? '34, 197, 94' : '239, 68, 68'; // Green : Red
        } else if (activeBet) {
          cellColor = '168, 85, 247'; // Purple
        }

        if (activeBet) {
          ctx.fillStyle = `rgba(${cellColor}, ${0.5 * cellAlpha})`;
          ctx.fillRect(xLeft, yTop, boxWidth, boxHeight);
          ctx.strokeStyle = `rgba(${cellColor}, ${cellAlpha})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(xLeft, yTop, boxWidth, boxHeight);
        } else if (isSelected) {
          ctx.fillStyle = `rgba(168, 85, 247, ${0.35 * cellAlpha})`;
          ctx.fillRect(xLeft, yTop, boxWidth, boxHeight);
          ctx.strokeStyle = `rgba(192, 132, 252, ${cellAlpha})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(xLeft, yTop, boxWidth, boxHeight);
        } else if (isHovered && !isDragging) {
          ctx.fillStyle = `rgba(168, 85, 247, ${0.25 * cellAlpha})`;
          ctx.fillRect(xLeft, yTop, boxWidth, boxHeight);
          ctx.strokeStyle = `rgba(168, 85, 247, ${0.8 * cellAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(xLeft, yTop, boxWidth, boxHeight);
        }

        // Shared text drawing logic — show text for selectable cells, fading cells, or active bets
        if (isSelected || (isHovered && !isDragging) || activeBet || isSelectableFuture || cellAlpha > 0) {
          // Calculate values
          const targetPrice = priceLevel + GRID_Y_DOLLARS / 2;
          const targetTime = gridEndTime;
          const entryPrice =
            priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : currentPrice;
          const entryTime = gridEntryTime;

          let displayMult: number;

          if (activeBet) {
            // Use frontend calculation as requested by user
            // This ensures it matches utils.ts logic 100%
            const mult = calculateMultiplier(
              parseFloat(activeBet.entryPrice),
              parseFloat(activeBet.targetPrice),
              activeBet.entryTime,
              activeBet.targetTime,
            );
            displayMult = mult;
          } else {
            // Calculate dynamic
            const mult = calculateMultiplier(entryPrice, targetPrice, entryTime, targetTime);
            displayMult = !isNaN(mult) && mult > 0 ? mult : 100;
          }

          const centerX = xLeft + boxWidth / 2;
          const centerY = yTop + boxHeight / 2;

          // Cell background color based on multiplier tier (only for unselected/unhovered future cells)
          if (isSelectableFuture && !isSelected && !isHovered && !activeBet) {
            const mv = displayMult / 100;
            const [cr, cg, cb] = mv < 2 ? [249, 115, 22] : mv < 5 ? [250, 204, 21] : [74, 222, 128];
            ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.07 * cellAlpha})`;
            ctx.fillRect(xLeft, yTop, boxWidth, boxHeight);
          }

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Multiplier
          if (tradeMode !== 'open-position') {
            ctx.font = 'bold 10px monospace';
            ctx.fillStyle = `rgba(255, 255, 255, ${cellAlpha})`;
            ctx.shadowBlur = 4;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.fillText(`${(displayMult / 100).toFixed(2)}x`, centerX, centerY - 6);
          }

          // Profit = betAmount * (multiplier - 1)
          const parsedBet = parseFloat(betAmount) || 10;
          const profit = parsedBet * (displayMult / 100 - 1);
          const profitLabel = profit >= 0.01
            ? `+$${profit.toFixed(2)}`
            : `+$${profit.toFixed(4)}`;

          const multiplierVal = displayMult / 100;
          const [pr, pg, pb] = multiplierVal < 2 ? [249, 115, 22] : multiplierVal < 5 ? [250, 204, 21] : [74, 222, 128];
          ctx.font = '600 9px monospace';
          ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${cellAlpha})`;
          ctx.shadowBlur = 4;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.fillText(
            tradeMode !== 'open-position' ? profitLabel : `$${(priceLevel + GRID_Y_DOLLARS / 2).toFixed(priceDecimals)}`,
            centerX,
            tradeMode !== 'open-position' ? centerY + 6 : centerY,
          );

          ctx.shadowBlur = 0;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        }
      }
    }

    // Update hovered cell logic
    if (isGridInteractive && currentHoveredCellId !== hoveredCell) {
      setHoveredCell(currentHoveredCellId);

      if (currentHoveredCellId && priceHistory.length > 0) {
        const [timestampStr, priceLevelStr] = currentHoveredCellId.split('_');
        const gridStartTime = parseInt(timestampStr);
        const gridBottomPrice = parseFloat(priceLevelStr);
        const entryPrice = priceHistory[priceHistory.length - 1].price;

        const validTargetPrice = gridBottomPrice + GRID_Y_DOLLARS / 2;
        const validTargetTime = gridStartTime + gridIntervalSeconds;
        const validEntryTime = gridStartTime;

        const multiplier = calculateMultiplier(
          entryPrice,
          validTargetPrice,
          validEntryTime,
          validTargetTime,
        );

        setHoveredCellInfo({
          targetPrice: gridBottomPrice,
          targetCenterPrice: validTargetPrice,
          targetTime: validTargetTime,
          multiplier,
        });
      } else {
        setHoveredCellInfo(null);
      }
    } else if (!isGridInteractive && hoveredCell) {
      setHoveredCell(null);
      setHoveredCellInfo(null);
    }

    // --- Draw Price Line ---
    if (interpolatedHistory.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, chartWidth, chartHeight);
      ctx.clip();

      // Gradient
      ctx.beginPath();
      let firstPoint = true;
      let lastX = 0;

      for (let i = 0; i < interpolatedHistory.length; i++) {
        const point = interpolatedHistory[i];
        const x = timeToX(point.time);
        const y = priceToY(point.price);
        if (x >= -50 && x <= chartWidth + 50) {
          if (firstPoint) {
            ctx.moveTo(x, chartHeight);
            ctx.lineTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
          lastX = x;
        }
      }
      ctx.lineTo(lastX, chartHeight);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
      gradient.addColorStop(0, 'rgba(168, 85, 247, 0.25)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
      ctx.fillStyle = gradient;
      ctx.fill();

      // Line
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      firstPoint = true;
      for (let i = 0; i < interpolatedHistory.length; i++) {
        const point = interpolatedHistory[i];
        const x = timeToX(point.time);
        const y = priceToY(point.price);

        if (x >= -50 && x <= chartWidth + 50) {
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Head Circle
      const latestPoint = interpolatedHistory[interpolatedHistory.length - 1];
      const currentPriceY = priceToY(latestPoint.price);
      const latestX = timeToX(latestPoint.time);

      if (blinkState) {
        if (isFocusMode) {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(latestX, currentPriceY, 12, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(168, 85, 247, 0.3)';
        ctx.beginPath();
        ctx.arc(latestX, currentPriceY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
        ctx.beginPath();
        ctx.arc(latestX, currentPriceY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a855f7';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(latestX, currentPriceY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    // --- Draw Quick Tap Entry Lines ---
    if (tradeMode === 'quick-tap' && (positionMarkers.length > 0 || pendingMarkers.length > 0)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(leftMargin, 0, chartWidth, chartHeight);
      ctx.clip();

      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;

      pendingMarkers.forEach((marker) => {
        const y = priceToY(marker.entryPrice);
        if (y < 0 || y > chartHeight) return;

        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(leftMargin + chartWidth, y);
        ctx.stroke();
      });

      ctx.setLineDash([6, 6]);

      positionMarkers.forEach((marker) => {
        const y = priceToY(marker.entryPrice);
        if (y < 0 || y > chartHeight) return;

        const lineColor = marker.isLong ? '#16c784' : '#ea3943';
        ctx.strokeStyle = lineColor;
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(leftMargin + chartWidth, y);
        ctx.stroke();
      });

      ctx.setLineDash([]);
      ctx.restore();

      positionMarkers.forEach((marker) => {
        const y = priceToY(marker.entryPrice);
        if (y < 0 || y > chartHeight) return;

        if (showYAxis && yAxisSide === 'right' && y < 100) {
          return;
        }

        const labelText = `${marker.isLong ? 'L' : 'S'} ${marker.entryPrice.toFixed(
          priceDecimals,
        )}`;
        const paddingX = 6;
        const labelHeight = 16;
        ctx.font = '11px monospace';
        const textWidth = ctx.measureText(labelText).width;
        const labelWidth = textWidth + paddingX * 2;
        const clampedY = Math.min(
          Math.max(y - labelHeight / 2, 2),
          chartHeight - labelHeight - 2,
        );

        let labelX = leftMargin + chartWidth - labelWidth - 4;
        if (showYAxis) {
          labelX = yAxisSide === 'right' ? leftMargin + chartWidth + 4 : 4;
        }

        const fillColor = marker.isLong ? 'rgba(22, 199, 132, 0.9)' : 'rgba(234, 57, 67, 0.9)';

        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.fillRect(labelX, clampedY, labelWidth, labelHeight);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, labelX + paddingX, clampedY + labelHeight / 2 + 0.5);
        ctx.restore();
      });
    }

    // --- Draw Click Animations ---
    const ANIM_DURATION = 600;
    const animNow = Date.now();
    clickAnimationsRef.current = clickAnimationsRef.current.filter(
      (a) => animNow - a.startMs < ANIM_DURATION,
    );
    clickAnimationsRef.current.forEach((anim) => {
      const t = (animNow - anim.startMs) / ANIM_DURATION; // 0 → 1

      // Spring scale: 1 → 1.3 (peak at t≈0.25) → 1.0 with elastic feel
      const scale = 1 + 0.3 * Math.sin(Math.PI * t) * Math.exp(-3.5 * t);
      const alpha = Math.pow(1 - t, 1.5);

      const cx = anim.xLeft + anim.w / 2;
      const cy = anim.yTop + anim.h / 2;
      const sw = anim.w * scale;
      const sh = anim.h * scale;
      const sx = cx - sw / 2;
      const sy = cy - sh / 2;

      ctx.save();

      // Bright fill flash (strongest early, fades fast)
      ctx.fillStyle = `rgba(168, 85, 247, ${alpha * 0.45})`;
      ctx.fillRect(sx, sy, sw, sh);

      // Inner glow (lighter purple)
      ctx.fillStyle = `rgba(216, 180, 254, ${alpha * 0.25})`;
      ctx.fillRect(
        cx - (sw * 0.6) / 2,
        cy - (sh * 0.6) / 2,
        sw * 0.6,
        sh * 0.6,
      );

      // Expanding border
      ctx.strokeStyle = `rgba(192, 132, 252, ${alpha * 0.9})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);

      // Second outer border ring (slightly bigger, more transparent)
      const scale2 = 1 + 0.5 * Math.sin(Math.PI * t) * Math.exp(-3 * t);
      const sw2 = anim.w * scale2;
      const sh2 = anim.h * scale2;
      ctx.strokeStyle = `rgba(168, 85, 247, ${alpha * 0.4})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - sw2 / 2, cy - sh2 / 2, sw2, sh2);

      ctx.restore();
    });
  }, [
    dimensions,
    interpolatedHistory,
    priceHistory,
    scrollOffset,
    verticalOffset,
    hoveredCell,
    selectedCells,
    mousePos,
    blinkState,
    isFocusMode,
    isDragging,
    GRID_Y_DOLLARS,
    betAmount,
    tradeMode,
    isPlacingBet,
    gridIntervalSeconds,
    initialPrice,
    currentPrice,
    gridAnchorPrice,
    gridAnchorTime,
    showXAxis,
    showYAxis,
    yAxisSide,
    symbol,
    displayBets,
    isGridInteractive,
    positionMarkers,
    pendingMarkers,
  ]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        // Optional: clear hover
      }}
      className={`w-full h-full touch-none select-none ${
        isGridInteractive ? 'cursor-crosshair' : 'cursor-default'
      }`}
    />
  );
};

export default PerSecondChart;
