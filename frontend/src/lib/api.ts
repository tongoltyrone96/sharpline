export const getDashboard = (sport?: string) =>
  fetch(`/api/v1/dashboard${sport ? '?sport=' + sport : ''}`).then(r => r.json())

export const getEvent = (id: string) =>
  fetch(`/api/v1/events/${id}`).then(r => r.json())

export const getOpportunities = (limit = 6) =>
  fetch(`/api/v1/opportunities?limit=${limit}`).then(r => r.json())

export interface HistoryPoint { recorded_at: string; price: number; point: number | null }
export interface HistoryResponse {
  event_id: string; market: string; outcome: string; bookmaker: string;
  history: HistoryPoint[];
}

export const getEventHistory = (
  id: string,
  params: { market: string; outcome?: string; bookmaker_id?: number },
): Promise<HistoryResponse> => {
  const q = new URLSearchParams({ market: params.market })
  if (params.outcome) q.set('outcome', params.outcome)
  if (params.bookmaker_id != null) q.set('bookmaker_id', String(params.bookmaker_id))
  return fetch(`/api/v1/events/${id}/history?${q.toString()}`).then(r => r.json())
}

export interface Standing {
  rank: number | null
  wins: number
  losses: number
  draws: number
  played: number
  points: number | null
  source: string | null
}

/**
 * Fetch ladder + record for one team. Returns null if the standings source
 * is unavailable or the team isn't on the ladder — callers should render a
 * fallback in that case, never crash.
 */
export const getTeamStanding = async (
  teamName: string,
  sportKey: string,
): Promise<Standing | null> => {
  try {
    const r = await fetch(
      `/api/v1/standings/team/${encodeURIComponent(teamName)}?sport=${encodeURIComponent(sportKey)}`,
    )
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export type FormResult = 'W' | 'L' | 'D'

/** Recent completed-match form for one team, latest first. null if unavailable. */
export const getTeamForm = async (
  teamName: string,
  sportKey: string,
  n = 5,
): Promise<FormResult[] | null> => {
  try {
    const r = await fetch(
      `/api/v1/form/team/${encodeURIComponent(teamName)}?sport=${encodeURIComponent(sportKey)}&n=${n}`,
    )
    if (!r.ok) return null
    const d = await r.json()
    return d.form ?? null
  } catch {
    return null
  }
}

export interface H2HResult {
  home_wins: number
  away_wins: number
  draws: number
  played: number
  last: Array<{ date: string; hteam: string; ateam: string; hscore: number; ascore: number; winner: string; for_home_side: 'H' | 'A' | 'D' }>
  source: string
}

/** Head-to-head history between two teams. null if unavailable. */
export const getH2H = async (
  homeName: string,
  awayName: string,
  sportKey: string,
  n = 10,
): Promise<H2HResult | null> => {
  try {
    const r = await fetch(
      `/api/v1/h2h?home=${encodeURIComponent(homeName)}&away=${encodeURIComponent(awayName)}&sport=${encodeURIComponent(sportKey)}&n=${n}`,
    )
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export interface TeamRatings {
  attack_rating: number
  defence_rating: number
  source: string
}

/** Attack + defence ratings normalized so 100 = league average. null if unavailable. */
export const getTeamRatings = async (
  teamName: string,
  sportKey: string,
): Promise<TeamRatings | null> => {
  try {
    const r = await fetch(
      `/api/v1/ratings/team/${encodeURIComponent(teamName)}?sport=${encodeURIComponent(sportKey)}`,
    )
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export const getSports = () =>
  fetch('/api/v1/sports').then(r => r.json())

export const getStatus = () =>
  fetch('/api/v1/status').then(r => r.json())

export const getParams = (): Promise<Record<string, number>> =>
  fetch('/api/v1/params').then(r => r.json())

// ---------------------------------------------------------------------------
// Admin API — all calls require Basic auth header
// ---------------------------------------------------------------------------

function adminHeaders(password: string) {
  return {
    Authorization: 'Basic ' + btoa('admin:' + password),
    'Content-Type': 'application/json',
  }
}

async function adminFetch(url: string, password: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...adminHeaders(password), ...(options.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const adminGetBookmakers = (pw: string) =>
  adminFetch('/admin/bookmakers', pw)

export const adminCreateBookmaker = (pw: string, body: object) =>
  adminFetch('/admin/bookmakers', pw, { method: 'POST', body: JSON.stringify(body) })

export const adminPatchBookmaker = (pw: string, id: number, body: object) =>
  adminFetch(`/admin/bookmakers/${id}`, pw, { method: 'PATCH', body: JSON.stringify(body) })

export const adminGetParams = (pw: string) =>
  adminFetch('/admin/params', pw)

export const adminPatchParam = (pw: string, key: string, value: number) =>
  adminFetch(`/admin/params/${encodeURIComponent(key)}`, pw, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  })

export const adminGetTeams = (pw: string, sportKey?: string) =>
  adminFetch(`/admin/teams${sportKey ? '?sport_key=' + sportKey : ''}`, pw)

export const adminPatchTeam = (pw: string, id: number, body: object) =>
  adminFetch(`/admin/teams/${id}`, pw, { method: 'PATCH', body: JSON.stringify(body) })

export const adminGetSystem = (pw: string) =>
  adminFetch('/admin/system', pw)

export const adminForceRefresh = (pw: string) =>
  adminFetch('/admin/system/force-refresh', pw, { method: 'POST' })

export const adminGetEvents = (pw: string) =>
  adminFetch('/admin/events', pw)

export const adminGetLineups = (pw: string, eventId?: string) =>
  adminFetch(`/admin/lineups${eventId ? '?event_id=' + eventId : ''}`, pw)

export const adminCreateLineup = (pw: string, body: object) =>
  adminFetch('/admin/lineups', pw, { method: 'POST', body: JSON.stringify(body) })

export const adminPatchLineup = (pw: string, id: number, body: object) =>
  adminFetch(`/admin/lineups/${id}`, pw, { method: 'PATCH', body: JSON.stringify(body) })

export const adminDeleteLineup = (pw: string, id: number) =>
  adminFetch(`/admin/lineups/${id}`, pw, { method: 'DELETE' })
