import { type Page } from '@playwright/test'
import {
	addDays,
	localTimeUTC,
	weekdayIndex,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { lastClosedWeekKey } from '#app/utils/load/week-change.ts'
import { type ProposalPayload } from '#app/utils/load/week-replan-proposal.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * _Ukeskiftet_ end to end on a phone (#505 stories 42–55, ADR 0080): a closed
 * week's card on I dag, its proposals answered Ok, Nei takk and "fra nå av",
 * the week made lighter −15 %, and one of the athlete's own sessions handed
 * back with "lås opp" — each answer read back off the session rows.
 *
 * Every date is anchored to the athlete's **local day** (the Athlete Timezone
 * defaults to UTC), never to "now plus some hours": a session "tomorrow" sits
 * at tomorrow's local noon, so it is still ahead whatever hour the run starts,
 * and the closed week is whichever closed last by the Week Replan's own clock.
 */
test.use({ viewport: { width: 390, height: 844 } })

const TZ = 'UTC'
const SHOTS = process.env.WEEK_CHANGE_SHOTS

async function shot(page: Page, name: string) {
	if (!SHOTS) return
	// The card lives in the scrolling stream, taller than the phone: park its
	// top at the stream's top, then page down through it.
	const card = page.locator('[data-week-change]')
	if ((await card.count()) === 0) {
		await page.screenshot({ path: `${SHOTS}/${name}.png` })
		return
	}
	await card.evaluate((el) =>
		el.scrollIntoView({ block: 'start', behavior: 'instant' }),
	)
	await page.waitForTimeout(400)
	await page.screenshot({ path: `${SHOTS}/${name}-a.png` })
	await page
		.getByTestId('timeline-stream')
		.evaluate((el) =>
			el.scrollBy({ top: el.clientHeight - 120, behavior: 'instant' }),
		)
	await page.waitForTimeout(400)
	await page.screenshot({ path: `${SHOTS}/${name}-b.png` })
	await page
		.getByTestId('timeline-stream')
		.evaluate((el) =>
			el.scrollBy({ top: el.clientHeight - 120, behavior: 'instant' }),
		)
	await page.waitForTimeout(400)
	await page.screenshot({ path: `${SHOTS}/${name}-c.png` })
}

