import { type Page } from '@playwright/test'
import { addDays, mondayOfDay } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatNbDayOfMonth, formatNbWeekdayShort } from '#app/utils/format.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { getWeekVolumes } from '#app/utils/plan-outline/week-volumes.server.ts'
import { expect, test, untilHydrated } from '#tests/playwright-utils.ts'

/**
 * The session composer's line end to end on a phone (#505 stories 35–41,
 * owner decisions 1–3, ADR 0088 and 0089): a session typed as a sentence in
 * the one Drawer every "+" opens, what the app understood of it, the week sum
 * before → after against the Week Target, a suggestion for a misspelt word,
 * the save, the toast that says the target stayed and carries Angre, and the
 * row it wrote, landed in the list with its own Angre. Then _Ny økt_ on the
 * top line writing a day months out, and a session of lifts — which never
 * leaves I dag for the full editor.
 *
 * The athlete's timezone is UTC, so "today" is the UTC calendar day, and the
 * plan opens this Monday with a run track in km and a strength track in sets.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

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
		tracks: [
			{ discipline: 'run', currency: 'km', anchorValue: 40 },
			{ discipline: 'strength', currency: 'sets', anchorValue: 20 },
		],
	})
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
}

function todayKey() {
	return new Date().toISOString().slice(0, 10)
}

/** A track's week, as the app reads it: planned and target. */
async function trackWeek(
	userId: string,
	dayKey: string,
	discipline: 'run' | 'strength' = 'run',
) {
	const volumes = await getWeekVolumes(userId, { weekKey: mondayOfDay(dayKey) })
	const track = volumes.tracks.find((t) => t.discipline === discipline)!
	return { planned: track.planned ?? 0, target: track.target! }
}

function weekName(dayKey: string) {
	const monday = mondayOfDay(dayKey)
	const thisMonday = mondayOfDay(todayKey())
	if (monday === thisMonday) return 'denne uka'
	if (monday === addDays(thisMonday, 7)) return 'neste uke'
	throw new Error('the test writes this week or the next')
}

/** Today's empty cell, by its name, tapped once it is live. */
async function openOnToday(page: Page) {
	const day = todayKey()
	const midday = new Date(`${day}T12:00:00Z`)
	const dayName = `${formatNbWeekdayShort(midday, TZ)} ${formatNbDayOfMonth(midday, TZ)}`
	const cell = page.getByRole('button', {
		name: new RegExp(`^Legg inn en økt ${dayName}`),
	})
	await cell.scrollIntoViewIfNeeded()
	// The cell is a button the moment it is drawn, and opens nothing until
	// hydrated.
	await untilHydrated(cell)
	await cell.click()
	const drawer = page.getByRole('dialog', { name: 'Ny økt' })
	await expect(drawer.locator('[data-composer]')).toHaveAttribute(
		'data-composer-day',
		day,
	)
	return drawer
}

