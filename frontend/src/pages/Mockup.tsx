import React, { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '../hooks/useDashboard'
import { getEvent } from '../lib/api'

// ─── Types (subset of GamePage) ─────────────────────────────────────────────
interface MarketRow {
  bookmaker: string
  outcome: string
  price: number
  point: number | null
  fair_price: number | null
  edge_pct: number | null
  is_best: boolean
}
interface EventDetail {
  event: {
    id: string
    sport: string
    commence_time: string
    home: { name: string; abbr: string; primary_color: string; secondary_color: string; logo_url: string | null }
    away: { name: string; abbr: string; primary_color: string; secondary_color: string; logo_url: string | null }
  }
  model: {
    home_win_prob: number
    away_win_prob: number
    confidence: number
    projected_margin: number | null
    projected_total: number | null
    fair_home_price: number | null
    fair_away_price: number | null
    rationale: string
    factors: Record<string, unknown>
  } | null
  markets: { h2h: MarketRow[]; spreads: MarketRow[]; totals: MarketRow[] }
  weather: {
    temp_c: number; wind_kmh: number; rain_prob: number
    humidity: number; condition: string; is_indoor: boolean
  } | null
  lineups: Array<{ team: string; player_name?: string; player?: string; status: string; reason?: string }>
}

// ─── Constants ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  'Dashboard', 'Match Centre', 'AI Predictions', 'Line Movement',
  'Stats Centre', 'H2H Analysis', 'Team News', 'Injuries',
  'Power Rankings', 'My Bets', 'Alerts', 'Settings',
]

const CARD_BG = '#131A26'
const CARD_BORDER = 'rgba(255,255,255,.06)'
const SUBTLE_BG = '#0B1017'

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  const d = new Date(iso)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  const day = d.getDate()
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  const hh = d.getHours()
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const hh12 = hh % 12 || 12
  return `${weekday} ${day} ${month}, ${hh12}:${mm} ${ampm}`
}

function bestH2hOfferedPrice(rows: MarketRow[], teamName: string): number | null {
  const arr = rows.filter(r => r.outcome === teamName).map(r => r.price).filter(p => p > 0)
  return arr.length ? Math.max(...arr) : null
}

function computeProjectedScore(margin: number | null, total: number | null): { home: number; away: number } | null {
  if (margin == null || total == null) return null
  // home - away = margin means "positive margin = home wins", but our convention:
  // negative projected_margin = home favoured. Under our fixed convention,
  // margin > 0 = home underdog (home loses by that many).
  // Home = (total - margin) / 2, Away = (total + margin) / 2
  const home = Math.round((total - margin) / 2)
  const away = Math.round((total + margin) / 2)
  return { home, away }
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function Sidebar() {
  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: SUBTLE_BG, borderRight: '1px solid ' + CARD_BORDER,
      display: 'flex', flexDirection: 'column',
      padding: '18px 12px',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 22px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'linear-gradient(135deg, #2DD4BF, #5B9BFF)',
          display: 'grid', placeItems: 'center',
          fontWeight: 700, fontSize: 20, color: '#061018',
        }}>A</div>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        {NAV_ITEMS.map((item, i) => {
          const active = i === 0
          return (
            <a key={item} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 7,
              fontSize: 13, fontWeight: active ? 600 : 500,
              color: active ? '#fff' : '#8B97A8',
              background: active ? 'rgba(91,155,255,.12)' : 'transparent',
              cursor: 'pointer',
            }}>
              <span style={{
                width: 16, height: 16, borderRadius: 4,
                background: active ? '#5B9BFF' : 'currentColor', opacity: active ? 1 : .4,
              }} />
              {item}
            </a>
          )
        })}
      </nav>

      {/* AI Confidence */}
      <div style={{
        marginTop: 14, padding: 16,
        background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_BORDER,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 10, color: '#8B97A8', fontWeight: 600,
          letterSpacing: '.08em', marginBottom: 10,
        }}>AI CONFIDENCE</div>
        <ConfidenceRing pct={96} size={70} color="#34D399" />
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#34D399' }}>VERY HIGH</div>
        <div style={{ marginTop: 6, fontSize: 10.5, color: '#8B97A8', lineHeight: 1.4 }}>
          High confidence in<br />AI prediction
        </div>
      </div>
    </aside>
  )
}

