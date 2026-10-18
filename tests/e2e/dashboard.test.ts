import { type Page } from '@playwright/test'
import { HOME_TIMELINE_HREF } from '#app/utils/app-tabs.ts'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Shared display-formatting layer (#172): no athlete-facing surface may render
 * an unrounded float (e.g. a raw `120.6488888888889 TSS` EWMA/TSS value), and
 * the Event detail page must render without hydration warnings or console
 * errors (dates/times are locale-fixed and timezone-explicit).
 *
 * Home is now one bi-directional stream rather than three tabs, so the sweep
 * scrolls the season instead of clicking through panels: a week the reader has
 * not reached yet is a week whose numbers nobody has checked.
 */

/** A raw unrounded float: 4+ fractional digits (the acceptance regex). */
const RAW_FLOAT = /\d+\.\d{4,}/

function collectConsoleErrors(page: Page) {
	const errors: string[] = []
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text())
	})
	page.on('pageerror', (err) => {
		errors.push(err.message)
	})
	return errors
}

test('Dashboard renders no unrounded floats even from raw TSS values', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()

	// A completed session this week carrying the kind of raw TSS float the load
	// pipeline produces, plus a planned one with a fractional Planned TSS — both
	// must reach the screen as integers.
	const now = new Date()
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			scheduledAt: new Date(now.getTime() - 60 * 60 * 1000),
			status: 'completed',
			tssValue: 120.6488888888889,
			plannedTssValue: 99.437219,
			plannedTssConfidence: 'full',
			source: 'recorded',
		},
	})
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			scheduledAt: new Date(now.getTime() + 60 * 60 * 1000),
			status: 'scheduled',
			plannedTssValue: 55.5555555,
			plannedTssConfidence: 'full',
			source: 'authored',
		},
	})

	await navigate(HOME_TIMELINE_HREF)
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toBeVisible()
	// Let the landing settle before measuring anything.
	await page.waitForTimeout(2500)

	// The home timeline is one stream, so the walk is a scroll rather than a set
	// of tabs: scan the landing, then both directions, because
	// a raw float can hide in a week the reader has not reached yet.
	expect(await page.evaluate(() => document.body.innerText)).not.toMatch(
		RAW_FLOAT,
	)

	for (const direction of ['forward', 'backward'] as const) {
		for (let pass = 0; pass < 8; pass++) {
			const before = await stream.evaluate(
				(el) => el.querySelectorAll('[data-timeline-week]').length,
			)
			await stream.evaluate((el, dir) => {
				el.scrollTop = dir === 'forward' ? el.scrollHeight : 0
			}, direction)
			await page.waitForTimeout(400)
			expect(await page.evaluate(() => document.body.innerText)).not.toMatch(
				RAW_FLOAT,
			)
			const after = await stream.evaluate(
				(el) => el.querySelectorAll('[data-timeline-week]').length,
			)
			if (after === before) break
		}
	}

	// Both caps state their own numbers, and neither may leak a raw float.
	await expect(page.getByText(/alt er skrevet til og med/i)).toBeVisible()
	expect(await page.evaluate(() => document.body.innerText)).not.toMatch(
		RAW_FLOAT,
	)
})

test('Event detail renders with zero hydration warnings and console errors', async ({
	page,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()
	const event = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2027-04-18T00:00:00.000Z'),
			disciplines: JSON.stringify(['run']),
			target: JSON.stringify({ kind: 'time', seconds: 5400 }),
			location: 'Oslo',
		},
	})

	const errors = collectConsoleErrors(page)
	await page.goto(`/training/events/${event.id}`)
	await expect(page.getByText('Spring Half Marathon')).toBeVisible()
	// The shared, timezone-explicit date renders — the same string the server
	// sent, so hydration cannot diverge — in Norwegian (ADR 0081).
	await expect(page.getByText(/søndag 18\. apr 2027/)).toBeVisible()

	// Dev-server infrastructure noise is not an app error; hydration warnings
	// ("Hydration failed", "did not match", React error #418/#423) and any other
	// app console error must still fail the test.
	const IGNORED = [
		'Failed to load resource', // unrelated 404s (favicons etc.)
		'WebSocket', // Vite HMR socket in the dev-server harness
		'[vite]',
	]
	expect(
		errors.filter((e) => !IGNORED.some((pattern) => e.includes(pattern))),
	).toEqual([])
})
