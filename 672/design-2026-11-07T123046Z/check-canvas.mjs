import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const EV = process.argv[2]
const b = await chromium.launch()
for (const w of [390, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } })
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await p.goto(`file://${EV}/canvas.html`); await p.waitForTimeout(1500)
  const frames = p.frames().length
  const n = []
  for (const f of p.frames().slice(1)) n.push(await f.evaluate(() => document.querySelectorAll('[data-notice]').length).catch((e) => String(e)))
  const ovf = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log(w, { errs, frames, n, ovf })
  await p.screenshot({ path: `${EV}/shots/canvas-${w}.png` })
}
await b.close()