function ConfidenceRing({ pct, size = 70, color = '#34D399', strokeWidth = 6, label }: {
  pct: number; size?: number; color?: string; strokeWidth?: number; label?: string
}) {
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const dash = c * (pct / 100)
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid', placeItems: 'center',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: size * 0.28, fontWeight: 700, color: '#fff',
      }}>{pct}%</div>
      {label && (
        <div style={{
          textAlign: 'center', fontSize: 10.5, color: '#8B97A8',
          fontWeight: 600, letterSpacing: '.06em', marginTop: 4,
        }}>{label}</div>
      )}
    </div>
  )
}

function TopBar({ sport, lastUpdated }: { sport: string; lastUpdated: string }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 20,
      padding: '18px 24px', borderBottom: '1px solid ' + CARD_BORDER,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>
          {sport.toUpperCase()} AI MATCH CENTRE
        </div>
        <div style={{ fontSize: 11, color: '#8B97A8', letterSpacing: '.08em', marginTop: 2 }}>
          AI POWERED PREDICTIONS & ANALYTICS
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: CARD_BG, border: '1px solid ' + CARD_BORDER,
        padding: '8px 14px', borderRadius: 8,
        fontSize: 12, fontWeight: 600, letterSpacing: '.06em',
      }}>
        ROUND 15 ▾
        <span style={{ opacity: .6 }}>📅</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8B97A8' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399' }} />
        Last Updated: {lastUpdated}
      </div>

      <div style={{
        padding: '6px 14px', borderRadius: 6,
        background: 'rgba(52,211,153,.12)', color: '#34D399',
        fontSize: 11, fontWeight: 700, letterSpacing: '.1em',
        border: '1px solid rgba(52,211,153,.3)',
      }}>LIVE</div>

      <button style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', background: CARD_BG, border: '1px solid ' + CARD_BORDER,
        borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>↑ SHARE</button>

      <button style={{
        width: 36, height: 36, background: CARD_BG,
        border: '1px solid ' + CARD_BORDER, borderRadius: 8,
        display: 'grid', placeItems: 'center', color: '#8B97A8', cursor: 'pointer',
      }}>🔔</button>
    </header>
  )
}

function TeamHero({ detail, weather }: { detail: EventDetail; weather: EventDetail['weather'] }) {
  const { home, away } = detail.event
  return (
    <div style={{
      background: `linear-gradient(105deg, ${home.primary_color}55 0%, #131A26 45%, #131A26 55%, ${away.primary_color}55 100%)`,
      borderRadius: 14, border: '1px solid ' + CARD_BORDER,
      padding: '24px 28px', display: 'grid',
      gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 20,
    }}>
      {/* Home */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <TeamCrest color={home.primary_color} secondary={home.secondary_color} abbr={home.abbr} size={110} />
        <div>
          <div style={{ fontSize: 12, color: '#8B97A8', letterSpacing: '.06em' }}>{home.abbr}</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.05 }}>
            {home.name.toUpperCase()}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: home.primary_color, fontWeight: 700 }}>7th</div>
          <div style={{ fontSize: 11, color: '#8B97A8' }}>6W - 7L - 0D</div>
        </div>
      </div>

      {/* Middle: venue + weather */}
      <div style={{ textAlign: 'center', minWidth: 180 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', color: '#fff' }}>
          {detail.event.sport === 'NRL' ? 'SUNCORP STADIUM' : 'MCG'}
        </div>
        <div style={{ fontSize: 11, color: '#8B97A8', marginTop: 4 }}>{fmtDate(detail.event.commence_time)}</div>
        {weather && !weather.is_indoor && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ fontSize: 30 }}>{weather.rain_prob > 0.3 ? '🌧' : '☀'}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{Math.round(weather.temp_c)}°</div>
            <div style={{ fontSize: 11, color: '#8B97A8' }}>{weather.condition}</div>
            <div style={{ fontSize: 11, color: '#8B97A8' }}>Wind {Math.round(weather.wind_kmh)}km/h</div>
          </div>
        )}
        {weather?.is_indoor && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#8B97A8' }}>Indoor venue</div>
        )}
      </div>

      {/* Away */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#8B97A8', letterSpacing: '.06em' }}>{away.abbr}</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.05 }}>
            {away.name.toUpperCase()}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: away.primary_color, fontWeight: 700 }}>2nd</div>
          <div style={{ fontSize: 11, color: '#8B97A8' }}>11W - 2L - 0D</div>
        </div>
        <TeamCrest color={away.primary_color} secondary={away.secondary_color} abbr={away.abbr} size={110} />
      </div>
    </div>
  )
}

