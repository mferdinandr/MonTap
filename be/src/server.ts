import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { BetScanner } from './services/BetScanner';
import { PriceWatcher } from './services/PriceWatcher';
import { createBetsRouter } from './routes/bets';
import { createPricesRouter } from './routes/prices';
import sessionRouter, { createFaucetRouter } from './routes/session';
import { Logger } from './utils/Logger';
import { PriceUpdate } from './types';

const logger = new Logger('Server');

interface Services {
  scanner: BetScanner;
  priceWatcher: PriceWatcher;
}

let _broadcastWin: ((betId: bigint, trader: string, payout: bigint) => void) | null = null;

export function broadcastWin(betId: bigint, trader: string, payout: bigint): void {
  _broadcastWin?.(betId, trader, payout);
}

export function createServer(services: Services): http.Server {
  const { scanner, priceWatcher } = services;

  const app = express();
  app.use(cors());
  app.use(express.json());

  // REST routes
  app.use('/api/one-tap', createBetsRouter(scanner));
  app.use('/api', createPricesRouter(priceWatcher));
  app.use('/api/session', sessionRouter);
  app.use('/api/faucet', createFaucetRouter());

  const server = http.createServer(app);

  // WebSocket server — attached to same HTTP server, handles /ws/price upgrade
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws/price') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    logger.info(`WS client connected (total: ${clients.size})`);

    // Send latest prices immediately on connect
    const latest = priceWatcher.getLatestPrices();
    if (Object.keys(latest).length > 0) {
      ws.send(JSON.stringify({ type: 'price_update', data: latest }));
    }

    ws.on('close', () => {
      clients.delete(ws);
      logger.info(`WS client disconnected (total: ${clients.size})`);
    });
  });

  // Register win broadcaster
  _broadcastWin = (betId: bigint, trader: string, payout: bigint) => {
    if (clients.size === 0) return;
    const msg = JSON.stringify({
      type: 'bet_won',
      data: { betId: betId.toString(), trader, payout: payout.toString() },
    });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  };

  // Broadcast every Pyth price tick to all connected WS clients
  priceWatcher.onPriceUpdate((update: PriceUpdate) => {
    if (clients.size === 0) return;
    const latest = priceWatcher.getLatestPrices();
    const msg = JSON.stringify({ type: 'price_update', data: latest });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  });

  return server;
}
