import { createPublicClient, http, parseAbiItem } from 'viem';
import { Logger } from '../utils/Logger';
import { ActiveBet, Direction } from '../types';
import { config, TAP_BET_MANAGER_ABI, BYTES32_TO_SYMBOL } from '../config';
import { broadcastWin } from '../server';

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
} as const;

export class BetScanner {
  private logger = new Logger('BetScanner');
  private activeBets = new Map<bigint, ActiveBet>();
  private syncing = true;
  private client = createPublicClient({ chain: MONAD_TESTNET, transport: http(config.rpcUrl) });

  async start(): Promise<void> {
    this.syncing = true;
    await this._syncActiveBets();
    this._watchEvents();
    this.syncing = false;
    this.logger.info(`Startup sync complete — ${this.activeBets.size} active bets`);
  }

  getActiveBets(): Map<bigint, ActiveBet> {
    return this.activeBets;
  }

  removeBet(betId: bigint): void {
    this.activeBets.delete(betId);
  }

  isSyncing(): boolean {
    return this.syncing;
  }

  private async _syncActiveBets(): Promise<void> {
    const ids = await this.client.readContract({
      address: config.tapBetManager,
      abi: TAP_BET_MANAGER_ABI,
      functionName: 'getActiveBets',
    }) as bigint[];

    await Promise.all(ids.map(id => this._loadBet(id)));
  }

  private async _loadBet(betId: bigint): Promise<void> {
    try {
      const raw = await this.client.readContract({
        address: config.tapBetManager,
        abi: TAP_BET_MANAGER_ABI,
        functionName: 'getBet',
        args: [betId],
      }) as any;

      const symbolName = BYTES32_TO_SYMBOL[raw.symbol] ?? raw.symbol;
      const bet: ActiveBet = {
        betId:       raw.betId,
        user:        raw.user,
        symbol:      raw.symbol,
        symbolName,
        targetPrice: raw.targetPrice,
        collateral:  raw.collateral,
        multiplier:  raw.multiplier,
        direction:   raw.direction === 0 ? 'UP' : 'DOWN',
        expiry:      raw.expiry,
        placedAt:    raw.placedAt,
      };

      if (raw.status === 0) { // ACTIVE
        this.activeBets.set(betId, bet);
      }
    } catch (err) {
      this.logger.error(`Failed to load bet ${betId}`, err);
    }
  }

  private _watchEvents(): void {
    // Watch BetPlaced — add to map
    this.client.watchContractEvent({
      address: config.tapBetManager,
      abi: TAP_BET_MANAGER_ABI,
      eventName: 'BetPlaced',
      onLogs: (logs) => {
        for (const log of logs) {
          const args = log.args as any;
          const symbolName = BYTES32_TO_SYMBOL[args.symbol] ?? args.symbol;
          const bet: ActiveBet = {
            betId:       args.betId,
            user:        args.user,
            symbol:      args.symbol,
            symbolName,
            targetPrice: args.targetPrice,
            collateral:  args.collateral,
            multiplier:  args.multiplier,
            direction:   args.direction === 0 ? 'UP' : 'DOWN',
            expiry:      args.expiry,
            placedAt:    BigInt(Math.floor(Date.now() / 1000)),
          };
          this.activeBets.set(args.betId, bet);
          this.logger.info(`Bet placed: id=${args.betId} ${symbolName} ${bet.direction} target=${args.targetPrice}`);
        }
      },
      onError: (err) => this.logger.error('BetPlaced watch error', err),
    });

    // Watch BetWon — remove from map
    this.client.watchContractEvent({
      address: config.tapBetManager,
      abi: TAP_BET_MANAGER_ABI,
      eventName: 'BetWon',
      onLogs: (logs) => {
        for (const log of logs) {
          const args = log.args as any;
          this.activeBets.delete(args.betId);
          this.logger.info(`Bet won: id=${args.betId} settler=${args.settler} payout=${args.payout}`);
          broadcastWin(args.betId, args.user ?? args.settler, args.payout ?? 0n);
        }
      },
      onError: (err) => this.logger.error('BetWon watch error', err),
    });

    // Watch BetExpired — remove from map
    this.client.watchContractEvent({
      address: config.tapBetManager,
      abi: TAP_BET_MANAGER_ABI,
      eventName: 'BetExpired',
      onLogs: (logs) => {
        for (const log of logs) {
          const args = log.args as any;
          this.activeBets.delete(args.betId);
          this.logger.info(`Bet expired: id=${args.betId}`);
        }
      },
      onError: (err) => this.logger.error('BetExpired watch error', err),
    });
  }
}
