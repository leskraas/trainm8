// Flips through every page x variant x theme x width x data in prototype.html: console errors,
// a rendered image or ladder, no sideways scroll at 390; screenshots of the variant board.
import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const EV = process.argv[2]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []; page.on('console', (m) => m.type() === 'error' && errors.push(m.text())); page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(`file://${EV}/prototype.html`); await page.waitForTimeout(300)
const pages = await page.$$eval('#page option', (o) => o.map((x) => x.value))
const missing = []
for (const p of pages) for (const v of [1, 2]) for (const theme of ['light', 'dark']) for (const w of ['390', '1440']) for (const data of ['demo', 'worst']) {
  await page.goto(`file://${EV}/prototype.html?page=${p}&v=${v}&theme=${theme}&w=${w}&data=${data}`); await page.waitForTimeout(60)
  const r = await page.evaluate(() => ({ img: !!document.querySelector('#stage img.shot, #stage .zl'), note: document.querySelector('#stage .note')?.textContent || '', overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }))
  if (!r.img && !(data === 'worst' && !['session','session-sets','session-strength','lift','plan-span','plan-weeks'].includes(p)) && !(v === 1 && data === 'worst') && !(data === 'demo' && p === 'session-strength')) missing.push(`${p} v${v} ${theme} ${w} ${data}: ${r.note}`)
  if (r.overflow > 0 && w === '390') missing.push(`overflow ${p} v${v} ${w}`)
}
// keyboard contract
await page.goto(`file://${EV}/prototype.html?page=session-sets`); await page.keyboard.press('2'); await page.waitForTimeout(100)
const k = await page.evaluate(() => document.querySelector('.proto-picker-item[data-active]').textContent)
for (const [v, name] of [[1, 'today'], [2, 'role-steps']]) for (const p of ['zones']) for (const theme of ['light', 'dark']) {
  await page.goto(`file://${EV}/prototype.html?page=${p}&v=${v}&theme=${theme}`); await page.waitForTimeout(150)
  await page.screenshot({ path: `${EV}/recon/proto-${p}-${name}-${theme}.png`, fullPage: true })
}
console.log(JSON.stringify({ errors, missing, keyActive: k }, null, 1))
await browser.close()
