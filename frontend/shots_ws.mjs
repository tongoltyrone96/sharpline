import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'shots_v2')
const BASE = 'https://frontend-two-sigma-19.vercel.app'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on('console', msg => {
  if (msg.text().includes('WebSocket')) console.log('WS:', msg.text())
})
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(6000)
const bodyText = await page.evaluate(() => document.body.innerText)
const isOnline = bodyText.includes('ONLINE')
const isOffline = bodyText.includes('OFFLINE')
console.log('MODEL ONLINE:', isOnline, '  MODEL OFFLINE:', isOffline)
await page.screenshot({ path: path.join(OUT, 'prod_ws_status.png'), fullPage: false, clip: { x: 0, y: 34, width: 1440, height: 130 } })
console.log('shot saved')
await browser.close()
