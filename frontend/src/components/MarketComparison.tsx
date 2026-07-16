import React, { useState, useRef, useEffect } from 'react'
import { getBookColor } from '../lib/colors'
import { fmtEdge, fmtPrice, fmtPoint } from '../lib/format'

type MarketTab = 'h2h' | 'spreads' | 'totals'

interface MarketRow {
  bookmaker: string
  outcome: string
  price: number
  point: number | null
  fair_price: number | null
  edge_pct: number | null
  is_best: boolean
}

interface EventInfo {
  home: { name: string; abbr: string; primary_color?: string }
  away: { name: string; abbr: string; primary_color?: string }
}

interface MarketComparisonProps {
  event: EventInfo | null
  h2hMarkets: MarketRow[]
  spreadMarkets: MarketRow[]
  totalMarkets: MarketRow[]
  fairHomePrice?: number | null
  fairAwayPrice?: number | null
  flashEventId?: string | null
  loading?: boolean
}

// Collect unique bookmakers from all rows
function getBookmakers(rows: MarketRow[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const r of rows) {
    if (!seen.has(r.bookmaker)) {
      seen.add(r.bookmaker)
      result.push(r.bookmaker)
    }
  }
  return result
}

function BookmakerCell({ bookmaker }: { bookmaker: string }) {
  const bc = getBookColor(bookmaker)
  return (
    <td style={{
      padding: '9px 12px 9px 14px', textAlign: 'left', whiteSpace: 'nowrap',
      position: 'sticky', left: 0, background: 'var(--panel)', zIndex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500 }}>
        <span style={{
          width: 17, height: 17, borderRadius: 5, display: 'grid',
          placeItems: 'center', fontSize: 7, fontWeight: 800,
          color: bc.text, background: bc.bg, flexShrink: 0,
        }}>{bc.abbr}</span>
        {bookmaker}
      </div>
    </td>
  )
}

function EdgeCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-3)' }}>–</td>
  }
  const isPos = value >= 0
  return (
    <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: isPos ? 'var(--green)' : 'var(--red)' }}>
        {fmtEdge(value)}
      </span>
    </td>
  )
}

function PriceCell({
  value, flash,
}: {
  value: number | null
  flash?: 'up' | 'dn' | null
}) {
  const ref = useRef<HTMLTableCellElement>(null)
  const prevFlash = useRef<string | null>(null)

  useEffect(() => {
    if (flash && flash !== prevFlash.current && ref.current) {
      ref.current.classList.remove('flash-up', 'flash-dn')
      void ref.current.offsetWidth // reflow
      ref.current.classList.add(flash === 'up' ? 'flash-up' : 'flash-dn')
      prevFlash.current = flash
    }
  }, [flash])

  return (
    <td ref={ref} style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12.5, transition: 'background 0.4s' }}>
      {value != null ? fmtPrice(value) : '–'}
    </td>
  )
}

// Track previous prices to determine flash direction
function useFlashKey(key: string | null | undefined) {
  const prevKey = useRef<string | null | undefined>(null)
  const [flashKey, setFlashKey] = useState<string | null>(null)

  useEffect(() => {
    if (key !== prevKey.current) {
      prevKey.current = key
      if (key) {
        setFlashKey(key)
        const t = setTimeout(() => setFlashKey(null), 1100)
        return () => clearTimeout(t)
      }
    }
  }, [key])

  return flashKey
}

