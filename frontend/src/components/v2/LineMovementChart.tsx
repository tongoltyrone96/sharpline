import React, { useEffect, useMemo, useState } from 'react'
import { getEventHistory, HistoryPoint } from '../../lib/api'

interface Props {
  eventId: string | null
  homeName: string
  awayName: string
  fairHomePrice: number | null
  fairAwayPrice: number | null
}

type MarketKey = 'h2h' | 'spreads' | 'totals'

/**
 * Line Movement — pulls per-outcome history from
 * /api/v1/events/{id}/history and draws it against the model fair price.
 *
 * For H2H we plot the home price consensus (single line = average across
 * all books at each timestamp bucket). Toggling market re-fetches.
 */
export default function LineMovementChart({
  eventId, homeName, awayName, fairHomePrice, fairAwayPrice,
}: Props) {
  const [market, setMarket] = useState<MarketKey>('h2h')
  const [history, setHistory] = useState<HistoryPoint[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!eventId) { setHistory(null); return }
    const outcome = market === 'totals' ? 'Over' : homeName
    setLoading(true)
    getEventHistory(eventId, { market, outcome })
      .then(res => setHistory(res?.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [eventId, market, homeName])

  const view = useMemo(() => {
    if (!history || history.length < 2) return null
    // Bucket by minute — average price across books per bucket
    const buckets = new Map<number, number[]>()
    for (const p of history) {
      const t = Math.floor(new Date(p.recorded_at).getTime() / 60000)
      const arr = buckets.get(t) ?? []
      arr.push(p.price)
      buckets.set(t, arr)
    }
    const pts = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, arr]) => ({ t, avg: arr.reduce((s, v) => s + v, 0) / arr.length }))
    return pts
  }, [history])

  const fair = market === 'h2h' ? fairHomePrice : null

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Line Movement</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>// {homeName || 'select event'}</span>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{
            display: 'flex', gap: 2, background: 'var(--panel-2)',
            border: '1px solid var(--line)', borderRadius: 7, padding: 2,
          }}>
            {(['h2h', 'spreads', 'totals'] as MarketKey[]).map(m => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                style={{
                  fontSize: 10.5, fontFamily: 'var(--mono)', fontWeight: 500,
                  color: market === m ? 'var(--cyan)' : 'var(--text-3)',
                  background: market === m ? 'var(--raise)' : 'transparent',
                  border: 0, borderRadius: 5, padding: '4px 9px', cursor: 'pointer',
                }}
              >{m === 'h2h' ? 'H2H' : m === 'spreads' ? 'LINE' : 'TOTAL'}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontFamily: 'var(--mono)', fontSize: 10 }}>
          <Legend color="var(--cyan)" label="Model fair" />
          <Legend color="var(--blue)" label="Market avg" />
        </div>
        {loading && (
          <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Loading history…</div>
        )}
        {!loading && (!view || view.length < 2) && (
          <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
            Not enough history yet (need ≥2 recorded points).
          </div>
        )}
        {!loading && view && view.length >= 2 && (
          <Chart points={view} fair={fair} />
        )}
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
      <i style={{ width: 14, height: 2, borderRadius: 2, background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

function Chart({ points, fair }: { points: { t: number; avg: number }[]; fair: number | null }) {
  const W = 560, H = 180
  const padL = 30, padR = 10, padT = 12, padB = 22
  const values = points.map(p => p.avg)
  const allVals = fair != null ? [...values, fair] : values
  const mn = Math.min(...allVals) - 0.05
  const mx = Math.max(...allVals) + 0.05
  const tMin = points[0].t
  const tMax = points[points.length - 1].t
  const tRange = Math.max(1, tMax - tMin)
  const X = (t: number) => padL + ((t - tMin) / tRange) * (W - padL - padR)
  const Y = (v: number) => padT + (1 - (v - mn) / (mx - mn)) * (H - padT - padB)

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.avg).toFixed(1)}`).join(' ')
  const areaPath = `${path} L${X(tMax).toFixed(1)} ${(H - padB).toFixed(1)} L${X(tMin).toFixed(1)} ${(H - padB).toFixed(1)} Z`

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = padT + f * (H - padT - padB)
    const val = (mx - (mx - mn) * f).toFixed(2)
    return (
      <g key={f}>
        <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--grid)" />
        <text x={padL - 6} y={y + 3} textAnchor="end" fontFamily="var(--mono)" fontSize={9} fill="var(--text-3)">{val}</text>
      </g>
    )
  })

  const xTicks = 5
  const xt = Array.from({ length: xTicks }, (_, i) => {
    const t = tMin + (tRange * i) / (xTicks - 1)
    const ago = Math.round((tMax - t))
    return (
      <text key={i} x={X(t)} y={H - 6} textAnchor="middle" fontFamily="var(--mono)" fontSize={9} fill="var(--text-3)">
        {ago === 0 ? 'now' : ago + 'm'}
      </text>
    )
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="lm-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(45,212,191,.18)" />
          <stop offset="1" stopColor="rgba(45,212,191,0)" />
        </linearGradient>
      </defs>
      {gridLines}
      {xt}
      <path d={areaPath} fill="url(#lm-gradient)" />
      {fair != null && (
        <line
          x1={padL} x2={W - padR}
          y1={Y(fair)} y2={Y(fair)}
          stroke="var(--cyan)" strokeWidth={1.4}
          strokeDasharray="4 3"
        />
      )}
      <path d={path} fill="none" stroke="var(--blue)" strokeWidth={1.8} />
      <circle cx={X(tMax)} cy={Y(points[points.length - 1].avg)} r={3} fill="var(--blue)" />
      {fair != null && <circle cx={W - padR} cy={Y(fair)} r={3} fill="var(--cyan)" />}
    </svg>
  )
}
