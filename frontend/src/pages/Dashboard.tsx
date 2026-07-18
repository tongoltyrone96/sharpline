import React, { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Rail from '../components/v2/Rail'
import Header from '../components/v2/Header'
import LiveTicker from '../components/v2/LiveTicker'
import KpiRow from '../components/v2/KpiRow'
import LiveBoard from '../components/v2/LiveBoard'
import LineMovementChart from '../components/v2/LineMovementChart'
import ConfidenceRing from '../components/v2/ConfidenceRing'
import EdgeByBookBars from '../components/v2/EdgeByBookBars'
import ValueFeed from '../components/v2/ValueFeed'
import ModelPerformance from '../components/ModelPerformance'
import { useDashboard } from '../hooks/useDashboard'
import { useWebSocket, WsMessage } from '../hooks/useWebSocket'
import { getEvent } from '../lib/api'
import { timeAgo } from '../lib/format'

interface MarketRow {
  bookmaker: string
  outcome: string
  price: number
  point: number | null
  fair_price: number | null
  edge_pct: number | null
  is_best: boolean
}

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
  markets: { h2h: MarketRow[]; spreads: MarketRow[]; totals: MarketRow[] }
  weather: unknown
  lineups: unknown[]
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null)
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [lastUpdated, setLastUpdated] = useState('–')
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [valueOnly, setValueOnly] = useState(false)

  const { events, loading } = useDashboard()

  useEffect(() => {
    if (events.length > 0 && !selectedId) setSelectedId(events[0].id)
  }, [events, selectedId])

  const fetchDetail = useCallback((id: string) => {
    getEvent(id)
      .then((data: EventDetail) => {
        setEventDetail(data)
        setLastFetchedAt(new Date())
      })
      .catch(() => setEventDetail(null))
  }, [])

  useEffect(() => { if (selectedId) fetchDetail(selectedId) }, [selectedId, fetchDetail])

  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetchedAt) setLastUpdated(timeAgo(lastFetchedAt.toISOString()))
    }, 1000)
    return () => clearInterval(id)
  }, [lastFetchedAt])

  const handleWs = useCallback((msg: WsMessage) => {
    if (msg.type === 'model_update' && msg.event_id === selectedId) {
      fetchDetail(msg.event_id as string)
    }
  }, [selectedId, fetchDetail])

  useWebSocket({ onMessage: handleWs, onStateChange: setWsState })

  const openGame = (id: string) => {
    navigate(`/game/${id}`)
  }

  // Derive KPI signals
  const bookmakerCount = new Set(
    (eventDetail?.markets?.h2h ?? [])
      .concat(eventDetail?.markets?.spreads ?? [])
      .concat(eventDetail?.markets?.totals ?? [])
      .map(m => m.bookmaker)
  ).size
  const edgesFound = events.filter(e => (e.best_edge_pct ?? 0) > 0).length
  const modelOnline = wsState === 'connected'

  const detail = eventDetail
  const model = detail?.model ?? null
  const eventInfo = detail?.event ?? null

  return (
    <div>
      <LiveTicker events={events} />
      <div className="app-shell">
        <Rail active="overview" />

        <div className="app-main">
          <Header
            title="Terminal"
            subtitle="Overview"
            modelOnline={modelOnline}
            edgesFound={edgesFound}
            lastUpdated={lastUpdated}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            valueOnly={valueOnly}
            onValueOnlyChange={setValueOnly}
          />

          <div className="dash-content">
            <KpiRow events={events} bookmakerCount={bookmakerCount} />

            <div className="cols">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <LiveBoard
                  events={events}
                  loading={loading}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onOpenGame={openGame}
                  searchQuery={searchQuery}
                  valueOnly={valueOnly}
                />
                <LineMovementChart
                  eventId={selectedId}
                  homeName={eventInfo?.home?.name ?? ''}
                  awayName={eventInfo?.away?.name ?? ''}
                  fairHomePrice={model?.fair_home_price ?? null}
                  fairAwayPrice={model?.fair_away_price ?? null}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ConfidenceRing
                  homeName={eventInfo?.home?.name ?? 'Select fixture'}
                  awayName={eventInfo?.away?.name ?? ''}
                  homeWinProb={model?.home_win_prob ?? null}
                  fairHomePrice={model?.fair_home_price ?? null}
                  bestEdgePct={events.find(e => e.id === selectedId)?.best_edge_pct ?? null}
                  confidence={model?.confidence ?? null}
                  onOpenGame={selectedId ? () => openGame(selectedId) : undefined}
                />
                <EdgeByBookBars
                  h2h={detail?.markets?.h2h ?? []}
                  spreads={detail?.markets?.spreads ?? []}
                  totals={detail?.markets?.totals ?? []}
                  homeName={eventInfo?.home?.name ?? ''}
                  awayName={eventInfo?.away?.name ?? ''}
                />
                <ValueFeed onOpenEvent={id => { setSelectedId(id); openGame(id) }} />
                <ModelPerformance />
              </div>
            </div>

            <footer style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '20px 0 0', fontSize: 10.5, color: 'var(--text-3)',
              flexWrap: 'wrap', gap: 10,
            }}>
              <span>Prices are indicative only. Always verify on bookmaker site. 18+ gamble responsibly.</span>
              <span>Data powered by Sharpline AI</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  )
}
