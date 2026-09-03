/**
 * Suggested bet — the single actionable call shown in the bottom bar.
 *
 * A suggestion only appears when the GAME is decisively one-sided and the
 * price carries a real edge. Near coin-flip games (the client's "45% to 55%")
 * produce no suggestion at all; the bar says so rather than forcing a pick.
 * One suggestion per game: the highest-edge row that clears the gate, across
 * H2H / spreads / totals.
 *
 * The strip at the top of the dashboard stays purely informational — it still
 * shows a directional OVER/UNDER call on every game. Only this bottom-bar
 * suggestion goes quiet when the signal is weak.
 *
 * ── Why the gate is shaped this way ──────────────────────────────────────────
 * Two designs were measured against live production data first, and both are
 * unsatisfiable with this model:
 *
 *   1. "model projection vs book line" gap. Rejected: project_margin() and
 *      project_total() are weighted means of the books' own points, so the
 *      projection EQUALS the market line. Measured over 12 live fixtures the
 *      difference was 0.00 on every one. There is no independent projection to
 *      compare against, so any gap threshold gates on floating-point noise.
 *
 *   2. "value on a side the model rates >= 58% to win". Rejected: de-vig prices
 *      the favourite tightly, so positive edge lands on the underdog. Measured
 *      over the same fixtures it was on the underdog 6 times out of 6, never on
 *      the favourite. Requiring both at once yields no suggestions at all.
 *
 * What remains, and is genuinely informative, is the edge itself — the book's
 * price against the de-vigged consensus fair price. The client's "45% to 55%"
 * is therefore applied where he meant it: at the GAME level, suppressing
 * suggestions on coin-flip fixtures, not at the level of the individual side.
 */

export const MIN_EDGE_PCT = 2.0        // book must pay at least this much over fair price
export const MAX_EDGE_PCT = 20.0       // above this the feed is stale, not a real edge
export const MIN_DECISIVENESS = 0.08   // |home_win_prob - 0.5|; 0.05 is the 45%-55%
                                       // band the client explicitly rejected, so the
                                       // gate sits outside it at 42%-58%.
export const MIN_MODEL_PROB = 0.58     // per-row model probability, for panels that
                                       // rank by model confidence rather than edge.

/**
 * Game-level gate shared by every bet panel: a coin flip gets no picks at all,
 * whatever the prices say. Every panel on the page runs this same check so the
 * three of them can never disagree about whether a game is worth a bet.
 *
 * The epsilon keeps the boundary inclusive — 0.5 + 0.08 is 0.5799999... in
 * binary floating point, which would otherwise reject a game sitting exactly
 * on the threshold.
 */
/**
 * Does a single priced row carry a real edge? Shared by every panel and by the
 * AI PICK column in the odds tables, so "the model likes this" means the same
 * thing everywhere on the page.
 */
export function hasRealEdge(edge: number | null | undefined, min = MIN_EDGE_PCT): edge is number {
  return edge != null && edge >= min && edge < MAX_EDGE_PCT
}

export function isDecisiveGame(homeWinProb: number | null | undefined, min = MIN_DECISIVENESS): boolean {
  if (homeWinProb == null) return false
  return Math.abs(homeWinProb - 0.5) + 1e-9 >= min
}

export type SuggestedMarket = 'WIN' | 'LINE' | 'OVER/UNDER'

export interface Suggestion {
  edge: number
  text: string
  bk: string
  mkt: SuggestedMarket
}

/** Structural slice of the event detail payload this module needs. */
export interface SuggestInput {
  homeName: string
  awayName: string
  homeWinProb: number
  awayWinProb: number
  h2h: SuggestRow[]
  spreads: SuggestRow[]
  totals: SuggestRow[]
}

export interface SuggestRow {
  bookmaker: string
  outcome: string
  price: number
  point: number | null
  edge_pct: number | null
}

/**
 * Gate overrides. Defaults are the exported constants; callers pass a partial
 * only when they need different thresholds (threshold tuning, tests).
 */
export interface Gate {
  minEdgePct?: number
  maxEdgePct?: number
  minDecisiveness?: number
}

function sgn(n: number): string {
  return (n > 0 ? '+' : '−') + Math.abs(n).toFixed(1)
}

export function suggestedBet(
  input: SuggestInput,
  gate: Gate = {},
): Suggestion | null {
  const minEdge    = gate.minEdgePct      ?? MIN_EDGE_PCT
  const maxEdge    = gate.maxEdgePct      ?? MAX_EDGE_PCT
  const minDecisive = gate.minDecisiveness ?? MIN_DECISIVENESS

  if (!isDecisiveGame(input.homeWinProb, minDecisive)) return null

  const priced = (edge: number | null | undefined): edge is number =>
    edge != null && edge >= minEdge && edge < maxEdge

  const rows: Array<{ e: number; t: string; b: string; m: SuggestedMarket }> = []

  for (const r of input.h2h) {
    if (!priced(r.edge_pct)) continue
    rows.push({
      e: r.edge_pct,
      t: `${r.outcome} to win @ ${r.price.toFixed(2)}`,
      b: r.bookmaker,
      m: 'WIN',
    })
  }

  // Spreads and totals need no separate direction check: the backend prices
  // each row against the model's own projection before computing edge_pct, so
  // a row the model disagrees with cannot show a positive edge in the first
  // place.
  for (const r of input.spreads) {
    if (!priced(r.edge_pct) || r.point == null) continue
    rows.push({
      e: r.edge_pct,
      t: `${r.outcome} ${sgn(r.point)} @ ${r.price.toFixed(2)}`,
      b: r.bookmaker,
      m: 'LINE',
    })
  }

  for (const r of input.totals) {
    if (!priced(r.edge_pct) || r.point == null) continue
    rows.push({
      e: r.edge_pct,
      t: `${r.outcome} ${r.point.toFixed(1)} @ ${r.price.toFixed(2)}`,
      b: r.bookmaker,
      m: 'OVER/UNDER',
    })
  }

  if (!rows.length) return null
  rows.sort((a, b) => b.e - a.e)
  return { edge: rows[0].e, text: rows[0].t, bk: rows[0].b, mkt: rows[0].m }
}
