import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Logger } from '../utils/Logger';
import { config, TAP_BET_MANAGER_ABI } from '../config';
import type { BetScanner } from './BetScanner';
import type { WinDetector } from './WinDetector';
import type { Settler } from './Settler';
import type { PriceWatcher } from './PriceWatcher';

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
} as const;

export class ExpiryCleanup {
  private logger = new Logger('ExpiryCleanup');
  private account = privateKeyToAccount(config.privateKey);
  private walletClient = createWalletClient({
    account: privateKeyToAccount(config.privateKey),
    chain: MONAD_TESTNET,
    transport: http(config.rpcUrl),
  });
  private scanner: BetScanner;
  private detector: WinDetector;
  private settler: Settler;
  private priceWatcher: PriceWatcher;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(scanner: BetScanner, detector: WinDetector, settler: Settler, priceWatcher: PriceWatcher) {
    this.scanner = scanner;
    this.detector = detector;
    this.settler = settler;
    this.priceWatcher = priceWatcher;
  }

  start(): void {
    this.timer = setInterval(() => this._run(), config.expiryCleanupMs);
    this.logger.info(`ExpiryCleanup started — interval ${config.expiryCleanupMs}ms`);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async _run(): Promise<void> {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const expired: bigint[] = [];
    const latestPrices = this.priceWatcher.getLatestPrices();

    for (const [betId, bet] of this.scanner.getActiveBets()) {
      if (now <= bet.expiry) continue;
      if (this.detector.isQueued(betId)) continue;

      // Before expiring, check if current price satisfies the win condition.
      // This recovers bets where the price hit the target but the Pyth WS was
      // lagging or WinDetector missed the exact update tick.
      const latestOracle = latestPrices[bet.symbolName];
      if (latestOracle) {
        const latestPrice8 = BigInt(Math.round(latestOracle.price * 1e8));
        const gridHalf = bet.targetPrice / 2000n;
        const wonNow = latestPrice8 >= bet.targetPrice - gridHalf && latestPrice8 <= bet.targetPrice + gridHalf;

        if (wonNow) {
          const winPublishTime = Number(bet.expiry) - 1;
          this.logger.info(`Bet ${betId} expired but price meets win condition — settling with publishTime=${winPublishTime}`);
          this.detector.forceQueue(betId, winPublishTime); // marks as fired so sweep won't duplicate
          this.settler.settle({ betId, publishTime: winPublishTime });
          continue;
        }
      }

      expired.push(betId);
    }

    if (!expired.length) return;

    this.logger.info(`Found ${expired.length} expired bets — settling in batches of ${config.maxBatchSize}`);

    for (let i = 0; i < expired.length; i += config.maxBatchSize) {
      const batch = expired.slice(i, i + config.maxBatchSize);
      try {
        const hash = await this.walletClient.writeContract({
          address: config.tapBetManager,
          abi: TAP_BET_MANAGER_ABI,
          functionName: 'batchSettleExpired',
          args: [batch],
          account: this.account,
        });
        this.logger.info(`batchSettleExpired tx=${hash} batch=${batch.length}`);
      } catch (err) {
        this.logger.error('batchSettleExpired failed', err);
      }
    }
  }
}
