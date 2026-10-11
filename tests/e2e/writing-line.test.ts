import { type Page } from '@playwright/test'
import { addDays, mondayOfDay } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatNbDayOfMonth, formatNbWeekdayShort } from '#app/utils/format.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { getWeekVolumes } from '#app/utils/plan-outline/week-volumes.server.ts'
import { expect, test, untilHydrated } from '#tests/playwright-utils.ts'

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

async function seedRunner(userId: string, weeks = 26) {
	await prisma.athleteProfile.create({
		data: { userId, timezone: TZ, defaultTrainingTime: '07:00' },
	})
	const created = await createPlanOutline(userId, {
		startWeekKey: mondayOfDay(todayKey()),
		structure: { phases: [{ name: 'Blokk 1', weeks, rhythm: '3:1' }] },
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

	const midday = new Date(`${day}T12:00:00Z`)
	const dayName = `${formatNbWeekdayShort(midday, TZ)} ${formatNbDayOfMonth(midday, TZ)}`
	const cell = page.getByRole('button', {
		name: new RegExp(`^Legg inn en økt ${dayName}`),
	})
	const draft = page.getByRole('group', {
		name: new RegExp(`^Ny økt ${dayName}`),
	})
	await cell.scrollIntoViewIfNeeded()
	// The cell is a button the moment it is drawn, and opens nothing until
	// hydrated. Opening replaces it with the draft, so it is pressed once.
	await untilHydrated(cell)
	await cell.click()
	await expect(draft).toBeVisible()

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
	await expect(page.getByRole('link', { name: /10 km rolig/ })).toBeVisible()
	await shot(page, '4-row')

	const after = await runWeek(user.id, day)
	expect(after).toEqual({
		planned: before.planned + 10,
		target: before.target,
	})
	expect(errors).toEqual([])
})

test('the creation menu writes a day months out, past the Planning Horizon and the half year', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	// Forty weeks: the plan runs past the half year, and so does the window.
	await seedRunner(user.id, 40)
	const far = addDays(todayKey(), 250)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	// Pressed once, hydrated: a second press would close the menu again.
	const create = page.getByRole('button', { name: 'Lag ny' })
	await untilHydrated(create)
	await create.click()
	await page.getByRole('menuitem', { name: 'Skriv en økt' }).click()

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

test('a session of lifts on the line: an unknown lift offers the nearest, the echo is Norwegian, and the save writes the strength editor’s structure', async ({
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
	const day = todayKey()
	const midday = new Date(`${day}T12:00:00Z`)
	const dayName = `${formatNbWeekdayShort(midday, TZ)} ${formatNbDayOfMonth(midday, TZ)}`
	const cell = page.getByRole('button', {
		name: new RegExp(`^Legg inn en økt ${dayName}`),
	})
	const draft = page.getByRole('group', {
		name: new RegExp(`^Ny økt ${dayName}`),
	})
	await cell.scrollIntoViewIfNeeded()
	await untilHydrated(cell)
	await cell.click()
	await expect(draft).toBeVisible()

	// Styrke offers the line, with a lift for its example (ADR 0089).
	await draft.getByRole('radio', { name: 'Styrke' }).click()
	const input = draft.getByRole('textbox', { name: 'Skriv økta' })
	await expect(input).toHaveAttribute('placeholder', /Knebøy 5×5 @ 80 kg/)

	// A lift the database does not hold is said where it stands, with the
	// nearest names it does — never dropped, and nothing saves while it stands.
	await input.fill('Knebøj 5×5 @ 82,5 kg p 3 min · Roing 3×8')
	await expect(draft.getByText('Finner ikke øvelsen «Knebøj»')).toBeVisible()
	await expect(
		draft.getByRole('button', {
			name: 'Legg til «Knebøj 5×5 @ 82,5 kg p 3 min · Roing 3×8»',
		}),
	).toBeDisabled()
	await shot(page, '6-lift-suggestion')
	await draft
		.getByRole('button', { name: 'Bytt «Knebøj» med «Knebøy»' })
		.click()
	await expect(input).toHaveValue('Knebøy 5×5 @ 82,5 kg p 3 min · Roing 3×8')

	// What was understood: the lifts by their database names, their sets, and
	// the rest between sets in Norwegian.
	await expect(draft.getByText('Forstått')).toBeVisible()
	await expect(draft.getByText('Back Squat', { exact: true })).toBeVisible()
	await expect(draft.getByText('Barbell Row', { exact: true })).toBeVisible()
	await expect(draft.getByText('3 × 8', { exact: true })).toBeVisible()
	await expect(draft.getByText('pause', { exact: true })).toBeVisible()
	await expect(draft.getByText('rest', { exact: true })).toHaveCount(0)
	await shot(page, '7-lift-understood')

	await draft
		.getByRole('button', {
			name: 'Legg til «Knebøy 5×5 @ 82,5 kg p 3 min · Roing 3×8»',
		})
		.click()
	await expect(page.getByRole('button', { name: 'Ferdig' })).toBeVisible()
	await shot(page, '8-lift-saved')

	const written = await prisma.workoutSession.findFirstOrThrow({
		where: { userId: user.id },
		select: {
			source: true,
			workout: {
				select: {
					title: true,
					discipline: true,
					blocks: {
						select: {
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: {
									restBetweenSetsSec: true,
									exercise: { select: { name: true } },
									sets: {
										orderBy: { orderIndex: 'asc' },
										select: { reps: true, load: true },
									},
								},
							},
						},
					},
				},
			},
		},
	})
	expect(written.source).toBe('authored')
	expect(written.workout?.discipline).toBe('strength')
	expect(written.workout?.title).toBe(
		'Knebøy 5×5 @ 82,5 kg p 3 min · Roing 3×8',
	)
	const steps = written.workout!.blocks[0]!.steps
	expect(steps.map((step) => step.exercise?.name)).toEqual([
		'Back Squat',
		'Barbell Row',
	])
	expect(steps[0]!.restBetweenSetsSec).toBe(180)
	expect(steps[0]!.sets.map((set) => set.reps)).toEqual([5, 5, 5, 5, 5])
	expect(JSON.parse(steps[0]!.sets[0]!.load!)).toEqual({
		kind: 'absolute',
		kg: 82.5,
	})
	expect(steps[1]!.sets.map((set) => [set.reps, set.load])).toEqual([
		[8, null],
		[8, null],
		[8, null],
	])
	expect(errors).toEqual([])
})
