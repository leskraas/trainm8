import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { type Locator, type Page } from '@playwright/test'
import {
	AHEAD_INITIAL,
	AHEAD_PAD,
} from '#app/routes/_home/timeline/anchoring.ts'
import { HOME_TIMELINE_HREF } from '#app/utils/app-tabs.ts'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { IMPORTS_EVENTS_PATH } from '#app/utils/imports-events.ts'
import {
	expect,
	middayTimezone,
	scrollStreamTo,
	test,
	untilHydrated,
} from '#tests/playwright-utils.ts'

/**
 * The row the reader is reading never moves when content arrives above it
 * (#503 criterion 7, ADR 0086 §4, ADR 0125).
 *
 * Two ways content arrives on the full Home Timeline after the first paint:
 * a **live import** lands on a day the reader has already scrolled past, and
 * the loader revalidates with a taller day above them; and the **weeks ahead**
 * mount as the reader nears the end of what is there. Chromium anchors the
 * scroll itself (`overflow-anchor`); Safari has no scroll anchoring, so there
 * `ReadingHold` makes the same correction. This file is the one the `webkit`
 * project runs as well as `chromium` (`playwright.config.ts`), so both
 * browsers are held to it.
 */

test.use({ viewport: { width: 390, height: 844 } })

const DAY = 24 * 60 * 60 * 1000

async function seedReader(userId: string) {
	const now = new Date()
	const timezone = middayTimezone(now)
	await prisma.athleteProfile.create({ data: { userId, timezone } })
	// A session a day three weeks back, and every other day twelve weeks
	// ahead: every day the reader passes has height, and the season reaches
	// well past the weeks mounted on open (`AHEAD_INITIAL`), so more mount as
	// the reader nears the end.
	const offsets: number[] = []
	for (let days = -21; days <= 84; days += days < 0 ? 1 : 2) offsets.push(days)
	await prisma.workoutSession.createMany({
		data: offsets.map((days) => ({
			userId,
			scheduledAt: new Date(now.getTime() + days * DAY),
			status: days < 0 ? 'completed' : 'scheduled',
			tssValue: days < 0 ? 40 : null,
			plannedTssValue: 45,
			plannedTssConfidence: 'full',
			source: 'authored',
		})),
	})
	return { now, timezone }
}

/**
 * Until the rest of the first chunk ahead has been appended below today
 * (ADR 0125): the server renders this week and the next, the rest mounts once
 * the frame has hydrated. Every season here reaches past the first chunk.
 */
async function untilFirstChunk(stream: Locator) {
	await expect
		.poll(
			() =>
				stream.evaluate((el) => {
					const weeks = [...el.querySelectorAll('[data-timeline-week]')]
					const today = weeks.findIndex((week) =>
						week.querySelector('[data-timeline-today]'),
					)
					return weeks.length - 1 - today
				}),
			{ timeout: 30_000 },
		)
		.toBeGreaterThanOrEqual(AHEAD_INITIAL)
}

/** Where the day row `key` sits from the stream's visible top, in px. */
function rowTop(page: Page, key: string) {
	return page.getByTestId('timeline-stream').evaluate((el, dayKey) => {
		const row = el.querySelector(`[data-timeline-day="${dayKey}"]`)
		if (!row) return null
		return row.getBoundingClientRect().top - el.getBoundingClientRect().top
	}, key)
}

/** The first day row whose top is on screen: the row the reader is reading. */
function readingRow(page: Page) {
	return page.getByTestId('timeline-stream').evaluate((el) => {
		const box = el.getBoundingClientRect()
		const row = [...el.querySelectorAll('[data-timeline-day]')].find((r) => {
			const top = r.getBoundingClientRect().top
			// Below the sticky week header's reach, and on screen.
			return top >= box.top + 160 && top < box.bottom - 80
		})
		return row?.getAttribute('data-timeline-day') ?? null
	})
}

