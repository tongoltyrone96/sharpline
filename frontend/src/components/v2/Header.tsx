import React from 'react'

interface Props {
  title: string
  subtitle?: string
  modelOnline: boolean
  edgesFound: number
  lastUpdated: string
  searchQuery: string
  onSearchChange: (q: string) => void
  valueOnly: boolean
  onValueOnlyChange: (v: boolean) => void
}

export default function Header({
  title, subtitle, modelOnline, edgesFound, lastUpdated,
  searchQuery, onSearchChange, valueOnly, onValueOnlyChange,
}: Props) {
  return (
    <div className="terminal-header">
      <div className="terminal-header-title">
        <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>
          {title}
          {subtitle && <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> / {subtitle}</span>}
        </h1>
      </div>

      <div className="terminal-header-badges">
        <Stat label="MODEL" value={modelOnline ? 'ONLINE' : 'OFFLINE'} color={modelOnline ? 'var(--pos)' : 'var(--neg)'} />
        <Stat label="EDGES FOUND" value={String(edgesFound)} />
        <Stat label="SYNC" value={lastUpdated} />
        <ValueToggle on={valueOnly} onChange={onValueOnlyChange} />
      </div>

      <label className="terminal-header-search">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: 'var(--text-3)' }}>
          <circle cx={11} cy={11} r={7} stroke="currentColor" strokeWidth={1.8}/>
          <path d="M21 21l-4-4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search teams, sports…"
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ui)',
            width: '100%', padding: 0,
          }}
        />
        {searchQuery && (
          <span
            onClick={e => { e.preventDefault(); onSearchChange('') }}
            style={{
              color: 'var(--text-3)', fontSize: 14, cursor: 'pointer',
              padding: '0 4px', lineHeight: 1, flexShrink: 0,
            }}
            title="Clear"
          >×</span>
        )}
      </label>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      fontFamily: 'var(--mono)', fontSize: 11,
      color: 'var(--text-2)',
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 7, padding: '6px 11px', whiteSpace: 'nowrap',
    }}>
      {label} <b style={{ color: color ?? 'var(--text)', fontWeight: 600 }}>{value}</b>
    </div>
  )
}

function ValueToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      title={on ? 'Showing value bets only — click to show all fixtures' : 'Showing all fixtures — click to filter to positive-edge only'}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
        color: on ? 'var(--pos)' : 'var(--text-2)',
        background: on ? 'var(--pos-dim)' : 'var(--panel)',
        border: `1px solid ${on ? 'rgba(52,211,153,.35)' : 'var(--line)'}`,
        borderRadius: 7, padding: '5px 10px', whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'background .12s, border-color .12s, color .12s',
      }}
    >
      <span style={{
        width: 22, height: 12, borderRadius: 7,
        background: on ? 'var(--pos)' : 'var(--raise)',
        position: 'relative', flexShrink: 0,
        transition: 'background .12s',
      }}>
        <span style={{
          position: 'absolute', top: 1, left: on ? 11 : 1,
          width: 10, height: 10, borderRadius: '50%',
          background: on ? '#04140f' : 'var(--text-3)',
          transition: 'left .12s',
        }} />
      </span>
      VALUE ONLY
    </button>
  )
}
