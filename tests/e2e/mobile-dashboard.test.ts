import { prisma } from '#app/utils/db.server.ts'
import { formatDayDate } from '#app/utils/format.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Mobile fit (#182): trainm8 is a PWA with a share-target, so a 390px phone is
 * a primary surface. Below the tablet breakpoint the Session Ledger renders as
 * cards (every table field readable, nothing clipped off-screen), the This Week
 * strip scrolls horizontally, and no Dashboard zone overflows the page.
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 }
// A fresh test user has no Athlete Profile, so the app formats in UTC.
const ATHLETE_DEFAULT_TIMEZONE = 'UTC'

test.use({ viewport: MOBILE_VIEWPORT })

test('Dashboard at 390px: ledger cards carry every field, week strip scrolls, no page overflow', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()
	const now = new Date()

	// A completed session with everything the table's columns carry: a titled
	// workout (type + profile from its steps), duration, actual + planned TSS
	// (so the adherence-banded load renders), and a logged RPE.
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
	// A planned session ahead of "now" so the upcoming (dashed) card variant and
	// its honest "planned N TSS" load render too.
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

	// The decision strip stacks (still visible) and the tabs are reachable at
	// 390px (#184).
	await expect(page.getByTestId('decision-strip')).toBeVisible()
	const tablist = page.getByRole('tablist', { name: /dashboard views/i })
	await expect(tablist).toBeVisible()

	// The This Week strip (default Week tab) is horizontally scrollable on a
	// phone: seven day cards overflow the 390px viewport, and the strip itself
	// scrolls.
	const week = page.getByTestId('week-timeline')
	await expect(week).toBeVisible()
	const scrollable = await week.evaluate(
		(el) => el.scrollWidth > el.clientWidth,
	)
	expect(scrollable).toBe(true)
	const scrolled = await week.evaluate((el) => {
		el.scrollLeft = 120
		return el.scrollLeft
	})
	expect(scrolled).toBeGreaterThan(0)

	// No Dashboard zone may overflow the page horizontally at 390px (Week tab).
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)

	// The Session Ledger lives behind the History tab (#184). The first
	// interaction after page load can race client hydration, so retry.
	const historyTab = page.getByRole('tab', { name: /history/i })
	await expect(async () => {
		await historyTab.click()
		await expect(historyTab).toHaveAttribute('aria-selected', 'true', {
			timeout: 2000,
		})
	}).toPass()
	await expect(
		page.getByRole('heading', { name: /session ledger/i }),
	).toBeVisible()

	// Below the tablet breakpoint the ledger is cards, not the table.
	const cards = page.getByTestId('session-ledger-cards')
	await expect(cards).toBeVisible()
	await expect(page.getByTestId('session-ledger-table')).toBeHidden()

	// Every field of the completed session is present and visible: session
	// title, date, type, duration, load (with unit), and RPE — the columns
	// that clipped off-screen in the table.
	const completedCard = cards
		.getByRole('article')
		.filter({ hasText: 'Threshold 4x8' })
	await expect(
		completedCard.getByRole('link', { name: 'Threshold 4x8' }),
	).toBeVisible()
	await expect(
		completedCard.getByText(
			formatDayDate(completedAt, ATHLETE_DEFAULT_TIMEZONE),
		),
	).toBeVisible()
	await expect(completedCard.getByText('Ride', { exact: true })).toBeVisible()
	await expect(completedCard.getByText(/55\s*min/)).toBeVisible()
	await expect(completedCard.getByText(/56\s*TSS/)).toBeVisible()
	await expect(completedCard.getByText(/RPE\s*8/)).toBeVisible()
	// The intensity profile renders on the card.
	await expect(completedCard.getByTestId('ledger-card-profile')).toBeVisible()

	// The planned session card shows its prescription honestly.
	const plannedCard = cards
		.getByRole('article')
		.filter({ hasText: /planned\s*74\s*TSS/ })
	await expect(plannedCard).toBeVisible()

	// No Dashboard zone may overflow the page horizontally at 390px (History
	// tab with the card ledger).
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
	)
	expect(overflow).toBeLessThanOrEqual(0)
})
