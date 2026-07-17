import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'shots_v2')
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'https://frontend-two-sigma-19.vercel.app'

const browser = await chromium.launch({ headless: true })

// Desktop dashboard
const d = await browser.newPage()
await d.setViewportSize({ width: 1440, height: 900 })
await d.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })
await d.waitForTimeout(5000)
await d.screenshot({ path: path.join(OUT, 'prod_dashboard_viewport.png'), fullPage: false })
await d.screenshot({ path: path.join(OUT, 'prod_dashboard_full.png'), fullPage: true })
console.log('dashboard shots done')

// Fetch first event id from real API to navigate to game page
const dashJson = await d.evaluate(() =>
  fetch('/api/v1/dashboard').then(r => r.json())
)
const eid = dashJson?.events?.[0]?.id
console.log('first event id:', eid)

if (eid) {
  const g = await browser.newPage()
  await g.setViewportSize({ width: 1440, height: 900 })
  await g.goto(`${BASE}/#/game/${eid}`, { waitUntil: 'networkidle', timeout: 30000 })
  await g.waitForTimeout(5000)
  await g.screenshot({ path: path.join(OUT, 'prod_game_viewport.png'), fullPage: false })
  await g.screenshot({ path: path.join(OUT, 'prod_game_full.png'), fullPage: true })
  console.log('game shots done')
}

// Mobile
const m = await browser.newPage()
await m.setViewportSize({ width: 390, height: 844 })
await m.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })
await m.waitForTimeout(5000)
await m.screenshot({ path: path.join(OUT, 'prod_dashboard_mobile.png'), fullPage: true })
console.log('mobile shot done')

await browser.close()
console.log('OK', OUT)
fs.readdirSync(OUT).filter(f => f.startsWith('prod_')).forEach(f => {
  console.log(`  ${f} (${Math.round(fs.statSync(path.join(OUT, f)).size/1024)}KB)`)
})