function TeamCrest({ color, secondary, abbr, size }: { color: string; secondary: string; abbr: string; size: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle at 30% 30%, ${secondary}, ${color} 70%)`,
      display: 'grid', placeItems: 'center',
      border: '3px solid rgba(255,255,255,.1)',
      boxShadow: `0 6px 20px ${color}55`,
      flexShrink: 0,
    }}>
      <div style={{ fontSize: size * 0.32, fontWeight: 900, color: '#fff', letterSpacing: '-.02em' }}>{abbr}</div>
    </div>
  )
}

function PredictionCard({ detail }: { detail: EventDetail }) {
  const m = detail.model
  if (!m) return <div style={{ background: CARD_BG, borderRadius: 14, padding: 20, border: '1px solid ' + CARD_BORDER }}>No prediction</div>

  const winner = m.home_win_prob > m.away_win_prob ? detail.event.home : detail.event.away
  const score = computeProjectedScore(m.projected_margin, m.projected_total)
  const confidencePct = Math.round((m.confidence ?? 0) * 100)
  const confColor = confidencePct >= 75 ? '#34D399' : confidencePct >= 55 ? '#F5A524' : '#F26D6D'

  return (
    <div style={{
      background: CARD_BG, borderRadius: 14, border: '1px solid ' + CARD_BORDER,
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: '#8B97A8', fontWeight: 700, letterSpacing: '.08em' }}>AI PREDICTION</div>
        <div style={{
          padding: '3px 8px', background: 'rgba(52,211,153,.14)', color: '#34D399',
          fontSize: 9, fontWeight: 700, letterSpacing: '.08em', borderRadius: 4,
        }}>PRE GAME</div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: '#fff' }}>{winner.name}</div>
          <div style={{ fontSize: 11, color: '#8B97A8', marginTop: 4 }}>TO WIN</div>
        </div>
        <div>
          <ConfidenceRing pct={confidencePct} size={78} color={confColor} strokeWidth={7} />
          <div style={{ textAlign: 'center', fontSize: 9.5, color: '#8B97A8', letterSpacing: '.08em', marginTop: 3 }}>CONFIDENCE</div>
        </div>
      </div>

      {score && (
        <>
          <div style={{
            marginTop: 16, paddingTop: 14, borderTop: '1px solid ' + CARD_BORDER,
            fontSize: 10.5, color: '#8B97A8', fontWeight: 700, letterSpacing: '.08em',
          }}>AI PROJECTED SCORE</div>
          <div style={{
            display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            marginTop: 8, fontFamily: '"IBM Plex Mono", monospace',
          }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: detail.event.home.primary_color === '#000000' ? '#5B9BFF' : detail.event.home.primary_color }}>
              {score.home}
            </div>
            <div style={{ fontSize: 22, color: '#8B97A8' }}>—</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: detail.event.away.primary_color === '#000000' ? '#A78BFA' : detail.event.away.primary_color }}>
              {score.away}
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11.5, color: '#8B97A8', marginTop: 4 }}>
            {winner.name} by {Math.abs(score.home - score.away)}
          </div>
        </>
      )}
    </div>
  )
}

function ThreeMetrics({ detail }: { detail: EventDetail }) {
  const m = detail.model
  if (!m) return null
  const homePct = Math.round(m.home_win_prob * 100)
  const awayPct = 100 - homePct
  const line = m.projected_margin ?? 0
  const total = m.projected_total ?? 0
  const { home, away } = detail.event

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
      {/* Win Probability */}
      <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_BORDER, padding: '16px 18px' }}>
        <div style={{ fontSize: 11, color: '#8B97A8', fontWeight: 700, letterSpacing: '.08em' }}>AI WIN PROBABILITY</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginTop: 14, gap: 12 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: home.primary_color === '#000000' ? '#5B9BFF' : home.primary_color, fontFamily: '"IBM Plex Mono", monospace' }}>{homePct}%</div>
            <div style={{ fontSize: 10, color: '#8B97A8', fontWeight: 600, letterSpacing: '.06em', marginTop: 3 }}>{home.abbr}</div>
            <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: `${home.primary_color}44`, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, right: `${100 - homePct}%`, background: home.primary_color === '#000000' ? '#5B9BFF' : home.primary_color, borderRadius: 2 }} />
            </div>
          </div>
          <ConfidenceRing pct={Math.max(homePct, awayPct)} size={64} color={homePct > awayPct ? (home.primary_color === '#000000' ? '#5B9BFF' : home.primary_color) : (away.primary_color === '#000000' ? '#A78BFA' : away.primary_color)} strokeWidth={5} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: away.primary_color === '#000000' ? '#A78BFA' : away.primary_color, fontFamily: '"IBM Plex Mono", monospace' }}>{awayPct}%</div>
            <div style={{ fontSize: 10, color: '#8B97A8', fontWeight: 600, letterSpacing: '.06em', marginTop: 3 }}>{away.abbr}</div>
            <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: `${away.primary_color}44` }}>
              <div style={{ height: 4, width: `${awayPct}%`, background: away.primary_color === '#000000' ? '#A78BFA' : away.primary_color, borderRadius: 2 }} />
            </div>
          </div>
        </div>
      </div>

      {/* AI Line */}
      <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_BORDER, padding: '16px 18px' }}>
        <div style={{ fontSize: 11, color: '#8B97A8', fontWeight: 700, letterSpacing: '.08em' }}>AI LINE</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', marginTop: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <TeamCrest color={home.primary_color} secondary={home.secondary_color} abbr={home.abbr} size={32} />
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: '"IBM Plex Mono", monospace', color: '#fff' }}>
              {line > 0 ? '+' : ''}{line.toFixed(1)}
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#8B97A8', fontWeight: 700, letterSpacing: '.08em' }}>AI LINE</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <TeamCrest color={away.primary_color} secondary={away.secondary_color} abbr={away.abbr} size={32} />
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: '"IBM Plex Mono", monospace', color: '#fff' }}>
              {line < 0 ? '+' : '-'}{Math.abs(line).toFixed(1)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 10, color: '#8B97A8', fontWeight: 600, letterSpacing: '.06em' }}>LINE CONFIDENCE</div>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(52,211,153,.15)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, right: '8%', background: '#34D399', borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 11, color: '#34D399', fontWeight: 700 }}>92%</div>
        </div>
      </div>

      {/* AI Total Points */}
      <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_BORDER, padding: '16px 18px' }}>
        <div style={{ fontSize: 11, color: '#8B97A8', fontWeight: 700, letterSpacing: '.08em' }}>AI TOTAL POINTS</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', fontFamily: '"IBM Plex Mono", monospace' }}>{total.toFixed(1)}</div>
          <div style={{ flex: 1, height: 34 }}>
            <MiniAreaChart color="#34D399" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8B97A8', fontWeight: 600, marginTop: 8 }}>
          <span>OVER</span>
          <span>UNDER</span>
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 10, color: '#8B97A8', fontWeight: 600, letterSpacing: '.06em' }}>TOTAL CONFIDENCE</div>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(52,211,153,.15)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, right: '12%', background: '#34D399', borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 11, color: '#34D399', fontWeight: 700 }}>88%</div>
        </div>
      </div>
    </div>
  )
}

function MiniAreaChart({ color }: { color: string }) {
  const pts = [30, 35, 32, 38, 42, 45, 48, 46, 50, 47, 52, 48, 50, 46]
  const max = Math.max(...pts), min = Math.min(...pts)
  const w = 100, h = 30
  const path = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w
    const y = h - ((v - min) / (max - min)) * h
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  const area = path + ` L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="a1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#a1)" />
      <path d={path} stroke={color} strokeWidth={1.5} fill="none" />
    </svg>
  )
}

