import { useState, useEffect } from 'react'
import { getOpportunities } from '../lib/api'

export interface OpportunityRow {
  event_id: string
  event_label: string
  bookmaker: string
  market: string
  outcome: string
  price: number
  fair_price: number | null
  edge_pct: number
  point: number | null
}

export interface OpportunitiesData {
  rows: OpportunityRow[]
  total_scanned: number
}

export function useOpportunities(limit = 6, refreshMs = 60_000) {
  const [data, setData] = useState<OpportunitiesData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getOpportunities(limit)
        .then((d: OpportunitiesData) => { if (!cancelled) setData(d) })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    load()
    const id = setInterval(load, refreshMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [limit, refreshMs])

  return { data, loading }
}
