import { expect, test, untilHydrated } from '#tests/playwright-utils.ts'

/**
 * _Endre sesongen_ end to end (#505 stories 72–77): an athlete with an
 * open-ended plan changes a week's target, sees the preview first — with the
 * warning that the week rises more than 10 % over the hard week before it —
 * confirms, and reads which numbers did not move. On a phone.
 */
test.use({ viewport: { width: 390, height: 844 } })

test('a new week target shows a preview with the 10 % warning, and the message says what stayed', async ({
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
	await holdActive.getByRole('radio', { name: 'Løping' }).check()
	await holdActive.getByLabel('Timer i uka').fill('4')
	await holdActive.getByRole('button', { name: 'Lag planen' }).click()
	await expect(page.getByText('blokk 1 av ∞')).toBeVisible()

	// The Weeks reading edits nothing itself: the plan's third week (a hard
	// week after a hard week, never begun whatever day this runs) links to
	// _Endre sesongen_, pre-filled for that week.
	await page
		.getByRole('navigation', { name: 'Season views' })
		.getByRole('link', { name: 'Weeks' })
		.click()
	await page
		.getByRole('list', { name: 'Training weeks' })
		.getByText('Week 3', { exact: true })
		.click()
	const link = page.getByRole('link', { name: 'Endre ukemålet: week 3 Run' })
	const weekKey = /weekKey=([\d-]+)/.exec(
		(await link.getAttribute('href')) ?? '',
	)?.[1]
	expect(weekKey).toBeTruthy()
	await link.click()

	const card = page.getByRole('region', { name: 'Endre sesongen' })
	const form = card.getByRole('form', { name: 'Endre ukemålet' })
	await expect(form).toBeVisible()
	const weekNumber = /Uke (\d+)/.exec(
		(await form.getByRole('combobox', { name: 'Uke' }).textContent()) ?? '',
	)?.[1]
	expect(weekNumber).toBeTruthy()
	await expect(form.getByText('Nå: 4 t')).toBeVisible()
	await form.getByLabel('Nytt ukemål (t)').fill('5')
	await form.getByRole('button', { name: 'Vis forhåndsvisning' }).click()

	// The preview comes first, with the warning, and nothing has changed yet.
	const preview = card.getByRole('region', { name: 'Forhåndsvisning' })
	await expect(preview).toBeVisible()
	await expect(
		preview.getByText(
			`Uke ${weekNumber}: mål 4 → 5 t. Fasen og de andre ukene står som før.`,
		),
	).toBeVisible()
	const warning = preview.getByRole('status')
	await expect(warning).toContainText('Raskt opp')
	await expect(warning).toContainText(
		`Uke ${weekNumber}: 4 → 5 t, +25 % over forrige harde uke.`,
	)
	if (process.env.SEASON_EDIT_SHOTS) {
		await card.screenshot({
			path: `${process.env.SEASON_EDIT_SHOTS}/week-target-preview.png`,
		})
	}

	// Changing the form after previewing hides the preview: its confirm could
	// otherwise apply a number the field no longer says.
	await form.getByLabel('Nytt ukemål (t)').fill('6')
	await expect(preview).toBeHidden()
	await form.getByLabel('Nytt ukemål (t)').fill('5')
	await expect(preview).toBeVisible()

	await preview.getByRole('button', { name: 'Bruk endringen' }).click()

	// The message: what moved, and which numbers did not.
	await expect(page.getByText('Sesongen er endret')).toBeVisible()
	await expect(
		page
			.locator('[data-sonner-toast]')
			.getByText(
				`Uke ${weekNumber}: mål 4 → 5 t. Fasen og de andre ukene står som før.`,
			),
	).toBeVisible()
	if (process.env.SEASON_EDIT_SHOTS) {
		await page.screenshot({
			path: `${process.env.SEASON_EDIT_SHOTS}/week-target-applied.png`,
		})
	}
	expect(errors).toEqual([])
})

test('choosing the easy week shows the weeks that change first, then says the phase kept its length', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	await login()
	await navigate('/training/plan/new')
	const holdActive = page.getByRole('region', { name: 'Hold meg aktiv' })
	await holdActive.getByRole('radio', { name: 'Løping' }).check()
	await holdActive.getByLabel('Timer i uka').fill('4')
	await holdActive.getByRole('button', { name: 'Lag planen' }).click()
	await expect(page.getByText('blokk 1 av ∞')).toBeVisible()

	const card = page.getByRole('region', { name: 'Endre sesongen' })
	await card.getByText('Velg hvilken uke som er lett').click()
	const form = card.getByRole('form', { name: 'Velg hvilken uke som er lett' })
	// The last hard week of the block becomes the easy one.
	const chosen = page
		.getByRole('option')
		.filter({ hasText: /hard uke$/ })
		.last()
	// Pressed once, hydrated: a second press would close the list again.
	const easyWeek = form.getByRole('combobox', { name: 'Lett uke' })
	await untilHydrated(easyWeek)
	await easyWeek.click()
	await expect(chosen).toBeVisible()
	const weekNumber = /Uke (\d+)/.exec((await chosen.textContent()) ?? '')?.[1]
	await chosen.click()
	await form.getByRole('button', { name: 'Vis forhåndsvisning' }).click()

	const preview = card.getByRole('region', { name: 'Forhåndsvisning' })
	await expect(
		preview.getByText(
			new RegExp(
				`^Blokk 1: den lette uka flyttes fra uke \\d+ til uke ${weekNumber}\\. Lengden på fasen og de andre ukene står som før\\.$`,
			),
		),
	).toBeVisible()
	await expect(preview.getByRole('row')).toHaveCount(3)
	if (process.env.SEASON_EDIT_SHOTS) {
		await card.screenshot({
			path: `${process.env.SEASON_EDIT_SHOTS}/easy-week-preview.png`,
		})
	}
	await preview.getByRole('button', { name: 'Bruk endringen' }).click()
	await expect(page.getByText('Sesongen er endret')).toBeVisible()
})