function OddsComparison({ detail }: { detail: EventDetail }) {
  const [tab, setTab] = useState<'h2h' | 'line' | 'total'>('h2h')
  const { home, away } = detail.event
  const m = detail.model

  const rows = useMemo(() => {
    if (tab === 'h2h') {
      const books = new Set(detail.markets.h2h.map(r => r.bookmaker))
      return Array.from(books).slice(0, 6).map(bm => {
        const h = detail.markets.h2h.find(r => r.bookmaker === bm && r.outcome === home.name)
        const a = detail.markets.h2h.find(r => r.bookmaker === bm && r.outcome === away.name)
        return {
          bookmaker: bm,
          homePrice: h?.price ?? null,
          awayPrice: a?.price ?? null,
          fairHome: m?.fair_home_price ?? null,
          fairAway: m?.fair_away_price ?? null,
          edgeHome: h?.edge_pct ?? null,
          edgeAway: a?.edge_pct ?? null,
        }
      })
    }
    return []
  }, [tab, detail, home.name, away.name, m])

  return (
    <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_BORDER, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', flex: 1 }}>ODDS COMPARISON</div>
        <div style={{ display: 'flex', background: SUBTLE_BG, borderRadius: 8, padding: 3, gap: 2 }}>
          {(['h2h', 'line', 'total'] as const).map(t => {
            const label = t === 'h2h' ? 'HEAD TO HEAD' : t === 'line' ? 'LINE' : 'TOTAL POINTS'
            const on = tab === t
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '6px 14px', borderRadius: 6, border: 0,
                background: on ? '#5B9BFF' : 'transparent',
                color: on ? '#fff' : '#8B97A8',
                fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', cursor: 'pointer',
              }}>{label}</button>
            )
          })}
        </div>
      </div>

      <div style={{ marginTop: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: '#8B97A8', fontSize: 10, fontWeight: 700, letterSpacing: '.06em' }}>
              <th style={{ textAlign: 'left', padding: '10px 6px' }}>BOOKMAKER</th>
              <th style={{ textAlign: 'right', padding: '10px 6px' }}>{home.abbr} (WIN)</th>
              <th style={{ textAlign: 'right', padding: '10px 6px' }}>{away.abbr} (WIN)</th>
              <th style={{ textAlign: 'right', padding: '10px 6px' }}>AI FAIR PRICE</th>
              <th style={{ textAlign: 'right', padding: '10px 6px' }}>VALUE</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#8B97A8', padding: 22, fontSize: 11 }}>No markets available</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid ' + CARD_BORDER }}>
                <td style={{ padding: '11px 6px', fontWeight: 600 }}>
                  <BookTag name={r.bookmaker} />
                </td>
                <td style={{ padding: '11px 6px', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace' }}>
                  {r.homePrice?.toFixed(2) ?? '–'}
                </td>
                <td style={{ padding: '11px 6px', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace' }}>
                  {r.awayPrice?.toFixed(2) ?? '–'}
                </td>
                <td style={{ padding: '11px 6px', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: '#5B9BFF', fontWeight: 600 }}>
                  {r.fairHome?.toFixed(2) ?? '–'} / {r.fairAway?.toFixed(2) ?? '–'}
                </td>
                <td style={{ padding: '11px 6px', textAlign: 'right', fontSize: 11, fontFamily: '"IBM Plex Mono", monospace' }}>
                  <EdgeCell edge={r.edgeHome} label={home.abbr} />
                  <br />
                  <EdgeCell edge={r.edgeAway} label={away.abbr} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: '#525E70' }}>● Prices update in real time (30s)</div>
    </div>
  )
}

