import React, { useMemo, useState } from 'react'
import { getBookColor } from '../../lib/colors'

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
  fairHomePrice: number | null
  fairAwayPrice: number | null
  projectedMargin: number | null
  projectedTotal: number | null
  homeName: string
  awayName: string
}

type MarketKey = 'h2h' | 'line' | 'total'

/**
 * All Markets table — REQ-8 compliant. Every bookmaker shows its OWN
 * point/line; we never collapse rows to a shared point. Fair-price
 * row highlights the model's independent view.
 */
export default function AllMarketsTable(props: Props) {
  const { h2h, spreads, totals, fairHomePrice, fairAwayPrice, projectedMargin, projectedTotal, homeName, awayName } = props
  const [market, setMarket] = useState<MarketKey>('h2h')

  const view = useMemo(() => buildView(market, { h2h, spreads, totals, homeName, awayName }), [market, h2h, spreads, totals, homeName, awayName])

  const fairRow = market === 'h2h'
    ? { cells: [
        { text: fairHomePrice != null ? fairHomePrice.toFixed(2) : '–' },
        { text: '—' },
        { text: fairAwayPrice != null ? fairAwayPrice.toFixed(2) : '–' },
        { text: '—' },
      ]}
    : market === 'line'
    ? { cells: [
        { text: projectedMargin != null ? (projectedMargin > 0 ? '+' : '') + projectedMargin.toFixed(2) : '–' },
        { text: projectedMargin != null ? '2.00' : '–' /* at fair line: P(cover)=0.5 → fair no-vig = 2.00 */ },
        { text: '—' },
        { text: projectedMargin != null ? (-projectedMargin > 0 ? '+' : '') + (-projectedMargin).toFixed(2) : '–' },
        { text: projectedMargin != null ? '2.00' : '–' },
      ]}
    : { cells: [
        { text: projectedTotal != null ? projectedTotal.toFixed(2) : '–' },
        { text: projectedTotal != null ? '2.00' : '–' },
        { text: '—' },
        { text: projectedTotal != null ? '2.00' : '–' },
        { text: '—' },
      ]}

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>All Markets</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.07em',
        }}>// each book own line</span>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{
            display: 'flex', gap: 2, background: 'var(--panel-2)',
            border: '1px solid var(--line)', borderRadius: 8, padding: 3,
          }}>
            {(['h2h', 'line', 'total'] as MarketKey[]).map(m => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                style={{
                  fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500,
                  color: market === m ? 'var(--cyan)' : 'var(--text-3)',
                  background: market === m ? 'var(--raise)' : 'transparent',
                  border: 0, borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >{m === 'h2h' ? 'H2H' : m === 'line' ? 'Line' : 'Totals'}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              {view.head.map((h, i) => (
                <th key={i} style={{
                  fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '.05em',
                  textAlign: i === 0 ? 'left' : 'right',
                  padding: i === 0 ? '9px 12px 9px 14px' : '9px 12px',
                  fontWeight: 600, borderBottom: '1px solid var(--line)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Fair row */}
            <tr style={{ background: 'var(--cyan-dim)' }}>
              <td style={{
                padding: '10px 12px 10px 14px',
                fontFamily: 'var(--ui)', fontSize: 12,
                borderBottom: '1px solid var(--line)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--cyan)' }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 5,
                    background: 'var(--cyan)', display: 'grid', placeItems: 'center',
                    fontSize: 7, fontWeight: 700, color: '#04140f',
                  }}>AI</span>
                  Fair Price
                </span>
              </td>
              {fairRow.cells.map((c, i) => (
                <td key={i} style={{
                  padding: '10px 12px', textAlign: 'right',
                  fontFamily: 'var(--mono)', fontSize: 12.5,
                  color: 'var(--cyan)', fontWeight: 600,
                  borderBottom: '1px solid var(--line)',
                }}>{c.text}</td>
              ))}
            </tr>
            {/* Data rows */}
            {view.rows.length === 0 && (
              <tr>
                <td colSpan={view.head.length} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                  No {market === 'h2h' ? 'H2H' : market === 'line' ? 'line' : 'totals'} markets available yet
                </td>
              </tr>
            )}
            {view.rows.map((r, idx) => (
              <tr
                key={idx}
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--raise)'}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
              >
                <td style={{
                  padding: '10px 12px 10px 14px',
                  fontFamily: 'var(--ui)', fontSize: 12,
                  borderBottom: '1px solid var(--line)',
                }}>
                  <BookLabel name={r.bookmaker} />
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} style={{
                    padding: '10px 12px', textAlign: 'right',
                    fontFamily: 'var(--mono)', fontSize: 12.5,
                    borderBottom: '1px solid var(--line)',
                    background: c.best ? 'var(--pos-dim)' : undefined,
                    boxShadow: c.best ? 'inset 0 0 0 1px rgba(52,211,153,.3)' : undefined,
                    borderRadius: c.best ? 5 : undefined,
                    color: c.isEdge ? (c.edgeVal! >= 0 ? 'var(--pos)' : 'var(--neg)') : 'var(--text)',
                    fontWeight: c.isEdge || c.best ? 600 : 400,
                  }}>{c.text}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BookLabel({ name }: { name: string }) {
  const bc = getBookColor(name)
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 12 }}>
      <span style={{
        width: 16, height: 16, borderRadius: 5,
        background: bc.bg, display: 'grid', placeItems: 'center',
        fontSize: 7, fontWeight: 700, color: '#fff',
      }}>{bc.abbr}</span>
      {name}
    </span>
  )
}

interface Cell {
  text: string
  isEdge?: boolean
  edgeVal?: number
  best?: boolean
}

interface Row {
  bookmaker: string
  cells: Cell[]
}

interface View {
  head: string[]
  rows: Row[]
}

function fmtPoint(p: number | null): string {
  if (p == null) return '–'
  return (p > 0 ? '+' : '') + p.toFixed(1)
}

function fmtEdge(v: number | null): string {
  if (v == null) return '–'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

/**
 * Build the table view for a market. Each bookmaker keeps its own line —
 * we do NOT collapse or share points across rows (REQ-8).
 */
function buildView(
  market: MarketKey,
  data: { h2h: MarketRow[]; spreads: MarketRow[]; totals: MarketRow[]; homeName: string; awayName: string },
): View {
  const { h2h, spreads, totals, homeName, awayName } = data

  if (market === 'h2h') {
    const bmSet = Array.from(new Set(h2h.map(r => r.bookmaker)))
    const rows: Row[] = bmSet.map(bm => {
      const home = h2h.find(r => r.bookmaker === bm && r.outcome === homeName)
      const away = h2h.find(r => r.bookmaker === bm && r.outcome === awayName)
      return {
        bookmaker: bm,
        cells: [
          { text: home?.price.toFixed(2) ?? '–', best: home?.is_best ?? false },
          { text: fmtEdge(home?.edge_pct ?? null), isEdge: true, edgeVal: home?.edge_pct ?? undefined },
          { text: away?.price.toFixed(2) ?? '–', best: away?.is_best ?? false },
          { text: fmtEdge(away?.edge_pct ?? null), isEdge: true, edgeVal: away?.edge_pct ?? undefined },
        ],
      }
    })
    return { head: ['Bookmaker', homeName, 'Edge', awayName, 'Edge'], rows }
  }

  if (market === 'line') {
    const bmSet = Array.from(new Set(spreads.map(r => r.bookmaker)))
    const rows: Row[] = bmSet.map(bm => {
      const home = spreads.find(r => r.bookmaker === bm && r.outcome === homeName)
      const away = spreads.find(r => r.bookmaker === bm && r.outcome === awayName)
      return {
        bookmaker: bm,
        cells: [
          { text: fmtPoint(home?.point ?? null) },
          { text: home?.price.toFixed(2) ?? '–', best: home?.is_best ?? false },
          { text: fmtEdge(home?.edge_pct ?? null), isEdge: true, edgeVal: home?.edge_pct ?? undefined },
          { text: fmtPoint(away?.point ?? null) },
          { text: away?.price.toFixed(2) ?? '–', best: away?.is_best ?? false },
        ],
      }
    })
    return { head: ['Bookmaker', `Line (${homeName})`, 'Price', 'Edge', `Line (${awayName})`, 'Price'], rows }
  }

  // totals
  const bmSet = Array.from(new Set(totals.map(r => r.bookmaker)))
  const rows: Row[] = bmSet.map(bm => {
    const over = totals.find(r => r.bookmaker === bm && r.outcome === 'Over')
    const under = totals.find(r => r.bookmaker === bm && r.outcome === 'Under')
    const point = over?.point ?? under?.point ?? null
    return {
      bookmaker: bm,
      cells: [
        { text: point != null ? point.toFixed(1) : '–' },
        { text: over?.price.toFixed(2) ?? '–', best: over?.is_best ?? false },
        { text: fmtEdge(over?.edge_pct ?? null), isEdge: true, edgeVal: over?.edge_pct ?? undefined },
        { text: under?.price.toFixed(2) ?? '–', best: under?.is_best ?? false },
        { text: fmtEdge(under?.edge_pct ?? null), isEdge: true, edgeVal: under?.edge_pct ?? undefined },
      ],
    }
  })
  return { head: ['Bookmaker', 'Total', 'Over', 'Edge', 'Under', 'Edge'], rows }
}
