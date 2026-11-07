import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { type Page } from '@playwright/test'
import { HOME_TIMELINE_HREF } from '#app/utils/app-tabs.ts'
import { prisma } from '#app/utils/db.server.ts'
import { expect, middayTimezone, test } from '#tests/playwright-utils.ts'

/**
 * The row the reader is reading never moves when content arrives above it
 * (#503 criterion 7, ADR 0086 §4, ADR 0113).
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
	for (let days = -21; days <= 84; days += days < 0 ? 1 : 2) {
		await prisma.workoutSession.create({
			data: {
				userId,
				scheduledAt: new Date(now.getTime() + days * DAY),
				status: days < 0 ? 'completed' : 'scheduled',
				tssValue: days < 0 ? 40 : null,
				plannedTssValue: 45,
				plannedTssConfidence: 'full',
				source: 'authored',
			},
		})
	}
	return { now, timezone }
}

/** `YYYY-MM-DD` in `timezone`. */
function dayKeyOf(instant: Date, timezone: string) {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(instant)
}

/**
 * Scroll the stream as a reader does: an input first, then the position,
 * instantly (the same rule as `home-timeline.test.ts`).
 */
async function scrollStreamTo(page: Page, top: number) {
	await page.getByTestId('timeline-stream').evaluate((el, to) => {
		el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 1 }))
		const previous = el.style.scrollBehavior
		el.style.scrollBehavior = 'auto'
		el.scrollTop = to
		el.style.scrollBehavior = previous
	}, top)
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

	await navigate(HOME_TIMELINE_HREF)
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toBeVisible()
	// The live import stream is open once the page has hydrated.
	await page.waitForTimeout(2000)

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
	const passed = dayKeyOf(at, timezone)
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
	await page.waitForTimeout(1500)
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
