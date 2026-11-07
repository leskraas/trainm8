import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const EV = process.argv[2]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: `${EV}/recon/state.json` })
const page = await ctx.newPage()
await page.goto('http://localhost:3140/me', { timeout: 180000 }); await page.waitForTimeout(2500)
console.log(await page.evaluate(() => [...document.body.children].map((e) => e.tagName + '#' + e.id + '.' + e.className.toString().slice(0, 60) + ' fixed-kids:' + [...e.querySelectorAll('*')].filter((x) => getComputedStyle(x).position === 'fixed').map((x) => x.tagName + '.' + x.className.toString().slice(0, 50) + ' "' + x.textContent.slice(0, 20) + '"').join(' | ')).join('\n')))
await browser.close()
