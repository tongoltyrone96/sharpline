import React, { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '../hooks/useDashboard'
import { getEvent, getEventHistory, HistoryPoint } from '../lib/api'

// ─── Types ──────────────────────────────────────────────────────────────────
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
    id: string; sport: string; commence_time: string
    home: { name: string; abbr: string; primary_color: string; secondary_color: string; logo_url: string | null }
    away: { name: string; abbr: string; primary_color: string; secondary_color: string; logo_url: string | null }
  }
  model: {
    home_win_prob: number; away_win_prob: number; confidence: number
    projected_margin: number | null; projected_total: number | null
    fair_home_price: number | null; fair_away_price: number | null
    rationale: string; factors: Record<string, unknown>
  } | null
  markets: { h2h?: MarketRow[]; spreads?: MarketRow[]; totals?: MarketRow[] }
  weather: {
    temp_c: number; wind_kmh: number; rain_prob: number
    humidity: number; condition: string; is_indoor: boolean
  } | null
  lineups: Array<{ team: string; player_name?: string; player?: string; status: string; reason?: string }>
}

// ─── Design tokens (matching reference image) ───────────────────────────────
const BG_PAGE    = '#0A0E1A'
const CARD_BG    = '#131A2B'
const CARD_BG_2  = '#0F1524'
const CARD_LINE  = 'rgba(255,255,255,.06)'
const CARD_LINE2 = 'rgba(255,255,255,.10)'
const TXT_HI     = '#F1F5FF'
const TXT_MD     = '#8B97B5'
const TXT_LO     = '#525E7A'
const GREEN      = '#22C55E'
const GREEN_DIM  = 'rgba(34,197,94,.15)'
const RED        = '#EF4444'
const YELLOW     = '#F59E0B'

const MONO = '"IBM Plex Mono", "SF Mono", ui-monospace, monospace'

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(iso: string): { line1: string; line2: string } {
  const d = new Date(iso)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  const day = d.getDate()
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  const hh = d.getHours()
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const hh12 = hh % 12 || 12
  return { line1: `${weekday} ${day} ${month}`, line2: `${hh12}:${mm} ${ampm}` }
}

function projectedScore(margin: number | null, total: number | null): { home: number; away: number } | null {
  if (margin == null || total == null) return null
  const home = Math.round((total - margin) / 2)
  const away = Math.round((total + margin) / 2)
  return { home, away }
}

function safeColor(c: string | null | undefined, fallback: string): string {
  if (!c || c === '#000000' || c === '#FFFFFF') return fallback
  return c
}

// ─── Icons ──────────────────────────────────────────────────────────────────
const ICON: Record<string, React.ReactNode> = {
  dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1.5" strokeWidth="1.6"/><rect x="14" y="3" width="7" height="5" rx="1.5" strokeWidth="1.6"/><rect x="14" y="12" width="7" height="9" rx="1.5" strokeWidth="1.6"/><rect x="3" y="16" width="7" height="5" rx="1.5" strokeWidth="1.6"/></>),
  match: (<><circle cx="12" cy="12" r="9" strokeWidth="1.6"/><path d="M12 3v18M3 12h18" strokeWidth="1.6"/></>),
  ai: (<><path d="M12 3l3 6 6 1-4.5 4.5 1 6L12 17l-5.5 3.5 1-6L3 10l6-1 3-6z" strokeWidth="1.6" strokeLinejoin="round"/></>),
  line: (<><path d="M3 17l6-8 4 5 8-10" strokeWidth="1.7" strokeLinecap="round" fill="none"/></>),
  stats: (<><path d="M4 20V10M10 20V4M16 20v-8M22 20V6" strokeWidth="1.8" strokeLinecap="round"/></>),
  h2h: (<><path d="M8 12h8M8 8l-4 4 4 4M16 8l4 4-4 4" strokeWidth="1.6" strokeLinecap="round" fill="none"/></>),
  team: (<><circle cx="9" cy="8" r="3" strokeWidth="1.6"/><circle cx="16" cy="10" r="2.5" strokeWidth="1.6"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 2-4 4-4s4 1.5 4 4" strokeWidth="1.6" fill="none"/></>),
  injury: (<><path d="M12 2v20M2 12h20M6 6l12 12M18 6L6 18" strokeWidth="1.6" strokeLinecap="round"/></>),
  power: (<><path d="M12 3L4 14h6l-2 7 8-11h-6l2-7z" strokeWidth="1.6" strokeLinejoin="round" fill="none"/></>),
  mybets: (<><rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="1.6"/><path d="M3 10h18M7 15h4" strokeWidth="1.6"/></>),
  alerts: (<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" strokeWidth="1.6" strokeLinecap="round" fill="none"/></>),
  settings: (<><circle cx="12" cy="12" r="3" strokeWidth="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" strokeWidth="1.6" strokeLinecap="round"/></>),
}

const NAV = [
  ['Dashboard',      'dashboard', true],
  ['Match Centre',   'match',     false],
  ['AI Predictions', 'ai',        false],
  ['Line Movement',  'line',      false],
  ['Stats Centre',   'stats',     false],
  ['H2H Analysis',   'h2h',       false],
  ['Team News',      'team',      false],
  ['Injuries',       'injury',    false],
  ['Power Rankings', 'power',     false],
  ['My Bets',        'mybets',    false],
  ['Alerts',         'alerts',    false],
  ['Settings',       'settings',  false],
] as const

// ─── Sidebar ────────────────────────────────────────────────────────────────
function Sidebar({ overallConf }: { overallConf: number }) {
  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: BG_PAGE, borderRight: '1px solid ' + CARD_LINE,
      display: 'flex', flexDirection: 'column',
      padding: '14px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px 18px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)',
          display: 'grid', placeItems: 'center',
          fontWeight: 900, fontSize: 18, color: '#fff',
        }}>A</div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {NAV.map(([label, iconKey, active]) => (
          <a key={label as string} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 10px', borderRadius: 8,
            fontSize: 13, fontWeight: active ? 600 : 500,
            color: active ? TXT_HI : TXT_MD,
            background: active ? 'rgba(79,70,229,.18)' : 'transparent',
            cursor: 'pointer',
          }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                 stroke={active ? '#818CF8' : TXT_MD} style={{ flexShrink: 0 }}>
              {ICON[iconKey as string]}
            </svg>
            {label}
          </a>
        ))}
      </nav>

      <div style={{
        marginTop: 12, padding: '14px 12px',
        background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_LINE,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 10, color: TXT_MD, fontWeight: 700, letterSpacing: '.08em' }}>
          AI CONFIDENCE
        </div>
        <div style={{ marginTop: 8 }}>
          <Ring pct={overallConf} size={78} stroke={7} color={overallConf >= 75 ? GREEN : overallConf >= 55 ? YELLOW : RED} />
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 800, color: overallConf >= 75 ? GREEN : YELLOW }}>
          {overallConf >= 85 ? 'VERY HIGH' : overallConf >= 70 ? 'HIGH' : overallConf >= 50 ? 'MEDIUM' : 'LOW'}
        </div>
        <div style={{ marginTop: 6, fontSize: 10.5, color: TXT_MD, lineHeight: 1.4 }}>
          High confidence in<br />AI prediction
        </div>
      </div>
    </aside>
  )
}