function EdgeCell({ edge, label }: { edge: number | null; label: string }) {
  if (edge == null) return <span style={{ color: '#525E70' }}>–</span>
  const positive = edge > 0
  return (
    <span style={{ color: positive ? '#34D399' : '#F26D6D', fontWeight: 700 }}>
      {positive ? '▲' : '▼'} {edge.toFixed(1)}%
    </span>
  )
}

function BookTag({ name }: { name: string }) {
  const short = name.slice(0, 2).toUpperCase()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 22, height: 22, borderRadius: 5, background: '#5B9BFF22',
        color: '#5B9BFF', fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center',
      }}>{short}</span>
      {name}
    </span>
  )
}

function MovementCharts({ detail }: { detail: EventDetail }) {
  const { home, away } = detail.event
  const homeCol = home.primary_color === '#000000' ? '#F26D6D' : home.primary_color
  const awayCol = away.primary_color === '#000000' ? '#A78BFA' : away.primary_color
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <MiniChartCard title="WIN PROBABILITY MOVEMENT" primary={homeCol} secondary={awayCol} showLegend legendHome={home.abbr} legendAway={away.abbr} suffix="%" />
      <MiniChartCard title="LINE MOVEMENT" primary={awayCol} suffix="" endLabel={String(detail.model?.projected_margin?.toFixed(1) ?? '–')} />
      <MiniChartCard title="TOTAL POINTS MOVEMENT" primary="#34D399" suffix="" endLabel={String(detail.model?.projected_total?.toFixed(1) ?? '–')} />
    </div>
  )
}

