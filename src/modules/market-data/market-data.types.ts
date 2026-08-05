export interface FundamentalsSnapshot {
  ticker: string;
  source: 'financial-modeling-prep';
  peRatio: number | null;
  revenueGrowthYoY: number | null;
  profitMarginPct: number | null;
  debtToEquity: number | null;
  /** 0 (deeply undervalued-looking) to 100 (deeply overvalued-looking), fundamentals-only */
  fundamentalsScore: number;
}

// ── Catalyst types (company-level news) ──────────────────────────────────────

export type CatalystType =
  | 'product_launch'
  | 'earnings_event'
  | 'partnership'
  | 'government_contract'
  | 'buyback'
  | 'product_recall'
  | 'regulatory'
  | 'leadership_change'
  | 'expansion'
  | 'none';

export interface DetectedCatalyst {
  type: Exclude<CatalystType, 'none'>;
  /** Positive catalysts add to conviction; negative reduce it */
  polarity: 'positive' | 'negative' | 'neutral';
  headline: string;
  publishedAt: string;
}

export interface SentimentSnapshot {
  ticker: string;
  source: 'newsapi';
  /** -100 (very negative) to 100 (very positive) */
  sentimentScore: number;
  socialMentionVolume: 'low' | 'normal' | 'elevated' | 'spiking';
  headlineSample: string[];
  /** Structured catalysts detected from recent headlines */
  detectedCatalysts: DetectedCatalyst[];
}

export interface DivergenceResult {
  ticker: string;
  fundamentalsScore: number;
  sentimentScore: number;
  /** Normalized sentiment onto the same 0-100 "richness" scale as fundamentalsScore */
  normalizedSentimentScore: number;
  divergence: number;
  hypeRisk: boolean;
  overlookedValue: boolean;
  interpretation: string;
}

export interface TickerQuote {
  ticker: string;
  source: 'financial-modeling-prep';
  price: number;
  changePct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
}

export interface EarningsCalendar {
  ticker: string;
  source: 'financial-modeling-prep';
  nextEarningsDate: string | null;
  /** Estimated EPS for the upcoming quarter */
  epsEstimate: number | null;
  /** EPS surprise from the prior quarter as a percentage, e.g. 5.2 means beat by 5.2% */
  priorQuarterEpsSurprisePct: number | null;
  /** How many calendar days until the next earnings release (null if unknown) */
  daysUntilEarnings: number | null;
  /** True if earnings are within the next 14 days */
  earningsImminent: boolean;
}

export interface NewsHeadline {
  title: string;
  publishedAt: string;
  source: string;
  /** Simple polarity tag derived from headline text */
  polarity: 'positive' | 'neutral' | 'negative';
  /** Catalyst category detected from headline text */
  catalystType: CatalystType;
  url: string | null;
}

export interface RiskMetrics {
  ticker: string;
  source: 'financial-modeling-prep';
  /** Annualized price volatility as a percentage, e.g. 32.5 = 32.5% */
  annualizedVolatilityPct: number;
  /** Beta relative to the broad market (1.0 = market-like) */
  beta: number;
  /** Worst peak-to-trough drawdown over the past year as a negative percentage, e.g. -28.4 */
  maxDrawdownPct: number;
  /** Composite risk tier */
  riskTier: 'low' | 'moderate' | 'high' | 'speculative';
  riskTierExplanation: string;
}

// ── Geopolitical signals ─────────────────────────────────────────────────────

export type GeopoliticalEventType =
  | 'war'
  | 'sanctions'
  | 'trade_conflict'
  | 'diplomatic_tension'
  | 'natural_disaster'
  | 'political_crisis';

export interface GeopoliticalSignal {
  type: GeopoliticalEventType;
  severity: 'low' | 'medium' | 'high';
  headline: string;
  description: string;
}

// ── Market & macro conditions ─────────────────────────────────────────────────

export interface MarketConditions {
  // ── Broad market ──
  /** Overall broad market direction based on SPY day change */
  marketTrend: 'bullish' | 'neutral' | 'bearish';
  /** S&P 500 (SPY) day change percentage */
  spyChangePct: number | null;

  // ── Fear gauge ──
  /** CBOE Volatility Index level */
  vixLevel: number | null;
  /** VIX regime: calm <15, elevated 15-25, fearful >25 */
  vixRegime: 'calm' | 'elevated' | 'fearful';

  // ── Sector ──
  /** Sector ETF ticker used for comparison, e.g. XLK for Technology */
  sectorEtf: string | null;
  /** Sector ETF day change percentage */
  sectorChangePct: number | null;
  /** How the sector is performing relative to the broad market */
  sectorTrend: 'outperforming' | 'inline' | 'underperforming' | null;

  // ── Commodities & macro ──
  /** Crude oil day change percentage (USOIL). Spikes can disrupt supply chains and margins. */
  oilChangePct: number | null;
  /** 10-Year Treasury yield level (proxy via ^TNX). Higher = headwind for growth stocks. */
  yieldLevel: number | null;
  /** Whether yields are trending up, stable, or down (vs prior close) */
  yieldTrend: 'rising' | 'stable' | 'falling' | null;
  /** US Dollar index day change (DXY). Strengthening dollar hurts international revenue. */
  dollarChangePct: number | null;

  // ── Geopolitical ──
  /** Composite geopolitical risk level derived from recent news */
  geopoliticalRisk: 'low' | 'elevated' | 'high';
  /** Individual geopolitical events detected from global news scan */
  geopoliticalSignals: GeopoliticalSignal[];

  // ── Synthesized signals ──
  /** Plain-language macro/external tailwinds */
  macroTailwinds: string[];
  /** Plain-language macro/external headwinds */
  macroHeadwinds: string[];
}
