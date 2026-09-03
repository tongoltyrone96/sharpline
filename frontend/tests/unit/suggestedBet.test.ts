/**
 * Suggested-bet gate.
 *
 * The client's requirement: only surface a bet when the difference is big.
 * A 45%-55% coin flip must produce NO suggestion at all.
 */

import { describe, it, expect } from 'vitest'
import {
  suggestedBet,
  SuggestInput,
  SuggestRow,
  MIN_DECISIVENESS,
  hasRealEdge,
} from '../../src/lib/suggestedBet'

const HOME = 'Penrith Panthers'
const AWAY = 'Sydney Roosters'

function input(over: Partial<SuggestInput> = {}): SuggestInput {
  return {
    homeName: HOME,
    awayName: AWAY,
    homeWinProb: 0.7,
    awayWinProb: 0.3,
    h2h: [],
    spreads: [],
    totals: [],
    ...over,
  }
}

const row = (o: Partial<SuggestRow> = {}): SuggestRow => ({
  bookmaker: 'Sportsbet',
  outcome: HOME,
  price: 1.9,
  point: null,
  edge_pct: 3.0,
  ...o,
})

// ---------------------------------------------------------------------------
// Game-level gate — the client's "45% to 55%"
// ---------------------------------------------------------------------------

describe('coin-flip suppression', () => {
  it('gives no suggestion on an exact 50/50', () => {
    const r = suggestedBet(input({ homeWinProb: 0.5, awayWinProb: 0.5, h2h: [row()] }))
    expect(r).toBeNull()
  })

  it('gives no suggestion anywhere in the 45%-55% band, however good the price', () => {
    for (const p of [0.45, 0.47, 0.5, 0.53, 0.55]) {
      const r = suggestedBet(
        input({ homeWinProb: p, awayWinProb: 1 - p, h2h: [row({ edge_pct: 9.9 })] }),
      )
      expect(r, `home_win_prob=${p}`).toBeNull()
    }
  })

  it('still suppresses just inside the 42%-58% band', () => {
    const r = suggestedBet(input({ homeWinProb: 0.57, awayWinProb: 0.43, h2h: [row()] }))
    expect(r).toBeNull()
  })

  it('allows a suggestion once the game clears the band', () => {
    const p = 0.5 + MIN_DECISIVENESS
    const r = suggestedBet(input({ homeWinProb: p, awayWinProb: 1 - p, h2h: [row()] }))
    expect(r).not.toBeNull()
  })

  it('treats a lopsided away favourite the same as a home one', () => {
    const r = suggestedBet(input({ homeWinProb: 0.24, awayWinProb: 0.76, h2h: [row()] }))
    expect(r).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Edge bounds
// ---------------------------------------------------------------------------

describe('edge bounds', () => {
  it('rejects a decisive game whose best edge is under 2%', () => {
    const r = suggestedBet(input({ h2h: [row({ edge_pct: 1.4 })] }))
    expect(r).toBeNull()
  })

  it('rejects a negative edge', () => {
    const r = suggestedBet(input({ h2h: [row({ edge_pct: -5.3 })] }))
    expect(r).toBeNull()
  })

  it('rejects an implausible 20%+ edge as stale feed data', () => {
    const r = suggestedBet(input({ h2h: [row({ edge_pct: 24 })] }))
    expect(r).toBeNull()
  })

  it('accepts exactly at the 2% boundary', () => {
    const r = suggestedBet(input({ h2h: [row({ edge_pct: 2.0 })] }))
    expect(r).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Value lands on the underdog — measured 6/6 on live data, so it must pass
// ---------------------------------------------------------------------------

describe('underdog value', () => {
  it('suggests the underdog when that is where the price is', () => {
    // Model: home 68% / away 32%. Decisive game, value on the away dog.
    const r = suggestedBet(
      input({
        homeWinProb: 0.68,
        awayWinProb: 0.32,
        h2h: [
          row({ outcome: HOME, price: 1.35, edge_pct: -1.2 }),
          row({ outcome: AWAY, price: 3.55, edge_pct: 12.1 }),
        ],
      }),
    )
    expect(r).not.toBeNull()
    expect(r!.text).toContain(AWAY)
    expect(r!.edge).toBeCloseTo(12.1)
  })
})

// ---------------------------------------------------------------------------
// Market coverage and selection
// ---------------------------------------------------------------------------

describe('market coverage', () => {
  it('labels a win bet', () => {
    const r = suggestedBet(input({ h2h: [row()] }))
    expect(r!.mkt).toBe('WIN')
  })

  it('labels a line bet and keeps the signed point', () => {
    const r = suggestedBet(input({ spreads: [row({ point: -4.5 })] }))
    expect(r!.mkt).toBe('LINE')
    expect(r!.text).toContain('−4.5')
  })

  it('labels a totals bet', () => {
    const r = suggestedBet(input({ totals: [row({ outcome: 'Over', point: 47.5 })] }))
    expect(r!.mkt).toBe('OVER/UNDER')
    expect(r!.text).toContain('Over 47.5')
  })

  it('skips spread and totals rows with no point', () => {
    const r = suggestedBet(input({
      spreads: [row({ point: null })],
      totals: [row({ outcome: 'Over', point: null })],
    }))
    expect(r).toBeNull()
  })
})

describe('selection', () => {
  it('returns exactly one suggestion, the highest edge across all markets', () => {
    const r = suggestedBet(input({
      h2h:     [row({ edge_pct: 2.5 })],
      spreads: [row({ point: -4.5, edge_pct: 6.1 })],
      totals:  [row({ outcome: 'Over', point: 47.5, edge_pct: 4.0 })],
    }))
    expect(r!.mkt).toBe('LINE')
    expect(r!.edge).toBe(6.1)
  })

  it('returns null when rows are present but none clear the gate', () => {
    const r = suggestedBet(input({
      h2h:     [row({ edge_pct: 0.4 })],
      spreads: [row({ point: -4.5, edge_pct: -2 })],
      totals:  [row({ outcome: 'Over', point: 47.5, edge_pct: 1.1 })],
    }))
    expect(r).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Gate overrides
// ---------------------------------------------------------------------------

describe('gate overrides', () => {
  it('honours a tighter decisiveness band', () => {
    const i = input({ homeWinProb: 0.6, awayWinProb: 0.4, h2h: [row()] })
    expect(suggestedBet(i)).not.toBeNull()
    expect(suggestedBet(i, { minDecisiveness: 0.15 })).toBeNull()
  })

  it('honours a higher minimum edge', () => {
    const i = input({ h2h: [row({ edge_pct: 3.0 })] })
    expect(suggestedBet(i)).not.toBeNull()
    expect(suggestedBet(i, { minEdgePct: 5 })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// hasRealEdge — shared by the panels and the odds tables' AI PICK column
// ---------------------------------------------------------------------------

describe('hasRealEdge', () => {
  it('rejects the noise the odds tables used to badge as an AI PICK', () => {
    for (const e of [null, undefined, -3, 0, 0.1, 1.9]) {
      expect(hasRealEdge(e as number | null), `edge=${e}`).toBe(false)
    }
  })

  it('accepts a real edge and rejects a stale-feed one', () => {
    expect(hasRealEdge(2.0)).toBe(true)
    expect(hasRealEdge(12.1)).toBe(true)
    expect(hasRealEdge(20)).toBe(false)
    expect(hasRealEdge(29.2)).toBe(false)
  })
})
