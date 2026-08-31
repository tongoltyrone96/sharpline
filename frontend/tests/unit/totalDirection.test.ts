/**
 * OVER / UNDER directional call.
 *
 * The old implementation fell back to `net = 0.01` whenever every term
 * cancelled, so a third of live fixtures showed "AI OVER" as a constant.
 * These tests pin the replacement: a real signal, or no call at all.
 */

import { describe, it, expect } from 'vitest'
import { totalDirection, totalsEdges, weatherLean, TotalDirectionInput } from '../../src/lib/totalDirection'

const base = (o: Partial<TotalDirectionInput> = {}): TotalDirectionInput => ({
  projectedTotal: 48.5,
  bookLine: 48.5,
  overEdge: null,
  underEdge: null,
  weather: null,
  ...o,
})

describe('no invented direction', () => {
  it('returns no call when every signal cancels', () => {
    const r = totalDirection(base({ overEdge: -5, underEdge: -5 }))
    expect(r.side).toBeNull()
    expect(r.factors).toEqual([])
  })

  it('returns no call when there is no totals market and no weather', () => {
    expect(totalDirection(base()).side).toBeNull()
  })
})

describe('edge lean drives the call', () => {
  it('calls OVER when the over side is better priced', () => {
    const r = totalDirection(base({ overEdge: 3.58, underEdge: 0.70 }))
    expect(r.side).toBe('OVER')
    expect(r.factors[0]).toContain('over better priced')
  })

  it('calls UNDER when the under side is better priced', () => {
    const r = totalDirection(base({ overEdge: -4.67, underEdge: -3.66 }))
    expect(r.side).toBe('UNDER')
  })

  it('outweighs weather pointing the other way', () => {
    // clear sky is +0.4 towards OVER; a 2-point edge lean to UNDER must win
    const r = totalDirection(base({
      overEdge: -4, underEdge: -2,
      weather: { wind_kmh: 5, rain_prob: 0, condition: 'clear sky' },
    }))
    expect(r.side).toBe('UNDER')
  })

  it('never lists a factor that contradicts the call', () => {
    const r = totalDirection(base({
      overEdge: -4, underEdge: -2,
      weather: { wind_kmh: 5, rain_prob: 0, condition: 'clear sky' },
    }))
    expect(r.side).toBe('UNDER')
    expect(r.factors.join(' ')).not.toContain('clear sky')
  })
})

describe('weather as tiebreaker only', () => {
  it('decides an otherwise dead heat', () => {
    const r = totalDirection(base({
      overEdge: -5, underEdge: -5,
      weather: { wind_kmh: 30, rain_prob: 0.6, condition: 'rain' },
    }))
    expect(r.side).toBe('UNDER')
    expect(r.factors).toContain('rain, strong wind')
  })

  it('reads rain_prob as a 0..1 fraction, not a percentage', () => {
    expect(weatherLean({ wind_kmh: 5, rain_prob: 0.4, condition: 'cloudy' }).score).toBeLessThan(0)
    expect(weatherLean({ wind_kmh: 5, rain_prob: 0.1, condition: 'cloudy' }).score).toBe(0)
  })
})

describe('projection gap', () => {
  it('is ignored when the projection equals the line, as it does in production', () => {
    expect(totalDirection(base({ projectedTotal: 48.5, bookLine: 48.5 })).side).toBeNull()
  })

  it('still counts if the model ever gains an independent projection', () => {
    const r = totalDirection(base({ projectedTotal: 54, bookLine: 48.5 }))
    expect(r.side).toBe('OVER')
    expect(r.factors[0]).toContain('model above line')
  })
})

describe('totalsEdges', () => {
  it('takes the best edge on each side and ignores null rows', () => {
    const e = totalsEdges([
      { outcome: 'Over',  edge_pct: 1.2 },
      { outcome: 'Over',  edge_pct: 3.6 },
      { outcome: 'Under', edge_pct: null },
      { outcome: 'Under', edge_pct: -2.0 },
    ])
    expect(e.overEdge).toBe(3.6)
    expect(e.underEdge).toBe(-2.0)
  })

  it('returns nulls when the market is absent', () => {
    expect(totalsEdges([])).toEqual({ overEdge: null, underEdge: null })
  })
})
