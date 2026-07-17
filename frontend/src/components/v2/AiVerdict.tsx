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
  homeName: string
  awayName: string
  bestBookEdge: MarketRow | null
}

export default function AiVerdict({ model, homeName, awayName, bestBookEdge }: Props) {
  const hp = model?.home_win_prob != null ? model.home_win_prob * 100 : null
  const homeFav = (model?.home_win_prob ?? 0) >= (model?.away_win_prob ?? 0)
  const favName = homeFav ? homeName : awayName
  const conf = model?.confidence != null ? Math.round(model.confidence * 100) : null

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>AI Verdict</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.07em',
        }}>// model rationale</span>
      </div>

      <div style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'var(--cyan-dim)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" style={{ color: 'var(--cyan)' }}>
            <path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3zM9.5 20h5"
              stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
          {model ? (
            <>
              Model rates <b style={{ color: 'var(--text)', fontWeight: 600 }}>{favName}</b>
              {hp != null && <> at <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{(homeFav ? hp : 100 - hp).toFixed(1)}% to win</span></>}
              {model.projected_margin != null && (
                <>, projecting a <b style={{ color: 'var(--text)', fontWeight: 600 }}>{model.projected_margin > 0 ? '+' : ''}{model.projected_margin.toFixed(2)} margin</b></>
              )}
              {model.projected_total != null && (
                <> and <b style={{ color: 'var(--text)', fontWeight: 600 }}>{model.projected_total.toFixed(1)} total</b></>
              )}
              .
              {bestBookEdge && (bestBookEdge.edge_pct ?? 0) > 0 && (
                <>
                  {' '}Best value sits on{' '}
                  <span style={{ color: 'var(--pos)', fontWeight: 600 }}>
                    {bestBookEdge.outcome} at {bestBookEdge.bookmaker} ({bestBookEdge.price.toFixed(2)})
                  </span>
                  , where the price is{' '}
                  <span style={{ color: 'var(--pos)', fontWeight: 600 }}>
                    {bestBookEdge.edge_pct != null ? '+' + bestBookEdge.edge_pct.toFixed(1) + '%' : ''} above fair
                  </span>.
                </>
              )}
              {conf != null && (
                <> <b style={{ color: 'var(--text)', fontWeight: 600 }}>Confidence: {conf}%</b>.</>
              )}
              {model.rationale && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                  {model.rationale}
                </div>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--text-3)' }}>Model output not yet available for this event.</span>
          )}
        </div>
      </div>
    </div>
  )
}
