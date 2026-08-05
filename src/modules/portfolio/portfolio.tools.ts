import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { PortfolioService } from './portfolio.service.js';

const holdingSchema = z
  .object({
    ticker: z.string().describe('Ticker symbol, e.g. AAPL'),
    quantity: z.number().positive().describe('Number of shares held'),
    avgCostBasis: z.number().nonnegative().describe('Average cost basis per share'),
    currentPrice: z.number().positive().describe('Current market price per share'),
    sector: z.string().describe('Sector/industry, e.g. Technology')
  })
  .strict();

const setPortfolioSchema = z
  .object({
    cash: z.number().nonnegative().describe('Cash balance available'),
    holdings: z.array(holdingSchema).describe('Full list of current holdings (replaces prior list)')
  })
  .strict();

const simulateTradeImpactSchema = z
  .object({
    ticker: z.string().min(1).describe('Ticker symbol, e.g. AAPL'),
    action: z.enum(['buy', 'sell']).describe('Whether this is a buy or a sell'),
    quantity: z.number().positive().describe('Number of shares'),
    price: z.number().positive().describe('Price per share for the proposed trade'),
    sector: z.string().min(1).describe('Sector/industry of the company, e.g. Technology')
  })
  .strict();

const getDrawdownScenariosSchema = z
  .object({
    shockPcts: z
      .array(z.number().min(-100).max(-1))
      .min(1)
      .max(10)
      .default([-10, -20, -30])
      .describe(
        'List of negative market-shock percentages to model, e.g. [-10, -20, -30] for -10%, -20%, -30% scenarios. Must be between -1 and -100.'
      )
  })
  .strict();

export class PortfolioTools {
  private readonly portfolioService = new PortfolioService();

  @Tool({
    name: 'get_portfolio',
    description: "Get the investor's current cash balance and holdings.",
    inputSchema: z.object({}).strict()
  })
  async getPortfolio(_input: unknown, ctx: ExecutionContext) {
    ctx.logger.info('Fetching portfolio');
    return this.portfolioService.getPortfolio();
  }

  @Tool({
    name: 'set_portfolio',
    description:
      'Set (replace) the cash balance and holdings on record. Use this to initialize or update the portfolio snapshot ThesisCheck uses for concentration-risk calculations.',
    inputSchema: setPortfolioSchema
  })
  async setPortfolio(rawInput: unknown, ctx: ExecutionContext) {
    // inputSchema is advertised to clients but not auto-enforced by
    // NitroStack at runtime, so validate explicitly.
    const input = setPortfolioSchema.parse(rawInput);
    ctx.logger.info('Updating portfolio snapshot', { holdingCount: input.holdings.length });
    return this.portfolioService.setPortfolio(input);
  }

  @Tool({
    name: 'get_portfolio_allocation',
    description:
      'Get a breakdown of the current portfolio: total value, cash vs invested, per-holding weights, unrealized P&L, and sector concentration.',
    inputSchema: z.object({}).strict()
  })
  async getPortfolioAllocation(_input: unknown, ctx: ExecutionContext) {
    ctx.logger.info('Fetching portfolio allocation');
    return this.portfolioService.getAllocation();
  }

  @Tool({
    name: 'simulate_trade_impact',
    description:
      'Preview how a proposed buy or sell would affect portfolio concentration (ticker and sector weights) without logging a decision or running a full thesis check.',
    inputSchema: simulateTradeImpactSchema
  })
  async simulateTradeImpact(rawInput: unknown, ctx: ExecutionContext) {
    const input = simulateTradeImpactSchema.parse(rawInput);
    ctx.logger.info('Simulating trade impact', { ticker: input.ticker, action: input.action });
    const impact = this.portfolioService.computeImpact(input);
    const tradeValue = input.quantity * input.price;
    return {
      ...impact,
      proposedTrade: {
        ticker: input.ticker.toUpperCase(),
        action: input.action,
        quantity: input.quantity,
        price: input.price,
        tradeValue: Math.round(tradeValue * 100) / 100
      }
    };
  }

  @Tool({
    name: 'get_portfolio_risk_summary',
    description:
      'Get a weighted risk summary of the current portfolio: blended portfolio beta, overall risk tier (low / moderate / high / speculative), and the top positions contributing most to portfolio risk. Beta estimates are derived from the same simulated data source as get_risk_metrics, so they are consistent across tools.',
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  })
  async getPortfolioRiskSummary(_input: unknown, ctx: ExecutionContext) {
    ctx.logger.info('Fetching portfolio risk summary');
    return this.portfolioService.getRiskSummary();
  }

  @Tool({
    name: 'get_drawdown_scenarios',
    description:
      'Show how much the portfolio would lose under a set of market-shock scenarios (e.g. −10%, −20%, −30%). Loss estimates are scaled by the portfolio\'s weighted-average beta, so a high-beta portfolio shows larger losses than a low-beta one under the same market move. Cash is excluded — only the invested portion is shocked.',
    inputSchema: getDrawdownScenariosSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    examples: {
      request: { shockPcts: [-10, -20, -30, -50] }
    }
  })
  async getDrawdownScenarios(rawInput: unknown, ctx: ExecutionContext) {
    const input = getDrawdownScenariosSchema.parse(rawInput);
    ctx.logger.info('Computing drawdown scenarios', { shockPcts: input.shockPcts });
    return this.portfolioService.getDrawdownScenarios(input.shockPcts);
  }
}
