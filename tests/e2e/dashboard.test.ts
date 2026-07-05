import { type Page } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Shared display-formatting layer (#172): no athlete-facing surface may render
 * an unrounded float (e.g. a raw `120.6488888888889 TSS` EWMA/TSS value), and
 * the Event detail page must render without hydration warnings or console
 * errors (dates/times are locale-fixed and timezone-explicit).
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

	await navigate('/')
	await expect(page.getByTestId('decision-strip')).toBeVisible()

	// The tabbed Dashboard (#184) renders one dense panel at a time, so walk
	// all three views — Week (default), Trends, History — and scan each.
	await expect(page.getByTestId('week-timeline')).toBeVisible()
	expect(await page.evaluate(() => document.body.innerText)).not.toMatch(
		RAW_FLOAT,
	)

	const trendsTab = page.getByRole('tab', { name: /trends/i })
	await expect(async () => {
		await trendsTab.click()
		await expect(trendsTab).toHaveAttribute('aria-selected', 'true', {
			timeout: 2000,
		})
	}).toPass()
	await expect(page.getByRole('region', { name: /weekly load/i })).toBeVisible()
	expect(await page.evaluate(() => document.body.innerText)).not.toMatch(
		RAW_FLOAT,
	)

	await page.getByRole('tab', { name: /history/i }).click()
	await expect(
		page.getByRole('heading', { name: /session ledger/i }),
	).toBeVisible()
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
	// sent, so hydration cannot diverge.
	await expect(page.getByText('Sunday 18 April 2027')).toBeVisible()

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