// ─── Ring component ─────────────────────────────────────────────────────────
function Ring({ pct, size = 70, stroke = 6, color = GREEN, showLabel = true }: {
  pct: number; size?: number; stroke?: number; color?: string; showLabel?: boolean
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * (pct / 100)
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,.06)" strokeWidth={stroke} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
                strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
      </svg>
      {showLabel && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontFamily: MONO, fontSize: size * 0.28, fontWeight: 800, color: TXT_HI,
        }}>{pct}%</div>
      )}
    </div>
  )
}

// ─── Team crest — glowing circular emblem with team letters ────────────────
function Crest({ color, secondary, abbr, size }: {
  color: string; secondary: string; abbr: string; size: number
}) {
  const primary = safeColor(color, '#4F46E5')
  const glow = safeColor(secondary, primary)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `radial-gradient(circle at 30% 25%, ${glow}CC, ${primary} 60%, ${primary}77 100%)`,
      boxShadow: `0 8px 32px ${primary}77, inset 0 -6px 20px rgba(0,0,0,.35), inset 0 6px 20px rgba(255,255,255,.1)`,
      border: `2px solid ${primary}`,
      display: 'grid', placeItems: 'center',
      position: 'relative',
    }}>
      <div style={{
        fontSize: size * 0.36, fontWeight: 900, color: '#fff',
        letterSpacing: '-.02em', textShadow: '0 2px 8px rgba(0,0,0,.4)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>{abbr}</div>
    </div>
  )
}

// ─── Top bar ────────────────────────────────────────────────────────────────
function TopBar({ sport }: { sport: string }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 20,
      padding: '18px 24px', borderBottom: '1px solid ' + CARD_LINE,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: TXT_HI }}>
          {sport.toUpperCase()} AI MATCH CENTRE
        </div>
        <div style={{ fontSize: 10.5, color: TXT_MD, letterSpacing: '.14em', marginTop: 2, fontWeight: 600 }}>
          AI POWERED PREDICTIONS & ANALYTICS
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: CARD_BG, border: '1px solid ' + CARD_LINE,
        padding: '9px 16px', borderRadius: 8,
        fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: TXT_HI,
      }}>
        ROUND 15 ▾
        <span style={{ opacity: .55, fontSize: 14 }}>📅</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TXT_MD }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN }} />
        Last Updated: 2 mins ago
      </div>

      <div style={{
        padding: '7px 14px', borderRadius: 6,
        background: GREEN_DIM, color: GREEN,
        fontSize: 11, fontWeight: 800, letterSpacing: '.14em',
        border: '1px solid rgba(34,197,94,.35)',
      }}>LIVE</div>

      <button style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', background: CARD_BG, border: '1px solid ' + CARD_LINE,
        borderRadius: 7, color: TXT_HI, fontSize: 12, fontWeight: 700, cursor: 'pointer',
      }}>↑ SHARE</button>

      <button style={{
        width: 36, height: 36, background: CARD_BG,
        border: '1px solid ' + CARD_LINE, borderRadius: 8,
        display: 'grid', placeItems: 'center', color: TXT_MD, cursor: 'pointer', fontSize: 14,
      }}>🔔</button>
    </header>
  )
}

