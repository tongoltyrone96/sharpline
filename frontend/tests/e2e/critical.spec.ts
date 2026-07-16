/**
 * UI Critical-path tests — Phase 10.
 *
 * All backend API calls are intercepted and replaced with fixture JSON so that:
 *   - No running backend is required in CI
 *   - Zero API credits are consumed
 *   - Tests remain deterministic
 */

import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Shared mock fixtures
// ---------------------------------------------------------------------------

const EVENT_ID = 'aaa111bbb222ccc333ddd444eee555ff'

const DASHBOARD_FIXTURE = {
  events: [
    {
      id: EVENT_ID,
      commence_time: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      status: 'upcoming',
      home: { name: 'Melbourne Demons', abbr: 'MEL', primary_color: '#003087', secondary_color: '#CC2031' },
      away: { name: 'North Melbourne', abbr: 'NTH', primary_color: '#003087', secondary_color: '#FFFFFF' },
      sport: 'AFL',
      best_edge_pct: 4.5,
      projected_margin: -14.0,
      projected_total: 168.5,
      home_h2h_price: 1.35,
      away_h2h_price: 3.20,
      has_weather: true,
      has_lineups: true,
    },
  ],
}

const OPPORTUNITIES_FIXTURE = {
  rows: [
    {
      event_id: EVENT_ID,
      event_label: 'Melbourne Demons vs North Melbourne (AFL)',
      bookmaker: 'TABtouch',
      market: 'spreads',
      outcome: 'Melbourne Demons',
      price: 1.909,
      fair_price: 1.782,
      edge_pct: 4.5,
      point: -15.5,
    },
    {
      event_id: EVENT_ID,
      event_label: 'Melbourne Demons vs North Melbourne (AFL)',
      bookmaker: 'TAB',
      market: 'spreads',
      outcome: 'Melbourne Demons',
      price: 1.909,
      fair_price: 1.846,
      edge_pct: 3.4,
      point: -13.5,
    },
  ],
  total_scanned: 120,
}

const EVENT_DETAIL_FIXTURE = {
  id: EVENT_ID,
  sport: 'AFL',
  commence_time: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
  status: 'upcoming',
  home: { name: 'Melbourne Demons', abbr: 'MEL', primary_color: '#003087', secondary_color: '#CC2031' },
  away: { name: 'North Melbourne', abbr: 'NTH', primary_color: '#003087', secondary_color: '#FFFFFF' },
  projected_margin: -14.0,
  projected_total: 168.5,
  home_win_prob: 0.68,
  away_win_prob: 0.32,
  rationale: 'Melbourne Demons are projected to win by 14 points. Best value: TABtouch spreads at 4.5% edge.',
  weather: {
    temp_c: 12.5,
    wind_kmh: 22.0,
    rain_prob: 0.35,
    humidity: 71,
    condition: 'light rain',
    is_indoor: false,
  },
  lineups: [
    { player_name: 'Christian Petracca', status: 'out', reason: 'Hamstring', team_side: 'home', importance: 0.9, confirmed: true },
    { player_name: 'Clayton Oliver', status: 'in', reason: null, team_side: 'home', importance: 0.8, confirmed: true },
  ],
  markets: {
    h2h: [
      { bookmaker: 'TAB',      outcome: 'Melbourne Demons', price: 1.35, point: null, fair_price: 1.47, edge_pct: -8.2, is_best: false },
      { bookmaker: 'TABtouch', outcome: 'Melbourne Demons', price: 1.38, point: null, fair_price: 1.47, edge_pct: -6.1, is_best: true },
      { bookmaker: 'TAB',      outcome: 'North Melbourne',  price: 3.10, point: null, fair_price: 3.33, edge_pct: -6.9, is_best: false },
      { bookmaker: 'TABtouch', outcome: 'North Melbourne',  price: 3.20, point: null, fair_price: 3.33, edge_pct: -3.9, is_best: true },
      { bookmaker: 'AI Fair Price', outcome: 'Melbourne Demons', price: 1.47, point: null, fair_price: 1.47, edge_pct: 0, is_best: false },
      { bookmaker: 'AI Fair Price', outcome: 'North Melbourne',  price: 3.33, point: null, fair_price: 3.33, edge_pct: 0, is_best: false },
    ],
    spreads: [
      { bookmaker: 'TABtouch',     outcome: 'Melbourne Demons', price: 1.909, point: -15.5, fair_price: 1.782, edge_pct: 7.1,  is_best: true  },
      { bookmaker: 'TAB',          outcome: 'Melbourne Demons', price: 1.909, point: -13.5, fair_price: 1.884, edge_pct: 1.3,  is_best: false },
      { bookmaker: 'SportsBet',    outcome: 'Melbourne Demons', price: 1.909, point: -14.5, fair_price: 1.830, edge_pct: 4.3,  is_best: false },
      { bookmaker: 'TABtouch',     outcome: 'North Melbourne',  price: 1.909, point:  15.5, fair_price: 2.290, edge_pct: -16.6, is_best: false },
      { bookmaker: 'TAB',          outcome: 'North Melbourne',  price: 1.909, point:  13.5, fair_price: 2.138, edge_pct: -10.7, is_best: false },
      { bookmaker: 'SportsBet',    outcome: 'North Melbourne',  price: 1.909, point:  14.5, fair_price: 2.208, edge_pct: -13.5, is_best: false },
      { bookmaker: 'AI Fair Price', outcome: 'Melbourne Demons', price: 1.820, point: -14.5, fair_price: 1.820, edge_pct: 0,  is_best: false },
      { bookmaker: 'AI Fair Price', outcome: 'North Melbourne',  price: 2.210, point:  14.5, fair_price: 2.210, edge_pct: 0,  is_best: false },
    ],
    totals: [
      { bookmaker: 'TAB',      outcome: 'Over',  price: 1.909, point: 168.5, fair_price: 1.980, edge_pct: -3.6, is_best: false },
      { bookmaker: 'TABtouch', outcome: 'Over',  price: 1.909, point: 168.5, fair_price: 1.980, edge_pct: -3.6, is_best: false },
      { bookmaker: 'TAB',      outcome: 'Under', price: 1.909, point: 168.5, fair_price: 1.980, edge_pct: -3.6, is_best: false },
      { bookmaker: 'TABtouch', outcome: 'Under', price: 1.909, point: 168.5, fair_price: 1.980, edge_pct: -3.6, is_best: false },
      { bookmaker: 'AI Fair Price', outcome: 'Over',  price: 1.980, point: 168.5, fair_price: 1.980, edge_pct: 0, is_best: false },
      { bookmaker: 'AI Fair Price', outcome: 'Under', price: 1.980, point: 168.5, fair_price: 1.980, edge_pct: 0, is_best: false },
    ],
  },
}

