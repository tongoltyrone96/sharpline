import React from 'react'

interface LineupEntry {
  team: string
  player: string
  status: 'out' | 'doubtful' | 'in' | string
  reason?: string
  confirmed: boolean
}

interface LineupPanelProps {
  lineups: LineupEntry[]
}

function StatusBadge({ status, confirmed }: { status: string; confirmed: boolean }) {
  let bg: string
  let color: string
  let label: string

  if (status === 'out') {
    bg = 'var(--red-dim)'; color = 'var(--red)'; label = 'OUT'
  } else if (status === 'doubtful') {
    bg = 'rgba(245,158,11,.12)'; color = 'var(--amber)'; label = 'DOUBTFUL'
  } else {
    bg = 'var(--green-dim)'; color = 'var(--green)'; label = 'IN'
  }

  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: bg, color, marginRight: 6,
    }}>{label}</span>
  )
}

function ConfirmedBadge({ confirmed }: { confirmed: boolean }) {
  if (confirmed) {
    return (
      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--green)', background: 'var(--green-dim)', padding: '1px 5px', borderRadius: 3 }}>
        Confirmed
      </span>
    )
  }
  return (
    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--amber)', background: 'rgba(245,158,11,.12)', padding: '1px 5px', borderRadius: 3 }}>
      Provisional
    </span>
  )
}

export default function LineupPanel({ lineups }: LineupPanelProps) {
  if (!lineups || lineups.length === 0) return null

  // Sort: out + doubtful first, then in
  const sorted = [...lineups].sort((a, b) => {
    const priority = (s: string) => s === 'out' ? 0 : s === 'doubtful' ? 1 : 2
    return priority(a.status) - priority(b.status)
  })

  return (
    <div style={{
      background: 'var(--panel-2)', border: '1px solid var(--line)',
      borderRadius: 8, padding: '10px 12px', marginTop: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Lineup News</div>
      {sorted.map((entry, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: i > 0 ? '6px 0 0' : '0',
          borderTop: i > 0 ? '1px solid var(--line)' : 'none',
        }}>
          <StatusBadge status={entry.status} confirmed={entry.confirmed} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{entry.player}</span>
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>{entry.team}</span>
            {entry.reason && (
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>— {entry.reason}</span>
            )}
          </div>
          <ConfirmedBadge confirmed={entry.confirmed} />
        </div>
      ))}
    </div>
  )
}
