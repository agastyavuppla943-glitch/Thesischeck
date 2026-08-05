import type { CatalystType, DetectedCatalyst, DivergenceResult, EarningsCalendar, FundamentalsSnapshot, GeopoliticalEventType, GeopoliticalSignal, MarketConditions, NewsHeadline, RiskMetrics, SentimentSnapshot, TickerQuote } from './market-data.types.js';

// ── Company-level catalyst keyword map ──────────────────────────────────────
// Order matters: first match wins.
const CATALYST_KEYWORDS: Array<{
  type: Exclude<CatalystType, 'none'>;
  polarity: 'positive' | 'negative' | 'neutral';
  phrases: string[];
}> = [
  {
    type: 'government_contract',
    polarity: 'positive',
    phrases: ['government contract', 'defense contract', 'federal contract', 'awarded contract', 'pentagon', 'dod contract', 'nasa contract', 'military contract']
  },
  {
    type: 'buyback',
    polarity: 'positive',
    phrases: ['share buyback', 'stock repurchase', 'buyback program', 'repurchase program', 'buys back shares']
  },
  {
    type: 'product_recall',
    polarity: 'negative',
    phrases: ['recall', 'product recall', 'safety recall', 'defect', 'pulled from shelves', 'withdrawn from market']
  },
  {
    type: 'product_launch',
    polarity: 'positive',
    phrases: ['launch', 'unveil', 'introduce', 'new product', 'new model', 'new service', 'releases', 'debut', 'announce new']
  },
  {
    type: 'partnership',
    polarity: 'positive',
    phrases: ['partnership', 'joint venture', 'collaboration', 'strategic alliance', 'deal with', 'teams up', 'partners with']
  },
  {
    type: 'regulatory',
    polarity: 'negative',
    phrases: ['fda', 'sec', 'regulatory', 'lawsuit', 'probe', 'fine', 'investigation', 'antitrust', 'sanction', 'penalty', 'violation']
  },
  {
    type: 'earnings_event',
    polarity: 'neutral',
    phrases: ['earnings', 'quarterly results', 'revenue beat', 'eps beat', 'eps miss', 'guidance', 'q1', 'q2', 'q3', 'q4', 'fiscal year']
  },
  {
    type: 'leadership_change',
    polarity: 'neutral',
    phrases: ['ceo', 'cfo', 'chief executive', 'resigns', 'steps down', 'appoints', 'new cto', 'executive change']
  },
  {
    type: 'expansion',
    polarity: 'positive',
    phrases: ['acquisition', 'acquires', 'merger', 'buyout', 'expand', 'enters market', 'opens', 'new facility', 'ipo']
  }
];

function detectCatalyst(title: string): { type: CatalystType; polarity: 'positive' | 'negative' | 'neutral' } {
  const lower = title.toLowerCase();
  for (const { type, polarity, phrases } of CATALYST_KEYWORDS) {
    if (phrases.some((p) => lower.includes(p))) return { type, polarity };
  }
  return { type: 'none', polarity: 'neutral' };
}

