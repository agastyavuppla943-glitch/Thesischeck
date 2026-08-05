import {
  ToolDecorator as Tool,
  Widget,
  UseGuards,
  UseMiddleware,
  ExecutionContext,
  Cache,
  z
} from '@nitrostack/core';
import { ThesisCheckService } from './thesis-check.service.js';
import { AdvisoryOnlyGuard } from './thesis-check.guard.js';
import { AuditLogMiddleware } from './thesis-check.middleware.js';

const evaluateTradeThesisSchema = z
  .object({
    ticker: z.string().min(1).describe('Ticker symbol, e.g. AAPL'),
    action: z.enum(['buy', 'sell']).describe('Whether this is a buy or a sell'),
    quantity: z.number().positive().describe('Number of shares'),
    price: z.number().positive().describe('Price per share at which the trade is being considered'),
    sector: z.string().min(1).describe('Sector/industry of the company, e.g. Technology'),
    statedRationale: z
      .string()
      .min(1)
      .describe("The investor's own stated reason for making this trade, in their own words"),
    emotionalState: z
      .enum(['calm', 'anxious', 'excited', 'fearful', 'frustrated', 'confident', 'unsure'])
      .describe('How the investor describes feeling about this trade right now'),
    recentPriceChangePct: z
      .number()
      .optional()
      .describe('Optional: recent price change as a decimal, e.g. -0.12 for -12%'),
    upcomingEarningsWithinDays: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Optional: number of days until the next earnings release, if known. When provided, the thesis check will flag elevated event risk for values ≤ 14.'
      )
  })
  .strict();

const preflightSchema = z
  .object({
    ticker: z.string().min(1).describe('Ticker symbol to run the preflight check on, e.g. AAPL'),
    headlineLimit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe('How many recent headlines to include in the preflight (1–10, default 5)')
  })
  .strict();

export class ThesisCheckTools {
  private readonly thesisCheckService = new ThesisCheckService();

  @Tool({
    name: 'evaluate_trade_thesis',
    description:
      "Advisory-only check run before a trade is confirmed. Evaluates the investor's own stated reasoning against their behavioral history, real fundamentals/sentiment data, and portfolio concentration impact. Returns a caution level, a transparent evidence trail, and reflective questions — never a buy/sell recommendation, and never executes anything.",
    inputSchema: evaluateTradeThesisSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    examples: {
      request: {
        ticker: 'ACME',
        action: 'buy',
        quantity: 10,
        price: 42.5,
        sector: 'Technology',
        statedRationale: 'Everyone is talking about it and I don\'t want to miss out',
        emotionalState: 'excited'
      }
    }
  })
  @UseGuards(AdvisoryOnlyGuard)
  @UseMiddleware(AuditLogMiddleware)
  @Widget('thesis-check-result')
  async evaluateTradeThesis(rawInput: unknown, ctx: ExecutionContext) {
    // NitroStack advertises `inputSchema` to clients as JSON Schema but does
    // NOT automatically validate incoming calls against it at runtime — so
    // the `.strict()` rejection of unexpected fields (e.g. an injected
    // execution-intent flag) has to be enforced explicitly here.
    const input = evaluateTradeThesisSchema.parse(rawInput);
    ctx.logger.info('Evaluating trade thesis', { ticker: input.ticker, action: input.action });

    if (input.upcomingEarningsWithinDays !== undefined) {
      ctx.logger.info('Earnings timing noted', { daysUntilEarnings: input.upcomingEarningsWithinDays });
    }

    return this.thesisCheckService.evaluate(input);
  }

  @Tool({
    name: 'get_thesis_check_preflight',
    description:
      'Run a pre-flight check before evaluate_trade_thesis. Fetches the current quote, risk metrics (volatility, beta, drawdown), upcoming earnings date, and recent news headlines for a ticker — all in one call. Returns a consolidated snapshot plus a list of warnings (e.g. imminent earnings, high risk tier, hype divergence, negative headlines) and a readyForThesisCheck flag.',
    inputSchema: preflightSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    examples: {
      request: { ticker: 'NVDA', headlineLimit: 5 }
    }
  })
  @Cache({ ttl: 60, key: (input) => `preflight:${(input as { ticker?: string })?.ticker?.toUpperCase() ?? 'unknown'}` })
  async getThesisCheckPreflight(rawInput: unknown, ctx: ExecutionContext) {
    const input = preflightSchema.parse(rawInput);
    ctx.logger.info('Running thesis-check preflight', { ticker: input.ticker });
    return this.thesisCheckService.preflight(input.ticker, input.headlineLimit);
  }
}
