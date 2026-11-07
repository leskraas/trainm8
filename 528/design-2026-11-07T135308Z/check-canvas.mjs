// Canvas check: console errors, sideways scroll at 390 and 1440, the iframe prototype renders, the worst toggle works; screenshots.
import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const EV = process.argv[2]
const browser = await chromium.launch(); const out = {}
for (const [w, scheme] of [[390, 'light'], [1440, 'light'], [390, 'dark']]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme })
  const errors = []; page.on('console', (m) => m.type() === 'error' && errors.push(m.text())); page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`file://${EV}/canvas.html`); await page.waitForTimeout(1500)
  const fr = page.frameLocator('iframe'); await page.locator('iframe').scrollIntoViewIfNeeded(); await page.waitForTimeout(800)
  const protoImg = await fr.locator('#stage img.shot').count()
  await page.locator('#worst .seg button[data-w="1"]').click()
  const worstVisible = await page.locator('#worst figure[data-set="worst"]').first().isVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const words = await page.evaluate(() => { const d = document.querySelector('details'); let t = ''; for (const el of document.querySelector('.wrap').children) { if (el === d) break; t += ' ' + el.innerText } return t.split(/\s+/).filter(Boolean).length })
  await page.locator('#worst .seg button[data-w="0"]').click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${EV}/recon/canvas-${w}-${scheme}.png` })
  out[`${w}-${scheme}`] = { errors, overflow, protoImg, worstVisible, wordsAboveAppendix: words }
  await page.close()
}
console.log(JSON.stringify(out, null, 1)); await browser.close()
