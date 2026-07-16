import React from 'react'

const ALERTS = [
  { label: 'Line movement', count: '5 alerts' },
  { label: 'Value threshold', count: '4 alerts' },
  { label: 'Team news', count: '3 alerts' },
]

export default function AlertsPanel() {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 14px 11px' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Alerts</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--blue)', fontWeight: 500, cursor: 'pointer' }}>12 active</span>
      </div>
      {ALERTS.map((a, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', padding: '9px 14px',
          borderTop: i === 0 ? 'none' : '1px solid var(--line)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>{a.label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{a.count}</span>
        </div>
      ))}
    </div>
  )
}
