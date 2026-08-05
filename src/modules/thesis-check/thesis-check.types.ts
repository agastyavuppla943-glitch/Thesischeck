import type { BehavioralAnalysis } from '../behavioral/behavioral.types.js';
import type { DivergenceResult, FundamentalsSnapshot, RiskMetrics, SentimentSnapshot } from '../market-data/market-data.types.js';
import type { PortfolioImpact } from '../portfolio/portfolio.types.js';

export type CautionLevel = 'green' | 'yellow' | 'red';

export interface RationaleClaimCheck {
  claimType: 'undervalued' | 'strong_fundamentals' | 'momentum_hype' | 'stable_safe';
  matchedPhrase: string;
  aligned: boolean;
  explanation: string;
}

export interface EvidenceTrailItem {
  dimension: 'behavioral' | 'fundamentals_sentiment' | 'portfolio_risk' | 'rationale_alignment';
  summary: string;
  detail: string;
}

export interface PredictionResult {
  /** Overall directional outlook derived from live data */
  outlook: 'bullish' | 'neutral' | 'bearish';
  /**
   * Composite conviction score 0–100.
   * Higher = stronger data-backed case for the trade.
   * Does NOT imply a buy/sell recommendation.
   */
  convictionScore: number;
  /** Human-readable implied upside or downside vs current price, e.g. "~18% upside to fair value" */
  impliedFairValueVsPrice: string;
  /** Price target range derived from fundamentals + historical volatility. Null if insufficient data. */
  priceTargetRange: { low: number; base: number; high: number } | null;
  /** Data points supporting the trade thesis */
  keyTailwinds: string[];
  /** Data points that cut against the trade thesis or add risk */
  keyRisks: string[];
  /** One-sentence summary of the prediction */
  summary: string;
  disclaimer: string;
}

export interface ThesisCheckResult {
  decisionId: string;
  ticker: string;
  action: 'buy' | 'sell';
  quantity: number;
  statedRationale: string;
  cautionLevel: CautionLevel;
  evidenceTrail: EvidenceTrailItem[];
  behavioral: BehavioralAnalysis;
  fundamentals: FundamentalsSnapshot;
  sentiment: SentimentSnapshot;
  divergence: DivergenceResult;
  portfolioImpact: PortfolioImpact;
  rationaleChecks: RationaleClaimCheck[];
  reflectiveQuestions: string[];
  prediction: PredictionResult;
  disclaimer: string;
}
