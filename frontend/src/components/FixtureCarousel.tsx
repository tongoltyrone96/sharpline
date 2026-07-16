import React, { useRef, useState, useEffect } from 'react'
import FixtureCard from './FixtureCard'
import { DashboardEvent } from '../hooks/useDashboard'

interface FixtureCarouselProps {
  events: DashboardEvent[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
}

// Touch devices scroll natively — arrows are only useful with a mouse pointer.
function isPointerDevice() {
  if (typeof window === 'undefined') return false
  if ('ontouchstart' in window) return false
  if (navigator.maxTouchPoints > 0) return false
  return window.innerWidth >= 700
}

export default function FixtureCarousel({ events, selectedId, onSelect, loading }: FixtureCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showArrows, setShowArrows] = useState(isPointerDevice)

  useEffect(() => {
    const update = () => setShowArrows(isPointerDevice())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const scroll = (dir: -1 | 1) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 252, behavior: 'smooth' })
    }
  }

  if (loading) {
    return (
      <div style={{ marginBottom: 14, display: 'flex', gap: 10, overflow: 'hidden', padding: 1 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            flex: '1 0 232px', minWidth: 232, height: 172,
            background: 'var(--panel)', border: '1px solid var(--line)',
            borderRadius: 'var(--r)', opacity: 0.5,
          }} />
        ))}
      </div>
    )
  }

  if (!events.length) {
    return (
      <div style={{ marginBottom: 14, padding: '20px 0', color: 'var(--text-3)', fontSize: 12, textAlign: 'center' }}>
        No events found
      </div>
    )
  }

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 14 }}>
      {/* Left arrow — only rendered when window ≥ 700px so it can never overlap cards on mobile */}
      {showArrows && (
        <div
          onClick={() => scroll(-1)}
          style={{
            position: 'absolute', top: '50%', transform: 'translateY(-50%)',
            left: -9, width: 34, height: 44, borderRadius: 6,
            background: 'rgba(17,21,32,.92)', border: '1px solid var(--line)',
            display: 'grid', placeItems: 'center', color: 'var(--text-2)',
            cursor: 'pointer', zIndex: 5,
          }}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="carousel-scroll"
        style={{
          display: 'flex', gap: 10, overflowX: 'auto',
          scrollbarWidth: 'none', padding: '1px 0',
        } as React.CSSProperties}
      >
        {events.map(event => (
          <FixtureCard
            key={event.id}
            event={event}
            selected={event.id === selectedId}
            onClick={() => onSelect(event.id)}
            snapOnMobile={false}
          />
        ))}
      </div>

      {/* Right arrow — only rendered on desktop */}
      {showArrows && (
        <div
          onClick={() => scroll(1)}
          style={{
            position: 'absolute', top: '50%', transform: 'translateY(-50%)',
            right: -9, width: 34, height: 44, borderRadius: 6,
            background: 'rgba(17,21,32,.92)', border: '1px solid var(--line)',
            display: 'grid', placeItems: 'center', color: 'var(--text-2)',
            cursor: 'pointer', zIndex: 5,
          }}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      </div>
    </div>
  )
}
