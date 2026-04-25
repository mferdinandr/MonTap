import { useEffect, useRef, useState } from 'react';
import { FuturesData, MarketData, Market } from '@/features/trading/types';

interface OraclePrice {
  symbol: string;
  price: number;
  confidence?: number;
  timestamp: number;
  source: string;
}

interface UseMarketWebSocketReturn {
  allPrices: Record<string, string>;
  marketDataMap: Record<string, MarketData>;
  futuresDataMap: Record<string, FuturesData>;
  oraclePrices: Record<string, OraclePrice>;
}

/**
 * Custom hook to manage WebSocket connections for market data
 * Handles both Binance spot prices and Pyth Oracle prices
 */
export interface BetWonEvent { betId: string; trader: string; payout: string; }

export function useMarketWebSocket(
  markets: Market[],
  onBetWon?: (event: BetWonEvent) => void,
): UseMarketWebSocketReturn {
  const [allPrices, setAllPrices] = useState<Record<string, string>>({});
  const [marketDataMap, setMarketDataMap] = useState<Record<string, MarketData>>({});
  const [futuresDataMap, setFuturesDataMap] = useState<Record<string, FuturesData>>({});
  const [oraclePrices, setOraclePrices] = useState<Record<string, OraclePrice>>({});
  const onBetWonRef = useRef(onBetWon);
  onBetWonRef.current = onBetWon;

  // Seed oracle prices from REST once (covers new env feeds before WS ticks)
  useEffect(() => {
    const seedOracle = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
        const res = await fetch(`${backendUrl}/api/price/all`);
        if (!res.ok) return;
        const body = await res.json();
        if (body?.data) {
          const seeded: Record<string, OraclePrice> = {};
          Object.keys(body.data).forEach((symbol: string) => {
            const p = body.data[symbol];
            seeded[symbol.toUpperCase()] = {
              symbol: p.symbol || symbol.toUpperCase(),
              price: p.price,
              confidence: p.confidence,
              timestamp: p.timestamp,
              source: p.source || 'pyth',
            };
          });
          setOraclePrices((prev) => ({ ...prev, ...seeded }));
        }
      } catch (err) {
        console.warn('Seed oracle price failed', err);
      }
    };
    seedOracle();
  }, []);

  // Fetch Futures Data (Funding Rate, Open Interest)
  useEffect(() => {
    const fetchFuturesData = async () => {
      try {
        const symbols = markets.map((m) => m.binanceSymbol);

        const results = await Promise.all(
          symbols.map(async (symbol) => {
            if (!symbol) return null;
            try {
              // Fetch funding rate
              const fundingResponse = await fetch(
                `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
              );
              const fundingData = await fundingResponse.json();

              // Fetch open interest
              const oiResponse = await fetch(
                `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
              );
              const oiData = await oiResponse.json();

              // Get current price for OI value calculation
              const priceResponse = await fetch(
                `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`,
              );
              const priceData = await priceResponse.json();

              const openInterestValue = (
                parseFloat(oiData.openInterest || '0') * parseFloat(priceData.price || '0')
              ).toString();

              return {
                symbol,
                data: {
                  fundingRate: fundingData.lastFundingRate || '0',
                  nextFundingTime: fundingData.nextFundingTime || 0,
                  openInterest: oiData.openInterest || '0',
                  openInterestValue,
                },
              };
            } catch (error) {
              console.error(`Error fetching futures data for ${symbol}:`, error);
              return null;
            }
          }),
        );

        const newFuturesData: Record<string, FuturesData> = {};
        results.forEach((result) => {
          if (result) {
            newFuturesData[result.symbol] = result.data;
          }
        });

        setFuturesDataMap(newFuturesData);
      } catch (error) {
        console.error('Error fetching futures data:', error);
      }
    };

    fetchFuturesData();
    const interval = setInterval(fetchFuturesData, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [markets]);

  // WebSocket for real-time spot prices (Binance) with ping mechanism
  useEffect(() => {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/!ticker@arr');
    let pingInterval: NodeJS.Timeout | null = null;

    ws.onopen = () => {
      // Start ping interval to keep connection alive (every 3 minutes)
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ method: 'ping' }));
        }
      }, 180000); // 3 minutes (180000ms)
    };

    ws.onmessage = (event) => {
      const tickers = JSON.parse(event.data);
      const newPrices: Record<string, string> = {};
      const newMarketData: Record<string, MarketData> = {};

      for (const ticker of tickers) {
        newPrices[ticker.s] = parseFloat(ticker.c).toString();
        newMarketData[ticker.s] = {
          price: parseFloat(ticker.c).toString(),
          priceChange: parseFloat(ticker.p).toString(),
          priceChangePercent: parseFloat(ticker.P).toString(),
          high24h: parseFloat(ticker.h).toString(),
          low24h: parseFloat(ticker.l).toString(),
          volume24h: parseFloat(ticker.q).toString(),
        };
      }

      setAllPrices(newPrices);
      setMarketDataMap(newMarketData);
    };

    ws.onerror = (error) => console.error('❌ Binance WebSocket error:', error);

    ws.onclose = () => {
      // Clear ping interval when connection closes
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    return () => {
      // Clear ping interval on cleanup
      if (pingInterval) {
        clearInterval(pingInterval);
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // WebSocket for Pyth Oracle prices
  useEffect(() => {
    let ws: WebSocket | null = null;

    const connectWebSocket = () => {
      try {
        const wsUrl =
          (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/^http/, 'ws') +
          '/ws/price';
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === 'price_update' && message.data) {
              setOraclePrices((prev) => {
                const next: Record<string, OraclePrice> = { ...prev };
                Object.keys(message.data).forEach((symbol) => {
                  const priceData = message.data[symbol];
                  next[symbol.toUpperCase()] = {
                    symbol: priceData.symbol,
                    price: priceData.price,
                    confidence: priceData.confidence,
                    timestamp: priceData.timestamp,
                    source: priceData.source,
                  };
                });
                return next;
              });
            }

            if (message.type === 'bet_won' && message.data) {
              onBetWonRef.current?.(message.data);
            }
          } catch (error) {
            console.error('Error parsing Oracle message:', error);
          }
        };

        ws.onerror = () => {
          // Silently handle error - backend might not be running
          console.warn('⚠️ Oracle WebSocket not available (backend offline?)');
        };
      } catch (error) {
        console.warn('⚠️ Could not connect to Oracle WebSocket:', error);
      }
    };

    connectWebSocket();

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  return {
    allPrices,
    marketDataMap,
    futuresDataMap,
    oraclePrices,
  };
}
