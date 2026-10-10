// Usage: node trace.mjs <label> [path] [runs]
// A DevTools timeline trace of a page load at 4× CPU, 390×844 touch. For the
// longest main-thread tasks, prints what they spent their time on (script,
// style, layout, paint, parse), so a long task can be attributed.
import fs from 'node:fs'
import { chromium } from '/home/user/trainm8/.claude/worktrees/agent-aa8f076f5bf710e28/node_modules/playwright/index.mjs'

const base = 'http://localhost:3623'
const label = process.argv[2] ?? 'run'
const path = process.argv[3] ?? '/training/sessions/cmv1yy4ff00bc7dovpcq05z38'
const runs = Number(process.argv[4] ?? 3)
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
await page.goto(base + path, { waitUntil: 'load' })
await page.waitForTimeout(1500)
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

const summary = []
for (let run = 0; run < runs; run++) {
	const events = []
	cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value))
	const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r))
	await cdp.send('Tracing.start', {
		categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8.execute,blink.user_timing',
		transferMode: 'ReportEvents',
	})
	await page.goto(base + path, { waitUntil: 'load' })
	await page.waitForTimeout(3000)
	await cdp.send('Tracing.end')
	await done
	cdp.removeAllListeners('Tracing.dataCollected')
	fs.writeFileSync(`trace-${label}-${run}.json`, JSON.stringify(events))

	// The renderer main thread: the thread with the most RunTask time.
	const tasks = events.filter(
		(e) => e.name === 'RunTask' && e.ph === 'X' && e.dur > 0,
	)
	const byTid = new Map()
	for (const t of tasks) byTid.set(t.tid, (byTid.get(t.tid) ?? 0) + t.dur)
	const main = [...byTid].sort((a, b) => b[1] - a[1])[0][0]
	const mainTasks = tasks.filter((t) => t.tid === main)
	const long = mainTasks.filter((t) => t.dur > 50_000).sort((a, b) => b.dur - a.dur)
	const kinds = [
		'EvaluateScript',
		'v8.compile',
		'v8.compileModule',
		'FunctionCall',
		'EventDispatch',
		'TimerFire',
		'FireAnimationFrame',
		'RunMicrotasks',
		'v8.evaluateModule',
		'ParseHTML',
		'UpdateLayoutTree',
		'Layout',
		'Paint',
		'PrePaint',
		'Layerize',
		'HitTest',
		'ParseAuthorStyleSheet',
		'ScheduleStyleRecalculation',
		'IntersectionObserverController::computeIntersections',
	]
	const breakdown = (task) => {
		const inside = events.filter(
			(e) =>
				e.tid === main &&
				e.ph === 'X' &&
				e.ts >= task.ts &&
				e.ts + (e.dur ?? 0) <= task.ts + task.dur &&
				kinds.includes(e.name),
		)
		// Top-level only per kind: nested same-kind events are not double-counted.
		const out = {}
		for (const k of kinds) {
			const list = inside
				.filter((e) => e.name === k)
				.sort((a, b) => a.ts - b.ts)
			let total = 0
			let end = -1
			for (const e of list) {
				if (e.ts >= end) {
					total += e.dur
					end = e.ts + e.dur
				}
			}
			if (total > 2000) out[k] = Math.round(total / 1000)
		}
		const urls = inside
			.filter((e) => e.name === 'EvaluateScript' || e.name === 'v8.evaluateModule')
			.map((e) => (e.args?.data?.url ?? '').split('/').pop())
			.filter(Boolean)
		return { ms: Math.round(task.dur / 1000), ...out, urls: urls.slice(0, 6) }
	}
	const r = {
		run,
		longTasks: long.map((t) => Math.round(t.dur / 1000)),
		top: long.slice(0, 3).map(breakdown),
	}
	summary.push(r)
	console.log(JSON.stringify(r))
}
fs.writeFileSync(`trace-summary-${label}.json`, JSON.stringify(summary, null, 1))
await browser.close()
