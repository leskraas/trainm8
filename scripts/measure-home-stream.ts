/**
 * The measurement ADR 0078's "Reopened (#503)" section asks for, and #503's
 * budget is held to (ADR 0121): the full Home Timeline at full span, on a
 * production build, at 390×844 with the CPU throttled 4×, so the numbers can
 * be taken again by anyone.
 *
 * It opens the full view two ways:
 *
 * - **By URL** (the default): load `/season` in a fresh context and read
 *   - **first contentful paint** (`paint` entries);
 *   - **hydrated**: the first animation frame at which the stream element
 *     carries React's props (`__reactProps$…`), i.e. hydration has committed
 *     over it, and a tap on it is answered (a tap on a week still to hydrate
 *     hydrates that week first and is replayed, ADR 0121 §3). A proxy, named
 *     so: React exposes no hydration-complete event;
 *   - **weeksHydrated**: the first frame at which every mounted week carries
 *     React's props as well, the end of the week-by-week hydration;
 *   - **long tasks on load**: `longtask` entries from navigation start until
 *     the page has been quiet for 2s after `load`, as a count, their total
 *     and the blocking time over 50ms;
 *   - **todayTop**, where the landing parked today's row from the stream's
 *     top edge, and **todayDrift**, how far it moved, frame by frame, from
 *     first paint until the page is quiet (0 when it never moved);
 *
 *   then scroll the stream from its top to its end, 40px a frame (as in ADR
 *   0086 §4) with instant writes, appended weeks included, recording every
 *   frame's duration: median, p90, and the count over 32ms.
 * - **By navigation** (`--nav`): load I dag (`/`), wait until it is quiet,
 *   then tap _Se hele sesongen_ and read the long tasks from the tap until the
 *   page is quiet again, and **shown**: the tap to the first frame the stream
 *   is on screen and React's.
 *
 * Several servers are measured **interleaved**, run by run, so a busy machine
 * costs every season alike: name each as `label=url`, the seed season first.
 * The summary gives each one's medians, and every later season's distance from
 * the first on the budget's figures.
 *
 * **Local only.** It refuses a non-local base URL and `NODE_ENV=production`
 * in its own environment; the servers it measures run `npm run start:mocks`
 * against local databases, one seeded and one prepared with
 * `scripts/home-stream-fixture.ts`.
 *
 *   npx tsx scripts/measure-home-stream.ts [--nav] [--runs 5] \
 *     seed=http://localhost:3000 long=http://localhost:3001
 *
 * A container is not a phone: 4× on a desktop CPU stands in for a mid-range
 * phone, and the figures say nothing about a real device's GPU or touch
 * scrolling.
 */
import { chromium, type Browser, type Page } from 'playwright'

const args = process.argv.slice(2)
const NAV = args.includes('--nav')
const runsAt = args.indexOf('--runs')
const RUNS = runsAt >= 0 ? Number(args[runsAt + 1]) : 5
const named = args
	.filter((arg, i) => !arg.startsWith('--') && (runsAt < 0 || i !== runsAt + 1))
	.map((arg, i) => {
		const at = arg.indexOf('=')
		return at > 0 && !arg.startsWith('http')
			? { label: arg.slice(0, at), base: arg.slice(at + 1) }
			: { label: `server${i + 1}`, base: arg }
	})
const SERVERS = named.length
	? named
	: [{ label: 'server1', base: 'http://localhost:3000' }]
const CPU = 4
const STEP = 40

if (process.env.NODE_ENV === 'production') {
	throw new Error('measure-home-stream is a local measuring script.')
}
for (const { base } of SERVERS) {
	if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
		throw new Error(`measure-home-stream only measures a local server: ${base}`)
	}
}

type Run = Record<string, number>

const quantile = (values: number[], q: number) => {
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
}

// A string, not a function: tsx would wrap a named inner function in a
// `__name` helper the page does not have.
const PROBE = `
	window.__longTasks = []
	new PerformanceObserver((list) => {
		for (const e of list.getEntries())
			window.__longTasks.push({ start: e.startTime, duration: e.duration })
	}).observe({ type: 'longtask', buffered: true })
	const isReacts = (el) => Object.keys(el).some((k) => k.startsWith('__reactProps$'))
	const poll = () => {
		const stream = document.querySelector('[data-timeline-stream]')
		if (stream) {
			const today = stream.querySelector('[data-timeline-today]')
			const top = today ? today.getBoundingClientRect().top - stream.getBoundingClientRect().top : null
			if (top !== null && window.__firstTodayTop === undefined && performance.getEntriesByName('first-contentful-paint').length) {
				window.__firstTodayTop = top
				window.__todayDrift = 0
			}
			if (top !== null && window.__firstTodayTop !== undefined && !window.__reading) {
				window.__todayDrift = Math.max(window.__todayDrift, Math.abs(top - window.__firstTodayTop))
			}
			if (window.__hydrated === undefined && isReacts(stream)) window.__hydrated = performance.now()
			if (window.__weeksHydrated === undefined && window.__hydrated !== undefined) {
				const weeks = [...stream.querySelectorAll('[data-timeline-week]')]
				if (weeks.length && weeks.every(isReacts)) window.__weeksHydrated = performance.now()
			}
		}
		requestAnimationFrame(poll)
	}
	requestAnimationFrame(poll)
`

type Probe = {
	__longTasks: Array<{ start: number; duration: number }>
	__hydrated?: number
	__weeksHydrated?: number
	__todayDrift?: number
	__reading?: boolean
	__clickAt?: number
}