// ─── Team Hero (top, main match panel) ─────────────────────────────────────
function TeamHero({ detail }: { detail: EventDetail }) {
  const { home, away, sport } = detail.event
  const weather = detail.weather
  const homeCol = safeColor(home.primary_color, '#7C3AED')
  const awayCol = safeColor(away.primary_color, '#06B6D4')
  const dt = fmtDate(detail.event.commence_time)
  const venue = sport === 'NRL' ? 'SUNCORP STADIUM' : sport === 'AFL' ? 'MCG' : sport === 'NBA' ? 'STAPLES CENTER' : sport + ' VENUE'

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(100deg, ${homeCol}55 0%, ${homeCol}22 30%, ${CARD_BG} 45%, ${CARD_BG} 55%, ${awayCol}22 70%, ${awayCol}55 100%)`,
      borderRadius: 14, border: '1px solid ' + CARD_LINE,
      padding: '26px 30px',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', gap: 24,
      }}>
        {/* Home */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Crest color={homeCol} secondary={home.secondary_color} abbr={home.abbr} size={112} />
          <div>
            <div style={{ fontSize: 12, color: TXT_MD, fontWeight: 700, letterSpacing: '.08em' }}>{home.abbr}</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.05, color: TXT_HI, textTransform: 'uppercase' }}>
              {home.name.split(' ')[0]}
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.05, color: TXT_HI, textTransform: 'uppercase' }}>
              {home.name.split(' ').slice(1).join(' ')}
            </div>
          </div>
        </div>

        {/* Middle: venue + date + weather */}
        <div style={{ textAlign: 'center', minWidth: 170 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.06em', color: TXT_HI }}>
            {venue}
          </div>
          <div style={{ fontSize: 11, color: TXT_MD, marginTop: 6 }}>{dt.line1}, {dt.line2}</div>
          {weather && !weather.is_indoor && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>{weather.rain_prob > 0.3 ? '🌧' : weather.rain_prob > 0.1 ? '⛅' : '☀'}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TXT_HI, fontFamily: MONO }}>{Math.round(weather.temp_c)}°</div>
              <div style={{ fontSize: 10.5, color: TXT_MD }}>{weather.condition}</div>
              <div style={{ fontSize: 10.5, color: TXT_MD }}>Wind {Math.round(weather.wind_kmh)}km/h</div>
            </div>
          )}
          {weather?.is_indoor && (
            <div style={{ marginTop: 14, fontSize: 11, color: TXT_MD }}>Indoor venue</div>
          )}
          {!weather && (
            <div style={{ marginTop: 14, fontSize: 11, color: TXT_LO }}>Weather pending</div>
          )}
        </div>

        {/* Away */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: TXT_MD, fontWeight: 700, letterSpacing: '.08em' }}>{away.abbr}</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.05, color: TXT_HI, textTransform: 'uppercase' }}>
              {away.name.split(' ')[0]}
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.05, color: TXT_HI, textTransform: 'uppercase' }}>
              {away.name.split(' ').slice(1).join(' ')}
            </div>
          </div>
          <Crest color={awayCol} secondary={away.secondary_color} abbr={away.abbr} size={112} />
        </div>
      </div>
    </div>
  )
}

// ─── AI Prediction card ─────────────────────────────────────────────────────
function AiPredictionCard({ detail }: { detail: EventDetail }) {
  const m = detail.model
  if (!m) return null
  const winnerIsHome = m.home_win_prob > m.away_win_prob
  const winner = winnerIsHome ? detail.event.home : detail.event.away
  const winnerCol = safeColor(winner.primary_color, winnerIsHome ? '#7C3AED' : '#06B6D4')
  const score = projectedScore(m.projected_margin, m.projected_total)
  const confPct = Math.round((m.confidence ?? 0) * 100)
  const confCol = confPct >= 75 ? GREEN : confPct >= 55 ? YELLOW : RED

  return (
    <div style={{
      background: CARD_BG, borderRadius: 14, border: '1px solid ' + CARD_LINE,
      padding: '20px 22px', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: TXT_MD, fontWeight: 800, letterSpacing: '.1em' }}>AI PREDICTION</div>
        <div style={{
          padding: '4px 9px', background: 'rgba(79,70,229,.14)', color: '#818CF8',
          fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', borderRadius: 4,
        }}>PRE GAME</div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-.02em', color: winnerCol, lineHeight: 1.15 }}>{winner.name}</div>
          <div style={{ fontSize: 11, color: TXT_MD, marginTop: 5, letterSpacing: '.06em', fontWeight: 600 }}>TO WIN</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Ring pct={confPct} size={78} stroke={7} color={confCol} />
          <div style={{ fontSize: 9.5, color: TXT_MD, fontWeight: 700, letterSpacing: '.1em', marginTop: 4 }}>CONFIDENCE</div>
        </div>
      </div>

      {score && (
        <>
          <div style={{
            marginTop: 18, paddingTop: 14,
            borderTop: '1px solid ' + CARD_LINE,
            fontSize: 10.5, color: TXT_MD, fontWeight: 700, letterSpacing: '.1em',
          }}>AI PROJECTED SCORE</div>
          <div style={{
            display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            marginTop: 10, fontFamily: MONO,
          }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: safeColor(detail.event.home.primary_color, '#EF4444') }}>
              {score.home}
            </div>
            <div style={{ fontSize: 22, color: TXT_LO }}>—</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: safeColor(detail.event.away.primary_color, '#A78BFA') }}>
              {score.away}
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: TXT_MD, marginTop: 4 }}>
            {winner.name} by {Math.abs(score.home - score.away)}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Three-metric row ───────────────────────────────────────────────────────
function ThreeMetrics({ detail }: { detail: EventDetail }) {
  const m = detail.model
  if (!m) return null
  const homePct = Math.round(m.home_win_prob * 100)
  const awayPct = 100 - homePct
  const line = m.projected_margin ?? 0
  const total = m.projected_total
  const { home, away } = detail.event
  const homeCol = safeColor(home.primary_color, '#EF4444')
  const awayCol = safeColor(away.primary_color, '#A78BFA')
  const lineCol = m.confidence != null ? (m.confidence >= 0.75 ? GREEN : m.confidence >= 0.55 ? YELLOW : RED) : GREEN
  const lineConfPct = Math.round((m.confidence ?? 0.8) * 100)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
      {/* AI WIN PROBABILITY */}
      <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_LINE, padding: '18px 20px' }}>
        <div style={{ fontSize: 11, color: TXT_MD, fontWeight: 800, letterSpacing: '.1em', display: 'flex', gap: 6, alignItems: 'center' }}>
          AI WIN PROBABILITY <span style={{ color: TXT_LO, fontSize: 11, fontWeight: 500 }}>ⓘ</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginTop: 16, gap: 12 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: homeCol, fontFamily: MONO }}>{homePct}%</div>
            <div style={{ fontSize: 10, color: TXT_MD, fontWeight: 700, letterSpacing: '.08em', marginTop: 3 }}>{home.abbr}</div>
            <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: `${homeCol}22`, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, right: `${100 - homePct}%`, background: homeCol, borderRadius: 3 }} />
            </div>
          </div>
          <Ring pct={Math.max(homePct, awayPct)} size={64} stroke={6}
                color={homePct > awayPct ? homeCol : awayCol} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: awayCol, fontFamily: MONO }}>{awayPct}%</div>
            <div style={{ fontSize: 10, color: TXT_MD, fontWeight: 700, letterSpacing: '.08em', marginTop: 3 }}>{away.abbr}</div>
            <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: `${awayCol}22` }}>
              <div style={{ height: 5, width: `${awayPct}%`, background: awayCol, borderRadius: 3, marginLeft: 'auto' }} />
            </div>
          </div>
        </div>
      </div>

      {/* AI LINE */}
      <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_LINE, padding: '18px 20px' }}>
        <div style={{ fontSize: 11, color: TXT_MD, fontWeight: 800, letterSpacing: '.1em', display: 'flex', gap: 6, alignItems: 'center' }}>
          AI LINE <span style={{ color: TXT_LO, fontSize: 11, fontWeight: 500 }}>ⓘ</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', marginTop: 16, gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <Crest color={homeCol} secondary={home.secondary_color} abbr={home.abbr} size={36} />
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, color: TXT_HI }}>
              {line > 0 ? '+' : ''}{line.toFixed(1)}
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: TXT_MD, fontWeight: 700, letterSpacing: '.1em' }}>AI LINE</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <Crest color={awayCol} secondary={away.secondary_color} abbr={away.abbr} size={36} />
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, color: TXT_HI }}>
              {line < 0 ? '+' : '-'}{Math.abs(line).toFixed(1)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 9.5, color: TXT_MD, fontWeight: 700, letterSpacing: '.08em' }}>LINE CONFIDENCE</div>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: `${lineCol}22`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, right: `${100 - lineConfPct}%`, background: lineCol, borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 11, color: lineCol, fontWeight: 800, fontFamily: MONO }}>{lineConfPct}%</div>
        </div>
      </div>

      {/* AI TOTAL POINTS */}
      <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_LINE, padding: '18px 20px' }}>
        <div style={{ fontSize: 11, color: TXT_MD, fontWeight: 800, letterSpacing: '.1em', display: 'flex', gap: 6, alignItems: 'center' }}>
          AI TOTAL POINTS <span style={{ color: TXT_LO, fontSize: 11, fontWeight: 500 }}>ⓘ</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: TXT_HI, fontFamily: MONO }}>{total != null ? total.toFixed(1) : '–'}</div>
          <div style={{ flex: 1, height: 38 }}>
            <MiniArea color={GREEN} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: TXT_MD, fontWeight: 700, letterSpacing: '.08em', marginTop: 6 }}>
          <span>OVER</span>
          <span>UNDER</span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 9.5, color: TXT_MD, fontWeight: 700, letterSpacing: '.08em' }}>TOTAL CONFIDENCE</div>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: `${GREEN}22`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, right: '12%', background: GREEN, borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 11, color: GREEN, fontWeight: 800, fontFamily: MONO }}>88%</div>
        </div>
      </div>
    </div>
  )
}

function MiniArea({ color }: { color: string }) {
  const pts = [30, 34, 32, 38, 42, 46, 48, 46, 52, 48, 55, 50, 52, 48]
  const max = Math.max(...pts), min = Math.min(...pts)
  const w = 100, h = 38
  const path = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w
    const y = h - ((v - min) / (max - min)) * (h - 4) - 2
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  const area = path + ` L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="mA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mA)" />
      <path d={path} stroke={color} strokeWidth={1.6} fill="none" />
      {pts.map((v, i) => (
        <circle key={i} cx={(i / (pts.length - 1)) * w} cy={h - ((v - min) / (max - min)) * (h - 4) - 2} r={1.3} fill={color} />
      ))}
    </svg>
  )
}

