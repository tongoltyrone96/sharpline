import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard, DashboardEvent } from '../hooks/useDashboard'
import { getEvent, getEventHistory, HistoryPoint } from '../lib/api'

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────
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
    id: string; sport: string; commence_time: string; status?: string
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

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
function sgn(n: number): string { return (n > 0 ? '+' : '−') + Math.abs(n).toFixed(1) }

function fmtDayTime(iso: string): { day: string; time: string } {
  const d = new Date(iso)
  const day = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()]
  const hh = d.getHours(), mm = String(d.getMinutes()).padStart(2, '0')
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const hh12 = hh % 12 || 12
  return { day, time: `${hh12}:${mm} ${ampm}` }
}

function seedFrom(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}
function fakeLadder(abbr: string): string {
  const p = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th','14th']
  return p[seedFrom(abbr + 'l') % p.length]
}
function fakeRecord(abbr: string): string {
  const s = seedFrom(abbr + 'r')
  const w = 3 + (s % 10)
  const l = 3 + ((s >> 4) % 9)
  return `${w}W – ${l}L`
}
function fakeForm(abbr: string): ('W'|'L')[] {
  const s = seedFrom(abbr + 'f')
  return [0,1,2,3,4].map(i => ((s >> (i * 3)) & 1) ? 'W' : 'L') as ('W'|'L')[]
}
function fakeH2H(id: string): { hw: number; aw: number; last: ('h'|'a')[] } {
  const s = seedFrom(id + 'h2h')
  const hw = 3 + (s % 6)
  const aw = 10 - hw
  const last: ('h'|'a')[] = []
  for (let i = 0; i < 10; i++) last.push(((s >> i) & 1) ? 'h' : 'a')
  return { hw, aw, last }
}
function fakeAdjPct(abbr: string): number {
  const s = seedFrom(abbr + 'adj')
  return (s % 7) - 3 // -3..+3
}
function fakeMetrics(homeAbbr: string, awayAbbr: string) {
  const hs = seedFrom(homeAbbr + 'metrics'), as = seedFrom(awayAbbr + 'metrics')
  const rng = (seed: number, min: number, max: number) => min + (seed % 1000) / 1000 * (max - min)
  const homeAtk = rng(hs, 95, 115), awayAtk = rng(as, 95, 115)
  const homeDef = rng(hs >> 3, 95, 120), awayDef = rng(as >> 3, 95, 120)
  const homeET = rng(hs >> 6, 1.5, 3.4), awayET = rng(as >> 6, 1.5, 3.4)
  const homeCmp = Math.round(rng(hs >> 9, 74, 88)), awayCmp = Math.round(rng(as >> 9, 74, 88))
  const homePos = Math.round(rng(hs >> 12, 45, 55)), awayPos = 100 - homePos
  const homeTer = Math.round(rng(hs >> 15, 44, 56)), awayTer = 100 - homeTer
  const homePen = rng(hs >> 18, 5.0, 8.5), awayPen = rng(as >> 18, 5.0, 8.5)
  return [
    { label: 'Attack Rating',     h: homeAtk.toFixed(1), a: awayAtk.toFixed(1), homeAdv: homeAtk > awayAtk },
    { label: 'Defence Rating',    h: homeDef.toFixed(1), a: awayDef.toFixed(1), homeAdv: homeDef < awayDef },
    { label: 'Expected Tries',    h: homeET.toFixed(1),  a: awayET.toFixed(1),  homeAdv: homeET > awayET },
    { label: 'Completion Rate',   h: homeCmp + '%',      a: awayCmp + '%',      homeAdv: homeCmp > awayCmp },
    { label: 'Possession %',      h: homePos + '%',      a: awayPos + '%',      homeAdv: homePos > awayPos },
    { label: 'Territory %',       h: homeTer + '%',      a: awayTer + '%',      homeAdv: homeTer > awayTer },
    { label: 'Penalties Conceded',h: homePen.toFixed(1), a: awayPen.toFixed(1), homeAdv: homePen < awayPen },
  ]
}
function fakePower(homeAbbr: string, awayAbbr: string): { home: number; away: number } {
  const hs = seedFrom(homeAbbr + 'pow') % 16, as = seedFrom(awayAbbr + 'pow') % 16
  const h = 1 + hs, a = 1 + as
  return { home: h === a ? h + 1 : h, away: a }
}
function splitName(name: string): { city: string; short: string } {
  if (!name) return { city: '', short: '' }
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { city: parts[0].toUpperCase(), short: parts[0] }
  return { city: parts.slice(0, -1).join(' ').toUpperCase(), short: parts[parts.length - 1] }
}
function safeCol(c: string | null | undefined, fallback: string): string {
  if (!c) return fallback
  const s = c.trim().toLowerCase()
  if (s === '#000000' || s === '#fff' || s === '#ffffff' || s === '#000') return fallback
  return c
}
function darken(hex: string, amt = 0.65): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0,2), 16), g = parseInt(h.slice(2,4), 16), b = parseInt(h.slice(4,6), 16)
  return `rgb(${Math.round(r*(1-amt))}, ${Math.round(g*(1-amt))}, ${Math.round(b*(1-amt))})`
}
const VENUE_BY_HOME_TEAM: Record<string, string> = {
  // NRL
  'Brisbane Broncos':               'Suncorp Stadium',
  'Canberra Raiders':               'GIO Stadium',
  'Canterbury Bulldogs':            'Accor Stadium',
  'Cronulla Sutherland Sharks':     'PointsBet Stadium',
  'Cronulla Sharks':                'PointsBet Stadium',
  'Dolphins':                       'Kayo Stadium',
  'Gold Coast Titans':              'Cbus Super Stadium',
  'Manly Warringah Sea Eagles':     '4 Pines Park',
  'Manly Sea Eagles':               '4 Pines Park',
  'Melbourne Storm':                'AAMI Park',
  'New Zealand Warriors':           'Go Media Stadium',
  'Newcastle Knights':              'McDonald Jones Stadium',
  'North Queensland Cowboys':       'Queensland Country Bank Stadium',
  'Parramatta Eels':                'CommBank Stadium',
  'Penrith Panthers':               'BlueBet Stadium',
  'South Sydney Rabbitohs':         'Accor Stadium',
  'St George Illawarra Dragons':    'WIN Stadium',
  'Sydney Roosters':                'Allianz Stadium',
  'Wests Tigers':                   'Leichhardt Oval',
  // AFL
  'Adelaide Crows':                 'Adelaide Oval',
  'Brisbane Lions':                 'The Gabba',
  'Carlton Blues':                  'MCG',
  'Collingwood Magpies':            'MCG',
  'Essendon Bombers':               'Marvel Stadium',
  'Fremantle Dockers':              'Optus Stadium',
  'Geelong Cats':                   'GMHBA Stadium',
  'Gold Coast Suns':                'People First Stadium',
  'Greater Western Sydney Giants':  'GIANTS Stadium',
  'GWS Giants':                     'GIANTS Stadium',
  'Hawthorn Hawks':                 'MCG',
  'Melbourne Demons':               'MCG',
  'North Melbourne Kangaroos':      'Marvel Stadium',
  'Port Adelaide Power':            'Adelaide Oval',
  'Richmond Tigers':                'MCG',
  'St Kilda Saints':                'Marvel Stadium',
  'Sydney Swans':                   'SCG',
  'West Coast Eagles':              'Optus Stadium',
  'Western Bulldogs':               'Marvel Stadium',
}
function venueFor(sport: string, homeTeamName?: string): string {
  if (homeTeamName && VENUE_BY_HOME_TEAM[homeTeamName]) {
    return VENUE_BY_HOME_TEAM[homeTeamName].toUpperCase()
  }
  const s = (sport || '').toUpperCase()
  if (s === 'NRL') return 'HOME GROUND'
  if (s === 'AFL') return 'HOME GROUND'
  if (s === 'MLB') return 'HOME BALLPARK'
  if (s === 'NFL') return 'HOME STADIUM'
  return 'HOME VENUE'
}
function projectedScore(mu: number | null, tot: number | null): { home: number; away: number } | null {
  if (mu == null || tot == null) return null
  // mu > 0 = home underdog (loses by mu). Home score = (total - mu) / 2.
  const home = Math.max(0, Math.round((tot - mu) / 2))
  const away = Math.max(0, Math.round((tot + mu) / 2))
  return { home, away }
}
function bestBet(md: EventDetail): { edge: number; text: string; bk: string; mkt: string } | null {
  const rows: Array<{ e: number; t: string; b: string; m: string }> = []
  for (const r of md.markets?.h2h ?? []) {
    if (r.edge_pct != null && r.edge_pct > 0 && r.edge_pct < 20) {
      rows.push({ e: r.edge_pct, t: `${r.outcome} to win @ ${r.price.toFixed(2)}`, b: r.bookmaker, m: 'H2H' })
    }
  }
  for (const r of md.markets?.spreads ?? []) {
    if (r.edge_pct != null && r.edge_pct > 0 && r.edge_pct < 20 && r.point != null) {
      rows.push({ e: r.edge_pct, t: `${r.outcome} ${sgn(r.point)} @ ${r.price.toFixed(2)}`, b: r.bookmaker, m: 'Line' })
    }
  }
  for (const r of md.markets?.totals ?? []) {
    if (r.edge_pct != null && r.edge_pct > 0 && r.edge_pct < 20 && r.point != null) {
      rows.push({ e: r.edge_pct, t: `${r.outcome} ${r.point.toFixed(1)} @ ${r.price.toFixed(2)}`, b: r.bookmaker, m: 'Totals' })
    }
  }
  if (!rows.length) return null
  rows.sort((a, b) => b.e - a.e)
  return { edge: rows[0].e, text: rows[0].t, bk: rows[0].b, mkt: rows[0].m }
}

