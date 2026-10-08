import { type Page } from '@playwright/test'
import { addDays, mondayOfDay } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { getWeekVolumes } from '#app/utils/plan-outline/week-volumes.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * The writing line end to end on a phone (#505 stories 35–41): a session typed
 * as a sentence on an empty day, what the app understood of it, the week sum
 * before → after against the Week Target, a suggestion for a misspelt word,
 * the save, the toast that says the target stayed, and the row it wrote — and
 * the creation menu's line, which writes a day months out past the Planning
 * Horizon.
 *
 * The athlete's timezone is UTC, so "today" is the UTC calendar day, and the
 * plan opens this Monday with a run track in km.
 */
test.use({ viewport: { width: 390, height: 844 } })

const TZ = 'UTC'
const SHOTS = process.env.WRITING_LINE_SHOTS

async function shot(page: Page, name: string) {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function seedRunner(userId: string) {
	await prisma.athleteProfile.create({
		data: { userId, timezone: TZ, defaultTrainingTime: '07:00' },
	})
	const created = await createPlanOutline(userId, {
		startWeekKey: mondayOfDay(todayKey()),
		structure: { phases: [{ name: 'Blokk 1', weeks: 26, rhythm: '3:1' }] },
		tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
	})
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
}

function todayKey() {
	return new Date().toISOString().slice(0, 10)
}

/** The run track's week, as the app reads it: planned and target. */
async function runWeek(userId: string, dayKey: string) {
	const volumes = await getWeekVolumes(userId, { weekKey: mondayOfDay(dayKey) })
	const run = volumes.tracks.find((t) => t.discipline === 'run')!
	return { planned: run.planned ?? 0, target: run.target! }
}

function weekName(dayKey: string) {
	const monday = mondayOfDay(dayKey)
	const thisMonday = mondayOfDay(todayKey())
	if (monday === thisMonday) return 'denne uka'
	if (monday === addDays(thisMonday, 7)) return 'neste uke'
	throw new Error('the test writes this week or the next')
}

test('writing a session on an empty day: the parse, the week sum, a suggestion, the save and the toast', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const errors: string[] = []
	page.on('pageerror', (error) => {
		if (!/websocket/i.test(error.message)) errors.push(error.message)
	})
	const user = await login()
	await seedRunner(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()

	// Today: never folded into a band of free days, so its empty cell is
	// always drawn.
	const day = todayKey()
	const before = await runWeek(user.id, day)

	const cell = page.locator(`[data-timeline-empty="${day}"]`)
	await cell.scrollIntoViewIfNeeded()
	// The cell is a button the moment it is drawn; retried until hydrated.
	await expect(async () => {
		await cell.click({ timeout: 1000 })
		await expect(page.locator(`[data-timeline-draft="${day}"]`)).toBeVisible({
			timeout: 1000,
		})
	}).toPass()
	const draft = page.locator(`[data-timeline-draft="${day}"]`)

	// No history to read a sport from, so the draft asks; the athlete answers.
	await draft.getByRole('radio', { name: 'Løping' }).click()
	const input = draft.getByRole('textbox', { name: 'Skriv økta' })

	// 16px or more, so iOS does not zoom into the field (story 41).
	const fontSize = await input.evaluate((el) =>
		parseFloat(getComputedStyle(el).fontSize),
	)
	expect(fontSize).toBeGreaterThanOrEqual(16)

	// A misspelt word: said where it stands, with the word it was meant to be,
	// and nothing can be saved while it stands.
	await input.fill('10 km roilg')
	await expect(draft.getByText('Kjenner ikke «roilg»')).toBeVisible()
	const save = draft.getByRole('button', { name: 'Legg til «10 km roilg»' })
	await expect(save).toBeDisabled()
	await shot(page, '1-suggestion')
	await draft.getByRole('button', { name: 'Bytt «roilg» med «rolig»' }).click()
	await expect(input).toHaveValue('10 km rolig')

	// What the app understood, rendered as the Token Sentence the row will be.
	await expect(draft.getByText('Forstått')).toBeVisible()
	await expect(draft.getByText('10 km', { exact: true })).toBeVisible()
	await expect(draft.getByText('Z2', { exact: true })).toBeVisible()
	await expect(draft.getByText('Til sammen 10 km')).toBeVisible()
	// The week sum before → after, against a target the session does not move.
	await expect(
		draft.getByText(
			`Løping ${weekName(day)}: ${before.planned} → ${before.planned + 10} km, målet står på ${before.target}`,
			{ exact: true },
		),
	).toBeVisible()
	await shot(page, '2-understood')

	await draft.getByRole('button', { name: 'Legg til «10 km rolig»' }).click()

	// The toast states the sum before → after and that the target stayed.
	await expect(
		page.getByText(
			`Løping ${weekName(day)}: ${before.planned} → ${before.planned + 10} km. Ukemålet står på ${before.target}.`,
		),
	).toBeVisible()
	// The row it wrote opens as its Token Sentence, as a stamp does.
	const done = page.getByRole('button', { name: 'Ferdig' })
	await expect(done).toBeVisible()
	await shot(page, '3-saved')
	await done.click()
	await expect(
		page.locator(`[data-timeline-day="${day}"]`).getByText('10 km rolig'),
	).toBeVisible()
	await shot(page, '4-row')

	const after = await runWeek(user.id, day)
	expect(after).toEqual({
		planned: before.planned + 10,
		target: before.target,
	})
	expect(errors).toEqual([])
})

test('the creation menu writes a day months out, past the Planning Horizon', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedRunner(user.id)
	const far = addDays(todayKey(), 90)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await expect(async () => {
		await page.getByRole('button', { name: 'Lag ny' }).click({ timeout: 1000 })
		await page
			.getByRole('menuitem', { name: 'Skriv en økt' })
			.click({ timeout: 1000 })
	}).toPass()

	const panel = page.getByRole('region', { name: 'Skriv en økt' })
	await panel.getByLabel('Dag').fill(far)
	await panel.getByRole('radio', { name: 'Løping' }).click()
	const input = panel.getByRole('textbox', { name: 'Skriv økta' })
	expect(
		await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
	).toBeGreaterThanOrEqual(16)
	await input.fill('21 km langtur')
	await expect(
		panel.getByText(/^Løping uke \d+: 0 → 21 km, målet står på \d+$/),
	).toBeVisible()
	await shot(page, '5-panel')
	await panel.getByRole('button', { name: 'Legg til «21 km langtur»' }).click()

	await expect(
		page.getByText(/^Løping uke \d+: 0 → 21 km\. Ukemålet står på \d+\.$/),
	).toBeVisible()
	await expect(panel).toHaveCount(0)

	const written = await prisma.workoutSession.findFirstOrThrow({
		where: { userId: user.id },
		select: {
			scheduledAt: true,
			source: true,
			workout: { select: { title: true } },
		},
	})
	expect(written.scheduledAt.toISOString().slice(0, 10)).toBe(far)
	expect(written.source).toBe('authored')
	expect(written.workout?.title).toBe('21 km langtur')
})