// ─── Odds Comparison (matching reference exactly) ──────────────────────────
function OddsComparison({ detail }: { detail: EventDetail }) {
  const [tab, setTab] = useState<'h2h' | 'line' | 'total'>('h2h')
  const { home, away } = detail.event
  const homeCol = safeColor(home.primary_color, '#EF4444')
  const awayCol = safeColor(away.primary_color, '#A78BFA')

  const rows = useMemo(() => {
    if (tab === 'h2h') {
      const src = detail.markets?.h2h ?? []
      const books = Array.from(new Set(src.map(r => r.bookmaker)))
      return books.slice(0, 6).map(bm => {
        const h = src.find(r => r.bookmaker === bm && r.outcome === home.name)
        const a = src.find(r => r.bookmaker === bm && r.outcome === away.name)
        return { bm, h, a }
      })
    } else if (tab === 'line') {
      const src = detail.markets?.spreads ?? []
      const books = Array.from(new Set(src.map(r => r.bookmaker)))
      return books.slice(0, 6).map(bm => {
        const h = src.find(r => r.bookmaker === bm && r.outcome === home.name)
        const a = src.find(r => r.bookmaker === bm && r.outcome === away.name)
        return { bm, h, a }
      })
    } else {
      const src = detail.markets?.totals ?? []
      const books = Array.from(new Set(src.map(r => r.bookmaker)))
      return books.slice(0, 6).map(bm => {
        const h = src.find(r => r.bookmaker === bm && r.outcome.toLowerCase() === 'over')
        const a = src.find(r => r.bookmaker === bm && r.outcome.toLowerCase() === 'under')
        return { bm, h, a }
      })
    }
  }, [tab, detail, home.name, away.name])

  const col1 = tab === 'h2h' ? `${home.abbr} (WIN)` : tab === 'line' ? `${home.abbr} LINE` : 'OVER'
  const col2 = tab === 'h2h' ? `${away.abbr} (WIN)` : tab === 'line' ? `${away.abbr} LINE` : 'UNDER'

  return (
    <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_LINE, padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.02em', color: TXT_HI, flex: 1 }}>ODDS COMPARISON</div>
        <div style={{ display: 'flex', background: CARD_BG_2, borderRadius: 8, padding: 3, gap: 2 }}>
          {(['h2h', 'line', 'total'] as const).map(t => {
            const label = t === 'h2h' ? 'HEAD TO HEAD' : t === 'line' ? 'LINE' : 'TOTAL POINTS'
            const on = tab === t
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '7px 16px', borderRadius: 6, border: 0,
                background: on ? '#4F46E5' : 'transparent',
                color: on ? '#fff' : TXT_MD,
                fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', cursor: 'pointer',
              }}>{label}</button>
            )
          })}
        </div>
      </div>

      <div style={{ marginTop: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: TXT_MD, fontSize: 10, fontWeight: 800, letterSpacing: '.08em' }}>
              <th style={{ textAlign: 'left', padding: '10px 4px' }}>BOOKMAKER</th>
              <th style={{ textAlign: 'right', padding: '10px 4px' }}>{col1}</th>
              <th style={{ textAlign: 'right', padding: '10px 4px' }}>{col2}</th>
              <th style={{ textAlign: 'right', padding: '10px 4px' }}>AI FAIR PRICE</th>
              <th style={{ textAlign: 'right', padding: '10px 4px' }}>VALUE</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: TXT_MD, padding: 24, fontSize: 12 }}>No markets available</td></tr>
            )}
            {rows.map((r, i) => {
              const hPoint = r.h?.point != null ? ` ${r.h.point > 0 ? '+' : ''}${r.h.point.toFixed(1)}` : ''
              const aPoint = r.a?.point != null ? ` ${r.a.point > 0 ? '+' : ''}${r.a.point.toFixed(1)}` : ''
              return (
                <tr key={i} style={{ borderTop: '1px solid ' + CARD_LINE }}>
                  <td style={{ padding: '13px 4px', fontWeight: 700, color: TXT_HI }}>
                    <BookTag name={r.bm} />
                  </td>
                  <td style={{ padding: '13px 4px', textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: TXT_HI }}>
                    {r.h?.price.toFixed(2) ?? '–'}
                    {hPoint && <div style={{ fontSize: 10, color: TXT_MD, fontWeight: 500 }}>{hPoint}</div>}
                  </td>
                  <td style={{ padding: '13px 4px', textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: TXT_HI }}>
                    {r.a?.price.toFixed(2) ?? '–'}
                    {aPoint && <div style={{ fontSize: 10, color: TXT_MD, fontWeight: 500 }}>{aPoint}</div>}
                  </td>
                  <td style={{ padding: '13px 4px', textAlign: 'right', fontFamily: MONO, color: '#818CF8', fontWeight: 700 }}>
                    {r.h?.fair_price?.toFixed(2) ?? '–'}
                    <div style={{ fontSize: 10, color: '#818CF8', opacity: .8 }}>{r.a?.fair_price?.toFixed(2) ?? '–'}</div>
                  </td>
                  <td style={{ padding: '13px 4px', textAlign: 'right', fontSize: 11, fontFamily: MONO }}>
                    <ValueBadge edge={r.h?.edge_pct} />
                    <ValueBadge edge={r.a?.edge_pct} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: TXT_LO }}>● Prices update in real time (30s)</div>
    </div>
  )
}

