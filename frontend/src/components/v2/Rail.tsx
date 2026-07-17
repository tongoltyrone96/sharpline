import React from 'react'
import { useNavigate } from 'react-router-dom'

type NavKey = 'overview' | 'live' | 'models' | 'charts' | 'alerts' | 'settings'

interface Props {
  active: NavKey
  onNavigate?: (key: NavKey) => void
}

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
    key: 'live', title: 'Live', path: '/live',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M3 12h4l3 8 4-16 3 8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'models', title: 'Models', path: '/models',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3zM9.5 20h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'charts', title: 'Charts', path: '/charts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'alerts', title: 'Alerts', path: '/alerts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'settings', title: 'Settings', path: '/admin',
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
        const isBottom = item.key === 'settings'
        return (
          <React.Fragment key={item.key}>
            {isBottom && <div style={{ flex: 1 }} />}
            <a
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
                  content: '""', position: 'absolute',
                  left: -12, top: 9, bottom: 9, width: 2,
                  borderRadius: 2, background: 'var(--cyan)',
                }} />
              )}
            </a>
          </React.Fragment>
        )
      })}
    </nav>
  )
}
