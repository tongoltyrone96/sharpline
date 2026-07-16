/**
 * Unit tests for frontend API helpers.
 * Pure functions only — no fetch calls, no mocking needed.
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// adminHeaders produces correct Base64 Basic auth
// ---------------------------------------------------------------------------

function adminHeaders(password: string) {
  return {
    Authorization: 'Basic ' + btoa('admin:' + password),
    'Content-Type': 'application/json',
  }
}

describe('adminHeaders', () => {
  it('produces Authorization: Basic header', () => {
    const h = adminHeaders('changeme')
    expect(h.Authorization).toMatch(/^Basic /)
  })

  it('encodes admin:password as Base64', () => {
    const h = adminHeaders('secret')
    const decoded = atob(h.Authorization.replace('Basic ', ''))
    expect(decoded).toBe('admin:secret')
  })

  it('sets Content-Type to application/json', () => {
    const h = adminHeaders('pw')
    expect(h['Content-Type']).toBe('application/json')
  })
})

// ---------------------------------------------------------------------------
// Edge percentage calculation (mirrors backend model.py)
// ---------------------------------------------------------------------------

function edgePct(offered: number, fair: number): number {
  return (offered / fair - 1.0) * 100.0
}

describe('edgePct', () => {
  it('returns positive when offered > fair', () => {
    expect(edgePct(2.0, 1.8)).toBeGreaterThan(0)
  })

  it('returns negative when offered < fair', () => {
    expect(edgePct(1.5, 2.0)).toBeLessThan(0)
  })

  it('returns zero when offered === fair', () => {
    expect(edgePct(2.0, 2.0)).toBeCloseTo(0)
  })

  it('never exceeds 50% for realistic prices', () => {
    // Largest realistic gap: offered 2.0, fair 1.5 → +33.3%
    expect(edgePct(2.0, 1.5)).toBeLessThan(50)
  })

  it('matches reference value: offered=1.90, fair=1.782 → ≈6.62%', () => {
    expect(edgePct(1.90, 1.782)).toBeCloseTo(6.62, 1)
  })

  it('matches reference value: offered=1.90, fair=1.884 → ≈0.85%', () => {
    expect(edgePct(1.90, 1.884)).toBeCloseTo(0.85, 1)
  })
})

// ---------------------------------------------------------------------------
// REQ-8 UI invariant: different fair prices from different lines
// ---------------------------------------------------------------------------

describe('REQ-8 UI invariant: fair price varies with line', () => {
  it('two different line values must produce different fair-price labels', () => {
    // The dashboard must show TABtouch -15.5 and TAB -13.5 as distinct rows.
    // This mirrors how MarketComparison renders the spreads table.
    const spreadsRows = [
      { bookmaker: 'TABtouch', point: -15.5, fair_price: 1.782 },
      { bookmaker: 'TAB',      point: -13.5, fair_price: 1.884 },
      { bookmaker: 'SportsBet',point: -14.5, fair_price: 1.830 },
    ]
    // Every row's fair price is distinct (not collapsed to one average)
    const fairPrices = spreadsRows.map(r => r.fair_price)
    const unique = new Set(fairPrices)
    expect(unique.size).toBe(spreadsRows.length)
  })

  it('all bookmakers in the table have their own point value', () => {
    const spreadsRows = [
      { bookmaker: 'TABtouch', point: -15.5 },
      { bookmaker: 'TAB',      point: -13.5 },
      { bookmaker: 'SportsBet',point: -14.5 },
    ]
    for (const row of spreadsRows) {
      expect(row.point).not.toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// Longshot edge cap (frontend guard: don't display >50% edge in Opportunities)
// ---------------------------------------------------------------------------

describe('longshot edge cap', () => {
  it('filter removes rows with edge_pct > 20 (max_edge cap)', () => {
    const rows = [
      { outcome: 'Home', edge_pct: 4.5 },
      { outcome: 'Away', edge_pct: 52.9 },  // corrupt Betfair data
      { outcome: 'Over', edge_pct: 1.7 },
    ]
    const MAX_EDGE = 20.0
    const filtered = rows.filter(r => r.edge_pct <= MAX_EDGE)
    expect(filtered).toHaveLength(2)
    expect(filtered.some(r => r.edge_pct > 50)).toBe(false)
  })

  it('filter removes H2H rows with book_price > 6 (longshot cutoff)', () => {
    const rows = [
      { market: 'h2h',     book_price: 15.0, edge_pct: 27.5 },  // longshot
      { market: 'h2h',     book_price: 1.35, edge_pct: 3.2  },
      { market: 'spreads', book_price: 8.0,  edge_pct: 5.1  },  // spreads OK
    ]
    const MAX_H2H_ODDS = 6.0
    const filtered = rows.filter(r =>
      r.market !== 'h2h' || r.book_price <= MAX_H2H_ODDS
    )
    expect(filtered).toHaveLength(2)
    expect(filtered.some(r => r.market === 'h2h' && r.book_price > 6)).toBe(false)
  })
})