test('a live import on a day the reader has scrolled past does not move the row they are reading', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	const { now, timezone } = await seedReader(user.id)

	// The import below must reach an open live import stream (ADR 0049), so
	// wait for it to answer rather than guess when the page has hydrated.
	const live = page.waitForResponse((response) =>
		response.url().includes(IMPORTS_EVENTS_PATH),
	)
	await navigate(HOME_TIMELINE_HREF)
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toBeVisible()
	await live

	// Read on into next week, so last week's days are well above the reader.
	const landed = await stream.evaluate((el) => el.scrollTop)
	await scrollStreamTo(page, landed + 900)
	await page.waitForTimeout(400)
	const reading = await readingRow(page)
	expect(reading).not.toBeNull()
	const before = (await rowTop(page, reading!))!

	// Eight days back: a day the reader has passed. The import auto-saves a
	// session there, and the open tab revalidates (ADR 0049).
	const at = new Date(now.getTime() - 8 * DAY)
	const passed = localDate(at, timezone)
	const fixture = await readFile(
		path.join(process.cwd(), 'tests/fixtures/tcx/run-with-hr.tcx'),
		'utf8',
	)
	const tcx = fixture.replaceAll('2026-06-02', passed)
	const sessionsOnPassed = () =>
		stream
			.locator(`[data-timeline-day="${passed}"]`)
			.evaluate((row) => row.textContent?.length ?? 0)
	const passedBefore = await sessionsOnPassed()
	const upload = await page.request.post('/imports/upload', {
		multipart: {
			file: {
				name: 'live-import.tcx',
				mimeType: 'application/vnd.garmin.tcx+xml',
				buffer: Buffer.from(tcx),
			},
		},
		maxRedirects: 0,
	})
	expect(upload.status()).toBeLessThan(400)

	// The revalidated day above is taller: the import's row is in it.
	await expect
		.poll(sessionsOnPassed, { timeout: 15_000 })
		.toBeGreaterThan(passedBefore)
	await page.waitForTimeout(300)
	expect(
		Math.abs((await rowTop(page, reading!))! - before),
	).toBeLessThanOrEqual(1)
})

test('weeks that mount after the first paint never move the row the reader is reading', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedReader(user.id)

	await navigate(HOME_TIMELINE_HREF)
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toBeVisible()
	await untilHydrated(stream)
	await untilFirstChunk(stream)
	const mounted = await stream.locator('[data-timeline-week]').count()

	// Read on to a screen short of where the weeks ahead are mounted
	// (`AHEAD_PAD` from the end), so that nothing mounts on the way there.
	const end = await stream.evaluate((el) => el.scrollHeight - el.clientHeight)
	await scrollStreamTo(page, end - AHEAD_PAD - 300)

	// Then read on the way a reader does, a little each frame, until the weeks
	// ahead mount below, and on for half a second after. The row is judged in
	// **painted frames** only: measured after each frame, before the next
	// scroll step, against how far the reader has scrolled themselves. A
	// layout read straight after a scroll write is one the browser has not
	// painted yet: there the weeks just scrolled into view still have their
	// estimated height (`content-visibility`), and the row moved 2px between
	// that layout and the first frame that showed it (CI, #692).
	const run = await stream.evaluate(
		(el, mountedWeeks) =>
			new Promise<{
				key: string | null
				weeksAtStart: number
				weeksAtEnd: number
				frames: number[]
			}>((resolve) => {
				const weeks = () => el.querySelectorAll('[data-timeline-week]').length
				const box = () => el.getBoundingClientRect()
				const weeksAtStart = weeks()
				const frames: number[] = []
				let key: string | null = null
				let settle = 3
				let scrolled = 0
				let after = -1
				const top = (row: Element) =>
					row.getBoundingClientRect().top - box().top
				const channel = new MessageChannel()
				const afterPaint = () => {
					if (settle > 0) {
						// The jump above settles first: weeks sized for real, painted.
						settle--
					} else if (key == null) {
						const row = [...el.querySelectorAll('[data-timeline-day]')].find(
							(r) => {
								const t = top(r)
								return t >= 160 && t < box().height - 80
							},
						)
						key = row?.getAttribute('data-timeline-day') ?? null
						if (!key)
							return resolve({ key, weeksAtStart, weeksAtEnd: weeks(), frames })
					} else {
						const row = el.querySelector(`[data-timeline-day="${key}"]`)
						frames.push(Math.round((row ? top(row) : NaN) + scrolled))
						if (after < 0 && weeks() > mountedWeeks) after = 30
						if (after === 0 || frames.length > 600) {
							return resolve({ key, weeksAtStart, weeksAtEnd: weeks(), frames })
						}
						if (after > 0) after--
					}
					if (key != null && after < 0) {
						// One step of the reader's own scrolling, counted as it lands.
						const from = el.scrollTop
						const behavior = el.style.scrollBehavior
						el.style.scrollBehavior = 'auto'
						el.scrollTop = from + 24
						el.style.scrollBehavior = behavior
						scrolled += el.scrollTop - from
					}
					requestAnimationFrame(() => channel.port2.postMessage(null))
				}
				channel.port1.onmessage = afterPaint
				requestAnimationFrame(() => channel.port2.postMessage(null))
			}),
		mounted,
	)
	expect(run.key).not.toBeNull()
	// The weeks ahead mounted while the reader read, not before.
	expect(run.weeksAtStart).toBe(mounted)
	expect(run.weeksAtEnd).toBeGreaterThan(mounted)
	expect(run.frames.length).toBeGreaterThan(30)
	// Where the row would be had nothing but the reader's scrolling moved it.
	const moved = run.frames.map((at) => Math.abs(at - run.frames[0]!))
	expect(Math.max(...moved)).toBeLessThanOrEqual(1)
})