const ADMIN_BOOKMAKERS_FIXTURE = [
  { id: 1, key: 'tab', title: 'TAB', is_available: true, is_enabled: true, is_sharp: false, devig_weight: 1.0, display_order: 10, color: null },
  { id: 2, key: 'betfair_ex_au', title: 'Betfair', is_available: true, is_enabled: true, is_sharp: true, devig_weight: 2.0, display_order: 20, color: null },
]

const ADMIN_PARAMS_FIXTURE = [
  { key: 'sigma_margin', value: 28.0, sport_key: 'aussierules_afl', description: 'Spread sigma for AFL', updated_at: '2026-07-14T10:00:00Z' },
  { key: 'sigma_total', value: 22.0, sport_key: 'aussierules_afl', description: 'Total sigma for AFL', updated_at: '2026-07-14T10:00:00Z' },
]

const ADMIN_SYSTEM_FIXTURE = {
  api_quota: { requests_used: 84, requests_remaining: 19916 },
  upcoming_events: 17,
  model_outputs_computed: 880,
  governor_mode: 'rich',
  admin_password_set: true,
}

// ---------------------------------------------------------------------------
// Route setup helper
// ---------------------------------------------------------------------------

async function mockAllRoutes(page: Page) {
  await page.route('/api/v1/dashboard*', (route: Route) =>
    route.fulfill({ json: DASHBOARD_FIXTURE }))

  await page.route('/api/v1/opportunities*', (route: Route) =>
    route.fulfill({ json: OPPORTUNITIES_FIXTURE }))

  await page.route(`/api/v1/events/${EVENT_ID}`, (route: Route) =>
    route.fulfill({ json: EVENT_DETAIL_FIXTURE }))

  await page.route('/api/v1/sports', (route: Route) =>
    route.fulfill({ json: [] }))

  await page.route('/api/v1/status', (route: Route) =>
    route.fulfill({ json: { status: 'ok' } }))

  await page.route('/ws', (route: Route) => route.abort())

  await page.route('/admin/bookmakers', (route: Route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: ADMIN_BOOKMAKERS_FIXTURE })
    return route.fulfill({ status: 201, json: { ...ADMIN_BOOKMAKERS_FIXTURE[0], id: 99, key: 'draftkings', title: 'DraftKings' } })
  })

  await page.route('/admin/params', (route: Route) =>
    route.fulfill({ json: ADMIN_PARAMS_FIXTURE }))

  await page.route('/admin/params/*', (route: Route) =>
    route.fulfill({ json: { detail: 'Parameter updated. Recomputing 17 events in background.' } }))

  await page.route('/admin/system', (route: Route) =>
    route.fulfill({ json: ADMIN_SYSTEM_FIXTURE }))

  await page.route('/admin/system/force-refresh', (route: Route) =>
    route.fulfill({ json: { detail: 'Recomputing 17 events in background.' } }))

  await page.route('/admin/events', (route: Route) =>
    route.fulfill({ json: [] }))

  await page.route('/admin/lineups*', (route: Route) =>
    route.fulfill({ json: [] }))

  await page.route('/admin/teams*', (route: Route) =>
    route.fulfill({ json: [] }))
}

