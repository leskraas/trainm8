import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { type Locator, type Page } from '@playwright/test'
import { AHEAD_INITIAL } from '#app/routes/_home/timeline/anchoring.ts'
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
 * (#503 criterion 7, ADR 0086 §4, ADR 0119).
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
 * (ADR 0119): the server renders this week and the next, the rest mounts once
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
	const weeks = () => stream.locator('[data-timeline-week]').count()
	const mounted = await weeks()

	// Read toward the end of what is mounted, until the weeks ahead arrive.
	const end = await stream.evaluate((el) => el.scrollHeight - el.clientHeight)
	await scrollStreamTo(page, end - 400)
	const reading = await readingRow(page)
	expect(reading).not.toBeNull()
	const before = (await rowTop(page, reading!))!

	await expect.poll(weeks, { timeout: 15_000 }).toBeGreaterThan(mounted)
	await page.waitForTimeout(300)
	expect(
		Math.abs((await rowTop(page, reading!))! - before),
	).toBeLessThanOrEqual(1)
})

test('on a screen taller than the weeks the server renders ahead, today is parked before the first paint and stays there', async ({
	page,
	navigate,
	login,
}) => {
	// #503 criterion 5. The server renders this week and the next (ADR 0119);
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
	// Today's row from the stream's top on every frame from the moment the
	// document is parsed: the landing script has run by then.
	await page.addInitScript(() => {
		const tops: number[] = []
		Object.assign(window, { __todayTops: tops })
		const poll = () => {
			const stream = document.querySelector('[data-timeline-stream]')
			const today = stream?.querySelector('[data-timeline-today]')
			if (stream && today) {
				tops.push(
					Math.round(
						today.getBoundingClientRect().top -
							stream.getBoundingClientRect().top,
					),
				)
			}
			requestAnimationFrame(poll)
		}
		document.addEventListener('DOMContentLoaded', () =>
			requestAnimationFrame(poll),
		)
	})

	await navigate(HOME_TIMELINE_HREF)
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toBeVisible()
	// Until the rest of the first chunk has been appended below, and a moment
	// after, for anything that would move today once it has.
	await untilHydrated(stream)
	await untilFirstChunk(stream)
	await page.waitForTimeout(1000)
	const tops = await page.evaluate(
		() => (window as unknown as { __todayTops: number[] }).__todayTops,
	)
	expect(tops.length).toBeGreaterThan(0)
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
		// the next, ADR 0119): the tap must not be dropped, and nothing may
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
