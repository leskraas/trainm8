// _Bytt treningsform_ on the server (#581): what the athlete keeps, read
// back as the start's answers, and the **Start Options** those answers lay.

import { parseTrainableWeekdays } from '../athlete-schema.ts'
import { readStartAnswersOf } from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import { type PresetFamily } from '../plan-outline/presets.ts'
import { isPatternWeekday } from '../plan-outline/week-pattern.ts'
import { readSimpleActivity } from '../simple-activity.ts'
import { type AuthoredSeason } from '../training.server.ts'
import { planStartAnswers } from './plan-start-options.ts'
import {
	draftStart,
	type StartAnswers,
	type StartDraft,
} from './start-draft.ts'
import { readStartStrength } from './start-strength.server.ts'

export type PlanStartOptions = {
	answers: StartAnswers
	start: StartDraft
	/** The family the plan follows now, marked among the options. */
	current: PresetFamily | null
	/** False for an athlete who never said a Training Level. */
	levelSaid: boolean
}

/** A Monday-first weekday from the Sunday-first calendar day ADR 0005 stores. */
const patternWeekdayOf = (calendar: number) => (calendar + 6) % 7

/**
 * The Start Options for this plan from the week a switch begins in, or null
 * where the plan has nothing the start could lay: a plan that only lifts, or
 * one whose sports are measured in kilometres or TSS. The start lays hours
 * (ADR 0102), so such a plan — authored by hand — keeps _Bytt filosofi_ in
 * _Avansert_ and has no _Bytt treningsform_.
 * Each option is `draftStart`'s, for the athlete's stored level, preferences
 * and days and the plan's tracks and hours (`planStartAnswers`).
 */
export async function readPlanStartOptions(
	userId: string,
	season: Pick<
		AuthoredSeason,
		'family' | 'tracks' | 'weeks' | 'patterns' | 'outlineId'
	>,
	fromWeekKey: string,
	now: Date = new Date(),
): Promise<PlanStartOptions | null> {
	const [stored, profile] = await Promise.all([
		readStartAnswersOf(userId),
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: {
				trainableWeekdays: true,
				weeklyCapacityHours: true,
				strengthPerWeek: true,
			},
		}),
	])

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
	const lifts =
		profile?.strengthPerWeek != null &&
		season.tracks.some((track) => track.discipline === 'strength')
	const lifting = lifts ? await readStartStrength(userId, now) : null

	const answers = planStartAnswers({
		level: stored.level,
		preferences: stored.preferences,
		tracks: season.tracks,
		weeks: season.weeks,
		fromWeekKey,
		days: parseTrainableWeekdays(profile?.trainableWeekdays ?? null)
			.map(patternWeekdayOf)
			.filter(isPatternWeekday),
		patternDays,
		activities,
		strength:
			lifting && profile?.strengthPerWeek != null
				? { perWeek: profile.strengthPerWeek, session: lifting.session }
				: null,
		capacityHours: profile?.weeklyCapacityHours ?? null,
	})
	if (!answers) return null
	const start = draftStart(answers)
	if (!start) return null
	return {
		answers,
		start,
		current: season.family,
		levelSaid: stored.level != null,
	}
}