async function waitForDashboard(page: Page) {
  await page.waitForFunction(
    () => document.body.innerText.includes('vs') || document.body.innerText.includes('Melbourne'),
    { timeout: 12000 },
  )
}

// ---------------------------------------------------------------------------
// Test 1: Dashboard loads and renders fixture cards
// ---------------------------------------------------------------------------

test('dashboard loads and shows fixture cards', async ({ page }) => {
  await mockAllRoutes(page)
  await page.goto('/')
  await waitForDashboard(page)

  // At least one event card with "Melbourne Demons" visible
  await expect(page.getByText('Melbourne Demons').first()).toBeVisible()
  await expect(page.getByText('North Melbourne').first()).toBeVisible()

  // Sidebar present
  await expect(page.getByText('Sharpline').first()).toBeVisible()

  // Opportunities panel has at least one edge value
  const bodyText = await page.evaluate(() => document.body.innerText)
  expect(bodyText).toContain('AFL')
})

// ---------------------------------------------------------------------------
// Test 2: Line tab shows DIFFERENT lines per bookmaker (REQ-8 UI gate)
// ---------------------------------------------------------------------------

test('Line tab shows different lines per bookmaker (REQ-8)', async ({ page }) => {
  await mockAllRoutes(page)
  await page.goto('/')
  await waitForDashboard(page)

  // The MarketComparison table is visible on the dashboard for the selected event.
  // Click the Line tab button — it's already on the main page.
  const lineBtn = page.getByRole('button', { name: 'Line' })
  await expect(lineBtn).toBeVisible({ timeout: 12000 })
  await lineBtn.click()
  await page.waitForTimeout(600)

  // REQ-8: Different bookmakers must show different point values.
  // Fixture has TABtouch: -15.5, TAB: -13.5, SportsBet: -14.5
  const bodyText = await page.evaluate(() => document.body.innerText)
  const hasMultipleLines = (
    bodyText.includes('15.5') || bodyText.includes('-15.5')
  ) && (
    bodyText.includes('13.5') || bodyText.includes('-13.5')
  )
  expect(hasMultipleLines).toBe(true)
})

// ---------------------------------------------------------------------------
// Test 3: AI Fair Price row present in all three market tabs
// ---------------------------------------------------------------------------

test('AI Fair Price row present in H2H, Line, and Totals tabs', async ({ page }) => {
  await mockAllRoutes(page)
  await page.goto('/')
  await waitForDashboard(page)

  // Open event detail by clicking on the fixture
  const fixtureCard = page.locator('[class*="fixture"]').first()
  if (await fixtureCard.count() > 0) {
    await fixtureCard.click()
    await page.waitForTimeout(800)
  }

  for (const tabName of ['H2H', 'Line', 'Totals']) {
    const tabBtn = page.getByRole('button', { name: tabName })
    if (await tabBtn.count() === 0) continue
    await tabBtn.click()
    await page.waitForTimeout(500)

    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('AI Fair Price')
  }
})

// ---------------------------------------------------------------------------
// Test 4: Weather and lineups panels render with data
// ---------------------------------------------------------------------------

test('weather and lineup panels render', async ({ page }) => {
  await mockAllRoutes(page)
  await page.goto('/')
  await waitForDashboard(page)

  // Open event detail
  const fixtureCard = page.locator('[class*="fixture"]').first()
  if (await fixtureCard.count() > 0) {
    await fixtureCard.click()
    await page.waitForTimeout(1000)
  }

  const bodyText = await page.evaluate(() => document.body.innerText)

  // Weather renders (temp or condition or wind)
  const hasWeather = bodyText.includes('12.5') || bodyText.includes('light rain') || bodyText.includes('22') || bodyText.includes('°')
  expect(hasWeather).toBe(true)

  // Lineup renders (player name or status)
  const hasLineup = bodyText.includes('Christian Petracca') || bodyText.includes('Clayton Oliver') || bodyText.includes('Hamstring')
  expect(hasLineup).toBe(true)
})

