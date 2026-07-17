import React from 'react'
import { DashboardEvent } from '../../hooks/useDashboard'
import { getSportAbbr, getSportColor } from '../../lib/colors'
import { fmtPrice } from '../../lib/format'

interface Props {
  events: DashboardEvent[]
}

export default function LiveTicker({ events }: Props) {
  const items = events
    .filter(e => e.home_h2h_price != null || e.away_h2h_price != null)
    .slice(0, 24)
    .flatMap(e => {
      const rows: { sport: string; label: string; abbr: string; price: number; up: boolean }[] = []
      if (e.home_h2h_price != null) {
        rows.push({
          sport: e.sport_key,
          abbr: getSportAbbr(e.sport_key),
          label: e.home_abbr || e.home_team.slice(0, 3).toUpperCase(),
          price: e.home_h2h_price,
          up: e.home_h2h_price < (e.away_h2h_price ?? 999),
        })
      }
      if (e.away_h2h_price != null) {
        rows.push({
          sport: e.sport_key,
          abbr: getSportAbbr(e.sport_key),
          label: e.away_abbr || e.away_team.slice(0, 3).toUpperCase(),
          price: e.away_h2h_price,
          up: e.away_h2h_price < (e.home_h2h_price ?? 999),
        })
      }
      return rows
    })

  const trow = items.map((t, i) => (
    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-2)' }}>
      <b style={{ color: getSportColor(t.sport), fontWeight: 600 }}>{t.abbr}</b>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{t.label}</span>
      <span style={{ color: t.up ? 'var(--pos)' : 'var(--neg)' }}>
        {fmtPrice(t.price)} {t.up ? '▲' : '▼'}
      </span>
    </span>
  ))

  return (
    <div style={{
      position: 'relative',
      display: 'flex', alignItems: 'center', height: 34,
      background: 'var(--panel-2)', borderBottom: '1px solid var(--line)',
      overflow: 'hidden', fontFamily: 'var(--mono)', fontSize: 11,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '0 14px', height: '100%',
        background: 'var(--panel-2)', color: 'var(--cyan)',
        fontWeight: 600, whiteSpace: 'nowrap',
        borderRight: '1px solid var(--line)',
        flexShrink: 0, zIndex: 2, position: 'relative',
        boxShadow: '4px 0 8px -4px rgba(8,11,16,0.9)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--cyan)', animation: 'pulse 1.8s infinite',
        }} />
        LIVE
      </span>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 26,
        padding: '0 18px', whiteSpace: 'nowrap',
        animation: items.length > 0 ? 'ticker-slide 60s linear infinite' : 'none',
        minWidth: 'max-content',
      }}>
        {trow}
        {trow /* duplicate for seamless loop */}
      </div>
    </div>
  )
}
