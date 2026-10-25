/**
 * The Week Pattern's action on the plan page (#410, #533): the typical week's
 * patterns and days, and the starter week. Kept beside `__week-pattern-editor.tsx`
 * so the route's action only dispatches to it.
 */

import { z } from 'zod/v3'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import {
	SESONG_PATTERN_LABELS,
	SESONG_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { fillPlanWeeksToHorizon } from '#app/utils/load/horizon-fill.server.ts'
import {
	PatternWeekdaySchema,
	ShareWeightSchema,
	WeekPatternNameSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createStarterWeekPattern,
	moveWeekPattern,
	moveWeekPatternDay,
	removeWeekPattern,
	removeWeekPatternDay,
	renameWeekPattern,
	type WeekPatternEditRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import { type StarterProposal } from '#app/utils/plan-outline/starter-pattern.ts'
import { PATTERN_DAY_KINDS } from '#app/utils/plan-outline/week-pattern.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	isBlank,
	IdField,
	moveDirection,
	OUTLINE_GONE,
	TRACK_GONE,
	refuse,
	firstIssue,
} from './__plan-action.server.ts'

/**
 * A **Week Pattern**'s name, and a pattern day's three authored values, as the
 * forms submit them.
 *
 * Each pipes into the authoring schema rather than restating its bounds, for the
 * reason `WeeksField` does: the rule lives in one place and what these add is
 * wording. A pattern day carries **no volume field and no zone field** anywhere on
 * this route — not one that is validated away, one that has nowhere to be
 * submitted (ADR 0044 §7, ADR 0042 §9).
 */
const PatternNameField = z.preprocess(
	(value) => value ?? '',
	WeekPatternNameSchema,
)

const WeekdayField = z.preprocess(
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({ message: SESONG_PATTERN_LABELS.whichDay }),
		})
		.pipe(PatternWeekdaySchema),
)

const ShareWeightField = z.preprocess(
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({
				message: SESONG_PATTERN_LABELS.weightRequired,
			}),
		})
		.pipe(ShareWeightSchema),
)

/**
 * The kind of day, from the two the domain has — the domain's own list, so a third
 * kind cannot be invented on this surface and cannot be forgotten here either.
 */
const PatternDayKindField = z.enum(PATTERN_DAY_KINDS)

/**
 * A share day's optional **shape**. Blank is `null` and `null` is a *choice* —
 * "volume with no structure" — so it travels as a value rather than as an omitted
 * field, the way a blank rate does.
 */
const ShapeField = z.preprocess(
	(value) => (isBlank(value) ? null : value),
	z.string().min(1).nullable(),
)

const PATTERN_GONE = SESONG_REFUSAL_LABELS.patternGone

/**
 * The one state a starter week declines in: an athlete whose availability says
 * they train on no days at all. Taken at their word rather than overruled — the
 * empty list is a statement they made, and a plan with no tracks cannot reach this
 * surface.
 */
const NO_STARTER_WEEK = SESONG_REFUSAL_LABELS.noStarterWeek

const DAY_GONE = SESONG_REFUSAL_LABELS.dayGone

const TRACK_MISSING = SESONG_REFUSAL_LABELS.trackMissing

const WORKOUT_MISSING = SESONG_REFUSAL_LABELS.workoutMissing

const DAY_KIND_UNKNOWN = SESONG_REFUSAL_LABELS.dayKindUnknown

/**
 * Lay the active plan's weeks up to the Planning Horizon that it has not laid
 * yet — what a typical week that just gained its days owes the athlete now that
 * stamping is not their step (round-2 decision 14, ADR 0090). The fill never
 * lays a week the plan already laid, nor a week already begun, and lays only
 * the active plan (a resting one waits). Contained like every relay after a
 * plan write (ADR 0079 S6): the pattern is saved either way, and the week
 * change lays the horizon from the next close on.
 */