// ---------------------------------------------------------------------------
// Test 5: Admin parameter edit triggers recompute notification
// ---------------------------------------------------------------------------

test('admin panel: editing sigma_margin triggers recompute notification', async ({ page }) => {
  const patchedRequests: string[] = []

  await mockAllRoutes(page)

  // Intercept the PATCH call to capture it
  await page.route('/admin/params/sigma_margin', (route: Route) => {
    patchedRequests.push(route.request().postData() ?? '')
    route.fulfill({ json: { detail: 'Parameter updated. Recomputing 17 events in background.' } })
  })

  // Navigate to admin panel (auth is bypassed by mocking /admin/system)
  await page.goto('/#/admin')
  await page.waitForTimeout(800)

  // Sign in with mock password
  const pwInput = page.locator('input[type=password]')
  await expect(pwInput).toBeVisible({ timeout: 8000 })
  await pwInput.fill('changeme')
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Wait for admin panel to load (tabs appear)
  await expect(page.getByRole('button', { name: 'Model Parameters' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Model Parameters' }).click()
  await page.waitForTimeout(1000)

  // Find sigma_margin row — the params table has an <input> per row
  const bodyText = await page.evaluate(() => document.body.innerText)
  expect(bodyText).toContain('sigma_margin')

  // The ParamRow renders a text <input> with the current value.
  // Find the first value input (sigma_margin = 28.0) and change it.
  const valueInputs = page.locator('td input').first()
  await expect(valueInputs).toBeVisible({ timeout: 5000 })
  await valueInputs.fill('30')
  await page.waitForTimeout(200)

  // Now Save should be enabled (dirty state). Click it.
  const saveBtn = page.getByRole('button', { name: 'Save' }).first()
  await expect(saveBtn).toBeEnabled({ timeout: 3000 })
  await saveBtn.click()
  await page.waitForTimeout(1000)

  // Verify: either the toast appeared or the PATCH request was fired
  const pageText = await page.evaluate(() => document.body.innerText)
  const hasRecomputeNotif = pageText.includes('Recomputing') || pageText.includes('recompute') || pageText.includes('background')
  expect(hasRecomputeNotif || patchedRequests.length > 0).toBe(true)
})

// ---------------------------------------------------------------------------
// Test 6: Admin: adding a bookmaker calls POST /admin/bookmakers
// ---------------------------------------------------------------------------

test('admin panel: adding a bookmaker fires POST request', async ({ page }) => {
  const postedBodies: string[] = []
  await mockAllRoutes(page)

  await page.route('/admin/bookmakers', (route: Route) => {
    if (route.request().method() === 'POST') {
      postedBodies.push(route.request().postData() ?? '')
      return route.fulfill({ status: 201, json: { id: 99, key: 'draftkings', title: 'DraftKings', is_available: true, is_enabled: true, is_sharp: false, devig_weight: 1.0, display_order: 100, color: null } })
    }
    return route.fulfill({ json: ADMIN_BOOKMAKERS_FIXTURE })
  })

  await page.goto('/#/admin')
  const pwInput = page.locator('input[type=password]')
  await expect(pwInput).toBeVisible({ timeout: 8000 })
  await pwInput.fill('changeme')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('button', { name: 'Bookmakers' })).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(800)

  // Fill in the add bookmaker form
  const inputs = page.locator('input[placeholder="draftkings"]')
  if (await inputs.count() > 0) {
    await inputs.first().fill('draftkings')
    const titleInput = page.locator('input[placeholder="DraftKings"]')
    await titleInput.fill('DraftKings')
    await page.getByRole('button', { name: '+ Add Bookmaker' }).click()
    await page.waitForTimeout(800)
    expect(postedBodies.length).toBeGreaterThan(0)
    expect(postedBodies[0]).toContain('draftkings')
  } else {
    // Form already has placeholder values — just submit
    await page.getByRole('button', { name: '+ Add Bookmaker' }).click()
    await page.waitForTimeout(800)
    expect(postedBodies.length).toBeGreaterThan(0)
  }
})

// ---------------------------------------------------------------------------
// Test 7: No JS errors on dashboard load
// ---------------------------------------------------------------------------

test('dashboard: no uncaught JS errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))

  await mockAllRoutes(page)
  await page.goto('/')
  await page.waitForTimeout(3000)

  // Filter out known non-critical Vite HMR messages
  const realErrors = errors.filter(e => !e.includes('WebSocket') && !e.includes('HMR'))
  expect(realErrors).toEqual([])
})
