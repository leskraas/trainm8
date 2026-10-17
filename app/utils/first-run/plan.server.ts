// The first run's plan, read and made (#505 stories 66–69).
//
// `readFirstRunPlan` is what the plan screen and the two-weeks screen show;
// `createFirstRunPlan` makes that same plan. Both start from the same answers
// and the same draft (`draft.ts`), so the plan the athlete lands on is the one
// they were shown: the chosen philosophy, a track in hours anchored on the
// hours they gave, a Week Pattern on the days they chose and no others, and
// its first two weeks laid by the stamp the horizon fill uses.

import { type Prisma } from '@prisma/client'
import { redirect } from 'react-router'
import { localDate, mondayOfDay } from '../athlete-calendar.ts'
import { getAthleteTimezone, updateAthleteProfile } from '../athlete.server.ts'
import { requireUserId } from '../auth.server.ts'
import { prisma } from '../db.server.ts'
import { fillPlanWeek } from '../load/horizon-fill.server.ts'
import { readFirstUnbegunWeekKey } from '../load/week-begun.server.ts'
import { anchoredActiveOutlineWhere } from '../plan-outline/active-outline.server.ts'
import { MAX_PLAN_WEEKS } from '../plan-outline/authoring-schema.ts'
import {
	createPlanOutlineInTx,
	createStarterWeekPatternInTx,
	type CreateOutlineRefusal,
} from '../plan-outline/authoring.server.ts'
import { weekIndexOf, weekKeyAt } from '../plan-outline/week-keys.ts'
import { calendarWeekdaysOf } from '../plan-outline/week-pattern.ts'
import { findActiveOutline } from '../training.server.ts'
import {
	draftFirstRunPlan,
	FIRST_RUN_WEEKS,
	peakOf,
	type DraftGoal,
	type FirstRunDraft,
} from './draft.ts'
import { readFirstRunFindings } from './findings.server.ts'
import {
	type FirstRunAnswers,
	type FirstRunCalendar,
	type FirstRunPlanRefusal,
} from './first-run-schema.ts'
import { chooseFamily, type FamilyChoice } from './first-run.ts'
import { draftStart, levelDefaults } from './start-draft.ts'

/**
 * The Plan Start Week for the athlete — the first week not yet begun, in
 * their timezone — which the simple start lays its Week Sketch from.
 */
export async function readPlanStartWeekKey(
	userId: string,
	now: Date = new Date(),
): Promise<string> {
	const timezone = await getAthleteTimezone(userId)
	return readFirstUnbegunWeekKey(userId, now, timezone)
}

/** A race needs at least this many plan weeks, the race week among them. */
export const MIN_EVENT_WEEKS = 2

export type FirstRunPlan = {
	timezone: string
	/** The plan's first Monday: the first week not yet begun. */
	startWeekKey: string
	goal: DraftGoal
	/** What the app proposes, and why. */
	proposed: FamilyChoice
	/** The proposal, or the family the athlete switched to. */
	family: FamilyChoice['family']
	draft: FirstRunDraft
	/** Lifting sessions a week in the history, where there is any lifting. */
	strengthPerWeek: number | null
}

/**
 * The plan these answers make, before it exists — or why it cannot be made.
 * The proposal reads the athlete's history and age (`chooseFamily`); the
 * athlete's own switch, when they made one, wins.
 */
export async function readFirstRunPlan(
	userId: string,
	answers: FirstRunAnswers,
	now: Date = new Date(),
): Promise<
	{ ok: true; plan: FirstRunPlan } | { ok: false; reason: FirstRunPlanRefusal }
> {
	const timezone = await getAthleteTimezone(userId)
	const startWeekKey = await readFirstUnbegunWeekKey(userId, now, timezone)
	const goal = draftGoal(answers, startWeekKey)
	if (goal.kind === 'event' && goal.weeks < MIN_EVENT_WEEKS) {
		return { ok: false, reason: 'event-too-soon' }
	}
	if (goal.kind === 'event' && goal.weeks > MAX_PLAN_WEEKS) {
		return { ok: false, reason: 'event-too-far' }
	}
	const { findings, age } = await readFirstRunFindings(userId, now)
	const strengthPerWeek =
		findings.strength.measured && findings.strength.value.sessionsPerWeek > 0
			? findings.strength.value.sessionsPerWeek
			: null
	// From the simple start, the plan is one of the **Start Options** the
	// answers show (#566): the very draft its card was read from, so what is
	// made is what was shown. The top option is proposed; no age rule.
	const { level } = answers
	if (level && goal.kind === 'active') {
		const start = draftStart({
			level,
			discipline: answers.discipline,
			otherSports: answers.otherSports,
			hours: answers.hours,
			days: answers.days,
			startWeekKey,
			preferences: answers.preferences,
		})
		if (!start) return { ok: false, reason: 'nothing-to-lay' }
		const top = start.options[0]!
		const option = answers.family
			? start.options.find((shown) => shown.family === answers.family)
			: top
		if (!option) return { ok: false, reason: 'option-unavailable' }
		return {
			ok: true,
			plan: {
				timezone,
				startWeekKey,
				goal,
				proposed: {
					family: top.family,
					reason: { code: 'training-level', level },
				},
				family: option.family,
				draft: option.draft,
				strengthPerWeek,
			},
		}
	}
	const proposed: FamilyChoice = chooseFamily({
		goal: goal.kind,
		weeksToEvent: goal.kind === 'event' ? goal.weeks : null,
		weeklyHours: answers.hours,
		days: answers.days.length,
		age,
		weeksTrained: findings.weeksTrained,
	})
	const family = answers.family ?? proposed.family
	const draft = draftFirstRunPlan({
		family,
		goal,
		startWeekKey,
		discipline: answers.discipline,
		weeklyHours: answers.hours,
		days: answers.days,
		sessionCap: level ? levelDefaults(level).sessionCap : undefined,
	})
	if (!draft) return { ok: false, reason: 'nothing-to-lay' }
	return {
		ok: true,
		plan: {
			timezone,
			startWeekKey,
			goal,
			proposed,
			family,
			draft,
			strengthPerWeek,
		},
	}
}