function MiniChartCard({ title, primary, secondary, showLegend, legendHome, legendAway, suffix, endLabel }: {
  title: string; primary: string; secondary?: string;
  showLegend?: boolean; legendHome?: string; legendAway?: string;
  suffix?: string; endLabel?: string;
}) {
  return (
    <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_BORDER, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8B97A8', letterSpacing: '.08em' }}>{title}</div>
        {showLegend && (
          <div style={{ display: 'flex', gap: 10, fontSize: 10 }}>
            <span style={{ color: primary, fontWeight: 700 }}>● {legendHome}</span>
            <span style={{ color: secondary, fontWeight: 700 }}>● {legendAway}</span>
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, height: 60 }}>
        <MiniLineChart color={primary} secondary={secondary} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#525E70', marginTop: 4 }}>
        <span>-24h</span><span>-12h</span><span>-6h</span><span>-3h</span><span>-1h</span><span>Now {endLabel ? endLabel : ''}{suffix ?? ''}</span>
      </div>
    </div>
  )
}

function MiniLineChart({ color, secondary }: { color: string; secondary?: string }) {
  const w = 200, h = 60
  const pts1 = [35, 40, 38, 45, 50, 55, 60, 62, 65, 68, 70, 68]
  const pts2 = [65, 60, 62, 55, 50, 45, 40, 38, 35, 32, 30, 32]
  const path = (pts: number[]) => pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w
    const y = h - (v / 100) * h
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <path d={path(pts1)} stroke={color} strokeWidth={1.6} fill="none" />
      {secondary && <path d={path(pts2)} stroke={secondary} strokeWidth={1.6} fill="none" />}
      {pts1.map((v, i) => (
        <circle key={i} cx={(i / (pts1.length - 1)) * w} cy={h - (v / 100) * h} r={1.6} fill={color} />
      ))}
    </svg>
  )
}

function LineupsPanel({ detail }: { detail: EventDetail }) {
  const { home, away } = detail.event
  const homeLineups = detail.lineups.filter(l => l.team === home.name).slice(0, 4)
  const awayLineups = detail.lineups.filter(l => l.team === away.name).slice(0, 4)

  return (
    <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_BORDER, padding: '18px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>TEAM NEWS & LINEUPS</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <TeamNewsColumn team={home} lineups={homeLineups} />
        <TeamNewsColumn team={away} lineups={awayLineups} />
      </div>

      <div style={{
        marginTop: 16, padding: '12px 14px',
        background: SUBTLE_BG, borderRadius: 8, borderLeft: '3px solid #5B9BFF',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: '#5B9BFF' }}>
          ⚡ AI IMPACT
        </div>
        <div style={{ fontSize: 12, color: '#8B97A8', marginTop: 4, lineHeight: 1.5 }}>
          {detail.model?.rationale ?? 'No AI rationale available yet.'}
        </div>
      </div>

      {detail.weather && !detail.weather.is_indoor && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: SUBTLE_BG, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 18 }}>{detail.weather.rain_prob > 0.3 ? '🌧' : '☀'}</div>
          <div style={{ fontSize: 11, color: '#8B97A8' }}>
            <b style={{ color: '#fff' }}>WEATHER IMPACT.</b> {detail.weather.condition}, {Math.round(detail.weather.temp_c)}°C, wind {Math.round(detail.weather.wind_kmh)} km/h.
          </div>
        </div>
      )}
    </div>
  )
}

