// _Bytt treningsform_ on the server (#581): what the athlete keeps, read
// back as the start's answers, and the **Start Options** those answers lay.

import { parseTrainableWeekdays } from '../athlete-schema.ts'
import { readStartAnswersOf } from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import { trackRetiredAt } from '../plan-outline/from-rows.ts'
import { type PresetFamily } from '../plan-outline/presets.ts'
import { isPatternWeekday } from '../plan-outline/week-pattern.ts'
import { readSimpleActivity } from '../simple-activity.ts'
import { type AuthoredSeason } from '../training.server.ts'
import { isCardioDiscipline } from '../workout-schema.ts'
import { planStartAnswers } from './plan-start-options.ts'
import {
	draftStart,
	type StartAnswers,
	type StartDraft,
} from './start-draft.ts'
import {
	readStartStrength,
	type StartStrengthReading,
} from './start-strength.server.ts'

export type PlanStartOptions = {
	answers: StartAnswers
	start: StartDraft
	/** The family the plan follows now, marked among the options. */
	current: PresetFamily | null
	/** False for an athlete who never said a Training Level. */
	levelSaid: boolean
}

/** A plan as reading its start's answers needs it. */
export type PlanStartSeason = Pick<
	AuthoredSeason,
	| 'family'
	| 'tracks'
	| 'weeks'
	| 'patterns'
	| 'outlineId'
	| 'eventId'
	| 'eventName'
>

/**
 * Why a plan has no start's answers to read: no plan; one whose endurance
 * sports are measured in kilometres or TSS; one that only lifts; or one with
 * no day to lay on.
 */
export type PlanStartAnswersRefusal =
	| 'no-plan'
	| 'currency'
	| 'lifting-only'
	| 'no-days'

/**
 * Why the start can read a plan's answers but editing its activities cannot
 * lay it (ADR 0109, "Settled" 5): it is built toward an **Event**, or one of
 * its sports is measured in kilometres or TSS beside the hours.
 */
export type ActivitiesReadOnly = 'event' | 'currency'

/**
 * _Styrke_ as the plan has it: the session a lifting day copies, the sets it
 * prescribes and the history's frequency, and how many times a week the plan
 * lifts now — null where it does not (no strength track, or a retired one).
 */
export type PlanStartLifting = StartStrengthReading & { perWeek: number | null }

export type PlanStartAnswersReading =
	| { ok: false; reason: PlanStartAnswersRefusal }
	| {
			ok: true
			answers: StartAnswers
			/** The family the plan follows now, or null where it reads as none. */
			current: PresetFamily | null
			/** False for an athlete who never said a Training Level. */
			levelSaid: boolean
			/** Why the activities edit cannot lay this plan, or null where it can. */
			readOnly: ActivitiesReadOnly | null
			eventName: string | null
			/** Null where there is no session to copy, so no _Styrke_ to offer. */
			lifting: PlanStartLifting | null
	  }

/** A Monday-first weekday from the Sunday-first calendar day ADR 0005 stores. */
const patternWeekdayOf = (calendar: number) => (calendar + 6) % 7

/**
 * The start's answers read back off a plan (ADR 0109 §7): the athlete's
 * stored level, preferences and days, and the plan's own tracks, Simple
 * Activities, lifting and hours from `fromWeekKey`, the first week a change
 * would begin in (`planStartAnswers`). A track retired at that week is not
 * read. _Bytt treningsform_ lays its options from these answers, and _Meg_
 * lists them and pre-fills its activities editor with them; the reading says
 * when that editor cannot lay the plan, and why.
 */