/** Plan weeks up to and including the race week, or rounds without a race. */
function draftGoal(answers: FirstRunAnswers, startWeekKey: string): DraftGoal {
	if (answers.goal.kind === 'active') return { kind: 'active' }
	return {
		kind: 'event',
		weeks: weekIndexOf(startWeekKey, mondayOfDay(answers.goal.date)) + 1,
	}
}

export type CreateFirstRunPlanResult =
	| {
			ok: true
			outlineId: string
			eventId: string | null
			/** Sessions laid into the first two weeks. */
			laid: number
	  }
	| { ok: false; reason: FirstRunPlanRefusal }

/**
 * What a refused create means to the first run, said honestly: an athlete
 * who has a plan already is told so, a date that has passed is too soon, and
 * the goal's other refusals say the goal could not carry a plan.
 */
export function firstRunRefusalOf(
	reason: CreateOutlineRefusal,
): FirstRunPlanRefusal {
	switch (reason) {
		case 'open-ended-already-active':
			return 'plan-already-active'
		case 'event-past':
			return 'event-too-soon'
		case 'event-not-found':
		case 'event-cancelled':
		case 'event-already-planned':
			return 'goal-unavailable'
	}
}

/** An active plan of any kind, or any open-ended one: a first plan exists. */
function existingPlanWhere(
	userId: string,
	now: Date,
): Prisma.PlanOutlineWhereInput {
	return {
		OR: [
			anchoredActiveOutlineWhere(userId, now),
			{ athleteId: userId, eventId: null },
		],
	}
}

/**
 * Make the plan the first run showed.
 *
 * 1. In **one transaction**, which first re-checks that the athlete still has
 *    no plan (so a double submit makes one plan, and a refusal writes
 *    nothing): the plan — open-ended in the family, from the Plan Start Week,
 *    with the round as drawn, or toward a dated goal with its Event — every
 *    track the draft laid, the starter **Week Pattern** on the draft's days,
 *    and the athlete's answers. A malformed write rolls all of it back, so no
 *    Event, pattern or answer is left behind without its plan.
 *    - Every track is anchored on the hours the athlete trains it now (owner
 *      decision 15, round 2): the first week is those hours and the family
 *      climbs from there. A track whose mix is `none` lays the climb with no
 *      hard sessions.
 *    - The chosen days become their **Training Availability**, all of them,
 *      and the plan's heaviest week their **Weekly Capacity**, which the
 *      plan's fit checks read, so neither check fires on the plan just made.
 *      From the simple start, their **Training Level** is kept too (#566),
 *      and their **Session Preferences**, none where they skipped (#571).
 * 2. Its first two weeks laid through the horizon fill's own `fillPlanWeek`,
 *    as `generated` sessions — the week's hard sessions on the days the
 *    preview showed them, each titled as it showed them. Nothing is laid
 *    before the Plan Start Week, and nothing is marked done or _ikke gjort_.
 */