async function seedClosedWeek(userId: string) {
	const now = new Date()
	const todayKey = now.toISOString().slice(0, 10)
	const closed = lastClosedWeekKey(now, TZ)
	const coming = addDays(closed, 7)
	const noon = (day: string) => localTimeUTC(day, '12:00', TZ)

	const workout = (title: string, durationSec = 3600) =>
		prisma.workout.create({
			data: {
				title,
				discipline: 'run',
				intent: 'endurance',
				ownerId: userId,
				blocks: {
					create: [
						{
							orderIndex: 0,
							repeatCount: 1,
							steps: {
								create: [
									{
										orderIndex: 0,
										kind: 'cardio',
										discipline: 'run',
										durationSec,
									},
								],
							},
						},
					],
				},
			},
			select: { id: true },
		})
	const session = async (
		title: string,
		scheduledAt: Date,
		{ source = 'generated', status = 'scheduled' } = {},
	) => {
		const w = await workout(title)
		return prisma.workoutSession.create({
			data: {
				userId,
				workoutId: w.id,
				scheduledAt,
				status,
				source,
				plannedTssValue: 60,
				plannedTssConfidence: 'full',
			},
			select: { id: true, scheduledAt: true },
		})
	}

	// The week that went: one session not done, one done that was never planned.
	await session('Bakker', noon(addDays(closed, 2)))
	await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt: noon(addDays(closed, 3)),
			status: 'completed',
			source: 'recorded',
			tssValue: 40,
		},
	})

	// What the proposals aim at, from tomorrow on.
	const easy = await session('Rolig tur', noon(addDays(todayKey, 1)))
	const intervals = await session('Intervaller', noon(addDays(todayKey, 2)))
	const threshold = await session('Terskel', noon(addDays(todayKey, 3)))
	const laterThreshold = await session('Terskel', noon(addDays(todayKey, 10)))
	// The athlete's own, for "lås opp".
	const own = await session('Langtur med gjengen', noon(addDays(todayKey, 4)), {
		source: 'authored',
	})
	// Still ahead in the coming week whatever the hour: its Sunday, late. Before
	// Sunday 20:00 the coming week is this one; from then on, the next.
	const sundayLate = await session(
		'Søndagstur',
		localTimeUTC(addDays(coming, 6), '21:00', TZ),
	)

	const replan = await prisma.weekReplan.create({
		data: {
			athleteId: userId,
			weekKey: closed,
			outcome: 'proposed',
			reason:
				'Forrige uke ble 20 % tyngre enn planlagt, og formen er −14. Vi foreslår å gjøre de neste øktene ca. 10 % kortere.',
		},
		select: { id: true },
	})
	const propose = (
		payload: ProposalPayload,
		targetSessionId: string | null,
		reason: string,
		extra: { appliedAt?: Date } = {},
	) =>
		prisma.weekReplanProposal.create({
			data: {
				athleteId: userId,
				weekReplanId: replan.id,
				kind: payload.kind,
				payload: JSON.stringify(payload),
				reason,
				loadDirection:
					payload.kind === 'move' && payload.makeUp
						? 'adds'
						: 'keeps-or-reduces',
				scope: payload.kind === 'move' ? 'this-time' : null,
				targetSessionId,
				targetWeekKey: coming,
				...extra,
			},
			select: { id: true },
		})

	const scaleEasy = await propose(
		{ kind: 'scale', factor: 0.9 },
		easy.id,
		'Uka var tung. Vi foreslår å gjøre denne økta ca. 10 % kortere.',
	)
	const scaleIntervals = await propose(
		{ kind: 'scale', factor: 0.9 },
		intervals.id,
		'Uka var tung. Vi foreslår å gjøre denne økta ca. 10 % kortere.',
	)
	const thresholdDay = addDays(todayKey, 3)
	// "Fra nå av" moves a slot within its own week, so the move stays inside
	// one: a day later, or a day earlier from a Sunday.
	const moveBy = weekdayIndex(thresholdDay) === 6 ? -1 : 1
	const move = await propose(
		{
			kind: 'move',
			fromDate: thresholdDay,
			toDate: addDays(thresholdDay, moveBy),
			makeUp: false,
		},
		threshold.id,
		'Terskel dagen etter en lang tur blir tung. Vi foreslår å flytte den en dag.',
	)
	const makeUp = await propose(
		{
			kind: 'move',
			fromDate: addDays(closed, 2),
			toDate: addDays(todayKey, 5),
			makeUp: true,
		},
		(
			await prisma.workoutSession.findFirstOrThrow({
				where: { userId, workout: { title: 'Bakker' } },
				select: { id: true },
			})
		).id,
		'«Bakker» ble ikke gjort onsdag, og står der som ikke gjort. Vil du ta den igjen? Det gir mer trening, så den legges bare inn hvis du sier ja.',
	)
	const silenced = await propose(
		{ kind: 'keep' },
		null,
		'Resten av uka står som planlagt.',
		{ appliedAt: localTimeUTC(todayKey, '06:00', TZ) },
	)

	return {
		moveBy,
		easy,
		intervals,
		threshold,
		laterThreshold,
		own,
		sundayLate,
		scaleEasy,
		scaleIntervals,
		move,
		makeUp,
		silenced,
	}
}

async function seconds(sessionId: string) {
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { workout: { select: { blocks: { select: { steps: true } } } } },
	})
	return session.workout!.blocks[0]!.steps[0]!.durationSec
}

async function scheduledAt(sessionId: string) {
	return (
		await prisma.workoutSession.findUniqueOrThrow({
			where: { id: sessionId },
			select: { scheduledAt: true },
		})
	).scheduledAt
}