function TeamNewsColumn({ team, lineups }: {
  team: { name: string; abbr: string; primary_color: string; secondary_color: string };
  lineups: EventDetail['lineups'];
}) {
  const outs = lineups.filter(l => l.status === 'out' || l.status === 'doubtful')
  const ins = lineups.filter(l => l.status === 'in')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <TeamCrest color={team.primary_color} secondary={team.secondary_color} abbr={team.abbr} size={26} />
        <div style={{ fontSize: 12, fontWeight: 700 }}>{team.name.toUpperCase()}</div>
      </div>

      {ins.length > 0 && <div style={{ fontSize: 10, color: '#34D399', fontWeight: 700, letterSpacing: '.08em', marginBottom: 6 }}>IN</div>}
      {ins.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', color: '#8B97A8' }}>
          <span style={{ color: '#34D399' }}>✓</span>
          {p.player_name ?? p.player ?? 'Player'} {p.reason ? <span style={{ color: '#525E70' }}>({p.reason})</span> : null}
        </div>
      ))}

      {outs.length > 0 && <div style={{ fontSize: 10, color: '#F26D6D', fontWeight: 700, letterSpacing: '.08em', marginBottom: 6, marginTop: 8 }}>OUT</div>}
      {outs.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', color: '#8B97A8' }}>
          <span style={{ color: '#F26D6D' }}>✗</span>
          {p.player_name ?? p.player ?? 'Player'} {p.reason ? <span style={{ color: '#525E70' }}>({p.reason})</span> : null}
        </div>
      ))}

      {ins.length === 0 && outs.length === 0 && (
        <div style={{ fontSize: 11.5, color: '#525E70' }}>Lineups not yet announced.</div>
      )}
    </div>
  )
}

function StatusBar({ detail }: { detail: EventDetail }) {
  const m = detail.model
  if (!m) return null
  const winner = m.home_win_prob > m.away_win_prob ? detail.event.home : detail.event.away
  const score = computeProjectedScore(m.projected_margin, m.projected_total)

  // Best value: find best positive-edge across all outputs
  const all = [...detail.markets.h2h, ...detail.markets.spreads, ...detail.markets.totals]
  const best = all.filter(r => (r.edge_pct ?? 0) > 0 && (r.edge_pct ?? 0) < 20)
    .sort((a, b) => (b.edge_pct ?? 0) - (a.edge_pct ?? 0))[0]

  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(52,211,153,.05), rgba(91,155,255,.05))',
      borderRadius: 12, border: '1px solid ' + CARD_BORDER,
      padding: '16px 24px', display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr', gap: 20, alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 22 }}>🏆</div>
        <div>
          <div style={{ fontSize: 10, color: '#8B97A8', fontWeight: 700, letterSpacing: '.08em' }}>AI PREDICTED WINNER</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: winner.primary_color === '#000000' ? '#5B9BFF' : winner.primary_color }}>{winner.name.toUpperCase()}</div>
        </div>
      </div>
      {score && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#8B97A8', fontWeight: 700, letterSpacing: '.08em' }}>PROJECTED SCORE</div>
          <div style={{ marginTop: 2, fontSize: 15, fontWeight: 800, fontFamily: '"IBM Plex Mono", monospace' }}>
            <span style={{ color: '#8B97A8', fontSize: 10, marginRight: 6 }}>{detail.event.home.abbr}</span>
            {score.home}
            <span style={{ color: '#525E70', margin: '0 10px' }}>—</span>
            {score.away}
            <span style={{ color: '#8B97A8', fontSize: 10, marginLeft: 6 }}>{detail.event.away.abbr}</span>
          </div>
        </div>
      )}
      {best && (
        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: '#8B97A8', fontWeight: 700, letterSpacing: '.08em' }}>BEST VALUE BET</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {best.outcome} {best.point != null ? (best.point > 0 ? '+' : '') + best.point.toFixed(1) : ''} @ {best.price.toFixed(2)} ({best.bookmaker})
            </div>
          </div>
          <div style={{
            padding: '6px 12px', background: 'rgba(52,211,153,.15)',
            color: '#34D399', fontSize: 12, fontWeight: 800, borderRadius: 6,
            border: '1px solid rgba(52,211,153,.3)',
          }}>{best.edge_pct?.toFixed(1)}% VALUE</div>
        </div>
      )}
    </div>
  )
}

