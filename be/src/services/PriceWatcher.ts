import WebSocket from 'ws';
import { Logger } from '../utils/Logger';
import { PriceUpdate, SUPPORTED_ASSETS } from '../types';
import { config } from '../config';

type PriceCallback = (update: PriceUpdate) => void;

interface OraclePrice {
  symbol: string;
  price: number;        // human-readable (e.g. 96000.5)
  confidence?: number;
  timestamp: number;
  source: string;
}

export class PriceWatcher {
  private logger = new Logger('PriceWatcher');
  private ws: WebSocket | null = null;
  private callbacks: PriceCallback[] = [];
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private readonly HERMES_WS = `${config.pythHermesUrl.replace('https://', 'wss://')}/ws`;
  private latestPrices: Record<string, OraclePrice> = {};

  // priceId (0x-prefixed) → symbol name
  private priceIdToSymbol = new Map<string, string>();

  constructor() {
    for (const asset of SUPPORTED_ASSETS) {
      if (asset.pythPriceId) {
        const normalized = asset.pythPriceId.toLowerCase().startsWith('0x')
          ? asset.pythPriceId.toLowerCase()
          : `0x${asset.pythPriceId.toLowerCase()}`;
        this.priceIdToSymbol.set(normalized, asset.symbol);
      }
    }
  }

  onPriceUpdate(cb: PriceCallback): void {
    this.callbacks.push(cb);
  }

  getLatestPrices(): Record<string, OraclePrice> {
    return this.latestPrices;
  }

  start(): void {
    this._connect();
  }

  private _connect(): void {
    try {
      this.ws = new WebSocket(this.HERMES_WS);

      this.ws.on('open', () => {
        this.reconnectAttempts = 0;
        this.logger.info('Connected to Pyth Hermes WebSocket');

        const ids = Array.from(this.priceIdToSymbol.keys());
        this.ws!.send(JSON.stringify({ type: 'subscribe', ids }));
      });

      this.ws.on('message', (raw: WebSocket.Data) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'price_update') this._handleUpdate(msg);
        } catch { /* ignore parse errors */ }
      });

      this.ws.on('error', (err) => this.logger.error('WebSocket error', err));

      this.ws.on('close', () => {
        this.logger.warn('WebSocket closed, reconnecting...');
        this._scheduleReconnect();
      });
    } catch (err) {
      this.logger.error('Failed to connect', err);
      this._scheduleReconnect();
    }
  }

  private _handleUpdate(msg: any): void {
    const feed = msg.price_feed;
    if (!feed?.price) return;

    const feedId = feed.id.startsWith('0x') ? feed.id.toLowerCase() : `0x${feed.id.toLowerCase()}`;
    const symbol = this.priceIdToSymbol.get(feedId);
    if (!symbol) return;

    const rawPrice = BigInt(feed.price.price);
    const expo = feed.price.expo as number;    // typically -8
    // Normalise to 8-decimal unsigned integer
    const price8dec = expo === -8
      ? rawPrice
      : expo < -8
        ? rawPrice / BigInt(10 ** (-8 - expo))
        : rawPrice * BigInt(10 ** (expo + 8));

    if (price8dec <= 0n) return;

    // Store human-readable price for REST/WS access
    const humanPrice = Number(price8dec) / 1e8;
    this.latestPrices[symbol] = {
      symbol,
      price: humanPrice,
      timestamp: feed.price.publish_time,
      source: 'pyth',
    };

    for (const cb of this.callbacks) {
      try {
        cb({ symbol, priceId: feedId, price: price8dec, publishTime: feed.price.publish_time });
      } catch { /* isolate callback errors */ }
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT) {
      this.logger.error(`Max reconnects (${this.MAX_RECONNECT}) reached — giving up`);
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(5000 * this.reconnectAttempts, 60_000);
    setTimeout(() => this._connect(), delay);
  }

  shutdown(): void {
    this.ws?.close();
    this.ws = null;
    this.callbacks = [];
  }
}
