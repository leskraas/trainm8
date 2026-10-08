/**
 * What one session does to its week (#505 stories 37 and 39): the **Planned
 * Volume** before and after, held against the **Week Target** — which a
 * session never moves.
 *
 * Two readings of the same arithmetic. `weekSumPreview` runs while the athlete
 * types, on the week as it stands plus the session the writing line read;
 * `weekSumChangeLine` runs after the write, on the week read twice — before and
 * after — so the toast reports what the database now says rather than what the
 * preview predicted.
 *
 * Both price a session the way the week model does (`fixedDayVolume`, the
 * all-steps-carry-the-unit rule), so the "after" the preview shows is the
 * number the week header shows once the session is saved. A session with no
 * number in the track's unit is counted as one — `+1 uten km` — and never added
 * as zero.
 *
 * Codes and numbers only; the words are `week-sum-words.ts`'s, as the week
 * model's are the presenter's.
 */
import { type Discipline, type WorkoutStructure } from '../workout-schema.ts'
import { type VolumeCurrency } from './derive.ts'
import { fixedDayVolume } from './week-pattern.ts'
import { type TrackWeekVolume, type WeekVolumes } from './week-volumes.ts'

/** A session as the writing line read it: a Workout structure. */
export type SummedWorkout = Pick<WorkoutStructure, 'discipline' | 'blocks'>

/** Why the session adds no number: none in the unit, or not priced yet. */
export type AddedAbsence = 'no-number' | 'priced-on-save'

export type WeekSumPreview =
	| {
			kind: 'track'
			discipline: Discipline
			currency: VolumeCurrency
			/** The Planned Volume as the week stands; null when none is measured. */
			before: number | null
			after: number | null
			/** What the session adds; null with a reason when it adds no number. */
			added: number | null
			addedAbsence: AddedAbsence | null
			/** 1 when the session joins the week's `+n uten km`. */
			unmeasuredAdded: 0 | 1
			/** The Week Target, unmoved. */
			target: number | null
	  }
	/** The plan has no track for the session's sport: it counts in nothing. */
	| { kind: 'annet'; discipline: string }
	/** No plan, so no track and no target to hold the session against. */
	| { kind: 'no-plan'; discipline: string }

/** The week's track a session of this sport sums into, or null. */
export function trackForDiscipline(
	weekVolumes: WeekVolumes,
	discipline: string,
): TrackWeekVolume | null {
	return weekVolumes.tracks.find((t) => t.discipline === discipline) ?? null
}

function addedIn(
	workout: SummedWorkout,
	currency: VolumeCurrency,
): { added: number | null; absence: AddedAbsence | null } {
	// A Planned TSS is priced against the athlete's thresholds when the session
	// is written (ADR 0019); before that there is no honest number to show.
	if (currency === 'tss') return { added: null, absence: 'priced-on-save' }
	const added = fixedDayVolume(
		workout.blocks.map((block) => ({
			repeatCount: block.repeatCount,
			seriesRepeatCount: block.seriesRepeatCount,
			// A lift states no distance or time, so a strength step carries
			// neither and the session reads as unmeasured in km and hours.
			steps: block.steps.map((step) => ({
				kind: step.kind,
				durationSec:
					step.kind === 'strength' ? null : (step.durationSec ?? null),
				distanceM: step.kind === 'cardio' ? (step.distanceM ?? null) : null,
			})),
		})),
		currency,
	)
	return added == null
		? { added: null, absence: 'no-number' }
		: { added, absence: null }
}

/**
 * The week sum before → after one more session, in `track`'s unit. `track` is
 * the week's track for the session's sport ({@link trackForDiscipline}); null
 * means the session counts in Annet, or — with no tracks at all — that there
 * is no plan.
 */
export function weekSumPreview(
	weekVolumes: WeekVolumes,
	workout: SummedWorkout,
	track: TrackWeekVolume | null,
): WeekSumPreview {
	if (!track) {
		return weekVolumes.tracks.length === 0
			? { kind: 'no-plan', discipline: workout.discipline }
			: { kind: 'annet', discipline: workout.discipline }
	}
	const { added, absence } = addedIn(workout, track.currency)
	const before = track.planned
	return {
		kind: 'track',
		discipline: track.discipline,
		currency: track.currency,
		before,
		after: added == null ? before : (before ?? 0) + added,
		added,
		addedAbsence: absence,
		unmeasuredAdded: absence === 'no-number' ? 1 : 0,
		target: track.target,
	}
}

/**
 * Whether a change moved a week's sum for this sport: its track's Planned
 * Volume or its count of sessions without a number. False where no track
 * counts the sport — there is no sum to have moved.
 */
export function weekSumMoved(
	before: WeekVolumes,
	after: WeekVolumes,
	discipline: string,
): boolean {
	const was = trackForDiscipline(before, discipline)
	const now = trackForDiscipline(after, discipline)
	if (!was || !now) return false
	return (
		was.planned !== now.planned ||
		was.plannedUnmeasuredCount !== now.plannedUnmeasuredCount
	)
}
