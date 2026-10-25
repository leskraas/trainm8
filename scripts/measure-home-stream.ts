/**
 * The measurement ADR 0078's "Reopened (#503)" section asks for: I dag at full
 * span, on a production build, at 390×844 with the CPU throttled 4×, so the
 * numbers can be taken again by anyone.
 *
 * Per run, in a fresh browser context: log in as kody, throttle the CPU with
 * `Emulation.setCPUThrottlingRate`, load `/season` (the full Home Timeline
 * since ADR 0101's calm I dag; the stream is the same), and read
 *
 * - **first contentful paint** (`paint` entries);
 * - **hydrated**: the first animation frame at which the stream element
 *   carries React's props (`__reactProps$…`), i.e. hydration has committed
 *   over it. A proxy, named so: React exposes no hydration-complete event;
 * - **long tasks on load**: `longtask` entries from navigation start until
 *   the page has been quiet for 2s after `load`, as a count, their total and
 *   the blocking time over 50ms;
 * - the stream's day rows, week blocks and DOM nodes once landed;
 *
 * then scroll the stream from its top to its end, 40px a frame (as in ADR
 * 0086 §4) with instant writes, appended weeks included, recording every
 * frame's duration: median, p90, and the count and share over 32ms.
 *
 * **Local only.** It refuses a non-local base URL and `NODE_ENV=production`
 * in its own environment; the server it measures runs `npm run start:mocks`
 * against a local database prepared with `scripts/home-stream-fixture.ts`.
 *
 *   npx tsx scripts/measure-home-stream.ts [baseUrl] [runs]
 *
 * A container is not a phone: 4× on a desktop CPU stands in for a mid-range
 * phone, and the figures say nothing about a real device's GPU or touch
 * scrolling.
 */
import { chromium, type Browser } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const RUNS = Number(process.argv[3] ?? 5)
const CPU = 4
const STEP = 40

if (process.env.NODE_ENV === 'production') {
	throw new Error('measure-home-stream is a local measuring script.')
}
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) {
	throw new Error(`measure-home-stream only measures a local server: ${BASE}`)
}

type Run = {
	fcp: number
	hydrated: number
	longTasks: number
	longTaskMs: number
	blockingMs: number
	longestTask: number
	todayTop: number
	dayRows: number
	weeks: number
	nodes: number
	streamHeight: number
	/** Frames where the scroll position went backwards: should be 0. */
	backJumps: number
	frames: number
	median: number
	p90: number
	over32: number
}

const quantile = (values: number[], q: number) => {
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
}

