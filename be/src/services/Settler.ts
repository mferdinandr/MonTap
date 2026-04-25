import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Logger } from '../utils/Logger';
import { config, TAP_BET_MANAGER_ABI } from '../config';
import type { BetScanner } from './BetScanner';
import type { WinEntry } from './WinDetector';

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
} as const;

export class Settler {
  private logger = new Logger('Settler');
  private account = privateKeyToAccount(config.privateKey);
  private walletClient = createWalletClient({
    account: privateKeyToAccount(config.privateKey),
    chain: MONAD_TESTNET,
    transport: http(config.rpcUrl),
  });
  private scanner: BetScanner;
  private inFlight = new Set<bigint>();

  constructor(scanner: BetScanner) {
    this.scanner = scanner;
  }

  start(): void {
    this.logger.info('Settler ready — trusted settlement (no proof required)');
  }

  stop(): void {}

  settle(entry: WinEntry): void {
    if (this.inFlight.has(entry.betId)) return;
    this.inFlight.add(entry.betId);
    this._settle(entry).finally(() => this.inFlight.delete(entry.betId));
  }

  private async _settle(entry: WinEntry): Promise<void> {
    const { betId } = entry;
    const bet = this.scanner.getActiveBets().get(betId);
    if (!bet) {
      this.logger.warn(`Bet ${betId} not in active map — skipping`);
      return;
    }

    this.logger.info(`Settling win: betId=${betId} ${bet.symbolName} ${bet.direction}`);

    try {
      const hash = await this.walletClient.writeContract({
        address: config.tapBetManager,
        abi: TAP_BET_MANAGER_ABI,
        functionName: 'settleBetWin',
        args: [betId],
        account: this.account,
      });
      this.logger.info(`settleBetWin submitted: betId=${betId} tx=${hash}`);
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);

      if (msg.includes('settlement window passed') || msg.includes('not active') || msg.includes('not settler')) {
        this.logger.warn(`Bet ${betId} cannot be settled: ${msg} — removing`);
        this.scanner.removeBet(betId);
        return;
      }

      // Retry once on transient error
      this.logger.warn(`Settlement failed for bet ${betId}: ${msg} — retrying`);
      try {
        const hash = await this.walletClient.writeContract({
          address: config.tapBetManager,
          abi: TAP_BET_MANAGER_ABI,
          functionName: 'settleBetWin',
          args: [betId],
          account: this.account,
        });
        this.logger.info(`Retry succeeded: betId=${betId} tx=${hash}`);
      } catch (retryErr: any) {
        const retryMsg: string = retryErr?.message ?? String(retryErr);
        if (retryMsg.includes('settlement window passed') || retryMsg.includes('not active')) {
          this.scanner.removeBet(betId);
        }
        this.logger.error(`Retry failed for bet ${betId}: ${retryMsg}`);
      }
    }
  }
}
