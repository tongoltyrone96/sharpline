import React from 'react'

interface TopBarProps {
  lastUpdated: string
}

export default function TopBar({ lastUpdated }: TopBarProps) {

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px',
      borderBottom: '1px solid var(--line)',
      background: 'rgba(10,13,20,0.9)',
      backdropFilter: 'blur(12px)',
      position: 'sticky', top: 0, zIndex: 40,
      minHeight: 52,
    }}>
      {/* Search — hidden on phones via CSS class */}
      <div className="topbar-search" style={{
        flex: 1, maxWidth: 400, display: 'flex', alignItems: 'center', gap: 9,
        background: 'var(--panel)', border: '1px solid var(--line)',
        borderRadius: 9, padding: '8px 12px',
        color: 'var(--text-3)', fontSize: 12.5,
      }}>
        Search for teams, leagues or players...
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.9"/>
          <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Spacer so right-side items push right on mobile when search hidden */}
      <div style={{ flex: 1 }} />

      {/* Live pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        border: '1px solid rgba(34,197,94,.3)', background: 'var(--green-dim)',
        color: 'var(--green)', fontSize: 11.5, fontWeight: 600,
        padding: '6px 10px', borderRadius: 7,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
          animation: 'pulse 2s infinite', display: 'inline-block', flexShrink: 0,
        }} />
        Live
      </div>

      {/* Updated text — hidden on phones */}
      <span className="topbar-updated" style={{ fontSize: 11.5, color: 'var(--text-3)', flexShrink: 0 }}>
        Updated {lastUpdated}
      </span>

      {/* User avatar — always visible; name/plan hidden on phones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg,#4F7DF3,#8B5CF6)',
          display: 'grid', placeItems: 'center',
          fontWeight: 700, fontSize: 11, color: '#fff',
        }}>AR</div>
        <div className="topbar-user-label">
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>Alex R.</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Pro Plan</div>
        </div>
        <span className="topbar-user-label" style={{ color: 'var(--text-3)', fontSize: 9 }}>▾</span>
      </div>
    </div>
  )
}
