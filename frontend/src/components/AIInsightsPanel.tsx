import React, { useState } from 'react'
import { getBookColor } from '../lib/colors'
import { fmtEdge, fmtPrice } from '../lib/format'
import { useOpportunities } from '../hooks/useOpportunities'

export default function AIInsightsPanel() {
  const { data, loading } = useOpportunities(6)
  const [showAll, setShowAll] = useState(false)

  const allRows = data?.rows ?? []
  const rows = showAll ? allRows : allRows.slice(0, 6)
  const scanned = data?.total_scanned ?? 0

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 14px 11px' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>AI Insights</span>
        {!loading && scanned > 0 && (
          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}>
            {scanned} bets scanned
          </span>
        )}
        {allRows.length > 6 && (
          <span
            onClick={() => setShowAll(s => !s)}
            style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--blue)', fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}
          >
            {showAll ? 'Show less' : `View all (${allRows.length})`}
          </span>
        )}
      </div>

      {/* Top value section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-2)', padding: '0 14px 9px' }}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" style={{ color: 'var(--amber)' }}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor"/>
        </svg>
        Top value opportunities
      </div>

      {loading ? (
        <div style={{ padding: '6px 14px 10px', fontSize: 11.5, color: 'var(--text-3)' }}>
          Scanning markets…
        </div>
      ) : rows.length > 0 ? (
        rows.map((row, i) => {
          const bc = getBookColor(row.bookmaker)
          const marketLabel = row.market === 'h2h' ? 'H2H' : row.market === 'spreads' ? `Line ${row.point != null ? (row.point > 0 ? '+' : '') + row.point : ''}` : `O/U ${row.point ?? ''}`
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 14px' }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '3px 5px',
                borderRadius: 4, flexShrink: 0,
                background: bc.bg + '22', color: bc.bg,
                border: `1px solid ${bc.bg}44`,
                whiteSpace: 'nowrap',
              }}>{row.bookmaker}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.outcome}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 1 }}>
                  {marketLabel} · {fmtPrice(row.price)}
                </div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>
                {fmtEdge(row.edge_pct)}
              </span>
            </div>
          )
        })
      ) : (
        <div style={{ padding: '8px 14px 12px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
            No value bets in the current market.
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.4, opacity: 0.75 }}>
            The model found no positive-edge opportunities across {scanned > 0 ? `${scanned} bets scanned` : 'all markets'}. This is a valid result — it means the market is efficiently priced right now.
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--line)', margin: '11px 0 0' }} />

      {/* Market movers — placeholder until line movement tracking is wired */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 14px 4px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Market movers</span>
        <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}>Line movement tracking</span>
      </div>

      <div style={{ padding: '8px 14px 14px', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Line movement alerts will appear here as odds shift. Currently monitoring {scanned > 0 ? `${scanned} markets` : 'all markets'}.
      </div>
    </div>
  )
}
