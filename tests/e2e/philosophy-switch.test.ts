import { expect, test } from '#tests/playwright-utils.ts'

/**
 * _Bytt filosofi_ end to end (#505 stories 10–14): an athlete with an
 * open-ended plan reads which philosophy it follows, picks another, sees the
 * plan from the first unbegun week on before anything changes, confirms, and
 * reads the new philosophy on the plan — on a phone.
 */
test.use({ viewport: { width: 390, height: 844 } })

test('switching philosophy shows a preview first, and the plan follows the new one once confirmed', async ({
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
	await holdActive.getByRole('radio', { name: 'Run' }).check()
	await holdActive.getByLabel('Timer i uka').fill('4')
	await holdActive.getByRole('button', { name: 'Lag planen' }).click()
	await expect(page.getByText('blokk 1 av ∞')).toBeVisible()

	// The plan says which philosophy it follows, in plain words.
	const card = page.getByRole('region', { name: 'Filosofi' })
	await expect(card.getByText('Planen følger Klassisk 3:1')).toBeVisible()

	await card.getByText('Bytt filosofi').click()
	await card.getByRole('radio', { name: /Polarisert 80\/20/ }).check()
	await card.getByRole('button', { name: 'Vis forhåndsvisning' }).click()

	// The preview comes first, and nothing has changed yet.
	const preview = page.getByRole('region', { name: 'Forhåndsvisning' })
	await expect(preview).toBeVisible()
	await expect(
		preview.getByText(/Klassisk 3:1 → Polarisert 80\/20 fra uka som starter/),
	).toBeVisible()
	await expect(preview.getByText(/1 veldig hard i uka/).first()).toBeVisible()
	await expect(card.getByText('Planen følger Klassisk 3:1')).toBeVisible()
	if (process.env.SHOTS_DIR) {
		await card.screenshot({
			path: `${process.env.SHOTS_DIR}/philosophy-preview.png`,
		})
	}

	await preview
		.getByRole('button', { name: 'Bytt til Polarisert 80/20' })
		.click()

	await expect(page.getByText('Planen følger en ny filosofi')).toBeVisible()
	await expect(
		page
			.getByRole('region', { name: 'Filosofi' })
			.getByText('Planen følger Polarisert 80/20'),
	).toBeVisible()
	if (process.env.SHOTS_DIR) {
		await page
			.getByRole('region', { name: 'Filosofi' })
			.screenshot({ path: `${process.env.SHOTS_DIR}/philosophy-after.png` })
	}
	// The week being lived is still the first round's.
	await expect(page.getByText('blokk 1 av ∞')).toBeVisible()
	expect(errors).toEqual([])
})
