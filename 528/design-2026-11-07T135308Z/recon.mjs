// Recon: log in to the isolated instance, save the session, screenshot the representative pages.
import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const BASE = 'http://localhost:3140'
const EV = process.argv[2]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', String(e)))
async function hydrated(l) { for (let i = 0; i < 120; i++) { if (await l.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps$'))).catch(() => false)) return; await page.waitForTimeout(250) } throw new Error('not hydrated') }
await page.goto(`${BASE}/login`, { timeout: 180000 })
await hydrated(page.getByLabel('Username'))
await page.getByLabel('Username').fill('kody')
await page.getByLabel('Password').fill('kodylovesyou')
await page.getByRole('button', { name: /log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 })
await ctx.storageState({ path: `${EV}/recon/state.json` })
for (const p of (process.argv[3] || '/training/plan,/me').split(',')) {
  await page.goto(BASE + p, { timeout: 180000 }); await page.waitForTimeout(4000)
  const name = p.replace(/\W+/g, '_')
  await page.screenshot({ path: `${EV}/recon/${name}.png`, fullPage: true })
  const links = await page.$$eval('a', (as) => as.map((a) => a.getAttribute('href') + ' | ' + a.textContent.trim().slice(0, 40)))
  console.log(p, '\n', [...new Set(links)].join('\n '))
}
await browser.close()