export async function createFirstRunPlan(
	userId: string,
	answers: FirstRunAnswers,
	now: Date = new Date(),
): Promise<CreateFirstRunPlanResult> {
	if (await findActiveOutline(userId, now)) {
		return { ok: false, reason: 'plan-already-active' }
	}
	const read = await readFirstRunPlan(userId, answers, now)
	if (!read.ok) return read
	const { plan } = read
	const { draft } = plan
	const round = draft.phases[0]
	if (answers.goal.kind === 'active' && !round) {
		return { ok: false, reason: 'nothing-to-lay' }
	}
	const goal = answers.goal

	// The hours they gave are what they train now and where the plan starts
	// (owner decision 15), not what they can give at most; the **Weekly
	// Capacity** the hours fit check reads is the plan's own heaviest week,
	// rounded up to the tenth the currency is written in.
	const peak = peakOf(draft.targets) ?? answers.hours
	const weeklyCapacityHours = Math.max(
		answers.hours,
		Math.ceil(Math.round(peak * 1000) / 100) / 10,
	)

	const created = await prisma.$transaction(async (tx) => {
		const existing = await tx.planOutline.findFirst({
			where: existingPlanWhere(userId, now),
			select: { id: true },
		})
		if (existing) return null
		const event =
			goal.kind === 'event'
				? await tx.event.create({
						data: {
							athleteId: userId,
							name: goal.name,
							// A goal a whole season is built toward is the season's
							// A-target (`createFitnessGoalEvent`, ADR 0039), and an
							// explicit step the athlete took on the questions screen.
							kind: 'fitness-goal',
							priority: 'A',
							startDate: new Date(`${goal.date}T00:00:00.000Z`),
							endDate: null,
							disciplines: JSON.stringify([answers.discipline]),
							status: 'planned',
						},
						select: { id: true },
					})
				: null
		const tracks = draft.tracks.map((track) => ({
			discipline: track.discipline,
			currency: track.currency,
			anchorValue: track.anchor,
		}))
		const withoutMix = draft.tracks
			.filter((track) => track.mix === 'none')
			.map((track) => track.discipline)
		const outlineId = await createPlanOutlineInTx(
			tx,
			userId,
			event
				? {
						eventId: event.id,
						startWeekKey: plan.startWeekKey,
						structure: {
							phases: draft.phases.map((phase) => ({
								name: phase.name,
								weeks: phase.weeks,
								rhythm: phase.rhythm,
								tapers: phase.tapers,
							})),
							family: plan.family,
						},
						tracks,
					}
				: {
						startWeekKey: plan.startWeekKey,
						structure: {
							phases: [
								{
									name: round!.name,
									weeks: round!.weeks,
									rhythm: round!.rhythm,
									tapers: false,
								},
							],
							family: plan.family,
						},
						tracks,
					},
			{
				familyRates: event ? draft.phases : [round!],
				withoutMix,
			},
		)
		// The days the draft lays each track on: its days, cut to what its
		// hours fill and to six (`patternDaysFor`).
		const pattern = await createStarterWeekPatternInTx(
			tx,
			userId,
			{ outlineId },
			{
				trainableWeekdays: calendarWeekdaysOf(draft.patternDays),
				daysByDiscipline: Object.fromEntries(
					draft.tracks.map((track) => [track.discipline, track.patternDays]),
				),
				// _Korte økter_'s shaped days, weighed as the draft weighed them.
				weightsByDiscipline: Object.fromEntries(
					draft.tracks.flatMap((track) =>
						track.dayWeights ? [[track.discipline, track.dayWeights]] : [],
					),
				),
			},
		)
		if (!pattern.ok) throw new Error(`starter pattern: ${pattern.reason}`)
		await updateAthleteProfile(
			userId,
			{
				trainableWeekdays: calendarWeekdaysOf(answers.days),
				weeklyCapacityHours,
				...(answers.level ? { trainingLevel: answers.level } : {}),
				...(answers.preferences
					? { sessionPreferences: answers.preferences }
					: {}),
			},
			tx,
		)
		return { outlineId, eventId: event?.id ?? null }
	})
	if (!created) return { ok: false, reason: 'plan-already-active' }
	const { outlineId, eventId } = created

	let laid = 0
	for (let index = 0; index < FIRST_RUN_WEEKS; index++) {
		const filled = await fillPlanWeek(
			userId,
			weekKeyAt(plan.startWeekKey, index),
			plan.timezone,
			now,
		)
		laid += filled.sessions
	}
	return { ok: true, outlineId, eventId, laid }
}

/**
 * The first run is for an athlete with no plan: one who has a plan is sent
 * to it (Sesong) rather than shown questions whose answer they already gave.
 */
export async function requireFirstRunAthlete(
	request: Request,
	now: Date = new Date(),
): Promise<string> {
	const userId = await requireUserId(request)
	if (await findActiveOutline(userId, now)) throw redirect('/training/plan')
	return userId
}

/**
 * The simple start (#558) is for an athlete with no plan too, and one who has
 * a plan is sent to I dag, where their plan is (story 56).
 */
export async function requireSimpleStartAthlete(
	request: Request,
	now: Date = new Date(),
): Promise<string> {
	const userId = await requireUserId(request)
	if (await findActiveOutline(userId, now)) throw redirect('/')
	return userId
}

/**
 * The day the first run judges a race date against: today in the Athlete
 * Timezone, which the routes pass to the forms (`FirstRunCalendar`) so the
 * browser's own clock never decides it.
 */
export async function readFirstRunCalendar(
	userId: string,
	now: Date = new Date(),
): Promise<FirstRunCalendar> {
	const timezone = await getAthleteTimezone(userId)
	return { today: localDate(now, timezone), timezone }
}
