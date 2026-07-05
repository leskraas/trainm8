import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Tabbed Dashboard (#184): a permanent decision strip on top, everything
 * analytical behind Week / Trends / History tabs so only one dense view
 * renders at a time. The selected tab is URL state, so back/refresh keep the
 * view, and the strip carries the page's single status-derived session action.
 */

async function seedSessions(userId: string) {
	const now = new Date()
	const workout = await prisma.workout.create({
		data: {
			title: 'Threshold Run',
			discipline: 'run',
			intent: 'threshold',
			ownerId: userId,
		},
	})
	// Today's scheduled session — the decision strip's subject.
	const todaySession = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date(now.getTime() + 60 * 60 * 1000),
			status: 'scheduled',
			plannedTssValue: 60,
			plannedTssConfidence: 'full',
			source: 'authored',
		},
	})
	// A completed session so History has more than one row to count.
	await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt: new Date(now.getTime() - 26 * 60 * 60 * 1000),
			status: 'completed',
			tssValue: 55,
			source: 'recorded',
		},
	})
	return { todaySession }
}

test('tabs switch one panel at a time, persist in the URL, and survive refresh', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()
	await seedSessions(user.id)

	await navigate('/')

	// The decision strip is permanent chrome above the tabs.
	await expect(page.getByTestId('decision-strip')).toBeVisible()

	// Week is the default view: the tab is selected, the This Week strip
	// renders, and the other panels' dense content does not.
	const weekTab = page.getByRole('tab', { name: /^week$/i })
	await expect(weekTab).toHaveAttribute('aria-selected', 'true')
	await expect(page.getByTestId('week-timeline')).toBeVisible()
	await expect(page.getByTestId('session-ledger-table')).toHaveCount(0)
	await expect(page.getByRole('region', { name: /weekly load/i })).toHaveCount(
		0,
	)

	// Week → Trends. The first interaction after page load can race client
	// hydration, so retry until the tab activates.
	const trendsTab = page.getByRole('tab', { name: /trends/i })
	await expect(async () => {
		await trendsTab.click()
		await expect(trendsTab).toHaveAttribute('aria-selected', 'true', {
			timeout: 2000,
		})
	}).toPass()
	await expect(page).toHaveURL(/\?tab=trends/)
	await expect(page.getByRole('region', { name: /weekly load/i })).toBeVisible()
	await expect(
		page.getByRole('region', { name: /personal records/i }),
	).toBeVisible()
	// The Week panel's content unmounted — no zone duplicated across tabs.
	await expect(page.getByTestId('week-timeline')).toHaveCount(0)

	// Trends → History, which carries the session count on the tab.
	const historyTab = page.getByRole('tab', { name: /history/i })
	await expect(historyTab).toContainText('2')
	await historyTab.click()
	await expect(page).toHaveURL(/\?tab=history/)
	await expect(
		page.getByRole('heading', { name: /session ledger/i }),
	).toBeVisible()
	await expect(page.getByRole('region', { name: /weekly load/i })).toHaveCount(
		0,
	)

	// Refresh keeps the view — the choice lives in the URL.
	await page.reload()
	await expect(page.getByRole('tab', { name: /history/i })).toHaveAttribute(
		'aria-selected',
		'true',
	)
	await expect(
		page.getByRole('heading', { name: /session ledger/i }),
	).toBeVisible()

	// The tabs are keyboard-accessible: arrow keys rove focus (roving
	// tabindex), Enter activates the focused tab.
	await page.getByRole('tab', { name: /history/i }).focus()
	await page.keyboard.press('ArrowLeft')
	const trendsTabAgain = page.getByRole('tab', { name: /trends/i })
	await expect(trendsTabAgain).toBeFocused()
	await expect(trendsTabAgain).toHaveAttribute('tabindex', '0')
	await page.keyboard.press('Enter')
	await expect(trendsTabAgain).toHaveAttribute('aria-selected', 'true')
	await expect(page.getByRole('region', { name: /weekly load/i })).toBeVisible()
})

test('the decision strip carries the single honest session action and opens the detail view', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()
	const { todaySession } = await seedSessions(user.id)

	await navigate('/')

	const strip = page.getByTestId('decision-strip')
	await expect(strip).toBeVisible()
	await expect(strip.getByText('Threshold Run')).toBeVisible()

	// One status-derived action on the whole page (#179/#184): a scheduled
	// session is *viewed*, and no duplicate start CTA exists anywhere.
	const cta = page.getByRole('button', { name: 'View session' })
	await expect(cta).toHaveCount(1)
	await expect(page.getByText('Start session')).toHaveCount(0)

	// The first interaction after page load can race client hydration, so
	// retry the click until the navigation lands.
	await expect(async () => {
		await cta.click()
		await expect(page).toHaveURL(`/training/sessions/${todaySession.id}`, {
			timeout: 2000,
		})
	}).toPass()
	await expect(page.getByText('Threshold Run').first()).toBeVisible()
})

test('the header plan-arc chip opens the Target Event detail (#178 contract)', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()

	// An Event with a Plan Outline = the active plan the arc chip narrates.
	const event = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
			disciplines: JSON.stringify(['run']),
			planOutline: JSON.stringify({
				phases: [
					{ name: 'Base', weeks: 4, weeklyLoadHours: 6 },
					{ name: 'Build', weeks: 4, weeklyLoadHours: 9 },
					{ name: 'Peak', weeks: 2, weeklyLoadHours: 7 },
				],
			}),
		},
	})

	await navigate('/')

	const chip = page.getByRole('link', { name: /plan: spring half marathon/i })
	await expect(chip).toBeVisible()
	// Spelled out (#181): countdown · week N of M · phase — no "W9/10" shorthand.
	await expect(chip).toContainText(
		/\d+ days to race · Week \d+ of 10 · \w+ phase/,
	)

	// The old 3-stat plan bar is gone.
	await expect(page.getByText('of planned week load')).toHaveCount(0)

	await expect(async () => {
		await chip.click()
		await expect(page).toHaveURL(`/training/events/${event.id}`, {
			timeout: 2000,
		})
	}).toPass()
	await expect(page.getByText('Spring Half Marathon').first()).toBeVisible()
})
