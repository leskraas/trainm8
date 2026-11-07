// Critic probe (#672): hit-area overlap between notice links, glyph-box hit test, widths, Avansert copy count.
import { createRequire } from 'node:module'
const require = createRequire('/home/user/trainm8/package.json')
const { chromium } = require('@playwright/test')
const EV = process.argv[2]
const browser = await chromium.launch()
const out = {}
for (const [w, h] of [[320, 700], [390, 844], [768, 1024], [1440, 900]]) for (const data of ['demo', 'worst']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  await page.goto(`file://${EV}/prototype.html?chrome=0&v=2&data=${data}&theme=light`); await page.waitForTimeout(300)
  out[`${w}-${data}`] = await page.evaluate(() => {
    const links = [...document.querySelectorAll('[data-plan-guards] a')]
    const res = links.map((a, i) => {
      const rs = [...a.getClientRects()]
      const misses = []
      for (const r of rs) for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.15, 0.5, 0.85]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy
        if (y < 0 || y > innerHeight) continue
        const el = document.elementFromPoint(x, y)
        const hit = el && el.closest('a')
        if (hit !== a) misses.push({ fx, fy, got: hit ? hit.textContent.trim().slice(0, 20) : el?.tagName })
      }
      return { text: a.textContent.trim().slice(0, 24), lines: rs.length, top: Math.round(rs[0]?.top + scrollY), misses }
    })
    // pairs of links whose ::after areas overlap
    const boxes = links.map((a) => { const r = a.getBoundingClientRect(); const s = getComputedStyle(a, '::after'); const iy = -parseFloat(s.top) || 0; return { t: r.top - iy, b: r.bottom + iy, l: r.left, r: r.right, n: a.textContent.trim().slice(0, 20) } })
    const overlaps = []
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j]; const oy = Math.min(A.b, B.b) - Math.max(A.t, B.t); const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l)
      if (oy > 0 && ox > 0) overlaps.push({ a: A.n, b: B.n, px: Math.round(oy) })
    }
    const g = document.querySelector('[data-plan-guards]')
    const al = [...document.querySelectorAll('.alert')].map((x) => Math.round(x.getBoundingClientRect().height))
    const lib = [...document.querySelectorAll('h2')].find((h) => /Bibliotek/.test(h.textContent))
    return { links: res, overlaps, overflow: document.documentElement.scrollWidth - innerWidth, guardsTop: g && Math.round(g.getBoundingClientRect().top + scrollY), alertHeights: al, bibliotekTop: lib && Math.round(lib.getBoundingClientRect().top + scrollY), descWidth: Math.round(document.querySelector('.alert-desc')?.getBoundingClientRect().width), alertWidth: Math.round(document.querySelector('.alert')?.getBoundingClientRect().width) }
  })
  await ctx.close()
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
