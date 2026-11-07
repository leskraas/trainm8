// Critic probe (#672): how much shorter the stack gets if only the first line clears the close button.
import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const EV = process.argv[2]
const browser = await chromium.launch()
for (const [w, h] of [[320, 700], [390, 844]]) for (const data of ['demo', 'worst']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage()
  await page.goto(`file://${EV}/prototype.html?chrome=0&v=2&data=${data}`); await page.waitForTimeout(300)
  const stack = () => page.evaluate(() => Math.round(document.querySelector('[data-plan-guards]').getBoundingClientRect().height))
  const before = await stack()
  await page.addStyleTag({ content: '.alert{padding-right:16px}.alert-desc>:first-child>li:first-child,.alert-desc>p:first-child{padding-right:40px}' })
  await page.waitForTimeout(100)
  const after = await stack()
  if (w === 390 && data === 'worst') await page.screenshot({ path: `${EV}/shots/critic-padding-probe-390-worst.png`, fullPage: false, clip: { x: 0, y: 600, width: 390, height: 700 } })
  console.log(w, data, 'stack', before, '->', after)
  await ctx.close()
}
await browser.close()
