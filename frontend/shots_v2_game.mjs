import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'shots_v2')
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://127.0.0.1:5173'
const EID = process.argv[2] || '4875a316f7a8705e7b6fba48b548ff97'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/#/game/${EID}`, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(4500)
await page.screenshot({ path: path.join(OUT, 'v2_game_desktop_viewport.png'), fullPage: false })
await page.screenshot({ path: path.join(OUT, 'v2_game_desktop_full.png'), fullPage: true })
console.log('desktop shots done')

const mob = await browser.newPage()
await mob.setViewportSize({ width: 390, height: 844 })
await mob.goto(`${BASE}/#/game/${EID}`, { waitUntil: 'networkidle', timeout: 30000 })
await mob.waitForTimeout(4500)
await mob.screenshot({ path: path.join(OUT, 'v2_game_mobile_full.png'), fullPage: true })
console.log('mobile shot done')
await browser.close()
