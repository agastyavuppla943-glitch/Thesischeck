export type TradeAction = 'buy' | 'sell';

export type EmotionalState =
  | 'calm'
  | 'anxious'
  | 'excited'
  | 'fearful'
  | 'frustrated'
  | 'confident'
  | 'unsure';

export interface JournalEntry {
  id: string;
  timestamp: string;
  title: string;
  body: string;
  tags: string[];
}

export interface TradeDecisionRecord {
  id: string;
  timestamp: string;
  ticker: string;
  action: TradeAction;
  quantity: number;
  statedRationale: string;
  emotionalState: EmotionalState;
  /** Filled in later via log_trade_outcome */
  outcome?: {
    timestamp: string;
    notes: string;
    regretted: boolean;
  };
  /** Rich journal notes attached via add_journal_entry */
  journalEntries?: JournalEntry[];
}

export interface BehavioralFlag {
  pattern:
    | 'panic_selling'
    | 'fomo_buying'
    | 'doubling_down'
    | 'overtrading'
    | 'impulsive_language'
    | 'revenge_trading';
  severity: 'low' | 'medium' | 'high';
  explanation: string;
}

export interface BehavioralAnalysis {
  flags: BehavioralFlag[];
  recentTradeCount: number;
  recentTickerTradeCount: number;
  sameDirectionStreak: number;
}

export interface BehavioralSummary {
  totalDecisions: number;
  decisionsLast7Days: number;
  decisionsLast24Hours: number;
  outcomesLogged: number;
  regrettedCount: number;
  regretRatePct: number | null;
  emotionalStateBreakdown: Record<EmotionalState, number>;
  actionBreakdown: Record<TradeAction, number>;
  mostTradedTickers: Array<{ ticker: string; count: number }>;
  insights: string[];
}
