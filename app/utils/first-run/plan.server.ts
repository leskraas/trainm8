// The first run's plan, read and made (#505 stories 66–69).
//
// `readFirstRunPlan` is what the plan screen and the two-weeks screen show;
// `createFirstRunPlan` makes that same plan. Both start from the same answers
// and the same draft (`draft.ts`), so the plan the athlete lands on is the one
// they were shown: the chosen philosophy, a track in hours anchored on the
// hours they gave, a Week Pattern on the days they chose and no others, and
// its first two weeks laid by the stamp the horizon fill uses.

import { redirect } from 'react-router'
import { mondayOfDay } from '../athlete-calendar.ts'
import { getAthleteTimezone, updateAthleteProfile } from '../athlete.server.ts'
import { requireUserId } from '../auth.server.ts'
import { prisma } from '../db.server.ts'
import { fillPlanWeek } from '../load/horizon-fill.server.ts'
import { readFirstUnbegunWeekKey } from '../load/week-begun.server.ts'
import {
	createFitnessGoalEvent,
	createOpenEndedPlan,
	createPlanOutline,
	createStarterWeekPattern,
} from '../plan-outline/authoring.server.ts'
import { weekIndexOf, weekKeyAt } from '../plan-outline/week-keys.ts'
import { calendarWeekdayOf } from '../plan-outline/week-pattern.ts'
import { findActiveOutline } from '../training.server.ts'
import {
	draftFirstRunPlan,
	FIRST_RUN_WEEKS,
	type DraftGoal,
	type FirstRunDraft,
} from './draft.ts'
import { readFirstRunFindings } from './findings.server.ts'
import {
	type FirstRunAnswers,
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
		plan: { timezone, startWeekKey, goal, proposed, family, draft },
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
 * Make the plan the first run showed.
 *
 * 1. The days and hours become the athlete's **Training Availability** and
 *    **Weekly Capacity** — they said them, and the plan's fit checks read them.
 * 2. The plan: open-ended (`createOpenEndedPlan` with the family, the start
 *    week and the days), or toward a dated goal — the Event first through the
 *    ordinary write path, then the family's season fitted to it
 *    (`createPlanOutline` with the family's rates) and the starter pattern on
 *    the chosen days.
 * 3. Its first two weeks laid through the horizon fill's own `fillPlanWeek`,
 *    as `generated` sessions.
 *
 * Refused while the athlete has an active plan: the first run makes a first
 * plan, and never a second one beside it.
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

	await updateAthleteProfile(userId, {
		trainableWeekdays: answers.days.map(calendarWeekdayOf),
		weeklyCapacityHours: answers.hours,
	})

	let outlineId: string
	let eventId: string | null = null
	if (answers.goal.kind === 'active') {
		const created = await createOpenEndedPlan(
			userId,
			{
				discipline: answers.discipline,
				weeklyHours: answers.hours,
				family: plan.family,
				startWeekKey: plan.startWeekKey,
				days: answers.days,
			},
			now,
		)
		if (!created.ok) return { ok: false, reason: 'plan-already-active' }
		outlineId = created.outlineId
	} else {
		const event = await createFitnessGoalEvent(userId, {
			name: answers.goal.name,
			startDate: new Date(`${answers.goal.date}T00:00:00.000Z`),
			disciplines: [answers.discipline],
		})
		const created = await createPlanOutline(
			userId,
			{
				eventId: event.id,
				startWeekKey: plan.startWeekKey,
				structure: {
					phases: plan.draft.phases.map((phase) => ({
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
						anchorValue: answers.hours,
					},
				],
			},
			now,
			{ familyRates: plan.draft.phases },
		)
		if (!created.ok) {
			// A goal with no plan is not what the athlete asked for.
			await prisma.event.delete({ where: { id: event.id } })
			return {
				ok: false,
				reason:
					created.reason === 'event-past'
						? 'event-too-soon'
						: 'plan-already-active',
			}
		}
		outlineId = created.outlineId
		eventId = event.id
		await createStarterWeekPattern(
			userId,
			{ outlineId },
			{ trainableWeekdays: answers.days.map(calendarWeekdayOf) },
		)
	}

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
