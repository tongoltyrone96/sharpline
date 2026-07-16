import React from 'react'

interface ModelData {
  home_win_prob: number
  away_win_prob: number
  projected_margin: number | null
  projected_total: number | null
  fair_home_price: number | null
  fair_away_price: number | null
}

interface SpreadMarket {
  point: number | null
  edge_pct: number | null
  is_best: boolean
  bookmaker: string
  outcome: string
}

interface TotalMarket {
  point: number | null
  edge_pct: number | null
  is_best: boolean
  outcome: string
}

interface WhyThisIsValueProps {
  model: ModelData | null
  spreadMarkets?: SpreadMarket[]
  totalMarkets?: TotalMarket[]
  homeTeam: string
  awayTeam: string
}

interface GaugeCardProps {
  title: string
  description: React.ReactNode
  modelVal: number
  bookVal: number
  min: number
  max: number
  isPct: boolean
  edgeLabel: string
  ticks: string[]
}

function GaugeCard({ title, description, modelVal, bookVal, min, max, isPct, edgeLabel, ticks }: GaugeCardProps) {
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
  const mp = pos(modelVal)
  const bp = pos(bookVal)
  const lo = Math.min(mp, bp)
  const hi = Math.max(mp, bp)
  const fmt = (v: number) => isPct ? v.toFixed(1) + '%' : (v > 0 ? '+' : '') + v.toFixed(2)

  return (
    <div style={{
      background: 'var(--panel-2)', border: '1px solid var(--line)',
      borderRadius: 10, padding: '12px 13px', marginBottom: 9,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.45, marginBottom: 11 }}>{description}</div>
      <div style={{ position: 'relative', height: 52, marginTop: 2 }}>
        {/* Track */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 22, height: 2, background: 'var(--raise)', borderRadius: 2 }} />
        {/* Fill */}
        <div style={{ position: 'absolute', top: 22, left: lo + '%', width: (hi - lo) + '%', height: 2, background: 'var(--green)', borderRadius: 2 }} />
        {/* Model label — always above axis */}
        <div style={{ position: 'absolute', top: 2, left: mp + '%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--text)' }}>
          {fmt(modelVal)}
        </div>
        {/* Model dot */}
        <div style={{ position: 'absolute', top: 16, left: mp + '%', width: 9, height: 9, borderRadius: '50%', transform: 'translateX(-50%)', border: '2px solid var(--panel-2)', background: 'var(--blue-2)' }} />
        {/* Book dot */}
        <div style={{ position: 'absolute', top: 16, left: bp + '%', width: 9, height: 9, borderRadius: '50%', transform: 'translateX(-50%)', border: '2px solid var(--panel-2)', background: 'var(--green)' }} />
        {/* Book label — always below axis, never overlaps model label */}
        <div style={{ position: 'absolute', top: 28, left: bp + '%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--green)' }}>
          {fmt(bookVal)}
        </div>
        {/* Edge badge */}
        <div style={{
          position: 'absolute', right: 0, top: 2,
          background: 'var(--green-dim)', color: 'var(--green)',
          fontSize: 10, fontWeight: 700, padding: '3px 7px',
          borderRadius: 5, border: '1px solid rgba(34,197,94,.25)',
        }}>
          {edgeLabel} Edge
        </div>
        {/* Ticks */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: 'var(--text-3)' }}>
          {ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>
    </div>
  )
}

export default function WhyThisIsValue({ model, spreadMarkets, totalMarkets, homeTeam, awayTeam }: WhyThisIsValueProps) {
  if (!model) {
    return (
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '13px 14px 11px' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Why this is value</span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-2)', fontWeight: 500, background: 'var(--raise)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>Explain</span>
        </div>
        <div style={{ padding: '2px 14px 13px', fontSize: 12, color: 'var(--text-3)' }}>No data — select a fixture to see value analysis</div>
      </div>
    )
  }

  // Card 1: Spreads
  const bestSpread = spreadMarkets?.find(s => s.is_best) ?? spreadMarkets?.[0]
  const spreadCard = bestSpread && model.projected_margin != null ? {
    title: `${bestSpread.bookmaker} — ${bestSpread.outcome} ${bestSpread.point != null ? (bestSpread.point > 0 ? '+' : '') + bestSpread.point : ''}`,
    description: (
      <>Our model projects <b style={{ color: 'var(--blue)', fontWeight: 600 }}>{homeTeam} by {model.projected_margin > 0 ? '+' : ''}{model.projected_margin.toFixed(2)}</b>. You're getting <span style={{ color: 'var(--green)', fontWeight: 600 }}>{bestSpread.point != null ? (bestSpread.point > 0 ? '+' : '') + bestSpread.point : '–'}</span></>
    ),
    modelVal: model.projected_margin,
    bookVal: bestSpread.point ?? 0,
    min: -14,
    max: 14,
    isPct: false,
    edgeLabel: bestSpread.edge_pct != null ? (bestSpread.edge_pct >= 0 ? '+' : '') + bestSpread.edge_pct.toFixed(1) + '%' : '–',
    ticks: ['-14', '-7', '0', '+7', '+14'],
  } : null

  // Card 2: Totals
  const bestTotal = totalMarkets?.find(t => t.outcome === 'Over' && t.is_best) ?? totalMarkets?.find(t => t.outcome === 'Over') ?? totalMarkets?.[0]
  const totalCard = bestTotal && model.projected_total != null ? {
    title: `Totals — Over ${bestTotal.point != null ? bestTotal.point : ''}`,
    description: (
      <>Our model projects total of <b style={{ color: 'var(--blue)', fontWeight: 600 }}>{model.projected_total.toFixed(1)}</b>. You're getting <span style={{ color: 'var(--green)', fontWeight: 600 }}>Over {bestTotal.point ?? '–'}</span></>
    ),
    modelVal: model.projected_total,
    bookVal: bestTotal.point ?? model.projected_total,
    min: (model.projected_total ?? 0) - 20,
    max: (model.projected_total ?? 0) + 20,
    isPct: false,
    edgeLabel: bestTotal.edge_pct != null ? (bestTotal.edge_pct >= 0 ? '+' : '') + bestTotal.edge_pct.toFixed(1) + '%' : '–',
    ticks: ['Low', '', 'Mid', '', 'High'],
  } : null

  // Card 3: Win probability
  const winPctHome = model.home_win_prob * 100
  const fairImplied = model.fair_home_price != null ? (1 / model.fair_home_price) * 100 : winPctHome
  const winCard = {
    title: `Win Probability — ${homeTeam}`,
    description: (
      <>Our model shows <span style={{ color: 'var(--green)', fontWeight: 600 }}>{winPctHome.toFixed(1)}% win probability</span> for {homeTeam}</>
    ),
    modelVal: winPctHome,
    bookVal: fairImplied,
    min: 30,
    max: 70,
    isPct: true,
    edgeLabel: winPctHome > 50 ? '+' + (winPctHome - 50).toFixed(1) + '%' : (winPctHome - 50).toFixed(1) + '%',
    ticks: ['30%', '40%', '50%', '60%', '70%'],
  }

  const cards = [spreadCard, totalCard, winCard].filter(Boolean) as NonNullable<typeof spreadCard>[]

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 14px 11px' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Why this is value</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-2)', fontWeight: 500, background: 'var(--raise)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>Explain</span>
      </div>
      <div style={{ padding: '2px 14px 13px' }}>
        {cards.map((card, i) => (
          <GaugeCard key={i} {...card} />
        ))}
        {cards.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No data available</div>
        )}
      </div>
    </div>
  )
}
