// Recon 2: reuse the saved session; full-page shots of given paths at 390 light.
import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const BASE = 'http://localhost:3140'
const EV = process.argv[2]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: `${EV}/recon/state.json` })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', String(e)))
for (const p of process.argv[3].split(',')) {
  await page.goto(BASE + p, { timeout: 180000 }); await page.waitForTimeout(3000)
  console.log(p, await page.evaluate(() => document.documentElement.scrollHeight))
  const name = p.replace(/\W+/g, '_').slice(0, 60)
  await page.screenshot({ path: `${EV}/recon/${name}.png`, fullPage: true, timeout: 120000, animations: 'disabled' })
  console.log(p, await page.evaluate(() => document.documentElement.scrollHeight))
}
await browser.close()
