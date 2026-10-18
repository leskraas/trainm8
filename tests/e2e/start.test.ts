import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * The start end to end on a phone (#578): `/start` opens the level screen,
 * the athlete's history pre-fills the hours and days with where they came
 * from, and the answers lead through the Start Options to Planen er klar.
 * And the quiet way out, _Jeg vil heller sette opp sesongen selv_.
 *
 * The Athlete Timezone is UTC here (no profile), so a day key is a UTC date.
 */
test.use({ viewport: { width: 390, height: 844 } })

/** Four complete weeks of recorded runs, 43 km a week at 5:35, Tue and Sat. */
async function seedRunningHistory(userId: string) {
	const thisMonday = weekMonday(new Date(), 'UTC')
	for (let week = 1; week <= 4; week++) {
		const monday = addDays(thisMonday, -7 * week)
		for (const offset of [1, 5]) {
			const startedAt = new Date(`${addDays(monday, offset)}T07:00:00Z`)
			const durationSec = Math.round(21.5 * 335)
			const recording = await prisma.activityImport.create({
				data: {
					athleteId: userId,
					externalProvider: 'manual',
					externalId: `start-${userId}-${week}-${offset}`,
					startedAt,
					endedAt: new Date(startedAt.getTime() + durationSec * 1000),
					durationSec,
					distanceM: 21500,
					discipline: 'run',
					rawJson: '{}',
				},
			})
			await prisma.workoutSession.create({
				data: {
					userId,
					scheduledAt: startedAt,
					status: 'completed',
					source: 'recorded',
					recordingId: recording.id,
				},
			})
		}
	}
}

test('a new athlete goes from the level screen to Planen er klar, the history filling in the hours and days', async ({
	page,
	navigate,
	login,
}) => {
	// The first navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const errors: string[] = []
	page.on('pageerror', (error) => {
		if (!/websocket/i.test(error.message)) errors.push(error.message)
	})
	const user = await login()
	await seedRunningHistory(user.id)
	const main = page.getByRole('main')

	await navigate('/start')
	await expect(page).toHaveURL('/start/niva')
	await expect(
		page.getByRole('heading', { name: 'Hvor er du nå?' }),
	).toBeVisible()
	await page.getByRole('radio', { name: /Mosjonist/ }).click()
	await expect(main.getByText('4 timer', { exact: true })).toBeVisible()
	await expect(
		main.getByText(
			'Fra de siste fire ukene dine: 4 timer i uka, tirsdag og lørdag.',
		),
	).toBeVisible()
	await main.getByRole('button', { name: 'Slik regnet vi' }).click()
	await expect(main.getByText('43 km/uke à 5:35 ≈ 4 t')).toBeVisible()
	await page.getByRole('button', { name: 'Neste' }).click()

	await expect(page).toHaveURL(/\/start\/trening\?.*days=1%2C5/)
	const day = (name: string) => page.getByRole('button', { name, exact: true })
	await expect(day('tirsdag')).toHaveAttribute('aria-pressed', 'true')
	await expect(day('lørdag')).toHaveAttribute('aria-pressed', 'true')
	// One list of everything to pick, each with its mark (#584): the sports,
	// the Simple Activities and Styrke side by side, the main sport pressed.
	const list = page.getByRole('group', { name: 'Aktiviteter' })
	for (const name of [
		'Løping',
		'Sykling',
		'Svømming',
		'Klatring',
		'Fjelltur',
	]) {
		await expect(list.getByRole('button', { name, exact: true })).toBeVisible()
	}
	await expect(
		list.getByRole('button', { name: 'Løping', exact: true }),
	).toHaveAttribute('aria-pressed', 'true')
	await page.getByRole('button', { name: 'Neste' }).click()

	await expect(page).toHaveURL(/\/start\/okter\?/)
	await page.getByRole('button', { name: 'Hopp over', exact: true }).click()

	await expect(page).toHaveURL(/\/start\/valg\?/)
	// Each card draws its week as Uka di's blocks, a column a day (#584).
	await expect(
		page
			.locator('[data-start-option]')
			.first()
			.locator('[data-week-blocks] > li'),
	).toHaveCount(7)
	await page
		.getByRole('button', { name: /^Velg denne/ })
		.first()
		.click()

	// Making the plan lays two weeks of sessions, each priced: give it time.
	await expect(page).toHaveURL('/start/klar', { timeout: 20_000 })
	// Twelve weeks as bars: the round as laid solid, the rest projected.
	await expect(page.locator('[data-plan-ready-bar]')).toHaveCount(12)
	await expect(
		page.locator('[data-plan-ready-bar="laid"]').first(),
	).toBeAttached()
	await expect(
		page.locator('[data-plan-ready-bar="projected"]').first(),
	).toBeAttached()
	await expect(page.locator('[data-plan-ready-legend]')).toBeVisible()
	await page.getByRole('link', { name: 'Til I dag' }).click()
	await expect(page).toHaveURL('/')

	const outlines = await prisma.planOutline.findMany({
		where: { athleteId: user.id },
		select: { eventId: true },
	})
	expect(outlines).toEqual([{ eventId: null }])
	expect(errors).toEqual([])
})

test('preferences ticked but not sent survive going back a screen and forward again', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	await login()
	await page.goto(
		'/start/okter?level=recreational&hours=5&discipline=run&days=0,2,4,5',
	)
	const checkbox = (name: RegExp) => page.getByRole('checkbox', { name })
	await checkbox(/Korte økter/).click()
	await checkbox(/Jevnt hardt/).click()
	await expect(checkbox(/Korte økter/)).toBeChecked()

	await page
		.getByRole('link', { name: 'Tilbake til hva du liker å trene' })
		.click()
	await expect(page).toHaveURL(/\/start\/trening\?/)
	await page.getByRole('button', { name: 'Neste' }).click()

	await expect(page).toHaveURL(/\/start\/okter\?/)
	await expect(checkbox(/Korte økter/)).toBeChecked()
	await expect(checkbox(/Jevnt hardt/)).toBeChecked()
	await expect(checkbox(/Overrask meg/)).not.toBeChecked()
})

test('Jeg vil heller sette opp sesongen selv opens plan authoring, and connecting is a quiet way back', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	await login()

	await navigate('/start/niva')
	await page
		.getByRole('link', { name: /Har du intervals\.icu\? Koble til/ })
		.click()
	await expect(page).toHaveURL('/start/koble')
	await page.getByRole('link', { name: 'Ikke nå' }).click()
	await expect(page).toHaveURL('/start/niva')

	await page
		.getByRole('link', { name: 'Jeg vil heller sette opp sesongen selv' })
		.click()
	await expect(page).toHaveURL('/training/plan/new')
})
