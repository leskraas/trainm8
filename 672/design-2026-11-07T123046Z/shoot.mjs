// Drives the prototype: console errors, overflow, tap targets, fold, dismissal, screenshots.
import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const EV = process.argv[2]
const url = (q) => `file://${EV}/prototype.html?chrome=0&${q}`
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined }).catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }))
const report = {}
async function open(q, width, height = 844, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ...extra })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url(q)); await page.waitForTimeout(400)
  return { ctx, page, errors }
}
async function fullShot(page, path) {
  await page.evaluate(() => (document.documentElement.dataset.full = '1'))
  await page.screenshot({ path, fullPage: true })
  await page.evaluate(() => (document.documentElement.dataset.full = '0'))
}
async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const overflow = doc.scrollWidth - doc.clientWidth
    const targets = [...document.querySelectorAll('[data-plan-guards] a, [data-plan-guards] button')].map((el) => {
      const r = el.getBoundingClientRect(); const after = getComputedStyle(el, '::after')
      const has = after.content !== 'none' && after.position === 'absolute'
      const iy = has ? Math.max(0, -parseFloat(after.top) || 0) : 0, ix = has ? Math.max(0, -parseFloat(after.left) || 0) : 0
      const box = el.getClientRects()[0] || r
      return { what: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30), w: Math.round(Math.max(r.width, box.width) + 2 * ix), h: Math.round(box.height + 2 * iy) }
    })
    const fonts = [...new Set([...document.querySelectorAll('[data-plan-guards] .alert-desc')].map((el) => getComputedStyle(el).fontSize))]
    const g = document.querySelector('[data-plan-guards]')
    const firstNoticeTop = g ? Math.round(g.getBoundingClientRect().top + scrollY) : null
    const leadBottom = Math.round(document.querySelector('[data-plan-lead] .card').getBoundingClientRect().bottom + scrollY)
    const notices = document.querySelectorAll('[data-notice]').length
    const where = g?.dataset.planGuards ?? null
    return { overflow, targets, fonts, firstNoticeTop, leadBottom, notices, where }
  })
}
for (const v of [1, 2]) for (const data of ['demo', 'worst', 'none']) for (const theme of ['light', 'dark']) {
  const name = `${v === 1 ? 'today' : 'under-the-card'}-${data}-${theme}`
  for (const [w, label] of [[390, 'mobile'], [1440, 'desktop']]) {
    const { ctx, page, errors } = await open(`v=${v}&data=${data}&theme=${theme}`, w, w === 390 ? 844 : 900)
    const m = await measure(page)
    report[`${name}-${label}`] = { ...m, errors }
    if (theme === 'light' && data !== 'none' || (data === 'none' && theme === 'light' && v === 2)) {
      await page.screenshot({ path: `${EV}/shots/${name}-${label}-fold.png` })
      await fullShot(page, `${EV}/shots/${name}-${label}-full.png`)
    }
    if (theme === 'dark' && data === 'worst' && v === 2) await fullShot(page, `${EV}/shots/${name}-${label}-full.png`)
    await ctx.close()
  }
}
// Each notice once: open Avansert in variant 2 and count notices on the whole page.
{ const { ctx, page } = await open('v=2&data=worst&adv=1', 390); await page.waitForTimeout(300)
  report.onceWithAvansertOpen = await page.evaluate(() => ({ notices: document.querySelectorAll('[data-notice]').length, inBlocks: document.querySelectorAll('[data-blocks-reading] [data-notice]').length }))
  await fullShot(page, `${EV}/shots/under-the-card-worst-avansert-open-mobile-full.png`); await ctx.close() }
// Dismiss: the notice goes, focus lands on the sr-only line; a reload brings it back.
{ const { ctx, page } = await open('v=2&data=demo', 390)
  await page.click('[data-dismiss="ramp"]')
  const after = await page.evaluate(() => ({ notices: document.querySelectorAll('[data-notice]').length, focus: document.activeElement?.textContent }))
  await page.reload(); await page.waitForTimeout(300)
  const reload = await page.evaluate(() => document.querySelectorAll('[data-notice]').length)
  report.dismiss = { ...after, afterReload: reload }; await ctx.close() }
// 320px and 200% zoom (root font) on the worst case
{ const { ctx, page } = await open('v=2&data=worst', 320, 700); report['under-the-card-worst-320'] = await measure(page); await ctx.close() }
{ const { ctx, page } = await open('v=2&data=worst', 390); await page.addStyleTag({ content: 'html{zoom:2}' }); await page.waitForTimeout(200)
  report['under-the-card-worst-zoom200'] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); await ctx.close() }
console.log(JSON.stringify(report, null, 1))
await browser.close()
