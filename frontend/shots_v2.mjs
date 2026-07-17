import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'shots_v2')
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://127.0.0.1:5173'

const browser = await chromium.launch({ headless: true })

// Desktop
const desk = await browser.newPage()
await desk.setViewportSize({ width: 1440, height: 900 })
await desk.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 })
// wait for real data
try {
  await desk.waitForFunction(
    () => document.body.innerText.includes('Live Board') && !document.body.innerText.includes('Loading fixtures'),
    { timeout: 20000 }
  )
} catch (e) { console.log('wait timeout:', e.message) }
await desk.waitForTimeout(3500)

await desk.screenshot({ path: path.join(OUT, 'v2_dashboard_desktop_viewport.png'), fullPage: false })
await desk.screenshot({ path: path.join(OUT, 'v2_dashboard_desktop_full.png'), fullPage: true })
console.log('desktop shots done')

// Mobile
const mob = await browser.newPage()
await mob.setViewportSize({ width: 390, height: 844 })
await mob.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 })
try {
  await mob.waitForFunction(
    () => document.body.innerText.includes('Live Board'),
    { timeout: 20000 }
  )
} catch {}
await mob.waitForTimeout(3500)
await mob.screenshot({ path: path.join(OUT, 'v2_dashboard_mobile_viewport.png'), fullPage: false })
await mob.screenshot({ path: path.join(OUT, 'v2_dashboard_mobile_full.png'), fullPage: true })
console.log('mobile shots done')

await browser.close()
console.log('OK', OUT)
fs.readdirSync(OUT).forEach(f => {
  console.log(`  ${f} (${Math.round(fs.statSync(path.join(OUT, f)).size/1024)}KB)`)
})
