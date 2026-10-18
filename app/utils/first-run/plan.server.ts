// The start's plan, read and made (#505 stories 66–69, #566, #578).
//
// `readFirstRunPlan` is the **Start Option** the athlete picked, read from
// their answers by the very draft the cards were shown from (`draftStart`);
// `createFirstRunPlan` makes that same plan. So the plan the athlete lands on
// is the one they were shown: the picked way to train, a track in hours
// anchored on the hours they gave, a Week Pattern on the days they chose and
// no others, and its first two weeks laid by the stamp the horizon fill uses.

import { type Prisma } from '@prisma/client'
import { redirect } from 'react-router'
import { getAthleteTimezone, updateAthleteProfile } from '../athlete.server.ts'
import { requireUserId } from '../auth.server.ts'
import { prisma } from '../db.server.ts'
import { fillPlanWeek } from '../load/horizon-fill.server.ts'
import { readFirstUnbegunWeekKey } from '../load/week-begun.server.ts'
import { anchoredActiveOutlineWhere } from '../plan-outline/active-outline.server.ts'
import {
	createPlanOutlineInTx,
	createStarterWeekPatternInTx,
} from '../plan-outline/authoring.server.ts'
import { type PresetFamily } from '../plan-outline/presets.ts'
import { PROPOSED_STRENGTH_GOAL } from '../plan-outline/strength-offer.server.ts'
import { weekKeyAt } from '../plan-outline/week-keys.ts'
import {
	calendarWeekdaysOf,
	type PatternWeekday,
} from '../plan-outline/week-pattern.ts'
import { createSimpleActivityWorkout } from '../simple-activity.server.ts'
import { SIMPLE_ACTIVITY_DISCIPLINE } from '../simple-activity.ts'
import { findActiveOutline } from '../training.server.ts'
import { FIRST_RUN_WEEKS, peakOf, type FirstRunDraft } from './draft.ts'
import {
	type FirstRunAnswers,
	type FirstRunPlanRefusal,
} from './first-run-schema.ts'
import { draftStart } from './start-draft.ts'
import { readStartStrength } from './start-strength.server.ts'

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

export type FirstRunPlan = {
	timezone: string
	/** The plan's first Monday: the first week not yet begun. */
	startWeekKey: string
	/** The way to train picked: the top option where none was named. */
	family: PresetFamily
	draft: FirstRunDraft
	/**
	 * The lifting the Start Option laid (#574): its days, the Workout each
	 * copies and the sets that Workout prescribes. Null without _styrke_.
	 */
	strength: FirstRunStrength | null
}

export type FirstRunStrength = {
	days: PatternWeekday[]
	workoutId: string
	setsPerSession: number
}

