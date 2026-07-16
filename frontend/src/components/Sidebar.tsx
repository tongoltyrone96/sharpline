import React from 'react'
import { getSportColor } from '../lib/colors'

interface SidebarProps {
  wsState: 'connecting' | 'connected' | 'disconnected'
  lastUpdated: string
}

const NAV_ITEMS = [
  { label: 'Overview',   active: true,  badge: null, plus: false, icon: '<path d="M3 12l9-8 9 8M6 10v10h12V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
  { label: 'Live Odds',  active: false, badge: null, plus: false, icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
  { label: 'Value Map',  active: false, badge: null, plus: false, icon: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="1.7"/>' },
  { label: 'AI Insights',active: false, badge: null, plus: false, icon: '<path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3zM9.5 20h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' },
  { label: 'Bet Builder',active: false, badge: null, plus: false, icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' },
  { label: 'Arbitrage',  active: false, badge: null, plus: false, icon: '<path d="M4 7h10l-3-3M20 17H10l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
  { label: 'My Models',  active: false, badge: null, plus: false, icon: '<circle cx="6" cy="7" r="2.5" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="7" r="2.5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="17" r="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M7.8 8.8L11 15M16.2 8.8L13 15" stroke="currentColor" stroke-width="1.5"/>' },
  { label: 'Alerts',     active: false, badge: '02', plus: false, icon: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' },
  { label: 'Portfolios', active: false, badge: null, plus: true,  icon: '<rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.7"/>' },
  { label: 'Reports',    active: false, badge: null, plus: false, icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.7"/>' },
  { label: 'Settings',   active: false, badge: null, plus: true,  icon: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 3h.1A1.7 1.7 0 0 0 9 1.4V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' },
  { label: 'Admin',      active: false, badge: null, plus: false, href: '#/admin', icon: '<rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' },
]

const BOOKMARKS = ['NRL', 'NBA', 'NFL', 'NHL', 'MLB', 'AFL']

const SPORT_KEY_BY_ABBR: Record<string, string> = {
  NRL: 'rugbyleague_nrl',
  AFL: 'aussierules_afl',
  NBA: 'basketball_nba',
  NBL: 'basketball_nbl',
  MLB: 'baseball_mlb',
  NFL: 'americanfootball_nfl',
  NHL: 'icehockey_nhl',
}

export default function Sidebar({ wsState, lastUpdated }: SidebarProps) {
  const isConnected = wsState === 'connected'
  const isConnecting = wsState === 'connecting'

  return (
    <aside style={{
      background: 'var(--panel-2)',
      borderRight: '1px solid var(--line)',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '16px 14px 15px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'linear-gradient(135deg,#4F7DF3,#8B5CF6)',
          display: 'grid', placeItems: 'center', flexShrink: 0
        }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <path d="M3 17l5-5 4 4 9-10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="21" cy="6" r="2" fill="#fff"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Sharpline</div>
          <div style={{ fontSize: 7, color: 'var(--text-3)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, marginTop: 2 }}>Odds Intelligence</div>
        </div>
      </div>

      {/* Main Nav */}
      <nav style={{ padding: '2px 10px' }}>
        {NAV_ITEMS.map(item => {
          const hasHref = 'href' in item
          const isClickable = item.active || hasHref
          return (
          <a
            key={item.label}
            href={hasHref ? (item as any).href : undefined}
            title={!isClickable ? 'Coming soon' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              color: item.active ? '#fff' : 'var(--text-2)',
              fontSize: 12.5, fontWeight: 500,
              cursor: isClickable ? 'pointer' : 'default',
              transition: '0.12s', marginBottom: 1,
              background: item.active ? 'var(--blue)' : 'transparent',
              textDecoration: 'none',
              opacity: item.active || hasHref ? 1 : 0.55,
            }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: item.active ? 1 : 0.75 }}
              dangerouslySetInnerHTML={{ __html: item.icon }}
            />
            {item.label}
            {item.badge && (
              <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--text-3)', fontWeight: 600 }}>{item.badge}</span>
            )}
            {item.plus && !item.badge && (
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-3)', lineHeight: 1 }}>+</span>
            )}
          </a>
        )})}
      </nav>

      {/* Bookmarks section */}
      <div style={{
        fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.13em',
        textTransform: 'uppercase', fontWeight: 700, padding: '16px 14px 7px',
        display: 'flex', alignItems: 'center'
      }}>
        Bookmarks <span style={{ marginLeft: 'auto', fontSize: 10 }}>›</span>
      </div>
      <nav style={{ padding: '2px 10px' }}>
        {BOOKMARKS.map(sport => {
          const color = getSportColor(SPORT_KEY_BY_ABBR[sport] ?? '') || '#8F9AAE'
          return (
            <a key={sport} title="Coming soon" style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px',
              borderRadius: 7, color: 'var(--text-2)', fontSize: 12, fontWeight: 500,
              cursor: 'default', opacity: 0.55,
            }}>
              <span style={{
                width: 17, height: 17, borderRadius: 5, display: 'grid',
                placeItems: 'center', fontSize: 6.5, fontWeight: 800,
                color: '#fff', flexShrink: 0, background: color
              }}>{sport}</span>
              {sport}
              <span style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: 'var(--blue)' }} />
            </a>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ marginTop: 'auto', padding: 10 }}>
        {/* Model Status */}
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 10, padding: '11px 12px', marginBottom: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6 }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M7 9h10M7 13h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            Model Status
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            Operational
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>All systems running</div>
        </div>

        {/* Last updated */}
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 10, padding: '11px 12px'
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6 }}>Last updated</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--blue)', fontWeight: 600, marginTop: 2 }}>
            <span style={{
              width: 13, height: 13, borderRadius: '50%',
              borderWidth: '1.8px',
              borderStyle: 'solid',
              borderColor: `${isConnecting || !isConnected ? 'var(--amber)' : 'var(--blue)'} transparent ${isConnecting || !isConnected ? 'var(--amber)' : 'var(--blue)'} ${isConnecting || !isConnected ? 'var(--amber)' : 'var(--blue)'}`,
              animation: 'spin 1.5s linear infinite',
              display: 'inline-block',
            }} />
            {lastUpdated}
          </div>
        </div>
      </div>
    </aside>
  )
}
