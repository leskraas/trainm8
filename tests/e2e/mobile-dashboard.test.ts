import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Mobile fit (#182): trainm8 is a PWA with a share-target, so a 390px phone is
 * a primary surface. The home timeline is designed *for* that width, and this
 * spec holds it to the same obligation the Session Ledger cards carried before
 * it: every field of a session is readable on a phone, nothing is clipped
 * off-screen, the week strip scrolls sideways, and no zone overflows the page.
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 }

test.use({ viewport: MOBILE_VIEWPORT })

test('Home at 390px: a row carries every field, the strip scrolls, no page overflow', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()
	const now = new Date()

	// A completed session with everything a row can say: a titled workout (lane
	// + profile from its steps), a duration, actual and planned TSS (so the
	// compliance chip can name both sides and its band), and a logged RPE.
	const workout = await prisma.workout.create({
		data: {
			ownerId: user.id,
			title: 'Threshold 4x8',
			discipline: 'bike',
			intent: 'threshold',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{ orderIndex: 0, kind: 'cardio', durationSec: 1980 },
								{ orderIndex: 1, kind: 'cardio', durationSec: 1320 },
							],
						},
					},
				],
			},
		},
	})
	const completedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000)
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: completedAt,
			status: 'completed',
			tssValue: 56,
			plannedTssValue: 85,
			plannedTssConfidence: 'full',
			source: 'authored',
			sessionLog: { create: { content: 'Legs heavy but held power.', rpe: 8 } },
		},
	})
	// Two more weeks of season, so the strip is wider than the phone and the
	// claim that it scrolls sideways is actually under test.
	for (const daysBack of [9, 16]) {
		await prisma.workoutSession.create({
			data: {
				userId: user.id,
				scheduledAt: new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000),
				status: 'completed',
				tssValue: 45,
				source: 'recorded',
			},
		})
	}
	// A planned session ahead of "now", so the prescription variant renders too —
	// a planned row is an instruction, and its line ends in "planned".
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			scheduledAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
			status: 'scheduled',
			plannedTssValue: 74,
			plannedTssConfidence: 'full',
			source: 'authored',
		},
	})

	await navigate('/')
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toBeVisible()
	await page.waitForTimeout(2500)

	// The completed row: title, weekday, duration, the banded compliance chip
	// naming both sides, the RPE on the internal-load line, and the shape bars.
	const row = stream.getByRole('link', { name: /Threshold 4x8/ })
	await expect(row).toBeVisible()
	await expect(row).toContainText('55 min')
	await expect(row).toContainText('TSS 56 / 85 · UNDER')
	await expect(row).toContainText('RPE 8')
	// The lane is named, not only coloured.
	await expect(row.getByRole('img', { name: 'Ride' })).toBeVisible()

	// The planned row states its prescription honestly and never as an actual.
	await expect(stream.getByText('74 TSS planned')).toBeVisible()

	// The week strip is the navigation axis and scrolls sideways on a phone.
	const strip = page.getByTestId('week-strip')
	await expect(strip).toBeVisible()
	const scrollable = await strip.evaluate(
		(el) => el.scrollWidth > el.clientWidth,
	)
	expect(scrollable).toBe(true)
	const scrolled = await strip.evaluate((el) => {
		el.scrollLeft = 120
		return el.scrollLeft
	})
	expect(scrolled).toBeGreaterThan(0)

	// Nothing overflows the page horizontally at 390px…
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)
	// …and the page itself does not scroll vertically: the stream does.
	expect(
		await page.evaluate(
			() => document.documentElement.scrollHeight <= window.innerHeight + 1,
		),
	).toBe(true)
})
