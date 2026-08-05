import { randomUUID } from 'crypto';
import { appendToCollection, readCollection, writeCollection } from '../../shared/storage.js';
import type {
  BehavioralAnalysis,
  BehavioralFlag,
  BehavioralSummary,
  EmotionalState,
  JournalEntry,
  TradeAction,
  TradeDecisionRecord
} from './behavioral.types.js';

const COLLECTION = 'trade_decisions';

const IMPULSIVE_PHRASES = [
  'everyone is buying',
  "can't miss out",
  'cant miss out',
  'missing out',
  'about to explode',
  'going to zero',
  'get out now',
  'last chance',
  'gut feeling',
  "it's going to the moon",
  'to the moon',
  "i just have a feeling",
  'yolo',
  'panic',
  'scared',
  'terrified'
];

export class BehavioralService {
  /**
   * Persist a new trade decision (called right before evaluation, and again
   * once the trade is actually confirmed by the user's brokerage flow).
   */
  recordDecision(input: {
    ticker: string;
    action: TradeAction;
    quantity: number;
    statedRationale: string;
    emotionalState: EmotionalState;
  }): TradeDecisionRecord {
    const record: TradeDecisionRecord = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ticker: input.ticker.toUpperCase(),
      action: input.action,
      quantity: input.quantity,
      statedRationale: input.statedRationale,
      emotionalState: input.emotionalState
    };
    return appendToCollection(COLLECTION, record);
  }

  recordOutcome(decisionId: string, notes: string, regretted: boolean): TradeDecisionRecord | null {
    const items = readCollection<TradeDecisionRecord>(COLLECTION);
    const idx = items.findIndex((i) => i.id === decisionId);
    if (idx === -1) return null;
    items[idx].outcome = {
      timestamp: new Date().toISOString(),
      notes,
      regretted
    };
    writeCollection(COLLECTION, items);
    return items[idx];
  }

  addJournalEntry(
    decisionId: string,
    title: string,
    body: string,
    tags: string[]
  ): TradeDecisionRecord | null {
    const items = readCollection<TradeDecisionRecord>(COLLECTION);
    const idx = items.findIndex((i) => i.id === decisionId);
    if (idx === -1) return null;

    const entry: JournalEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      title,
      body,
      tags
    };
    if (!items[idx].journalEntries) {
      items[idx].journalEntries = [];
    }
    items[idx].journalEntries!.push(entry);
    writeCollection(COLLECTION, items);
    return items[idx];
  }

  getJournalEntries(decisionId?: string): Array<{ decisionId: string; ticker: string; action: string; entry: JournalEntry }> {
    const items = readCollection<TradeDecisionRecord>(COLLECTION);
    const result: Array<{ decisionId: string; ticker: string; action: string; entry: JournalEntry }> = [];
    for (const record of items) {
      if (decisionId && record.id !== decisionId) continue;
      for (const entry of record.journalEntries ?? []) {
        result.push({ decisionId: record.id, ticker: record.ticker, action: record.action, entry });
      }
    }
    return result.sort((a, b) => b.entry.timestamp.localeCompare(a.entry.timestamp));
  }

  getHistory(ticker?: string): TradeDecisionRecord[] {
    const items = readCollection<TradeDecisionRecord>(COLLECTION);
    const sorted = items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (!ticker) return sorted;
    return sorted.filter((i) => i.ticker === ticker.toUpperCase());
  }

  getSummary(): BehavioralSummary {
    const history = this.getHistory();
    const now = Date.now();
    const last24h = history.filter((h) => now - new Date(h.timestamp).getTime() < 24 * 60 * 60 * 1000);
    const last7d = history.filter((h) => now - new Date(h.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000);
    const withOutcomes = history.filter((h) => h.outcome);
    const regretted = withOutcomes.filter((h) => h.outcome?.regretted);

    const emotionalStateBreakdown: Record<EmotionalState, number> = {
      calm: 0,
      anxious: 0,
      excited: 0,
      fearful: 0,
      frustrated: 0,
      confident: 0,
      unsure: 0
    };
    const actionBreakdown: Record<TradeAction, number> = { buy: 0, sell: 0 };

    for (const record of history) {
      emotionalStateBreakdown[record.emotionalState] += 1;
      actionBreakdown[record.action] += 1;
    }

    const tickerCounts = new Map<string, number>();
    for (const record of history) {
      tickerCounts.set(record.ticker, (tickerCounts.get(record.ticker) ?? 0) + 1);
    }
    const mostTradedTickers = [...tickerCounts.entries()]
      .map(([ticker, count]) => ({ ticker, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const insights: string[] = [];
    if (history.length === 0) {
      insights.push('No trade decisions logged yet — run evaluate_trade_thesis to start building behavioral history.');
    } else {
      if (last24h.length >= 4) {
        insights.push(`${last24h.length} decisions in the last 24 hours — elevated activity often correlates with emotional trading.`);
      }
      if (withOutcomes.length > 0) {
        const regretRate = (regretted.length / withOutcomes.length) * 100;
        if (regretRate >= 50) {
          insights.push(`${regretRate.toFixed(0)}% of logged outcomes were regretted — consider slowing down and logging outcomes more consistently.`);
        }
      }
      const dominantEmotion = [...Object.entries(emotionalStateBreakdown)].sort((a, b) => b[1] - a[1])[0];
      if (dominantEmotion && dominantEmotion[1] > history.length * 0.4) {
        insights.push(`Most decisions were made while feeling "${dominantEmotion[0]}" (${dominantEmotion[1]}/${history.length}) — worth checking if emotion is driving the process.`);
      }
      if (mostTradedTickers[0] && mostTradedTickers[0].count >= 3) {
        insights.push(`${mostTradedTickers[0].ticker} appears ${mostTradedTickers[0].count} times in history — repeated activity on one name can signal fixation or doubling-down.`);
      }
    }

    return {
      totalDecisions: history.length,
      decisionsLast7Days: last7d.length,
      decisionsLast24Hours: last24h.length,
      outcomesLogged: withOutcomes.length,
      regrettedCount: regretted.length,
      regretRatePct: withOutcomes.length > 0 ? Math.round((regretted.length / withOutcomes.length) * 1000) / 10 : null,
      emotionalStateBreakdown,
      actionBreakdown,
      mostTradedTickers,
      insights
    };
  }

  /**
   * Analyze the investor's history plus the trade currently being considered
   * for known impulsive/emotionally-driven behavioral patterns.
   */
  analyze(current: {
    ticker: string;
    action: TradeAction;
    statedRationale: string;
    emotionalState: EmotionalState;
    /** Optional: recent portfolio price move context, e.g. -0.12 for -12% */
    recentPriceChangePct?: number;
  }): BehavioralAnalysis {
    const now = Date.now();
    const history = this.getHistory();
    const last24h = history.filter((h) => now - new Date(h.timestamp).getTime() < 24 * 60 * 60 * 1000);
    const last7d = history.filter((h) => now - new Date(h.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000);
    const tickerHistory = history.filter((h) => h.ticker === current.ticker.toUpperCase());
    const recentTickerHistory = tickerHistory.filter(
      (h) => now - new Date(h.timestamp).getTime() < 30 * 24 * 60 * 60 * 1000
    );

    const flags: BehavioralFlag[] = [];

    // Panic-selling: selling during a sharp drop while fearful/anxious
    if (
      current.action === 'sell' &&
      typeof current.recentPriceChangePct === 'number' &&
      current.recentPriceChangePct <= -0.08 &&
      (current.emotionalState === 'fearful' || current.emotionalState === 'anxious')
    ) {
      flags.push({
        pattern: 'panic_selling',
        severity: current.recentPriceChangePct <= -0.15 ? 'high' : 'medium',
        explanation: `Selling ${current.ticker.toUpperCase()} after a sharp decline (${(current.recentPriceChangePct * 100).toFixed(1)}%) while feeling ${current.emotionalState} is a classic panic-sell pattern — the price move is doing the deciding, not the thesis.`
      });
    }

    // FOMO-buying: buying while excited, with no prior position and a hype-adjacent rationale
    if (
      current.action === 'buy' &&
      current.emotionalState === 'excited' &&
      recentTickerHistory.length === 0
    ) {
      flags.push({
        pattern: 'fomo_buying',
        severity: 'medium',
        explanation: `First-time position in ${current.ticker.toUpperCase()} initiated while feeling excited, with no prior research trail on this ticker — a common signature of FOMO-driven entries.`
      });
    }

    // Doubling down: buying more of a ticker after a documented regretted or losing prior trade
    const priorLossOnTicker = tickerHistory.find(
      (h) => h.outcome && (h.outcome.regretted || /loss|down|lost/i.test(h.outcome.notes))
    );
    if (current.action === 'buy' && priorLossOnTicker) {
      flags.push({
        pattern: 'doubling_down',
        severity: 'high',
        explanation: `A previous ${current.ticker.toUpperCase()} trade was logged with a regretted or loss-making outcome ("${priorLossOnTicker.outcome?.notes}"), and this trade adds to the same position — a pattern associated with trying to "make it back" rather than reassessing the thesis.`
      });
    }

    // Overtrading: many trades in a short window
    if (last24h.length >= 4) {
      flags.push({
        pattern: 'overtrading',
        severity: last24h.length >= 7 ? 'high' : 'medium',
        explanation: `${last24h.length} trades logged in the last 24 hours. High trade frequency is strongly correlated with lower net returns after costs and emotional decision fatigue.`
      });
    } else if (last7d.length >= 10) {
      flags.push({
        pattern: 'overtrading',
        severity: 'medium',
        explanation: `${last7d.length} trades logged in the last 7 days, well above a typical long-term investing cadence.`
      });
    }

    // Revenge trading: rapid re-entry opposite direction shortly after a regretted trade
    const lastRecord = history[0];
    if (
      lastRecord &&
      lastRecord.outcome?.regretted &&
      now - new Date(lastRecord.timestamp).getTime() < 2 * 60 * 60 * 1000 &&
      lastRecord.ticker === current.ticker.toUpperCase() &&
      lastRecord.action !== current.action
    ) {
      flags.push({
        pattern: 'revenge_trading',
        severity: 'high',
        explanation: `This trade reverses direction on ${current.ticker.toUpperCase()} within 2 hours of a regretted trade on the same ticker — a pattern consistent with revenge trading rather than a reassessed thesis.`
      });
    }

    // Impulsive language in the stated rationale itself
    const lowerRationale = current.statedRationale.toLowerCase();
    const matchedPhrases = IMPULSIVE_PHRASES.filter((p) => lowerRationale.includes(p));
    if (matchedPhrases.length > 0) {
      flags.push({
        pattern: 'impulsive_language',
        severity: matchedPhrases.length >= 2 ? 'high' : 'low',
        explanation: `The stated rationale contains language associated with emotional/urgency-driven decisions (e.g. "${matchedPhrases[0]}") rather than a fundamentals-based thesis.`
      });
    }

    return {
      flags,
      recentTradeCount: last7d.length,
      recentTickerTradeCount: recentTickerHistory.length,
      sameDirectionStreak: this.computeSameDirectionStreak(history, current.action)
    };
  }

  private computeSameDirectionStreak(history: TradeDecisionRecord[], action: TradeAction): number {
    let streak = 0;
    for (const record of history) {
      if (record.action === action) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  }
}
