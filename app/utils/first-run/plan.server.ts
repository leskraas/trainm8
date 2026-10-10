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
	createOpenEndedPlan,
	createPlanOutlineInTx,
	createStarterWeekPattern,
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
	const proposed = chooseFamily({
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
			strengthPerWeek:
				findings.strength.measured &&
				findings.strength.value.sessionsPerWeek > 0
					? findings.strength.value.sessionsPerWeek
					: null,
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
 * 1. The plan: open-ended (`createOpenEndedPlan` with the family's round as
 *    drawn, the start week and the days), or toward a dated goal — the Event
 *    and its plan in **one transaction**, which first re-checks that the
 *    athlete still has no plan, so a double submit makes one plan and a
 *    malformed write leaves no Event behind — then the starter pattern on the
 *    draft's days (the chosen days, cut to what the hours fill and to six).
 * 2. The track is anchored on the hours the athlete trains now (owner decision
 *    15, round 2): the first week is those hours and the family climbs from
 *    there. The chosen days become their **Training Availability** and the
 *    plan's heaviest week their **Weekly Capacity**, which the plan's fit
 *    checks read, so neither check fires on the plan just made.
 * 3. Its first two weeks laid through the horizon fill's own `fillPlanWeek`,
 *    as `generated` sessions — the week's hard sessions on the days the
 *    preview showed them, each titled as it showed them.
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
	const calendarDays = calendarWeekdaysOf(answers.days)

	let outlineId: string
	let eventId: string | null = null
	if (answers.goal.kind === 'active') {
		const round = draft.phases[0]
		if (!round) return { ok: false, reason: 'nothing-to-lay' }
		const created = await createOpenEndedPlan(
			userId,
			{
				discipline: answers.discipline,
				weeklyHours: draft.anchor,
				family: plan.family,
				round,
				startWeekKey: plan.startWeekKey,
				// The days the draft lays on: the chosen days, cut to what the
				// hours fill and to six (`patternDaysFor`).
				days: draft.patternDays,
			},
			now,
		)
		if (!created.ok) {
			return { ok: false, reason: firstRunRefusalOf(created.reason) }
		}
		outlineId = created.outlineId
	} else {
		const goal = answers.goal
		const created = await prisma.$transaction(async (tx) => {
			const existing = await tx.planOutline.findFirst({
				where: existingPlanWhere(userId, now),
				select: { id: true },
			})
			if (existing) return null
			const event = await tx.event.create({
				data: {
					athleteId: userId,
					name: goal.name,
					// A goal a whole season is built toward is the season's A-target
					// (`createFitnessGoalEvent`, ADR 0039), and an explicit step the
					// athlete took on the questions screen.
					kind: 'fitness-goal',
					priority: 'A',
					startDate: new Date(`${goal.date}T00:00:00.000Z`),
					endDate: null,
					disciplines: JSON.stringify([answers.discipline]),
					status: 'planned',
				},
				select: { id: true },
			})
			const outline = await createPlanOutlineInTx(
				tx,
				userId,
				{
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
					tracks: [
						{
							discipline: answers.discipline,
							currency: 'hours',
							anchorValue: draft.anchor,
						},
					],
				},
				{ familyRates: draft.phases },
			)
			return { eventId: event.id, outlineId: outline }
		})
		if (!created) return { ok: false, reason: 'plan-already-active' }
		outlineId = created.outlineId
		eventId = created.eventId
		await createStarterWeekPattern(
			userId,
			{ outlineId },
			{ trainableWeekdays: calendarWeekdaysOf(draft.patternDays) },
		)
	}

	// The chosen days are the athlete's **Training Availability**, all of them,
	// even where the plan lays fewer. The hours they gave are what they train
	// now and where the plan starts (owner decision 15), not what they can give
	// at most; the **Weekly Capacity** the hours fit check reads is the plan's
	// own heaviest week, rounded up to the tenth the currency is written in, so
	// the check does not fire on the plan just made.
	const peak = peakOf(draft.targets) ?? answers.hours
	await updateAthleteProfile(userId, {
		trainableWeekdays: calendarDays,
		weeklyCapacityHours: Math.max(
			answers.hours,
			Math.ceil(Math.round(peak * 1000) / 100) / 10,
		),
	})

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
