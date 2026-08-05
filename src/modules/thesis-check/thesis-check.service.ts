import { BehavioralService } from '../behavioral/behavioral.service.js';
import type { EmotionalState, TradeAction } from '../behavioral/behavioral.types.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import type { DivergenceResult, FundamentalsSnapshot, MarketConditions, RiskMetrics, SentimentSnapshot } from '../market-data/market-data.types.js';
import { PortfolioService } from '../portfolio/portfolio.service.js';
import type { PortfolioImpact } from '../portfolio/portfolio.types.js';
import type { EvidenceTrailItem, PredictionResult, RationaleClaimCheck, ThesisCheckResult } from './thesis-check.types.js';


interface ClaimDefinition {
  claimType: RationaleClaimCheck['claimType'];
  phrases: string[];
}

const CLAIM_DEFINITIONS: ClaimDefinition[] = [
  {
    claimType: 'undervalued',
    phrases: ['undervalued', 'cheap', 'bargain', 'discount', 'value play', 'low pe']
  },
  {
    claimType: 'strong_fundamentals',
    phrases: ['strong fundamentals', 'great fundamentals', 'solid earnings', 'strong growth', 'profitable', 'revenue growth']
  },
  {
    claimType: 'momentum_hype',
    phrases: ['trending', 'momentum', 'hot stock', 'everyone is talking', 'going viral', 'breakout']
  },
  {
    claimType: 'stable_safe',
    phrases: ['safe', 'stable', 'low risk', 'blue chip', 'defensive']
  }
];

export interface EvaluateTradeThesisInput {
  ticker: string;
  action: TradeAction;
  quantity: number;
  price: number;
  sector: string;
  statedRationale: string;
  emotionalState: EmotionalState;
  recentPriceChangePct?: number;
  upcomingEarningsWithinDays?: number;
}

export class ThesisCheckService {
  private readonly behavioralService = new BehavioralService();
  private readonly marketDataService = new MarketDataService();
  private readonly portfolioService = new PortfolioService();

  async evaluate(input: EvaluateTradeThesisInput): Promise<ThesisCheckResult> {
    const ticker = input.ticker.toUpperCase();

    // 1. Record decision and analyze behavioral history
    const decision = this.behavioralService.recordDecision({
      ticker,
      action: input.action,
      quantity: input.quantity,
      statedRationale: input.statedRationale,
      emotionalState: input.emotionalState
    });

    const behavioral = this.behavioralService.analyze({
      ticker,
      action: input.action,
      statedRationale: input.statedRationale,
      emotionalState: input.emotionalState,
      recentPriceChangePct: input.recentPriceChangePct
    });

    // 2. Fetch all live market data in parallel
    const [fundamentals, sentiment, quote, riskMetrics, marketConditions] = await Promise.all([
      this.marketDataService.getFundamentals(ticker),
      this.marketDataService.getSentiment(ticker),
      this.marketDataService.getQuote(ticker),
      this.marketDataService.getRiskMetrics(ticker),
      this.marketDataService.getMarketConditions(input.sector)
    ]);

    const divergence = this.marketDataService.computeDivergence(fundamentals, sentiment);

    // 3. Portfolio concentration impact (uses user-stated price for position sizing)
    const portfolioImpact = this.portfolioService.computeImpact({
      ticker,
      sector: input.sector,
      action: input.action,
      quantity: input.quantity,
      price: input.price
    });

    // 4. Check whether stated rationale aligns with live data
    const rationaleChecks = this.checkRationaleAlignment(input.statedRationale, fundamentals.fundamentalsScore, sentiment);

    // 5. Roll everything up into caution level, evidence trail, reflective questions, and prediction
    const cautionLevel = this.computeCautionLevel(behavioral.flags, divergence, portfolioImpact, rationaleChecks);
    const evidenceTrail = this.buildEvidenceTrail(behavioral, sentiment, divergence, portfolioImpact, rationaleChecks);
    const reflectiveQuestions = this.buildReflectiveQuestions(behavioral, divergence, portfolioImpact, rationaleChecks, input);
    const prediction = this.buildPrediction(ticker, quote.price, fundamentals, sentiment, divergence, riskMetrics, behavioral, portfolioImpact, input.action, marketConditions);


    return {
      decisionId: decision.id,
      ticker,
      action: input.action,
      quantity: input.quantity,
      statedRationale: input.statedRationale,
      cautionLevel,
      evidenceTrail,
      behavioral,
      fundamentals,
      sentiment,
      divergence,
      portfolioImpact,
      rationaleChecks,
      reflectiveQuestions,
      prediction,
      disclaimer:
        'ThesisCheck is advisory only. It never places, modifies, or cancels trades — it only reflects your own stated reasoning back against your history, market data, and portfolio impact. The final decision, and its consequences, remain entirely yours.'
    };
  }