// ───────────────────────────────────────────────────────────────────────────
// Scoped CSS — everything is under .mck-root so it can't leak
// ───────────────────────────────────────────────────────────────────────────
const CSS = `
.mck-root, .mck-root *{box-sizing:border-box}
.mck-root{
  --mbg:#04060b; --mpanel:#0a0f19; --mpanel2:#0d1320; --mline:#182133; --msoft:#121a29;
  --mtxt:#e7eef8; --mdim:#7b8ba3; --mdim2:#55647a;
  --mgreen:#25d97b; --mred:#f4526a; --mblue:#4da6ff; --mr:9px;
  background:var(--mbg); color:var(--mtxt);
  font-family:Inter,system-ui,sans-serif; -webkit-font-smoothing:antialiased;
  padding:6px; display:flex; gap:6px; min-height:100vh;
  align-items:flex-start;
  -webkit-text-size-adjust:100%; text-size-adjust:100%;
  max-width:100vw; overflow-x:hidden;
}
.mck-root .mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.mck-root a{text-decoration:none;color:inherit}
.mck-root ::-webkit-scrollbar{height:5px;width:5px}
.mck-root ::-webkit-scrollbar-thumb{background:#1e2b3f;border-radius:3px}

.mck-root .p{background:var(--mpanel);border:1px solid var(--mline);border-radius:var(--mr);display:flex;flex-direction:column;overflow:hidden}
.mck-root .ph{display:flex;align-items:center;gap:6px;padding:6px 9px 4px;flex:none}
.mck-root .pt{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#c3d0e2;white-space:nowrap}
.mck-root .q{width:11px;height:11px;border-radius:50%;border:1px solid var(--mline);color:var(--mdim2);font-size:7.5px;display:grid;place-items:center;flex:none}
.mck-root .pb{padding:0 9px 8px;flex:1;display:flex;flex-direction:column;min-width:0}
.mck-root svg.ch{flex:1;min-height:0;width:100%;height:100%}
/* Wrap tables so they scroll horizontally on narrow phones rather than
   being clipped by the panel's overflow: hidden. */
.mck-root .tblwrap{overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0}
.mck-root .tblwrap table{min-width:100%}

.mck-root .side{width:116px;flex:none;background:var(--mpanel);border:1px solid var(--mline);border-radius:var(--mr);display:flex;flex-direction:column;padding:8px 0 6px;overflow:hidden;position:sticky;top:6px;align-self:flex-start;height:calc(100vh - 12px)}
.mck-root .brand{display:grid;place-items:center;padding-bottom:6px}
.mck-root .nav{display:flex;flex-direction:column}
.mck-root .nav a{display:flex;align-items:center;gap:7px;padding:5px 10px;color:var(--mdim);font-size:10.5px;font-weight:500;border-left:2px solid transparent;cursor:pointer}
.mck-root .nav a svg{width:12px;height:12px;flex:none;stroke:currentColor;fill:none;stroke-width:1.7}
.mck-root .nav a:hover{color:#c3d0e2;background:#0e1523}
.mck-root .nav a.on{color:var(--mblue);border-left-color:var(--mblue);background:linear-gradient(90deg,#0f2035,transparent)}
.mck-root .nav .soon{opacity:.32;cursor:default;pointer-events:none}
.mck-root .navsep{font-size:7px;letter-spacing:.13em;color:var(--mdim2);font-weight:700;padding:8px 10px 3px}
.mck-root .cc{margin:auto 6px 0;background:var(--mpanel2);border:1px solid var(--mline);border-radius:8px;padding:7px 5px;text-align:center;flex:none}
.mck-root .cc .l{font-size:7px;letter-spacing:.1em;color:var(--mdim);font-weight:700}
.mck-root .cc .vh{font-size:8.5px;font-weight:800;color:var(--mgreen);margin-top:2px}
.mck-root .cc .s{font-size:7px;color:var(--mdim2);line-height:1.3;margin-top:1px}

.mck-root main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.mck-root .top{display:flex;align-items:center;gap:7px;flex:none;flex-wrap:nowrap}
.mck-root .top h1{font-size:14px;font-weight:800;letter-spacing:-.01em;line-height:1.1;white-space:nowrap;color:var(--mtxt)}
.mck-root .top .sb{font-size:7px;letter-spacing:.13em;color:var(--mdim);font-weight:600}
.mck-root .ctl{display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:nowrap;min-width:0}
.mck-root select,.mck-root .srch{background:var(--mpanel);border:1px solid var(--mline);border-radius:7px;color:#c3d0e2;font-family:inherit;
 font-size:10.5px;font-weight:600;padding:5px 8px;outline:none;cursor:pointer}
.mck-root .srchw{position:relative;display:flex;align-items:center}
.mck-root .srchw svg{position:absolute;left:7px;width:11px;height:11px;stroke:var(--mdim2);fill:none;stroke-width:2;pointer-events:none}
.mck-root .srch{padding-left:22px;width:132px;cursor:text;font-weight:500}
.mck-root .srch::placeholder{color:var(--mdim2)}
.mck-root .tg{display:flex;align-items:center;gap:6px;background:var(--mpanel);border:1px solid var(--mline);border-radius:7px;padding:5px 9px;cursor:pointer;user-select:none;white-space:nowrap}
.mck-root .tg .lb{font-size:9px;font-weight:700;letter-spacing:.07em;color:var(--mdim)}
.mck-root .tg.on .lb{color:var(--mgreen)}
.mck-root .sw{width:24px;height:13px;border-radius:8px;background:#1a2333;position:relative;transition:.15s;flex:none}
.mck-root .sw::after{content:'';position:absolute;top:2px;left:2px;width:9px;height:9px;border-radius:50%;background:#55647a;transition:.15s}
.mck-root .tg.on .sw{background:#0d3d24}
.mck-root .tg.on .sw::after{left:13px;background:var(--mgreen)}
.mck-root .livep{display:flex;align-items:center;gap:5px;background:#0d2a1a;border:1px solid #1b6b3f;border-radius:7px;padding:5px 9px;
 color:var(--mgreen);letter-spacing:.09em;font-size:9px;font-weight:800;white-space:nowrap}
.mck-root .round-picker{position:relative;display:inline-flex;align-items:center}
.mck-root .round-picker select{padding:6px 32px 6px 12px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#e7eef8;background:var(--mpanel);border:1px solid var(--mline);border-radius:7px;cursor:pointer;appearance:none;-webkit-appearance:none}
.mck-root .round-picker .rp-cal{position:absolute;right:8px;pointer-events:none;font-size:11px;opacity:.7}
.mck-root .sharebtn{display:flex;align-items:center;gap:5px;background:var(--mpanel);border:1px solid var(--mline);border-radius:7px;padding:6px 12px;color:#c3d0e2;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:.02em}
.mck-root .sharebtn:hover{border-color:#2f4666}
.mck-root .bellbtn{width:32px;height:30px;background:var(--mpanel);border:1px solid var(--mline);border-radius:7px;display:grid;place-items:center;color:#c3d0e2;cursor:pointer;font-size:13px}
.mck-root .dot{width:5px;height:5px;border-radius:50%;background:var(--mgreen);box-shadow:0 0 6px var(--mgreen);animation:mck-pl 2s infinite}
@keyframes mck-pl{50%{opacity:.35}}
.mck-root .mockp{font-size:7.5px;letter-spacing:.12em;font-weight:800;color:#7a6320;background:#1c1604;border:1px solid #3a2f0e;border-radius:5px;padding:4px 6px;white-space:nowrap}

.mck-root .stripw{position:relative;flex:0 0 90px;min-height:0}
.mck-root .strip{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;height:100%;scroll-behavior:smooth;padding:0 22px}
.mck-root .arw{position:absolute;top:50%;transform:translateY(-50%);width:20px;height:44px;background:#0c1220;border:1px solid var(--mline);
 border-radius:6px;display:grid;place-items:center;cursor:pointer;z-index:3;color:var(--mdim)}
.mck-root .arw:hover{color:#c3d0e2;border-color:#2f4666}
.mck-root .arw.l{left:0}
.mck-root .arw.r{right:0}
.mck-root .gi{flex:0 0 196px;background:var(--mpanel);border:1px solid var(--mline);border-radius:8px;padding:6px 8px;cursor:pointer;
 display:flex;flex-direction:column;gap:4px;transition:border-color .12s,background .12s}
.mck-root .gi:hover{border-color:#2f4666}
.mck-root .gi.on{border-color:var(--mblue);background:#0b1524;box-shadow:inset 0 0 0 1px rgba(77,166,255,.25)}
.mck-root .gi.hide{display:none}
.mck-root .gi .r1{display:flex;align-items:center;gap:5px}
.mck-root .lg{font-size:7px;font-weight:800;letter-spacing:.06em;padding:2px 4px;border-radius:3px;background:#16213a;color:#8fa2bb}
.mck-root .gi .tm{font-size:9px;color:var(--mdim);font-weight:600}
.mck-root .gi .ed{margin-left:auto;font-size:10px;font-weight:800;color:var(--mgreen)}
.mck-root .gi .ed.no{color:var(--mdim2);font-weight:600}
.mck-root .gi .r2{display:flex;align-items:center;gap:5px}
.mck-root .gi .sd{display:flex;align-items:center;gap:4px;flex:1;min-width:0}
.mck-root .gi .sd.r{flex-direction:row-reverse}
.mck-root .gi .cr{width:19px;height:19px;flex:none}
.mck-root .gi .ab{font-size:10.5px;font-weight:800;line-height:1}
.mck-root .gi .vs{font-size:7px;color:var(--mdim2);font-weight:700}
.mck-root .gi .r3{display:flex;align-items:center;gap:5px;font-size:9px;color:var(--mdim2);font-weight:600}
.mck-root .gi .r3 b{color:#c3d0e2;font-weight:700;font-family:'IBM Plex Mono',monospace}
.mck-root .gi .r3 .sp{margin-left:auto}
.mck-root .empty{display:grid;place-items:center;width:100%;color:var(--mdim2);font-size:11px}

.mck-root .row{display:grid;gap:6px}
.mck-root .rh{grid-template-columns:1fr 380px}
.mck-root .r3g{grid-template-columns:1fr 1fr 1fr}
.mck-root .rm{grid-template-columns:1.06fr 1fr .84fr;align-items:stretch}
.mck-root .rmega{grid-template-columns:1.06fr 1fr .84fr;align-items:stretch}
.mck-root .mcol{display:flex;flex-direction:column;gap:6px;min-width:0}
.mck-root .mcol>.p{flex:none}
/* Right column: Line + Total grow to fill space; H2H + Recent Form stay compact and bottom-attached */
.mck-root .mcol-r>#pLineMv,.mck-root .mcol-r>#pTotMv{flex:1 1 0;min-height:150px}
/* Left / middle columns: OddsComparison, WinProbMovement, Matchup grow to fill matching height */
.mck-root .mcol>#pOdds,.mck-root .mcol>#pNews,.mck-root .mcol>#pMove,.mck-root .mcol>#pMetrics{flex:1 1 auto}
.mck-root .mcol>#pMove .pb{height:auto;min-height:210px;flex:1}
.mck-root .stk{display:flex;flex-direction:column;gap:6px}
.mck-root .stk>.p{flex:none}
.mck-root .ch{display:block;width:100%;height:auto}

/* Movement chart with HTML axis labels (SVG only stretches the line) */
.mck-root .chg{display:grid;grid-template-columns:42px 1fr 44px;grid-template-rows:1fr 18px;column-gap:0;row-gap:0;height:100%;padding:4px 4px 4px 2px}
.mck-root .chg-yaxis{grid-column:1;grid-row:1;display:flex;flex-direction:column;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:#c3d0e2;text-align:right;padding-right:6px;line-height:1}
.mck-root .chg-yaxis>span:first-child{margin-top:-4px}
.mck-root .chg-yaxis>span:last-child{margin-bottom:-4px}
.mck-root .chg-plot{grid-column:2;grid-row:1;position:relative}
.mck-root .chg-svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.mck-root .chg-mkr{position:absolute;width:6px;height:6px;border-radius:50%;background:#0a0f19;border:1.5px solid #25d97b;transform:translate(-50%,-50%);pointer-events:none;box-sizing:border-box;z-index:1}
.mck-root .chg-endcol{grid-column:3;grid-row:1;position:relative}
.mck-root .chg-dot{position:absolute;left:0;width:9px;height:9px;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 0 2px #0d1320;pointer-events:none;z-index:2}
.mck-root .chg-end{position:absolute;right:2px;transform:translateY(-50%);font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:800;line-height:1;pointer-events:none;white-space:nowrap}
.mck-root .chg-xaxis{grid-column:2;grid-row:2;display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:500;color:#9fb0c6;padding:4px 2px 0;line-height:1}
.mck-root #pMove .pb{height:210px;padding:6px 12px 8px}
.mck-root #pLineMv .pb,.mck-root #pTotMv .pb{min-height:105px;padding:6px 12px 8px;flex:1}

.mck-root .hero{border-radius:var(--mr);border:1px solid var(--mline);overflow:hidden;display:grid;grid-template-columns:1fr 170px 1fr;align-items:center}
.mck-root .st{display:flex;align-items:center;gap:14px;padding:10px 18px}
.mck-root .st.aw{flex-direction:row-reverse;text-align:right}
.mck-root .crest{width:76px;height:76px;flex:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))}
.mck-root .city{font-size:11px;letter-spacing:.07em;font-weight:700;opacity:.9;color:#f1f5ff}
.mck-root .tn{font-size:24px;font-weight:900;letter-spacing:-.02em;line-height:1;margin-top:2px;color:var(--mtxt)}
.mck-root .tmeta{margin-top:6px;font-size:11px;color:#e2e8f3;font-weight:700}
.mck-root .tf{display:flex;gap:3px;margin-top:4px}
.mck-root .st.aw .tf{justify-content:flex-end}
.mck-root .f{width:14px;height:14px;border-radius:3px;display:grid;place-items:center;font-size:7.5px;font-weight:800;font-family:'IBM Plex Mono',monospace}
.mck-root .f.w{background:#0f3d24;color:var(--mgreen)}
.mck-root .f.l{background:#3b1420;color:var(--mred)}
.mck-root .hmid{text-align:center;padding:6px 2px}
.mck-root .hmid .vn{font-size:8.5px;letter-spacing:.08em;color:#a9b6c8;font-weight:700}
.mck-root .hmid .wh{font-size:9.5px;color:var(--mdim);margin-top:1px}
.mck-root .hmid .tmp{font-size:17px;font-weight:700;color:var(--mtxt)}
.mck-root .hmid .wd{font-size:9px;color:var(--mdim);line-height:1.35}

.mck-root .pred{padding:8px 10px;justify-content:space-between}
.mck-root .pr1{display:flex;align-items:flex-start;justify-content:space-between}
.mck-root .tag{font-size:7px;letter-spacing:.1em;font-weight:800;padding:3px 6px;border-radius:4px;background:#0d2a1a;color:var(--mgreen);border:1px solid #1b6b3f}
.mck-root .pred .tm2{font-size:16px;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-top:4px;color:var(--mtxt)}
.mck-root .pred .to{font-size:8px;letter-spacing:.12em;color:var(--mdim);font-weight:700;margin-top:1px}
.mck-root .lay{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mck-root .cap{font-size:7px;letter-spacing:.1em;color:var(--mdim);font-weight:700;text-align:center}
.mck-root .pred hr{border:0;border-top:1px solid var(--msoft);margin:5px 0 3px}
.mck-root .ps{font-size:7.5px;letter-spacing:.11em;color:var(--mdim);font-weight:700}
.mck-root .score{display:flex;align-items:center;justify-content:center;gap:12px}
.mck-root .score .n{font-size:24px;font-weight:800;letter-spacing:-.03em}
.mck-root .by{text-align:center;font-size:9.5px;color:var(--mdim)}

.mck-root .wp{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1;padding:2px 0}
.mck-root .wp .pc{font-size:28px;font-weight:800;letter-spacing:-.02em;line-height:1}
.mck-root .wp .nm{font-size:8.5px;letter-spacing:.1em;color:var(--mdim);font-weight:700;margin-top:3px}
.mck-root .bar{height:7px;border-radius:4px;background:#1a2333;overflow:hidden;flex:none;margin-top:8px;display:flex}
.mck-root .bar i{display:block;height:100%}
.mck-root .lc{display:flex;align-items:center;justify-content:space-between;gap:6px;flex:1;padding:4px 0}
.mck-root .lc .v{font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1}
.mck-root .lc .lb{font-size:8.5px;letter-spacing:.11em;color:var(--mdim);font-weight:700;text-align:center}
.mck-root .mc{width:36px;height:36px;flex:none}
.mck-root .cr2{display:flex;align-items:center;gap:6px;flex:none;margin-top:8px}
.mck-root .cr2 .l{font-size:8.5px;letter-spacing:.11em;color:var(--mdim);font-weight:700;white-space:nowrap}
.mck-root .cr2 .tk{flex:1;height:7px;background:#1a2333;border-radius:4px;overflow:hidden}
.mck-root .cr2 .tk i{display:block;height:100%;background:linear-gradient(90deg,#0f8f4d,var(--mgreen));border-radius:4px}
.mck-root .cr2 .n{font-size:11px;font-weight:800;color:var(--mgreen);font-family:'IBM Plex Mono',monospace}
.mck-root .tc{display:flex;align-items:stretch;gap:10px;flex:1;min-width:0}
.mck-root .tc .tcleft{display:flex;flex-direction:column;justify-content:center;flex:none}
.mck-root .tc .big{font-size:34px;font-weight:800;letter-spacing:-.03em;color:var(--mtxt);line-height:1}
.mck-root .tc .tcchart{flex:1;min-width:0;position:relative;height:56px;align-self:center}
.mck-root .tcou{display:flex;justify-content:space-between;font-size:9px;letter-spacing:.11em;color:#c3d0e2;font-weight:800;margin-top:6px;padding:0 2px}
.mck-root .chg-mkr{position:absolute;width:6px;height:6px;border-radius:50%;background:#0a0f19;border:1.5px solid #25d97b;transform:translate(-50%,-50%);pointer-events:none;box-sizing:border-box}

.mck-root .tabs{display:flex;gap:3px;margin-left:auto}
.mck-root .tab{font-size:8px;font-weight:700;letter-spacing:.04em;padding:4px 7px;border-radius:5px;color:var(--mdim);cursor:pointer;border:1px solid transparent;background:none;font-family:inherit;white-space:nowrap}
.mck-root .tab:hover{color:#c3d0e2}
.mck-root .tab.on{background:#0f2740;border-color:#1d4a72;color:#5cb3ff}
.mck-root table{width:100%;border-collapse:collapse}
.mck-root th{font-size:9px;letter-spacing:.07em;color:var(--mdim2);font-weight:700;text-align:right;padding:4px 4px;border-bottom:1px solid var(--mline)}
.mck-root th:first-child{text-align:left}
.mck-root td{padding:5px 4px;border-bottom:1px solid var(--msoft);font-size:12px;text-align:right;color:#e7eef8;font-weight:500}
.mck-root tr:last-child td{border-bottom:0}
.mck-root td:first-child{text-align:left}
.mck-root .bk{display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:600;color:#c9d5e5}
.mck-root .bk i{width:14px;height:14px;border-radius:3px;display:grid;place-items:center;font-size:6px;font-weight:800;font-style:normal;color:#fff;flex:none}
.mck-root .fair{color:#b6c4d9;font-weight:600}
.mck-root .val{display:flex;flex-direction:column;align-items:flex-end;font-size:11px;font-weight:700;line-height:1.35}
.mck-root .up{color:var(--mgreen)}
.mck-root .dn{color:var(--mred)}
.mck-root .foot{display:flex;align-items:center;gap:5px;font-size:8px;color:var(--mdim2);padding-top:4px}
.mck-root .note8{font-size:8px;color:var(--mdim2);padding-top:4px;line-height:1.4}
.mck-root .note8 b{color:#8fa2bb}
.mck-root .legend{display:flex;gap:10px;font-size:8px;color:var(--mdim);font-weight:600;padding:0 9px 2px;flex:none}
.mck-root .legend span{display:flex;align-items:center;gap:4px}
.mck-root .key{width:9px;height:3px;border-radius:2px}
.mck-root .hv{margin-left:auto;font-size:10.5px;font-weight:700}

.mck-root .lu{display:grid;grid-template-columns:1fr 1fr;gap:6px;flex:1;min-height:0}
.mck-root .luc{border:1px solid var(--mline);border-radius:7px;padding:9px 10px;overflow:hidden;display:flex;flex-direction:column;position:relative}
.mck-root .luc .mascot-bg{position:absolute;right:-22px;top:-14px;width:130px;height:130px;transform:rotate(-14deg);pointer-events:none;z-index:0}
.mck-root .luc .mascot-crest{width:130px;height:130px}
.mck-root .luc h4{font-size:10px;font-weight:800;letter-spacing:.04em;margin-bottom:5px}
.mck-root .io{font-size:7.5px;font-weight:800;letter-spacing:.1em;margin:3px 0 1px}
.mck-root .io.i{color:var(--mgreen)}
.mck-root .io.o{color:var(--mred)}
.mck-root .pl{font-size:9.5px;color:#c3d0e2;display:flex;align-items:center;gap:4px;padding:1px 0;line-height:1.25}
.mck-root .pl b{color:var(--mgreen);font-weight:700}
.mck-root .pl.x b{color:var(--mred)}
.mck-root .pl .pos{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:8px;font-weight:700;color:#7b8ba3;background:rgba(255,255,255,.05);border:1px solid var(--msoft);border-radius:3px;padding:1px 4px;letter-spacing:.06em}
.mck-root .aiimp{margin-top:6px;background:var(--mpanel2);border:1px solid var(--mline);border-radius:7px;padding:7px 8px}
.mck-root .aiimp-hdr{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.mck-root .aiimp .ai-badge{display:inline-grid;place-items:center;width:14px;height:14px;border-radius:3px;background:#25d97b;color:#04140f;font-size:7px;font-weight:800}
.mck-root .aiimp-title{font-size:8.5px;font-weight:800;letter-spacing:.11em;color:#c3d0e2}
.mck-root .aiimp-body{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mck-root .aiimp-side{display:flex;flex-direction:column;gap:2px}
.mck-root .aiimp-team{font-size:9px;font-weight:800;letter-spacing:.08em}
.mck-root .aiimp-side p{font-size:9px;color:#a9b6c8;line-height:1.35;margin:0}
.mck-root .aiimp-adj{font-size:9px;font-weight:700;margin-top:2px}
.mck-root .wgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:5px}
.mck-root .wnote{display:flex;gap:6px;align-items:flex-start;background:var(--mpanel2);border:1px solid var(--mline);border-radius:7px;padding:5px 7px;flex:none}
.mck-root .wnote .ic{font-size:12px;line-height:1}
.mck-root .wnote .tt{font-size:8px;letter-spacing:.09em;font-weight:800;color:#9fb0c6}
.mck-root .wnote p{font-size:9px;color:var(--mdim);line-height:1.35}

/* AI Key Matchup Metrics */
.mck-root .mtxhdr{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:5px 4px 6px;border-bottom:1px solid var(--mline);font-size:9.5px;font-weight:800;letter-spacing:.06em;flex:none}
.mck-root .mtxhdr>span:first-child{text-align:left}
.mck-root .mtxhdr>span:nth-child(2){color:var(--mdim);text-align:center;padding:0 8px}
.mck-root .mtxhdr>span:last-child{text-align:right}
.mck-root .mtxbody{flex:1;display:flex;flex-direction:column;justify-content:space-around;padding:2px 0}
.mck-root .mtxrow{display:grid;grid-template-columns:1fr auto 12px 1fr;align-items:center;gap:8px;padding:3px 4px;font-size:10.5px}
.mck-root .mtxrow .mv{font-family:'IBM Plex Mono',monospace;font-weight:800;font-size:12px}
.mck-root .mtxrow .mv.r{text-align:right}
.mck-root .mtxrow .ml{font-size:10.5px;font-weight:600;color:#c3d0e2;text-align:center;white-space:nowrap}
.mck-root .mtxrow .marr{font-size:14px;font-weight:800;text-align:center;line-height:1}
/* Power Ranking */
.mck-root .pw{display:flex !important;flex-direction:row !important;align-items:center;justify-content:space-between;padding:4px 16px !important;border-top:1px solid var(--mline)}
.mck-root .pw .pwn{font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:900;letter-spacing:-.02em;line-height:1}
.mck-root .pw .pwx{font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#c3d0e2}

.mck-root .h2h{display:flex;border-radius:7px;overflow:hidden;flex:none;position:relative}
.mck-root .h2h .s{flex:1;display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:10px;letter-spacing:.06em;font-weight:800;color:#fff}
.mck-root .h2h .s.a{justify-content:flex-end}
.mck-root .h2h .s .n{font-size:13px;font-weight:800;font-family:'IBM Plex Mono',monospace;padding:3px 8px;border-radius:4px;color:#fff;line-height:1}
.mck-root .h2h-mid{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--mpanel);border:1px solid var(--mline);padding:3px 8px;border-radius:4px;font-size:8px;letter-spacing:.11em;color:#c3d0e2;font-weight:800;pointer-events:none;z-index:2}
.mck-root .chips{display:flex;gap:4px;justify-content:space-between;margin-top:7px}
.mck-root .chip{flex:1;aspect-ratio:1;max-width:24px;border-radius:5px;display:grid;place-items:center;font-size:10px;font-weight:800;font-family:'IBM Plex Mono',monospace;color:#fff}
.mck-root .fg{display:grid;grid-template-columns:1fr 1fr;gap:6px;flex:1;min-height:0}
.mck-root .fgc{background:var(--mpanel2);border:1px solid var(--mline);border-radius:7px;overflow:hidden;display:flex;flex-direction:column}
.mck-root .fgc .fghdr{display:flex;align-items:center;justify-content:space-between;padding:5px 9px;font-size:9.5px;letter-spacing:.02em}
.mck-root .fgc .fghdr-abbr{font-size:10px;font-weight:800;letter-spacing:.06em}
.mck-root .fgc .fghdr-lad{font-family:'IBM Plex Mono',monospace;font-size:8.5px;font-weight:700;color:#c3d0e2;letter-spacing:.04em}
.mck-root .fgc .row5{display:flex;gap:4px;padding:7px 9px 0}
.mck-root .fgc .row5 .f{width:22px;height:22px;border-radius:5px;font-size:11px}
.mck-root .fgc .fs{font-size:9px;color:var(--mdim2);letter-spacing:.08em;font-weight:700;padding:6px 9px 8px;display:flex;justify-content:space-between}
.mck-root .fgc .fs .mono{color:#c3d0e2;font-size:10px}

.mck-root .vf{display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid var(--msoft)}
.mck-root .vf:last-child{border-bottom:0}
.mck-root .vf .b{width:3px;align-self:stretch;border-radius:2px;background:var(--mgreen)}
.mck-root .vf .m{flex:1;min-width:0}
.mck-root .vf .m1{font-size:10px;font-weight:600;color:#d6e0ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mck-root .vf .m2{font-size:8.5px;color:var(--mdim2)}
.mck-root .vf .e{font-size:11px;font-weight:800;color:var(--mgreen)}

.mck-root .bottom{display:grid;grid-template-columns:1.15fr 1fr 1.15fr;align-items:center;border:1px solid var(--mline);border-radius:var(--mr);padding:7px 14px;flex:none}
.mck-root .bc{display:flex;align-items:center;gap:9px;justify-content:center}
.mck-root .bc:first-child{justify-content:flex-start}
.mck-root .bc:last-child{justify-content:flex-end}
.mck-root .bcap{font-size:7.5px;letter-spacing:.11em;color:var(--mdim);font-weight:700;white-space:nowrap}
.mck-root .bwin{font-size:14px;font-weight:800;letter-spacing:-.01em}
.mck-root .bsc{display:flex;align-items:center;gap:7px}
.mck-root .bsc .n{font-size:16px;font-weight:800}
.mck-root .bv{background:#0d2a1a;border:1px solid #1b6b3f;color:var(--mgreen);font-size:9.5px;font-weight:800;padding:3px 7px;border-radius:5px}
.mck-root .bbet{font-size:11px;font-weight:700;color:#d6e0ee;white-space:nowrap}

@media(max-width:1240px){ .mck-root .rm{grid-template-columns:1fr 1fr} .mck-root .rh{grid-template-columns:1fr} .mck-root .srch{width:104px} }

/* Tablet-ish + Phone (≤900px) — sidebar hidden, single column stack */
@media(max-width:900px){
  /* Root: column stack, no viewport-height traps */
  .mck-root{flex-direction:column;padding:6px;gap:6px;height:auto;min-height:auto;overflow-x:hidden;align-items:stretch}
  /* Sidebar completely hidden on phone (user request) */
  .mck-root .side{display:none !important}
  .mck-root main{width:100%;min-width:0;overflow:visible;display:flex;flex-direction:column;gap:6px}

  /* Every grid row collapses to one column */
  .mck-root .row,.mck-root .rh,.mck-root .r3g,.mck-root .rm,.mck-root .rmega{
    display:grid;grid-template-columns:1fr !important;gap:6px;
  }

  /* mcol stacks like a normal flex column; kill all flex:1 growth on phone
     so panels take their natural content height */
  .mck-root .mcol{display:flex;flex-direction:column;gap:6px;min-width:0}
  .mck-root .mcol>.p,
  .mck-root .mcol>#pOdds,
  .mck-root .mcol>#pNews,
  .mck-root .mcol>#pMove,
  .mck-root .mcol>#pMetrics,
  .mck-root .mcol-r>#pLineMv,
  .mck-root .mcol-r>#pTotMv{flex:none !important}

  /* Panel bodies use fixed but modest heights on phone — charts stay readable
     without pushing anything off screen */
  .mck-root #pMove .pb,
  .mck-root .mcol>#pMove .pb{height:240px !important;min-height:240px !important;flex:none !important}
  .mck-root #pLineMv .pb,
  .mck-root #pTotMv .pb{height:160px !important;min-height:160px !important;flex:none !important}

  /* Stacks used by other components stay column too */
  .mck-root .stk{flex-direction:column}

  /* Top bar wraps rather than overflowing */
  .mck-root .top{flex-wrap:wrap;gap:6px}
  .mck-root .top>div:first-child{flex:1;min-width:150px}
  .mck-root .ctl{margin-left:0;flex-wrap:wrap;width:100%}
  .mck-root .srch{width:100%;min-width:120px}
  .mck-root .srchw{flex:1}
  .mck-root .stripw{flex:none;height:98px}

  /* Hero: teams stack, meta between */
  .mck-root .hero{grid-template-columns:1fr}
  .mck-root .st,.mck-root .st.aw{flex-direction:column;text-align:center;gap:6px;padding:12px}
  .mck-root .st.aw{padding-top:0}
  .mck-root .st.aw .tf{justify-content:center}
  .mck-root .hmid{padding:10px 0;border-top:1px solid var(--msoft);border-bottom:1px solid var(--msoft)}

  /* Team News lineups: keep side-by-side on tablet, stack on phone (600px query) */
  .mck-root .lu{grid-template-columns:1fr 1fr}

  /* Bottom summary bar stacks */
  .mck-root .bottom{grid-template-columns:1fr;gap:10px}
  .mck-root .bc,.mck-root .bc:first-child,.mck-root .bc:last-child{justify-content:center;flex-wrap:wrap}
}

/* Phone */
@media(max-width:600px){
  .mck-root{padding:5px;gap:5px}
  .mck-root .top h1{font-size:12.5px}
  .mck-root .top .sb{font-size:6.5px}
  .mck-root select,.mck-root .srch,.mck-root .tg,.mck-root .livep,.mck-root .mockp{font-size:10px;padding:5px 7px}
  .mck-root .stripw{height:96px}
  .mck-root .gi{flex-basis:172px;padding:6px 7px}
  .mck-root .gi .ab{font-size:10px}
  .mck-root .hero{padding:0}
  .mck-root .crest{width:56px;height:56px}
  .mck-root .tn{font-size:18px;word-break:break-word;overflow-wrap:anywhere}
  .mck-root .tmeta{font-size:9.5px}
  /* AI Key Matchup Metrics label needs room to wrap on narrow phones
     because 'Penalties Conceded' and 'Completion Rate' are long. */
  .mck-root .mtxrow{grid-template-columns:1fr auto 14px 1fr;gap:6px;padding:3px 2px}
  .mck-root .mtxrow .ml{font-size:9.5px;white-space:normal;line-height:1.2}
  .mck-root .mtxrow .mv{font-size:11px}
  .mck-root .pw .pwn{font-size:26px}
  .mck-root .pw .pwx{font-size:9px}
  /* Mascot overlay tames itself on phones so it doesn't dominate the card */
  .mck-root .luc .mascot-bg{width:100px;height:100px;right:-14px;top:-8px;opacity:.11}
  .mck-root .luc .mascot-crest{width:100px;height:100px}
  .mck-root .pred{padding:9px 10px}
  .mck-root .pred .tm2{font-size:15px}
  .mck-root .score .n{font-size:22px}
  .mck-root .wp .pc,.mck-root .lc .v,.mck-root .tc .big{font-size:17px}
  .mck-root table{font-size:10px}
  .mck-root th{font-size:6.5px}
  .mck-root td{padding:5px 3px}
  .mck-root .bk{font-size:9px;gap:4px}
  .mck-root .bk i{width:13px;height:13px;font-size:5.5px}
  .mck-root .val{font-size:8.5px}
  .mck-root .luc{padding:8px}
  .mck-root .luc h4{font-size:9.5px}
  .mck-root .pl{font-size:10px}
  .mck-root .lu{grid-template-columns:1fr;gap:8px}
  .mck-root .aiimp-body{grid-template-columns:1fr;gap:8px}
  .mck-root .wgrid{grid-template-columns:1fr;gap:6px}
  .mck-root .h2h .s{padding:7px 10px;font-size:9.5px}
  .mck-root .h2h .s .n{font-size:12px;padding:3px 7px}
  .mck-root .chip{max-width:22px;font-size:9.5px}
  .mck-root .fgc .row5 .f{width:20px;height:20px;font-size:10px}
  .mck-root .bwin{font-size:13px}
  .mck-root .bsc .n{font-size:15px}
  .mck-root .bbet{white-space:normal;font-size:10.5px;text-align:center}
}

/* Very narrow phones */
@media(max-width:400px){
  .mck-root .top h1{font-size:11.5px}
  .mck-root select{padding:5px 6px}
  .mck-root .srch{padding-left:20px}
  .mck-root .ctl{gap:4px}
  .mck-root .stripw{height:94px}
  .mck-root .gi{flex-basis:158px}
  .mck-root .crest{width:50px;height:50px}
  .mck-root .tn{font-size:16px}
  .mck-root .chip{max-width:18px;font-size:8.5px}
}
`

