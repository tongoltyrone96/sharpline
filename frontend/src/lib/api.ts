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
