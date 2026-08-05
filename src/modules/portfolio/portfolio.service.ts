import { readSingleton, writeSingleton } from '../../shared/storage.js';
import type { DrawdownScenario, Holding, PortfolioAllocation, PortfolioImpact, PortfolioRiskSummary, PortfolioState } from './portfolio.types.js';

/**
 * Deterministic pseudo-random number generator seeded from a string —
 * mirrors the same approach used in MarketDataService so beta estimates
 * are stable per ticker without requiring live API calls.
 */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const SINGLETON_KEY = 'portfolio';

const DEFAULT_PORTFOLIO: PortfolioState = {
  cash: 10000,
  holdings: [],
  updatedAt: new Date(0).toISOString()
};

export class PortfolioService {
  getPortfolio(): PortfolioState {
    return readSingleton<PortfolioState>(SINGLETON_KEY, DEFAULT_PORTFOLIO);
  }

  setPortfolio(state: { cash: number; holdings: Holding[] }): PortfolioState {
    const next: PortfolioState = {
      cash: state.cash,
      holdings: state.holdings.map((h) => ({ ...h, ticker: h.ticker.toUpperCase() })),
      updatedAt: new Date().toISOString()
    };
    writeSingleton(SINGLETON_KEY, next);
    return next;
  }

  private totalValue(portfolio: PortfolioState): number {
    const holdingsValue = portfolio.holdings.reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);
    return portfolio.cash + holdingsValue;
  }

  getAllocation(): PortfolioAllocation {
    const portfolio = this.getPortfolio();
    const totalValue = this.totalValue(portfolio);
    const investedValue = totalValue - portfolio.cash;

    const holdings: PortfolioAllocation['holdings'] = portfolio.holdings.map((h) => {
      const marketValue = h.quantity * h.currentPrice;
      const costBasis = h.quantity * h.avgCostBasis;
      const unrealizedGainLoss = marketValue - costBasis;
      const unrealizedGainLossPct = costBasis > 0 ? (unrealizedGainLoss / costBasis) * 100 : 0;

      return {
        ticker: h.ticker,
        sector: h.sector,
        quantity: h.quantity,
        marketValue: Math.round(marketValue * 100) / 100,
        weightPct: totalValue > 0 ? Math.round((marketValue / totalValue) * 1000) / 10 : 0,
        costBasis: Math.round(costBasis * 100) / 100,
        unrealizedGainLoss: Math.round(unrealizedGainLoss * 100) / 100,
        unrealizedGainLossPct: Math.round(unrealizedGainLossPct * 10) / 10
      };
    });

    const sectorMap = new Map<string, { marketValue: number; tickers: Set<string> }>();
    for (const h of holdings) {
      const existing = sectorMap.get(h.sector) ?? { marketValue: 0, tickers: new Set<string>() };
      existing.marketValue += h.marketValue;
      existing.tickers.add(h.ticker);
      sectorMap.set(h.sector, existing);
    }

    const sectors: PortfolioAllocation['sectors'] = [...sectorMap.entries()]
      .map(([sector, data]) => ({
        sector,
        marketValue: Math.round(data.marketValue * 100) / 100,
        weightPct: totalValue > 0 ? Math.round((data.marketValue / totalValue) * 1000) / 10 : 0,
        tickers: [...data.tickers]
      }))
      .sort((a, b) => b.weightPct - a.weightPct);

    return {
      totalValue: Math.round(totalValue * 100) / 100,
      cash: portfolio.cash,
      cashWeightPct: totalValue > 0 ? Math.round((portfolio.cash / totalValue) * 1000) / 10 : 0,
      investedValue: Math.round(investedValue * 100) / 100,
      holdings: holdings.sort((a, b) => b.weightPct - a.weightPct),
      sectors,
      updatedAt: portfolio.updatedAt
    };
  }

  /**
   * Computes how a proposed trade would shift ticker- and sector-level
   * concentration. Correctly isolates "value held outside the position/sector
   * in question" before adding the proposed trade's incremental value, so
   * the position's own current value is never counted twice.
   */
  computeImpact(input: {
    ticker: string;
    sector: string;
    action: 'buy' | 'sell';
    quantity: number;
    price: number;
  }): PortfolioImpact {
    const portfolio = this.getPortfolio();
    const ticker = input.ticker.toUpperCase();
    const tradeValue = input.quantity * input.price;

    const currentTotalValue = this.totalValue(portfolio);

    const existingTickerHolding = portfolio.holdings.find((h) => h.ticker === ticker);
    const existingTickerValue = existingTickerHolding
      ? existingTickerHolding.quantity * existingTickerHolding.currentPrice
      : 0;

    const existingSectorValue = portfolio.holdings
      .filter((h) => h.sector.toLowerCase() === input.sector.toLowerCase())
      .reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);

    // Value held OUTSIDE this ticker, computed once so we never double-count
    // the position's own current value when adding the trade.
    const otherHoldingsValueExcludingTicker = currentTotalValue - existingTickerValue - portfolio.cash;

    const signedTradeValue = input.action === 'buy' ? tradeValue : -tradeValue;

    const projectedTickerValue = Math.max(0, existingTickerValue + signedTradeValue);
    const projectedSectorValue = Math.max(0, existingSectorValue + signedTradeValue);

    // Cash moves opposite to a buy/sell of the position itself.
    const projectedCash = input.action === 'buy' ? portfolio.cash - tradeValue : portfolio.cash + tradeValue;
    const projectedTotalValue = Math.max(
      0,
      otherHoldingsValueExcludingTicker + projectedTickerValue + projectedCash
    );

    const currentTickerWeightPct = currentTotalValue > 0 ? (existingTickerValue / currentTotalValue) * 100 : 0;
    const currentSectorWeightPct = currentTotalValue > 0 ? (existingSectorValue / currentTotalValue) * 100 : 0;
    const projectedTickerWeightPct =
      projectedTotalValue > 0 ? (projectedTickerValue / projectedTotalValue) * 100 : 0;
    const projectedSectorWeightPct =
      projectedTotalValue > 0 ? (projectedSectorValue / projectedTotalValue) * 100 : 0;

    let concentrationRisk: PortfolioImpact['concentrationRisk'] = 'low';
    if (projectedTickerWeightPct >= 25 || projectedSectorWeightPct >= 40) {
      concentrationRisk = 'high';
    } else if (projectedTickerWeightPct >= 15 || projectedSectorWeightPct >= 25) {
      concentrationRisk = 'moderate';
    }

    const explanation =
      concentrationRisk === 'high'
        ? `This trade would push ${ticker} to ${projectedTickerWeightPct.toFixed(1)}% of the portfolio (or its sector to ${projectedSectorWeightPct.toFixed(1)}%) — a concentrated bet that raises single-position/sector risk considerably.`
        : concentrationRisk === 'moderate'
        ? `This trade brings ${ticker} to ${projectedTickerWeightPct.toFixed(1)}% of the portfolio, a meaningful but not extreme allocation.`
        : `This trade keeps ${ticker} at a modest ${projectedTickerWeightPct.toFixed(1)}% of the portfolio — concentration risk stays low.`;

    return {
      currentTotalValue,
      currentTickerWeightPct: Math.round(currentTickerWeightPct * 10) / 10,
      currentSectorWeightPct: Math.round(currentSectorWeightPct * 10) / 10,
      projectedTickerWeightPct: Math.round(projectedTickerWeightPct * 10) / 10,
      projectedSectorWeightPct: Math.round(projectedSectorWeightPct * 10) / 10,
      concentrationRisk,
      explanation
    };
  }

  getRiskSummary(): PortfolioRiskSummary {
    const portfolio = this.getPortfolio();
    const totalValue = this.totalValue(portfolio);
    const investedValue = totalValue - portfolio.cash;

    if (portfolio.holdings.length === 0) {
      return {
        totalValue: Math.round(totalValue * 100) / 100,
        investedValue: 0,
        portfolioBeta: 0,
        portfolioRiskTier: 'low',
        portfolioRiskExplanation: 'Portfolio has no holdings — risk summary will populate once positions are added.',
        topRiskContributors: []
      };
    }

    // Estimate per-holding beta using the same seeded-random approach as MarketDataService
    // so values are stable and consistent with get_risk_metrics for the same ticker.
    const contributors = portfolio.holdings.map((h) => {
      const rand = seededRandom(`risk:${h.ticker.toUpperCase()}`);
      rand(); // skip annualizedVolatility draw to stay in sync with simulateRiskMetrics
      const beta = Math.round((0.3 + rand() * 2.0) * 100) / 100;
      const marketValue = h.quantity * h.currentPrice;
      const weightPct = investedValue > 0 ? (marketValue / investedValue) * 100 : 0;
      return {
        ticker: h.ticker,
        sector: h.sector,
        weightPct: Math.round(weightPct * 10) / 10,
        estimatedBeta: beta,
        betaContribution: Math.round((weightPct / 100) * beta * 100) / 100
      };
    });

    const portfolioBeta = Math.round(contributors.reduce((sum, c) => sum + c.betaContribution, 0) * 100) / 100;
    const topRiskContributors = [...contributors].sort((a, b) => b.betaContribution - a.betaContribution).slice(0, 5);

    let portfolioRiskTier: PortfolioRiskSummary['portfolioRiskTier'];
    let portfolioRiskExplanation: string;

    if (portfolioBeta >= 1.8) {
      portfolioRiskTier = 'speculative';
      portfolioRiskExplanation = `Portfolio beta of ${portfolioBeta} is well above the market — in a broad market decline, losses could be significantly amplified. Consider reviewing your highest-beta positions.`;
    } else if (portfolioBeta >= 1.3) {
      portfolioRiskTier = 'high';
      portfolioRiskExplanation = `Portfolio beta of ${portfolioBeta} is above the market — the portfolio tends to move more than the index in both directions.`;
    } else if (portfolioBeta >= 0.8) {
      portfolioRiskTier = 'moderate';
      portfolioRiskExplanation = `Portfolio beta of ${portfolioBeta} is broadly market-like — expect gains and losses roughly in line with the broader index.`;
    } else {
      portfolioRiskTier = 'low';
      portfolioRiskExplanation = `Portfolio beta of ${portfolioBeta} is below the market — the portfolio is relatively defensive and tends to move less than the index.`;
    }

    return {
      totalValue: Math.round(totalValue * 100) / 100,
      investedValue: Math.round(investedValue * 100) / 100,
      portfolioBeta,
      portfolioRiskTier,
      portfolioRiskExplanation,
      topRiskContributors
    };
  }

  getDrawdownScenarios(shockPcts: number[]): { portfolioBeta: number; scenarios: DrawdownScenario[] } {
    const portfolio = this.getPortfolio();
    const totalValue = this.totalValue(portfolio);
    const investedValue = totalValue - portfolio.cash;
    const riskSummary = this.getRiskSummary();
    const portfolioBeta = riskSummary.portfolioBeta;

    const scenarios: DrawdownScenario[] = shockPcts.map((shockPct) => {
      // Scale the shock by portfolio beta — a beta-1.5 portfolio loses ~1.5x the index shock
      const effectiveShock = (shockPct / 100) * portfolioBeta;
      const estimatedLossDollars = Math.round(investedValue * effectiveShock * 100) / 100;
      const projectedInvestedValue = Math.round(Math.max(0, investedValue + estimatedLossDollars) * 100) / 100;
      const projectedPortfolioValue = Math.round(Math.max(0, portfolio.cash + projectedInvestedValue) * 100) / 100;

      return {
        shockPct,
        estimatedLossDollars,
        projectedPortfolioValue,
        projectedInvestedValue
      };
    });

    return { portfolioBeta, scenarios };
  }
}
