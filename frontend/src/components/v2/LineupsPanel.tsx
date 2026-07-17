import React from 'react'

interface Lineup {
  team: string
  player: string
  status: string
  reason?: string
  confirmed: boolean
}

interface Props {
  lineups: Lineup[]
}

function statusStyle(status: string): { bg: string; color: string; label: string } {
  const s = status.toLowerCase()
  if (s === 'out') return { bg: 'var(--neg-dim)', color: 'var(--neg)', label: 'OUT' }
  if (s === 'doubt' || s === 'doubtful' || s === 'questionable') return { bg: 'rgba(245,165,36,.14)', color: 'var(--amber)', label: 'DOUBT' }
  if (s === 'in' || s === 'confirmed') return { bg: 'var(--pos-dim)', color: 'var(--pos)', label: 'IN' }
  return { bg: 'var(--raise)', color: 'var(--text-2)', label: status.toUpperCase() }
}

export default function LineupsPanel({ lineups }: Props) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Lineups</span>
      </div>
      <div style={{ padding: '4px 0' }}>
        {lineups.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--text-3)' }}>
            Lineups not yet announced.
          </div>
        ) : (
          lineups.map((l, i) => {
            const s = statusStyle(l.status)
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', borderBottom: i === lineups.length - 1 ? 'none' : '1px solid var(--line)',
                fontSize: 12,
              }}>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                  width: 52, textAlign: 'center',
                  background: s.bg, color: s.color,
                }}>{s.label}</span>
                <span style={{ fontWeight: 500 }}>{l.player}</span>
                {l.reason && (
                  <span style={{
                    marginLeft: 'auto', fontFamily: 'var(--mono)',
                    fontSize: 10, color: 'var(--text-3)',
                  }}>{l.reason}</span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
