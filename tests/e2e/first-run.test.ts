import { type Page } from '@playwright/test'
import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { MOCK_INTERVALSICU_API_KEY } from '#tests/mocks/intervalsicu.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * The first run end to end on a phone (#505 stories 61–71): connect
 * intervals.icu → "Dette fant vi" → three pre-filled questions → the plan
 * with "Vi valgte X fordi …" and a philosophy switch → the first two weeks →
 * I dag. And the other way out, "Jeg vil heller sette opp sesongen selv",
 * which opens the same plan in Sesong. The plan honours the chosen days and
 * hours, read back off the database.
 *
 * The Athlete Timezone is UTC here (no profile), so a day key is a UTC date.
 */
test.use({ viewport: { width: 390, height: 844 } })

const SHOTS = process.env.FIRST_RUN_SHOTS

async function shot(page: Page, name: string) {
	if (!SHOTS) return
	await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

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
					externalId: `first-run-${userId}-${week}-${offset}`,
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

/** The weekdays (Monday-first) of the sessions the plan laid. */
async function laidWeekdays(userId: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, source: 'generated' },
		select: { scheduledAt: true },
	})
	return new Set(sessions.map((s) => (s.scheduledAt.getUTCDay() + 6) % 7))
}

test('a new athlete goes from intervals.icu to I dag with a plan on the days and hours they chose', async ({
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
	// The page's own content, not the dev tools' view of its loader data.
	const main = page.getByRole('main')

	// Step 1: connect intervals.icu.
	await navigate('/start')
	await expect(
		page.getByRole('heading', { name: 'Koble til intervals.icu' }),
	).toBeVisible()
	await expect(main.getByText('Steg 1 av 5')).toBeVisible()
	await shot(page, '1-connect')
	await page
		.getByLabel('API-nøkkel fra intervals.icu')
		.fill(MOCK_INTERVALSICU_API_KEY)
	await page.getByRole('button', { name: 'Koble til' }).click()

	// Step 2: Dette fant vi, from the last four weeks.
	await expect(page).toHaveURL('/start/funn')
	await expect(
		page.getByRole('heading', { name: 'Dette fant vi' }),
	).toBeVisible()
	await expect(main.getByText('Løping · 8 økter på 4 uker')).toBeVisible()
	await expect(main.getByText('43 km/uke à 5:35 ≈ 4 t')).toBeVisible()
	await expect(main.getByText('tirsdag og lørdag')).toBeVisible()
	await expect(main.getByText('Ingen styrkeøkter')).toBeVisible()
	await shot(page, '2-findings')
	await page.getByRole('link', { name: 'Det stemmer' }).click()

	// Step 3: three questions, pre-filled, the hours with their arithmetic.
	await expect(page).toHaveURL('/start/sporsmal')
	await expect(
		page.getByRole('radio', { name: /Hold meg aktiv/ }),
	).toBeChecked()
	await expect(page.getByLabel('Timer i uka')).toHaveValue('4')
	await expect(
		main.getByText('Fra historikken: 43 km/uke à 5:35 ≈ 4 t'),
	).toBeVisible()
	await expect(page.getByRole('checkbox', { name: 'tirsdag' })).toBeChecked()
	await expect(page.getByRole('checkbox', { name: 'lørdag' })).toBeChecked()
	await expect(
		page.getByRole('checkbox', { name: 'torsdag' }),
	).not.toBeChecked()
	await page.getByRole('checkbox', { name: 'torsdag' }).check()
	await page.getByLabel('Timer i uka').fill('4.5')
	await shot(page, '3-questions')
	await page.getByRole('button', { name: 'Vis planen' }).click()

	// Step 4: the plan, why it was chosen, and a switch.
	await expect(page).toHaveURL(/\/start\/plan\?/)
	await expect(main.getByText(/^Vi valgte Klassisk 3:1 fordi /)).toBeVisible()
	// The 4,5 t are the cap: the round climbs to them from a lower first week.
	await expect(main.getByText('Første uke: 4 t')).toBeVisible()
	await expect(
		main.getByText(/^Ingen uke går over 4,5 t – timene du sa du har\./),
	).toBeVisible()
	await shot(page, '4-plan')
	await main.getByText('Bytt filosofi').first().click()
	await page.getByRole('radio', { name: /Polarisert 80\/20/ }).check()
	await page.getByRole('button', { name: 'Bruk denne' }).click()
	await expect(main.getByText('Du valgte Polarisert 80/20.')).toBeVisible()
	await expect(
		main.getByText(/^Vårt forslag: Vi valgte Klassisk 3:1/),
	).toBeVisible()
	await page.getByRole('link', { name: 'Se de to første ukene' }).click()

	// Step 5: the first two weeks, on tirsdag, torsdag and lørdag.
	await expect(page).toHaveURL(/\/start\/uker\?/)
	const weeks = main.getByRole('region', { name: /^Uke \d+ · fra / })
	await expect(weeks).toHaveCount(2)
	for (const week of await weeks.all()) {
		await expect(week.getByRole('listitem')).toHaveCount(3)
		await expect(week.getByText(/^tirsdag /)).toBeVisible()
		await expect(week.getByText(/^torsdag /)).toBeVisible()
		await expect(week.getByText(/^lørdag /)).toBeVisible()
	}
	await expect(
		weeks.first().getByText(/^\d+(,\d)? t planlagt · målet er \d+(,\d)? t$/),
	).toBeVisible()
	await shot(page, '5-weeks')
	await page.getByRole('button', { name: 'Start planen' }).click()

	// I dag, with the plan.
	// Making the plan lays two weeks of sessions, each priced: give it time.
	await expect(page).toHaveURL('/', { timeout: 20_000 })
	await expect(page.getByText('Planen er klar')).toBeVisible()
	await shot(page, '6-i-dag')

	const outline = await prisma.planOutline.findFirstOrThrow({
		where: { athleteId: user.id },
		select: { family: true, eventId: true },
	})
	expect(outline).toEqual({ family: 'polarized', eventId: null })
	expect(await laidWeekdays(user.id)).toEqual(new Set([1, 3, 5]))
	expect(errors).toEqual([])
})

test('Jeg vil heller sette opp sesongen selv opens the same plan, filled in, in Sesong', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	const main = page.getByRole('main')
	const raceDate = addDays(weekMonday(new Date(), 'UTC'), 7 * 20 + 5)

	// Skipping intervals.icu says what it costs, and every finding says why it
	// has no number.
	await navigate('/start')
	await expect(
		main.getByText(/Hopper du over, har vi ingen historikk/),
	).toBeVisible()
	await page.getByRole('link', { name: 'Hopp over' }).click()
	await expect(page).toHaveURL('/start/funn')
	await expect(
		main.getByText(/^Ikke målt · intervals\.icu er ikke koblet til/),
	).toHaveCount(4)

	// Noe er feil: the athlete says it themselves.
	await main.getByText('Noe er feil').first().click()
	await page.getByRole('radio', { name: 'Sykling' }).check()
	await page.getByLabel('Timer i uka').fill('6')
	// The convention's days are ticked; the athlete's are Mon, Wed, Fri, Sun.
	for (const [day, checked] of [
		['mandag', true],
		['tirsdag', false],
		['onsdag', true],
		['torsdag', false],
		['fredag', true],
		['lørdag', false],
		['søndag', true],
	] as const) {
		await page.getByRole('checkbox', { name: day }).setChecked(checked)
	}
	await shot(page, 'b2-correct')
	await page.getByRole('button', { name: 'Bruk dette' }).click()

	await expect(page).toHaveURL(/\/start\/sporsmal\?/)
	await expect(main.getByText('Sykling')).toBeVisible()
	await expect(page.getByLabel('Timer i uka')).toHaveValue('6')
	await page.getByRole('radio', { name: 'Et løp eller en dato' }).check()
	await page.getByLabel('Hva heter det?').fill('Birken')
	await page.getByLabel('Dato', { exact: true }).fill(raceDate)
	await page.getByRole('button', { name: 'Vis planen' }).click()

	await expect(page).toHaveURL(/\/start\/plan\?/)
	await expect(main.getByText(/uker mot Birken\./)).toBeVisible()
	await page.getByRole('link', { name: 'Se de to første ukene' }).click()
	await expect(page).toHaveURL(/\/start\/uker\?/)
	await shot(page, 'b5-weeks')
	await page
		.getByRole('button', { name: 'Jeg vil heller sette opp sesongen selv' })
		.click()

	// Sesong, with the same plan in it.
	await expect(page).toHaveURL(/\/training\/plan\?outline=[a-z0-9]+$/i, {
		timeout: 20_000,
	})
	await expect(main.getByText('Birken').first()).toBeVisible()
	await shot(page, 'b6-sesong')

	const outline = await prisma.planOutline.findFirstOrThrow({
		where: { athleteId: user.id },
		select: {
			event: { select: { name: true } },
			tracks: { select: { discipline: true, currency: true } },
		},
	})
	expect(outline.event?.name).toBe('Birken')
	expect(outline.tracks).toEqual([{ discipline: 'bike', currency: 'hours' }])
	expect(await laidWeekdays(user.id)).toEqual(new Set([0, 2, 4, 6]))
})
