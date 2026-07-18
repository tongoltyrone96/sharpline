import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Rail from '../components/v2/Rail'
import LiveTicker from '../components/v2/LiveTicker'
import GameHeader from '../components/v2/GameHeader'
import AiVerdict from '../components/v2/AiVerdict'
import WhyThisIsValue from '../components/WhyThisIsValue'
import AllMarketsTable from '../components/v2/AllMarketsTable'
import MarginDistribution from '../components/v2/MarginDistribution'
import ConfidenceBreakdown from '../components/v2/ConfidenceBreakdown'
import VenueWeather from '../components/v2/VenueWeather'
import LineupsPanel from '../components/v2/LineupsPanel'
import LineMovementChart from '../components/v2/LineMovementChart'
import { useDashboard, DashboardEvent } from '../hooks/useDashboard'
import { useWebSocket, WsMessage } from '../hooks/useWebSocket'
import { getEvent } from '../lib/api'

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
  weather: {
    temp_c: number
    wind_kmh: number
    rain_prob: number
    humidity: number
    condition: string
    is_indoor: boolean
  } | null
  lineups: Array<{ team: string; player: string; status: string; reason?: string; confirmed: boolean }>
}

export default function GamePage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const { events } = useDashboard()
  const dashRow: DashboardEvent | undefined = events.find(e => e.id === eventId)

  const fetchDetail = () => {
    if (!eventId) return
    setLoading(true)
    getEvent(eventId)
      .then((data: EventDetail) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchDetail() /* eslint-disable-next-line */ }, [eventId])

  const handleWs = (msg: WsMessage) => {
    if (msg.type === 'model_update' && msg.event_id === eventId) fetchDetail()
  }
  useWebSocket({ onMessage: handleWs, onStateChange: () => {} })

  const model = detail?.model ?? null
  const event = detail?.event ?? null
  const markets = detail?.markets ?? { h2h: [], spreads: [], totals: [] }
  const weather = detail?.weather ?? null
  const lineups = detail?.lineups ?? []

  const bestBookEdge = [
    ...markets.h2h, ...markets.spreads, ...markets.totals,
  ].reduce<MarketRow | null>((mx, r) => {
    if (r.edge_pct == null) return mx
    if (r.edge_pct > 20) return mx  // outlier cap
    if (!mx || (mx.edge_pct ?? -Infinity) < r.edge_pct) return r
    return mx
  }, null)

  return (
    <div>
      <LiveTicker events={events} />
      <div className="app-shell">
        <Rail active="overview" />
        <div className="app-main">
          {/* Breadcrumb */}
          <div className="game-breadcrumb" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 22px',
            borderBottom: '1px solid var(--line)',
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)',
          }}>
            <a onClick={() => navigate('/')} style={{ color: 'var(--text-2)', cursor: 'pointer' }}>Overview</a>
            <span>/</span>
            <span>{event?.sport ?? '–'}</span>
            <span>/</span>
            <span style={{ color: 'var(--text-2)' }}>
              {event ? `${event.home.name} vs ${event.away.name}` : (loading ? 'Loading…' : '–')}
            </span>
            <span style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              color: 'var(--cyan)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', animation: 'pulse 1.8s infinite' }} />
              LIVE · 30s
            </span>
          </div>

          {event && (
            <GameHeader event={event} model={model} />
          )}

          <div style={{
            padding: '18px 22px 44px',
            display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16,
          }}
          className="game-body">
            <style>{`
              @media (max-width: 1080px) { .game-body { grid-template-columns: 1fr !important; } }
            `}</style>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <AiVerdict
                model={model}
                homeName={event?.home.name ?? ''}
                awayName={event?.away.name ?? ''}
                bestBookEdge={bestBookEdge}
              />
              <WhyThisIsValue
                model={model}
                spreadMarkets={markets.spreads}
                totalMarkets={markets.totals}
                homeTeam={event?.home.name ?? ''}
                awayTeam={event?.away.name ?? ''}
              />
              <AllMarketsTable
                h2h={markets.h2h}
                spreads={markets.spreads}
                totals={markets.totals}
                fairHomePrice={model?.fair_home_price ?? null}
                fairAwayPrice={model?.fair_away_price ?? null}
                projectedMargin={model?.projected_margin ?? null}
                projectedTotal={model?.projected_total ?? null}
                homeName={event?.home.name ?? ''}
                awayName={event?.away.name ?? ''}
              />
              <MarginDistribution
                projectedMargin={model?.projected_margin ?? null}
                sportKey={dashRow?.sport_key ?? ''}
                spreads={markets.spreads}
                homeName={event?.home.name ?? ''}
              />
              <LineMovementChart
                eventId={eventId ?? null}
                homeName={event?.home.name ?? ''}
                awayName={event?.away.name ?? ''}
                fairHomePrice={model?.fair_home_price ?? null}
                fairAwayPrice={model?.fair_away_price ?? null}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ConfidenceBreakdown
                model={model}
                markets={markets}
                lineupCount={lineups.length}
              />
              <VenueWeather weather={weather} />
              <LineupsPanel lineups={lineups} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
