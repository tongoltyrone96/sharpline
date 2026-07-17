import React, { useEffect, useState } from 'react'

interface Props {
  title: string
  subtitle?: string
  modelOnline: boolean
  edgesFound: number
  lastUpdated: string
}

export default function Header({ title, subtitle, modelOnline, edgesFound, lastUpdated }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 20px', borderBottom: '1px solid var(--line)',
      flexWrap: 'wrap',
    }}>
      <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.02em' }}>
        {title}
        {subtitle && <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> / {subtitle}</span>}
      </h1>

      <Stat label="MODEL" value={modelOnline ? 'ONLINE' : 'OFFLINE'} color={modelOnline ? 'var(--pos)' : 'var(--neg)'} />
      <Stat label="EDGES FOUND" value={String(edgesFound)} />
      <Stat label="SYNC" value={lastUpdated} />

      <div className="topbar-search" style={{
        marginLeft: 'auto',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--panel)', border: '1px solid var(--line)',
        borderRadius: 8, padding: '8px 12px', minWidth: 200,
        color: 'var(--text-3)', fontSize: 12,
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <circle cx={11} cy={11} r={7} stroke="currentColor" strokeWidth={1.8}/>
          <path d="M21 21l-4-4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"/>
        </svg>
        Search markets…
      </div>
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