function ValueBadge({ edge }: { edge?: number | null }) {
  if (edge == null) return <div style={{ color: TXT_LO }}>–</div>
  const positive = edge > 0
  return (
    <div style={{ color: positive ? GREEN : RED, fontWeight: 800, lineHeight: 1.5 }}>
      {positive ? '▲' : '▼'} {Math.abs(edge).toFixed(1)}%
    </div>
  )
}

function BookTag({ name }: { name: string }) {
  const short = name.replace(/\s+/g, '').slice(0, 2).toUpperCase()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 26, height: 26, borderRadius: 6, background: 'rgba(129,140,248,.16)',
        color: '#818CF8', fontSize: 10, fontWeight: 900, display: 'grid', placeItems: 'center',
      }}>{short}</span>
      <span style={{ fontSize: 12.5 }}>{name}</span>
    </span>
  )
}

// ─── Movement Charts stack ─────────────────────────────────────────────────
function MovementCharts({ detail }: { detail: EventDetail }) {
  const { home, away } = detail.event
  const homeCol = safeColor(home.primary_color, '#EF4444')
  const awayCol = safeColor(away.primary_color, '#A78BFA')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <MovementCard title="WIN PROBABILITY MOVEMENT"
        eventId={detail.event.id} market="h2h" home={home.name} away={away.name}
        primary={homeCol} secondary={awayCol}
        showLegend legendA={home.abbr} legendB={away.abbr}
        endLabel={`${Math.round((detail.model?.home_win_prob ?? 0) * 100)}%`} />
      <MovementCard title="LINE MOVEMENT"
        eventId={detail.event.id} market="spreads" home={home.name} away={away.name}
        primary={awayCol}
        endLabel={detail.model?.projected_margin?.toFixed(1) ?? '–'} />
      <MovementCard title="TOTAL POINTS MOVEMENT"
        eventId={detail.event.id} market="totals" home="Over" away="Under"
        primary={GREEN}
        endLabel={detail.model?.projected_total?.toFixed(1) ?? '–'} />
    </div>
  )
}

