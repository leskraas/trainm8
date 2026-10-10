import { type Page } from '@playwright/test'
import {
	addDays,
	localTimeUTC,
	weekdayIndex,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { recomputePlannedTssForSession } from '#app/utils/load/planned-tss.server.ts'
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
 * is UTC here), never to "now plus some hours": a session "tomorrow" sits at
 * tomorrow's local noon, so it is still ahead whatever hour the run starts,
 * and the closed week is whichever closed last by the Week Replan's own clock.
 *
 * The athlete is a cyclist with an FTP, and every session is a power-targeted
 * ride priced the way the app prices them, so a scale or an ease re-prices
 * real Planned TSS rather than wiping a hand-set number.
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

/** A cyclist with an FTP, so a ride's Planned TSS is priced (ADR 0008). */
async function makeCyclist(userId: string) {
	await prisma.athleteProfile.create({
		data: {
			userId,
			timezone: TZ,
			disciplineProfiles: {
				create: [
					{
						discipline: 'bike',
						ftp: 250,
						zoneSystem: 'coggan-power-7',
						preferCogganTss: true,
					},
				],
			},
		},
	})
}

/** A one-hour ride at tempo power, priced; the machine's unless said otherwise. */
async function ride(
	userId: string,
	title: string,
	scheduledAt: Date,
	{ source = 'generated', status = 'scheduled' } = {},
) {
	const workout = await prisma.workout.create({
		data: {
			title,
			discipline: 'bike',
			intent: 'tempo',
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
									discipline: 'bike',
									durationSec: 3600,
									intensity: JSON.stringify({
										kind: 'powerPct',
										minPct: 85,
										maxPct: 95,
									}),
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: { userId, workoutId: workout.id, scheduledAt, status, source },
		select: { id: true, scheduledAt: true },
	})
	await recomputePlannedTssForSession(userId, session.id)
	return session
}

async function seedClosedWeek(userId: string) {
	await makeCyclist(userId)
	const now = new Date()
	const todayKey = now.toISOString().slice(0, 10)
	const closed = lastClosedWeekKey(now, TZ)
	const coming = addDays(closed, 7)
	const noon = (day: string) => localTimeUTC(day, '12:00', TZ)

	// The week that went: one session not done, one done that was never planned.
	const missed = await ride(userId, 'Bakker', noon(addDays(closed, 2)))
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
	const easy = await ride(userId, 'Rolig tur', noon(addDays(todayKey, 1)))
	const intervals = await ride(
		userId,
		'Intervaller',
		noon(addDays(todayKey, 2)),
	)
	// The next Sunday from tomorrow on, moved to the Monday after: across a
	// week boundary, one day on — and its later Sunday with it.
	const sunday = Array.from({ length: 7 }, (_, i) =>
		addDays(todayKey, i + 1),
	).find((day) => weekdayIndex(day) === 6)!
	const threshold = await ride(userId, 'Terskel', noon(sunday))
	const laterThreshold = await ride(userId, 'Terskel', noon(addDays(sunday, 7)))
	// The athlete's own, for "lås opp".
	const own = await ride(
		userId,
		'Langtur med gjengen',
		noon(addDays(todayKey, 4)),
		{
			source: 'authored',
		},
	)
	// Still ahead in the coming week whatever the hour: its Sunday, late. Before
	// Sunday 20:00 the coming week is this one; from then on, the next.
	const sundayLate = await ride(
		userId,
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
	const move = await propose(
		{
			kind: 'move',
			fromDate: sunday,
			toDate: addDays(sunday, 1),
			makeUp: false,
		},
		threshold.id,
		'«Terskel» ble ikke gjort søndag to uker på rad. Kanskje søndag ikke passer? Vi foreslår å flytte den til mandag – bare denne gangen, eller fra nå av.',
	)
	const makeUp = await propose(
		{
			kind: 'move',
			fromDate: addDays(closed, 2),
			toDate: addDays(todayKey, 5),
			makeUp: true,
		},
		missed.id,
		'«Bakker» ble ikke gjort onsdag, og står der som ikke gjort. Vil du ta den igjen? Det gir mer trening, så den legges bare inn hvis du sier ja.',
	)
	const silenced = await propose(
		{ kind: 'keep' },
		null,
		'Resten av uka står som planlagt.',
		{ appliedAt: localTimeUTC(todayKey, '06:00', TZ) },
	)

	return {
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
		select: {
			plannedTssValue: true,
			workout: { select: { blocks: { select: { steps: true } } } },
		},
	})
	return session.workout!.blocks[0]!.steps[0]!.durationSec
}

async function plannedTss(sessionId: string) {
	return (
		await prisma.workoutSession.findUniqueOrThrow({
			where: { id: sessionId },
			select: { plannedTssValue: true },
		})
	).plannedTssValue
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
	// A ride track in hours from the closed week on: the ease's before → after
	// is that track's Planned Volume, the number its week header holds.
	const plan = await createOpenEndedPlan(user.id, {
		discipline: 'bike',
		weeklyHours: 6,
		startWeekKey: lastClosedWeekKey(new Date(), TZ),
	})
	if (!plan.ok) throw new Error('no plan')
	const tssBefore = await plannedTss(seeded.easy.id)
	expect(tssBefore).toBeGreaterThan(0)
	await navigate('/')

	// The badge on the top line says what waits, and takes the athlete to it
	// (ADR 0086): the first question's Ok is on screen at 390×844.
	const badge = page.getByRole('button', {
		name: 'Ukeskiftet: 4 forslag venter. Gå til forslagene',
	})
	await expect(badge).toHaveText('4 forslag')
	await shot(page, '0-landing')
	const card = page.getByRole('region', { name: 'Ukeskiftet' })
	const proposal = (headline: string | RegExp) =>
		card.getByRole('article', { name: headline })
	const rolig = card.getByRole('article', { name: /^«Rolig tur»/ })
	// The jump needs the page hydrated, and the landing done; retried until then.
	await expect(async () => {
		await badge.click()
		await expect(rolig.getByRole('button', { name: 'Ok' })).toBeInViewport({
			timeout: 1000,
		})
	}).toPass()
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/0-jumped.png` })

	// The week that went: what was not done, and what was done beyond the plan.
	await expect(card.getByText(/^Ikke gjort: Bakker \(\w+\)$/)).toBeAttached()
	await expect(card.getByText(/^Ekstra: /)).toBeAttached()
	await expect(
		card.getByRole('heading', { name: /^Forslag for (denne uka|neste uke)$/ }),
	).toBeAttached()
	await shot(page, '1-open')

	// What silence applied this morning reads as done, not as a question.
	const silenced = proposal('Uka står som planlagt')
	await expect(silenced).toContainText('Gjort i morges')
	await expect(silenced.getByRole('button', { name: 'Ok' })).toHaveCount(0)
	// A make-up is a copy on a free day, so it asks for no reach.
	const makeUp = card.getByRole('article', { name: /^Ta igjen «Bakker»/ })
	await expect(makeUp.getByRole('radio')).toHaveCount(0)

	// Ok: the session is eased and re-priced, and the card says what changed
	// and what not.
	await rolig.getByRole('button', { name: 'Ok' }).click()
	await expect(rolig.getByText('Ukemålet står.', { exact: false })).toHaveText(
		'«Rolig tur» er gjort ca. 10 % kortere. Ukemålet står.',
	)
	expect(await seconds(seeded.easy.id)).toBe(3240)
	const tssAfter = await plannedTss(seeded.easy.id)
	expect(tssAfter).toBeGreaterThan(0)
	expect(tssAfter!).toBeLessThan(tssBefore!)

	// Nei takk: nothing moves.
	const intervals = card.getByRole('article', { name: /^«Intervaller»/ })
	await intervals.getByRole('button', { name: 'Nei takk' }).click()
	await expect(intervals.getByText('står som den var')).toHaveText(
		'«Intervaller» står som den var. Ukemålet står.',
	)
	expect(await seconds(seeded.intervals.id)).toBe(3600)

	// A move, "fra nå av", Sunday → Monday: this one and the later one of its
	// slot move one day on, into the next week.
	const move = proposal('Flytt «Terskel» fra søndag til mandag')
	await move.getByRole('radio', { name: 'fra nå av' }).check()
	await shot(page, '2-answering')
	await move.getByRole('button', { name: 'Ok' }).click()
	await expect(move.getByText('også de neste ukene')).toHaveText(
		'«Terskel» er flyttet til mandag, også de neste ukene. Ukemålet står.',
	)
	const day = 24 * 60 * 60 * 1000
	expect((await scheduledAt(seeded.threshold.id)).getTime()).toBe(
		seeded.threshold.scheduledAt.getTime() + day,
	)
	expect((await scheduledAt(seeded.laterThreshold.id)).getTime()).toBe(
		seeded.laterThreshold.scheduledAt.getTime() + day,
	)

	// −15 %, once: the coming week's sessions still ahead get shorter, still
	// priced, and the card says the ride track's hours before → after.
	await card.getByRole('button', { name: 'Gjør uka lettere −15 %' }).click()
	const eased = card.getByText(/^Uka: .* → .* t planlagt\. Ukemålet står\.$/)
	await expect(eased).toBeVisible()
	expect(await seconds(seeded.sundayLate.id)).toBe(3060)
	expect(await plannedTss(seeded.sundayLate.id)).toBeGreaterThan(0)
	await expect(
		card.getByRole('button', { name: 'Gjør uka lettere −15 %' }),
	).toHaveCount(0)
	await shot(page, '3-answered')

	// After a reload the card still says what the ease did: the numbers are kept.
	const easedText = await eased.textContent()
	await navigate('/')
	await expect(card.getByText(easedText!)).toBeAttached()
	// One question is left; the jump lands on it once the page is live.
	const lastBadge = page.getByRole('button', {
		name: 'Ukeskiftet: 1 forslag venter. Gå til forslagene',
	})
	await expect(lastBadge).toBeVisible()
	await expect(async () => {
		await lastBadge.click()
		await expect(
			makeUp.getByRole('button', { name: 'Nei takk' }),
		).toBeInViewport({ timeout: 1000 })
	}).toPass()

	// The last answer: the card stays to say what it did, then closes.
	await makeUp.getByRole('button', { name: 'Nei takk' }).click()
	await expect(
		card.getByText('Alt er besvart.', { exact: false }),
	).toBeVisible()
	await expect(card.getByText(easedText!)).toBeVisible()
	await expect(
		page.getByRole('button', { name: /forslag venter/ }),
	).toHaveCount(0)
	await shot(page, '4-settled')
	await card.getByRole('button', { name: 'Lukk' }).click()
	await expect(card).toHaveCount(0)

	// Lås opp: the athlete's own session goes back to the app — behind the
	// row's ownership glyph, said once rather than under every row (ADR 0086).
	const glyph = page.getByRole('button', {
		name: 'Din økt: Langtur med gjengen. Hva betyr det?',
	})
	await glyph.scrollIntoViewIfNeeded()
	await glyph.click()
	const release = page.getByRole('button', {
		name: 'Lås opp Langtur med gjengen',
	})
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
	// After the reload the session is the app's — its glyph says so — and there
	// is no card: nothing is left to answer.
	await navigate('/')
	await expect(
		page.getByRole('button', {
			name: 'Appens økt: Langtur med gjengen. Hva betyr det?',
		}),
	).toBeAttached()
	await expect(
		page.getByRole('button', { name: 'Lås opp Langtur med gjengen' }),
	).toHaveCount(0)
	await expect(card).toHaveCount(0)
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
	await propose(
		{ kind: 'scale', factor: 0.9 },
		own.id,
		'Uka var tung. Vi foreslår å gjøre denne økta ca. 10 % kortere. Dette er din økt, så den endres bare hvis du sier ja.',
	)
	await propose(
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
	await propose(
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
	const card = page.getByRole('region', { name: 'Ukeskiftet' })
	await expect(card).toBeAttached()
	const ownProposal = card.getByRole('article', {
		name: /^«Langtur med gjengen»/,
	})
	await expect(ownProposal.getByText('din økt', { exact: true })).toBeVisible()

	const roundProposal = card.getByRole('article', {
		name: /^Blokk 2:/,
	})
	// The round's peak week in hours, before → after the proposed factor.
	await expect(roundProposal.getByText(/^Toppuka: /)).toHaveText(
		/^Toppuka: [\d,]+ → [\d,]+ t$/,
	)
	const peakAtFive = await roundProposal.getByText(/^Toppuka: /).textContent()
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
	// The hours follow the factor.
	await expect(roundProposal.getByText(/^Toppuka: /)).not.toHaveText(
		peakAtFive!,
	)
	await shot(page, '6-round')
	await roundProposal.getByRole('button', { name: 'Ok' }).click()
	await expect(
		roundProposal.getByText('Blokk 2 er lagt til planen, +10 % volum.'),
	).toBeVisible()
	const stored = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: user.id, kind: 'add-phase', answer: 'accepted' },
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

	const declined = card.getByRole('article', {
		name: 'Blokk 3: 4 uker, samme volum',
	})
	await declined.getByRole('button', { name: 'Nei takk' }).click()
	await expect(
		declined.getByText('Ingen ny blokk ennå. Vi spør igjen neste søndag.'),
	).toBeVisible()

	// The athlete's own session: Nei takk leaves it as they wrote it.
	await ownProposal.getByRole('button', { name: 'Nei takk' }).click()
	await expect(
		ownProposal.getByText(
			'«Langtur med gjengen» står som den var. Ukemålet står.',
		),
	).toBeVisible()
	expect(errors).toEqual([])
})
