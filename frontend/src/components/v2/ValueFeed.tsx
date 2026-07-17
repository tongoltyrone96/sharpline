import React from 'react'
import { useOpportunities } from '../../hooks/useOpportunities'
import { getBookColor } from '../../lib/colors'

interface Props {
  onOpenEvent?: (id: string) => void
}

export default function ValueFeed({ onOpenEvent }: Props) {
  const { data, loading } = useOpportunities(10)
  const rows = data?.rows ?? []
  const scanned = data?.total_scanned ?? 0

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Value Feed</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>// ranked by edge</span>
        <span style={{
          marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10,
          color: 'var(--text-3)',
        }}>{scanned} scanned</span>
      </div>

      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 14, fontSize: 11.5, color: 'var(--text-3)' }}>Scanning markets…</div>
        )}
        {!loading && rows.length === 0 && (
          <div style={{ padding: 14, fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
            No positive-edge bets right now. Market is efficiently priced.
          </div>
        )}
        {rows.map((row, i) => {
          const bc = getBookColor(row.bookmaker)
          const marketLabel =
            row.market === 'h2h' ? 'H2H'
            : row.market === 'spreads' ? `Line ${row.point != null ? (row.point > 0 ? '+' : '') + row.point : ''}`
            : `O/U ${row.point ?? ''}`
          return (
            <div
              key={i}
              onClick={() => onOpenEvent?.(row.event_id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderBottom: '1px solid var(--line)',
                cursor: onOpenEvent ? 'pointer' : 'default',
              }}
              onMouseEnter={ev => onOpenEvent && ((ev.currentTarget as HTMLDivElement).style.background = 'var(--raise)')}
              onMouseLeave={ev => onOpenEvent && ((ev.currentTarget as HTMLDivElement).style.background = 'transparent')}
            >
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
                color: '#fff', padding: '3px 5px', borderRadius: 4,
                background: bc.bg, flexShrink: 0, width: 40, textAlign: 'center',
              }}>{row.bookmaker.slice(0, 2).toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.outcome}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                  {marketLabel} · {row.price.toFixed(2)}
                  {row.fair_price != null && <> → fair {row.fair_price.toFixed(2)}</>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600,
                  color: 'var(--pos)',
                }}>{(row.edge_pct >= 0 ? '+' : '') + row.edge_pct.toFixed(1)}%</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