function MovementCard({ title, eventId, market, home, primary, secondary, showLegend, legendA, legendB, endLabel }: {
  title: string; eventId: string; market: string; home: string; away: string;
  primary: string; secondary?: string;
  showLegend?: boolean; legendA?: string; legendB?: string;
  endLabel: string;
}) {
  const [pts, setPts] = useState<HistoryPoint[]>([])
  useEffect(() => {
    getEventHistory(eventId, { market, outcome: home })
      .then(r => setPts(r.history ?? []))
      .catch(() => setPts([]))
  }, [eventId, market, home])

  const chart = pts.length >= 2 ? pts : Array.from({ length: 12 }, (_, i) => ({ recorded_at: '', price: 1.9 + Math.sin(i * .6) * .1, point: 0 }))

  return (
    <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_LINE, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: TXT_MD, letterSpacing: '.08em' }}>{title}</div>
        {showLegend && (
          <div style={{ display: 'flex', gap: 10, fontSize: 10 }}>
            <span style={{ color: primary, fontWeight: 800 }}>● {legendA}</span>
            <span style={{ color: secondary, fontWeight: 800 }}>● {legendB}</span>
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, height: 62 }}>
        <MovementLine pts={chart} color={primary} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: TXT_LO, marginTop: 4 }}>
        <span>-24h</span><span>-12h</span><span>-6h</span><span>-3h</span><span>-1h</span>
        <span style={{ color: primary, fontWeight: 700 }}>Now {endLabel}</span>
      </div>
    </div>
  )
}

