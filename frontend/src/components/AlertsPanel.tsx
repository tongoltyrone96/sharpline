import React from 'react'

export default function AlertsPanel() {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
      <div style={{ padding: '13px 14px 11px' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Alerts</span>
      </div>
      <div style={{ padding: '8px 14px 14px', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
        No alerts configured.
      </div>
    </div>
  )
}
