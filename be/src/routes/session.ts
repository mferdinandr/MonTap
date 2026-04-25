import { Router, Request, Response } from 'express';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  verifyMessage,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Logger } from '../utils/Logger';

const router = Router();
const logger = new Logger('SessionRoutes');

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? 'https://testnet-rpc.monad.xyz'] } },
} as const;

const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'faucet',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'mint',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

function buildRelayer() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not configured');

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http(process.env.RPC_URL);

  const publicClient = createPublicClient({ chain: MONAD_TESTNET, transport });
  const walletClient = createWalletClient({ account, chain: MONAD_TESTNET, transport });

  return { account, publicClient, walletClient };
}

/**
 * Mint USDC directly to recipient using owner mint() function.
 * No faucet cooldown, no intermediate transfer needed.
 */
async function mintUsdcFor(recipient: `0x${string}`): Promise<`0x${string}`> {
  const usdcAddress = process.env.USDC_ADDRESS as `0x${string}`;
  if (!usdcAddress) throw new Error('USDC_ADDRESS not configured');

  const usdcAmount = parseUnits(process.env.SESSION_USDC_AMOUNT ?? '100', 6);
  const { publicClient, walletClient } = buildRelayer();

  logger.info('🪙 Minting USDC to session key...', { recipient, usdc: formatUnits(usdcAmount, 6) });

  const mintTxHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'mint',
    args: [recipient, usdcAmount],
    gas: 150000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: mintTxHash });
  if (receipt.status === 'reverted') throw new Error('USDC mint reverted');

  const balance = await publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [recipient],
  }) as bigint;

  logger.info('✅ USDC minted', { mintTxHash, balance: formatUnits(balance, 6) });

  if (balance < usdcAmount) {
    throw new Error(`Mint failed: balance is ${formatUnits(balance, 6)}, expected ${formatUnits(usdcAmount, 6)}`);
  }

  return mintTxHash;
}

/**
 * POST /api/session/create
 *
 * 1. Verify trader signed the session key authorization
 * 2. Transfer USDC + MON from relayer wallet to the session key address
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { trader, sessionKeyAddress, expiresAt, authSignature } = req.body;

    if (!trader || !sessionKeyAddress || !expiresAt || !authSignature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: trader, sessionKeyAddress, expiresAt, authSignature',
      });
    }

    // Verify the trader's authorization signature
    const message = `Authorize session key ${sessionKeyAddress} for MonadBlitz until ${expiresAt}`;

    const isValid = await verifyMessage({
      address: trader as `0x${string}`,
      message,
      signature: authSignature as `0x${string}`,
    });

    if (!isValid) {
      logger.error('❌ Invalid session key signature', { trader, sessionKeyAddress });
      return res.status(400).json({ success: false, error: 'Invalid authorization signature' });
    }

    logger.info('✅ Session key signature verified', { trader, sessionKeyAddress, expiresAt });

    const { account, publicClient, walletClient } = buildRelayer();

    const monAmount = parseUnits(process.env.SESSION_MON_AMOUNT ?? '0.05', 18);

    logger.info('💸 Funding session key with MON for gas...', {
      relayer: account.address,
      sessionKey: sessionKeyAddress,
      mon: formatUnits(monAmount, 18),
    });

    const monTxHash = await walletClient.sendTransaction({
      to: sessionKeyAddress as `0x${string}`,
      value: monAmount,
    });
    const monReceipt = await publicClient.waitForTransactionReceipt({ hash: monTxHash });
    if (monReceipt.status === 'reverted') throw new Error('MON transfer reverted');
    logger.info('✅ MON sent', { monTxHash });

    // Mint USDC directly to session key
    const usdcTxHash = await mintUsdcFor(sessionKeyAddress as `0x${string}`);

    res.json({
      success: true,
      sessionKeyAddress,
      expiresAt,
      monTxHash,
      usdcTxHash,
      funding: {
        mon: formatUnits(monAmount, 18),
        usdc: process.env.SESSION_USDC_AMOUNT ?? '100',
      },
    });
  } catch (error: any) {
    logger.error('❌ Failed to create session key:', error);
    res.status(500).json({ success: false, error: error.message ?? 'Session creation failed' });
  }
});

/**
 * GET /api/session/status?sessionKeyAddress=0x...
 *
 * Returns USDC and MON balances of the session key wallet.
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { sessionKeyAddress } = req.query;
    if (!sessionKeyAddress || typeof sessionKeyAddress !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing sessionKeyAddress' });
    }

    const usdcAddress = process.env.USDC_ADDRESS as `0x${string}`;
    if (!usdcAddress) throw new Error('USDC_ADDRESS not configured');

    const publicClient = createPublicClient({
      chain: MONAD_TESTNET,
      transport: http(process.env.RPC_URL),
    });

    const [usdcBalance, monBalance] = await Promise.all([
      publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [sessionKeyAddress as `0x${string}`],
      }),
      publicClient.getBalance({ address: sessionKeyAddress as `0x${string}` }),
    ]);

    res.json({
      success: true,
      sessionKeyAddress,
      balances: {
        usdc: formatUnits(usdcBalance, 6),
        mon: formatUnits(monBalance, 18),
      },
    });
  } catch (error: any) {
    logger.error('❌ Failed to check session status:', error);
    res.status(500).json({ success: false, error: error.message ?? 'Status check failed' });
  }
});

export default router;

// ─── Faucet route (used by ClaimUSDCButton) ────────────────────────────────────

export function createFaucetRouter(): Router {
  const faucetRouter = Router();

  /**
   * POST /api/faucet/claim
   * Relayer calls faucet() then transfers USDC to the requested address.
   */
  faucetRouter.post('/claim', async (req: Request, res: Response) => {
    try {
      const { address } = req.body;
      if (!address) {
        return res.status(400).json({ success: false, error: 'Missing address' });
      }

      logger.info('🚰 Faucet claim requested', { address });
      const txHash = await mintUsdcFor(address as `0x${string}`);

      res.json({
        success: true,
        data: { transactionHash: txHash },
      });
    } catch (error: any) {
      logger.error('❌ Faucet claim failed:', error);
      res.status(500).json({ success: false, error: error.message ?? 'Faucet claim failed' });
    }
  });

  return faucetRouter;
}