  // ── Prediction ───────────────────────────────────────────────────────────────

  private buildPrediction(
    ticker: string,
    livePrice: number,
    fundamentals: FundamentalsSnapshot,
    sentiment: SentimentSnapshot,
    divergence: DivergenceResult,
    riskMetrics: RiskMetrics,
    behavioral: ThesisCheckResult['behavioral'],
    portfolioImpact: PortfolioImpact,
    action: 'buy' | 'sell',
    marketConditions: MarketConditions
  ): PredictionResult {

    // ── Conviction score (0–100) ─────────────────────────────────────────────
    // Start neutral, adjust based on data signals.
    let conviction = 50;

    // Strong fundamentals → tailwind
    if (fundamentals.fundamentalsScore < 35) conviction += 20;
    else if (fundamentals.fundamentalsScore > 65) conviction -= 15;

    // Hype risk → strong headwind for a buy thesis
    if (divergence.hypeRisk && action === 'buy') conviction -= 20;
    // Overlooked value → tailwind for a buy thesis
    if (divergence.overlookedValue && action === 'buy') conviction += 12;

    // Behavioral flags → reduce conviction
    conviction -= behavioral.flags.filter((f) => f.severity === 'high').length * 15;
    conviction -= behavioral.flags.filter((f) => f.severity === 'medium').length * 8;

    // Concentration risk → headwind
    if (portfolioImpact.concentrationRisk === 'high') conviction -= 15;
    else if (portfolioImpact.concentrationRisk === 'moderate') conviction -= 7;

    // Speculative/high risk tier → headwind
    if (riskMetrics.riskTier === 'speculative') conviction -= 10;
    else if (riskMetrics.riskTier === 'high') conviction -= 5;

    // Positive sentiment, no hype distortion → small tailwind
    if (sentiment.sentimentScore > 30 && !divergence.hypeRisk) conviction += 8;

    // Catalyst scoring — use polarity, with type-specific weights
    for (const catalyst of sentiment.detectedCatalysts) {
      if (catalyst.type === 'government_contract') conviction += 10;
      else if (catalyst.type === 'buyback') conviction += 7;
      else if (catalyst.type === 'product_launch') conviction += 8;
      else if (catalyst.type === 'partnership') conviction += 6;
      else if (catalyst.type === 'expansion') conviction += 5;
      else if (catalyst.type === 'product_recall') conviction -= 12;
      else if (catalyst.type === 'regulatory') conviction -= 8;
      else if (catalyst.polarity === 'positive') conviction += 4;
      else if (catalyst.polarity === 'negative') conviction -= 4;
    }

    // ── External / macro conditions ─────────────────────────────────────
    // Broad market trend
    if (marketConditions.marketTrend === 'bullish') conviction += 5;
    else if (marketConditions.marketTrend === 'bearish') conviction -= 10;

    // Fear gauge
    if (marketConditions.vixRegime === 'fearful') conviction -= 10;
    else if (marketConditions.vixRegime === 'calm') conviction += 5;

    // Sector momentum
    if (marketConditions.sectorTrend === 'outperforming') conviction += 7;
    else if (marketConditions.sectorTrend === 'underperforming') conviction -= 8;

    // Oil shock (hurts non-energy sectors)
    if (marketConditions.oilChangePct != null && marketConditions.oilChangePct > 3) conviction -= 6;

    // Rising treasury yields (headwind for growth/tech stocks)
    if (marketConditions.yieldTrend === 'rising') conviction -= 7;
    else if (marketConditions.yieldTrend === 'falling') conviction += 5;

    // Dollar strength (headwind for multinationals)
    if (marketConditions.dollarChangePct != null && marketConditions.dollarChangePct > 0.5) conviction -= 5;

    // Geopolitical signals — severity-weighted
    for (const signal of marketConditions.geopoliticalSignals) {
      if (signal.type === 'war') conviction -= 15;
      else if (signal.type === 'sanctions') conviction -= 12;
      else if (signal.type === 'trade_conflict') conviction -= 8;
      else if (signal.type === 'diplomatic_tension') conviction -= 5;
      else if (signal.type === 'political_crisis') conviction -= 6;
      else if (signal.type === 'natural_disaster') conviction -= 4;
    }

    conviction = Math.round(Math.max(0, Math.min(100, conviction)));

    // ── Outlook ─────────────────────────────────────────────────────────────
    let outlook: PredictionResult['outlook'];
    if (conviction >= 60 && !divergence.hypeRisk) {
      outlook = 'bullish';
    } else if (conviction < 35 || (divergence.hypeRisk && portfolioImpact.concentrationRisk === 'high')) {
      outlook = 'bearish';
    } else {
      outlook = 'neutral';
    }

    // ── Implied fair value vs live price ────────────────────────────────────
    // Map fundamentalsScore (0=cheap, 100=expensive) onto an implied upside/downside.
    // Score 50 = fairly valued (0% implied move), score 0 = ~+30% upside, score 100 = ~-30% downside.
    const impliedUpsidePct = Math.round((50 - fundamentals.fundamentalsScore) * 0.6);
    let impliedFairValueVsPrice: string;
    if (impliedUpsidePct > 5) {
      impliedFairValueVsPrice = `~${impliedUpsidePct}% upside to fundamentals-implied fair value`;
    } else if (impliedUpsidePct < -5) {
      impliedFairValueVsPrice = `~${Math.abs(impliedUpsidePct)}% downside risk — stock appears rich vs fundamentals`;
    } else {
      impliedFairValueVsPrice = 'Broadly fairly valued relative to fundamentals';
    }

    // ── Price target range ───────────────────────────────────────────────────
    // Base = live price × (1 + implied upside). Band = ±(half-year vol).
    let priceTargetRange: PredictionResult['priceTargetRange'] = null;
    if (livePrice > 0) {
      const base = Math.round(livePrice * (1 + impliedUpsidePct / 100) * 100) / 100;
      const volBand = riskMetrics.annualizedVolatilityPct / 100 / 2; // half-year vol as band
      priceTargetRange = {
        low: Math.round(base * (1 - volBand) * 100) / 100,
        base,
        high: Math.round(base * (1 + volBand) * 100) / 100
      };
    }

    // ── Key tailwinds ────────────────────────────────────────────────────────
    const keyTailwinds: string[] = [];
    if (fundamentals.fundamentalsScore < 40) {
      keyTailwinds.push(`Strong fundamentals (score ${fundamentals.fundamentalsScore.toFixed(0)}/100 — lower means cheaper/stronger)`);
    }
    if (fundamentals.revenueGrowthYoY != null && fundamentals.revenueGrowthYoY > 15) {
      keyTailwinds.push(`Revenue growing ${fundamentals.revenueGrowthYoY}% YoY`);
    }
    if (fundamentals.profitMarginPct != null && fundamentals.profitMarginPct > 15) {
      keyTailwinds.push(`Healthy profit margin of ${fundamentals.profitMarginPct.toFixed(1)}%`);
    }
    if (sentiment.sentimentScore > 20 && !divergence.hypeRisk) {
      keyTailwinds.push(`Positive market sentiment (score ${sentiment.sentimentScore}/100) without excessive hype distortion`);
    }
    if (divergence.overlookedValue) {
      keyTailwinds.push('Market sentiment appears to be underrating the fundamentals — potential overlooked value opportunity');
    }
    if (behavioral.flags.length === 0) {
      keyTailwinds.push('No impulsive-behavior flags — reads as a deliberate, unhurried decision');
    }
    // Surface macro tailwinds
    keyTailwinds.push(...marketConditions.macroTailwinds);
    if (keyTailwinds.length === 0) {
      keyTailwinds.push('No strong data-backed tailwinds identified at current levels');
    }

    // ── Key risks ────────────────────────────────────────────────────────────
    const keyRisks: string[] = [];
    // Catalyst polarity — positive types boost tailwinds, negative types add risks
    for (const catalyst of sentiment.detectedCatalysts) {
      if (catalyst.polarity === 'positive') {
        const label = catalyst.type.replace(/_/g, ' ');
        keyTailwinds.push(`${label.charAt(0).toUpperCase() + label.slice(1)} detected: "${catalyst.headline}"`);
      } else if (catalyst.polarity === 'negative') {
        const label = catalyst.type.replace(/_/g, ' ');
        keyRisks.push(`${label.charAt(0).toUpperCase() + label.slice(1)} detected: "${catalyst.headline}"`);
      }
    }
    if (divergence.hypeRisk) {
      keyRisks.push(`Sentiment is ${divergence.divergence.toFixed(0)} points ahead of fundamentals — elevated hype risk`);
    }
    if (riskMetrics.riskTier === 'speculative' || riskMetrics.riskTier === 'high') {
      keyRisks.push(`${riskMetrics.riskTier} risk tier — ${riskMetrics.annualizedVolatilityPct}% annualized volatility, ${riskMetrics.maxDrawdownPct}% max drawdown`);
    }
    if (portfolioImpact.concentrationRisk === 'high') {
      keyRisks.push(`High concentration risk — position would reach ~${portfolioImpact.projectedTickerWeightPct}% of portfolio`);
    }
    if (fundamentals.peRatio != null && fundamentals.peRatio > 40) {
      keyRisks.push(`Elevated P/E of ${fundamentals.peRatio}x — high expectations already priced in`);
    }
    if (behavioral.flags.length > 0) {
      for (const flag of behavioral.flags) {
        if (flag.severity === 'high') keyRisks.push(`Behavioral flag: ${flag.pattern} — ${flag.explanation}`);
      }
    }
    // Geopolitical risks surfaced with severity
    for (const signal of marketConditions.geopoliticalSignals) {
      keyRisks.push(`[${signal.severity.toUpperCase()} GEOPOLITICAL RISK — ${signal.type.replace(/_/g, ' ')}] ${signal.description}`);
    }
    // Surface macro risks
    keyRisks.push(...marketConditions.macroHeadwinds);
    if (keyRisks.length === 0) {
      keyRisks.push('No major data-backed risks identified, though all trades carry inherent uncertainty');
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const summary = `${ticker} — ${outlook.toUpperCase()} outlook with a conviction score of ${conviction}/100. ${impliedFairValueVsPrice}${priceTargetRange ? `, with a price target range of $${priceTargetRange.low}–$${priceTargetRange.high} (base $${priceTargetRange.base})` : ''}.`;

    return {
      outlook,
      convictionScore: conviction,
      impliedFairValueVsPrice,
      priceTargetRange,
      keyTailwinds,
      keyRisks,
      summary,
      disclaimer: 'Prediction is model-generated from live market data and is not financial advice. It reflects quantitative signals only — not qualitative factors, insider information, or macroeconomic conditions. Past data does not guarantee future performance.'
    };
  }

  // ── Rationale alignment ──────────────────────────────────────────────────────

  private checkRationaleAlignment(
    rationale: string,
    fundamentalsScore: number,
    sentiment: { socialMentionVolume: string }
  ): RationaleClaimCheck[] {
    const lower = rationale.toLowerCase();
    const checks: RationaleClaimCheck[] = [];

    for (const def of CLAIM_DEFINITIONS) {
      const matched = def.phrases.find((p) => lower.includes(p));
      if (!matched) continue;

      let aligned = true;
      let explanation = '';

      switch (def.claimType) {
        case 'undervalued':
        case 'strong_fundamentals':
          aligned = fundamentalsScore < 60;
          explanation = aligned
            ? `Fundamentals data (score ${fundamentalsScore.toFixed(0)}/100, lower = cheaper/stronger) is broadly consistent with a "${matched}" claim.`
            : `Fundamentals data (score ${fundamentalsScore.toFixed(0)}/100, lower = cheaper/stronger) looks richly valued or stretched, which cuts against a "${matched}" claim.`;
          break;
        case 'momentum_hype':
          aligned = sentiment.socialMentionVolume === 'elevated' || sentiment.socialMentionVolume === 'spiking';
          explanation = aligned
            ? `Sentiment data shows ${sentiment.socialMentionVolume} mention volume, consistent with a "${matched}" claim.`
            : `Sentiment data shows only ${sentiment.socialMentionVolume} mention volume, which does not support a "${matched}" claim.`;
          break;
        case 'stable_safe':
          aligned = fundamentalsScore < 70;
          explanation = aligned
            ? `Fundamentals data (score ${fundamentalsScore.toFixed(0)}/100) doesn't contradict a "${matched}" characterization.`
            : `Fundamentals data (score ${fundamentalsScore.toFixed(0)}/100) suggests more risk than a "${matched}" characterization implies.`;
          break;
      }

      checks.push({ claimType: def.claimType, matchedPhrase: matched, aligned, explanation });
    }

    return checks;
  }

  // ── Caution level ────────────────────────────────────────────────────────────

  private computeCautionLevel(
    behavioralFlags: ThesisCheckResult['behavioral']['flags'],
    divergence: ThesisCheckResult['divergence'],
    portfolioImpact: ThesisCheckResult['portfolioImpact'],
    rationaleChecks: RationaleClaimCheck[]
  ): ThesisCheckResult['cautionLevel'] {
    const misalignedCount = rationaleChecks.filter((c) => !c.aligned).length;
    const hasHighBehavioralFlag = behavioralFlags.some((f) => f.severity === 'high');
    const hasAnyBehavioralFlag = behavioralFlags.length > 0;

    if (hasHighBehavioralFlag || misalignedCount >= 2 || (divergence.hypeRisk && portfolioImpact.concentrationRisk === 'high')) {
      return 'red';
    }

    if (hasAnyBehavioralFlag || misalignedCount === 1 || divergence.hypeRisk || portfolioImpact.concentrationRisk !== 'low') {
      return 'yellow';
    }

    return 'green';
  }

  // ── Evidence trail ───────────────────────────────────────────────────────────

  private buildEvidenceTrail(
    behavioral: ThesisCheckResult['behavioral'],
    sentiment: ThesisCheckResult['sentiment'],
    divergence: ThesisCheckResult['divergence'],
    portfolioImpact: ThesisCheckResult['portfolioImpact'],
    rationaleChecks: RationaleClaimCheck[]
  ): EvidenceTrailItem[] {
    const trail: EvidenceTrailItem[] = [];

    trail.push({
      dimension: 'behavioral',
      summary:
        behavioral.flags.length === 0
          ? 'No known impulsive-behavior patterns detected in this trade or recent history.'
          : `${behavioral.flags.length} behavioral pattern(s) detected: ${behavioral.flags.map((f) => f.pattern).join(', ')}.`,
      detail: behavioral.flags.map((f) => `[${f.severity}] ${f.explanation}`).join(' ') || 'History looks consistent with a deliberate, unhurried decision process.'
    });

    trail.push({
      dimension: 'fundamentals_sentiment',
      summary: divergence.interpretation,
      detail: `Fundamentals score: ${divergence.fundamentalsScore.toFixed(0)}/100 (lower = cheaper/stronger). Sentiment score: ${divergence.sentimentScore.toFixed(0)} (-100 to 100), normalized to ${divergence.normalizedSentimentScore.toFixed(0)}/100. Divergence: ${divergence.divergence.toFixed(0)} points.${
        sentiment.detectedCatalysts.length > 0
          ? ` Catalysts detected: ${sentiment.detectedCatalysts.map((c) => `${c.type.replace(/_/g, ' ')} ("${c.headline}")`).join('; ')}.`
          : ' No specific catalysts detected in recent headlines.'
      }`
    });


    trail.push({
      dimension: 'portfolio_risk',
      summary: portfolioImpact.explanation,
      detail: `Projected position weight: ${portfolioImpact.projectedTickerWeightPct}%. Projected sector weight: ${portfolioImpact.projectedSectorWeightPct}%. Concentration risk: ${portfolioImpact.concentrationRisk}.`
    });

    trail.push({
      dimension: 'rationale_alignment',
      summary:
        rationaleChecks.length === 0
          ? 'No specific, checkable claims (e.g. "undervalued", "momentum") were detected in the stated rationale.'
          : `${rationaleChecks.filter((c) => c.aligned).length}/${rationaleChecks.length} checkable claim(s) in the stated rationale align with the data.`,
      detail: rationaleChecks.map((c) => `"${c.matchedPhrase}": ${c.explanation}`).join(' ') || 'Consider stating a more specific, checkable thesis next time (e.g. what specifically makes this undervalued or high-momentum).'
    });

    return trail;
  }

  // ── Reflective questions ─────────────────────────────────────────────────────

  private buildReflectiveQuestions(
    behavioral: ThesisCheckResult['behavioral'],
    divergence: ThesisCheckResult['divergence'],
    portfolioImpact: ThesisCheckResult['portfolioImpact'],
    rationaleChecks: RationaleClaimCheck[],
    input: EvaluateTradeThesisInput
  ): string[] {
    const questions: string[] = [];

    for (const flag of behavioral.flags) {
      if (flag.pattern === 'panic_selling') {
        questions.push(`If ${input.ticker.toUpperCase()} had been flat today, would you still want to sell it right now?`);
      }
      if (flag.pattern === 'fomo_buying') {
        questions.push(`What would you need to see to buy ${input.ticker.toUpperCase()} even if it weren't getting attention right now?`);
      }
      if (flag.pattern === 'doubling_down') {
        questions.push(`Has anything about the original thesis actually changed, or does this add to the position mainly to lower your average cost?`);
      }
      if (flag.pattern === 'overtrading') {
        questions.push(`Looking back at your recent trades, is this pace of activity serving your strategy, or reacting to it?`);
      }
      if (flag.pattern === 'revenge_trading') {
        questions.push(`Is this trade based on new information, or on wanting to undo the last one?`);
      }
    }

    if (divergence.hypeRisk) {
      questions.push(`Sentiment looks well ahead of fundamentals here — what's the specific catalyst you expect to close that gap?`);
    }
    if (divergence.overlookedValue && input.action === 'buy') {
      questions.push(`The market seems to be undervaluing this relative to fundamentals — do you have a specific reason it's overlooked, or could the market know something the numbers don't yet show?`);
    }

    if (portfolioImpact.concentrationRisk !== 'low') {
      questions.push(`This would bring ${input.ticker.toUpperCase()} to ~${portfolioImpact.projectedTickerWeightPct}% of your portfolio — are you comfortable with that much resting on one name?`);
    }

    const misaligned = rationaleChecks.filter((c) => !c.aligned);
    if (misaligned.length > 0) {
      questions.push(`Your stated reasoning and the data point in different directions on "${misaligned[0].matchedPhrase}" — which one are you weighting more, and why?`);
    }

    if (questions.length === 0) {
      questions.push(`Nothing unusual stood out here — is there anything about this trade you're still unsure about?`);
    }

    return questions;
  }

  // ── Preflight ────────────────────────────────────────────────────────────────

  async preflight(ticker: string, headlineLimit = 5) {
    const t = ticker.toUpperCase();
    const [quote, riskMetrics, earningsCalendar, headlines, marketSnapshot] = await Promise.all([
      this.marketDataService.getQuote(t),
      this.marketDataService.getRiskMetrics(t),
      this.marketDataService.getEarningsCalendar(t),
      this.marketDataService.getNewsHeadlines(t, headlineLimit),
      this.marketDataService.getMarketSnapshot(t)
    ]);

    const warnings: string[] = [];

    if (earningsCalendar.earningsImminent) {
      warnings.push(
        `Earnings are in ${earningsCalendar.daysUntilEarnings} day(s) (${earningsCalendar.nextEarningsDate}). ` +
        `Trading ahead of earnings adds significant event risk — the stock could gap sharply in either direction.`
      );
    }
    if (riskMetrics.riskTier === 'speculative' || riskMetrics.riskTier === 'high') {
      warnings.push(
        `${t} is rated ${riskMetrics.riskTier} risk (annualized volatility: ${riskMetrics.annualizedVolatilityPct}%, beta: ${riskMetrics.beta}). ` +
        `Size the position accordingly.`
      );
    }
    if (marketSnapshot.divergence.hypeRisk) {
      warnings.push(
        `Sentiment is running well ahead of fundamentals for ${t} — this is a pattern often associated with hype-driven speculation.`
      );
    }

    const negativeHeadlines = headlines.filter((h) => h.polarity === 'negative');
    if (negativeHeadlines.length >= 2) {
      warnings.push(
        `${negativeHeadlines.length} of the ${headlines.length} recent headlines have a negative polarity — check the news before proceeding.`
      );
    }

    return {
      ticker: t,
      quote,
      riskMetrics,
      earningsCalendar,
      marketSnapshot,
      recentHeadlines: headlines,
      warnings,
      readyForThesisCheck: warnings.length === 0,
      suggestion:
        warnings.length === 0
          ? `No red flags detected in the preflight. Run evaluate_trade_thesis when you are ready to log and evaluate your thesis.`
          : `${warnings.length} preflight warning(s) found. Review before running evaluate_trade_thesis.`
    };
  }
}