// ─── Filler panels (replace paid-feed sections) ─────────────────────────────
function ConfidenceBreakdownCard({ detail }: { detail: EventDetail }) {
  const f = (detail.model?.factors ?? {}) as Record<string, unknown>
  const rows = [
    { label: 'Bookmaker coverage', value: Number(f.coverage ?? 0), hint: `${f.bookmaker_count ?? 0} books quoting this market` },
    { label: 'Market agreement', value: Number(f.market_agreement ?? 0), hint: 'How much the books agree' },
    { label: 'Probability separation', value: Number(f.probability_split ?? 0), hint: 'How decisive the pick is' },
    { label: 'Market completeness', value: Number(f.market_completeness ?? 0), hint: 'H2H, line and totals all present' },
  ]
  return (
    <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_BORDER, padding: '18px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>WHY CONFIDENCE IS {Math.round((detail.model?.confidence ?? 0) * 100)}%</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r, i) => {
          const pct = Math.round(r.value * 100)
          const c = pct >= 70 ? '#34D399' : pct >= 40 ? '#F5A524' : '#F26D6D'
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <div style={{ color: '#fff', fontWeight: 600 }}>{r.label}</div>
                <div style={{ color: c, fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace' }}>{pct}%</div>
              </div>
              <div style={{ marginTop: 5, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)' }}>
                <div style={{ width: `${pct}%`, height: 4, borderRadius: 2, background: c }} />
              </div>
              <div style={{ fontSize: 10.5, color: '#8B97A8', marginTop: 3 }}>{r.hint}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function Mockup() {
  const { events } = useDashboard()
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [now, setNow] = useState(new Date())

  // Pick first event with meaningful market coverage
  const featuredId = useMemo(() => {
    return events[0]?.id ?? null
  }, [events])

  useEffect(() => {
    if (!featuredId) return
    getEvent(featuredId).then((d: EventDetail) => setDetail(d)).catch(() => setDetail(null))
    const id = setInterval(() => {
      getEvent(featuredId).then((d: EventDetail) => setDetail(d)).catch(() => {})
    }, 30_000)
    return () => clearInterval(id)
  }, [featuredId])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const lastUpdated = useMemo(() => {
    // Compact "X mins ago"
    const secAgo = Math.max(1, Math.floor((now.getTime() - now.getTime()) / 1000)) // always fresh in mockup
    return secAgo < 60 ? `${secAgo}s ago` : `${Math.floor(secAgo / 60)}m ago`
  }, [now])

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0F16', color: '#E6EBF2',
      fontFamily: 'Inter, system-ui, sans-serif', display: 'flex',
    }}>
      <Sidebar />

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar sport={detail?.event.sport ?? 'NRL'} lastUpdated={lastUpdated} />

        {!detail ? (
          <div style={{ padding: 40, color: '#8B97A8', textAlign: 'center' }}>Loading featured match…</div>
        ) : (
          <div style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Hero row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>
              <TeamHero detail={detail} weather={detail.weather} />
              <PredictionCard detail={detail} />
            </div>

            {/* Three-metric row */}
            <ThreeMetrics detail={detail} />

            {/* Middle: odds table + movement charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>
              <OddsComparison detail={detail} />
              <MovementCharts detail={detail} />
            </div>

            {/* Bottom row: lineups + confidence-breakdown filler */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>
              <LineupsPanel detail={detail} />
              <ConfidenceBreakdownCard detail={detail} />
            </div>

            {/* Status bar */}
            <StatusBar detail={detail} />
          </div>
        )}
      </main>
    </div>
  )
}
