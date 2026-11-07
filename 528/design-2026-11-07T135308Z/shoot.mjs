// Screenshots of the real app (isolated instance on :3140) for one look: `today` (origin/main's code)
// or `rounded` (the copy with the sweep applied). States x 390/1440 x light/dark.
// Usage: node shoot.mjs <evidence dir> <label> [state,state...]
import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const BASE = 'http://localhost:3140'
const [EV, LABEL, ONLY, THEMES = 'light,dark', WIDTHS = '390,1440'] = process.argv.slice(2)
const OUT = `${EV}/shots/${LABEL}`; fs.mkdirSync(OUT, { recursive: true })
const HIDE = `body > div.fixed.left-3, body > div:has(button[class^="go"]) { display: none !important }`
const cardOf = (page, text) => page.getByText(text, { exact: true }).first().locator('xpath=ancestor::*[@data-slot="card"][1]')
const STATES = {
  'plan-span': { path: '/training/plan#avansert', el: (p) => cardOf(p, 'Hva planen består av') },
  'plan-phase': { path: '/training/plan#avansert', el: (p) => p.locator('[data-slot=card][role=article]').filter({ hasText: 'Spissing' }).first() },
  'plan-season-edit': { path: '/training/plan#avansert', prep: async (p) => { await p.getByText('Endre ukemålet', { exact: true }).first().click(); await p.waitForTimeout(600) }, el: (p) => cardOf(p, 'Endre sesongen') },
  'plan-weeks': { path: '/training/plan?tab=weeks#avansert', prep: async (p) => { await p.getByText('Uke 44', { exact: true }).first().click(); await p.waitForTimeout(500) }, el: (p) => cardOf(p, 'Uke for uke') },
  'session': { path: '/training/sessions/cmw6enlkj00aq7dqrwme9r98c', shot: 'viewport' },
  'session-intensity': { path: '/training/sessions/cmw6enlkj00aq7dqrwme9r98c', prep: async (p) => { await p.locator('button:has([data-token-type="intensity"])').nth(1).click(); await p.waitForTimeout(500) }, shot: 'viewport' },
  'session-sets': { path: '/training/sessions/cmw6enllf00aw7dqr4rs30irn', prep: async (p) => { await p.getByRole('button', { name: /^sett: .*steg 1 av 3/ }).click(); await p.waitForTimeout(500) }, shot: 'viewport' },
  'session-strength': { path: '/training/sessions/cmw6enllf00aw7dqr4rs30irn', prep: async (p) => { await p.locator('[data-slot=popover-trigger]').first().scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 160)) }, shot: 'viewport' },
  'meg': { path: '/me', shot: 'viewport' },
  'lift': { path: '/settings/training/lifts/ex_bb_back_squat', shot: 'viewport' },
}
const browser = await chromium.launch()
const report = fs.existsSync(`${OUT}/report.json`) ? JSON.parse(fs.readFileSync(`${OUT}/report.json`, 'utf8')) : {}
for (const name of (ONLY ? ONLY.split(',') : Object.keys(STATES))) {
  const s = STATES[name]
  for (const theme of THEMES.split(',')) for (const w of WIDTHS.split(',').map(Number)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w === 390 ? 844 : 900 }, deviceScaleFactor: 2, storageState: `${EV}/recon/state.json` })
    await ctx.addCookies([{ name: 'en_theme', value: theme, url: BASE }])
    const page = await ctx.newPage(); const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const file = `${OUT}/${name}-${theme}-${w === 390 ? 'mobile' : 'desktop'}.png`
    try {
      await page.goto(BASE + s.path, { timeout: 180000 })
      await page.addStyleTag({ content: HIDE })
      await page.waitForTimeout(2000)
      if (s.prep) await s.prep(page)
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (s.el) { const l = s.el(page); await l.scrollIntoViewIfNeeded(); await l.screenshot({ path: file, animations: 'disabled', timeout: 60000 }) }
      else await page.screenshot({ path: file, animations: 'disabled', timeout: 60000 })
      report[`${name}-${theme}-${w}`] = { overflow, errors }
    } catch (e) { report[`${name}-${theme}-${w}`] = { fail: String(e).slice(0, 200), errors } }
    await ctx.close()
  }
}
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1))
console.log(JSON.stringify(report))
await browser.close()
