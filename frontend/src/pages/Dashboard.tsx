import React, { useState, useCallback, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import FilterBar from '../components/FilterBar'
import FixtureCarousel from '../components/FixtureCarousel'
import AIInsightsPanel from '../components/AIInsightsPanel'
import WhyThisIsValue from '../components/WhyThisIsValue'
import ModelPerformance from '../components/ModelPerformance'
import AlertsPanel from '../components/AlertsPanel'
import MarketComparison from '../components/MarketComparison'
import WeatherPanel from '../components/WeatherPanel'
import LineupPanel from '../components/LineupPanel'
import { useDashboard } from '../hooks/useDashboard'
import { useWebSocket, WsMessage } from '../hooks/useWebSocket'
import { getEvent } from '../lib/api'
import { timeAgo } from '../lib/format'

interface EventDetail {
  event: {
    id: string
    sport: string
    commence_time: string
    status: string
    home: { name: string; abbr: string; logo_url: string | null; primary_color: string; secondary_color: string }
    away: { name: string; abbr: string; logo_url: string | null; primary_color: string; secondary_color: string }
  }
  model: {
    home_win_prob: number
    away_win_prob: number
    confidence: number
    projected_margin: number | null
    projected_total: number | null
    fair_home_price: number | null
    fair_away_price: number | null
    rationale: string
    factors: Record<string, unknown>
  } | null
  markets: {
    h2h: MarketRow[]
    spreads: MarketRow[]
    totals: MarketRow[]
  }
  weather: {
    temp_c: number
    wind_kmh: number
    rain_prob: number
    humidity: number
    condition: string
    is_indoor: boolean
  } | null
  lineups: Array<{
    team: string
    player: string
    status: string
    reason?: string
    confirmed: boolean
  }>
}

interface MarketRow {
  bookmaker: string
  outcome: string
  price: number
  point: number | null
  fair_price: number | null
  edge_pct: number | null
  is_best: boolean
}

export default function Dashboard() {
  const [activeSport, setActiveSport] = useState('All')
  const [valueOnly, setValueOnly] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null)
  const [_detailLoading, setDetailLoading] = useState(false)
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [lastUpdated, setLastUpdated] = useState('–')
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [flashEventId, setFlashEventId] = useState<string | null>(null)

  const { events, loading } = useDashboard(activeSport === 'All' ? undefined : activeSport)

  // Auto-select first event when events load
  useEffect(() => {
    if (events.length > 0 && !selectedId) {
      setSelectedId(events[0].id)
    }
  }, [events, selectedId])

  // Fetch event detail whenever selection changes
  const fetchDetail = useCallback((id: string) => {
    setDetailLoading(true)
    getEvent(id)
      .then((data: EventDetail) => {
        setEventDetail(data)
        setLastFetchedAt(new Date())
      })
      .catch(() => setEventDetail(null))
      .finally(() => setDetailLoading(false))
  }, [])

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
  }, [selectedId, fetchDetail])

  // Update "last updated" display every second
  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetchedAt) setLastUpdated(timeAgo(lastFetchedAt.toISOString()))
    }, 1000)
    return () => clearInterval(id)
  }, [lastFetchedAt])

  // WebSocket handler
  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'model_update' && msg.event_id === selectedId) {
      fetchDetail(msg.event_id as string)
      setFlashEventId(msg.event_id as string + '_' + Date.now())
    }
  }, [selectedId, fetchDetail])

  useWebSocket({
    onMessage: handleWsMessage,
    onStateChange: setWsState,
  })

  const handleSelect = (id: string) => {
    setSelectedId(id)
  }

  const detail = eventDetail
  const model = detail?.model ?? null
  const markets = detail?.markets ?? { h2h: [], spreads: [], totals: [] }
  const weather = detail?.weather ?? null
  const lineups = detail?.lineups ?? []
  const eventInfo = detail?.event ?? null

  return (
    <div className="app-grid" style={{
      display: 'grid',
      gridTemplateColumns: '186px 1fr',
      minHeight: '100vh',
    }}>
      <style>{`
        @media (max-width: 980px) {
          .app-sidebar { display: none !important; }
          .app-grid { grid-template-columns: 1fr !important; }
          .tbl-scroll { overflow-x: auto; }
          .tbl-scroll table { min-width: 900px; }
        }
        @media (max-width: 560px) {
          .topbar-wrap { flex-wrap: wrap; gap: 9px; }
        }
        @media (max-width: 640px) {
          .carousel-arrow { display: none !important; }
          .fixture-card { flex-basis: calc(80vw) !important; min-width: 0 !important; }
          .fixture-jersey { width: 32px !important; height: 32px !important; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }
        @keyframes flash-up { 0% { background: rgba(34,197,94,.25); } 100% { background: transparent; } }
        @keyframes flash-dn { 0% { background: rgba(239,68,68,.25); } 100% { background: transparent; } }
        .flash-up { animation: flash-up 1s ease; }
        .flash-dn { animation: flash-dn 1s ease; }
      `}</style>

      {/* Sidebar */}
      <div className="app-sidebar">
        <Sidebar wsState={wsState} lastUpdated={lastUpdated || '–'} />
      </div>

      {/* Main content */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar lastUpdated={lastUpdated || '–'} />

        <div className="content-pad" style={{ padding: '14px 20px 26px', flex: 1 }}>
          {/* Filter bar */}
          <FilterBar
            activeSport={activeSport}
            onSportChange={setActiveSport}
            valueOnly={valueOnly}
            onValueOnlyChange={setValueOnly}
          />

          {/* Fixture carousel */}
          <FixtureCarousel
            events={valueOnly ? events.filter(e => (e.best_edge_pct ?? 0) > 0) : events}
            selectedId={selectedId}
            onSelect={handleSelect}
            loading={loading}
          />

          {/* Mid grid: AI Insights | Why This Is Value | Model Performance + Alerts */}
          <div className="mid-grid" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.35fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}>
            {/* AI Insights */}
            <AIInsightsPanel />

            {/* Why this is value */}
            <WhyThisIsValue
              model={model}
              spreadMarkets={markets.spreads}
              totalMarkets={markets.totals}
              homeTeam={eventInfo?.home?.name ?? 'Home'}
              awayTeam={eventInfo?.away?.name ?? 'Away'}
            />

            {/* Right column: Model Performance + Alerts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ModelPerformance />
              <AlertsPanel />
            </div>
          </div>

          {/* Weather + Lineup — always shown when an event is selected */}
          {detail && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <WeatherPanel weather={weather} />
              <LineupPanel lineups={lineups} />
            </div>
          )}

          {/* Bookmaker Comparison Table (REQ-8) */}
          <div className="tbl-scroll">
            <MarketComparison
              event={eventInfo}
              h2hMarkets={markets.h2h}
              spreadMarkets={markets.spreads}
              totalMarkets={markets.totals}
              fairHomePrice={model?.fair_home_price}
              fairAwayPrice={model?.fair_away_price}
              flashEventId={flashEventId}
              loading={_detailLoading}
            />
          </div>

          {/* Footer */}
          <footer style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '14px 0 0', fontSize: 10.5, color: 'var(--text-3)',
            flexWrap: 'wrap', gap: 10,
          }}>
            <span>Prices are indicative only. Always verify on bookmaker site. 18+ gamble responsibly.</span>
            <span>Data powered by Sharpline AI</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
