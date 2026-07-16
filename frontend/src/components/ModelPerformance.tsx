import React from 'react'

export default function ModelPerformance() {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 14px 11px' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Model Performance</span>
      </div>
      <div style={{ padding: '0 14px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 500 }}>30D Return (ROI)</span>
          <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--text-3)' }}>Last 30 days</span>
        </div>

        {/* Awaiting results — per DESIGN.md §9.0 */}
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-3)',
          letterSpacing: '-0.01em', margin: '12px 0 10px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            background: 'var(--raise)', border: '1px solid var(--line)',
            borderRadius: 8, padding: '6px 12px', fontSize: 12.5, color: 'var(--text-3)',
          }}>
            Awaiting results
          </span>
        </div>

        <div style={{
          fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 12,
        }}>
          Performance data will appear once enough settled events exist. Check back after the first settled fixtures.
        </div>

        {/* Stats placeholders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>Win Rate</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-3)', marginTop: 3 }}>–</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>Avg. Edge</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-3)', marginTop: 3 }}>–</div>
          </div>
        </div>
      </div>
    </div>
  )
}