test('Ukeskiftet: the week that went, Ok, Nei takk, fra nå av, −15 % and lås opp', async ({
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
	const seeded = await seedClosedWeek(user.id)
	await navigate('/')

	const card = page.locator('[data-week-change]')
	await expect(card).toBeVisible()
	await expect(card.getByRole('heading', { name: 'Ukeskiftet' })).toBeVisible()
	// The week that went: what was not done, and what was done beyond the plan.
	await expect(card.locator('[data-review-missed]')).toContainText('Bakker')
	await expect(card.locator('[data-review-extra]')).toHaveCount(1)
	await card.scrollIntoViewIfNeeded()
	await shot(page, '1-open')

	const proposal = (id: string) => card.locator(`[data-proposal="${id}"]`)

	// What silence applied this morning reads as done, not as a question.
	await expect(proposal(seeded.silenced.id)).toHaveAttribute(
		'data-proposal-state',
		'silenced',
	)
	await expect(proposal(seeded.silenced.id)).toContainText('Gjort i morges')
	await expect(
		proposal(seeded.silenced.id).getByRole('button', { name: 'Ok' }),
	).toHaveCount(0)
	// A make-up is a copy on a free day, so it asks for no reach.
	await expect(proposal(seeded.makeUp.id).getByRole('radio')).toHaveCount(0)

	// Ok: the session is eased, and the card says what changed and what not.
	await proposal(seeded.scaleEasy.id)
		.getByRole('button', { name: 'Ok' })
		.click()
	await expect(
		proposal(seeded.scaleEasy.id).locator('[data-proposal-confirmation]'),
	).toHaveText('«Rolig tur» er gjort ca. 10 % kortere. Ukemålet står.')
	expect(await seconds(seeded.easy.id)).toBe(3240)

	// Nei takk: nothing moves.
	await proposal(seeded.scaleIntervals.id)
		.getByRole('button', { name: 'Nei takk' })
		.click()
	await expect(
		proposal(seeded.scaleIntervals.id).locator('[data-proposal-confirmation]'),
	).toHaveText('«Intervaller» står som den var. Ukemålet står.')
	expect(await seconds(seeded.intervals.id)).toBe(3600)

	// A move, "fra nå av": this one and the later one of its slot move a day.
	const move = proposal(seeded.move.id)
	await move.getByRole('radio', { name: 'fra nå av' }).check()
	await shot(page, '2-answering')
	await move.getByRole('button', { name: 'Ok' }).click()
	await expect(move.locator('[data-proposal-confirmation]')).toContainText(
		'også de neste ukene. Ukemålet står.',
	)
	const day = 24 * 60 * 60 * 1000
	expect((await scheduledAt(seeded.threshold.id)).getTime()).toBe(
		seeded.threshold.scheduledAt.getTime() + seeded.moveBy * day,
	)
	expect((await scheduledAt(seeded.laterThreshold.id)).getTime()).toBe(
		seeded.laterThreshold.scheduledAt.getTime() + seeded.moveBy * day,
	)

	// −15 %, once: the coming week's sessions still ahead get shorter.
	await card.locator('[data-ease-action]').click()
	await expect(card.locator('[data-ease-result]')).toContainText('→')
	await expect(card.locator('[data-ease-result]')).toContainText(
		'Ukemålet står.',
	)
	expect(await seconds(seeded.sundayLate.id)).toBe(3060)
	await expect(card.locator('[data-ease-action]')).toHaveCount(0)
	await shot(page, '3-answered')

	// The last answer: the card stays to say what it did, then closes.
	await proposal(seeded.makeUp.id)
		.getByRole('button', { name: 'Nei takk' })
		.click()
	await expect(card).toHaveAttribute('data-week-change-open', 'false')
	await expect(
		card.getByText('Alt er besvart.', { exact: false }),
	).toBeVisible()
	await shot(page, '4-settled')
	await card.getByRole('button', { name: 'Lukk' }).click()
	await expect(card).toHaveCount(0)

	// Lås opp: the athlete's own session goes back to the app.
	const release = page.locator(`[data-release-action="${seeded.own.id}"]`)
	await release.scrollIntoViewIfNeeded()
	await expect(release).toBeVisible()
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/5-release.png` })
	await release.click()
	await expect
		.poll(
			async () =>
				(
					await prisma.workoutSession.findUniqueOrThrow({
						where: { id: seeded.own.id },
						select: { releasedAt: true },
					})
				).releasedAt,
		)
		.not.toBeNull()
	// After the reload, the row carries the app's open lock, and no "lås opp".
	await navigate('/')
	await expect(
		page.locator(`[data-release-action="${seeded.own.id}"]`),
	).toHaveCount(0)
	// Nothing is left to answer, so home shows no card.
	await expect(page.locator('[data-week-change]')).toHaveCount(0)
	expect(errors).toEqual([])
})

test('Ukeskiftet: the next round’s volume is the athlete’s to change, and a proposal on their own session says so', async ({
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
	const now = new Date()
	const todayKey = now.toISOString().slice(0, 10)
	const closed = lastClosedWeekKey(now, TZ)
	const created = await createOpenEndedPlan(user.id, {
		discipline: 'run',
		weeklyHours: 4,
	})
	if (!created.ok) throw new Error('no plan')
	const outline = await prisma.planOutline.findFirstOrThrow({
		where: { athleteId: user.id },
		select: { id: true, phases: { select: { id: true } } },
	})
	const workout = await prisma.workout.create({
		data: {
			title: 'Langtur med gjengen',
			discipline: 'run',
			intent: 'endurance',
			ownerId: user.id,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 7200,
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	const own = await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: localTimeUTC(addDays(todayKey, 2), '10:00', TZ),
			status: 'scheduled',
			source: 'authored',
		},
		select: { id: true },
	})
	const replan = await prisma.weekReplan.create({
		data: {
			athleteId: user.id,
			weekKey: closed,
			outcome: 'proposed',
			reason: 'Blokk 1 har gått etter planen.',
		},
		select: { id: true },
	})
	const propose = (
		payload: ProposalPayload,
		targetSessionId: string | null,
		reason: string,
	) =>
		prisma.weekReplanProposal.create({
			data: {
				athleteId: user.id,
				weekReplanId: replan.id,
				kind: payload.kind,
				payload: JSON.stringify(payload),
				reason,
				loadDirection:
					payload.kind === 'add-phase' && payload.factor > 1
						? 'adds'
						: 'keeps-or-reduces',
				targetSessionId,
				targetWeekKey: addDays(closed, 7),
			},
			select: { id: true },
		})
	const scaleOwn = await propose(
		{ kind: 'scale', factor: 0.9 },
		own.id,
		'Uka var tung. Vi foreslår å gjøre denne økta ca. 10 % kortere. Dette er din økt, så den endres bare hvis du sier ja.',
	)
	const round = await propose(
		{
			kind: 'add-phase',
			outlineId: outline.id,
			afterPhaseId: outline.phases.at(-1)!.id,
			name: 'Blokk 2',
			weeks: 4,
			rhythm: '3:1',
			factor: 1.05,
		},
		null,
		'Blokk 1 har gått etter planen. Vi foreslår Blokk 2 med ca. 5 % mer trening. Det er mer belastning, så den legges bare inn hvis du sier ja.',
	)

	// A second round on offer, to be turned down: Nei takk beside its Ok.
	const otherRound = await propose(
		{
			kind: 'add-phase',
			outlineId: outline.id,
			afterPhaseId: 'not-the-last-phase',
			name: 'Blokk 3',
			weeks: 4,
			rhythm: '3:1',
			factor: 1,
		},
		null,
		'Vi foreslår Blokk 3 med like mye trening som Blokk 2.',
	)

	await navigate('/')
	const card = page.locator('[data-week-change]')
	await expect(card).toBeVisible()
	const ownProposal = card.locator(`[data-proposal="${scaleOwn.id}"]`)
	await expect(ownProposal.locator('[data-proposal-own]')).toHaveText('din økt')

	const roundProposal = card.locator(`[data-proposal="${round.id}"]`)
	await expect(roundProposal).toContainText('Blokk 2: 4 uker, +5 % volum')
	// The shared select needs the page hydrated; retried until it opens.
	await expect(async () => {
		await roundProposal
			.getByRole('combobox', { name: 'Hvor mye trening i neste blokk?' })
			.click()
		await page.getByRole('option', { name: '+10 % volum' }).click({
			timeout: 1000,
		})
	}).toPass()
	await expect(
		roundProposal.getByRole('combobox', {
			name: 'Hvor mye trening i neste blokk?',
		}),
	).toHaveText('+10 % volum')
	await shot(page, '6-round')
	await roundProposal.getByRole('button', { name: 'Ok' }).click()
	await expect(
		roundProposal.locator('[data-proposal-confirmation]'),
	).toHaveText('Blokk 2 er lagt til planen, +10 % volum.')
	const stored = await prisma.weekReplanProposal.findUniqueOrThrow({
		where: { id: round.id },
		select: { payload: true, answer: true, appliedAt: true },
	})
	expect(stored.answer).toBe('accepted')
	expect(JSON.parse(stored.payload)).toMatchObject({ factor: 1.1 })
	// The round is in the plan: a second phase after the first.
	const phases = await prisma.planOutlinePhase.findMany({
		where: { outlineId: outline.id },
		select: { name: true },
	})
	expect(phases.map((phase) => phase.name)).toEqual(['Blokk 1', 'Blokk 2'])

	const declined = card.locator(`[data-proposal="${otherRound.id}"]`)
	await declined.getByRole('button', { name: 'Nei takk' }).click()
	await expect(declined.locator('[data-proposal-confirmation]')).toHaveText(
		'Ingen ny blokk ennå. Vi spør igjen neste søndag.',
	)

	// The athlete's own session: Nei takk leaves it as they wrote it.
	await ownProposal.getByRole('button', { name: 'Nei takk' }).click()
	await expect(ownProposal.locator('[data-proposal-confirmation]')).toHaveText(
		'«Langtur med gjengen» står som den var. Ukemålet står.',
	)
	expect(errors).toEqual([])
})
