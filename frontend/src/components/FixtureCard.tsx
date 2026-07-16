import React from 'react'
import TeamJersey from './TeamJersey'
import { DashboardEvent } from '../hooks/useDashboard'
import { getSportColor, getSportAbbr } from '../lib/colors'
import { fmtEdge, fmtPrice, fmtTime } from '../lib/format'

interface FixtureCardProps {
  event: DashboardEvent
  selected: boolean
  onClick: () => void
  snapOnMobile?: boolean  // kept for API compat, no longer used
}

function derivePattern(color: string): 'hoop' | 'stripe' | 'vstripe' | 'chevron' | 'sash' | 'half' {
  // Use color hash to deterministically pick a pattern
  let hash = 0
  for (let i = 0; i < color.length; i++) hash = color.charCodeAt(i) + ((hash << 5) - hash)
  const patterns: Array<'hoop' | 'stripe' | 'vstripe' | 'chevron' | 'sash' | 'half'> = ['stripe', 'hoop', 'chevron', 'vstripe', 'sash', 'half']
  return patterns[Math.abs(hash) % patterns.length]
}

export default function FixtureCard({ event, selected, onClick, snapOnMobile }: FixtureCardProps) {
  const isLive = event.status === 'live' || event.status === 'in_progress'
  const sportColor = getSportColor(event.sport_key)
  const sportAbbr = getSportAbbr(event.sport_key) || event.sport_title

  const homeColor2 = event.home_secondary_color || '#C0C0C0'
  const awayColor2 = event.away_secondary_color || '#C0C0C0'
  const homePattern = derivePattern(event.home_color + 'h')
  const awayPattern = derivePattern(event.away_color + 'a')

  return (
    <div
      className="fixture-card"
      onClick={onClick}
      style={{
        flex: '1 0 220px', minWidth: 220,
        background: selected ? 'var(--raise)' : 'var(--panel)',
        border: `1px solid ${selected ? '#3B82F6' : '#20242F'}`,
        borderRadius: 'var(--r)', padding: '10px 10px 11px',
        cursor: 'pointer',
        transform: 'translateZ(0)',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'var(--raise)', borderRadius: 5, padding: '3px 6px',
        }}>
          <span style={{
            width: 12, height: 12, borderRadius: 3, display: 'grid', placeItems: 'center',
            fontSize: 5, fontWeight: 800, color: '#fff', background: sportColor,
          }}>{sportAbbr}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.02em' }}>{sportAbbr}</span>
        </span>
        <span style={{
          fontSize: 10, color: isLive ? 'var(--red)' : 'var(--text-3)',
          fontWeight: isLive ? 700 : 500,
        }}>
          {isLive ? 'LIVE' : fmtTime(event.commence_time)}
        </span>
        {event.best_edge_pct != null && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>
            {fmtEdge(event.best_edge_pct)}
          </span>
        )}
      </div>

      {/* Teams */}
      <div className="fixture-teams" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 9 }}>
        {/* Home */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          <TeamJersey c1={event.home_color} c2={homeColor2} pattern={homePattern} size={40} className="fixture-jersey" />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>{event.home_abbr}</span>
          <span style={{ fontSize: 9.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{event.home_team}</span>
          <span style={{ fontSize: 15, fontWeight: 700, marginTop: 1 }}>
            {event.home_h2h_price != null ? fmtPrice(event.home_h2h_price) : '–'}
          </span>
        </div>

        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, flexShrink: 0, paddingBottom: 22 }}>VS</span>

        {/* Away */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          <TeamJersey c1={event.away_color} c2={awayColor2} pattern={awayPattern} size={40} className="fixture-jersey" />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>{event.away_abbr}</span>
          <span style={{ fontSize: 9.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{event.away_team}</span>
          <span style={{ fontSize: 15, fontWeight: 700, marginTop: 1 }}>
            {event.away_h2h_price != null ? fmtPrice(event.away_h2h_price) : '–'}
          </span>
        </div>
      </div>

      {/* Bottom info */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingTop: 9, borderTop: '1px solid var(--line)', fontSize: 10,
      }}>
        {isLive ? (
          <>
            <span style={{ color: 'var(--text-3)' }}>Score <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 11, marginLeft: 4 }}>–</span></span>
          </>
        ) : (
          <>
            <span style={{ color: 'var(--text-3)' }}>
              Line{' '}
              <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 11, marginLeft: 4 }}>
                {event.projected_margin != null
                  ? (event.projected_margin > 0 ? '+' : '') + event.projected_margin.toFixed(1)
                  : '–'}
              </span>
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>
              Total Pts{' '}
              <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 11, marginLeft: 4 }}>
                {event.projected_total != null ? event.projected_total.toFixed(1) : '–'}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}
