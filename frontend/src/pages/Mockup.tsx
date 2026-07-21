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
function venueFor(sport: string): string {
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
}
.mck-root .mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.mck-root a{text-decoration:none;color:inherit}
.mck-root ::-webkit-scrollbar{height:5px;width:5px}
.mck-root ::-webkit-scrollbar-thumb{background:#1e2b3f;border-radius:3px}

.mck-root .p{background:var(--mpanel);border:1px solid var(--mline);border-radius:var(--mr);display:flex;flex-direction:column;min-height:0;overflow:hidden}
.mck-root .ph{display:flex;align-items:center;gap:6px;padding:6px 9px 4px;flex:none}
.mck-root .pt{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#c3d0e2;white-space:nowrap}
.mck-root .q{width:11px;height:11px;border-radius:50%;border:1px solid var(--mline);color:var(--mdim2);font-size:7.5px;display:grid;place-items:center;flex:none}
.mck-root .pb{padding:0 9px 8px;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.mck-root svg.ch{flex:1;min-height:0;width:100%;height:100%}

.mck-root .side{width:116px;flex:none;background:var(--mpanel);border:1px solid var(--mline);border-radius:var(--mr);display:flex;flex-direction:column;padding:8px 0 6px;overflow:hidden}
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

.mck-root main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:6px}
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

.mck-root .row{display:grid;gap:6px;min-height:0}
.mck-root .rh{grid-template-columns:1fr 286px;flex:0 0 118px}
.mck-root .r3g{grid-template-columns:1fr 1fr 1fr;flex:0 0 72px}
.mck-root .rm{grid-template-columns:1.06fr 1fr .84fr;flex:1 1 0}
.mck-root .stk{display:flex;flex-direction:column;gap:6px;min-height:0}
.mck-root .stk>.p{flex:1;min-height:0}

.mck-root .hero{border-radius:var(--mr);border:1px solid var(--mline);overflow:hidden;display:grid;grid-template-columns:1fr 158px 1fr;align-items:center}
.mck-root .st{display:flex;align-items:center;gap:10px;padding:8px 14px}
.mck-root .st.aw{flex-direction:row-reverse;text-align:right}
.mck-root .crest{width:60px;height:60px;flex:none}
.mck-root .city{font-size:9.5px;letter-spacing:.05em;font-weight:600;opacity:.8;color:#e2e8f3}
.mck-root .tn{font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1;margin-top:1px;color:var(--mtxt)}
.mck-root .tmeta{margin-top:5px;font-size:10px;color:#e2e8f3;font-weight:600}
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

.mck-root .wp{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1}
.mck-root .wp .pc{font-size:19px;font-weight:800;letter-spacing:-.02em}
.mck-root .wp .nm{font-size:7px;letter-spacing:.1em;color:var(--mdim);font-weight:700}
.mck-root .bar{height:4px;border-radius:3px;background:#1a2333;overflow:hidden;flex:none;margin-top:3px}
.mck-root .bar i{display:block;height:100%;border-radius:3px}
.mck-root .lc{display:flex;align-items:center;justify-content:space-between;gap:5px;flex:1}
.mck-root .lc .v{font-size:19px;font-weight:800;letter-spacing:-.02em}
.mck-root .lc .lb{font-size:7.5px;letter-spacing:.1em;color:var(--mdim);font-weight:700}
.mck-root .mc{width:26px;height:26px;flex:none}
.mck-root .cr2{display:flex;align-items:center;gap:6px;flex:none;margin-top:3px}
.mck-root .cr2 .l{font-size:7px;letter-spacing:.1em;color:var(--mdim);font-weight:700;white-space:nowrap}
.mck-root .cr2 .tk{flex:1;height:5px;background:#1a2333;border-radius:3px;overflow:hidden}
.mck-root .cr2 .tk i{display:block;height:100%;background:linear-gradient(90deg,#0f8f4d,var(--mgreen));border-radius:3px}
.mck-root .cr2 .n{font-size:9.5px;font-weight:700;color:var(--mgreen)}
.mck-root .tc{display:flex;align-items:center;gap:9px;flex:1;min-height:0}
.mck-root .tc .big{font-size:19px;font-weight:800;letter-spacing:-.02em;color:var(--mtxt)}

.mck-root .tabs{display:flex;gap:3px;margin-left:auto}
.mck-root .tab{font-size:8px;font-weight:700;letter-spacing:.04em;padding:4px 7px;border-radius:5px;color:var(--mdim);cursor:pointer;border:1px solid transparent;background:none;font-family:inherit;white-space:nowrap}
.mck-root .tab:hover{color:#c3d0e2}
.mck-root .tab.on{background:#0f2740;border-color:#1d4a72;color:#5cb3ff}
.mck-root table{width:100%;border-collapse:collapse}
.mck-root th{font-size:7px;letter-spacing:.07em;color:var(--mdim2);font-weight:700;text-align:right;padding:3px 3px;border-bottom:1px solid var(--mline)}
.mck-root th:first-child{text-align:left}
.mck-root td{padding:4px 3px;border-bottom:1px solid var(--msoft);font-size:10.5px;text-align:right;color:var(--mtxt)}
.mck-root tr:last-child td{border-bottom:0}
.mck-root td:first-child{text-align:left}
.mck-root .bk{display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:600;color:#c9d5e5}
.mck-root .bk i{width:14px;height:14px;border-radius:3px;display:grid;place-items:center;font-size:6px;font-weight:800;font-style:normal;color:#fff;flex:none}
.mck-root .fair{color:#8fa2bb}
.mck-root .val{display:flex;flex-direction:column;align-items:flex-end;font-size:9px;font-weight:700;line-height:1.3}
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
.mck-root .luc{border:1px solid var(--mline);border-radius:7px;padding:7px;overflow:hidden;display:flex;flex-direction:column}
.mck-root .luc h4{font-size:9px;font-weight:800;letter-spacing:.03em;margin-bottom:4px;color:var(--mtxt)}
.mck-root .io{font-size:7.5px;font-weight:800;letter-spacing:.1em;margin:3px 0 1px}
.mck-root .io.i{color:var(--mgreen)}
.mck-root .io.o{color:var(--mred)}
.mck-root .pl{font-size:9.5px;color:#c3d0e2;display:flex;gap:4px;padding:1px 0;line-height:1.25}
.mck-root .pl b{color:var(--mgreen);font-weight:700}
.mck-root .pl.x b{color:var(--mred)}
.mck-root .imp{margin-top:auto;border-top:1px solid var(--msoft);padding-top:5px}
.mck-root .imp .t{font-size:7.5px;letter-spacing:.1em;color:var(--mdim);font-weight:700;margin-bottom:2px}
.mck-root .imp p{font-size:9px;color:#a9b6c8;line-height:1.35}
.mck-root .imp .adj{font-size:9px;font-weight:600;margin-top:1px}
.mck-root .wnote{display:flex;gap:6px;align-items:flex-start;background:var(--mpanel2);border:1px solid var(--mline);border-radius:7px;padding:5px 7px;margin-top:5px;flex:none}
.mck-root .wnote .ic{font-size:12px;line-height:1}
.mck-root .wnote .tt{font-size:8px;letter-spacing:.09em;font-weight:800;color:#9fb0c6}
.mck-root .wnote p{font-size:9px;color:var(--mdim);line-height:1.35}

.mck-root .h2h{display:flex;border-radius:7px;overflow:hidden;flex:none;position:relative}
.mck-root .h2h .s{flex:1;display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:10px;letter-spacing:.06em;font-weight:800;color:#fff}
.mck-root .h2h .s.a{justify-content:flex-end}
.mck-root .h2h .s .n{font-size:13px;font-weight:800;font-family:'IBM Plex Mono',monospace;padding:3px 8px;border-radius:4px;color:#fff;line-height:1}
.mck-root .h2h-mid{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--mpanel);border:1px solid var(--mline);padding:3px 8px;border-radius:4px;font-size:8px;letter-spacing:.11em;color:#c3d0e2;font-weight:800;pointer-events:none;z-index:2}
.mck-root .chips{display:flex;gap:4px;justify-content:space-between;margin-top:7px}
.mck-root .chip{flex:1;aspect-ratio:1;max-width:24px;border-radius:5px;display:grid;place-items:center;font-size:10px;font-weight:800;font-family:'IBM Plex Mono',monospace;color:#fff}
.mck-root .fg{display:grid;grid-template-columns:1fr 1fr;gap:6px;flex:1;min-height:0}
.mck-root .fgc{background:var(--mpanel2);border:1px solid var(--mline);border-radius:7px;padding:8px 9px;display:flex;flex-direction:column;justify-content:center}
.mck-root .fgc h5{font-size:9.5px;font-weight:800;margin-bottom:7px;letter-spacing:.02em}
.mck-root .fgc .row5{display:flex;gap:4px}
.mck-root .fgc .row5 .f{width:22px;height:22px;border-radius:5px;font-size:11px}
.mck-root .fgc .fs{font-size:9px;color:var(--mdim2);letter-spacing:.08em;font-weight:700;margin-top:7px;display:flex;justify-content:space-between}
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

/* Tablet-ish */
@media(max-width:900px){
  .mck-root{flex-direction:column;padding:7px;height:auto;min-height:100vh;overflow:visible}
  .mck-root main{overflow:visible}
  .mck-root .side{width:auto;flex-direction:row;align-items:center;overflow-x:auto;overflow-y:hidden;padding:6px 8px;gap:6px}
  .mck-root .brand{padding:0 6px 0 0;border-right:1px solid var(--mline);margin-right:4px}
  .mck-root .nav{flex-direction:row;flex:1;min-width:0}
  .mck-root .navsep{display:none}
  .mck-root .nav a{border-left:0;border-bottom:2px solid transparent;white-space:nowrap;padding:6px 8px}
  .mck-root .nav a.on{border-left:0;border-bottom-color:var(--mblue);background:transparent}
  .mck-root .cc{display:none}
  .mck-root .top{flex-wrap:wrap;gap:6px}
  .mck-root .top>div:first-child{flex:1;min-width:150px}
  .mck-root .ctl{margin-left:0;flex-wrap:wrap;width:100%}
  .mck-root .srch{width:100%;min-width:120px}
  .mck-root .srchw{flex:1}
  .mck-root .stripw{flex:none;height:98px}
  .mck-root .row,.mck-root .rh,.mck-root .r3g,.mck-root .rm{grid-template-columns:1fr!important;flex:none!important}
  .mck-root .stk{flex-direction:column}
  .mck-root .hero{grid-template-columns:1fr}
  .mck-root .st,.mck-root .st.aw{flex-direction:column;text-align:center;gap:6px;padding:12px}
  .mck-root .st.aw{padding-top:0}
  .mck-root .st.aw .tf{justify-content:center}
  .mck-root .hmid{padding:10px 0;border-top:1px solid var(--msoft);border-bottom:1px solid var(--msoft)}
  .mck-root .lu{grid-template-columns:1fr 1fr}
  .mck-root .bottom{grid-template-columns:1fr;gap:10px}
  .mck-root .bc,.mck-root .bc:first-child,.mck-root .bc:last-child{justify-content:center;flex-wrap:wrap}
  .mck-root .p{min-height:170px}
  .mck-root .p svg.ch{min-height:150px}
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
  .mck-root .tn{font-size:18px}
  .mck-root .tmeta{font-size:9.5px}
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
function Crest({ primary, secondary, abbr, className = 'crest' }: { primary: string; secondary: string; abbr: string; className?: string }) {
  const p = safeCol(primary, '#4da6ff')
  const s = safeCol(secondary, darken(p, 0.6))
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
function Sidebar({ activeSection, onNavigate, roundConf }: {
  activeSection: string; onNavigate: (s: string) => void; roundConf: number
}) {
  const label = roundConf >= 82 ? 'HIGH' : roundConf >= 65 ? 'MEDIUM' : 'LOW'
  const dash = (roundConf / 100) * 251
  const NAV: Array<[string, string, string]> = [
    ['strip','Fixtures','M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z'],
    ['pOdds','Odds','M5 20V10M10 20V4M15 20v-8M20 20v-5'],
    ['pMove','Movement','M4 18 L10 11 L14 15 L20 6 M20 11V6h-5'],
    ['pNews','Team News','M4 6h16M4 12h16M4 18h10'],
    ['pValue','Value','M12 3v18M3 12h18'],
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
        {NAV.map(([id, label, d]) => (
          <a key={id} className={activeSection === id ? 'on' : ''} onClick={() => onNavigate(id)}>
            <svg viewBox="0 0 24 24"><path d={d} /></svg>{label}
          </a>
        ))}
        <div className="navsep">COMING SOON</div>
        <a className="soon"><svg viewBox="0 0 24 24"><path d="M3 15l4-4 4 3 5-7 5 4M3 20h18" /></svg>Model Health</a>
        <a className="soon"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9z" /></svg>Alerts</a>
        <a className="soon"><svg viewBox="0 0 24 24"><circle cx={12} cy={12} r={3} /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>Settings</a>
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
function TopBar({ sport, sports, onSport, sort, onSort, search, onSearch, valueOnly, onValueOnly }: {
  sport: string; sports: string[];
  onSport: (s: string) => void;
  sort: string; onSort: (s: string) => void;
  search: string; onSearch: (s: string) => void;
  valueOnly: boolean; onValueOnly: () => void;
}) {
  return (
    <div className="top">
      <div>
        <h1>{sport} AI MATCH CENTRE</h1>
        <div className="sb">AI POWERED PREDICTIONS &amp; ANALYTICS</div>
      </div>
      <div className="ctl">
        <select value={sport} onChange={e => onSport(e.target.value)}>
          {sports.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select defaultValue="Round 15">
          <option>Round 15</option><option>Round 16</option><option>Round 17</option>
        </select>
        <select value={sort} onChange={e => onSort(e.target.value)}>
          <option value="time">Sort: Kick-off</option>
          <option value="edge">Sort: Best edge</option>
          <option value="conf">Sort: Confidence</option>
        </select>
        <div className="srchw">
          <svg viewBox="0 0 24 24"><circle cx={11} cy={11} r={7} /><path d="M20 20l-4-4" /></svg>
          <input className="srch" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search team…" autoComplete="off" />
        </div>
        <div className={'tg' + (valueOnly ? ' on' : '')} onClick={onValueOnly}>
          <span className="lb">VALUE ONLY</span><span className="sw"></span>
        </div>
        <div className="livep"><span className="dot"></span>LIVE · 30s</div>
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
                  <Crest primary={e.home_color} secondary={e.home_secondary_color} abbr={e.home_abbr} className="cr" />
                  <span className="ab">{e.home_abbr}</span>
                </div>
                <span className="vs">VS</span>
                <div className="sd r">
                  <Crest primary={e.away_color} secondary={e.away_secondary_color} abbr={e.away_abbr} className="cr" />
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
        `radial-gradient(120% 150% at 0% 50%, ${hd} 0%, #170a12 44%, transparent 64%),` +
        `radial-gradient(120% 150% at 100% 50%, ${ad} 0%, #120e24 44%, transparent 64%), #0a0f19`,
    }}>
      <div className="st">
        <Crest primary={hp} secondary={hd} abbr={home.abbr} />
        <div>
          <div className="city">{hn.city}</div>
          <div className="tn">{hn.short.toUpperCase()}</div>
          <div className="tmeta">{fakeLadder(home.abbr)} · <span className="mono">{fakeRecord(home.abbr)}</span></div>
          <div className="tf">
            {fakeForm(home.abbr).map((f, i) => <span key={i} className={'f ' + f.toLowerCase()}>{f}</span>)}
          </div>
        </div>
      </div>
      <div className="hmid">
        <div className="vn">{venueFor(md.event.sport)}</div>
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
        <Crest primary={ap} secondary={ad} abbr={away.abbr} />
        <div>
          <div className="city">{an.city}</div>
          <div className="tn">{an.short.toUpperCase()}</div>
          <div className="tmeta">{fakeLadder(away.abbr)} · <span className="mono">{fakeRecord(away.abbr)}</span></div>
          <div className="tf">
            {fakeForm(away.abbr).map((f, i) => <span key={i} className={'f ' + f.toLowerCase()}>{f}</span>)}
          </div>
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

  return (
    <div className="row r3g">
      {/* Win Probability */}
      <div className="p">
        <div className="ph"><span className="pt">AI Win Probability</span><span className="q">?</span></div>
        <div className="pb">
          <div className="wp">
            <div style={{ textAlign: 'center' }}>
              <div className="pc mono" style={{ color: hp }}>{pH}%</div>
              <div className="nm">{home.abbr}</div>
            </div>
            <svg width={46} height={46} viewBox="0 0 100 100">
              <circle cx={50} cy={50} r={38} stroke={hp} strokeWidth={13} fill="none" opacity={0.6} />
              <circle cx={50} cy={50} r={38} stroke={ap} strokeWidth={13} fill="none" strokeLinecap="round"
                      strokeDasharray={`${(pA * 2.388).toFixed(0)} 239`} transform="rotate(-90 50 50)" />
              <text x={50} y={57} textAnchor="middle" fontFamily="Inter" fontSize={22} fontWeight={800} fill="#e7eef8">{pA}%</text>
            </svg>
            <div style={{ textAlign: 'center' }}>
              <div className="pc mono" style={{ color: ap }}>{pA}%</div>
              <div className="nm">{away.abbr}</div>
            </div>
          </div>
          <div className="bar"><i style={{ width: `${pH}%`, background: hp }} /></div>
        </div>
      </div>

      {/* AI Line */}
      <div className="p">
        <div className="ph"><span className="pt">AI Line</span><span className="q">?</span></div>
        <div className="pb">
          <div className="lc">
            <Crest primary={hp} secondary={darken(hp)} abbr={home.abbr} className="mc" />
            <div className="v mono" style={{ color: hp }}>{sgn(mu)}</div>
            <div className="lb">AI LINE</div>
            <div className="v mono" style={{ color: ap }}>{sgn(-mu)}</div>
            <Crest primary={ap} secondary={darken(ap)} abbr={away.abbr} className="mc" />
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
        <div className="ph"><span className="pt">AI Total Points</span><span className="q">?</span></div>
        <div className="pb">
          <div className="tc">
            <div>
              <div className="big mono">{tot != null ? tot.toFixed(1) : '–'}</div>
              <div style={{ fontSize: 7, letterSpacing: '.1em', color: '#7b8ba3', fontWeight: 700 }}>OVER / UNDER</div>
            </div>
            <svg className="ch" viewBox="0 0 240 42" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="mck-gt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#25d97b" stopOpacity=".4" />
                  <stop offset="100%" stopColor="#25d97b" stopOpacity="0" />
                </linearGradient>
              </defs>
              {(() => {
                const base = tot ?? 40
                const pts = Array.from({ length: 13 }, (_, i) => base - 3 + (1 - Math.pow(1 - i / 12, 1.7)) * 3 + Math.sin(i * 1.9) * 0.35)
                const w = 240, h = 42, xL = 6, xR = 232, yT = 6, yB = 34
                const min = Math.min(...pts) - 0.5, max = Math.max(...pts) + 0.5
                const poly = pts.map((v, i) => {
                  const x = xL + (xR - xL) * i / (pts.length - 1)
                  const y = yB - (v - min) / (max - min) * (yB - yT)
                  return `${x.toFixed(1)},${y.toFixed(1)}`
                }).join(' ')
                const last = pts[pts.length - 1]
                const ly = yB - (last - min) / (max - min) * (yB - yT)
                return <>
                  <polyline points={poly} fill="none" stroke="#25d97b" strokeWidth={1.7} />
                  <circle cx={xR} cy={ly.toFixed(1) as unknown as number} r={2.6} fill="#25d97b" />
                </>
              })()}
            </svg>
          </div>
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
    return Array.from(all).slice(0, 6)
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
    <div className="foot"><span className="dot"></span>Prices update every 30 seconds</div>
  </>
}
function LineTable({ md, bkList, home, away }: { md: EventDetail; bkList: string[]; home: EventDetail['event']['home']; away: EventDetail['event']['away'] }) {
  const rows = md.markets?.spreads ?? []
  return <>
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
    <div className="note8">Every book priced <b>at its own line</b> — never averaged.</div>
  </>
}
function TotalTable({ md, bkList }: { md: EventDetail; bkList: string[] }) {
  const rows = md.markets?.totals ?? []
  return <>
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

  return (
    <div className="p" id="pMove">
      <div className="ph"><span className="pt">Win Probability Movement</span></div>
      <div className="legend">
        <span><i className="key" style={{ background: hp }} />{home.abbr}</span>
        <span><i className="key" style={{ background: ap }} />{away.abbr}</span>
      </div>
      <div className="pb">
        <svg className="ch" viewBox="0 0 360 340" preserveAspectRatio="none">
          <g stroke="#161f30" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke">
            {[0,1,2,3,4].map(i => { const y = 30 + i * 62.5; return <line key={i} x1={34} y1={y} x2={326} y2={y} /> })}
          </g>
          <g fontFamily="IBM Plex Mono" fontSize={16} fill="#7b8ba3" textAnchor="end" fontWeight={500}>
            {[0,1,2,3,4].map(i => { const y = 30 + i * 62.5; const v = Math.round(hi - (hi - lo) * i / 4); return <text key={i} x={30} y={y + 5}>{v}%</text> })}
          </g>
          <polyline points={poly(hS, 40, 318, 30, 280, lo, hi)} fill="none" stroke={hp} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <polyline points={poly(aS, 40, 318, 30, 280, lo, hi)} fill="none" stroke={ap} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {dotList(hS, 40, 318, 30, 280, lo, hi, hp)}
          {dotList(aS, 40, 318, 30, 280, lo, hi, ap)}
          <circle cx={318} cy={(280 - (hLast - lo) / (hi - lo || 1) * 250).toFixed(1) as unknown as number} r={5} fill={hp} />
          <circle cx={318} cy={(280 - (aLast - lo) / (hi - lo || 1) * 250).toFixed(1) as unknown as number} r={5} fill={ap} />
          <text x={352} y={(280 - (hLast - lo) / (hi - lo || 1) * 250 + 6).toFixed(1) as unknown as number} fontFamily="IBM Plex Mono" fontSize={18} fontWeight={800} fill={hp} textAnchor="end">{Math.round(hLast)}%</text>
          <text x={352} y={(280 - (aLast - lo) / (hi - lo || 1) * 250 + 6).toFixed(1) as unknown as number} fontFamily="IBM Plex Mono" fontSize={18} fontWeight={800} fill={ap} textAnchor="end">{Math.round(aLast)}%</text>
          <g fontFamily="IBM Plex Mono" fontSize={14} fill="#7b8ba3" textAnchor="middle" fontWeight={500}>
            <text x={40}  y={315}>-24h</text><text x={110} y={315}>-12h</text><text x={175} y={315}>-6h</text>
            <text x={240} y={315}>-3h</text><text x={285} y={315}>-1h</text><text x={318} y={315}>Now</text>
          </g>
        </svg>
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

  return (
    <div className="stk">
      <div className="p">
        <div className="ph"><span className="pt">Line Movement</span><span className="hv mono" style={{ color: ap }}>{sgn(mu)}</span></div>
        <div className="pb">
          <svg className="ch" viewBox="0 0 360 200" preserveAspectRatio="none">
            <g stroke="#161f30" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke">
              {[0,1,2,3].map(i => { const y = 18 + i * 47; return <line key={i} x1={38} y1={y} x2={326} y2={y} /> })}
            </g>
            <g fontFamily="IBM Plex Mono" fontSize={13} fill="#7b8ba3" textAnchor="end" fontWeight={500}>
              {[0,1,2,3].map(i => { const y = 18 + i * 47; const v = lhi - (lhi - llo) * i / 3; return <text key={i} x={34} y={y + 4}>{v.toFixed(1)}</text> })}
            </g>
            <polyline points={poly(lS, 42, 308, 18, 159, llo, lhi)} fill="none" stroke={ap} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {dotList(lS, 42, 308, 18, 159, llo, lhi, ap)}
            <circle cx={308} cy={(159 - (lLast - llo) / (lhi - llo || 1) * 141).toFixed(1) as unknown as number} r={4} fill={ap} />
            <g fontFamily="IBM Plex Mono" fontSize={12} fill="#7b8ba3" textAnchor="middle" fontWeight={500}>
              <text x={42} y={188}>-24h</text><text x={104} y={188}>-12h</text><text x={166} y={188}>-6h</text>
              <text x={228} y={188}>-3h</text><text x={278} y={188}>-1h</text><text x={310} y={188}>Now</text>
            </g>
          </svg>
        </div>
      </div>
      <div className="p">
        <div className="ph"><span className="pt">Total Points Movement</span><span className="hv mono" style={{ color: '#25d97b' }}>{tot.toFixed(1)}</span></div>
        <div className="pb">
          <svg className="ch" viewBox="0 0 360 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="mck-gt2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#25d97b" stopOpacity=".3" />
                <stop offset="100%" stopColor="#25d97b" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g stroke="#161f30" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke">
              {[0,1,2,3].map(i => { const y = 18 + i * 47; return <line key={i} x1={38} y1={y} x2={326} y2={y} /> })}
            </g>
            <g fontFamily="IBM Plex Mono" fontSize={13} fill="#7b8ba3" textAnchor="end" fontWeight={500}>
              {[0,1,2,3].map(i => { const y = 18 + i * 47; const v = thi - (thi - tlo) * i / 3; return <text key={i} x={34} y={y + 4}>{v.toFixed(1)}</text> })}
            </g>
            <polygon points={poly(tS, 42, 308, 18, 159, tlo, thi) + ' 308,163 42,163'} fill="url(#mck-gt2)" />
            <polyline points={poly(tS, 42, 308, 18, 159, tlo, thi)} fill="none" stroke="#25d97b" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {dotList(tS, 42, 308, 18, 159, tlo, thi, '#25d97b')}
            <circle cx={308} cy={(159 - (tLast - tlo) / (thi - tlo || 1) * 141).toFixed(1) as unknown as number} r={4} fill="#25d97b" />
            <g fontFamily="IBM Plex Mono" fontSize={12} fill="#7b8ba3" textAnchor="middle" fontWeight={500}>
              <text x={42} y={188}>-24h</text><text x={104} y={188}>-12h</text><text x={166} y={188}>-6h</text>
              <text x={228} y={188}>-3h</text><text x={278} y={188}>-1h</text><text x={310} y={188}>Now</text>
            </g>
          </svg>
        </div>
      </div>
    </div>
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

  const column = (side: 'h' | 'a') => {
    const t = side === 'h' ? home : away
    const p = side === 'h' ? hp : ap
    const d = side === 'h' ? hd : ad
    const ins = side === 'h' ? hIn : aIn
    const outs = side === 'h' ? hOut : aOut
    const adj = side === 'h' ? hAdj : aAdj
    const name = splitName(t.name)
    return (
      <div className="luc" style={{ background: `linear-gradient(150deg, ${d}, #0d1320 62%)` }}>
        <h4>{name.city} {name.short.toUpperCase()}</h4>
        {ins.length > 0 && (<><div className="io i">IN</div>
          {ins.map((pl, i) => <div key={i} className="pl"><b>✓</b>{pl.player_name ?? pl.player ?? 'Player'}</div>)}</>)}
        {outs.length > 0 && (<><div className="io o">OUT</div>
          {outs.map((pl, i) => <div key={i} className="pl x"><b>✗</b>{pl.player_name ?? pl.player ?? 'Player'} {pl.reason && <span style={{ color: '#55647a' }}>– {pl.reason}</span>}</div>)}</>)}
        {ins.length === 0 && outs.length === 0 && (
          <div className="pl" style={{ color: '#55647a' }}>Lineups not yet announced</div>
        )}
        <div className="imp">
          <div className="t">AI IMPACT</div>
          <p>{ins.length + outs.length > 0 ? 'Selected changes moderately affect model outputs.' : 'No confirmed changes; baseline projections used.'}</p>
          <div className="adj" style={{ color: adj >= 0 ? '#25d97b' : '#f4526a' }}>{t.abbr} win probability {adj >= 0 ? '+' : '−'}{Math.abs(adj)}%</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p" id="pNews">
      <div className="ph"><span className="pt">Team News &amp; Lineups</span><span className="q">?</span></div>
      <div className="pb">
        <div className="lu">{column('h')}{column('a')}</div>
        <div className="wnote">
          <div className="ic">{wIcon}</div>
          <div><div className="tt">WEATHER IMPACT</div><p>{wText}</p></div>
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
    <div className="stk">
      <div className="p">
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
      <div className="p">
        <div className="ph"><span className="pt">Recent Form</span></div>
        <div className="pb">
          <div className="fg">
            {(['home', 'away'] as const).map(k => {
              const t = k === 'home' ? home : away
              const col = k === 'home' ? hp : ap
              const form = fakeForm(t.abbr)
              const pts = form.filter(f => f === 'W').length * 2
              return (
                <div key={k} className="fgc">
                  <h5 style={{ color: col }}>{t.abbr} ({fakeLadder(t.abbr)})</h5>
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
    </div>
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
  const [sort, setSort] = useState('time')
  const [search, setSearch] = useState('')
  const [valueOnly, setValueOnly] = useState(false)
  const [activeSection, setActiveSection] = useState('strip')

  const availableSports = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) if (e.sport_title) set.add(e.sport_title)
    const list = Array.from(set)
    return ['ALL', ...list]
  }, [events])

  // Auto-pick first fixture that matches current sport filter
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!events.length) return
    const match = (sport === 'ALL' ? events : events.filter(e => (e.sport_title || '').toUpperCase() === sport))[0]
    if (match && (!selectedId || !events.find(e => e.id === selectedId))) setSelectedId(match.id)
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

  return (
    <>
      <style>{CSS}</style>
      <div className="mck-root">
        <Sidebar activeSection={activeSection} onNavigate={setActiveSection} roundConf={roundConf} />
        <main>
          <TopBar
            sport={sport}
            sports={availableSports}
            onSport={setSport}
            sort={sort}
            onSort={setSort}
            search={search}
            onSearch={setSearch}
            valueOnly={valueOnly}
            onValueOnly={() => setValueOnly(v => !v)}
          />
          <FixturesStrip
            events={events}
            selectedId={selectedId}
            onSelect={setSelectedId}
            filter={{ search, valueOnly, sort, sport }}
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
              <div className="row rm">
                <OddsComparison md={detail} />
                <WinProbMovement md={detail} />
                <LineTotalStack md={detail} />
              </div>
              <div className="row rm">
                <TeamNews md={detail} />
                <H2HFormStack md={detail} />
                <ValueList md={detail} />
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