export default function MarketComparison({
  event,
  h2hMarkets,
  spreadMarkets,
  totalMarkets,
  fairHomePrice,
  fairAwayPrice,
  flashEventId,
  loading,
}: MarketComparisonProps) {
  const [tab, setTab] = useState<MarketTab>('h2h')
  const activeFlash = useFlashKey(flashEventId)

  const homeTeam = event?.home?.name ?? 'Home'
  const awayTeam = event?.away?.name ?? 'Away'
  const homeAbbr = event?.home?.abbr ?? 'HME'
  const awayAbbr = event?.away?.abbr ?? 'AWY'

  const TABS: { key: MarketTab; label: string }[] = [
    { key: 'h2h', label: 'Head to Head' },
    { key: 'spreads', label: 'Line' },
    { key: 'totals', label: 'Totals' },
  ]

  const currentTab = TABS.find(t => t.key === tab)!

  // ── H2H TAB ──────────────────────────────────────────────────────────
  function renderH2H() {
    const books = getBookmakers(h2hMarkets)

    // Build per-book lookup
    const homeByBook = new Map<string, MarketRow>()
    const awayByBook = new Map<string, MarketRow>()
    for (const r of h2hMarkets) {
      if (r.outcome === event?.home?.name || r.outcome?.includes(homeAbbr)) homeByBook.set(r.bookmaker, r)
      else awayByBook.set(r.bookmaker, r)
    }
    // Fallback: split by home/away position
    if (homeByBook.size === 0 && h2hMarkets.length > 0) {
      const booksArr = Array.from(new Set(h2hMarkets.map(r => r.bookmaker)))
      for (const bk of booksArr) {
        const rows = h2hMarkets.filter(r => r.bookmaker === bk)
        if (rows[0]) homeByBook.set(bk, rows[0])
        if (rows[1]) awayByBook.set(bk, rows[1])
      }
    }

    const allBooks = books.length > 0 ? books : (homeByBook.size > 0 ? Array.from(homeByBook.keys()) : [])

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 14, position: 'sticky', left: 0, background: 'var(--panel-2)', zIndex: 2 }}>Bookmaker</th>
            <th style={thStyle}>{homeAbbr} Price</th>
            <th style={thStyle}>Edge</th>
            <th style={thStyle}>{awayAbbr} Price</th>
            <th style={thStyle}>Edge</th>
            <th style={thStyle}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {/* AI Fair Price row */}
          {(fairHomePrice != null || fairAwayPrice != null) && (
            <tr style={{ background: 'var(--blue-dim)' }}>
              <td style={{ ...tdStyle, paddingLeft: 14, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--blue-dim)', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 17, height: 17, borderRadius: 5, background: 'var(--blue)', display: 'grid', placeItems: 'center', fontSize: 7, fontWeight: 800, color: '#fff' }}>AI</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue-2)' }}>AI Fair Price</span>
                </div>
              </td>
              <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--blue-2)' }}>{fairHomePrice != null ? fmtPrice(fairHomePrice) : '–'}</td>
              <td style={tdStyle}><span style={{ color: 'var(--text-3)' }}>–</span></td>
              <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--blue-2)' }}>{fairAwayPrice != null ? fmtPrice(fairAwayPrice) : '–'}</td>
              <td style={tdStyle}><span style={{ color: 'var(--text-3)' }}>–</span></td>
              <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-3)' }}>–</td>
            </tr>
          )}

          {allBooks.length === 0 ? (
            <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)', paddingLeft: 14 }}>
              {loading ? 'Loading markets…' : 'No head-to-head markets available'}
            </td></tr>
          ) : (
            allBooks.map((bk, i) => {
              const h = homeByBook.get(bk)
              const a = awayByBook.get(bk)
              return (
                <tr key={bk} style={{ borderBottom: i < allBooks.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <BookmakerCell bookmaker={bk} />
                  <PriceCell value={h?.price ?? null} flash={activeFlash ? 'up' : null} />
                  <EdgeCell value={h?.edge_pct ?? null} />
                  <PriceCell value={a?.price ?? null} flash={activeFlash ? 'up' : null} />
                  <EdgeCell value={a?.edge_pct ?? null} />
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-3)' }}>–</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    )
  }

  // ── LINE/SPREADS TAB (REQ-8) ──────────────────────────────────────────
  // Each bookmaker keeps ITS OWN line (point). TAB shows -4.5, Betfair shows -5.5.
  // fair_price from API already encodes the fair price at THAT book's own line.
  function renderSpreads() {
    // Group by bookmaker, then split home vs away outcomes
    const bookMap = new Map<string, { home: MarketRow | null; away: MarketRow | null }>()
    for (const r of spreadMarkets) {
      if (!bookMap.has(r.bookmaker)) bookMap.set(r.bookmaker, { home: null, away: null })
      const entry = bookMap.get(r.bookmaker)!
      // Identify home/away by outcome name or by sign convention
      const isHome = r.outcome === event?.home?.name
        || r.outcome?.includes(homeAbbr)
        || (r.point != null && r.point <= 0)  // negative handicap = favourite = home by convention
      if (isHome && !entry.home) entry.home = r
      else if (!isHome && !entry.away) entry.away = r
    }

    // Deduplicate: if both ended up in same slot, split by order
    for (const r of spreadMarkets) {
      const entry = bookMap.get(r.bookmaker)!
      if (!entry.home) entry.home = r
      else if (!entry.away && entry.home !== r) entry.away = r
    }

    const books = Array.from(bookMap.keys())

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 14, position: 'sticky', left: 0, background: 'var(--panel-2)', zIndex: 2 }}>Bookmaker</th>
            <th style={thStyle}>Line ({homeAbbr})</th>
            <th style={thStyle}>{homeAbbr} Price</th>
            <th style={thStyle}>Edge</th>
            <th style={thStyle}>Line ({awayAbbr})</th>
            <th style={thStyle}>{awayAbbr} Price</th>
            <th style={thStyle}>Edge</th>
            <th style={thStyle}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {/* AI Fair Price row — present in all three tabs */}
          {(fairHomePrice != null || fairAwayPrice != null) && (
            <tr style={{ background: 'var(--blue-dim)' }}>
              <td style={{ ...tdStyle, paddingLeft: 14, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--blue-dim)', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 17, height: 17, borderRadius: 5, background: 'var(--blue)', display: 'grid', placeItems: 'center', fontSize: 7, fontWeight: 800, color: '#fff' }}>AI</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue-2)' }}>AI Fair Price</span>
                </div>
              </td>
              <td style={{ ...tdStyle, color: 'var(--text-3)' }}>–</td>
              <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--blue-2)' }}>{fairHomePrice != null ? fmtPrice(fairHomePrice) : '–'}</td>
              <td style={tdStyle}><span style={{ color: 'var(--text-3)' }}>–</span></td>
              <td style={{ ...tdStyle, color: 'var(--text-3)' }}>–</td>
              <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--blue-2)' }}>{fairAwayPrice != null ? fmtPrice(fairAwayPrice) : '–'}</td>
              <td style={tdStyle}><span style={{ color: 'var(--text-3)' }}>–</span></td>
              <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-3)' }}>–</td>
            </tr>
          )}

          {books.length === 0 ? (
            <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)', paddingLeft: 14 }}>
              {loading ? 'Loading markets…' : 'No spread markets available'}
            </td></tr>
          ) : (
            books.map((bk, i) => {
              const { home: h, away: a } = bookMap.get(bk)!
              // Each bookmaker shows ITS OWN point from the API
              const homePoint = h?.point ?? null
              // Away line is the mirror (positive of home's negative)
              const awayPoint = a?.point ?? (homePoint != null ? -homePoint : null)
              return (
                <tr key={bk} style={{ borderBottom: i < books.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <BookmakerCell bookmaker={bk} />
                  {/* HOME LINE — this book's own point */}
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtPoint(homePoint)}</td>
                  <PriceCell value={h?.price ?? null} />
                  <EdgeCell value={h?.edge_pct ?? null} />
                  {/* AWAY LINE — this book's own away point */}
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtPoint(awayPoint)}</td>
                  <PriceCell value={a?.price ?? null} />
                  <EdgeCell value={a?.edge_pct ?? null} />
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-3)' }}>–</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    )
  }

  // ── TOTALS TAB ───────────────────────────────────────────────────────
  function renderTotals() {
    // Group by bookmaker, separate Over vs Under
    const bookMap = new Map<string, { over: MarketRow | null; under: MarketRow | null }>()
    for (const r of totalMarkets) {
      if (!bookMap.has(r.bookmaker)) bookMap.set(r.bookmaker, { over: null, under: null })
      const entry = bookMap.get(r.bookmaker)!
      if (r.outcome === 'Over' || r.outcome?.toLowerCase() === 'over') entry.over = r
      else entry.under = r
    }

    const books = Array.from(bookMap.keys())

    // Best totals point for fair price AI row
    const bestOverTotal = totalMarkets.find(r => r.outcome === 'Over' && r.is_best)?.point
      ?? totalMarkets.find(r => r.outcome === 'Over')?.point

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 14, position: 'sticky', left: 0, background: 'var(--panel-2)', zIndex: 2 }}>Bookmaker</th>
            <th style={thStyle}>Total</th>
            <th style={thStyle}>Over</th>
            <th style={thStyle}>Edge</th>
            <th style={thStyle}>Under</th>
            <th style={thStyle}>Edge</th>
            <th style={thStyle}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {/* AI Fair Price row — present in all three tabs */}
          {(fairHomePrice != null || fairAwayPrice != null) && (
            <tr style={{ background: 'var(--blue-dim)' }}>
              <td style={{ ...tdStyle, paddingLeft: 14, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--blue-dim)', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 17, height: 17, borderRadius: 5, background: 'var(--blue)', display: 'grid', placeItems: 'center', fontSize: 7, fontWeight: 800, color: '#fff' }}>AI</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue-2)' }}>AI Fair Price</span>
                </div>
              </td>
              <td style={{ ...tdStyle, color: 'var(--text-3)' }}>{bestOverTotal ?? '–'}</td>
              <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--blue-2)' }}>–</td>
              <td style={tdStyle}><span style={{ color: 'var(--text-3)' }}>–</span></td>
              <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--blue-2)' }}>–</td>
              <td style={tdStyle}><span style={{ color: 'var(--text-3)' }}>–</span></td>
              <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-3)' }}>–</td>
            </tr>
          )}

          {books.length === 0 ? (
            <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)', paddingLeft: 14 }}>
              {loading ? 'Loading markets…' : 'No totals markets available'}
            </td></tr>
          ) : (
            books.map((bk, i) => {
              const { over, under } = bookMap.get(bk)!
              // Each bookmaker's OWN total line
              const totalPoint = over?.point ?? under?.point ?? null
              return (
                <tr key={bk} style={{ borderBottom: i < books.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <BookmakerCell bookmaker={bk} />
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{totalPoint ?? '–'}</td>
                  <PriceCell value={over?.price ?? null} />
                  <EdgeCell value={over?.edge_pct ?? null} />
                  <PriceCell value={under?.price ?? null} />
                  <EdgeCell value={under?.edge_pct ?? null} />
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-3)' }}>–</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    )
  }

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>
          Bookmaker Comparison — <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>{currentTab.label}</span>
        </span>
        {event && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{homeTeam}</span>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 20,
              background: 'var(--raise)', border: '1px solid var(--line)',
              borderRadius: 7, padding: '5px 10px', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer',
            }}>
              vs {awayTeam}
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </>
        )}
        {/* Market tab switcher */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                padding: '6px 11px', borderRadius: 7,
                background: tab === t.key ? 'var(--blue)' : 'var(--raise)',
                border: `1px solid ${tab === t.key ? 'var(--blue)' : 'var(--line)'}`,
                color: tab === t.key ? '#fff' : 'var(--text)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table — fade-right signals horizontal scroll on mobile */}
      <div style={{ position: 'relative' }}>
        <div className="tbl-scroll" style={{ overflowX: 'auto' }}>
          {tab === 'h2h' && renderH2H()}
          {tab === 'spreads' && renderSpreads()}
          {tab === 'totals' && renderTotals()}
        </div>
        {/* Right-edge fade — visible on mobile when table overflows */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 32,
          background: 'linear-gradient(to right, transparent, var(--panel))',
          pointerEvents: 'none',
          borderRadius: '0 0 var(--r) 0',
        }} />
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--text-3)', fontWeight: 600,
  textAlign: 'right', padding: '9px 12px',
  borderBottom: '1px solid var(--line)',
  borderTop: '1px solid var(--line)',
  background: 'var(--panel-2)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '9px 12px',
  textAlign: 'right',
  fontSize: 12.5,
  whiteSpace: 'nowrap',
  transition: 'background 0.4s',
}