export async function readPlanStartAnswers(
	userId: string,
	season: PlanStartSeason | null,
	fromWeekKey: string,
	now: Date = new Date(),
): Promise<PlanStartAnswersReading> {
	if (!season) return { ok: false, reason: 'no-plan' }
	const [stored, profile, reading] = await Promise.all([
		readStartAnswersOf(userId),
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: {
				trainableWeekdays: true,
				weeklyCapacityHours: true,
				strengthPerWeek: true,
			},
		}),
		readStartStrength(userId, now),
	])
	const live = season.tracks.filter(
		(track) => !trackRetiredAt(track, fromWeekKey),
	)
	const endurance = live.filter((track) => isCardioDiscipline(track.discipline))
	const otherCurrency = endurance.some((track) => track.currency !== 'hours')

	// The plan's first Week Pattern: its days, and the Simple Activities its
	// fixed days copy.
	const pattern = season.patterns[0]
	const patternDays = (pattern?.days ?? [])
		.map((day) => day.weekday)
		.filter(isPatternWeekday)
	const fixedWorkoutIds = (pattern?.days ?? []).flatMap((day) =>
		day.kind === 'fixed' && day.workout ? [day.workout.id] : [],
	)
	const workouts =
		fixedWorkoutIds.length > 0
			? await prisma.workout.findMany({
					where: { id: { in: fixedWorkoutIds }, activityKind: { not: null } },
					select: {
						id: true,
						discipline: true,
						activityKind: true,
						effortWord: true,
						blocks: {
							select: {
								repeatCount: true,
								seriesRepeatCount: true,
								steps: {
									select: {
										kind: true,
										durationSec: true,
										distanceM: true,
										intensity: true,
									},
								},
							},
						},
					},
				})
			: []
	const byId = new Map(workouts.map((workout) => [workout.id, workout]))
	const activities = fixedWorkoutIds.flatMap((id) => {
		const activity = readSimpleActivity(byId.get(id))
		return activity
			? [{ kind: activity.kind, minutes: activity.durationMin }]
			: []
	})

	// Lifting, as the start lays it, where the athlete answered a frequency
	// and the plan has a strength track to lift on.
	const strengthTrack = live.find((track) => track.discipline === 'strength')
	const lifts = profile?.strengthPerWeek != null && strengthTrack != null
	// The main sport first: the track carrying the most hard sessions in the
	// phase a change begins in, as the start lays the family's mix on the
	// main sport only; the stored order breaks ties.
	const phaseIndex = (
		season.weeks.find((week) => week.weekKey >= fromWeekKey) ??
		season.weeks.at(-1)
	)?.phaseIndex
	const hardOf = (track: PlanStartSeason['tracks'][number]) =>
		(
			track.segments.find((segment) => segment.phaseIndex === phaseIndex)
				?.mix ?? []
		).reduce((sum, entry) => sum + entry.sessionsPerWeek, 0)
	const answers = planStartAnswers({
		level: stored.level,
		preferences: stored.preferences,
		tracks: [...season.tracks].sort((a, b) => hardOf(b) - hardOf(a)),
		weeks: season.weeks,
		fromWeekKey,
		days: parseTrainableWeekdays(profile?.trainableWeekdays ?? null)
			.map(patternWeekdayOf)
			.filter(isPatternWeekday),
		patternDays,
		activities,
		strength:
			lifts && reading && profile?.strengthPerWeek != null
				? { perWeek: profile.strengthPerWeek, session: reading.session }
				: null,
		capacityHours: profile?.weeklyCapacityHours ?? null,
	})
	if (!answers) {
		return {
			ok: false,
			reason: otherCurrency
				? 'currency'
				: endurance.length === 0 &&
					  activities.length === 0 &&
					  strengthTrack != null
					? 'lifting-only'
					: 'no-days',
		}
	}
	// How often the plan lifts now: the athlete's answer, else the block
	// in force from this week, else the plan's first.
	const blocks = strengthTrack?.strengthSegments ?? []
	const block =
		[...blocks].reverse().find((one) => one.startWeekKey <= fromWeekKey) ??
		blocks[0]
	return {
		ok: true,
		answers,
		current: season.family,
		levelSaid: stored.level != null,
		readOnly:
			season.eventId != null ? 'event' : otherCurrency ? 'currency' : null,
		eventName: season.eventName,
		lifting: reading
			? {
					...reading,
					perWeek: strengthTrack
						? (profile?.strengthPerWeek ?? block?.sessionsPerWeek ?? null)
						: null,
				}
			: null,
	}
}

/**
 * The Start Options for this plan from the week a switch begins in, or null
 * where the plan has nothing the start could lay: a plan that only lifts, or
 * one whose sports are measured in kilometres or TSS. The start lays hours
 * (ADR 0102), so such a plan — authored by hand — keeps _Bytt filosofi_ in
 * _Avansert_ and has no _Bytt treningsform_.
 * Each option is `draftStart`'s, for the answers read back off the plan
 * ({@link readPlanStartAnswers}).
 */
export async function readPlanStartOptions(
	userId: string,
	season: PlanStartSeason,
	fromWeekKey: string,
	now: Date = new Date(),
): Promise<PlanStartOptions | null> {
	const read = await readPlanStartAnswers(userId, season, fromWeekKey, now)
	if (!read.ok) return null
	const start = draftStart(read.answers)
	if (!start) return null
	return {
		answers: read.answers,
		start,
		current: read.current,
		levelSaid: read.levelSaid,
	}
}
