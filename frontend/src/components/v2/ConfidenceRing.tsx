import React from 'react'

interface Props {
  homeName: string
  awayName: string
  homeWinProb: number | null
  fairHomePrice: number | null
  bestEdgePct: number | null
  confidence: number | null   // 0..1
  onOpenGame?: () => void
}

export default function ConfidenceRing({
  homeName, awayName, homeWinProb, fairHomePrice, bestEdgePct, confidence, onOpenGame,
}: Props) {
  const pct = confidence != null ? Math.round(confidence * 100) : 0
  const R = 42
  const C = 2 * Math.PI * R
  const dash = C * (1 - pct / 100)

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Model Confidence</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>// selected pick</span>
        {onOpenGame && (
          <span
            onClick={onOpenGame}
            style={{
              marginLeft: 'auto', fontSize: 10.5, color: 'var(--cyan)',
              fontWeight: 500, cursor: 'pointer', userSelect: 'none',
              fontFamily: 'var(--mono)',
            }}
          >Open →</span>
        )}
      </div>

      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
            <svg viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }} width={96} height={96}>
              <circle cx={48} cy={48} r={R} fill="none" stroke="var(--raise)" strokeWidth={7} />
              <circle
                cx={48} cy={48} r={R} fill="none"
                stroke={confidence != null ? 'var(--cyan)' : 'var(--text-3)'}
                strokeWidth={7} strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={dash}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 600, lineHeight: 1 }}>
                {confidence != null ? pct + '%' : '–'}
              </div>
              <div style={{
                fontSize: 8.5, color: 'var(--text-3)',
                textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 2,
              }}>Confidence</div>
            </div>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{homeName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>vs {awayName}</div>
            <Row label="Win prob" value={homeWinProb != null ? (homeWinProb * 100).toFixed(1) + '%' : '–'} />
            <Row label="Fair price" value={fairHomePrice != null ? fairHomePrice.toFixed(2) : '–'} />
            <Row
              label="Best edge"
              value={bestEdgePct != null ? (bestEdgePct >= 0 ? '+' : '') + bestEdgePct.toFixed(1) + '%' : '–'}
              valueColor={bestEdgePct != null && bestEdgePct >= 0 ? 'var(--pos)' : (bestEdgePct != null ? 'var(--neg)' : undefined)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      fontSize: 11, marginBottom: 6, gap: 16,
    }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <b style={{ fontFamily: 'var(--mono)', color: valueColor ?? 'var(--text)', fontWeight: 600 }}>{value}</b>
    </div>
  )
}
