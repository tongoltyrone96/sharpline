import React from 'react'

interface Team {
  name: string
  abbr: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
}

interface Props {
  event: {
    id: string
    sport: string
    commence_time: string
    status: string
    home: Team
    away: Team
  }
  model: {
    home_win_prob: number
    away_win_prob: number
    projected_margin: number | null
    projected_total: number | null
  } | null
}

function Jersey({ primary, secondary, size = 46 }: { primary: string; secondary: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path d="M15 8 L19 5.5 Q24 10 29 5.5 L33 8 L40 14 L35.5 19.5 L32.5 17 L32.5 41 L15.5 41 L15.5 17 L12.5 19.5 L8 14 Z"
        fill={primary} stroke="rgba(255,255,255,.14)" strokeWidth={0.8}/>
      <rect x={15.5} y={24} width={17} height={5} fill={secondary}/>
    </svg>
  )
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
  } catch { return '–' }
}

export default function GameHeader({ event, model }: Props) {
  const hp = model?.home_win_prob != null ? model.home_win_prob * 100 : 50
  const ap = model?.away_win_prob != null ? model.away_win_prob * 100 : 50
  const homeFav = hp >= ap

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', gap: 16,
      padding: '16px 22px 18px', borderBottom: '1px solid var(--line)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        content: '""', position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at top, rgba(45,212,191,.05), transparent 60%)',
        pointerEvents: 'none',
      }} />

      {/* Home */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', textAlign: 'right', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{event.home.abbr}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{event.home.name}</div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600,
            color: homeFav ? 'var(--cyan)' : 'var(--text)',
          }}>{model ? hp.toFixed(1) + '%' : '–'}</div>
        </div>
        <Jersey primary={event.home.primary_color} secondary={event.home.secondary_color} />
      </div>

      {/* Center */}
      <div style={{ textAlign: 'center', position: 'relative' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {event.sport} · {event.status}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, margin: '5px 0' }}>VS</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)' }}>
          {fmtDateTime(event.commence_time)}
        </div>
      </div>

      {/* Away */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-start', textAlign: 'left', position: 'relative' }}>
        <Jersey primary={event.away.primary_color} secondary={event.away.secondary_color} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{event.away.abbr}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{event.away.name}</div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600,
            color: !homeFav ? 'var(--cyan)' : 'var(--text)',
          }}>{model ? ap.toFixed(1) + '%' : '–'}</div>
        </div>
      </div>

      {/* Win-prob split bar */}
      <div style={{
        gridColumn: '1 / -1', marginTop: 14, height: 7, borderRadius: 5,
        overflow: 'hidden', display: 'flex', position: 'relative',
      }}>
        <span style={{ position: 'absolute', top: -18, left: '2%', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--cyan)' }}>
          {event.home.abbr} {model ? hp.toFixed(1) : '–'}%
        </span>
        <span style={{ position: 'absolute', top: -18, right: '2%', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--blue)' }}>
          {event.away.abbr} {model ? ap.toFixed(1) : '–'}%
        </span>
        <div style={{ background: 'linear-gradient(90deg, var(--cyan), rgba(45,212,191,.6))', width: `${hp}%` }} />
        <div style={{ background: 'linear-gradient(90deg, rgba(91,155,255,.4), var(--blue))', width: `${ap}%` }} />
      </div>
    </div>
  )
}