async function fillToHorizon(userId: string): Promise<void> {
	try {
		const timezone = await getAthleteTimezone(userId)
		await fillPlanWeeksToHorizon(userId, timezone, new Date())
	} catch (error) {
		console.error('Sesong: filling the weeks to the horizon failed', error)
	}
}

/** {@link fillToHorizon} after a pattern day lands, passing its result on. */
async function fillAfterDay<Result extends { ok: boolean }>(
	userId: string,
	result: Result,
): Promise<Result> {
	if (result.ok) await fillToHorizon(userId)
	return result
}

/**
 * One **Week Pattern** service result, worded. A separate pair from `report` above
 * because the two refusal unions are separate vocabularies — a pattern edit can
 * refuse over a day, a track or a Workout, and none of those is a phase — and
 * typing the map to the union makes a refusal added later a compile error here
 * rather than a silent catch-all.
 */
function reportPattern(
	result: { ok: true } | { ok: false; reason: WeekPatternEditRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(patternRefusalMessage(result.reason))
}

function patternRefusalMessage(reason: WeekPatternEditRefusal): string {
	switch (reason) {
		case 'outline-gone':
			return OUTLINE_GONE
		case 'pattern-gone':
			return PATTERN_GONE
		case 'day-gone':
			return DAY_GONE
		case 'track-gone':
			return TRACK_GONE
		case 'workout-gone':
			// The Workout, not the day: the day is fine and still there, and what the
			// athlete has to do is pick a session that still exists.
			return SESONG_REFUSAL_LABELS.workoutGone
		case 'workout-discipline-mismatch':
			// Not an absence: the session exists and is theirs, and it belongs to another
			// discipline. Said as the domain rule rather than as a validation failure,
			// because the rule is the reason (ADR 0041, ADR 0043 §5) — a day's volume comes
			// out of its own track, so a ride cannot spend a run week.
			return SESONG_REFUSAL_LABELS.workoutMismatch
		case 'at-the-edge':
			// One message for patterns and for days, in both directions: a pattern
			// moves through the plan's list and a day moves within its own weekday, and
			// naming either end would be the wrong word half the time.
			return SESONG_REFUSAL_LABELS.atEdge
	}
}

/**
 * Where a starter week came from, in one sentence — said once, when it lands.
 *
 * It names the *source* rather than the shape, because the shape is now on the
 * page for the athlete to read: what they cannot see is whether the app read their
 * own availability or fell back to a convention, and that is exactly the claim
 * that must not be left ambiguous.
 */
function starterSentence(proposal: StarterProposal): string {
	const days = proposal.weekdays.length
	const built =
		proposal.source === 'availability'
			? SESONG_PATTERN_LABELS.starterFromProfile(days)
			: SESONG_PATTERN_LABELS.starterFromDefault
	return SESONG_PATTERN_LABELS.starterTail(built)
}

/** The Week Pattern's intents, which the route's action hands here. */
export type WeekPatternIntent =
	| 'add-week-pattern'
	| 'start-week-pattern'
	| 'rename-week-pattern'
	| 'move-week-pattern'
	| 'remove-week-pattern'
	| 'add-week-pattern-day'
	| 'move-week-pattern-day'
	| 'remove-week-pattern-day'

/**
 * One edit of a Week Pattern or one of its days. A day that lands lays the
 * weeks up to the horizon (`fillAfterDay`); a starter week redirects with a
 * toast saying where it came from.
 */
export async function weekPatternAction(
	userId: string,
	intent: WeekPatternIntent,
	request: Request,
	formData: FormData,
) {
	const outlineId = IdField.safeParse(formData.get('outlineId'))
	const patternId = IdField.safeParse(formData.get('patternId'))
	const dayId = IdField.safeParse(formData.get('dayId'))

	switch (intent) {
		case 'add-week-pattern': {
			const name = PatternNameField.safeParse(formData.get('name'))
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			return reportPattern(
				await addWeekPattern(userId, {
					outlineId: outlineId.data,
					name: name.data,
				}),
			)
		}
		case 'start-week-pattern': {
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			const started = await createStarterWeekPattern(userId, {
				outlineId: outlineId.data,
			})
			if (!started.ok) {
				return refuse(
					started.reason === 'outline-gone' ? OUTLINE_GONE : NO_STARTER_WEEK,
				)
			}
			// The weeks fill themselves from the typical week (decision 14): the
			// ones up to the horizon are laid now rather than at the next close.
			await fillToHorizon(userId)
			// A toast for `apply-preset`'s reason: a week the athlete did not type
			// just appeared, and they are owed where it came from in words — the
			// availability it read, or the convention it fell back to — before they
			// start editing it.
			const url = new URL(request.url)
			return redirectWithToast(`${url.pathname}${url.search}`, {
				type: 'success',
				title: SESONG_PATTERN_LABELS.starterToast,
				description: starterSentence(started.proposal),
			})
		}
		case 'rename-week-pattern': {
			const name = PatternNameField.safeParse(formData.get('name'))
			if (!patternId.success) return refuse(PATTERN_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			return reportPattern(
				await renameWeekPattern(userId, {
					patternId: patternId.data,
					name: name.data,
				}),
			)
		}
		case 'move-week-pattern': {
			if (!patternId.success) return refuse(PATTERN_GONE)
			return reportPattern(
				await moveWeekPattern(userId, {
					patternId: patternId.data,
					direction: moveDirection(formData),
				}),
			)
		}
		case 'remove-week-pattern': {
			if (!patternId.success) return refuse(PATTERN_GONE)
			return reportPattern(
				await removeWeekPattern(userId, { patternId: patternId.data }),
			)
		}
		case 'add-week-pattern-day': {
			const trackId = IdField.safeParse(formData.get('trackId'))
			const weekday = WeekdayField.safeParse(formData.get('weekday'))
			const kind = PatternDayKindField.safeParse(formData.get('kind'))
			if (!patternId.success) return refuse(PATTERN_GONE)
			if (!trackId.success) return refuse(TRACK_MISSING)
			if (!weekday.success) return refuse(firstIssue(weekday.error))
			if (!kind.success) return refuse(DAY_KIND_UNKNOWN)
			if (kind.data === 'fixed') {
				const workoutId = IdField.safeParse(formData.get('workoutId'))
				// A fixed day *is* its Workout, so a body without one is refused rather
				// than quietly stored as a share: that would be a different day than the
				// athlete asked for, and it would carry a weight nobody typed.
				if (!workoutId.success) return refuse(WORKOUT_MISSING)
				return reportPattern(
					await fillAfterDay(
						userId,
						await addWeekPatternDay(userId, {
							kind: 'fixed',
							patternId: patternId.data,
							trackId: trackId.data,
							weekday: weekday.data,
							workoutId: workoutId.data,
						}),
					),
				)
			}
			const weight = ShareWeightField.safeParse(formData.get('weight'))
			const shape = ShapeField.safeParse(formData.get('workoutId'))
			if (!weight.success) return refuse(firstIssue(weight.error))
			return reportPattern(
				await fillAfterDay(
					userId,
					await addWeekPatternDay(userId, {
						kind: 'share',
						patternId: patternId.data,
						trackId: trackId.data,
						weekday: weekday.data,
						weight: weight.data,
						workoutId: shape.success ? shape.data : null,
					}),
				),
			)
		}
		case 'move-week-pattern-day': {
			if (!dayId.success) return refuse(DAY_GONE)
			return reportPattern(
				await moveWeekPatternDay(userId, {
					dayId: dayId.data,
					direction: moveDirection(formData),
				}),
			)
		}
		case 'remove-week-pattern-day': {
			if (!dayId.success) return refuse(DAY_GONE)
			return reportPattern(
				await removeWeekPatternDay(userId, { dayId: dayId.data }),
			)
		}
	}
}