test('writing a session on an empty day: the parse, the week sum, a suggestion, the save, the toast and the landed row', async ({
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
	const before = await trackWeek(user.id, day)
	const drawer = await openOnToday(page)

	// No history to read a sport from, so the composer asks; the athlete
	// answers.
	await drawer.getByRole('button', { name: 'Løping' }).click()
	const input = drawer.getByRole('textbox', { name: 'Skriv økta' })

	// 16px or more, so iOS does not zoom into the field (story 41); the return
	// key says it writes, and the line grows with what is typed.
	expect(
		await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
	).toBeGreaterThanOrEqual(16)
	await expect(input).toHaveAttribute('enterkeyhint', 'done')

	// A misspelt word: said where it stands, with the word it was meant to be,
	// and nothing can be saved while it stands.
	await input.fill('10 km roilg')
	await expect(drawer.getByText('Kjenner ikke «roilg»')).toBeVisible()
	const save = drawer.getByRole('button', { name: 'Legg til', exact: true })
	await expect(save).toBeDisabled()
	await shot(page, '1-suggestion')
	await drawer.getByRole('button', { name: 'Bytt «roilg» med «rolig»' }).click()
	await expect(input).toHaveValue('10 km rolig')

	// What the app understood, rendered as the Token Sentence the row will be.
	const understood = drawer.locator('[data-composer-understood]')
	await expect(understood.getByText('10 km', { exact: true })).toBeVisible()
	await expect(understood.getByText('Z2', { exact: true })).toBeVisible()
	await expect(understood.getByText('Til sammen 10 km')).toBeVisible()
	// The week sum before → after, against a target the session does not move.
	await expect(drawer.locator('[data-composer-week-sum]')).toHaveText(
		`Løping ${weekName(day)}: ${before.planned} → ${before.planned + 10} km, målet står på ${before.target}`,
	)
	await shot(page, '2-understood')

	await save.click()

	// The Drawer leaves; the toast states the sum before → after, that the
	// target stayed, and carries Angre (ADR 0088).
	await expect(drawer).toHaveCount(0)
	const toast = page.locator('[data-sonner-toast]').filter({
		hasText: `Løping ${weekName(day)}: ${before.planned} → ${before.planned + 10} km. Ukemålet står på ${before.target}.`,
	})
	await expect(toast).toBeVisible()
	await expect(toast.getByRole('button', { name: 'Angre' })).toBeVisible()
	// The row it wrote rises into place on its day, with its own Angre.
	const landed = page.locator(
		`[data-timeline-day="${day}"] [data-session-row][data-landed]`,
	)
	await expect(landed.getByRole('link', { name: /10 km rolig/ })).toBeVisible()
	await expect(
		landed.getByRole('button', { name: 'Angre 10 km rolig' }),
	).toBeVisible()
	await shot(page, '3-saved')

	const after = await trackWeek(user.id, day)
	expect(after).toEqual({
		planned: before.planned + 10,
		target: before.target,
	})

	// The landed row's Angre takes it back: a real delete, the day empty again.
	await landed.getByRole('button', { name: 'Angre 10 km rolig' }).click()
	await expect(
		page.locator(`[data-timeline-day="${day}"] [data-timeline-empty]`),
	).toBeVisible()
	await expect
		.poll(async () => (await trackWeek(user.id, day)).planned)
		.toBe(before.planned)
	await shot(page, '4-undone')
	expect(errors).toEqual([])
})

test('“Ny økt” on the top line writes a day months out, past the Planning Horizon and the half year', async ({
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
	// One creation control on the top line (owner decision 6): it opens the
	// same composer, on today.
	const create = page
		.getByTestId('timeline-top')
		.getByRole('button', { name: 'Ny økt' })
	await untilHydrated(create)
	await create.click()
	const drawer = page.getByRole('dialog', { name: 'Ny økt' })
	await expect(drawer.locator('[data-composer]')).toHaveAttribute(
		'data-composer-day',
		todayKey(),
	)

	// Any day further than the strip's weeks is one field away (story 40).
	await drawer.getByLabel(/Annen dag/).fill(far)
	await expect(drawer.locator('[data-composer]')).toHaveAttribute(
		'data-composer-day',
		far,
	)
	await drawer.getByRole('button', { name: 'Løping' }).click()
	const input = drawer.getByRole('textbox', { name: 'Skriv økta' })
	await input.fill('21 km langtur')
	await expect(drawer.locator('[data-composer-week-sum]')).toHaveText(
		/^Løping uke \d+: 0 → 21 km, målet står på \d+$/,
	)
	await shot(page, '5-far')
	await drawer.getByRole('button', { name: 'Legg til', exact: true }).click()

	await expect(
		page
			.locator('[data-sonner-toast]')
			.filter({
				hasText: /^Løping uke \d+: 0 → 21 km\. Ukemålet står på \d+\./,
			}),
	).toBeVisible()
	await expect(drawer).toHaveCount(0)

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

test('a session of lifts in the composer: an unknown lift offers the nearest, the week counts sets, and it never leaves I dag (ADR 0089)', async ({
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
	const before = await trackWeek(user.id, day, 'strength')
	const drawer = await openOnToday(page)

	// Styrke offers the line, with a lift for its example, and no stamp: a
	// lift has to be named.
	await drawer.getByRole('button', { name: 'Styrke' }).click()
	const input = drawer.getByRole('textbox', { name: 'Skriv økta' })
	await expect(input).toHaveAttribute('placeholder', /Knebøy 5×5 @ 80 kg/)
	const save = drawer.getByRole('button', { name: 'Legg til', exact: true })
	await expect(save).toBeDisabled()

	// A lift the database does not hold is said where it stands, with the
	// nearest names it does — never dropped, and nothing saves while it stands.
	await input.fill('Knebøj 5×5 @ 82,5 kg p 3 min · Roing 3×8')
	await expect(drawer.getByText('Finner ikke øvelsen «Knebøj»')).toBeVisible()
	await expect(save).toBeDisabled()
	await shot(page, '6-lift-suggestion')
	await drawer
		.getByRole('button', { name: 'Bytt «Knebøj» med «Knebøy»' })
		.click()
	await expect(input).toHaveValue('Knebøy 5×5 @ 82,5 kg p 3 min · Roing 3×8')

	// What was understood: the lifts by their database names, their sets, and
	// the rest between sets in Norwegian — and the week in sets.
	const understood = drawer.locator('[data-composer-understood]')
	await expect(
		understood.getByText('Back Squat', { exact: true }),
	).toBeVisible()
	await expect(
		understood.getByText('Barbell Row', { exact: true }),
	).toBeVisible()
	await expect(understood.getByText('3 × 8', { exact: true })).toBeVisible()
	await expect(understood).toContainText('pause')
	await expect(understood).not.toContainText(/\brest\b/)
	await expect(understood.getByText('Til sammen 8 sett')).toBeVisible()
	await expect(drawer.locator('[data-composer-week-sum]')).toHaveText(
		`Styrke ${weekName(day)}: ${before.planned} → ${before.planned + 8} sett, målet står på ${before.target}`,
	)
	await shot(page, '7-lift-understood')

	// Gjør grundigere lists the lifts, set by set — and offers no way to the
	// full editor: the line says all of it.
	await drawer.getByRole('button', { name: 'Gjør grundigere' }).click()
	const deep = drawer.locator('[data-composer-deep]')
	await expect(deep).toBeVisible()
	await expect(deep).toContainText('82,5 kg × 5 · 5 · 5 · 5 · 5')
	await expect(
		drawer.getByRole('link', { name: 'Åpne hele editoren' }),
	).toHaveCount(0)
	await shot(page, '8-lift-deep')

	await save.click()
	await expect(drawer).toHaveCount(0)
	await expect(
		page.locator('[data-sonner-toast]').filter({ hasText: /Styrke/ }),
	).toBeVisible()
	// Still on I dag, with the session landed on its day.
	await expect(page).toHaveURL(/\/$/)
	await expect(
		page.locator(
			`[data-timeline-day="${day}"] [data-session-row][data-landed]`,
		),
	).toBeVisible()
	await shot(page, '9-lift-saved')

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
	const after = await trackWeek(user.id, day, 'strength')
	expect(after).toEqual({
		planned: before.planned + 8,
		target: before.target,
	})
	expect(errors).toEqual([])
})
