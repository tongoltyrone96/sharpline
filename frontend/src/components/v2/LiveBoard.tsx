import React, { useState } from 'react'
import Sparkline from './Sparkline'
import { DashboardEvent } from '../../hooks/useDashboard'
import { getSportAbbr, getSportColor } from '../../lib/colors'

interface Props {
  events: DashboardEvent[]
  loading?: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenGame?: (id: string) => void
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

function fmtFair(price: number | null): string {
  if (price == null) return '–'
  return price.toFixed(2)
}

/**
 * Deterministic trend spark — seeded by event id so it's stable across
 * re-renders but different per row. Ends on the sign of the row's edge.
 * NOTE: this is a visual placeholder for line movement; the real
 * per-outcome history lives in /api/v1/events/{id}/history and is
 * rendered in the LineMovementChart on Phase C's game page.
 */
function trendPoints(id: string, up: boolean): number[] {
  let s = 0
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) & 0x7fffffff
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const N = 10
  const arr: number[] = []
  let v = 0.5
  for (let i = 0; i < N; i++) {
    v += (r() - 0.5) * 0.4
    v = Math.max(0.15, Math.min(0.85, v))
    arr.push(v)
  }
  arr[N - 1] = up ? Math.max(...arr) : Math.min(...arr)
  return arr
}

const SPORT_FILTERS = ['ALL', 'AFL', 'NRL', 'NBA', 'NFL', 'MLB']

/** Match backend opportunities cap: rows above this are almost always
 * de-vig or feed anomalies, not real value. */
const MAX_PLAUSIBLE_EDGE = 20.0

export default function LiveBoard({ events, loading, selectedId, onSelect, onOpenGame }: Props) {
  const [filter, setFilter] = useState<string>('ALL')

  const filtered = (filter === 'ALL'
    ? events
    : events.filter(e => getSportAbbr(e.sport_key) === filter)
  ).map(e => {
    // Suppress outlier edges (> 20%) — they're de-vig anomalies, not real value
    if (e.best_edge_pct != null && e.best_edge_pct > MAX_PLAUSIBLE_EDGE) {
      return { ...e, best_edge_pct: null }
    }
    return e
  })

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
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr>
              {['Match', 'Fair', 'Edge', 'Confidence', 'Trend'].map((h, i) => (
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
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>No fixtures in feed</td></tr>
            )}
            {filtered.map(e => {
              const sportAbbr = getSportAbbr(e.sport_key)
              const sportColor = getSportColor(e.sport_key)
              // Fair price = the model's fair price for the favourite
              const homeFav = (e.home_win_prob ?? 0) >= (e.away_win_prob ?? 0)
              const fair = homeFav
                ? (e.home_win_prob ? 1 / e.home_win_prob : null)
                : (e.away_win_prob ? 1 / e.away_win_prob : null)
              const edge = e.best_edge_pct
              const conf = e.confidence != null ? Math.round(e.confidence * 100) : null
              const isSelected = e.id === selectedId
              const trend = trendPoints(e.id, (edge ?? 0) >= 0)
              return (
                <tr
                  key={e.id}
                  onClick={() => {
                    onSelect(e.id)
                    onOpenGame?.(e.id)
                  }}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? 'var(--raise)' : 'transparent',
                  }}
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
                  <td style={{
                    padding: '11px 12px', textAlign: 'right',
                    borderBottom: '1px solid var(--line)',
                    fontFamily: 'var(--mono)', fontSize: 12.5,
                  }}>{fmtFair(fair)}</td>
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
                  <td style={{
                    padding: '11px 12px', textAlign: 'right',
                    borderBottom: '1px solid var(--line)',
                    width: 68,
                  }}>
                    <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                      <Sparkline
                        values={trend}
                        color={(edge ?? 0) >= 0 ? '#34D399' : '#F26D6D'}
                        width={60} height={22} strokeWidth={1.3}
                      />
                    </div>
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