function MovementLine({ pts, color }: { pts: HistoryPoint[]; color: string }) {
  const w = 260, h = 62
  const vals = pts.map(p => p.price)
  const max = Math.max(...vals), min = Math.min(...vals)
  const range = max - min || 1
  const path = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * w
    const y = h - ((p.price - min) / range) * (h - 6) - 3
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <path d={path} stroke={color} strokeWidth={1.6} fill="none" />
      {pts.map((p, i) => {
        const x = (i / (pts.length - 1)) * w
        const y = h - ((p.price - min) / range) * (h - 6) - 3
        return <circle key={i} cx={x} cy={y} r={1.6} fill={color} />
      })}
    </svg>
  )
}

// ─── Team News & Lineups ───────────────────────────────────────────────────
function TeamNewsLineups({ detail }: { detail: EventDetail }) {
  const { home, away } = detail.event
  const lineups = detail.lineups ?? []
  const homeLineups = lineups.filter(l => l.team === home.name)
  const awayLineups = lineups.filter(l => l.team === away.name)

  return (
    <div style={{ background: CARD_BG, borderRadius: 12, border: '1px solid ' + CARD_LINE, padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.02em', color: TXT_HI }}>TEAM NEWS & LINEUPS</div>
        <span style={{ color: TXT_LO, fontSize: 11 }}>ⓘ</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <TeamColumn team={home} lineups={homeLineups} accent={safeColor(home.primary_color, '#EF4444')} />
        <TeamColumn team={away} lineups={awayLineups} accent={safeColor(away.primary_color, '#A78BFA')} />
      </div>

      <div style={{
        marginTop: 16, padding: '13px 16px',
        background: CARD_BG_2, borderRadius: 8,
        borderLeft: '3px solid #818CF8',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, color: '#818CF8', letterSpacing: '.06em' }}>
          ⚡ AI IMPACT
        </div>
        <div style={{ fontSize: 12.5, color: TXT_HI, marginTop: 6, lineHeight: 1.5 }}>
          {detail.model?.rationale ?? 'Awaiting model output.'}
        </div>
      </div>

      {detail.weather && !detail.weather.is_indoor && (
        <div style={{ marginTop: 10, padding: '11px 16px', background: CARD_BG_2, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22 }}>{detail.weather.rain_prob > 0.3 ? '🌧' : '⛅'}</div>
          <div style={{ fontSize: 11.5, color: TXT_MD, lineHeight: 1.5 }}>
            <b style={{ color: TXT_HI, fontWeight: 800 }}>WEATHER IMPACT.</b> {detail.weather.condition}, {Math.round(detail.weather.temp_c)}°C,
            wind {Math.round(detail.weather.wind_kmh)} km/h. Adjusts total-points projection slightly.
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, padding: '11px 16px', background: CARD_BG_2, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 22 }}>🧠</div>
        <div style={{ fontSize: 11.5, color: TXT_MD, lineHeight: 1.5 }}>
          <b style={{ color: TXT_HI, fontWeight: 800 }}>AI MODEL FACTORS.</b> Odds consensus, per-book fair pricing, market agreement,
          weather adjustments and reported line-ups.
        </div>
      </div>
    </div>
  )
}

function TeamColumn({ team, lineups, accent }: {
  team: { name: string; abbr: string; primary_color: string; secondary_color: string };
  lineups: EventDetail['lineups'];
  accent: string;
}) {
  const outs = lineups.filter(l => l.status === 'out' || l.status === 'doubtful')
  const ins = lineups.filter(l => l.status === 'in')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Crest color={accent} secondary={team.secondary_color} abbr={team.abbr} size={30} />
        <div style={{ fontSize: 12.5, fontWeight: 800, color: accent, letterSpacing: '.02em', textTransform: 'uppercase' }}>{team.name}</div>
      </div>

      {ins.length > 0 && <div style={{ fontSize: 10, color: GREEN, fontWeight: 800, letterSpacing: '.1em', marginBottom: 8 }}>IN</div>}
      {ins.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', color: TXT_HI }}>
          <span style={{ color: GREEN, fontWeight: 900 }}>✓</span>
          {p.player_name ?? p.player ?? 'Player'}
        </div>
      ))}

      {outs.length > 0 && <div style={{ fontSize: 10, color: RED, fontWeight: 800, letterSpacing: '.1em', marginBottom: 8, marginTop: ins.length ? 10 : 0 }}>OUT</div>}
      {outs.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', color: TXT_HI }}>
          <span style={{ color: RED, fontWeight: 900 }}>✗</span>
          {p.player_name ?? p.player ?? 'Player'}
          {p.reason && <span style={{ color: TXT_MD, fontSize: 11 }}>– {p.reason}</span>}
        </div>
      ))}

      {ins.length === 0 && outs.length === 0 && (
        <div style={{ fontSize: 12, color: TXT_LO, marginTop: 4 }}>Lineups not yet announced.</div>
      )}
    </div>
  )
}

