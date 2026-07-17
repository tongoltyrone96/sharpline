import React, { useMemo, useState } from 'react'

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
  h2h: MarketRow[]
  spreads: MarketRow[]
  totals: MarketRow[]
  homeName: string
  awayName: string
}

type MarketKey = 'h2h' | 'spreads' | 'totals'

/**
 * Edge by Book — bars show every bookmaker's edge on the CURRENT
 * best-value outcome. REQ-8 preserved: each row is a distinct
 * bookmaker with its own line (see .point on each row).
 */
export default function EdgeByBookBars({ h2h, spreads, totals, homeName, awayName }: Props) {
  const [market, setMarket] = useState<MarketKey>('h2h')

  const rows = market === 'h2h' ? h2h : market === 'spreads' ? spreads : totals

  // Pick the outcome with the highest single-book edge, then show every
  // book's row for that outcome (so bars are apples-to-apples).
  const { bars, outcomeLabel } = useMemo(() => {
    if (rows.length === 0) return { bars: [] as MarketRow[], outcomeLabel: '' }
    const bestRow = rows.reduce((mx, r) =>
      (r.edge_pct ?? -Infinity) > (mx.edge_pct ?? -Infinity) ? r : mx, rows[0])
    const focusOutcome = bestRow.outcome
    const filtered = rows.filter(r => r.outcome === focusOutcome)
    filtered.sort((a, b) => (b.edge_pct ?? -Infinity) - (a.edge_pct ?? -Infinity))
    return { bars: filtered, outcomeLabel: prettyOutcome(focusOutcome, homeName, awayName, market) }
  }, [rows, homeName, awayName, market])

  const emax = Math.max(6, ...bars.map(b => Math.abs(b.edge_pct ?? 0)))

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Edge by Book</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>// {outcomeLabel || '–'}</span>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{
            display: 'flex', gap: 2, background: 'var(--panel-2)',
            border: '1px solid var(--line)', borderRadius: 7, padding: 2,
          }}>
            {(['h2h', 'spreads', 'totals'] as MarketKey[]).map(m => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                style={{
                  fontSize: 10.5, fontFamily: 'var(--mono)', fontWeight: 500,
                  color: market === m ? 'var(--cyan)' : 'var(--text-3)',
                  background: market === m ? 'var(--raise)' : 'transparent',
                  border: 0, borderRadius: 5, padding: '4px 9px', cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >{m === 'h2h' ? 'H2H' : m === 'spreads' ? 'Line' : 'Total'}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 14px' }}>
        {bars.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: 8 }}>
            No markets available.
          </div>
        )}
        {bars.map((b, i) => {
          const e = b.edge_pct ?? 0
          const w = Math.min(Math.abs(e) / emax * 50, 50)
          const pos = e >= 0
          return (
            <div key={b.bookmaker + i} style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            }}>
              <span style={{ width: 78, fontSize: 11, color: 'var(--text-2)', fontWeight: 500, flexShrink: 0 }}>{b.bookmaker}</span>
              <span style={{
                flex: 1, height: 22, background: 'var(--panel-2)',
                borderRadius: 5, position: 'relative', overflow: 'hidden',
              }}>
                <span style={{
                  position: 'absolute', left: '50%', top: 0, bottom: 0,
                  width: 1, background: 'var(--line-2)',
                }} />
                <span style={{
                  position: 'absolute',
                  top: 3, bottom: 3,
                  borderRadius: 3,
                  ...(pos
                    ? { left: '50%', width: `${w}%`, background: 'linear-gradient(90deg, var(--pos-dim), var(--pos))' }
                    : { right: '50%', width: `${w}%`, background: 'linear-gradient(90deg, var(--neg), var(--neg-dim))' }
                  ),
                }} />
              </span>
              <span style={{
                width: 52, textAlign: 'right', fontFamily: 'var(--mono)',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
                color: pos ? 'var(--pos)' : 'var(--neg)',
              }}>{(pos ? '+' : '') + e.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function prettyOutcome(outcome: string, home: string, away: string, market: MarketKey): string {
  if (market === 'h2h') return outcome
  if (market === 'totals') return outcome + ' total'
  return outcome + ' line'
}
