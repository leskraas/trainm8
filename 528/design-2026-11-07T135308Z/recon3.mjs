// Recon 3: list the buttons on a page (names) to find popover triggers.
import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const EV = process.argv[2]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: `${EV}/recon/state.json` })
const page = await ctx.newPage()
for (const p of process.argv[3].split(',')) {
  await page.goto('http://localhost:3140' + p, { timeout: 180000 }); await page.waitForTimeout(2500)
  const names = await page.$$eval('button, a, [role=button]', (els) => els.map((e) => (e.getAttribute('aria-label') || e.textContent.trim()).slice(0, 60) + (e.dataset.slot ? ' [' + e.dataset.slot + ']' : '')))
  console.log('==', p, '\n', names.join('\n '))
}
await browser.close()