// ── Geopolitical keyword map ─────────────────────────────────────────────────
const GEOPOLITICAL_KEYWORDS: Array<{
  type: GeopoliticalEventType;
  severity: GeopoliticalSignal['severity'];
  phrases: string[];
  description: string;
}> = [
  {
    type: 'war',
    severity: 'high',
    phrases: ['war', 'invasion', 'military strike', 'airstrike', 'combat', 'troops deployed', 'missile attack', 'bombing', 'armed conflict', 'military offensive'],
    description: 'Active military conflict detected — major supply chain, commodity, and risk sentiment headwind'
  },
  {
    type: 'sanctions',
    severity: 'high',
    phrases: ['sanctions', 'embargo', 'export ban', 'blacklisted', 'sanctioned', 'trade ban', 'asset freeze'],
    description: 'Economic sanctions detected — can disrupt supply chains, restrict market access, and spike input costs'
  },
  {
    type: 'trade_conflict',
    severity: 'medium',
    phrases: ['tariff', 'trade war', 'trade dispute', 'import duties', 'trade restrictions', 'trade retaliation', 'protectionist'],
    description: 'Trade conflict or tariff escalation detected — headwind for globally exposed companies'
  },
  {
    type: 'diplomatic_tension',
    severity: 'medium',
    phrases: ['diplomatic crisis', 'tensions escalate', 'expelled ambassador', 'geopolitical tension', 'coup', 'regime change', 'political unrest'],
    description: 'Diplomatic or geopolitical tensions — increases uncertainty and risk premiums'
  },
  {
    type: 'natural_disaster',
    severity: 'medium',
    phrases: ['earthquake', 'hurricane', 'typhoon', 'flood', 'wildfire', 'tsunami', 'volcanic', 'disaster zone'],
    description: 'Natural disaster detected — can disrupt supply chains and regional operations'
  },
  {
    type: 'political_crisis',
    severity: 'medium',
    phrases: ['debt default', 'debt crisis', 'government shutdown', 'political instability', 'constitutional crisis', 'snap election', 'currency crisis'],
    description: 'Political or fiscal crisis — raises sovereign risk and can trigger broader market volatility'
  }
];

// ── Sector ETF map ────────────────────────────────────────────────────────
const SECTOR_ETF: Record<string, string> = {
  technology: 'XLK',
  tech: 'XLK',
  semiconductor: 'SOXX',
  semiconductors: 'SOXX',
  healthcare: 'XLV',
  health: 'XLV',
  financials: 'XLF',
  financial: 'XLF',
  banking: 'XLF',
  energy: 'XLE',
  utilities: 'XLU',
  'real estate': 'XLRE',
  realestate: 'XLRE',
  materials: 'XLB',
  'consumer discretionary': 'XLY',
  discretionary: 'XLY',
  'consumer staples': 'XLP',
  staples: 'XLP',
  industrials: 'XLI',
  industrial: 'XLI',
  'communication services': 'XLC',
  communications: 'XLC',
  telecom: 'XLC',
};

function sectorEtfFor(sector: string): string | null {
  return SECTOR_ETF[sector.toLowerCase().trim()] ?? null;
}

export class MarketDataService {
  private readonly fmpApiKey = process.env.FMP_API_KEY;
  private readonly newsApiKey = process.env.NEWSAPI_KEY;

  async getFundamentals(ticker: string): Promise<FundamentalsSnapshot> {
    return this.fetchFundamentalsFromFMP(ticker);
  }

  async getSentiment(ticker: string): Promise<SentimentSnapshot> {
    return this.fetchSentimentFromNewsAPI(ticker);
  }

  async getQuote(ticker: string): Promise<TickerQuote> {
    return this.fetchQuoteFromFMP(ticker);
  }

  async getMarketSnapshot(ticker: string) {
    const [fundamentals, sentiment] = await Promise.all([
      this.getFundamentals(ticker),
      this.getSentiment(ticker)
    ]);
    const divergence = this.computeDivergence(fundamentals, sentiment);
    return { fundamentals, sentiment, divergence };
  }

  async getEarningsCalendar(ticker: string): Promise<EarningsCalendar> {
    return this.fetchEarningsCalendarFromFMP(ticker);
  }

  async getNewsHeadlines(ticker: string, limit: number = 5): Promise<NewsHeadline[]> {
    return this.fetchNewsHeadlinesFromNewsAPI(ticker, limit);
  }

  async getRiskMetrics(ticker: string): Promise<RiskMetrics> {
    return this.fetchRiskMetricsFromFMP(ticker);
  }

