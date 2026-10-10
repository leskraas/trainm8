// Usage: node profile.mjs <label> [path]
// CPU profile of one page load at 4× CPU, 390×844 touch, aggregated by
// function (self and total time), so a long task can be attributed.
import fs from 'node:fs'
import { chromium } from '/home/user/trainm8/.claude/worktrees/agent-aa8f076f5bf710e28/node_modules/playwright/index.mjs'

const base = 'http://localhost:3623'
const label = process.argv[2] ?? 'run'
const path = process.argv[3] ?? '/training/sessions/cmv1yy4ff00bc7dovpcq05z38'
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
// Warm the HTTP cache so the profile is script, not network.
await page.goto(base + path, { waitUntil: 'load' })
await page.waitForTimeout(1500)
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await page.goto(base + path, { waitUntil: 'load' })
await page.waitForTimeout(3000)
const { profile } = await cdp.send('Profiler.stop')
fs.writeFileSync(`profile-${label}.cpuprofile`, JSON.stringify(profile))

// Self time per node from the samples.
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
const deltas = profile.timeDeltas
for (let i = 0; i < profile.samples.length; i++) {
	const id = profile.samples[i]
	self.set(id, (self.get(id) ?? 0) + (deltas[i] ?? 0) / 1000)
}
const parent = new Map()
for (const n of profile.nodes)
	for (const c of n.children ?? []) parent.set(c, n.id)
const key = (n) =>
	`${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`
const selfByFn = new Map()
const totalByFn = new Map()
for (const [id, ms] of self) {
	const n = byId.get(id)
	selfByFn.set(key(n), (selfByFn.get(key(n)) ?? 0) + ms)
	// Walk up for total time, counting each function once per sample stack.
	const seen = new Set()
	let cur = id
	while (cur != null) {
		const k = key(byId.get(cur))
		if (!seen.has(k)) {
			totalByFn.set(k, (totalByFn.get(k) ?? 0) + ms)
			seen.add(k)
		}
		cur = parent.get(cur)
	}
}
const top = (m, n) =>
	[...m]
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([k, v]) => `${v.toFixed(1).padStart(8)} ms  ${k}`)
		.join('\n')
console.log('--- self ---\n' + top(selfByFn, 25))
console.log('--- total ---\n' + top(totalByFn, 40))
await browser.close()
