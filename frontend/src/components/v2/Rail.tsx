import React from 'react'
import { useNavigate } from 'react-router-dom'

type NavKey = 'overview' | 'settings'

interface Props {
  active: NavKey
  onNavigate?: (key: NavKey) => void
}

/**
 * Rail contains only routes that actually exist. Live/Models/Charts/Alerts
 * icons were removed because they had no destination — a button that looks
 * clickable but goes nowhere is worse than no button.
 */
const ITEMS: { key: NavKey; title: string; icon: React.ReactNode; path: string }[] = [
  {
    key: 'overview', title: 'Overview', path: '/',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.7"/>
        <rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.7"/>
        <rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.7"/>
        <rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.7"/>
      </svg>
    ),
  },
  {
    key: 'settings', title: 'Admin', path: '/admin',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
]

export default function Rail({ active, onNavigate }: Props) {
  const navigate = useNavigate()
  return (
    <nav className="rail" style={{
      background: 'var(--panel-2)', borderRight: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 0', gap: 4,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: 'linear-gradient(135deg, var(--cyan), var(--blue))',
        display: 'grid', placeItems: 'center', marginBottom: 14, flexShrink: 0,
      }}>
        <svg width={19} height={19} viewBox="0 0 24 24" fill="none">
          <path d="M3 17l5-5 4 4 9-10" stroke="#061018" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx={21} cy={6} r={2} fill="#061018"/>
        </svg>
      </div>

      {ITEMS.map(item => {
        const on = item.key === active
        return (
          <a
            key={item.key}
            title={item.title}
            onClick={() => {
              navigate(item.path)
              onNavigate?.(item.key)
            }}
            style={{
              width: 38, height: 38, borderRadius: 9,
              display: 'grid', placeItems: 'center',
              color: on ? 'var(--cyan)' : 'var(--text-3)',
              background: on ? 'var(--cyan-dim)' : 'transparent',
              cursor: 'pointer', position: 'relative',
              transition: 'background .12s, color .12s',
            }}
          >
            <div style={{ width: 18, height: 18 }}>{item.icon}</div>
            {on && (
              <span style={{
                position: 'absolute',
                left: -12, top: 9, bottom: 9, width: 2,
                borderRadius: 2, background: 'var(--cyan)',
              }} />
            )}
          </a>
        )
      })}
    </nav>
  )
}
