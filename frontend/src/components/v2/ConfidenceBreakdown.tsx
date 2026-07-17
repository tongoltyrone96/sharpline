import React from 'react'

interface Model {
  home_win_prob: number
  away_win_prob: number
  confidence: number
  projected_margin: number | null
  projected_total: number | null
  fair_home_price: number | null
  fair_away_price: number | null
  rationale: string
  factors: Record<string, unknown>
}

interface MarketRow {
  bookmaker: string
  outcome: string
  price: number
  point: number | null
  fair_price: number | null
  edge_pct: number | null
  is_best: boolean
}

interface Props {
  model: Model | null
  markets: { h2h: MarketRow[]; spreads: MarketRow[]; totals: MarketRow[] }
  lineupCount: number
}

interface Factor {
  label: string
  sub: string
  impact: 'pos' | 'neu' | 'neg'
  value: string
  icon: React.ReactNode
}

/**
 * ConfidenceBreakdown — decomposes the model's confidence into the
 * observable factors that drove it. Each factor is derived from live
 * data: bookmaker count, spread of prices across books, lineup
 * presence, and probability separation.
 */
export default function ConfidenceBreakdown({ model, markets, lineupCount }: Props) {
  const factors = deriveFactors(model, markets, lineupCount)

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Confidence Breakdown</span>
      </div>
      <div style={{ padding: '6px 0' }}>
        {factors.map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 11,
            padding: '10px 14px',
            borderBottom: i === factors.length - 1 ? 'none' : '1px solid var(--line)',
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--raise)', display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <div style={{ width: 15, height: 15, color: 'var(--text-2)' }}>{f.icon}</div>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{f.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: 1 }}>{f.sub}</div>
            </div>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
              color: f.impact === 'pos' ? 'var(--pos)'
                : f.impact === 'neg' ? 'var(--neg)' : 'var(--text-3)',
            }}>{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function deriveFactors(
  model: Model | null,
  markets: { h2h: MarketRow[]; spreads: MarketRow[]; totals: MarketRow[] },
  lineupCount: number,
): Factor[] {
  const bmSet = new Set([
    ...markets.h2h.map(r => r.bookmaker),
    ...markets.spreads.map(r => r.bookmaker),
    ...markets.totals.map(r => r.bookmaker),
  ])
  const bmCount = bmSet.size

  // Spread of H2H prices for the favourite — measures market agreement
  const favoured = markets.h2h.filter(r => r.price != null && r.price < 2)
  const prices = favoured.map(r => r.price)
  const priceStd = prices.length > 1 ? std(prices) : null
  const marketAgreement: Factor['impact'] = priceStd == null ? 'neu'
    : priceStd < 0.05 ? 'pos'
    : priceStd < 0.15 ? 'neu' : 'neg'

  // Probability separation → high separation = more confident pick
  const sep = model
    ? Math.abs(model.home_win_prob - model.away_win_prob)
    : 0
  const probImpact: Factor['impact'] = sep > 0.3 ? 'pos' : sep > 0.1 ? 'neu' : 'neg'

  const lineupImpact: Factor['impact'] = lineupCount <= 3 ? 'neu' : 'neg'

  return [
    {
      label: 'Bookmaker coverage',
      sub: `${bmCount} books quoting this market`,
      impact: bmCount >= 5 ? 'pos' : bmCount >= 3 ? 'neu' : 'neg',
      value: bmCount >= 5 ? 'strong' : bmCount >= 3 ? 'medium' : 'thin',
      icon: <svg viewBox="0 0 24 24" fill="none"><path d="M4 12h16M4 6h16M4 18h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"/></svg>,
    },
    {
      label: 'Market agreement',
      sub: priceStd != null ? `σ(prices) = ${priceStd.toFixed(3)}` : 'not enough books',
      impact: marketAgreement,
      value: marketAgreement === 'pos' ? '+high' : marketAgreement === 'neg' ? '-wide' : 'medium',
      icon: <svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    {
      label: 'Probability separation',
      sub: model
        ? `${(sep * 100).toFixed(1)} percentage-points apart`
        : 'no model output',
      impact: probImpact,
      value: probImpact === 'pos' ? 'decisive' : probImpact === 'neg' ? 'coinflip' : 'moderate',
      icon: <svg viewBox="0 0 24 24" fill="none"><path d="M3 12h18M12 3v18" stroke="currentColor" strokeWidth={1.6}/></svg>,
    },
    {
      label: 'Lineup certainty',
      sub: lineupCount === 0 ? 'no reported outs' : `${lineupCount} reported changes`,
      impact: lineupImpact,
      value: lineupImpact === 'neg' ? 'disrupted' : 'normal',
      icon: <svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
  ]
}

function std(arr: number[]): number {
  const m = arr.reduce((s, v) => s + v, 0) / arr.length
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length
  return Math.sqrt(v)
}
