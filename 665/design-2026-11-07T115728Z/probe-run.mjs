import { chromium } from '/home/user/trainm8/node_modules/playwright/index.mjs'
const file = process.argv[2]
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('file://' + file)
const out = []
for (const model of ['today', 'perDay', 'held']) for (const data of ['demo', 'worst']) {
  await page.click(`[data-model="${model}"]`); await page.click(`[data-data="${data}"]`)
  const tabs = await page.$$eval('[data-tab]', (b) => b.map((x) => x.dataset.tab))
  for (const tab of tabs) {
    await page.click(`[data-tab="${tab}"]`)
    const n = await page.$$eval('[data-step]', (b) => b.length)
    const msgs = []
    for (let i = 0; i < n; i++) {
      const btn = await page.$(`[data-step="${i}"]:not([disabled])`)
      if (!btn) { msgs.push(`(stuck at ${i + 1})`); break }
      await btn.click()
      msgs.push(await page.$eval('#msg', (e) => e.textContent.trim()))
    }
    const fails = await page.$$eval('#inv li', (l) => l.filter((x) => x.querySelector('.no')).map((x) => x.textContent.trim().slice(1)))
    out.push(`[${model}/${data}/${tab}] ${msgs.join(' | ')}\n   FAILS: ${fails.join(' ;; ') || 'none'}`)
  }
}
console.log(out.join('\n'))
console.log('page errors:', errors)
await browser.close()
