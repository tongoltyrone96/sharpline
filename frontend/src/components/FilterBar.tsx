import React, { useState } from 'react'

const SPORT_TABS = ['All', 'NRL', 'AFL', 'NBL', 'MLB', 'NBA', 'NFL', 'NHL']

interface FilterBarProps {
  activeSport: string
  onSportChange: (sport: string) => void
  valueOnly: boolean
  onValueOnlyChange: (v: boolean) => void
}

export default function FilterBar({ activeSport, onSportChange, valueOnly, onValueOnlyChange }: FilterBarProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 14, flexWrap: 'wrap',
    }}>
      {/* Sport tabs */}
      <div style={{
        display: 'flex', gap: 4, overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {SPORT_TABS.map(sport => (
          <button
            key={sport}
            onClick={() => onSportChange(sport)}
            style={{
              flexShrink: 0,
              fontSize: 12.5, fontWeight: 600,
              color: activeSport === sport ? '#fff' : 'var(--text-2)',
              background: activeSport === sport ? 'var(--blue)' : 'var(--panel)',
              border: `1px solid ${activeSport === sport ? 'var(--blue)' : 'var(--line)'}`,
              borderRadius: 8, padding: '7px 17px',
              cursor: 'pointer', transition: '0.12s',
            }}
          >
            {sport}
          </button>
        ))}
      </div>

      {/* Right side controls */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 22,
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', fontWeight: 500,
        }}>
          All Markets
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 22,
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', fontWeight: 500,
        }}>
          All Bookmakers
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Value only toggle */}
        <div
          onClick={() => onValueOnlyChange(!valueOnly)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: 'var(--text-2)', fontWeight: 500,
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          <div style={{
            width: 34, height: 19, borderRadius: 99,
            background: valueOnly ? 'var(--blue)' : 'var(--raise)',
            position: 'relative', transition: '0.2s',
            border: '1px solid rgba(255,255,255,.12)',
          }}>
            <span style={{
              position: 'absolute',
              top: 2,
              left: valueOnly ? 'auto' : 2,
              right: valueOnly ? 2 : 'auto',
              width: 13, height: 13,
              borderRadius: '50%',
              background: valueOnly ? '#fff' : 'var(--text-3)',
              transition: '0.2s',
            }} />
          </div>
          Value only
        </div>

        <span style={{ color: 'var(--text-3)', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>▾</span>
      </div>
    </div>
  )
}