// ─── Bottom status bar ─────────────────────────────────────────────────────
function StatusBar({ detail }: { detail: EventDetail }) {
  const m = detail.model
  if (!m) return null
  const winnerIsHome = m.home_win_prob > m.away_win_prob
  const winner = winnerIsHome ? detail.event.home : detail.event.away
  const winnerCol = safeColor(winner.primary_color, winnerIsHome ? '#EF4444' : '#A78BFA')
  const score = projectedScore(m.projected_margin, m.projected_total)

  const all = [
    ...(detail.markets?.h2h ?? []),
    ...(detail.markets?.spreads ?? []),
    ...(detail.markets?.totals ?? []),
  ]
  const best = all.filter(r => (r.edge_pct ?? 0) > 0 && (r.edge_pct ?? 0) < 20)
    .sort((a, b) => (b.edge_pct ?? 0) - (a.edge_pct ?? 0))[0]

  return (
    <div style={{
      background: `linear-gradient(90deg, ${winnerCol}18 0%, ${CARD_BG} 45%, ${CARD_BG} 55%, ${GREEN}18 100%)`,
      borderRadius: 12, border: '1px solid ' + CARD_LINE,
      padding: '18px 26px', display: 'grid',
      gridTemplateColumns: '1fr 1fr 1.4fr', gap: 24, alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 26 }}>🏆</div>
        <div>
          <div style={{ fontSize: 10, color: TXT_MD, fontWeight: 800, letterSpacing: '.1em' }}>AI PREDICTED WINNER</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: winnerCol, textTransform: 'uppercase', marginTop: 2 }}>{winner.name}</div>
        </div>
      </div>

      {score ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: TXT_MD, fontWeight: 800, letterSpacing: '.1em' }}>PROJECTED SCORE</div>
          <div style={{ marginTop: 4, fontFamily: MONO, fontWeight: 900, fontSize: 18 }}>
            <span style={{ color: TXT_MD, fontSize: 10, marginRight: 6 }}>{detail.event.home.abbr}</span>
            <span style={{ color: safeColor(detail.event.home.primary_color, '#EF4444') }}>{score.home}</span>
            <span style={{ color: TXT_LO, margin: '0 10px' }}>—</span>
            <span style={{ color: safeColor(detail.event.away.primary_color, '#A78BFA') }}>{score.away}</span>
            <span style={{ color: TXT_MD, fontSize: 10, marginLeft: 6 }}>{detail.event.away.abbr}</span>
          </div>
        </div>
      ) : <div />}

      {best && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: TXT_MD, fontWeight: 800, letterSpacing: '.1em' }}>BEST VALUE BET</div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: TXT_HI, marginTop: 2 }}>
              {best.outcome}
              {best.point != null && ` ${best.point > 0 ? '+' : ''}${best.point.toFixed(1)}`}
              {' '}@ {best.price.toFixed(2)} ({best.bookmaker})
            </div>
          </div>
          <div style={{
            padding: '8px 14px', background: GREEN_DIM,
            color: GREEN, fontSize: 13, fontWeight: 900, borderRadius: 6,
            border: '1px solid rgba(34,197,94,.35)',
          }}>{best.edge_pct?.toFixed(1)}% VALUE</div>
        </div>
      )}
    </div>
  )
}

// ─── Error boundary ─────────────────────────────────────────────────────────
class MockupBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 32, color: RED, fontFamily: 'monospace', background: BG_PAGE, minHeight: '100vh' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Mockup render error:</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(this.state.err.stack ?? this.state.err.message)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Main page ─────────────────────────────────────────────────────────────
function MockupInner() {
  const { events } = useDashboard()
  const [detail, setDetail] = useState<EventDetail | null>(null)

  // Pick first event that has ALL three markets and lineups (best coverage)
  const featuredId = useMemo(() => events[0]?.id ?? null, [events])

  useEffect(() => {
    if (!featuredId) return
    getEvent(featuredId).then(setDetail).catch(() => setDetail(null))
    const id = setInterval(() => {
      getEvent(featuredId).then(setDetail).catch(() => {})
    }, 30_000)
    return () => clearInterval(id)
  }, [featuredId])

  const overallConf = Math.round((detail?.model?.confidence ?? 0.75) * 100)

  return (
    <div style={{
      minHeight: '100vh', background: BG_PAGE, color: TXT_HI,
      fontFamily: 'Inter, system-ui, sans-serif', display: 'flex',
    }}>
      <Sidebar overallConf={overallConf} />

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar sport={detail?.event.sport ?? 'AFL'} />

        {!detail ? (
          <div style={{ padding: 40, color: TXT_MD, textAlign: 'center' }}>Loading featured match…</div>
        ) : (
          <div style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Hero + Prediction */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 14 }}>
              <TeamHero detail={detail} />
              <AiPredictionCard detail={detail} />
            </div>

            {/* 3 metric cards */}
            <ThreeMetrics detail={detail} />

            {/* Odds + Movement */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 14 }}>
              <OddsComparison detail={detail} />
              <MovementCharts detail={detail} />
            </div>

            {/* Team News */}
            <TeamNewsLineups detail={detail} />

            {/* Status bar */}
            <StatusBar detail={detail} />
          </div>
        )}
      </main>
    </div>
  )
}

export default function Mockup() {
  return (
    <MockupBoundary>
      <MockupInner />
    </MockupBoundary>
  )
}