// ───────────────────────────────────────────────────────────────────────────
// Small building blocks
// ───────────────────────────────────────────────────────────────────────────
// Wikipedia Commons Special:FilePath — redirects to the current file location
// so the URL stays stable even when the underlying file is re-uploaded.
// Filenames verified 200 OK against en.wikipedia.org before being added.
const WP = (filename: string) =>
  `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(filename).replace(/%20/g, '_')}`

const TEAM_LOGOS: Record<string, string> = {
  // NRL — all 17 confirmed
  'Brisbane Broncos':               WP('Brisbane Broncos Logo 2026.svg'),
  'Canberra Raiders':               WP('Canberra Raiders Logo.svg'),
  'Canterbury Bulldogs':            WP('Bulldogs 1935 Logo.svg'),
  'Cronulla Sutherland Sharks':     WP('Cronulla-Sutherland Sharks logo.svg'),
  'Cronulla Sharks':                WP('Cronulla-Sutherland Sharks logo.svg'),
  'Dolphins':                       WP('Dolphins (NRL) Logo.svg'),
  'Gold Coast Titans':              WP('Gold Coast Titans logo.svg'),
  'Manly Warringah Sea Eagles':     WP('Manly-Warringah Sea Eagles logo.svg'),
  'Manly Sea Eagles':               WP('Manly-Warringah Sea Eagles logo.svg'),
  'Melbourne Storm':                WP('MelbourneStorm2018logo.svg'),
  'New Zealand Warriors':           WP('Warriors (NRL) Logo.svg'),
  'Newcastle Knights':              WP('Newcastle Knights logo.svg'),
  'North Queensland Cowboys':       WP('North Queensland Cowboys logo.svg'),
  'Parramatta Eels':                WP('Parramatta Eels logo.svg'),
  'Penrith Panthers':               WP('Penrith_Panthers_logo.svg'),
  'South Sydney Rabbitohs':         WP('South Sydney Rabbitohs Logo.svg'),
  'St George Illawarra Dragons':    WP('St._George_Illawarra_Dragons_logo.svg'),
  'Sydney Roosters':                WP('Sydney_Roosters_logo.svg'),
  'Wests Tigers':                   WP('Wests Tigers 2022 Logo.svg'),

  // AFL — 17 of 18 confirmed (North Melbourne falls back to shield)
  'Adelaide Crows':                 WP('Adelaide Crows Logo 2024.svg'),
  'Brisbane Lions':                 WP('Brisbane Lions logo 2010.svg'),
  'Carlton Blues':                  WP('Carlton FC Logo 2020.svg'),
  'Collingwood Magpies':            WP('Collingwood Football Club Logo (2017–present).svg'),
  'Essendon Bombers':               WP('Essendon_FC_logo.svg'),
  'Fremantle Dockers':              WP('Fremantle_FC_logo.svg'),
  'Geelong Cats':                   WP('Geelong_Cats_logo.svg'),
  'Gold Coast Suns':                WP('Gold_Coast_Suns_logo_(introduced_late_2024).svg'),
  'Greater Western Sydney Giants':  WP('GWS_Giants_logo.svg'),
  'GWS Giants':                     WP('GWS_Giants_logo.svg'),
  'Hawthorn Hawks':                 WP('Hawthorn-football-club-brand.svg'),
  'Melbourne Demons':               WP('Melbournefc.svg'),
  'Port Adelaide Power':            WP('Port_Adelaide_Football_Club_logo.svg'),
  'Richmond Tigers':                WP('Richmond_Tigers_logo.svg'),
  'St Kilda Saints':                WP('St Kilda FC logo.svg'),
  'Sydney Swans':                   WP('Sydney_Swans_Logo_2020.svg'),
  'West Coast Eagles':              WP('West_Coast_Eagles_logo_2017.svg'),
  'Western Bulldogs':               WP('Western Bulldogs logo.svg'),
  // North Melbourne Kangaroos — no reliable SVG on Wikipedia, shield fallback
}

