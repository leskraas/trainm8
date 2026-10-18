import { HOME_TIMELINE_HREF } from '#app/utils/app-tabs.ts'
import { expect, openPlanAdvanced, test } from '#tests/playwright-utils.ts'

/**
 * _Hold meg aktiv_ end to end (#505 stories 1 and 9, ADR 0079): an athlete with
 * no race makes a plan with no Event and no end date, sees it on the plan page
 * as _blokk 1 av ∞_, and lands on home with nothing broken — on a phone.
 */
test.use({ viewport: { width: 390, height: 844 } })

test('Hold meg aktiv makes a plan with no race, marked blokk 1 av ∞ on the plan page and on home', async ({
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
	await holdActive.getByRole('radio', { name: 'Løping' }).check()
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
	// down to no race day. The top line is the phone's surface; from 1024px up
	// the season pane's plan card says it instead (ADR 0087).
	await page.setViewportSize({ width: 390, height: 844 })
	await navigate(HOME_TIMELINE_HREF)
	await expect(
		page.getByTestId('timeline-top').getByText('Blokk 1 av ∞'),
	).toBeVisible()
	await expect(page.getByText(/til løpsdagen/i)).toHaveCount(0)
	expect(errors).toEqual([])
})

test('Legg til et løp turns an open-ended plan into a plan toward the race, with its phases laid toward it', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const errors: string[] = []
	page.on('pageerror', (error) => {
		if (!/websocket/i.test(error.message)) errors.push(error.message)
	})

	await login()
	await navigate('/training/plan/new')
	const holdActive = page.getByRole('region', { name: 'Hold meg aktiv' })
	await holdActive.getByRole('radio', { name: 'Løping' }).check()
	await holdActive.getByLabel('Timer i uka').fill('4')
	await holdActive.getByRole('button', { name: 'Lag planen' }).click()
	await expect(page.getByText('blokk 1 av ∞')).toBeVisible()

	// A race ten weeks out, not on the calendar yet: named and dated on the spot.
	const raceDay = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10)
	await page.getByText('Legg til et løp').click()
	const offer = page.getByRole('form', { name: 'Legg til et løp' })
	await expect(
		offer.getByText(/Ukene du har trent og øktene dine blir stående/),
	).toBeVisible()
	await offer.getByLabel('Navn på løpet').fill('Vårmilen')
	await offer.getByLabel('Dato').fill(raceDay)
	await offer.getByRole('button', { name: 'Legg til løpet' }).click()

	// Now an ordinary plan toward that race, addressed by it.
	await expect(page).toHaveURL(/\/training\/plan\?event=[a-z0-9]+$/i)
	await expect(page.getByText('Planen bygger mot løpet nå')).toBeVisible()
	await expect(
		page.getByRole('link', { name: 'Vårmilen', exact: true }),
	).toBeVisible()
	await expect(page.getByText('blokk 1 av ∞')).toHaveCount(0)
	// Every Sesong editor is behind Plan's closed Avansert (ADR 0101 §2).
	await openPlanAdvanced(page)
	// The round lived so far stays; the run-up to the race follows it.
	for (const phase of ['Blokk 1', 'Oppbygging', 'Spissing', 'Nedtrapping']) {
		// Each phase is a card whose trigger opens on its name (the taper's
		// carries a `Trapper ned` badge beside it).
		await expect(
			page.getByRole('button', { name: new RegExp(`^${phase} `) }),
		).toBeVisible()
	}
	expect(errors).toEqual([])
})
