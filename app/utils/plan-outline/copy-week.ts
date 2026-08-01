// **Copying a week**: taking a week that went well and putting it on another week
// (#415, ADR 0044 §6).
//
// This module is the pure half — where each session lands and which ones cannot be
// carried across. It writes nothing; `copy-week.server.ts` takes this plan and
// duplicates Workouts against it.
//
// Three properties it exists to hold, and the third is the whole ticket:
//
// - **A copy is copied as authored.** Nothing here scales anything. The target
//   week's derived target is not an input to this function and deliberately has no
//   way to become one: a copied week is the week the athlete already wrote, and if
//   the target week's guideline figure differs, the surface simply shows the week's
//   sessions against its target the way it does for any hand-edited week (ADR 0040
//   §1). That is the difference between copying a week and stamping a **Week
//   Pattern**, whose share days *do* absorb the week's volume (ADR 0044 §7).
// - **A session lands on the matching weekday at the same *local* time.** A Training
//   Week is Monday–Sunday (ADR 0019), so the offset from the source week's Monday is
//   the offset from the target week's Monday. `scheduledAt` is stored UTC and the
//   athlete's offset can differ between the two weeks — a copy across a DST boundary
//   preserves the athlete's own 07:00, not the UTC instant it happened to be. Hence
//   the crossing goes out through the wall clock and back in (ADR 0023).
// - **A session the app cannot copy is *reported*, never faked.** One reason today
//   ({@link COPY_SKIP_REASONS}), and it is an absence with its cause rather than an
//   empty session written to keep the count up (ADR 0008).
//
// Nothing here carries wording; the route says it.

import { z } from 'zod'
import {
	addDays,
	localDate,
	localTimeOfDay,
	localTimeUTC,
} from '../athlete-calendar.ts'
import {
	isPatternWeekday,
	PATTERN_WEEKDAYS,
	type PatternWeekday,
} from './week-pattern.ts'

/**
 * Why a session in the source week produced no copy.
 *
 * - `no-prescription` — the session carries no **Workout** at all. A recording-only
 *   session is a record of something that happened, not a prescription, so there is
 *   nothing to duplicate; copying it would put an empty session on the target week.
 *
 * Not a refusal: the rest of the week is copied regardless, and the surface names
 * what was left out.
 */
export const COPY_SKIP_REASONS = ['no-prescription'] as const
export type CopySkipReason = (typeof COPY_SKIP_REASONS)[number]

/** One session of the source week, in the columns the copy reads. */
export type WeekCopySource = {
	sessionId: string
	/** Stored UTC, as `WorkoutSession.scheduledAt` always is. */
	scheduledAt: Date
	/** `null` for a session with no prescription behind it — nothing to copy. */
	workoutId: string | null
}

/** One session the copy will write, and where. */
export type CopiedSession = {
	/** The session this is a copy *of* — carried for reporting, never stored. */
	sourceSessionId: string
	/** The Workout to duplicate. Never shared: the copy gets its own row. */
	sourceWorkoutId: string
	/** 0 = Monday, matching the Training Week (ADR 0019). */
	weekday: PatternWeekday
	/** The UTC instant of the athlete's *same local time* in the target week. */
	scheduledAt: Date
}

/** A source session that produced no copy, and why. */
export type CopySkip = { sessionId: string; reason: CopySkipReason }

export type WeekCopyPlan = {
	sessions: CopiedSession[]
	skipped: CopySkip[]
}

/**
 * Where each session of the source week lands in the target week.
 *
 * The weekday is read off the session's **local** calendar day rather than off its
 * UTC one, because the Training Week it belongs to is the athlete's (ADR 0019): a
 * Sunday-evening session in Oslo is stored on Monday in UTC, and copying it as a
 * Monday would move it a day. The clock time then travels as a wall clock, so the
 * copy keeps the athlete's morning across a DST boundary rather than keeping the
 * instant and drifting an hour.
 *
 * A session whose local day is not one of the source week's seven is dropped —
 * unreachable for rows read through `weekBoundsFromMondayUTC`, and the structural
 * narrowing `stampDays` makes for the same reason: a session copied onto a guessed
 * weekday is worse than a broken row not copied.
 */
export function planWeekCopy({
	sources,
	sourceWeekKey,
	targetWeekKey,
	timezone,
}: {
	sources: readonly WeekCopySource[]
	sourceWeekKey: string
	targetWeekKey: string
	timezone: string
}): WeekCopyPlan {
	const sourceDays = PATTERN_WEEKDAYS.map((weekday) =>
		addDays(sourceWeekKey, weekday),
	)
	const sessions: CopiedSession[] = []
	const skipped: CopySkip[] = []

	for (const source of sources) {
		const weekday = sourceDays.indexOf(localDate(source.scheduledAt, timezone))
		if (!isPatternWeekday(weekday)) continue
		if (source.workoutId == null) {
			skipped.push({ sessionId: source.sessionId, reason: 'no-prescription' })
			continue
		}
		sessions.push({
			sourceSessionId: source.sessionId,
			sourceWorkoutId: source.workoutId,
			weekday,
			scheduledAt: localTimeUTC(
				addDays(targetWeekKey, weekday),
				localTimeOfDay(source.scheduledAt, timezone),
				timezone,
			),
		})
	}

	return {
		sessions: sessions.sort(
			(a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
		),
		skipped,
	}
}

/**
 * What a copy submits: which plan, which week to take, which week to put it on, and
 * whether the athlete has already been told what would be replaced.
 *
 * Out of `authoring-schema.ts` for the reason `WeekPatternStampSchema` is: every
 * schema there writes the **Plan Outline**, and this one writes **Workout
 * Sessions**. Nothing about a copy touches the Outline — it is not an authoring act,
 * and keeping it out is what stops it being mistaken for one.
 *
 * `replace` defaults to `false` so a body that forgets the field asks for the
 * confirmation rather than skipping past it.
 */
export const WeekCopySchema = z
	.object({
		outlineId: z.string().min(1),
		sourceWeekKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
			message: 'Choose the week to copy',
		}),
		targetWeekKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
			message: 'Choose the week to copy onto',
		}),
		replace: z.boolean().default(false),
	})
	.strict()

export type WeekCopyInput = z.infer<typeof WeekCopySchema>