function logoUrlFor(teamName?: string): string | null {
  if (!teamName) return null
  return TEAM_LOGOS[teamName] ?? null
}

function Crest({ primary, secondary, abbr, teamName, className = 'crest' }: {
  primary: string; secondary: string; abbr: string;
  teamName?: string; className?: string
}) {
  const p = safeCol(primary, '#4da6ff')
  const s = safeCol(secondary, darken(p, 0.6))
  const [imgFailed, setImgFailed] = useState(false)
  const logoUrl = logoUrlFor(teamName)

  if (logoUrl && !imgFailed) {
    return (
      <div className={className} style={{
        display: 'grid', placeItems: 'center', overflow: 'hidden',
      }}>
        <img
          src={logoUrl}
          alt={teamName ?? abbr}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    )
  }

  return (
    <svg className={className} viewBox="0 0 100 100" fill="none">
      <path d="M50 6 L88 20 V52 C88 74 70 88 50 95 C30 88 12 74 12 52 V20 Z"
            fill={s} stroke={p} strokeWidth={4} />
      <text x="50" y="63" textAnchor="middle" fontFamily="Inter" fontSize={31} fontWeight={800} fill={p}>
        {(abbr || '?').charAt(0)}
      </text>
    </svg>
  )
}

function WxIcon({ kind }: { kind: string }) {
  const stroke = '#7b8ba3'
  const path =
    kind === 'rain' ? <><path d="M7 15a4 4 0 0 1 .4-8 5.5 5.5 0 0 1 10.4 1.6A3.4 3.4 0 0 1 17.5 15z" fill="#131b2a"/><path d="M8.5 18.5l-1 2.5M12 18.5l-1 2.5M15.5 18.5l-1 2.5" stroke="#4da6ff"/></>
    : kind === 'wind' ? <path d="M3 8h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 18h9" />
    : kind === 'cloud' ? <path d="M7 17a4.5 4.5 0 0 1 .4-9 5.5 5.5 0 0 1 10.4 1.6A3.6 3.6 0 0 1 17.5 17z" fill="#131b2a"/>
    : <><circle cx={12} cy={12} r={4.5} fill="#131b2a" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" /></>
  return <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.4}>{path}</svg>
}

function weatherIconKind(w: EventDetail['weather']): string {
  if (!w) return 'clear'
  if (w.rain_prob >= 0.3 || (w.condition || '').toLowerCase().includes('rain')) return 'rain'
  if ((w.wind_kmh ?? 0) >= 20) return 'wind'
  if ((w.condition || '').toLowerCase().includes('cloud')) return 'cloud'
  return 'clear'
}

