/**
 * The season as the plan page (`plan.tsx`) reads it: the loader's season and
 * reply types, the two readings' names, and the week numbers every Sesong
 * surface prints. Shared by the route and the readings split out of it (#533).
 */

import { addDays, isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { isoWeekSpanLabel } from '#app/utils/labels.ts'
import { type AnchorPlacement } from '#app/utils/plan-outline/derive.ts'
import { weekIndexOf } from '#app/utils/plan-outline/week-keys.ts'
import { type Route } from './+types/plan.ts'

export const TABS = ['blocks', 'weeks'] as const

export type Tab = (typeof TABS)[number]

/**
 * A track's **Season Anchor** segments as the two boundary-step rules read them:
 * 0-based week indices counted off the **Plan Start Week** (ADR 0040 §3).
 *
 * **Not** {@link weekInPlanOf}, and the difference is the point. That one answers
 * "which week of the plan is this shown as" and returns `null` for a key the plan
 * no longer covers; this one answers "where does the derivation count this", and an
 * anchor keyed before the plan's first week is a **negative index** the rules read
 * as "in force from before week one" rather than as absent. Clamping or dropping it
 * here would hand the surface a different anchor list from the one that priced the
 * weeks — which is exactly the drift `boundaryStepInForce` exists to prevent.
 *
 * One helper for both readings, because both boundary-step questions are asked of
 * the same list: the endurance one on the Blocks reading, and the strength one
 * inside `__strength-segment-editor.tsx`.
 */
export function anchorPlacementsOf(
	startWeekKey: string,
	anchors: ReadonlyArray<{ fromWeekKey: string }>,
): AnchorPlacement[] {
	return anchors.map((anchor) => ({
		fromWeekIndex: weekIndexOf(startWeekKey, anchor.fromWeekKey),
	}))
}

/**
 * A plan week's number as every Sesong surface prints it: the ISO week, `Uke
 * 41`, the number I dag, the Sesong edits and a calendar use — never the
 * plan's own count from 1, which named one week two ways on one page (audit
 * B6, round 2).
 */
export function weekNumberOf(week: { weekKey: string }): number {
	return isoWeekNumber(week.weekKey)
}

/** The ISO week of the plan's `weekInPlan`-th week (1-based). */
export function isoWeekOfPlanWeek(
	startWeekKey: string,
	weekInPlan: number,
): number {
	return isoWeekNumber(addDays(startWeekKey, 7 * (weekInPlan - 1)))
}

/** `Uke 41–44`, or `Uke 41`: a run of plan weeks, by their ISO numbers. */
export function weekSpan(
	startWeekKey: string,
	from: number,
	to: number,
): string {
	return isoWeekSpanLabel(
		isoWeekOfPlanWeek(startWeekKey, from),
		isoWeekOfPlanWeek(startWeekKey, to),
	)
}

export type SeasonData = Route.ComponentProps['loaderData']['season']

export type SeasonTrack = SeasonData['tracks'][number]

export type SeasonPhaseData = SeasonData['phases'][number]

export type SegmentData = SeasonTrack['segments'][number]

export type SegmentActionData = Route.ComponentProps['actionData']

export type WeekData = SeasonData['weeks'][number]

export type WeekTargetData = WeekData['targets'][number]
