export interface Holding {
  ticker: string;
  quantity: number;
  avgCostBasis: number;
  currentPrice: number;
  sector: string;
}

export interface PortfolioState {
  cash: number;
  holdings: Holding[];
  updatedAt: string;
}

export interface PortfolioImpact {
  currentTotalValue: number;
  currentTickerWeightPct: number;
  currentSectorWeightPct: number;
  projectedTickerWeightPct: number;
  projectedSectorWeightPct: number;
  concentrationRisk: 'low' | 'moderate' | 'high';
  explanation: string;
}

export interface HoldingAllocation {
  ticker: string;
  sector: string;
  quantity: number;
  marketValue: number;
  weightPct: number;
  costBasis: number;
  unrealizedGainLoss: number;
  unrealizedGainLossPct: number;
}

export interface SectorAllocation {
  sector: string;
  marketValue: number;
  weightPct: number;
  tickers: string[];
}

export interface PortfolioAllocation {
  totalValue: number;
  cash: number;
  cashWeightPct: number;
  investedValue: number;
  holdings: HoldingAllocation[];
  sectors: SectorAllocation[];
  updatedAt: string;
}

export interface PortfolioRiskContributor {
  ticker: string;
  sector: string;
  weightPct: number;
  /** Estimated beta for this position — sourced from simulated RiskMetrics */
  estimatedBeta: number;
  /** Contribution to portfolio beta = weight × beta */
  betaContribution: number;
}

export interface PortfolioRiskSummary {
  totalValue: number;
  investedValue: number;
  /** Weighted-average beta of the invested portion */
  portfolioBeta: number;
  /** Rough annualized volatility tier of the portfolio as a whole */
  portfolioRiskTier: 'low' | 'moderate' | 'high' | 'speculative';
  portfolioRiskExplanation: string;
  topRiskContributors: PortfolioRiskContributor[];
}

export interface DrawdownScenario {
  /** Market shock as a percentage, e.g. -10 means a 10% market decline */
  shockPct: number;
  /** Estimated dollar loss on the invested portion */
  estimatedLossDollars: number;
  /** Projected portfolio value after the shock */
  projectedPortfolioValue: number;
  /** Projected invested value after the shock */
  projectedInvestedValue: number;
}
