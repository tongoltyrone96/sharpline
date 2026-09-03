/**
 * OVER / UNDER directional call for total points.
 *
 * ── Why this is not "model projection vs book line" ──────────────────────────
 * project_total() on the backend is a weighted mean of the books' own Over
 * points, so the projection EQUALS the market line. Measured across a full
 * live round the gap was exactly 0.000 on 6 of 9 fixtures and never exceeded
 * 0.05. There is no independent projection to lean on.
 *
 * The old code hid that: it added a matchupLean() term derived from ratings
 * hashed out of the team abbreviation, and fell back to `net = 0.01` (always
 * OVER) when everything cancelled. Four of nine fixtures were showing "AI
 * OVER" purely because of that constant.
 *
 * What is real is the de-vig edge on each side. If the books collectively
 * misprice the Over more than the Under, that is a genuine, observable lean.
 * So: edge lean first, projection gap second (kept so the call improves for
 * free if the model ever gains an independent projection), weather last as a
 * tiebreaker. When all three cancel there is genuinely no call, and the
 * function says so rather than inventing one.
 */

export interface WeatherLike {
  temp_c?: number
  wind_kmh: number
  rain_prob: number
  condition?: string | null
  is_indoor?: boolean
}

export interface TotalDirectionInput {
  /** Model's projected total. */
  projectedTotal: number | null
  /** Mean Over line across books. */
  bookLine: number | null
  /** Best edge_pct among Over rows, null when the market is absent. */
  overEdge: number | null
  /** Best edge_pct among Under rows, null when the market is absent. */
  underEdge: number | null
  weather: WeatherLike | null
}

export interface TotalDirectionResult {
  /** null when the signals genuinely cancel — render the line with no call. */
  side: 'OVER' | 'UNDER' | null
  /** Absolute size of the combined signal. */
  strength: number
  /** Only the reasons that support `side`, strongest first. */
  factors: string[]
}

/** Weather → total-points lean. Positive = OVER, negative = UNDER. */
export function weatherLean(w: WeatherLike | null | undefined): { score: number; label: string | null } {
  if (!w) return { score: 0, label: null }
  let score = 0
  const parts: string[] = []
  const cond = (w.condition || '').toLowerCase()
  // rain_prob is stored 0..1 (OpenWeather `pop`), not 0..100.
  if (w.rain_prob >= 0.3 || cond.includes('rain') || cond.includes('shower')) {
    score -= 1.4
    parts.push('rain')
  }
  if (w.wind_kmh > 25) { score -= 1.2; parts.push('strong wind') }
  else if (w.wind_kmh > 15) { score -= 0.6; parts.push('wind') }
  if (w.is_indoor) { score += 0.4; parts.push('indoor') }
  else if (cond.includes('clear')) { score += 0.4; parts.push('clear sky') }
  return { score, label: parts.length ? parts.join(', ') : null }
}

/** Below this the combined signal is treated as noise and no call is made. */
export const MIN_SIGNAL = 0.05

export function totalDirection(input: TotalDirectionInput): TotalDirectionResult {
  const { projectedTotal, bookLine, overEdge, underEdge, weather } = input
  const contributions: { label: string; score: number }[] = []
  let net = 0

  // 1) Edge lean — the primary signal, and the only one that reliably varies.
  if (overEdge != null && underEdge != null) {
    const lean = overEdge - underEdge
    net += lean
    if (Math.abs(lean) >= 0.1) {
      contributions.push({
        label: `${lean > 0 ? 'over' : 'under'} better priced by ${Math.abs(lean).toFixed(1)}%`,
        score: lean,
      })
    }
  }

  // 2) Projection gap. Zero today because the projection is the market line,
  //    kept so this strengthens automatically if that ever changes.
  if (projectedTotal != null && bookLine != null) {
    const gap = projectedTotal - bookLine
    const contribution = gap * 2
    net += contribution
    if (Math.abs(gap) >= 0.5) {
      contributions.push({
        label: `model ${gap > 0 ? 'above' : 'below'} line by ${Math.abs(gap).toFixed(1)}`,
        score: contribution,
      })
    }
  }

  // 3) Weather — tiebreaker only.
  const wl = weatherLean(weather)
  net += wl.score
  if (wl.label) contributions.push({ label: wl.label, score: wl.score })

  if (Math.abs(net) < MIN_SIGNAL) {
    return { side: null, strength: 0, factors: [] }
  }

  const side: 'OVER' | 'UNDER' = net > 0 ? 'OVER' : 'UNDER'
  const factors = contributions
    .filter(c => (side === 'OVER' ? c.score > 0 : c.score < 0))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .map(c => c.label)

  return { side, strength: Math.abs(net), factors }
}

/** Best edge on each side of the totals market. */
export function totalsEdges(
  rows: Array<{ outcome: string; edge_pct: number | null }>,
): { overEdge: number | null; underEdge: number | null } {
  const pick = (want: string) => {
    const vals = rows
      .filter(r => r.outcome.toLowerCase() === want && r.edge_pct != null)
      .map(r => r.edge_pct as number)
    return vals.length ? Math.max(...vals) : null
  }
  return { overEdge: pick('over'), underEdge: pick('under') }
}
