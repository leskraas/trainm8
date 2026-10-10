// Usage: node measure.mjs <label> [runs] [outDir]
// 390×844 touch, 4× CPU, production build on :3623. Logs long tasks per load.
import fs from 'node:fs'
import { chromium } from '/home/user/trainm8/.claude/worktrees/agent-aa8f076f5bf710e28/node_modules/playwright/index.mjs'

const base = 'http://localhost:3623'
const label = process.argv[2] ?? 'run'
const runs = Number(process.argv[3] ?? 5)
const outDir = process.argv[4] ?? '.'
const pages = {
	telemetryRide: '/training/sessions/cmv1yy4ff00bc7dovpcq05z38',
	plannedRun: '/training/sessions/cmv1yy4e700ac7dovkbn11afi',
}
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
})
const ctx = await browser.newContext({
	viewport: { width: 390, height: 844 },
	hasTouch: true,
	isMobile: true,
	deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto(base + '/login')
await page.getByLabel(/username|brukernavn/i).fill('kody')
await page.getByLabel(/password|passord/i).fill('kodylovesyou')
await page.getByRole('button', { name: /log in|logg inn/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'))
await page.addInitScript(() => {
	window.__lt = []
	window.__cls = 0
	new PerformanceObserver((l) =>
		l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration))),
	).observe({ type: 'longtask', buffered: true })
	new PerformanceObserver((l) =>
		l.getEntries().forEach((e) => {
			if (!e.hadRecentInput) window.__cls += e.value
		}),
	).observe({ type: 'layout-shift', buffered: true })
})
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
const out = {}
for (const [name, path] of Object.entries(pages)) {
	out[name] = []
	await page.goto(base + path, { waitUntil: 'load' })
	await page.waitForTimeout(1500)
	for (let i = 0; i < runs; i++) {
		const t0 = Date.now()
		await page.goto(base + path, { waitUntil: 'load' })
		await page.waitForTimeout(2500)
		const r = await page.evaluate(() => ({
			lt: window.__lt,
			cls: +window.__cls.toFixed(3),
			dom: document.querySelectorAll('*').length,
			fcp: Math.round(
				performance.getEntriesByName('first-contentful-paint')[0]?.startTime ??
					-1,
			),
		}))
		r.load = Date.now() - t0
		r.longest = Math.max(0, ...r.lt)
		out[name].push(r)
		console.log(label, name, JSON.stringify(r))
	}
	// Scroll to the bottom: whatever mounts lazily is counted too.
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
	await page.waitForTimeout(2500)
	const after = await page.evaluate(() => ({
		lt: window.__lt,
		dom: document.querySelectorAll('*').length,
	}))
	console.log(label, name, 'after-scroll', JSON.stringify(after))
	out[name + '_afterScroll'] = after
}
fs.writeFileSync(`${outDir}/measure-${label}.json`, JSON.stringify(out, null, 1))
await browser.close()
