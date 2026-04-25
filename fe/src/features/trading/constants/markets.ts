import { Market } from '@/features/trading/types';

export const ALL_MARKETS: Market[] = [
  {
    symbol: 'BTC',
    tradingViewSymbol: 'BINANCE:BTCUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
    binanceSymbol: 'BTCUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  {
    symbol: 'ETH',
    tradingViewSymbol: 'BINANCE:ETHUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    binanceSymbol: 'ETHUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  {
    symbol: 'SOL',
    tradingViewSymbol: 'BINANCE:SOLUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
    binanceSymbol: 'SOLUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  {
    symbol: 'AVAX',
    tradingViewSymbol: 'BINANCE:AVAXUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchex/info/logo.png',
    binanceSymbol: 'AVAXUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  {
    symbol: 'BNB',
    tradingViewSymbol: 'BINANCE:BNBUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
    binanceSymbol: 'BNBUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  {
    symbol: 'XRP',
    tradingViewSymbol: 'BINANCE:XRPUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ripple/info/logo.png',
    binanceSymbol: 'XRPUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  {
    symbol: 'AAVE',
    tradingViewSymbol: 'BINANCE:AAVEUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png',
    binanceSymbol: 'AAVEUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  {
    symbol: 'ARB',
    tradingViewSymbol: 'BINANCE:ARBUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
    binanceSymbol: 'ARBUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  {
    symbol: 'DOGE',
    tradingViewSymbol: 'BINANCE:DOGEUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/doge/info/logo.png',
    binanceSymbol: 'DOGEUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  {
    symbol: 'LINK',
    tradingViewSymbol: 'BINANCE:LINKUSDT',
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',
    binanceSymbol: 'LINKUSDT',
    category: 'crypto',
    maxLeverage: 100,
  },
  // Forex
  {
    symbol: 'EURUSD',
    tradingViewSymbol: 'OANDA:EURUSD',
    logoUrl: '/icons/EUR.png',
    category: 'forex',
    maxLeverage: 100,
  },
  {
    symbol: 'GBPUSD',
    tradingViewSymbol: 'OANDA:GBPUSD',
    logoUrl: '/icons/GBP.png',
    category: 'forex',
    maxLeverage: 100,
  },
  // Commodities
  {
    symbol: 'XAUUSD',
    tradingViewSymbol: 'OANDA:XAUUSD',
    logoUrl: '/icons/XAU.png',
    category: 'commodities',
    maxLeverage: 100,
  },
  {
    symbol: 'XAGUSD',
    tradingViewSymbol: 'OANDA:XAGUSD',
    logoUrl: '/icons/XAG.png',
    category: 'commodities',
    maxLeverage: 100,
  },
  // Indices / ETFs
  {
    symbol: 'QQQUSD',
    tradingViewSymbol: 'NASDAQ:QQQ',
    logoUrl: '/icons/QQQ.png',
    category: 'indices',
    maxLeverage: 100,
  },
  {
    symbol: 'SPYUSD',
    tradingViewSymbol: 'AMEX:SPY',
    logoUrl: '/icons/SPY.png',
    category: 'indices',
    maxLeverage: 100,
  },
  // Stocks
  {
    symbol: 'AAPLUSD',
    tradingViewSymbol: 'NASDAQ:AAPL',
    logoUrl: '/icons/AAPL.png',
    category: 'stocks',
    maxLeverage: 100,
  },
  {
    symbol: 'GOOGLUSD',
    tradingViewSymbol: 'NASDAQ:GOOGL',
    logoUrl: '/icons/GOOGL.png',
    category: 'stocks',
    maxLeverage: 100,
  },
];
