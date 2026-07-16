import React, { useState, useEffect } from 'react'

export default function TopBar() {
  const [seconds, setSeconds] = useState(2)

  useEffect(() => {
    const id = setInterval(() => setSeconds(s => s >= 9 ? 2 : s + 1), 1000)
    return () => clearInterval(id)
  }, [])

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
        Updated <span>{seconds}</span>s ago
      </span>

      {/* Bell icon */}
      <div style={{
        position: 'relative', width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: 'var(--panel)', border: '1px solid var(--line)',
        display: 'grid', placeItems: 'center',
        color: 'var(--text-2)', cursor: 'pointer',
      }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{
          position: 'absolute', top: -4, right: -4,
          background: 'var(--blue)', color: '#fff',
          fontSize: 8.5, fontWeight: 700,
          minWidth: 15, height: 15, borderRadius: 8,
          display: 'grid', placeItems: 'center',
          border: '2px solid var(--bg)',
        }}>9</span>
      </div>

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
