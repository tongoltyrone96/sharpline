import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  adminCreateBookmaker,
  adminCreateLineup,
  adminDeleteLineup,
  adminForceRefresh,
  adminGetBookmakers,
  adminGetEvents,
  adminGetLineups,
  adminGetParams,
  adminGetSystem,
  adminGetTeams,
  adminPatchBookmaker,
  adminPatchLineup,
  adminPatchParam,
  adminPatchTeam,
} from '../lib/api'

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

const cell: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--line)',
  fontSize: 12,
  color: 'var(--text)',
  verticalAlign: 'middle',
}

const th: React.CSSProperties = {
  ...cell,
  fontWeight: 700,
  fontSize: 10.5,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  background: 'var(--panel)',
}

const btn = (variant: 'primary' | 'danger' | 'ghost' = 'primary'): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 7,
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  background:
    variant === 'primary' ? 'var(--blue)' :
    variant === 'danger'  ? '#ef4444' :
    'var(--panel)',
  color: variant === 'ghost' ? 'var(--text-2)' : '#fff',
})

const input: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 7,
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--text)',
  width: '100%',
  boxSizing: 'border-box',
}

const label: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-3)',
  fontWeight: 600,
  marginBottom: 4,
  display: 'block',
}

function toast(msg: string, ok = true) {
  const el = document.createElement('div')
  el.textContent = msg
  Object.assign(el.style, {
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    background: ok ? '#22c55e' : '#ef4444',
    color: '#fff', padding: '10px 18px', borderRadius: 10,
    fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  })
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

function useAdminAuth() {
  const [password, setPassword] = useState<string>(() => sessionStorage.getItem('admin_pw') ?? '')
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(false)

  const attempt = useCallback(async (pw: string) => {
    setChecking(true)
    try {
      await adminGetSystem(pw)
      sessionStorage.setItem('admin_pw', pw)
      setPassword(pw)
      setAuthed(true)
    } catch {
      toast('Wrong password', false)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (password) attempt(password)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = () => {
    sessionStorage.removeItem('admin_pw')
    setPassword('')
    setAuthed(false)
  }

  return { password, authed, checking, attempt, logout }
}

// ---------------------------------------------------------------------------
// Tab 1 — Bookmakers
// ---------------------------------------------------------------------------

interface Bookmaker {
  id: number; key: string; title: string; is_available: boolean
  is_enabled: boolean; is_sharp: boolean; devig_weight: number
  display_order: number; color: string | null
}

function BookmakersTab({ pw }: { pw: string }) {
  const [rows, setRows] = useState<Bookmaker[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    key: '', title: '', is_enabled: true, is_sharp: false,
    devig_weight: 1.0, display_order: 100, color: '',
  })
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await adminGetBookmakers(pw)) } catch (e: any) { toast(e.message, false) }
    setLoading(false)
  }, [pw])

  useEffect(() => { load() }, [load])

  const patch = async (id: number, body: object) => {
    try {
      const updated = await adminPatchBookmaker(pw, id, body)
      setRows(r => r.map(bm => bm.id === id ? updated : bm))
      toast('Saved')
    } catch (e: any) { toast(e.message, false) }
  }

  const create = async () => {
    if (!form.key || !form.title) { toast('Key and title required', false); return }
    setAdding(true)
    try {
      await adminCreateBookmaker(pw, {
        ...form,
        color: form.color || null,
        devig_weight: Number(form.devig_weight),
        display_order: Number(form.display_order),
      })
      toast('Bookmaker created')
      setForm({ key: '', title: '', is_enabled: true, is_sharp: false, devig_weight: 1.0, display_order: 100, color: '' })
      load()
    } catch (e: any) { toast(e.message, false) }
    setAdding(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>Bookmakers</h3>

      {/* Add form */}
      <div style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12 }}>Add Bookmaker</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <span style={label}>API Key</span>
            <input style={input} value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} placeholder="draftkings" />
          </div>
          <div>
            <span style={label}>Display Title</span>
            <input style={input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="DraftKings" />
          </div>
          <div>
            <span style={label}>Devig Weight</span>
            <input style={input} type="number" step="0.1" min="0" max="5" value={form.devig_weight}
              onChange={e => setForm(f => ({ ...f, devig_weight: parseFloat(e.target.value) }))} />
          </div>
          <div>
            <span style={label}>Display Order</span>
            <input style={input} type="number" value={form.display_order}
              onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) }))} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_sharp} onChange={e => setForm(f => ({ ...f, is_sharp: e.target.checked }))} />
              Sharp
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_enabled} onChange={e => setForm(f => ({ ...f, is_enabled: e.target.checked }))} />
              Enabled
            </label>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button style={btn('primary')} onClick={create} disabled={adding}>
            {adding ? 'Adding…' : '+ Add Bookmaker'}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Key', 'Title', 'Available', 'Enabled', 'Sharp', 'Devig Wt', 'Order'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(bm => (
                <tr key={bm.id} style={{ background: bm.is_enabled ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td style={cell}><code style={{ fontSize: 11 }}>{bm.key}</code></td>
                  <td style={cell}>{bm.title}</td>
                  <td style={cell}>
                    <span style={{ color: bm.is_available ? 'var(--green)' : 'var(--text-3)', fontSize: 11 }}>
                      {bm.is_available ? '● Live' : '○ Offline'}
                    </span>
                  </td>
                  <td style={cell}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                      <input type="checkbox" checked={bm.is_enabled}
                        onChange={e => patch(bm.id, { is_enabled: e.target.checked })} />
                      {bm.is_enabled ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td style={cell}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                      <input type="checkbox" checked={bm.is_sharp}
                        onChange={e => patch(bm.id, { is_sharp: e.target.checked })} />
                      {bm.is_sharp ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td style={cell}>
                    <InlineNumberEdit value={bm.devig_weight} step={0.1} min={0} max={5}
                      onSave={v => patch(bm.id, { devig_weight: v })} />
                  </td>
                  <td style={cell}>
                    <InlineNumberEdit value={bm.display_order} step={1} min={0} max={999}
                      onSave={v => patch(bm.id, { display_order: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 — Model Parameters
// ---------------------------------------------------------------------------

interface Param {
  key: string; value: number; sport_key: string | null
  description: string | null; updated_at: string
}

function ParamsTab({ pw }: { pw: string }) {
  const [rows, setRows] = useState<Param[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    adminGetParams(pw).then(setRows).catch((e: any) => toast(e.message, false)).finally(() => setLoading(false))
  }, [pw])

  const save = async (key: string, value: number) => {
    setSaving(key)
    try {
      const res = await adminPatchParam(pw, key, value)
      setRows(r => r.map(p => p.key === key ? { ...p, value } : p))
      toast(res.detail ?? 'Saved — recomputing in background')
    } catch (e: any) { toast(e.message, false) }
    setSaving(null)
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>Model Parameters</h3>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>
        Saving any parameter triggers a background recompute of the next 30 upcoming events.
      </p>

      {loading ? <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading…</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Key', 'Sport', 'Value', 'Description', 'Last Updated', ''].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <ParamRow key={p.key} param={p} saving={saving === p.key} onSave={v => save(p.key, v)} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ParamRow({ param, saving, onSave }: { param: Param; saving: boolean; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState(String(param.value))
  const dirty = parseFloat(draft) !== param.value && !isNaN(parseFloat(draft))

  return (
    <tr>
      <td style={cell}><code style={{ fontSize: 11 }}>{param.key}</code></td>
      <td style={cell}><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{param.sport_key ?? 'global'}</span></td>
      <td style={{ ...cell, width: 110 }}>
        <input
          style={{ ...input, width: 90 }}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && dirty) onSave(parseFloat(draft)) }}
        />
      </td>
      <td style={{ ...cell, color: 'var(--text-3)', fontSize: 11 }}>{param.description ?? '—'}</td>
      <td style={{ ...cell, fontSize: 11, color: 'var(--text-3)' }}>
        {new Date(param.updated_at).toLocaleString()}
      </td>
      <td style={cell}>
        <button
          style={btn(dirty ? 'primary' : 'ghost')}
          disabled={!dirty || saving}
          onClick={() => onSave(parseFloat(draft))}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Tab 3 — Lineups
// ---------------------------------------------------------------------------

interface LineupEvent { id: string; sport: string; home_name: string; away_name: string; commence_time: string }
interface LineupRow {
  id: number; event_id: string; team_id: number; player_name: string
  status: string; reason: string | null; importance: number; source: string
  confirmed: boolean; updated_at: string
}

const STATUS_OPTS = ['in', 'out', 'doubtful', 'questionable']

function LineupsTab({ pw }: { pw: string }) {
  const [events, setEvents] = useState<LineupEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<string>('')
  const [lineups, setLineups] = useState<LineupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    team_id: '', player_name: '', status: 'out', reason: '', importance: 0.5, confirmed: false,
  })

  useEffect(() => {
    adminGetEvents(pw).then(setEvents).catch((e: any) => toast(e.message, false))
  }, [pw])

  useEffect(() => {
    if (!selectedEvent) { setLineups([]); return }
    setLoading(true)
    adminGetLineups(pw, selectedEvent)
      .then(setLineups)
      .catch((e: any) => toast(e.message, false))
      .finally(() => setLoading(false))
  }, [pw, selectedEvent])

  const reload = () => {
    if (!selectedEvent) return
    adminGetLineups(pw, selectedEvent).then(setLineups).catch(() => {})
  }

  const create = async () => {
    if (!selectedEvent || !form.player_name || !form.team_id) {
      toast('Select event, team, and enter player name', false); return
    }
    try {
      await adminCreateLineup(pw, {
        event_id: selectedEvent,
        team_id: parseInt(form.team_id),
        player_name: form.player_name,
        status: form.status,
        reason: form.reason || null,
        importance: Number(form.importance),
        confirmed: form.confirmed,
      })
      toast('Lineup entry created')
      setForm({ team_id: '', player_name: '', status: 'out', reason: '', importance: 0.5, confirmed: false })
      reload()
    } catch (e: any) { toast(e.message, false) }
  }

  const del = async (id: number) => {
    try {
      await adminDeleteLineup(pw, id)
      toast('Deleted')
      reload()
    } catch (e: any) { toast(e.message, false) }
  }

  const statusColor = (s: string) => ({
    in: 'var(--green)', out: '#ef4444', doubtful: 'var(--amber)', questionable: '#f97316'
  }[s] ?? 'var(--text-3)')

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>Manual Lineups</h3>

      {/* Event picker */}
      <div style={{ marginBottom: 16 }}>
        <span style={label}>Event</span>
        <select
          style={{ ...input, width: 'auto', minWidth: 320 }}
          value={selectedEvent}
          onChange={e => setSelectedEvent(e.target.value)}
        >
          <option value="">— select event —</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>
              {new Date(ev.commence_time).toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' — '}{ev.home_name} vs {ev.away_name} ({ev.sport})
            </option>
          ))}
        </select>
      </div>

      {selectedEvent && (
        <>
          {/* Add form */}
          <div style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12 }}>Add Player</div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 130px 1fr auto', gap: 10, alignItems: 'end' }}>
              <div>
                <span style={label}>Team ID</span>
                <input style={input} type="number" value={form.team_id}
                  onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))} placeholder="123" />
              </div>
              <div>
                <span style={label}>Player Name</span>
                <input style={input} value={form.player_name}
                  onChange={e => setForm(f => ({ ...f, player_name: e.target.value }))} placeholder="Player Name" />
              </div>
              <div>
                <span style={label}>Status</span>
                <select style={input} value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <span style={label}>Reason (optional)</span>
                <input style={input} value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Hamstring injury" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.confirmed}
                    onChange={e => setForm(f => ({ ...f, confirmed: e.target.checked }))} />
                  Confirmed
                </label>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, color: 'var(--text-3)' }}>
                  Imp:
                  <input style={{ ...input, width: 55, padding: '4px 6px' }} type="number" step="0.1" min="0" max="1"
                    value={form.importance}
                    onChange={e => setForm(f => ({ ...f, importance: parseFloat(e.target.value) }))} />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <button style={btn('primary')} onClick={create}>+ Add</button>
            </div>
          </div>

          {/* Lineup table */}
          {loading ? <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading…</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Player', 'Team ID', 'Status', 'Reason', 'Imp', 'Src', 'Confirmed', ''].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {lineups.length === 0 && (
                  <tr><td colSpan={8} style={{ ...cell, color: 'var(--text-3)', textAlign: 'center' }}>No entries for this event</td></tr>
                )}
                {lineups.map(l => (
                  <tr key={l.id}>
                    <td style={cell}>{l.player_name}</td>
                    <td style={cell}>{l.team_id}</td>
                    <td style={cell}>
                      <span style={{ color: statusColor(l.status), fontWeight: 600, fontSize: 11 }}>{l.status}</span>
                    </td>
                    <td style={{ ...cell, color: 'var(--text-3)', fontSize: 11 }}>{l.reason ?? '—'}</td>
                    <td style={cell}>{l.importance.toFixed(1)}</td>
                    <td style={cell}><span style={{ fontSize: 10, color: l.source === 'manual' ? 'var(--blue)' : 'var(--text-3)' }}>{l.source}</span></td>
                    <td style={cell}>{l.confirmed ? '✓' : '—'}</td>
                    <td style={cell}>
                      {l.source === 'manual' && (
                        <button style={btn('danger')} onClick={() => del(l.id)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 4 — Teams
// ---------------------------------------------------------------------------

interface Team {
  id: number; sport_id: number; name: string; abbreviation: string
  primary_color: string; secondary_color: string; logo_url: string | null
  venue_name: string | null; venue_lat: number | null; venue_lon: number | null
  is_indoor: boolean
}

function TeamsTab({ pw }: { pw: string }) {
  const [rows, setRows] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Partial<Team>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminGetTeams(pw).then(setRows).catch((e: any) => toast(e.message, false)).finally(() => setLoading(false))
  }, [pw])

  const startEdit = (t: Team) => { setEditId(t.id); setDraft({ ...t }) }
  const cancel = () => { setEditId(null); setDraft({}) }

  const save = async () => {
    if (editId === null) return
    setSaving(true)
    try {
      const updated = await adminPatchTeam(pw, editId, draft)
      setRows(r => r.map(t => t.id === editId ? updated : t))
      toast('Team saved')
      setEditId(null)
    } catch (e: any) { toast(e.message, false) }
    setSaving(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>Teams</h3>
      {loading ? <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Name', 'Abbr', 'Primary', 'Secondary', 'Venue', 'Indoor', ''].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map(t => editId === t.id ? (
                <tr key={t.id} style={{ background: 'rgba(79,125,243,0.06)' }}>
                  <td style={cell}><input style={{ ...input, width: 140 }} value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></td>
                  <td style={cell}><input style={{ ...input, width: 60 }} value={draft.abbreviation ?? ''} onChange={e => setDraft(d => ({ ...d, abbreviation: e.target.value }))} /></td>
                  <td style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="color" value={draft.primary_color ?? '#333'} onChange={e => setDraft(d => ({ ...d, primary_color: e.target.value }))} style={{ width: 28, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                      <input style={{ ...input, width: 70 }} value={draft.primary_color ?? ''} onChange={e => setDraft(d => ({ ...d, primary_color: e.target.value }))} />
                    </div>
                  </td>
                  <td style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="color" value={draft.secondary_color ?? '#888'} onChange={e => setDraft(d => ({ ...d, secondary_color: e.target.value }))} style={{ width: 28, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                      <input style={{ ...input, width: 70 }} value={draft.secondary_color ?? ''} onChange={e => setDraft(d => ({ ...d, secondary_color: e.target.value }))} />
                    </div>
                  </td>
                  <td style={cell}><input style={{ ...input, width: 160 }} value={draft.venue_name ?? ''} onChange={e => setDraft(d => ({ ...d, venue_name: e.target.value }))} placeholder="Venue name" /></td>
                  <td style={cell}>
                    <input type="checkbox" checked={draft.is_indoor ?? false} onChange={e => setDraft(d => ({ ...d, is_indoor: e.target.checked }))} />
                  </td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                    <button style={{ ...btn('primary'), marginRight: 6 }} onClick={save} disabled={saving}>{saving ? '…' : 'Save'}</button>
                    <button style={btn('ghost')} onClick={cancel}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td style={cell}>{t.name}</td>
                  <td style={cell}><code style={{ fontSize: 11 }}>{t.abbreviation}</code></td>
                  <td style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: t.primary_color, display: 'inline-block', border: '1px solid var(--line)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.primary_color}</span>
                    </div>
                  </td>
                  <td style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: t.secondary_color, display: 'inline-block', border: '1px solid var(--line)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.secondary_color}</span>
                    </div>
                  </td>
                  <td style={{ ...cell, color: 'var(--text-3)', fontSize: 11 }}>{t.venue_name ?? '—'}</td>
                  <td style={cell}>{t.is_indoor ? '✓' : '—'}</td>
                  <td style={cell}><button style={btn('ghost')} onClick={() => startEdit(t)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 5 — System
// ---------------------------------------------------------------------------

interface SystemStatus {
  api_quota: { requests_used: number | null; requests_remaining: number | null }
  upcoming_events: number
  model_outputs_computed: number
  governor_mode: string
  admin_password_set: boolean
}

function SystemTab({ pw }: { pw: string }) {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setStatus(await adminGetSystem(pw)) } catch (e: any) { toast(e.message, false) }
    setLoading(false)
  }, [pw])

  useEffect(() => { load() }, [load])

  const forceRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await adminForceRefresh(pw)
      toast(res?.detail ?? 'Recompute started')
      setTimeout(load, 2000)
    } catch (e: any) { toast(e.message, false) }
    setRefreshing(false)
  }

  const stat = (label: string, value: React.ReactNode, accent = false) => (
    <div style={{
      background: 'var(--panel-2)', border: '1px solid var(--line)',
      borderRadius: 10, padding: '16px 18px',
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ? 'var(--blue)' : 'var(--text-1)' }}>{value}</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>System Status</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn('ghost')} onClick={load}>Refresh</button>
          <button style={btn('primary')} onClick={forceRefresh} disabled={refreshing}>
            {refreshing ? 'Recomputing…' : 'Force Recompute'}
          </button>
        </div>
      </div>

      {loading || !status ? <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading…</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {stat('API Requests Used', status.api_quota.requests_used ?? '—')}
            {stat('API Requests Remaining', status.api_quota.requests_remaining ?? '—', true)}
            {stat('Upcoming Events', status.upcoming_events)}
            {stat('Model Outputs Computed', status.model_outputs_computed.toLocaleString())}
            {stat('Governor Mode', status.governor_mode)}
            {stat('Admin Password Set', status.admin_password_set ? '✓ Yes' : '✗ No')}
          </div>

          {!status.admin_password_set && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#f87171',
            }}>
              Warning: ADMIN_PASSWORD is still set to the default "changeme". Set a strong password in your environment variables.
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared: inline numeric editor
// ---------------------------------------------------------------------------

function InlineNumberEdit({ value, step, min, max, onSave }: {
  value: number; step: number; min: number; max: number; onSave: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.select() }, [editing])

  const commit = () => {
    const v = parseFloat(draft)
    if (!isNaN(v)) onSave(v)
    setEditing(false)
  }

  if (!editing) return (
    <span
      style={{ cursor: 'pointer', borderBottom: '1px dashed var(--text-3)', fontSize: 12 }}
      onClick={() => { setDraft(String(value)); setEditing(true) }}
    >{value}</span>
  )

  return (
    <input
      ref={ref}
      style={{ ...input, width: 70, padding: '3px 6px' }}
      type="number" step={step} min={min} max={max}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
    />
  )
}

// ---------------------------------------------------------------------------
// Main Admin component
// ---------------------------------------------------------------------------

const TABS = ['Bookmakers', 'Model Parameters', 'Lineups', 'Teams', 'System'] as const
type Tab = typeof TABS[number]

export default function Admin() {
  const { password, authed, checking, attempt, logout } = useAdminAuth()
  const [tab, setTab] = useState<Tab>('Bookmakers')
  const [pwInput, setPwInput] = useState('')

  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{
          background: 'var(--panel-2)', border: '1px solid var(--line)',
          borderRadius: 16, padding: '36px 40px', width: 340,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#4F7DF3,#8B5CF6)',
              display: 'grid', placeItems: 'center',
            }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="#fff" strokeWidth="1.8"/>
                <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Admin Panel</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em' }}>SHARPLINE</div>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <span style={label}>Admin Password</span>
            <input
              style={input}
              type="password"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') attempt(pwInput) }}
              placeholder="Enter admin password"
              autoFocus
            />
          </div>
          <button
            style={{ ...btn('primary'), width: '100%', padding: '10px 0' }}
            onClick={() => attempt(pwInput)}
            disabled={checking}
          >
            {checking ? 'Checking…' : 'Sign In'}
          </button>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <a href="/" style={{ fontSize: 11, color: 'var(--text-3)', textDecoration: 'none' }}>← Back to Dashboard</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24,
        paddingBottom: 16, borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>← Dashboard</a>
          <span style={{ color: 'var(--line)' }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Admin Panel</span>
        </div>
        <button style={btn('ghost')} onClick={logout}>Sign Out</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 600,
            background: t === tab ? 'var(--blue)' : 'var(--panel)',
            color: t === tab ? '#fff' : 'var(--text-2)',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{
        background: 'var(--panel-2)', border: '1px solid var(--line)',
        borderRadius: 12, padding: 24,
      }}>
        {tab === 'Bookmakers'       && <BookmakersTab pw={password} />}
        {tab === 'Model Parameters' && <ParamsTab pw={password} />}
        {tab === 'Lineups'          && <LineupsTab pw={password} />}
        {tab === 'Teams'            && <TeamsTab pw={password} />}
        {tab === 'System'           && <SystemTab pw={password} />}
      </div>
    </div>
  )
}