test('on a screen taller than the weeks the server renders ahead, today is parked before the first paint and stays there', async ({
	page,
	navigate,
	login,
}) => {
	// #503 criterion 5. The server renders this week and the next (ADR 0125);
	// on a tall screen with a sparse week ahead that is less room below today
	// than the Stream is tall, and a landing short of its target would jump
	// once the rest of the first chunk is appended.
	test.setTimeout(120_000)
	await page.setViewportSize({ width: 1280, height: 1400 })
	const user = await login()
	const now = new Date()
	await prisma.athleteProfile.create({
		data: { userId: user.id, timezone: middayTimezone(now) },
	})
	// A session every day for two months up to today, then one far ahead so
	// the season reaches past the first chunk: the weeks just ahead are empty.
	const offsets = [...Array.from({ length: 61 }, (_, i) => i - 60), 120]
	await prisma.workoutSession.createMany({
		data: offsets.map((days) => ({
			userId: user.id,
			scheduledAt: new Date(now.getTime() + days * DAY),
			status: days < 0 ? 'completed' : 'scheduled',
			tssValue: days < 0 ? 40 : null,
			plannedTssValue: 45,
			plannedTssConfidence: 'full',
			source: 'authored',
		})),
	})
	// Today's row from the stream's top in every frame the browser paints the
	// list, from the document's first animation frame on, not from
	// `DOMContentLoaded`: the browser paints what it has parsed before then,
	// and a probe that waits for the event both misses those frames and, when
	// the event comes late, records none at all (WebKit on CI, #692). A frame
	// in which the list is held unpainted (`landingHoldScript`) is skipped.
	await page.addInitScript(() => {
		const w = window as unknown as { __todayTops: number[]; __frames: number }
		w.__todayTops = []
		w.__frames = 0
		const frame = () => {
			w.__frames++
			const stream = document.querySelector('[data-timeline-stream]')
			const today = stream?.querySelector('[data-timeline-today]')
			if (stream && today && getComputedStyle(stream).visibility !== 'hidden') {
				w.__todayTops.push(
					Math.round(
						today.getBoundingClientRect().top -
							stream.getBoundingClientRect().top,
					),
				)
			}
			requestAnimationFrame(frame)
		}
		requestAnimationFrame(frame)
	})

	await navigate(HOME_TIMELINE_HREF)
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toBeVisible()
	// Until the rest of the first chunk has been appended below, and until a
	// good number of frames have painted the list after it, for anything that
	// would move today once it has.
	await untilHydrated(stream)
	await untilFirstChunk(stream)
	const painted = () =>
		page.evaluate(
			() => (window as unknown as { __todayTops: number[] }).__todayTops.length,
		)
	const appended = await painted()
	await expect
		.poll(painted, { timeout: 15_000, message: 'frames painted the list' })
		.toBeGreaterThan(appended + 30)
	const tops = await page.evaluate(
		() => (window as unknown as { __todayTops: number[] }).__todayTops,
	)
	expect(new Set(tops)).toEqual(new Set([tops[0]]))
})

for (const target of ['oldest', 'four ahead'] as const) {
	test(`a strip tap made the moment the full view appears lands on the ${target} week, and stays there`, async ({
		page,
		navigate,
		login,
	}) => {
		// #503 criterion 6. The tap comes before the frame has hydrated, and the
		// week four ahead is not yet mounted (the server renders this week and
		// the next, ADR 0125): the tap must not be dropped, and nothing may
		// re-land the reader once it has jumped.
		test.setTimeout(120_000)
		const user = await login()
		await seedReader(user.id)

		await navigate(HOME_TIMELINE_HREF)
		const stream = page.getByTestId('timeline-stream')
		await expect(stream).toBeVisible()
		const cells = page.getByTestId('week-strip').locator('[data-timeline-cell]')
		const keys = await cells.evaluateAll((all) =>
			all.map((cell) => ({
				key: cell.getAttribute('data-timeline-cell')!,
				now: cell.hasAttribute('data-now'),
			})),
		)
		const today = keys.findIndex((cell) => cell.now)
		const index = target === 'oldest' ? 0 : today + 4
		const key = keys[index]!.key
		await cells.nth(index).click()

		const weekTop = () =>
			stream.evaluate((el, key) => {
				const week = el.querySelector(`[data-timeline-week="${key}"]`)
				return week
					? Math.round(
							week.getBoundingClientRect().top - el.getBoundingClientRect().top,
						)
					: null
			}, key)
		await expect
			.poll(async () => Math.abs((await weekTop()) ?? Infinity), {
				timeout: 15_000,
			})
			.toBeLessThanOrEqual(4)
		await untilHydrated(stream)
		await untilFirstChunk(stream)
		await page.waitForTimeout(500)
		expect(Math.abs((await weekTop())!)).toBeLessThanOrEqual(4)
	})
}
