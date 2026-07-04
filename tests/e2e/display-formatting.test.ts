/**
 * Display-formatting e2e (#172): the Dashboard must never render an unrounded
 * float (the `120.6488888888889 TSS` bug), and the Event detail page must
 * render without console/hydration errors now that all dates format through
 * the locale-fixed, timezone-explicit shared layer.
 */
import { type Page } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

const RAW_FLOAT = /\d+\.\d{4,}/

function collectPageErrors(page: Page): string[] {
	const errors: string[] = []
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text())
	})
	page.on('pageerror', (error) => {
		errors.push(String(error))
	})
	return errors
}

test('Dashboard renders TSS as integers — no raw floats in the page text', async ({
	page,
	navigate,
	login,
}) => {
	const user = await login()

	// A completed session earlier today with the exact raw float from the bug
	// report, plus a fractional planned TSS — both must render rounded.
	const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
	await prisma.workoutSession.create({
		data: {
			user: { connect: { id: user.id } },
			scheduledAt: twoHoursAgo,
			status: 'completed',
			tssValue: 120.6488888888889,
			plannedTssValue: 95.4999,
			workout: {
				create: {
					title: 'Threshold intervals',
					discipline: 'run',
					intent: 'threshold',
					owner: { connect: { id: user.id } },
				},
			},
		},
	})

	await navigate('/')

	await expect(page.getByText('Threshold intervals').first()).toBeVisible()
	const text = await page.locator('main').innerText()
	expect(text).not.toMatch(RAW_FLOAT)
	expect(text).toContain('121 TSS')
})

test('Event detail renders with zero console errors (no hydration mismatch)', async ({
	page,
	login,
}) => {
	const user = await login()
	const event = await prisma.event.create({
		data: {
			name: 'Oslo Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			disciplines: JSON.stringify(['run']),
			target: JSON.stringify({ kind: 'time', seconds: 5400 }),
			athleteId: user.id,
		},
	})

	const errors = collectPageErrors(page)
	await page.goto(`/training/events/${event.id}`)
	await expect(page.getByText('Oslo Half Marathon')).toBeVisible()
	// The target renders through the shared formatters (1:30:00, not raw seconds).
	await expect(page.getByText('1:30:00')).toBeVisible()

	expect(errors).toEqual([])
})