async function quiet(page: Page) {
	// No long task in the last 2s, and 2s since the click when one was made: a
	// `longtask` entry reaches the observer after its task ends, so an empty
	// list right after the click is not yet quiet.
	await page.waitForFunction(
		() => {
			const w = window as unknown as Probe
			const last = w.__longTasks.at(-1)
			const since = Math.max(
				last ? last.start + last.duration : 0,
				w.__clickAt ?? 0,
			)
			return performance.now() - since > 2000
		},
		null,
		{ timeout: 90_000, polling: 250 },
	)
}

async function open(browser: Browser, base: string) {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
	})
	const login = await context.newPage()
	await login.goto(`${base}/login`)
	await login.getByLabel(/username/i).fill('kody')
	await login.getByLabel(/password/i).fill('kodylovesyou')
	await Promise.all([
		login.waitForURL((url) => !url.pathname.startsWith('/login')),
		login.getByRole('button', { name: /log in/i }).click(),
	])
	await login.close()
	const page = await context.newPage()
	await page.addInitScript(PROBE)
	const cdp = await context.newCDPSession(page)
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
	return { context, page }
}

async function measureByUrl(browser: Browser, base: string): Promise<Run> {
	const { context, page } = await open(browser, base)
	await page.goto(`${base}/season`, { waitUntil: 'load' })
	await page.waitForFunction(() => '__weeksHydrated' in window, null, {
		timeout: 90_000,
	})
	await quiet(page)
	const load = await page.evaluate(() => {
		const w = window as unknown as Probe
		w.__reading = true
		const fcp =
			performance
				.getEntriesByType('paint')
				.find((e) => e.name === 'first-contentful-paint')?.startTime ?? NaN
		const stream = document.querySelector('[data-timeline-stream]')!
		const tasks = w.__longTasks
		return {
			fcp,
			hydrated: w.__hydrated!,
			weeksHydrated: w.__weeksHydrated!,
			longTasks: tasks.length,
			longTaskMs: tasks.reduce((s, t) => s + t.duration, 0),
			blockingMs: tasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0),
			longestTask: Math.max(0, ...tasks.map((t) => t.duration)),
			todayTop:
				(document
					.querySelector('[data-timeline-today]')
					?.getBoundingClientRect().top ?? NaN) -
				stream.getBoundingClientRect().top,
			todayDrift: w.__todayDrift ?? NaN,
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
		// Frames where the scroll position went backwards: should be 0.
		backJumps: scroll.backJumps,
		frames: scroll.frames.length,
		median: quantile(scroll.frames, 0.5),
		p90: quantile(scroll.frames, 0.9),
		over32: scroll.frames.filter((f) => f > 32).length,
	}
}

async function measureByNavigation(
	browser: Browser,
	base: string,
): Promise<Run> {
	const { context, page } = await open(browser, base)
	await page.goto(`${base}/`, { waitUntil: 'load' })
	const link = page.getByRole('link', { name: 'Se hele sesongen' }).first()
	await link.waitFor({ timeout: 90_000 })
	await quiet(page)
	await page.evaluate(() => {
		const w = window as unknown as Probe
		w.__longTasks = []
		w.__clickAt = performance.now()
	})
	await link.click()
	await page.waitForFunction(() => '__hydrated' in window, null, {
		timeout: 90_000,
	})
	await quiet(page)
	const run = await page.evaluate(() => {
		const w = window as unknown as Probe
		const stream = document.querySelector('[data-timeline-stream]')!
		const tasks = w.__longTasks
		return {
			shown: w.__hydrated! - w.__clickAt!,
			longTasks: tasks.length,
			longTaskMs: tasks.reduce((s, t) => s + t.duration, 0),
			blockingMs: tasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0),
			longestTask: Math.max(0, ...tasks.map((t) => t.duration)),
			todayTop:
				(document
					.querySelector('[data-timeline-today]')
					?.getBoundingClientRect().top ?? NaN) -
				stream.getBoundingClientRect().top,
			weeks: document.querySelectorAll('[data-timeline-week]').length,
		}
	})
	await context.close()
	return run
}

const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const runs = new Map(SERVERS.map(({ label }) => [label, [] as Run[]]))
for (let i = 0; i < RUNS; i++) {
	for (const { label, base } of SERVERS) {
		const run = NAV
			? await measureByNavigation(browser, base)
			: await measureByUrl(browser, base)
		runs.get(label)!.push(run)
		console.log(
			JSON.stringify({ label, mode: NAV ? 'nav' : 'url', run: i + 1, ...run }),
		)
	}
}
await browser.close()

const round = (n: number) => Math.round(n * 10) / 10
const medians = new Map(
	[...runs].map(([label, list]) => [
		label,
		Object.fromEntries(
			Object.keys(list[0]!).map((key) => [
				key,
				round(
					quantile(
						list.map((r) => r[key]!),
						0.5,
					),
				),
			]),
		),
	]),
)
const mode = NAV ? 'by navigation' : 'by URL'
for (const [label, figures] of medians) {
	console.log(
		`${label}: median of ${RUNS} runs ${mode}, ${CPU}× CPU, 390×844:`,
		JSON.stringify(figures),
	)
}
// The budget (#503): every later season against the first, on the figures it
// names.
const [first, ...rest] = [...medians]
for (const [label, figures] of rest) {
	// `weeksHydrated` beside `hydrated`: with a boundary per week, the Stream
	// answers a tap before every week has hydrated (ADR 0121).
	const keys = NAV
		? ['longestTask', 'shown']
		: ['hydrated', 'weeksHydrated', 'longestTask']
	const over = Object.fromEntries(
		keys.map((key) => [
			key,
			`${round((figures[key]! / first![1][key]! - 1) * 100)}%`,
		]),
	)
	console.log(`${label} against ${first![0]}:`, JSON.stringify(over))
}
