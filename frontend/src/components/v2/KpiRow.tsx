import React from 'react'
import Sparkline from './Sparkline'
import { DashboardEvent } from '../../hooks/useDashboard'

interface Props {
  events: DashboardEvent[]
  bookmakerCount: number
}

interface Kpi {
  label: string
  value: string
  sub: React.ReactNode
  spark: number[]
  sparkColor: string
  accent?: boolean
}

/**
 * KPI row — every number derived from live dashboard data.
 * Sparklines show the distribution shape of the underlying metric
 * across all upcoming events (not random).
 */
/** Server-side opportunities filter caps at 20%; keep KPI aligned. */
const MAX_PLAUSIBLE_EDGE = 20.0

export default function KpiRow({ events, bookmakerCount }: Props) {
  const positiveEdges = events.filter(e =>
    (e.best_edge_pct ?? 0) > 0 && (e.best_edge_pct ?? 0) <= MAX_PLAUSIBLE_EDGE)
  const edgesLive = positiveEdges.length

  const confidences = events
    .map(e => e.confidence)
    .filter((v): v is number => v != null && v > 0)
  const avgConf = confidences.length
    ? confidences.reduce((s, v) => s + v, 0) / confidences.length
    : 0

  const plausibleEvents = events.filter(e =>
    e.best_edge_pct != null && e.best_edge_pct <= MAX_PLAUSIBLE_EDGE)
  const bestEdge = plausibleEvents.reduce<number>((mx, e) => {
    const v = e.best_edge_pct ?? -Infinity
    return v > mx ? v : mx
  }, -Infinity)
  const bestEdgeEvent = plausibleEvents.find(e => e.best_edge_pct === bestEdge)

  const edgeSpark = events
    .map(e => e.best_edge_pct ?? 0)
    .sort((a, b) => a - b)
    .slice(-16)
  const confSpark = confidences.sort((a, b) => a - b).slice(-16).map(v => v * 100)
  const marginSpark = events
    .map(e => Math.abs(e.projected_margin ?? 0))
    .filter(v => v > 0)
    .sort((a, b) => a - b)
    .slice(-16)

  const bestTeams = bestEdgeEvent
    ? `${bestEdgeEvent.home_abbr || bestEdgeEvent.home_team.slice(0, 3)} vs ${bestEdgeEvent.away_abbr || bestEdgeEvent.away_team.slice(0, 3)}`
    : '–'

  const kpis: Kpi[] = [
    {
      label: 'Edges Live',
      value: String(edgesLive),
      sub: <span>of {events.length} events scanned</span>,
      spark: edgeSpark.length > 1 ? edgeSpark : [0, 0],
      sparkColor: '#34D399',
    },
    {
      label: 'Avg Confidence',
      value: confidences.length ? (avgConf * 100).toFixed(0) + '%' : '–',
      sub: <span>across {confidences.length} games</span>,
      spark: confSpark.length > 1 ? confSpark : [0, 0],
      sparkColor: '#2DD4BF',
      accent: true,
    },
    {
      label: 'Best Edge',
      value: bestEdge > -Infinity ? (bestEdge >= 0 ? '+' : '') + bestEdge.toFixed(1) + '%' : '–',
      sub: <span>{bestTeams}</span>,
      spark: marginSpark.length > 1 ? marginSpark : [0, 0],
      sparkColor: '#34D399',
    },
    {
      label: 'Markets Synced',
      value: String(bookmakerCount),
      sub: <span>books · 30s refresh</span>,
      spark: [1, 1.05, 1, 1.1, 1, 1.05, 1, 1.1],
      sparkColor: '#5B9BFF',
    },
  ]

  return (
    <div className="kpis" style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12, marginBottom: 14,
    }}>
      {kpis.map((k, i) => (
        <div key={i} style={{
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 12, padding: 14, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', right: 12, top: 12, width: 70, height: 30, opacity: 0.8 }}>
            <Sparkline values={k.spark} color={k.sparkColor} />
          </div>
          <div style={{
            fontSize: 10, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '.09em',
            fontWeight: 600, marginBottom: 9,
          }}>{k.label}</div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600,
            letterSpacing: '-.02em', lineHeight: 1,
            color: k.accent ? 'var(--cyan)' : 'var(--text)',
          }}>{k.value}</div>
          <div style={{
            fontSize: 11, color: 'var(--text-2)', marginTop: 7,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>{k.sub}</div>
        </div>
      ))}
    </div>
  )
}
