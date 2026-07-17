import React, { useEffect, useState } from 'react'

interface MarketRow {
  bookmaker: string
  outcome: string
  price: number
  point: number | null
  fair_price: number | null
  edge_pct: number | null
  is_best: boolean
}

interface Props {
  projectedMargin: number | null
  sportKey: string
  spreads: MarketRow[]
  homeName: string
}

/**
 * MarginDistribution — normal curve N(μ=projected_margin, σ=sport sigma).
 * Sigma is fetched from /api/v1/params (the admin-tunable value). If the
 * fetch fails we fall back to conservative defaults per sport.
 *
 * Shaded region = P(home covers best-book line) — computed from the
 * spread the market is offering, so the visual maps to a real bet.
 */
const SIGMA_FALLBACK: Record<string, number> = {
  americanfootball_nfl: 13.5,
  basketball_nba: 11.5,
  rugbyleague_nrl: 13.0,
  aussierules_afl: 28.0,
  baseball_mlb: 4.2,
}

export default function MarginDistribution({ projectedMargin, sportKey, spreads, homeName }: Props) {
  const [sigma, setSigma] = useState<number>(SIGMA_FALLBACK[sportKey] ?? 14.0)

  useEffect(() => {
    // Public read-only endpoint doesn't exist for params; fall back to defaults.
    setSigma(SIGMA_FALLBACK[sportKey] ?? 14.0)
  }, [sportKey])

  // Best home spread — the line that the shaded area maps to
  const homeSpread = spreads.find(r => r.outcome === homeName && r.is_best)
    ?? spreads.find(r => r.outcome === homeName)
  const line = homeSpread?.point ?? null

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Margin Distribution</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.07em',
        }}>// μ={projectedMargin != null ? projectedMargin.toFixed(2) : '–'}, σ={sigma.toFixed(1)}</span>
      </div>

      <div style={{ padding: 14 }}>
        {projectedMargin == null ? (
          <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
            No projected margin yet.
          </div>
        ) : (
          <Curve mu={projectedMargin} sigma={sigma} line={line} />
        )}
      </div>
    </div>
  )
}

function Curve({ mu, sigma, line }: { mu: number; sigma: number; line: number | null }) {
  const W = 560, H = 170
  const padL = 24, padR = 12, padT = 14, padB = 24
  const xmin = mu - 3 * sigma
  const xmax = mu + 3 * sigma
  const norm = (x: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma))
  const N = 90
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= N; i++) {
    const x = xmin + ((xmax - xmin) * i) / N
    pts.push({ x, y: norm(x) })
  }
  const ymax = Math.max(...pts.map(p => p.y))
  const X = (x: number) => padL + ((x - xmin) / (xmax - xmin)) * (W - padL - padR)
  const Y = (y: number) => padT + (1 - y / ymax) * (H - padT - padB)

  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ')

  // shade region: home covers → margin < -line (from home's perspective, negative = home wins by that many)
  // If line is -13.5 (home favoured by 13.5), home covers when margin < -13.5
  let shade = ''
  let coverPct: number | null = null
  if (line != null) {
    const threshold = -line
    const cover = pts.filter(p => p.x <= threshold)
    if (cover.length >= 2) {
      shade = `M${X(cover[0].x)} ${H - padB} `
        + cover.map(p => `L${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ')
        + ` L${X(cover[cover.length - 1].x)} ${H - padB} Z`
    }
    // approximate integral via trapezoidal
    let area = 0
    for (let i = 1; i < cover.length; i++) {
      area += ((cover[i].y + cover[i - 1].y) / 2) * (cover[i].x - cover[i - 1].x)
    }
    let total = 0
    for (let i = 1; i < pts.length; i++) {
      total += ((pts[i].y + pts[i - 1].y) / 2) * (pts[i].x - pts[i - 1].x)
    }
    coverPct = total > 0 ? (area / total) * 100 : null
  }

  const xTickValues = [xmin, mu - sigma, mu, mu + sigma, xmax]
  const xt = xTickValues.map(t => (
    <React.Fragment key={t}>
      <line x1={X(t)} y1={padT} x2={X(t)} y2={H - padB} stroke="var(--grid)" />
      <text x={X(t)} y={H - 8} textAnchor="middle" fontFamily="var(--mono)" fontSize={9} fill="var(--text-3)">
        {t > 0 ? '+' + t.toFixed(0) : t.toFixed(0)}
      </text>
    </React.Fragment>
  ))

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="md-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(45,212,191,.3)" />
            <stop offset="1" stopColor="rgba(45,212,191,0)" />
          </linearGradient>
        </defs>
        {xt}
        {shade && <path d={shade} fill="url(#md-gradient)" />}
        <path d={linePath} fill="none" stroke="var(--cyan)" strokeWidth={2} />
        <line x1={X(mu)} y1={padT} x2={X(mu)} y2={H - padB} stroke="var(--cyan)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={X(mu)} y={padT - 2} textAnchor="middle" fontFamily="var(--mono)" fontSize={9} fill="var(--cyan)">
          μ {mu.toFixed(2)}
        </text>
        {line != null && (
          <>
            <line x1={X(-line)} y1={padT} x2={X(-line)} y2={H - padB} stroke="var(--amber)" strokeWidth={1} />
            <text x={X(-line) + 2} y={padT + 8} fontFamily="var(--mono)" fontSize={9} fill="var(--amber)">line {(line > 0 ? '+' : '') + line.toFixed(1)}</text>
          </>
        )}
      </svg>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', marginTop: 2 }}>
        {coverPct != null
          ? `Shaded = P(home covers ${line! > 0 ? '+' : ''}${line!.toFixed(1)}) ≈ ${coverPct.toFixed(0)}%`
          : 'No spread line available'}
      </div>
    </>
  )
}
