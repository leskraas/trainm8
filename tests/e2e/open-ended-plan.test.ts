import { expect, test } from '#tests/playwright-utils.ts'

/**
 * _Hold meg aktiv_ end to end (#505 stories 1 and 9, ADR 0079): an athlete with
 * no race makes a plan with no Event and no end date, sees it on the plan page
 * as _blokk 1 av ∞_, and lands on home with nothing broken — on a phone.
 */
test.use({ viewport: { width: 390, height: 844 } })

test('an athlete with no race makes an open-ended plan and lands on home', async ({
	page,
	navigate,
	login,
}) => {
	// The first navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const errors: string[] = []
	page.on('pageerror', (error) => {
		// The dev server's hot-reload socket, not the app.
		if (!/websocket/i.test(error.message)) errors.push(error.message)
	})

	await login()
	await navigate('/training/plan/new')

	const holdActive = page.getByRole('region', { name: 'Hold meg aktiv' })
	await expect(holdActive).toBeVisible()
	await expect(
		holdActive.getByText(/ingen løp og ingen sluttdato/i),
	).toBeVisible()
	// A fresh athlete has no history to pre-fill from, so they say it themselves.
	await holdActive.getByRole('radio', { name: 'Run' }).check()
	await holdActive.getByLabel('Timer i uka').fill('4')
	await holdActive.getByRole('button', { name: 'Lag planen' }).click()

	// Straight to the plan it made, addressed by the plan itself: there is no
	// Event to name it by.
	await expect(page).toHaveURL(/\/training\/plan\?outline=[a-z0-9]+$/i)
	await expect(page.getByText('blokk 1 av ∞')).toBeVisible()
	await expect(page.getByText(/ingen løp og ingen sluttdato/i)).toBeVisible()
	// No race is invented for it, so nothing measures the plan against one.
	await expect(page.getByText(/your event’s week/i)).toHaveCount(0)
	await expect(page.getByText(/building toward/i)).toHaveCount(0)

	// With no plan toward a race, it is the athlete's active plan everywhere.
	await navigate('/training/plan')
	await expect(page.getByText('blokk 1 av ∞')).toBeVisible()

	// Home knows the plan: its header says which round today is in, and counts
	// down to no race day.
	await navigate('/')
	await expect(page.getByText(/· blokk 1 av ∞$/)).toBeVisible()
	await expect(page.getByText(/to race day/i)).toHaveCount(0)
	expect(errors).toEqual([])
})