async function measure(browser: Browser): Promise<Run> {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
	})
	const login = await context.newPage()
	await login.goto(`${BASE}/login`)
	await login.getByLabel(/username/i).fill('kody')
	await login.getByLabel(/password/i).fill('kodylovesyou')
	await Promise.all([
		login.waitForURL((url) => !url.pathname.startsWith('/login')),
		login.getByRole('button', { name: /log in/i }).click(),
	])
	await login.close()

	const page = await context.newPage()
	// A string, not a function: tsx would wrap a named inner function in a
	// `__name` helper the page does not have.
	await page.addInitScript(`
		window.__longTasks = []
		new PerformanceObserver((list) => {
			for (const e of list.getEntries())
				window.__longTasks.push({ start: e.startTime, duration: e.duration })
		}).observe({ type: 'longtask', buffered: true })
		const poll = () => {
			const stream = document.querySelector('[data-timeline-stream]')
			if (stream && Object.keys(stream).some((k) => k.startsWith('__reactProps$'))) {
				window.__hydrated = performance.now()
				return
			}
			requestAnimationFrame(poll)
		}
		requestAnimationFrame(poll)
	`)
	const cdp = await context.newCDPSession(page)
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })

	await page.goto(`${BASE}/season`, { waitUntil: 'load' })
	await page.waitForFunction(() => '__hydrated' in window, null, {
		timeout: 60_000,
	})
	// Quiet: no long task in the last 2s.
	await page.waitForFunction(
		() => {
			const tasks = (
				window as unknown as {
					__longTasks: Array<{ start: number; duration: number }>
				}
			).__longTasks
			const last = tasks.at(-1)
			return performance.now() - (last ? last.start + last.duration : 0) > 2000
		},
		null,
		{ timeout: 60_000, polling: 250 },
	)
	const load = await page.evaluate(() => {
		const w = window as unknown as {
			__longTasks: Array<{ start: number; duration: number }>
			__hydrated: number
		}
		const fcp =
			performance
				.getEntriesByType('paint')
				.find((e) => e.name === 'first-contentful-paint')?.startTime ?? NaN
		const stream = document.querySelector('[data-timeline-stream]')!
		return {
			fcp,
			hydrated: w.__hydrated,
			longTasks: w.__longTasks.length,
			longTaskMs: w.__longTasks.reduce((s, t) => s + t.duration, 0),
			blockingMs: w.__longTasks.reduce(
				(s, t) => s + Math.max(0, t.duration - 50),
				0,
			),
			longestTask: Math.max(0, ...w.__longTasks.map((t) => t.duration)),
			// Where the landing parked today's row, from the stream's top edge.
			todayTop:
				(document
					.querySelector('[data-timeline-today]')
					?.getBoundingClientRect().top ?? NaN) -
				stream.getBoundingClientRect().top,
		}
	})

	// The landing re-lands on late layout until the reader's first input
	// (ADR 0086 §4), and a scripted scroll is not input: press a key first, as
	// a reader's first touch would, so the scroll is not pulled back to today.
	await page.keyboard.press('Shift')
	const scroll = await page.evaluate(async (step) => {
		const stream = document.querySelector<HTMLElement>(
			'[data-timeline-stream]',
		)!
		stream.scrollTo({ top: 0, behavior: 'instant' })
		await new Promise((r) => setTimeout(r, 1000))
		const frames: number[] = []
		let last = performance.now()
		let stuck = 0
		let backJumps = 0
		while (stuck < 30) {
			await new Promise((r) => requestAnimationFrame(r))
			const now = performance.now()
			frames.push(now - last)
			last = now
			const before = stream.scrollTop
			stream.scrollTo({ top: before + step, behavior: 'instant' })
			if (stream.scrollTop < before) backJumps++
			stuck = stream.scrollTop === before ? stuck + 1 : 0
		}
		return {
			frames: frames.slice(1, frames.length - 30),
			backJumps,
			dayRows: document.querySelectorAll('[data-timeline-day]').length,
			weeks: document.querySelectorAll('[data-timeline-week]').length,
			nodes: document.querySelectorAll('*').length,
			streamHeight: stream.scrollHeight,
		}
	}, STEP)
	await context.close()

	return {
		...load,
		dayRows: scroll.dayRows,
		weeks: scroll.weeks,
		nodes: scroll.nodes,
		streamHeight: scroll.streamHeight,
		backJumps: scroll.backJumps,
		frames: scroll.frames.length,
		median: quantile(scroll.frames, 0.5),
		p90: quantile(scroll.frames, 0.9),
		over32: scroll.frames.filter((f) => f > 32).length,
	}
}

const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const runs: Run[] = []
for (let i = 0; i < RUNS; i++) {
	const run = await measure(browser)
	runs.push(run)
	console.log(JSON.stringify(run))
}
await browser.close()

const median = (key: keyof Run) =>
	quantile(
		runs.map((r) => r[key]),
		0.5,
	)
const round = (n: number) => Math.round(n * 10) / 10
console.log(
	`median of ${RUNS} runs, ${CPU}× CPU, 390×844:`,
	JSON.stringify(
		Object.fromEntries(
			(Object.keys(runs[0]!) as Array<keyof Run>).map((k) => [
				k,
				round(median(k)),
			]),
		),
	),
)
