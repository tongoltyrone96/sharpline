import { useState, useEffect, useCallback } from 'react'
import { getDashboard } from '../lib/api'

export interface DashboardEvent {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string
  status: string
  home_team: string
  away_team: string
  home_abbr: string
  away_abbr: string
  home_color: string
  away_color: string
  home_secondary_color: string
  away_secondary_color: string
  best_edge_pct: number | null
  home_h2h_price: number | null
  away_h2h_price: number | null
  projected_margin: number | null
  projected_total: number | null
  home_win_prob: number | null
  away_win_prob: number | null
  confidence: number | null
}

const SPORT_TITLE_TO_KEY: Record<string, string> = {
  NRL: 'rugbyleague_nrl',
  AFL: 'aussierules_afl',
  NBL: 'basketball_nbl',
  MLB: 'baseball_mlb',
  NBA: 'basketball_nba',
  NFL: 'americanfootball_nfl',
  NHL: 'icehockey_nhl',
}

function transformEvent(raw: Record<string, unknown>): DashboardEvent {
  const home = (raw.home ?? {}) as Record<string, string>
  const away = (raw.away ?? {}) as Record<string, string>
  const sport = (raw.sport as string) ?? ''
  return {
    id: raw.id as string,
    sport_key: SPORT_TITLE_TO_KEY[sport] ?? sport.toLowerCase(),
    sport_title: sport,
    commence_time: raw.commence_time as string,
    status: (raw.status as string) ?? 'upcoming',
    home_team: home.name ?? '',
    away_team: away.name ?? '',
    home_abbr: home.abbr ?? '',
    away_abbr: away.abbr ?? '',
    home_color: home.primary_color ?? '#333333',
    away_color: away.primary_color ?? '#333333',
    home_secondary_color: home.secondary_color ?? '#888888',
    away_secondary_color: away.secondary_color ?? '#888888',
    best_edge_pct: (raw.best_edge_pct as number | null) ?? null,
    home_h2h_price: (raw.home_h2h_price as number | null) ?? null,
    away_h2h_price: (raw.away_h2h_price as number | null) ?? null,
    projected_margin: (raw.projected_margin as number | null) ?? null,
    projected_total: (raw.projected_total as number | null) ?? null,
    home_win_prob: (raw.home_win_prob as number | null) ?? null,
    away_win_prob: (raw.away_win_prob as number | null) ?? null,
    confidence: (raw.confidence as number | null) ?? null,
  }
}

interface UseDashboardReturn {
  events: DashboardEvent[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useDashboard(sport?: string): UseDashboardReturn {
  const [events, setEvents] = useState<DashboardEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(() => {
    setLoading(true)
    getDashboard(sport === 'All' ? undefined : sport)
      .then(data => {
        const raw: Record<string, unknown>[] = data?.events ?? []
        setEvents(raw.map(transformEvent))
        setError(null)
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load')
      })
      .finally(() => setLoading(false))
  }, [sport])

  useEffect(() => {
    fetch_()
    const interval = setInterval(fetch_, 60_000)
    return () => clearInterval(interval)
  }, [fetch_])

  return { events, loading, error, refetch: fetch_ }
}