/**
 * The plan these answers make, before it exists — or why it cannot be made.
 * It is one of the **Start Options** the answers show (#566): the very draft
 * its card was read from, so what is made is what was shown. With no family
 * named, the top option.
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
	// _Styrke_ (#574): the session each lifting day copies, read here as the
	// question screens read it, so the days laid are the days shown.
	const lifting =
		answers.strength != null ? await readStartStrength(userId, now) : null
	const start = draftStart({
		level: answers.level,
		discipline: answers.discipline,
		activities: answers.activities,
		otherSports: answers.otherSports,
		hours: answers.hours,
		days: answers.days,
		startWeekKey,
		strength:
			lifting && answers.strength != null
				? { perWeek: answers.strength, session: lifting.session }
				: null,
		preferences: answers.preferences,
	})
	if (!start) return { ok: false, reason: 'nothing-to-lay' }
	const option = answers.family
		? start.options.find((shown) => shown.family === answers.family)
		: start.options[0]
	if (!option) return { ok: false, reason: 'option-unavailable' }
	return {
		ok: true,
		plan: {
			timezone,
			startWeekKey,
			family: option.family,
			draft: option.draft,
			strength:
				lifting && option.strengthDays.length > 0
					? {
							days: option.strengthDays,
							workoutId: lifting.workoutId,
							setsPerSession: lifting.setsPerSession,
						}
					: null,
		},
	}
}

export type CreateFirstRunPlanResult =
	| {
			ok: true
			outlineId: string
			/** Sessions laid into the first two weeks. */
			laid: number
	  }
	| { ok: false; reason: FirstRunPlanRefusal }

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
 * Make the plan the start showed.
 *
 * 1. In **one transaction**, which first re-checks that the athlete still has
 *    no plan (so a double submit makes one plan, and a refusal writes
 *    nothing): the plan — open-ended in the family, from the Plan Start Week,
 *    with the round as drawn — every track the draft laid, the starter **Week
 *    Pattern** on the draft's days, and the athlete's answers. A malformed
 *    write rolls all of it back, so no pattern or answer is left behind
 *    without its plan.
 *    - Every track is anchored on the hours the athlete trains it now (owner
 *      decision 15, round 2): the first week is those hours and the family
 *      climbs from there. A track whose mix is `none` lays the climb with no
 *      hard sessions.
 *    - The chosen days become their **Training Availability**, all of them,
 *      and the plan's heaviest week their **Weekly Capacity**, which the
 *      plan's fit checks read, so neither check fires on the plan just made.
 *      Their **Training Level** is kept too (#566), and their **Session
 *      Preferences**, none where they skipped (#571).
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
	if (!round) return { ok: false, reason: 'nothing-to-lay' }

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
			{
				startWeekKey: plan.startWeekKey,
				structure: {
					phases: [
						{
							name: round.name,
							weeks: round.weeks,
							rhythm: round.rhythm,
							tapers: false,
						},
					],
					family: plan.family,
				},
				tracks,
			},
			{
				familyRates: [round],
				withoutMix,
			},
		)
		// Each Simple Activity's own Workout, which its fixed day copies.
		const fixedDays: Array<{
			weekday: PatternWeekday
			discipline: typeof SIMPLE_ACTIVITY_DISCIPLINE
			workoutId: string
		}> = []
		for (const activity of draft.simpleActivities) {
			const workout = await createSimpleActivityWorkout(tx, userId, {
				kind: activity.kind,
				effortWord: activity.effortWord,
				durationMin: activity.minutes,
			})
			fixedDays.push({
				weekday: activity.weekday,
				discipline: SIMPLE_ACTIVITY_DISCIPLINE,
				workoutId: workout.id,
			})
		}
		// The days the draft lays each track on: its days, cut to what its
		// hours fill and to six (`patternDaysFor`), and the Simple Activities'
		// fixed days after them, as the draft numbered them.
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
				fixedDays,
			},
		)
		if (!pattern.ok) throw new Error(`starter pattern: ${pattern.reason}`)
		if (plan.strength) {
			await createStartStrengthInTx(tx, {
				outlineId,
				startWeekKey: plan.startWeekKey,
				weeks: draft.phases.reduce((sum, phase) => sum + phase.weeks, 0),
				strength: plan.strength,
			})
		}
		await updateAthleteProfile(
			userId,
			{
				trainableWeekdays: calendarWeekdaysOf(answers.days),
				weeklyCapacityHours,
				trainingLevel: answers.level,
				...(answers.strength != null
					? { strengthPerWeek: answers.strength }
					: {}),
				...(answers.preferences
					? { sessionPreferences: answers.preferences }
					: {}),
			},
			tx,
		)
		return outlineId
	})
	if (!created) return { ok: false, reason: 'plan-already-active' }

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
	return { ok: true, outlineId: created, laid }
}

/**
 * The Start Option's lifting (#574, ADR 0103), written beside the plan in its
 * transaction, the way the strength offer adds it to a plan that exists
 * (`addProposedStrengthTrack`):
 *
 * - **a strength track** in `sets`, anchored on what the lifting days copy:
 *   the session's sets, once per lifting day;
 * - **a strength block** over the round, at the lifting days' count (the
 *   **Strength Frequency** the athlete tapped, where their days allowed it),
 *   on the general goal; the round's end carries it on (`appendOpenEndedRound`);
 * - **fixed lifting days** in the Week Pattern on the days the card showed,
 *   each on the Workout the card named, after the day's endurance session.
 */
async function createStartStrengthInTx(
	tx: Prisma.TransactionClient,
	{
		outlineId,
		startWeekKey,
		weeks,
		strength,
	}: {
		outlineId: string
		startWeekKey: string
		weeks: number
		strength: FirstRunStrength
	},
) {
	const track = await tx.trainingTrack.create({
		data: {
			outlineId,
			discipline: 'strength',
			currency: 'sets',
			anchors: {
				create: [
					{
						fromWeekKey: startWeekKey,
						value: strength.setsPerSession * strength.days.length,
					},
				],
			},
		},
		select: { id: true },
	})
	await tx.trainingTrackSegment.create({
		data: {
			kind: 'strength',
			trackId: track.id,
			startWeekKey,
			weeks,
			goal: PROPOSED_STRENGTH_GOAL,
			sessionsPerWeek: strength.days.length,
		},
	})
	const pattern = await tx.weekPattern.findFirstOrThrow({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: { id: true, days: { select: { weekday: true } } },
	})
	for (const weekday of strength.days) {
		await tx.weekPatternDay.create({
			data: {
				patternId: pattern.id,
				weekday,
				orderInDay: pattern.days.filter((day) => day.weekday === weekday)
					.length,
				kind: 'fixed',
				trackId: track.id,
				workoutId: strength.workoutId,
			},
		})
	}
}

/**
 * The start (#558) is for an athlete with no plan: one who has a plan is sent
 * to I dag, where their plan is (story 56).
 */
export async function requireSimpleStartAthlete(
	request: Request,
	now: Date = new Date(),
): Promise<string> {
	const userId = await requireUserId(request)
	if (await findActiveOutline(userId, now)) throw redirect('/')
	return userId
}
