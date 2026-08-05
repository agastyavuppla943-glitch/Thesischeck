import { ToolDecorator as Tool, Cache, ExecutionContext, z } from '@nitrostack/core';
import { MarketDataService } from './market-data.service.js';

const getMarketSnapshotSchema = z
  .object({
    ticker: z.string().describe('Ticker symbol, e.g. AAPL')
  })
  .strict();

const getTickerQuoteSchema = z
  .object({
    ticker: z.string().describe('Ticker symbol, e.g. AAPL')
  })
  .strict();

const compareTickersSchema = z
  .object({
    tickers: z
      .array(z.string().min(1))
      .min(2)
      .max(8)
      .describe('List of 2–8 ticker symbols to compare side-by-side, e.g. ["AAPL", "MSFT", "GOOGL"]')
  })
  .strict();

const getEarningsCalendarSchema = z
  .object({
    ticker: z.string().min(1).describe('Ticker symbol, e.g. AAPL')
  })
  .strict();

const getNewsHeadlinesSchema = z
  .object({
    ticker: z.string().min(1).describe('Ticker symbol, e.g. AAPL'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe('Maximum number of headlines to return (1–10, default 5)')
  })
  .strict();

const getRiskMetricsSchema = z
  .object({
    ticker: z.string().min(1).describe('Ticker symbol, e.g. AAPL')
  })
  .strict();

const cacheKey = (input: unknown): string => {
  const ticker = (input as { ticker?: string })?.ticker ?? 'unknown';
  return `market-snapshot:${ticker.toUpperCase()}`;
};

export class MarketDataTools {
  private readonly marketDataService = new MarketDataService();

  @Tool({
    name: 'get_market_snapshot',
    description:
      'Get fundamentals, sentiment, and a fundamentals-vs-sentiment divergence read for a ticker. Uses simulated data by default; set FMP_API_KEY / NEWSAPI_KEY env vars to pull from live providers.',
    inputSchema: getMarketSnapshotSchema
  })
  @Cache({ ttl: 120, key: cacheKey })
  async getMarketSnapshot(rawInput: unknown, ctx: ExecutionContext) {
    // inputSchema is advertised to clients but not auto-enforced by
    // NitroStack at runtime, so validate explicitly.
    const input = getMarketSnapshotSchema.parse(rawInput);
    ctx.logger.info('Fetching market snapshot', { ticker: input.ticker });
    return this.marketDataService.getMarketSnapshot(input.ticker);
  }

  @Tool({
    name: 'get_ticker_quote',
    description:
      'Get the latest price quote for a ticker (price, day change %, day range, volume). Uses simulated data by default; set FMP_API_KEY to pull live quotes.',
    inputSchema: getTickerQuoteSchema
  })
  @Cache({ ttl: 60, key: (input) => `ticker-quote:${(input as { ticker?: string })?.ticker?.toUpperCase() ?? 'unknown'}` })
  async getTickerQuote(rawInput: unknown, ctx: ExecutionContext) {
    const input = getTickerQuoteSchema.parse(rawInput);
    ctx.logger.info('Fetching ticker quote', { ticker: input.ticker });
    return this.marketDataService.getQuote(input.ticker);
  }

  @Tool({
    name: 'compare_tickers',
    description:
      'Compare fundamentals, sentiment, and divergence across 2–8 tickers side-by-side. Useful for screening or choosing between candidates before running a full thesis check.',
    inputSchema: compareTickersSchema
  })
  async compareTickers(rawInput: unknown, ctx: ExecutionContext) {
    const input = compareTickersSchema.parse(rawInput);
    const tickers = input.tickers.map((t) => t.toUpperCase());
    ctx.logger.info('Comparing tickers', { tickers });

    const comparisons = await Promise.all(
      tickers.map(async (ticker) => {
        const snapshot = await this.marketDataService.getMarketSnapshot(ticker);
        const quote = await this.marketDataService.getQuote(ticker);
        return { ticker, quote, ...snapshot };
      })
    );

    const rankedByFundamentals = [...comparisons].sort(
      (a, b) => a.fundamentals.fundamentalsScore - b.fundamentals.fundamentalsScore
    );
    const rankedBySentiment = [...comparisons].sort(
      (a, b) => b.sentiment.sentimentScore - a.sentiment.sentimentScore
    );

    return {
      tickers,
      comparisons,
      summary: {
        cheapestFundamentals: rankedByFundamentals[0]?.ticker ?? null,
        richestFundamentals: rankedByFundamentals[rankedByFundamentals.length - 1]?.ticker ?? null,
        mostPositiveSentiment: rankedBySentiment[0]?.ticker ?? null,
        mostNegativeSentiment: rankedBySentiment[rankedBySentiment.length - 1]?.ticker ?? null,
        hypeRiskTickers: comparisons.filter((c) => c.divergence.hypeRisk).map((c) => c.ticker),
        overlookedValueTickers: comparisons.filter((c) => c.divergence.overlookedValue).map((c) => c.ticker)
      }
    };
  }

  @Tool({
    name: 'get_earnings_calendar',
    description:
      'Get the upcoming earnings date, EPS estimate, and prior-quarter EPS surprise for a ticker. Useful to know whether an earnings event is imminent before running a thesis check — earnings within the next 14 days significantly raise event risk.',
    inputSchema: getEarningsCalendarSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  })
  @Cache({ ttl: 900, key: (input) => `earnings-calendar:${(input as { ticker?: string })?.ticker?.toUpperCase() ?? 'unknown'}` })
  async getEarningsCalendar(rawInput: unknown, ctx: ExecutionContext) {
    const input = getEarningsCalendarSchema.parse(rawInput);
    ctx.logger.info('Fetching earnings calendar', { ticker: input.ticker });
    return this.marketDataService.getEarningsCalendar(input.ticker.toUpperCase());
  }

  @Tool({
    name: 'get_news_headlines',
    description:
      'Fetch recent news headlines for a ticker with a polarity tag (positive / neutral / negative) derived from the headline text. Returns up to 10 headlines in reverse-chronological order. Uses simulated data by default; set NEWSAPI_KEY to pull live headlines.',
    inputSchema: getNewsHeadlinesSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    }
  })
  @Cache({ ttl: 60, key: (input) => `news-headlines:${(input as { ticker?: string })?.ticker?.toUpperCase() ?? 'unknown'}` })
  async getNewsHeadlines(rawInput: unknown, ctx: ExecutionContext) {
    const input = getNewsHeadlinesSchema.parse(rawInput);
    ctx.logger.info('Fetching news headlines', { ticker: input.ticker, limit: input.limit });
    const headlines = await this.marketDataService.getNewsHeadlines(input.ticker.toUpperCase(), input.limit);
    return { ticker: input.ticker.toUpperCase(), headlines, total: headlines.length };
  }

  @Tool({
    name: 'get_risk_metrics',
    description:
      'Get annualized volatility, beta (relative to the broad market), max drawdown over the past year, and a composite risk tier (low / moderate / high / speculative) for a ticker. Run this before a thesis check to understand the inherent risk profile of the name you are considering.',
    inputSchema: getRiskMetricsSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  })
  @Cache({ ttl: 300, key: (input) => `risk-metrics:${(input as { ticker?: string })?.ticker?.toUpperCase() ?? 'unknown'}` })
  async getRiskMetrics(rawInput: unknown, ctx: ExecutionContext) {
    const input = getRiskMetricsSchema.parse(rawInput);
    ctx.logger.info('Fetching risk metrics', { ticker: input.ticker });
    return this.marketDataService.getRiskMetrics(input.ticker.toUpperCase());
  }
}
