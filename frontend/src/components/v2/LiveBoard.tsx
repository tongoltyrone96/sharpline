import React, { useState } from 'react'
import { DashboardEvent } from '../../hooks/useDashboard'
import { getSportAbbr, getSportColor } from '../../lib/colors'

interface Props {
  events: DashboardEvent[]
  loading?: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenGame?: (id: string) => void
  searchQuery?: string
  valueOnly?: boolean
}

function confColor(pct: number): string {
  if (pct >= 70) return 'var(--pos)'
  if (pct >= 55) return 'var(--amber)'
  return 'var(--neg)'
}

function fmtEdge(v: number | null): string {
  if (v == null) return '–'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

function fmtPrice(price: number | null | undefined): string {
  if (price == null) return '–'
  return price.toFixed(2)
}

const SPORT_FILTERS = ['ALL', 'AFL', 'NRL', 'NBA', 'NFL', 'MLB']

/** Match backend opportunities cap: rows above this are almost always
 * de-vig or feed anomalies, not real value. */
const MAX_PLAUSIBLE_EDGE = 20.0

export default function LiveBoard({
  events, loading, selectedId, onSelect, onOpenGame, searchQuery = '', valueOnly = false,
}: Props) {
  const [filter, setFilter] = useState<string>('ALL')

  const q = searchQuery.trim().toLowerCase()

  const filtered = events
    .filter(e => filter === 'ALL' || getSportAbbr(e.sport_key) === filter)
    .filter(e => {
      if (!q) return true
      return (
        e.home_team.toLowerCase().includes(q)
        || e.away_team.toLowerCase().includes(q)
        || e.home_abbr.toLowerCase().includes(q)
        || e.away_abbr.toLowerCase().includes(q)
        || e.sport_title.toLowerCase().includes(q)
      )
    })
    .map(e => {
      // Suppress outlier edges (> 20%) — they're de-vig anomalies, not real value
      if (e.best_edge_pct != null && e.best_edge_pct > MAX_PLAUSIBLE_EDGE) {
        return { ...e, best_edge_pct: null }
      }
      return e
    })
    .filter(e => !valueOnly || (e.best_edge_pct != null && e.best_edge_pct > 0))

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Live Board</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>// model vs market</span>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{
            display: 'flex', gap: 2, background: 'var(--panel-2)',
            border: '1px solid var(--line)', borderRadius: 7, padding: 2,
          }}>
            {SPORT_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: 10.5, fontFamily: 'var(--mono)', fontWeight: 500,
                  color: filter === f ? 'var(--cyan)' : 'var(--text-3)',
                  background: filter === f ? 'var(--raise)' : 'transparent',
                  border: 0, borderRadius: 5, padding: '4px 9px', cursor: 'pointer',
                }}
              >{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              {['Match', 'Home', 'Away', 'Edge', 'Confidence'].map((h, i) => (
                <th key={h} style={{
                  fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '.06em',
                  textAlign: i === 0 ? 'left' : 'right',
                  padding: i === 0 ? '9px 12px 9px 14px' : '9px 12px',
                  fontWeight: 600, borderBottom: '1px solid var(--line)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Loading fixtures…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                {q
                  ? `No matches for "${searchQuery}"`
                  : valueOnly
                    ? 'No positive-edge fixtures right now'
                    : 'No fixtures in feed'}
              </td></tr>
            )}
            {filtered.map(e => {
              const sportAbbr = getSportAbbr(e.sport_key)
              const sportColor = getSportColor(e.sport_key)
              // Per-side fair prices from the model's win probabilities
              const homeFair = e.home_win_prob ? 1 / e.home_win_prob : null
              const awayFair = e.away_win_prob ? 1 / e.away_win_prob : null
              const edge = e.best_edge_pct
              const conf = e.confidence != null ? Math.round(e.confidence * 100) : null
              const isSelected = e.id === selectedId
              return (
                <tr
                  key={e.id}
                  onClick={() => onSelect(e.id)}
                  onDoubleClick={() => onOpenGame?.(e.id)}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? 'var(--raise)' : 'transparent',
                  }}
                  title="Click to preview · double-click to open detail"
                  onMouseEnter={ev => { if (!isSelected) (ev.currentTarget as HTMLTableRowElement).style.background = 'var(--raise)' }}
                  onMouseLeave={ev => { if (!isSelected) (ev.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                >
                  <td style={{ padding: '11px 12px 11px 14px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
                        color: '#fff', padding: '2px 5px', borderRadius: 4,
                        background: sportColor, letterSpacing: '.02em',
                      }}>{sportAbbr}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{e.home_team}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: 1 }}>vs {e.away_team}</div>
                      </div>
                    </div>
                  </td>
                  <PriceCell price={e.home_h2h_price} fair={homeFair} />
                  <PriceCell price={e.away_h2h_price} fair={awayFair} />
                  <td style={{
                    padding: '11px 12px', textAlign: 'right',
                    borderBottom: '1px solid var(--line)',
                    fontFamily: 'var(--mono)', fontSize: 12.5,
                  }}>
                    {edge != null ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 600,
                        padding: '3px 8px', borderRadius: 6,
                        background: edge >= 0 ? 'var(--pos-dim)' : 'var(--neg-dim)',
                        color: edge >= 0 ? 'var(--pos)' : 'var(--neg)',
                      }}>{fmtEdge(edge)}</span>
                    ) : <span style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  <td style={{
                    padding: '11px 12px', textAlign: 'right',
                    borderBottom: '1px solid var(--line)',
                  }}>
                    {conf != null ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end',
                      }}>
                        <span style={{ width: 46, height: 5, borderRadius: 3, background: 'var(--raise)', overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${conf}%`, background: confColor(conf), borderRadius: 3 }} />
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, width: 32, textAlign: 'right' }}>{conf}%</span>
                      </span>
                    ) : <span style={{ color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11.5 }}>–</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Cell showing the best bookmaker H2H price on top and the model's
 * fair price on a small subtitle beneath. Cyan = book price is above
 * fair (value), red = below fair, muted = no signal. */
function PriceCell({ price, fair }: { price: number | null | undefined; fair: number | null | undefined }) {
  const priceColor = price != null && fair != null
    ? price > fair ? 'var(--pos)' : price < fair ? 'var(--neg)' : 'var(--text)'
    : 'var(--text)'
  return (
    <td style={{
      padding: '11px 12px', textAlign: 'right',
      borderBottom: '1px solid var(--line)',
      fontFamily: 'var(--mono)',
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: priceColor }}>
        {fmtPrice(price)}
      </div>
      {fair != null && (
        <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 1 }}>
          fair {fmtPrice(fair)}
        </div>
      )}
    </td>
  )
}
