'use client';

import { useTheme, useWidgetState, useWidgetSDK } from '@nitrostack/widgets';

interface EvidenceTrailItem {
  dimension: 'behavioral' | 'fundamentals_sentiment' | 'portfolio_risk' | 'rationale_alignment';
  summary: string;
  detail: string;
}

interface BehavioralFlag {
  pattern: string;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
}

interface RationaleClaimCheck {
  claimType: string;
  matchedPhrase: string;
  aligned: boolean;
  explanation: string;
}

interface ThesisCheckData {
  decisionId: string;
  ticker: string;
  action: 'buy' | 'sell';
  quantity: number;
  statedRationale: string;
  cautionLevel: 'green' | 'yellow' | 'red';
  evidenceTrail: EvidenceTrailItem[];
  behavioral: { flags: BehavioralFlag[] };
  fundamentals: { fundamentalsScore: number; peRatio: number | null; revenueGrowthYoY: number | null };
  sentiment: { sentimentScore: number; socialMentionVolume: string };
  divergence: { normalizedSentimentScore: number; fundamentalsScore: number; hypeRisk: boolean; overlookedValue: boolean; interpretation: string };
  portfolioImpact: { projectedTickerWeightPct: number; concentrationRisk: 'low' | 'moderate' | 'high'; explanation: string };
  rationaleChecks: RationaleClaimCheck[];
  reflectiveQuestions: string[];
  disclaimer: string;
}

const CAUTION_COPY: Record<ThesisCheckData['cautionLevel'], { label: string; color: string; bg: string }> = {
  green: { label: 'Looks consistent', color: '#065f46', bg: '#d1fae5' },
  yellow: { label: 'Worth a second look', color: '#92400e', bg: '#fef3c7' },
  red: { label: 'Several red flags', color: '#991b1b', bg: '#fee2e2' }
};

const DIMENSION_LABEL: Record<EvidenceTrailItem['dimension'], string> = {
  behavioral: '🧠 Behavioral history',
  fundamentals_sentiment: '📊 Fundamentals vs. sentiment',
  portfolio_risk: '⚖️ Portfolio impact',
  rationale_alignment: '🔎 Rationale vs. data'
};

function Gauge({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
        <span>{label}</span>
        <span>{value.toFixed(0)}</span>
      </div>
      <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(120,120,120,0.2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
      </div>
    </div>
  );
}

export default function ThesisCheckResult() {
  const theme = useTheme();
  const { getToolOutput } = useWidgetSDK();
  const [state, setState] = useWidgetState<{ expanded: boolean }>(() => ({ expanded: false }));

  const data = getToolOutput<ThesisCheckData>();
  const isDark = theme === 'dark';
  const textColor = isDark ? '#f3f4f6' : '#111827';
  const mutedColor = isDark ? 'rgba(243,244,246,0.65)' : 'rgba(17,24,39,0.6)';
  const cardBg = isDark ? '#1f2430' : '#ffffff';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  if (!data) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: textColor }}>
        Loading thesis check…
      </div>
    );
  }

  const caution = CAUTION_COPY[data.cautionLevel];

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: cardBg,
        color: textColor,
        borderRadius: '16px',
        border: `1px solid ${borderColor}`,
        maxWidth: '460px',
        overflow: 'hidden',
        boxShadow: isDark ? '0 10px 30px rgba(0,0,0,0.4)' : '0 10px 30px rgba(0,0,0,0.08)'
      }}
    >
      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: `1px solid ${borderColor}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '13px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              ThesisCheck
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>
              {data.action === 'buy' ? 'Buy' : 'Sell'} {data.quantity} {data.ticker}
            </div>
          </div>
          <div
            style={{
              background: caution.bg,
              color: caution.color,
              padding: '6px 12px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}
          >
            {caution.label}
          </div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '13px', color: mutedColor, fontStyle: 'italic' }}>
          "{data.statedRationale}"
        </div>
      </div>

      {/* Gauges */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderColor}` }}>
        <Gauge label="Fundamentals richness (lower = cheaper/stronger)" value={data.fundamentals.fundamentalsScore} />
        <Gauge label="Sentiment richness (normalized)" value={data.divergence.normalizedSentimentScore} />
        <Gauge label="Portfolio weight after trade" value={data.portfolioImpact.projectedTickerWeightPct} max={30} />
      </div>

      {/* Evidence trail */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderColor}` }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', opacity: 0.85 }}>
          Evidence trail
        </div>
        {data.evidenceTrail.map((item, i) => (
          <div key={i} style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{DIMENSION_LABEL[item.dimension]}</div>
            <div style={{ fontSize: '13px', color: mutedColor, marginTop: '2px' }}>{item.summary}</div>
            {state?.expanded && (
              <div style={{ fontSize: '12px', color: mutedColor, marginTop: '4px', opacity: 0.85 }}>
                {item.detail}
              </div>
            )}
          </div>
        ))}
        <button
          onClick={() => setState({ expanded: !state?.expanded })}
          style={{
            marginTop: '4px',
            fontSize: '12px',
            background: 'transparent',
            border: 'none',
            color: '#6366f1',
            cursor: 'pointer',
            padding: 0,
            fontWeight: 600
          }}
        >
          {state?.expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {/* Reflective questions */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', opacity: 0.85 }}>
          Worth reflecting on
        </div>
        <ul style={{ margin: 0, paddingLeft: '18px' }}>
          {data.reflectiveQuestions.map((q, i) => (
            <li key={i} style={{ fontSize: '13px', color: mutedColor, marginBottom: '6px' }}>
              {q}
            </li>
          ))}
        </ul>
        <div style={{ fontSize: '11px', color: mutedColor, marginTop: '14px', opacity: 0.7 }}>
          {data.disclaimer}
        </div>
      </div>
    </div>
  );
}