  async getMarketConditions(sector?: string): Promise<MarketConditions> {
    const etf = sector ? sectorEtfFor(sector) : null;
    // Fetch SPY, VIX, oil (USOIL), 10Y yield (^TNX), dollar (DXY), and sector ETF in one call
    const symbols = ['SPY', '^VIX', 'USOIL', '^TNX', 'DXY', ...(etf ? [etf] : [])].join(',');
    const fmpUrl = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbols)}&apikey=${this.fmpApiKey}`;

    let spyChangePct: number | null = null;
    let vixLevel: number | null = null;
    let sectorChangePct: number | null = null;
    let oilChangePct: number | null = null;
    let yieldLevel: number | null = null;
    let yieldChangePct: number | null = null;
    let dollarChangePct: number | null = null;

    try {
      const res = await fetch(fmpUrl);
      if (res.ok) {
        const data = (await res.json()) as Array<{ symbol: string; changesPercentage?: number; price?: number }>;
        for (const row of data) {
          const sym = row.symbol?.toUpperCase();
          if (sym === 'SPY') spyChangePct = row.changesPercentage ?? null;
          else if (sym === '^VIX') vixLevel = row.price ?? null;
          else if (sym === 'USOIL') oilChangePct = row.changesPercentage ?? null;
          else if (sym === '^TNX') { yieldLevel = row.price ?? null; yieldChangePct = row.changesPercentage ?? null; }
          else if (sym === 'DXY') dollarChangePct = row.changesPercentage ?? null;
          else if (etf && sym === etf.toUpperCase()) sectorChangePct = row.changesPercentage ?? null;
        }
      }
    } catch {
      // Non-fatal — macro indicators default to neutral
    }

    // Scan NewsAPI for geopolitical events
    const geopoliticalSignals = await this.fetchGeopoliticalSignals();

    // ── Derived signals ──────────────────────────────────────────────────────
    const marketTrend: MarketConditions['marketTrend'] =
      spyChangePct == null ? 'neutral'
      : spyChangePct >= 0.5 ? 'bullish'
      : spyChangePct <= -0.5 ? 'bearish'
      : 'neutral';

    const vixRegime: MarketConditions['vixRegime'] =
      vixLevel == null ? 'elevated'
      : vixLevel < 15 ? 'calm'
      : vixLevel > 25 ? 'fearful'
      : 'elevated';

    let sectorTrend: MarketConditions['sectorTrend'] = null;
    if (sectorChangePct != null && spyChangePct != null) {
      const rel = sectorChangePct - spyChangePct;
      sectorTrend = rel >= 0.3 ? 'outperforming' : rel <= -0.3 ? 'underperforming' : 'inline';
    }

    const yieldTrend: MarketConditions['yieldTrend'] =
      yieldChangePct == null ? null
      : yieldChangePct > 1 ? 'rising'
      : yieldChangePct < -1 ? 'falling'
      : 'stable';

    const geopoliticalRisk: MarketConditions['geopoliticalRisk'] =
      geopoliticalSignals.some((s) => s.severity === 'high') ? 'high'
      : geopoliticalSignals.length > 0 ? 'elevated'
      : 'low';

    // ── Plain-language signals ────────────────────────────────────────────────
    const macroTailwinds: string[] = [];
    const macroHeadwinds: string[] = [];

    // Broad market
    if (marketTrend === 'bullish') macroTailwinds.push(`Broad market (SPY) up ${spyChangePct?.toFixed(2)}% today — risk appetite is elevated`);
    if (marketTrend === 'bearish') macroHeadwinds.push(`Broad market (SPY) down ${Math.abs(spyChangePct ?? 0).toFixed(2)}% today — risk-off conditions`);

    // VIX
    if (vixRegime === 'fearful') macroHeadwinds.push(`VIX at ${vixLevel?.toFixed(1)} — elevated market fear; expect wider spreads and sharp moves`);
    if (vixRegime === 'calm') macroTailwinds.push(`VIX at ${vixLevel?.toFixed(1)} — calm conditions, low near-term volatility priced in`);

    // Sector
    if (sectorTrend === 'outperforming' && etf) macroTailwinds.push(`${etf} outperforming SPY by ${(sectorChangePct! - spyChangePct!).toFixed(2)}% — sector momentum is supportive`);
    if (sectorTrend === 'underperforming' && etf) macroHeadwinds.push(`${etf} underperforming SPY by ${Math.abs(sectorChangePct! - spyChangePct!).toFixed(2)}% — sector is a headwind`);

    // Oil
    if (oilChangePct != null && oilChangePct > 3) macroHeadwinds.push(`Crude oil up ${oilChangePct.toFixed(1)}% today — input cost and inflation headwind for non-energy sectors`);
    if (oilChangePct != null && oilChangePct < -3) macroTailwinds.push(`Crude oil down ${Math.abs(oilChangePct).toFixed(1)}% today — relief for margins in energy-intensive sectors`);

    // Treasury yields
    if (yieldTrend === 'rising') macroHeadwinds.push(`10Y Treasury yield rising (${yieldLevel?.toFixed(2)}%) — headwind for growth and tech stocks; raises discount rates`);
    if (yieldTrend === 'falling') macroTailwinds.push(`10Y Treasury yield falling (${yieldLevel?.toFixed(2)}%) — tailwind for growth stocks; lowers discount rates`);

    // Dollar
    if (dollarChangePct != null && dollarChangePct > 0.5) macroHeadwinds.push(`US Dollar strengthening (DXY +${dollarChangePct.toFixed(2)}%) — headwind for companies with significant international revenue`);
    if (dollarChangePct != null && dollarChangePct < -0.5) macroTailwinds.push(`US Dollar weakening (DXY ${dollarChangePct.toFixed(2)}%) — tailwind for multinational revenue`);

    // Geopolitical
    for (const signal of geopoliticalSignals) {
      macroHeadwinds.push(`[${signal.type.replace(/_/g, ' ').toUpperCase()}] ${signal.description} — headline: "${signal.headline}"`);
    }

    return {
      marketTrend,
      spyChangePct,
      vixLevel,
      vixRegime,
      sectorEtf: etf,
      sectorChangePct,
      sectorTrend,
      oilChangePct,
      yieldLevel,
      yieldTrend,
      dollarChangePct,
      geopoliticalRisk,
      geopoliticalSignals,
      macroTailwinds,
      macroHeadwinds
    };
  }

  /** Scan NewsAPI for global geopolitical events using keyword matching */
  private async fetchGeopoliticalSignals(): Promise<GeopoliticalSignal[]> {
    if (!this.newsApiKey) return [];
    try {
      const query = 'war OR invasion OR sanctions OR tariff OR "trade war" OR embargo OR "military strike" OR airstrike OR coup';
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${this.newsApiKey}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = (await res.json()) as { articles?: Array<{ title: string; publishedAt: string }> };
      const articles = data.articles ?? [];

      const detected: GeopoliticalSignal[] = [];
      const seenTypes = new Set<string>();

      for (const a of articles) {
        const lower = a.title.toLowerCase();
        for (const kw of GEOPOLITICAL_KEYWORDS) {
          if (!seenTypes.has(kw.type) && kw.phrases.some((p) => lower.includes(p))) {
            detected.push({ type: kw.type, severity: kw.severity, headline: a.title, description: kw.description });
            seenTypes.add(kw.type);
            break;
          }
        }
      }
      return detected;
    } catch {
      return [];
    }
  }


  /**
   * Compares fundamentals-implied "richness" against sentiment-implied
   * "richness" on the same 0-100 scale. Large positive divergence (sentiment
   * far above fundamentals) suggests hype-driven speculation; large negative
   * divergence suggests the market may be overlooking real strength.
   */
  computeDivergence(fundamentals: FundamentalsSnapshot, sentiment: SentimentSnapshot): DivergenceResult {
    // Map sentimentScore (-100..100) onto the same 0-100 scale as fundamentalsScore
    const normalizedSentimentScore = (sentiment.sentimentScore + 100) / 2;
    const divergence = normalizedSentimentScore - fundamentals.fundamentalsScore;

    const hypeRisk = divergence >= 25 && sentiment.socialMentionVolume !== 'low';
    const overlookedValue = divergence <= -25;

    let interpretation: string;
    if (hypeRisk) {
      interpretation = `Sentiment (${normalizedSentimentScore.toFixed(0)}/100) is running well ahead of fundamentals (${fundamentals.fundamentalsScore.toFixed(0)}/100), with ${sentiment.socialMentionVolume} mention volume — a pattern often seen in hype-driven speculation rather than fundamentals-backed conviction.`;
    } else if (overlookedValue) {
      interpretation = `Fundamentals (${fundamentals.fundamentalsScore.toFixed(0)}/100) look stronger than current sentiment (${normalizedSentimentScore.toFixed(0)}/100) suggests — the market may be overlooking this one, or there's a real concern not yet reflected in the numbers.`;
    } else {
      interpretation = `Fundamentals (${fundamentals.fundamentalsScore.toFixed(0)}/100) and sentiment (${normalizedSentimentScore.toFixed(0)}/100) are broadly aligned — no strong divergence signal either way.`;
    }

    return {
      ticker: fundamentals.ticker,
      fundamentalsScore: fundamentals.fundamentalsScore,
      sentimentScore: sentiment.sentimentScore,
      normalizedSentimentScore,
      divergence,
      hypeRisk,
      overlookedValue,
      interpretation
    };
  }

  // ── Live provider: FMP quote ─────────────────────────────────────────────────

  private async fetchQuoteFromFMP(ticker: string): Promise<TickerQuote> {
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${this.fmpApiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP quote request failed: ${res.status}`);
    const data = (await res.json()) as Array<Record<string, number>>;
    const row = data?.[0];
    if (!row) throw new Error('FMP quote returned no data');

    return {
      ticker: ticker.toUpperCase(),
      source: 'financial-modeling-prep',
      price: row.price ?? 0,
      changePct: row.changesPercentage ?? null,
      dayHigh: row.dayHigh ?? null,
      dayLow: row.dayLow ?? null,
      volume: row.volume ?? null
    };
  }

  // ── Live provider: FMP fundamentals ─────────────────────────────────────────

  private async fetchFundamentalsFromFMP(ticker: string): Promise<FundamentalsSnapshot> {
    const ratiosUrl = `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(ticker)}&apikey=${this.fmpApiKey}`;
    const ratiosRes = await fetch(ratiosUrl);
    if (!ratiosRes.ok) throw new Error(`FMP ratios request failed: ${ratiosRes.status}`);
    const ratiosData = (await ratiosRes.json()) as Array<Record<string, number>>;
    const row = ratiosData?.[0];
    if (!row) throw new Error('FMP ratios returned no data');

    const peRatio = row.priceToEarningsRatioTTM ?? null;
    const debtToEquity = row.debtToEquityRatioTTM ?? null;
    const profitMarginPct = row.netProfitMarginTTM != null ? row.netProfitMarginTTM * 100 : null;

    // Revenue growth YoY from annual income statement (2 periods)
    let revenueGrowthYoY: number | null = null;
    try {
      const incomeUrl = `https://financialmodelingprep.com/stable/income-statement?symbol=${encodeURIComponent(ticker)}&limit=2&period=annual&apikey=${this.fmpApiKey}`;
      const incomeRes = await fetch(incomeUrl);
      if (incomeRes.ok) {
        const incomeData = (await incomeRes.json()) as Array<Record<string, number>>;
        const current = incomeData?.[0];
        const prior = incomeData?.[1];
        if (current?.revenue != null && prior?.revenue != null && prior.revenue !== 0) {
          revenueGrowthYoY = Math.round(((current.revenue - prior.revenue) / Math.abs(prior.revenue)) * 1000) / 10;
        }
      }
    } catch {
      // Non-fatal — score uses neutral placeholder for this component.
    }

    // Composite fundamentals score: 0 = cheap/strong, 100 = expensive/risky
    const peComponent = peRatio != null ? Math.min(100, (peRatio / 70) * 100) : 50;
    const growthComponent = revenueGrowthYoY != null
      ? 100 - Math.min(100, Math.max(0, (revenueGrowthYoY + 10) / 55 * 100))
      : 50;
    const marginComponent = profitMarginPct != null
      ? 100 - Math.min(100, Math.max(0, (profitMarginPct + 15) / 40 * 100))
      : 50;
    const debtComponent = debtToEquity != null ? Math.min(100, (debtToEquity / 2.2) * 100) : 50;
    const fundamentalsScore =
      Math.round((peComponent * 0.35 + growthComponent * 0.3 + marginComponent * 0.2 + debtComponent * 0.15) * 10) / 10;

    return {
      ticker: ticker.toUpperCase(),
      source: 'financial-modeling-prep',
      peRatio,
      revenueGrowthYoY,
      profitMarginPct,
      debtToEquity,
      fundamentalsScore: Math.min(100, Math.max(0, fundamentalsScore))
    };
  }

  // ── Live provider: NewsAPI sentiment ────────────────────────────────────────

  private async fetchSentimentFromNewsAPI(ticker: string): Promise<SentimentSnapshot> {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(ticker)}&sortBy=publishedAt&pageSize=10&apiKey=${this.newsApiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsAPI request failed: ${res.status}`);
    const data = (await res.json()) as { articles?: Array<{ title: string; publishedAt: string }> };
    const articles = data.articles ?? [];
    if (articles.length === 0) throw new Error('NewsAPI returned no articles');

    const positiveWords = ['surge', 'soar', 'beat', 'gain', 'rally', 'upgrade', 'strong'];
    const negativeWords = ['plunge', 'miss', 'downgrade', 'lawsuit', 'weak', 'crash', 'probe'];
    let score = 0;
    for (const a of articles) {
      const t = a.title.toLowerCase();
      if (positiveWords.some((w) => t.includes(w))) score += 15;
      if (negativeWords.some((w) => t.includes(w))) score -= 15;
    }
    const sentimentScore = Math.max(-100, Math.min(100, score));
    const socialMentionVolume: SentimentSnapshot['socialMentionVolume'] =
      articles.length >= 9 ? 'spiking' : articles.length >= 6 ? 'elevated' : articles.length >= 3 ? 'normal' : 'low';

    // Detect catalysts from all headlines
    const detectedCatalysts: DetectedCatalyst[] = [];
    for (const a of articles) {
      const { type: catalystType, polarity } = detectCatalyst(a.title);
      if (catalystType !== 'none') {
        if (!detectedCatalysts.some((c) => c.type === catalystType)) {
          detectedCatalysts.push({ type: catalystType, polarity, headline: a.title, publishedAt: a.publishedAt });
        }
      }
    }

    return {
      ticker: ticker.toUpperCase(),
      source: 'newsapi',
      sentimentScore,
      socialMentionVolume,
      headlineSample: articles.slice(0, 3).map((a) => a.title),
      detectedCatalysts
    };
  }


  // ── Live provider: FMP earnings calendar ────────────────────────────────────

  private async fetchEarningsCalendarFromFMP(ticker: string): Promise<EarningsCalendar> {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${this.fmpApiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP earnings calendar request failed: ${res.status}`);
    const data = (await res.json()) as Array<Record<string, unknown>>;
    const sym = ticker.toUpperCase();
    const upcoming = data?.find(
      (e) => (e.symbol as string)?.toUpperCase() === sym && e.date && new Date(e.date as string) > new Date()
    );
    if (!upcoming) {
      return { ticker: sym, source: 'financial-modeling-prep', nextEarningsDate: null, epsEstimate: null, priorQuarterEpsSurprisePct: null, daysUntilEarnings: null, earningsImminent: false };
    }
    const nextEarningsDate = upcoming.date as string;
    const daysUntilEarnings = Math.round((new Date(nextEarningsDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return {
      ticker: sym,
      source: 'financial-modeling-prep',
      nextEarningsDate,
      epsEstimate: (upcoming.epsEstimated as number) ?? null,
      priorQuarterEpsSurprisePct: null,
      daysUntilEarnings,
      earningsImminent: daysUntilEarnings <= 14
    };
  }

  // ── Live provider: NewsAPI headlines ────────────────────────────────────────

  private async fetchNewsHeadlinesFromNewsAPI(ticker: string, limit: number): Promise<NewsHeadline[]> {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(ticker)}&sortBy=publishedAt&pageSize=${limit}&apiKey=${this.newsApiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsAPI headlines request failed: ${res.status}`);
    const data = (await res.json()) as { articles?: Array<{ title: string; publishedAt: string; source: { name: string }; url: string }> };
    const articles = data.articles ?? [];

    const positiveWords = ['surge', 'soar', 'beat', 'gain', 'rally', 'upgrade', 'strong', 'record', 'profit'];
    const negativeWords = ['plunge', 'miss', 'downgrade', 'lawsuit', 'weak', 'crash', 'probe', 'loss', 'cut'];

    return articles.map((a) => {
      const t = a.title.toLowerCase();
      const isPositive = positiveWords.some((w) => t.includes(w));
      const isNegative = negativeWords.some((w) => t.includes(w));
      const polarity: NewsHeadline['polarity'] = isPositive && !isNegative ? 'positive' : isNegative ? 'negative' : 'neutral';
      const { type: catalystType } = detectCatalyst(a.title);
      return { title: a.title, publishedAt: a.publishedAt, source: a.source?.name ?? 'newsapi', polarity, catalystType, url: a.url ?? null };
    });
  }


  // ── Live provider: FMP risk metrics ─────────────────────────────────────────

  private async fetchRiskMetricsFromFMP(ticker: string): Promise<RiskMetrics> {
    const histUrl = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(ticker)}&timeseries=252&apikey=${this.fmpApiKey}`;
    const histRes = await fetch(histUrl);
    if (!histRes.ok) throw new Error(`FMP historical price request failed: ${histRes.status}`);
    const closes = ((await histRes.json()) as Array<{ close: number }>)
      .map((d) => d.close)
      .filter((c) => typeof c === 'number' && c > 0);

    if (closes.length < 10) throw new Error('Insufficient historical price data for risk metrics');

    // Daily log returns (closes are newest-first)
    const logReturns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      logReturns.push(Math.log(closes[i - 1] / closes[i]));
    }

    // Annualized volatility = std-dev of daily log returns × √252 × 100
    const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
    const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / logReturns.length;
    const annualizedVolatilityPct = Math.round(Math.sqrt(variance * 252) * 100 * 10) / 10;

    // Max drawdown: reverse to oldest-first for correct rolling-peak calculation
    const chronological = [...closes].reverse();
    let peak = chronological[0];
    let maxDd = 0;
    for (const price of chronological) {
      if (price > peak) peak = price;
      const dd = (price - peak) / peak;
      if (dd < maxDd) maxDd = dd;
    }
    const maxDrawdownPct = Math.round(maxDd * 1000) / 10;

    let riskTier: RiskMetrics['riskTier'];
    let riskTierExplanation: string;

    if (annualizedVolatilityPct >= 60 || maxDrawdownPct <= -50) {
      riskTier = 'speculative';
      riskTierExplanation = `${ticker.toUpperCase()} shows speculative-grade risk: annualized volatility of ${annualizedVolatilityPct}%, max drawdown of ${maxDrawdownPct}% over the past year. Position sizing discipline is critical.`;
    } else if (annualizedVolatilityPct >= 35 || maxDrawdownPct <= -30) {
      riskTier = 'high';
      riskTierExplanation = `${ticker.toUpperCase()} carries above-average risk: annualized volatility of ${annualizedVolatilityPct}%, max drawdown of ${maxDrawdownPct}% over the past year.`;
    } else if (annualizedVolatilityPct >= 20 || maxDrawdownPct <= -15) {
      riskTier = 'moderate';
      riskTierExplanation = `${ticker.toUpperCase()} has moderate risk: annualized volatility of ${annualizedVolatilityPct}%, max drawdown of ${maxDrawdownPct}% — broadly in line with the overall market.`;
    } else {
      riskTier = 'low';
      riskTierExplanation = `${ticker.toUpperCase()} shows below-average risk: annualized volatility of ${annualizedVolatilityPct}%, max drawdown of ${maxDrawdownPct}% — a relatively stable name.`;
    }

    return {
      ticker: ticker.toUpperCase(),
      source: 'financial-modeling-prep',
      annualizedVolatilityPct,
      beta: 1.0, // beta requires market benchmark comparison; set to neutral default
      maxDrawdownPct,
      riskTier,
      riskTierExplanation
    };
  }
}