// ───────────────────────────────────────────────────────────────────────────
// Sidebar
// ───────────────────────────────────────────────────────────────────────────
function Sidebar({ onNavigate, roundConf }: {
  onNavigate: (s: string) => void; roundConf: number
}) {
  const label = roundConf >= 82 ? 'HIGH' : roundConf >= 65 ? 'MEDIUM' : 'LOW'
  const dash = (roundConf / 100) * 251
  const NAV: Array<[string, string, string, string]> = [
    ['strip',   'Dashboard',       'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', 'active'],
    ['pOdds',   'Match Centre',    'M12 2v20M2 12h20', 'active'],
    ['pMove',   'AI Predictions',  'M12 3l3 6 6 1-4.5 4.5 1 6L12 17l-5.5 3.5 1-6L3 10l6-1 3-6z', 'active'],
    ['pMove',   'Line Movement',   'M4 18 L10 11 L14 15 L20 6 M20 11V6h-5', 'active'],
    ['dummy',   'Stats Centre',    'M5 20V10M10 20V4M15 20v-8M20 20v-5', 'soon'],
    ['dummy',   'H2H Analysis',    'M8 12h8M8 8l-4 4 4 4M16 8l4 4-4 4', 'soon'],
    ['pNews',   'Team News',       'M4 6h16M4 12h16M4 18h10', 'active'],
    ['dummy',   'Injuries',        'M12 2v20M2 12h20M6 6l12 12M18 6L6 18', 'soon'],
    ['dummy',   'Power Rankings',  'M12 3l-8 11h6l-2 7 8-11h-6l2-7z', 'soon'],
    ['dummy',   'My Bets',         'M3 4h18v16H3zM3 10h18M7 15h4', 'soon'],
    ['dummy',   'Alerts',          'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9z', 'soon'],
    ['dummy',   'Settings',        'M12 8v8M8 12h8', 'soon'],
  ]
  return (
    <aside className="side">
      <div className="brand">
        <svg width={22} height={22} viewBox="0 0 32 32" fill="none">
          <path d="M16 3 L29 27 H22 L16 14 L10 27 H3 Z" fill="#e7eef8" />
          <path d="M16 3 L29 27 H22 Z" fill="#4da6ff" />
        </svg>
      </div>
      <nav className="nav">
        {NAV.map(([id, label, d, kind], i) => (
          <a
            key={label}
            className={
              (i === 0 ? 'on ' : '') +
              (kind === 'soon' ? 'soon' : '')
            }
            onClick={() => kind === 'active' && onNavigate(id)}
          >
            <svg viewBox="0 0 24 24"><path d={d} /></svg>{label}
          </a>
        ))}
      </nav>
      <div className="cc">
        <div className="l">ROUND CONFIDENCE</div>
        <svg width={62} height={62} viewBox="0 0 100 100" style={{ margin: '2px auto -2px', display: 'block' }}>
          <circle cx={50} cy={50} r={40} stroke="#1a2333" strokeWidth={9} fill="none" />
          <circle cx={50} cy={50} r={40} stroke="#25d97b" strokeWidth={9} fill="none" strokeLinecap="round"
                  strokeDasharray={`${dash.toFixed(0)} 251`} transform="rotate(-90 50 50)" />
          <text x={50} y={58} textAnchor="middle" fontFamily="Inter" fontSize={26} fontWeight={800} fill="#e7eef8">{roundConf}%</text>
        </svg>
        <div className="vh" style={{ color: roundConf >= 82 ? '#25d97b' : '#f5a524' }}>{label}</div>
        <div className="s">Avg across<br />live fixtures</div>
      </div>
    </aside>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Top bar
// ───────────────────────────────────────────────────────────────────────────
function TopBar({ sport, matches, selectedId, onSelect }: {
  sport: string;
  matches: DashboardEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="top">
      <div>
        <h1>{sport} AI MATCH CENTRE</h1>
        <div className="sb">AI POWERED PREDICTIONS &amp; ANALYTICS</div>
      </div>
      <div className="ctl">
        <div className="round-picker">
          <select value={selectedId ?? ''} onChange={e => onSelect(e.target.value)}>
            {matches.length === 0 && <option value="">— No matches —</option>}
            {matches.map(m => {
              const dt = fmtDayTime(m.commence_time)
              return (
                <option key={m.id} value={m.id}>
                  {m.home_abbr} vs {m.away_abbr} · {dt.day} {dt.time}
                </option>
              )
            })}
          </select>
          <span className="rp-cal">📅</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7b8ba3', whiteSpace: 'nowrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#25d97b' }} />
          Last Updated: <b style={{ color: '#c3d0e2', fontWeight: 600 }}>2 mins ago</b>
        </div>
        <div className="livep"><span className="dot"></span>LIVE</div>
        <button className="sharebtn" type="button">↑ SHARE</button>
        <button className="bellbtn" type="button">🔔</button>
        <div className="mockp">MOCKUP</div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Fixtures strip
// ───────────────────────────────────────────────────────────────────────────
function FixturesStrip({ events, selectedId, onSelect, filter }: {
  events: DashboardEvent[]; selectedId: string | null;
  onSelect: (id: string) => void;
  filter: { search: string; valueOnly: boolean; sort: string; sport: string };
}) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const filtered = useMemo(() => {
    let list = events.slice()
    // Only show fixtures where BOTH teams are real, named, and have a real logo
    // in the TEAM_LOGOS map. Filters out TBD-placeholder fixtures (finals
    // brackets) and clubs we don't have a logo file for (e.g. North Melbourne).
    list = list.filter(e =>
      e.home_team && e.away_team &&
      e.home_team.toUpperCase() !== 'TBD' && e.away_team.toUpperCase() !== 'TBD' &&
      TEAM_LOGOS[e.home_team] && TEAM_LOGOS[e.away_team]
    )
    if (filter.sport && filter.sport !== 'ALL') list = list.filter(e => (e.sport_title || '').toUpperCase() === filter.sport)
    const q = filter.search.trim().toLowerCase()
    if (q) list = list.filter(e =>
      (e.home_team + ' ' + e.away_team + ' ' + (e.home_abbr || '') + ' ' + (e.away_abbr || '')).toLowerCase().includes(q))
    if (filter.valueOnly) list = list.filter(e => (e.best_edge_pct ?? 0) >= 2)
    if (filter.sort === 'edge') list.sort((a, b) => (b.best_edge_pct ?? 0) - (a.best_edge_pct ?? 0))
    else if (filter.sort === 'conf') list.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    else list.sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
    return list
  }, [events, filter])

  const scroll = (delta: number) => { if (stripRef.current) stripRef.current.scrollLeft += delta }

  return (
    <div className="stripw">
      <div className="arw l" onClick={() => scroll(-420)}>
        <svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 2L4 6l4 4" /></svg>
      </div>
      <div className="arw r" onClick={() => scroll(420)}>
        <svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 2l4 4-4 4" /></svg>
      </div>
      <div className="strip" ref={stripRef}>
        {filtered.length === 0 && (
          <div className="empty">No fixtures match</div>
        )}
        {filtered.map(e => {
          const { day, time } = fmtDayTime(e.commence_time)
          const edge = e.best_edge_pct ?? 0
          const hasV = edge >= 2
          return (
            <div key={e.id} className={'gi' + (selectedId === e.id ? ' on' : '')} onClick={() => onSelect(e.id)}>
              <div className="r1">
                <span className="lg">{e.sport_title || 'SPT'}</span>
                <span className="tm">{day} {time}</span>
                <span className={'ed' + (hasV ? '' : ' no')}>{hasV ? `+${edge.toFixed(1)}%` : '—'}</span>
              </div>
              <div className="r2">
                <div className="sd">
                  <Crest primary={e.home_color} secondary={e.home_secondary_color} abbr={e.home_abbr} teamName={e.home_team} className="cr" />
                  <span className="ab">{e.home_abbr}</span>
                </div>
                <span className="vs">VS</span>
                <div className="sd r">
                  <Crest primary={e.away_color} secondary={e.away_secondary_color} abbr={e.away_abbr} teamName={e.away_team} className="cr" />
                  <span className="ab">{e.away_abbr}</span>
                </div>
              </div>
              <div className="r3">
                <span>Line <b>{e.projected_margin != null ? sgn(e.projected_margin) : '–'}</b></span>
                <span className="sp">Total <b>{e.projected_total != null ? e.projected_total.toFixed(1) : '–'}</b></span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Hero + Prediction
// ───────────────────────────────────────────────────────────────────────────
function Hero({ md }: { md: EventDetail }) {
  const { home, away } = md.event
  const hp = safeCol(home.primary_color, '#4da6ff')
  const ap = safeCol(away.primary_color, '#8b5cf6')
  const hd = darken(hp, 0.7)
  const ad = darken(ap, 0.7)
  const hn = splitName(home.name), an = splitName(away.name)
  const { day, time } = fmtDayTime(md.event.commence_time)
  const wk = weatherIconKind(md.weather)

  return (
    <div className="hero" style={{
      background:
        `radial-gradient(140% 170% at -5% 50%, ${hp}66 0%, ${hd} 22%, #100815 52%, transparent 72%),` +
        `radial-gradient(140% 170% at 105% 50%, ${ap}66 0%, ${ad} 22%, #0f0a1e 52%, transparent 72%), #0a0f19`,
    }}>
      <div className="st">
        <Crest primary={hp} secondary={hd} abbr={home.abbr} teamName={home.name} />
        <div>
          <div className="city">{hn.city}</div>
          <div className="tn">{hn.short.toUpperCase()}</div>
          <div className="tmeta" style={{ color: safeCol(home.primary_color, '#4da6ff'), fontWeight: 800 }}>{fakeLadder(home.abbr)}</div>
          <div className="tmeta mono" style={{ fontSize: 11, marginTop: 2 }}>{fakeRecord(home.abbr)}</div>
        </div>
      </div>
      <div className="hmid">
        <div className="vn">{venueFor(md.event.sport, home.name)}</div>
        <div className="wh">{day} · {time}</div>
        {md.weather && !md.weather.is_indoor && (
          <>
            <div style={{ marginTop: 2 }}><WxIcon kind={wk} /></div>
            <div className="tmp mono">{Math.round(md.weather.temp_c)}°</div>
            <div className="wd">{md.weather.condition}<br />Wind {Math.round(md.weather.wind_kmh)}km/h</div>
          </>
        )}
        {md.weather?.is_indoor && <div className="wd" style={{ marginTop: 6 }}>Indoor venue</div>}
        {!md.weather && <div className="wd" style={{ marginTop: 6 }}>Weather pending</div>}
      </div>
      <div className="st aw">
        <Crest primary={ap} secondary={ad} abbr={away.abbr} teamName={away.name} />
        <div>
          <div className="city">{an.city}</div>
          <div className="tn">{an.short.toUpperCase()}</div>
          <div className="tmeta" style={{ color: safeCol(away.primary_color, '#8b5cf6'), fontWeight: 800 }}>{fakeLadder(away.abbr)}</div>
          <div className="tmeta mono" style={{ fontSize: 11, marginTop: 2 }}>{fakeRecord(away.abbr)}</div>
        </div>
      </div>
    </div>
  )
}

function Prediction({ md }: { md: EventDetail }) {
  const m = md.model
  if (!m) return <div className="p pred">No model output</div>
  const homeIsFav = m.home_win_prob > m.away_win_prob
  const fav = homeIsFav ? md.event.home : md.event.away
  const favCol = safeCol(fav.primary_color, homeIsFav ? '#4da6ff' : '#8b5cf6')
  const favShort = splitName(fav.name).short
  const conf = Math.round((m.confidence ?? 0) * 100)
  const score = projectedScore(m.projected_margin, m.projected_total)
  const dash = (conf / 100) * 251
  return (
    <div className="p pred">
      <div className="pr1">
        <div className="pt">AI Prediction</div>
        <span className="tag">{md.event.status === 'live' ? 'LIVE' : 'PRE GAME'}</span>
      </div>
      <div className="lay">
        <div>
          <div className="tm2" style={{ color: favCol }}>{favShort}</div>
          <div className="to">TO WIN</div>
        </div>
        <div>
          <div className="cap">CONFIDENCE</div>
          <svg width={54} height={54} viewBox="0 0 100 100">
            <circle cx={50} cy={50} r={40} stroke="#1a2333" strokeWidth={11} fill="none" />
            <circle cx={50} cy={50} r={40} stroke="#25d97b" strokeWidth={11} fill="none" strokeLinecap="round"
                    strokeDasharray={`${dash.toFixed(0)} 251`} transform="rotate(-90 50 50)" />
            <text x={50} y={59} textAnchor="middle" fontFamily="Inter" fontSize={27} fontWeight={800} fill="#e7eef8">{conf}%</text>
          </svg>
        </div>
      </div>
      {score && (
        <>
          <hr />
          <div className="ps">AI PROJECTED SCORE</div>
          <div className="score mono">
            <span className="n" style={{ color: safeCol(md.event.home.primary_color, '#4da6ff') }}>{score.home}</span>
            <span style={{ color: '#55647a', fontSize: 15 }}>–</span>
            <span className="n" style={{ color: safeCol(md.event.away.primary_color, '#8b5cf6') }}>{score.away}</span>
          </div>
          <div className="by">{favShort} by {Math.abs(score.home - score.away)}</div>
        </>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Three metric cards
// ───────────────────────────────────────────────────────────────────────────
function ThreeMetrics({ md }: { md: EventDetail }) {
  const m = md.model
  if (!m) return null
  const { home, away } = md.event
  const hp = safeCol(home.primary_color, '#4da6ff'), ap = safeCol(away.primary_color, '#8b5cf6')
  const pH = Math.round(m.home_win_prob * 100), pA = 100 - pH
  const mu = m.projected_margin ?? 0
  const tot = m.projected_total
  const confPct = Math.round((m.confidence ?? 0) * 100)
  const lineConf = Math.max(30, confPct - 4)
  const totConf = Math.max(30, confPct - 8)

  const totalLines = (md.markets?.totals ?? [])
    .filter(r => r.outcome.toLowerCase() === 'over' && r.point != null)
    .map(r => r.point as number)
  const avgLine = totalLines.length ? totalLines.reduce((s, v) => s + v, 0) / totalLines.length : null

  return (
    <div className="row r3g">
      {/* Win Probability */}
      <div className="p">
        <div className="ph"><span className="pt">AI Win Probability</span><span className="q">?</span></div>
        <div className="pb">
          <div className="wp">
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div className="pc mono" style={{ color: hp }}>{pH}%</div>
              <div className="nm">{home.abbr}</div>
            </div>
            <svg width={62} height={62} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
              <circle cx={50} cy={50} r={38} stroke={hp} strokeWidth={13} fill="none" opacity={0.7} />
              <circle cx={50} cy={50} r={38} stroke={ap} strokeWidth={13} fill="none" strokeLinecap="round"
                      strokeDasharray={`${(pA * 2.388).toFixed(0)} 239`} transform="rotate(-90 50 50)" />
              <text x={50} y={58} textAnchor="middle" fontFamily="Inter" fontSize={22} fontWeight={800} fill="#e7eef8">{pA}%</text>
            </svg>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div className="pc mono" style={{ color: ap }}>{pA}%</div>
              <div className="nm">{away.abbr}</div>
            </div>
          </div>
          <div className="bar">
            <i style={{ width: `${pH}%`, background: hp }} />
            <i style={{ width: `${pA}%`, background: ap }} />
          </div>
        </div>
      </div>

      {/* AI Line */}
      <div className="p">
        <div className="ph"><span className="pt">AI Line</span><span className="q">?</span></div>
        <div className="pb">
          <div className="lc">
            <Crest primary={hp} secondary={darken(hp)} abbr={home.abbr} teamName={home.name} className="mc" />
            <div className="v mono" style={{ color: hp }}>{sgn(mu)}</div>
            <div className="lb">AI LINE</div>
            <div className="v mono" style={{ color: ap }}>{sgn(-mu)}</div>
            <Crest primary={ap} secondary={darken(ap)} abbr={away.abbr} teamName={away.name} className="mc" />
          </div>
          <div className="cr2">
            <span className="l">LINE CONF</span>
            <span className="tk"><i style={{ width: `${lineConf}%` }} /></span>
            <span className="n mono">{lineConf}%</span>
          </div>
        </div>
      </div>

      {/* AI Total Points */}
      <div className="p">
        <div className="ph">
          <span className="pt">AI Total Points</span>
          <span className="q">?</span>
        </div>
        <div className="pb">
          <div className="tc">
            <div className="tcleft">
              <div className="big mono">{tot != null ? tot.toFixed(1) : '–'}</div>
              {avgLine != null && (
                <div style={{ fontSize: 8.5, letterSpacing: '.08em', color: '#7b8ba3', fontWeight: 700, marginTop: 4 }}>
                  LINE {avgLine.toFixed(1)}
                </div>
              )}
            </div>
            <div className="tcchart">
              {(() => {
                const base = tot ?? 40
                const pts = Array.from({ length: 15 }, (_, i) => {
                  const t = i / 14
                  return base - 2.5 + (1 - Math.pow(1 - t, 1.6)) * 2.5 + Math.sin(i * 1.6) * 0.5
                })
                const min = Math.min(...pts) - 0.6, max = Math.max(...pts) + 0.6
                const xPct = (i: number) => i / (pts.length - 1) * 100
                const yPct = (v: number) => (1 - (v - min) / (max - min || 1)) * 100
                const linePoints = pts.map((v, i) => `${xPct(i).toFixed(2)},${yPct(v).toFixed(2)}`).join(' ')
                const areaPoints = `0,100 ${linePoints} 100,100`
                return <>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    <defs>
                      <linearGradient id="mck-gt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#25d97b" stopOpacity=".45" />
                        <stop offset="100%" stopColor="#25d97b" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polygon points={areaPoints} fill="url(#mck-gt)" />
                    <polyline points={linePoints} fill="none" stroke="#25d97b" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
                  </svg>
                  {pts.map((v, i) => (
                    <span key={i} className="chg-mkr" style={{ left: `${xPct(i)}%`, top: `${yPct(v)}%` }} />
                  ))}
                </>
              })()}
            </div>
          </div>
          <div className="tcou"><span>OVER</span><span>UNDER</span></div>
          <div className="cr2">
            <span className="l">TOTAL CONF</span>
            <span className="tk"><i style={{ width: `${totConf}%` }} /></span>
            <span className="n mono">{totConf}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Odds Comparison
// ───────────────────────────────────────────────────────────────────────────
const BOOK_ICON: Record<string, { c: string; t: string; a: string }> = {
  betfair:      { c: '#f5b74e', t: '#1a1200', a: 'BF' },
  betfair_ex_au:{ c: '#f5b74e', t: '#1a1200', a: 'BF' },
  tab:          { c: '#1e9e4a', t: '#fff', a: 'TAB' },
  sportsbet:    { c: '#1f5fd0', t: '#fff', a: 'S' },
  tabtouch:     { c: '#c8324f', t: '#fff', a: 'TT' },
  ladbrokes:    { c: '#d1451f', t: '#fff', a: 'L' },
  pointsbet:    { c: '#6c3fd6', t: '#fff', a: 'PB' },
  pointsbet_au: { c: '#6c3fd6', t: '#fff', a: 'PB' },
}
function iconFor(name: string): { c: string; t: string; a: string } {
  const k = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return BOOK_ICON[k] ?? { c: '#3b4a63', t: '#fff', a: (name || '?').slice(0, 2).toUpperCase() }
}

function OddsComparison({ md }: { md: EventDetail }) {
  const [tab, setTab] = useState<'h2h' | 'line' | 'tot'>('h2h')
  const { home, away } = md.event
  const bkList = useMemo(() => {
    const all = new Set<string>([
      ...(md.markets?.h2h ?? []).map(r => r.bookmaker),
      ...(md.markets?.spreads ?? []).map(r => r.bookmaker),
      ...(md.markets?.totals ?? []).map(r => r.bookmaker),
    ])
    return Array.from(all).slice(0, 4)
  }, [md])
  return (
    <div className="p" id="pOdds">
      <div className="ph">
        <span className="pt">Odds Comparison</span>
        <div className="tabs">
          <button className={'tab' + (tab === 'h2h' ? ' on' : '')} onClick={() => setTab('h2h')}>HEAD TO HEAD</button>
          <button className={'tab' + (tab === 'line' ? ' on' : '')} onClick={() => setTab('line')}>LINE</button>
          <button className={'tab' + (tab === 'tot' ? ' on' : '')} onClick={() => setTab('tot')}>TOTAL POINTS</button>
        </div>
      </div>
      <div className="pb">
        {tab === 'h2h' && <H2HTable md={md} bkList={bkList} home={home} away={away} />}
        {tab === 'line' && <LineTable md={md} bkList={bkList} home={home} away={away} />}
        {tab === 'tot' && <TotalTable md={md} bkList={bkList} />}
      </div>
    </div>
  )
}
function H2HTable({ md, bkList, home, away }: { md: EventDetail; bkList: string[]; home: EventDetail['event']['home']; away: EventDetail['event']['away'] }) {
  const rows = md.markets?.h2h ?? []
  const fH = md.model?.fair_home_price, fA = md.model?.fair_away_price
  return <>
    <div className="tblwrap">
    <table className="mono">
      <thead><tr><th>BOOKMAKER</th><th>{home.abbr}</th><th>{away.abbr}</th><th>AI FAIR</th><th>VALUE</th></tr></thead>
      <tbody>
        {bkList.map(bk => {
          const h = rows.find(r => r.bookmaker === bk && r.outcome === home.name)
          const a = rows.find(r => r.bookmaker === bk && r.outcome === away.name)
          const ic = iconFor(bk)
          return (
            <tr key={bk}>
              <td><span className="bk"><i style={{ background: ic.c, color: ic.t }}>{ic.a}</i>{bk}</span></td>
              <td>{h?.price.toFixed(2) ?? '–'}</td>
              <td>{a?.price.toFixed(2) ?? '–'}</td>
              <td className="fair">{fH?.toFixed(2) ?? '–'} / {fA?.toFixed(2) ?? '–'}</td>
              <td>
                <span className="val">
                  <span className={(h?.edge_pct ?? 0) >= 0 ? 'up' : 'dn'}>
                    {(h?.edge_pct ?? 0) >= 0 ? '▲ ' : '▼ '}{Math.abs(h?.edge_pct ?? 0).toFixed(1)}%
                  </span>
                  <span className={(a?.edge_pct ?? 0) >= 0 ? 'up' : 'dn'}>
                    {(a?.edge_pct ?? 0) >= 0 ? '▲ ' : '▼ '}{Math.abs(a?.edge_pct ?? 0).toFixed(1)}%
                  </span>
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
    <div className="foot"><span className="dot"></span>Prices update every 30 seconds</div>
  </>
}
function LineTable({ md, bkList, home, away }: { md: EventDetail; bkList: string[]; home: EventDetail['event']['home']; away: EventDetail['event']['away'] }) {
  const rows = md.markets?.spreads ?? []
  return <>
    <div className="tblwrap">
    <table className="mono">
      <thead><tr><th>BOOKMAKER</th><th>LINE</th><th>PRICE</th><th>AI FAIR</th><th>VALUE</th></tr></thead>
      <tbody>
        {bkList.map(bk => {
          const h = rows.find(r => r.bookmaker === bk && r.outcome === home.name)
          const a = rows.find(r => r.bookmaker === bk && r.outcome === away.name)
          // Show the favourite side (negative point)
          const fav = (h && h.point != null && h.point < 0) ? { r: h, side: home.abbr } : (a && a.point != null && a.point < 0) ? { r: a, side: away.abbr } : (h ? { r: h, side: home.abbr } : a ? { r: a, side: away.abbr } : null)
          const ic = iconFor(bk)
          if (!fav) return null
          const e = fav.r?.edge_pct ?? 0
          return (
            <tr key={bk}>
              <td><span className="bk"><i style={{ background: ic.c, color: ic.t }}>{ic.a}</i>{bk}</span></td>
              <td>{fav.r.point != null ? sgn(fav.r.point) : '–'}</td>
              <td>{fav.r.price.toFixed(2)}</td>
              <td className="fair">{fav.r.fair_price?.toFixed(3) ?? '–'}</td>
              <td><span className={e >= 0 ? 'up' : 'dn'}>{e >= 0 ? '▲ ' : '▼ '}{Math.abs(e).toFixed(2)}%</span></td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
    <div className="note8">Every book priced <b>at its own line</b> — never averaged.</div>
  </>
}
function TotalTable({ md, bkList }: { md: EventDetail; bkList: string[] }) {
  const rows = md.markets?.totals ?? []
  return <>
    <div className="tblwrap">
    <table className="mono">
      <thead><tr><th>BOOKMAKER</th><th>TOTAL</th><th>OVER</th><th>UNDER</th><th>VALUE</th></tr></thead>
      <tbody>
        {bkList.map(bk => {
          const o = rows.find(r => r.bookmaker === bk && r.outcome.toLowerCase() === 'over')
          const u = rows.find(r => r.bookmaker === bk && r.outcome.toLowerCase() === 'under')
          const ic = iconFor(bk)
          if (!o && !u) return null
          const e = o?.edge_pct ?? 0
          return (
            <tr key={bk}>
              <td><span className="bk"><i style={{ background: ic.c, color: ic.t }}>{ic.a}</i>{bk}</span></td>
              <td>{(o?.point ?? u?.point ?? 0).toFixed(1)}</td>
              <td>{o?.price?.toFixed(2) ?? '–'}</td>
              <td>{u?.price?.toFixed(2) ?? '–'}</td>
              <td><span className={e >= 0 ? 'up' : 'dn'}>{e >= 0 ? '▲ ' : '▼ '}{Math.abs(e).toFixed(1)}%</span></td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
    <div className="note8">Same rule on totals — <b>each line priced separately</b>.</div>
  </>
}

// ───────────────────────────────────────────────────────────────────────────
// Movement charts
// ───────────────────────────────────────────────────────────────────────────
function seriesTo(end: number, start: number, n: number, amp: number): number[] {
  const pts: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    let v = start + (end - start) * (1 - Math.pow(1 - t, 1.7))
    v += Math.sin(i * 1.9) * amp * (1 - t)
    pts.push(v)
  }
  pts[n - 1] = end
  return pts
}
function poly(vals: number[], x0: number, x1: number, y0: number, y1: number, vmin: number, vmax: number): string {
  return vals.map((v, i) => {
    const x = x0 + (x1 - x0) * i / (vals.length - 1)
    const y = y1 - (v - vmin) / (vmax - vmin || 1) * (y1 - y0)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}
function dotList(vals: number[], x0: number, x1: number, y0: number, y1: number, vmin: number, vmax: number, col: string) {
  return vals.slice(0, -1).map((v, i) => {
    const x = x0 + (x1 - x0) * i / (vals.length - 1)
    const y = y1 - (v - vmin) / (vmax - vmin || 1) * (y1 - y0)
    return <circle key={i} cx={+x.toFixed(1)} cy={+y.toFixed(1)} r={2.4} fill="#0a0f19" stroke={col} strokeWidth={1.5} />
  })
}

function WinProbMovement({ md }: { md: EventDetail }) {
  const { home, away } = md.event
  const hp = safeCol(home.primary_color, '#4da6ff'), ap = safeCol(away.primary_color, '#8b5cf6')
  const [history, setHistory] = useState<HistoryPoint[]>([])
  useEffect(() => {
    getEventHistory(md.event.id, { market: 'h2h', outcome: home.name })
      .then(r => setHistory(r.history ?? []))
      .catch(() => setHistory([]))
  }, [md.event.id, home.name])

  // Convert history prices → implied probability if we have >= 4 points, else fall back to synthetic
  let hS: number[], aS: number[]
  if (history.length >= 4) {
    hS = history.map(p => Math.max(3, Math.min(97, (1 / p.price) * 100)))
    aS = hS.map(v => 100 - v)
    if (hS.length > 12) { const step = Math.floor(hS.length / 12); hS = hS.filter((_, i) => i % step === 0).slice(-12); aS = aS.filter((_, i) => i % step === 0).slice(-12); }
  } else {
    const end = Math.round((md.model?.home_win_prob ?? 0.5) * 100)
    const start = end + (end < 50 ? 9 : -9)
    hS = seriesTo(end, start, 12, 1.1); aS = hS.map(v => 100 - v)
  }
  const lo = Math.max(5, Math.min(...hS, ...aS) - 10)
  const hi = Math.min(100, Math.max(...hS, ...aS) + 10)
  const hLast = hS[hS.length - 1], aLast = aS[aS.length - 1]

  const yPct = (v: number) => (1 - (v - lo) / (hi - lo || 1)) * 100
  const pts = (vals: number[]) => vals.map((v, i) => `${(i / (vals.length - 1) * 100).toFixed(2)},${yPct(v).toFixed(2)}`).join(' ')
  const yLabels = [0, 1, 2, 3, 4].map(i => Math.round(hi - (hi - lo) * i / 4))
  const xLabels = ['-24h', '-12h', '-6h', '-3h', '-1h', 'Now']

  return (
    <div className="p" id="pMove">
      <div className="ph"><span className="pt">Win Probability Movement</span></div>
      <div className="legend">
        <span><i className="key" style={{ background: hp }} />{home.abbr}</span>
        <span><i className="key" style={{ background: ap }} />{away.abbr}</span>
      </div>
      <div className="pb">
        <div className="chg">
          <div className="chg-yaxis">
            {yLabels.map((v, i) => <span key={i}>{v}%</span>)}
          </div>
          <div className="chg-plot">
            <svg className="chg-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <g stroke="#161f30" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke">
                {[0,25,50,75,100].map(y => <line key={y} x1={0} y1={y} x2={100} y2={y} />)}
              </g>
              <polyline points={pts(hS)} fill="none" stroke={hp} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <polyline points={pts(aS)} fill="none" stroke={ap} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {hS.map((v, i) => (
              <span key={'h'+i} className="chg-mkr" style={{ left: `${(i / (hS.length - 1) * 100)}%`, top: `${yPct(v)}%`, borderColor: hp }} />
            ))}
            {aS.map((v, i) => (
              <span key={'a'+i} className="chg-mkr" style={{ left: `${(i / (aS.length - 1) * 100)}%`, top: `${yPct(v)}%`, borderColor: ap }} />
            ))}
          </div>
          <div className="chg-endcol">
            <span className="chg-dot" style={{ top: `${yPct(hLast)}%`, background: hp }} />
            <span className="chg-dot" style={{ top: `${yPct(aLast)}%`, background: ap }} />
            <span className="chg-end" style={{ top: `${yPct(hLast)}%`, color: hp }}>{Math.round(hLast)}%</span>
            <span className="chg-end" style={{ top: `${yPct(aLast)}%`, color: ap }}>{Math.round(aLast)}%</span>
          </div>
          <div className="chg-xaxis">
            {xLabels.map((l, i) => <span key={i}>{l}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}

function LineTotalStack({ md }: { md: EventDetail }) {
  const { home, away } = md.event
  const ap = safeCol(away.primary_color, '#8b5cf6')
  const mu = md.model?.projected_margin ?? 0
  const tot = md.model?.projected_total ?? 40

  const lS = seriesTo(mu, mu + (mu < 0 ? 1.2 : -1.2), 12, 0.12)
  const llo = Math.min(...lS) - 2.5, lhi = Math.max(...lS) + 2.5
  const lLast = lS[lS.length - 1]

  const tS = seriesTo(tot, tot - 3.5, 12, 0.3)
  const tlo = Math.min(...tS) - 2, thi = Math.max(...tS) + 2
  const tLast = tS[tS.length - 1]

  const xLabels = ['-24h', '-12h', '-6h', '-3h', '-1h', 'Now']

  const lYPct = (v: number) => (1 - (v - llo) / (lhi - llo || 1)) * 100
  const lPts = lS.map((v, i) => `${(i / (lS.length - 1) * 100).toFixed(2)},${lYPct(v).toFixed(2)}`).join(' ')
  const lYLabels = [0, 1, 2, 3].map(i => (lhi - (lhi - llo) * i / 3).toFixed(1))

  const tYPct = (v: number) => (1 - (v - tlo) / (thi - tlo || 1)) * 100
  const tPts = tS.map((v, i) => `${(i / (tS.length - 1) * 100).toFixed(2)},${tYPct(v).toFixed(2)}`).join(' ')
  const tYLabels = [0, 1, 2, 3].map(i => (thi - (thi - tlo) * i / 3).toFixed(1))

  return (
    <>
      <div className="p" id="pLineMv">
        <div className="ph"><span className="pt">Line Movement</span><span className="hv mono" style={{ color: ap }}>{sgn(mu)}</span></div>
        <div className="pb">
          <div className="chg">
            <div className="chg-yaxis">
              {lYLabels.map((v, i) => <span key={i}>{v}</span>)}
            </div>
            <div className="chg-plot">
              <svg className="chg-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <g stroke="#161f30" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke">
                  {[0,33,66,100].map(y => <line key={y} x1={0} y1={y} x2={100} y2={y} />)}
                </g>
                <polyline points={lPts} fill="none" stroke={ap} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {lS.map((v, i) => (
                <span key={i} className="chg-mkr" style={{ left: `${(i / (lS.length - 1) * 100)}%`, top: `${lYPct(v)}%`, borderColor: ap }} />
              ))}
            </div>
            <div className="chg-endcol">
              <span className="chg-dot" style={{ top: `${lYPct(lLast)}%`, background: ap }} />
            </div>
            <div className="chg-xaxis">
              {xLabels.map((l, i) => <span key={i}>{l}</span>)}
            </div>
          </div>
        </div>
      </div>
      <div className="p" id="pTotMv">
        <div className="ph"><span className="pt">Total Points Movement</span><span className="hv mono" style={{ color: '#25d97b' }}>{tot.toFixed(1)}</span></div>
        <div className="pb">
          <div className="chg">
            <div className="chg-yaxis">
              {tYLabels.map((v, i) => <span key={i}>{v}</span>)}
            </div>
            <div className="chg-plot">
              <svg className="chg-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="mck-gt2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#25d97b" stopOpacity=".3" />
                    <stop offset="100%" stopColor="#25d97b" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g stroke="#161f30" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke">
                  {[0,33,66,100].map(y => <line key={y} x1={0} y1={y} x2={100} y2={y} />)}
                </g>
                <polygon points={`${tPts} 100,100 0,100`} fill="url(#mck-gt2)" />
                <polyline points={tPts} fill="none" stroke="#25d97b" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {tS.map((v, i) => (
                <span key={i} className="chg-mkr" style={{ left: `${(i / (tS.length - 1) * 100)}%`, top: `${tYPct(v)}%`, borderColor: '#25d97b' }} />
              ))}
            </div>
            <div className="chg-endcol">
              <span className="chg-dot" style={{ top: `${tYPct(tLast)}%`, background: '#25d97b' }} />
            </div>
            <div className="chg-xaxis">
              {xLabels.map((l, i) => <span key={i}>{l}</span>)}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Team News & Lineups
// ───────────────────────────────────────────────────────────────────────────
function TeamNews({ md }: { md: EventDetail }) {
  const { home, away } = md.event
  const hp = safeCol(home.primary_color, '#4da6ff'), ap = safeCol(away.primary_color, '#8b5cf6')
  const hd = darken(hp, 0.7), ad = darken(ap, 0.7)
  const lineups = md.lineups ?? []
  const hIn = lineups.filter(l => l.team === home.name && l.status === 'in')
  const hOut = lineups.filter(l => l.team === home.name && (l.status === 'out' || l.status === 'doubtful'))
  const aIn = lineups.filter(l => l.team === away.name && l.status === 'in')
  const aOut = lineups.filter(l => l.team === away.name && (l.status === 'out' || l.status === 'doubtful'))

  const hAdj = fakeAdjPct(home.abbr)
  const aAdj = fakeAdjPct(away.abbr)

  const wKind = weatherIconKind(md.weather)
  const wIcon = wKind === 'rain' ? '🌧' : wKind === 'wind' ? '💨' : wKind === 'cloud' ? '☁️' : '☀️'
  const wText = wKind === 'rain'
    ? 'Rain and a slippery ball. Model shades the projected total down 2.4 points.'
    : wKind === 'wind'
    ? 'Strong wind. Kicking game affected; total shaded down 1.8 points.'
    : 'Settled conditions. No material adjustment to the projected total.'

  const posFor = (name: string): string => {
    const positions = ['HK','FB','WG','CE','FE','HB','PR','SR','LK']
    return positions[seedFrom(name) % positions.length]
  }

  const column = (side: 'h' | 'a') => {
    const t = side === 'h' ? home : away
    const p = side === 'h' ? hp : ap
    const d = side === 'h' ? hd : ad
    const ins = side === 'h' ? hIn : aIn
    const outs = side === 'h' ? hOut : aOut
    const name = splitName(t.name)
    return (
      <div className="luc" style={{
        background: `linear-gradient(150deg, ${d}, #0d1320 62%)`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div className="mascot-bg" style={{ opacity: 0.14 }}>
          <Crest primary={p} secondary={d} abbr={t.abbr} teamName={t.name} className="mascot-crest" />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h4 style={{ color: p }}>{name.city} {name.short.toUpperCase()}</h4>
          {ins.length > 0 && (<><div className="io i">IN</div>
            {ins.map((pl, i) => {
              const pn = pl.player_name ?? pl.player ?? 'Player'
              return (
                <div key={i} className="pl">
                  <b>✓</b>{pn}
                  <span className="pos">{posFor(pn)}</span>
                </div>
              )
            })}</>)}
          {outs.length > 0 && (<><div className="io o">OUT</div>
            {outs.map((pl, i) => {
              const pn = pl.player_name ?? pl.player ?? 'Player'
              return (
                <div key={i} className="pl x">
                  <b>✗</b>{pn}
                  <span className="pos">{posFor(pn)}</span>
                  {pl.reason && <span style={{ color: '#55647a', marginLeft: 4 }}>– {pl.reason}</span>}
                </div>
              )
            })}</>)}
          {ins.length === 0 && outs.length === 0 && (
            <div className="pl" style={{ color: '#55647a' }}>Lineups not yet announced</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p" id="pNews">
      <div className="ph"><span className="pt">Team News &amp; Lineups</span><span className="q">?</span></div>
      <div className="pb">
        <div className="lu">{column('h')}{column('a')}</div>

        {/* Unified AI IMPACT — one title, two side descriptions */}
        <div className="aiimp">
          <div className="aiimp-hdr">
            <span className="ai-badge">AI</span>
            <span className="aiimp-title">AI IMPACT</span>
          </div>
          <div className="aiimp-body">
            <div className="aiimp-side">
              <div className="aiimp-team" style={{ color: hp }}>{home.abbr}</div>
              <p>{hIn.length + hOut.length > 0 ? 'Selected changes moderately affect model outputs.' : 'No confirmed changes; baseline projections used.'}</p>
              <div className="aiimp-adj" style={{ color: hAdj >= 0 ? '#25d97b' : '#f4526a' }}>
                {home.abbr} win probability {hAdj >= 0 ? '+' : '−'}{Math.abs(hAdj)}%
              </div>
            </div>
            <div className="aiimp-side">
              <div className="aiimp-team" style={{ color: ap }}>{away.abbr}</div>
              <p>{aIn.length + aOut.length > 0 ? 'Selected changes moderately affect model outputs.' : 'No confirmed changes; baseline projections used.'}</p>
              <div className="aiimp-adj" style={{ color: aAdj >= 0 ? '#25d97b' : '#f4526a' }}>
                {away.abbr} win probability {aAdj >= 0 ? '+' : '−'}{Math.abs(aAdj)}%
              </div>
            </div>
          </div>
        </div>

        {/* Weather + Factors side-by-side */}
        <div className="wgrid">
          <div className="wnote">
            <div className="ic">{wIcon}</div>
            <div><div className="tt">WEATHER IMPACT</div><p>{wText}</p></div>
          </div>
          <div className="wnote">
            <div className="ic">🧠</div>
            <div>
              <div className="tt">AI MODEL FACTORS</div>
              <p>Injuries, H2H, Form, Line Movement, Weather, Venue, Rest Days, Power Ratings &amp; 120+ more.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// H2H + Recent Form
// ───────────────────────────────────────────────────────────────────────────
function H2HFormStack({ md }: { md: EventDetail }) {
  const { home, away } = md.event
  const hp = safeCol(home.primary_color, '#4da6ff'), ap = safeCol(away.primary_color, '#8b5cf6')
  const hd = darken(hp, 0.7), ad = darken(ap, 0.7)
  const h2h = fakeH2H(md.event.id)
  return (
    <>
      <div className="p" id="pH2h">
        <div className="ph"><span className="pt">H2H History (Last 10)</span></div>
        <div className="pb">
          <div className="h2h">
            <div className="s" style={{ background: hd }}>
              <span className="n" style={{ background: hp }}>{h2h.hw}</span>
              <span>{home.abbr} WINS</span>
            </div>
            <span className="h2h-mid">LAST 10</span>
            <div className="s a" style={{ background: ad }}>
              <span>{away.abbr} WINS</span>
              <span className="n" style={{ background: ap }}>{h2h.aw}</span>
            </div>
          </div>
          <div className="chips">
            {h2h.last.map((w, i) => {
              const isH = w === 'h'
              const bg = isH ? hp : ap
              return <span key={i} className="chip" style={{ background: bg }}>W</span>
            })}
          </div>
        </div>
      </div>
      <div className="p" id="pForm">
        <div className="ph"><span className="pt">Recent Form</span></div>
        <div className="pb">
          <div className="fg">
            {(['home', 'away'] as const).map(k => {
              const t = k === 'home' ? home : away
              const col = k === 'home' ? hp : ap
              const dcol = k === 'home' ? hd : ad
              const form = fakeForm(t.abbr)
              const pts = form.filter(f => f === 'W').length * 2
              return (
                <div key={k} className="fgc" style={{ borderColor: `${col}33` }}>
                  <div className="fghdr" style={{ background: `linear-gradient(90deg, ${dcol}, ${dcol}44)`, borderBottom: `1px solid ${col}55` }}>
                    <span className="fghdr-abbr" style={{ color: col }}>{t.abbr}</span>
                    <span className="fghdr-lad">{fakeLadder(t.abbr)}</span>
                  </div>
                  <div className="row5">
                    {form.map((f, i) => <span key={i} className={'f ' + f.toLowerCase()}>{f}</span>)}
                  </div>
                  <div className="fs"><span>FORM GUIDE</span><span className="mono">{pts}/10</span></div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Best Value list for this match
// ───────────────────────────────────────────────────────────────────────────
function ValueList({ md }: { md: EventDetail }) {
  const picks: Array<{ e: number; t: string; s: string }> = []
  const { home, away } = md.event
  for (const r of md.markets?.h2h ?? []) {
    if (r.edge_pct != null && r.edge_pct >= 2 && r.edge_pct < 20) {
      const side = r.outcome === home.name ? home.abbr : away.abbr
      picks.push({ e: r.edge_pct, t: `${side} to win @ ${r.price.toFixed(2)}`, s: `${r.bookmaker} · H2H · fair ${r.fair_price?.toFixed(2) ?? '–'}` })
    }
  }
  for (const r of md.markets?.spreads ?? []) {
    if (r.edge_pct != null && r.edge_pct >= 2 && r.edge_pct < 20 && r.point != null) {
      const side = r.outcome === home.name ? home.abbr : away.abbr
      picks.push({ e: r.edge_pct, t: `${side} ${sgn(r.point)} @ ${r.price.toFixed(2)}`, s: `${r.bookmaker} · Line · fair ${r.fair_price?.toFixed(3) ?? '–'}` })
    }
  }
  for (const r of md.markets?.totals ?? []) {
    if (r.edge_pct != null && r.edge_pct >= 2 && r.edge_pct < 20 && r.point != null) {
      picks.push({ e: r.edge_pct, t: `${r.outcome} ${r.point.toFixed(1)} @ ${r.price.toFixed(2)}`, s: `${r.bookmaker} · Totals · fair ${r.fair_price?.toFixed(2) ?? '–'}` })
    }
  }
  picks.sort((a, b) => b.e - a.e)
  const top = picks.slice(0, 5)
  return (
    <div className="p" id="pValue">
      <div className="ph"><span className="pt">Best Value — This Match</span><span className="q">?</span></div>
      <div className="pb">
        {top.length ? top.map((p, i) => (
          <div key={i} className="vf">
            <span className="b"></span>
            <span className="m">
              <span className="m1">{p.t}</span>
              <span className="m2">{p.s}</span>
            </span>
            <span className="e mono">+{p.e.toFixed(1)}%</span>
          </div>
        )) : (
          <div className="vf">
            <span className="b" style={{ background: '#55647a' }}></span>
            <span className="m">
              <span className="m1">No edge above 2%</span>
              <span className="m2">Market agrees with the model on this fixture</span>
            </span>
            <span className="e" style={{ color: '#55647a', fontSize: 10 }}>—</span>
          </div>
        )}
        <div className="vf">
          <span className="b" style={{ background: '#55647a' }}></span>
          <span className="m">
            <span className="m1">Model performance</span>
            <span className="m2">Awaiting settled results</span>
          </span>
          <span className="e" style={{ color: '#55647a', fontSize: 10 }}>—</span>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// AI Key Matchup Metrics + Power Ranking (stacked)
// ───────────────────────────────────────────────────────────────────────────
function MatchupMetricsStack({ md }: { md: EventDetail }) {
  const { home, away } = md.event
  const hp = safeCol(home.primary_color, '#c8324f')
  const ap = safeCol(away.primary_color, '#8b5cf6')
  const rows = fakeMetrics(home.abbr, away.abbr)
  const pow = fakePower(home.abbr, away.abbr)
  const homePowerWins = pow.home < pow.away
  const powBg = `linear-gradient(90deg, ${homePowerWins ? hp : darken(hp,0.85)}22 0%, #0d1320 50%, ${homePowerWins ? darken(ap,0.85) : ap}22 100%)`
  return (
    <>
      <div className="p" id="pMetrics">
        <div className="ph"><span className="pt">AI Key Matchup Metrics</span><span className="q">?</span></div>
        <div className="pb">
          <div className="mtxhdr">
            <span style={{ color: hp }}>{home.abbr}</span>
            <span>EDGE</span>
            <span style={{ color: ap }}>{away.abbr}</span>
          </div>
          <div className="mtxbody">
            {rows.map((r, i) => (
              <div key={i} className="mtxrow">
                <span className="mv" style={{ color: hp }}>{r.h}</span>
                <span className="ml">{r.label}</span>
                <span className={'marr ' + (r.homeAdv ? 'l' : 'r')} style={{ color: r.homeAdv ? hp : ap }}>
                  {r.homeAdv ? '‹' : '›'}
                </span>
                <span className="mv r" style={{ color: ap }}>{r.a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="p" id="pPower">
        <div className="ph"><span className="pt">Power Ranking</span></div>
        <div className="pb pw" style={{ background: powBg }}>
          <span className="pwn" style={{ color: hp }}>{pow.home}</span>
          <span className="pwx">POWER RANKING</span>
          <span className="pwn" style={{ color: ap }}>{pow.away}</span>
        </div>
      </div>
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Bottom status bar
// ───────────────────────────────────────────────────────────────────────────
function BottomBar({ md }: { md: EventDetail }) {
  const m = md.model
  if (!m) return null
  const { home, away } = md.event
  const hp = safeCol(home.primary_color, '#4da6ff'), ap = safeCol(away.primary_color, '#8b5cf6')
  const hd = darken(hp, 0.75), ad = darken(ap, 0.75)
  const homeFav = m.home_win_prob > m.away_win_prob
  const fav = homeFav ? home : away
  const favCol = safeCol(fav.primary_color, homeFav ? hp : ap)
  const score = projectedScore(m.projected_margin, m.projected_total)
  const best = bestBet(md)
  return (
    <div className="bottom" style={{ background: `linear-gradient(90deg, ${hd}55, #0d1320 45%, ${ad}55)` }}>
      <div className="bc">
        <span style={{ fontSize: 14 }}>🏆</span>
        <span className="bcap">AI PREDICTED WINNER</span>
        <span className="bwin" style={{ color: favCol }}>{splitName(fav.name).short.toUpperCase()}</span>
      </div>
      {score ? (
        <div className="bc">
          <span className="bcap">PROJECTED SCORE</span>
          <div className="bsc mono">
            <span style={{ fontSize: 8.5, color: hp, letterSpacing: '.08em', fontFamily: 'Inter', fontWeight: 700 }}>{home.abbr}</span>
            <span className="n" style={{ color: hp }}>{score.home}</span>
            <span style={{ color: '#55647a' }}>–</span>
            <span className="n" style={{ color: ap }}>{score.away}</span>
            <span style={{ fontSize: 8.5, color: ap, letterSpacing: '.08em', fontFamily: 'Inter', fontWeight: 700 }}>{away.abbr}</span>
          </div>
        </div>
      ) : <div className="bc"></div>}
      <div className="bc">
        <span className="bcap">BEST VALUE BET</span>
        {best ? (
          <>
            <span className="bbet">{best.text} <span style={{ color: '#7b8ba3', fontWeight: 500 }}>({best.bk})</span></span>
            <span className="bv mono">+{best.edge.toFixed(1)}%</span>
          </>
        ) : <span className="bbet" style={{ color: '#7b8ba3' }}>No edge above 2%</span>}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Error boundary
// ───────────────────────────────────────────────────────────────────────────
class Boundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 32, color: '#f4526a', fontFamily: 'monospace', background: '#04060b', minHeight: '100vh' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Mockup render error:</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(this.state.err.stack ?? this.state.err.message)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Root
// ───────────────────────────────────────────────────────────────────────────
function MockupInner() {
  const { events } = useDashboard()

  // Global filter state
  const [sport, setSport] = useState<string>('ALL')
  const [valueOnly, setValueOnly] = useState(false)
  const [, setActiveSection] = useState('strip')

  const availableSports = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) if (e.sport_title) set.add(e.sport_title)
    const list = Array.from(set)
    return ['ALL', ...list]
  }, [events])

  // Auto-pick first fixture that matches current sport filter AND has real
  // logos for both teams (so the hero panel doesn't open on a shield fallback).
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!events.length) return
    const eligible = events.filter(e =>
      e.home_team && e.away_team &&
      e.home_team.toUpperCase() !== 'TBD' && e.away_team.toUpperCase() !== 'TBD' &&
      TEAM_LOGOS[e.home_team] && TEAM_LOGOS[e.away_team]
    )
    const scoped = sport === 'ALL' ? eligible : eligible.filter(e => (e.sport_title || '').toUpperCase() === sport)
    const match = scoped[0]
    if (match && (!selectedId || !eligible.find(e => e.id === selectedId))) setSelectedId(match.id)
  }, [events, sport, selectedId])

  // Load detail for selected fixture
  const [detail, setDetail] = useState<EventDetail | null>(null)
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    getEvent(selectedId).then(setDetail).catch(() => setDetail(null))
    const t = setInterval(() => {
      getEvent(selectedId).then(setDetail).catch(() => {})
    }, 30_000)
    return () => clearInterval(t)
  }, [selectedId])

  // Round confidence — real avg confidence across filtered events
  const roundConf = useMemo(() => {
    const list = (sport === 'ALL' ? events : events.filter(e => (e.sport_title || '').toUpperCase() === sport))
      .filter(e => e.confidence != null) as (DashboardEvent & { confidence: number })[]
    if (!list.length) return 83
    const avg = list.reduce((s, e) => s + e.confidence, 0) / list.length
    return Math.round(avg * 100)
  }, [events, sport])

  // Matches for the match-picker dropdown — same eligibility rules as the
  // auto-select above (no TBD, real logos both sides), optionally filtered
  // to value-only, sorted by kickoff.
  const matchList = useMemo(() => {
    let list = events.filter(e =>
      e.home_team && e.away_team &&
      e.home_team.toUpperCase() !== 'TBD' && e.away_team.toUpperCase() !== 'TBD' &&
      TEAM_LOGOS[e.home_team] && TEAM_LOGOS[e.away_team]
    )
    if (sport !== 'ALL') list = list.filter(e => (e.sport_title || '').toUpperCase() === sport)
    if (valueOnly) list = list.filter(e => (e.best_edge_pct ?? 0) >= 2)
    list.sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
    return list
  }, [events, sport, valueOnly])

  return (
    <>
      <style>{CSS}</style>
      <div className="mck-root">
        <Sidebar onNavigate={setActiveSection} roundConf={roundConf} />
        <main>
          <TopBar
            sport={sport}
            matches={matchList}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <FixturesStrip
            events={events}
            selectedId={selectedId}
            onSelect={setSelectedId}
            filter={{ search: '', valueOnly, sort: 'time', sport }}
          />
          {!detail ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#7b8ba3' }}>
              {events.length === 0 ? 'Loading fixtures…' : 'Loading match detail…'}
            </div>
          ) : (
            <>
              <div className="row rh">
                <Hero md={detail} />
                <Prediction md={detail} />
              </div>
              <ThreeMetrics md={detail} />
              <div className="row rmega">
                <div className="mcol">
                  <OddsComparison md={detail} />
                  <TeamNews md={detail} />
                </div>
                <div className="mcol">
                  <WinProbMovement md={detail} />
                  <MatchupMetricsStack md={detail} />
                </div>
                <div className="mcol mcol-r">
                  <LineTotalStack md={detail} />
                  <H2HFormStack md={detail} />
                </div>
              </div>
              <BottomBar md={detail} />
            </>
          )}
        </main>
      </div>
    </>
  )
}

export default function Mockup() {
  return (
    <Boundary>
      <MockupInner />
    </Boundary>
  )
}
