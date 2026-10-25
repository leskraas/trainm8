// Adding an Event to an open-ended plan (#505 stories 7–8, #518, ADR 0079 §4),
// worked out before anything is written: the preview the athlete reads and
// the edit that lands are one computation, as the philosophy switch's are
// (`philosophy.ts`).
//
// The rule, in one sentence: **the round being lived ends after this week, and
// the family's run-up is laid from next week to the Event's week.**
//
//   - **The current round ends early**, at the weeks lived, this week
//     included; a round appended after it but not yet begun goes. Past the
//     plan's end, the last round runs on over the lived weeks to this one.
//   - **The run-up** is the family's blocks after its base (`familyRunUp` —
//     the rounds lived were the base), fitted to the weeks left by the Season
//     Fit rule (`fitRunUp`): the taper is never touched, the first block gives
//     first. The family is the one the plan records, else the one the round
//     being lived reads as by its rhythm, Klassisk when it has none.
//   - **Never past two years**: a plan longer than `MAX_PLAN_WEEKS` is one no
//     Sesong edit can change, so an Event that far out is refused here rather
//     than laid.
//
// Pure: stored rows in, the new rows and a diff out. Week targets on both
// sides come from `weekViews` over the rows as they are and as they would be.
// The athlete's sessions are not in here: which stay is the clearing gate's
// rule, applied after the edit (`open-ended.server.ts`).

import { MAX_PLAN_WEEKS } from './authoring-schema.ts'
import { phaseIndexForWeek, phaseStartIndices, rhythmOf } from './derive.ts'
import { fitRunUp } from './fit-proposal.ts'
import { phaseSpecs, type OutlineRows, type PhaseRow } from './from-rows.ts'
import {
	digestOf,
	riseWarnings,
	weekViews,
	type RiseWarning,
	type WeekView,
} from './outline-preview.ts'
import {
	phaseViews,
	rowsAfter,
	type LaidPhase,
	type PhaseView,
} from './philosophy.ts'
import { familyRunUp, outlineFamily } from './presets.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'

/** An open-ended plan as adding an Event reads it: its rows and its family. */
export type AttachEventOutline = OutlineRows & {
	/** `PlanOutline.family` as stored; null for a plan that records none. */
	family: string | null
}

/** The Event the plan would run toward, as the preview names it. */
export type AttachEventTarget = {
	name: string
	/** The race day (`YYYY-MM-DD`), as the athlete dated it. */
	dayKey: string
	/** The Monday of the race's week, in the athlete's zone. */
	weekKey: string
}

export type AttachEventPreviewRefusal =
	/** A plan with no phases has no round to end. */
	| 'outline-not-found'
	/** The Event falls in this week, so there is no week left to lay toward it. */
	| 'event-too-soon'
	/** The plan would run past `MAX_PLAN_WEEKS` to reach the Event. */
	| 'plan-too-long'

export type AttachEventPreview = {
	ok: true
	event: AttachEventTarget
	/** The round that ends early: its name, the weeks it keeps and had. */
	ended: {
		name: string
		weeks: number
		wasWeeks: number
		/** Its last week now: the week being lived. */
		lastWeekKey: string
	}
	/** Rounds appended after it that never began, and go. */
	removed: string[]
	/** The first week laid toward the Event: next week. */
	fromWeekKey: string
	/** What the plan runs from this week on, before and after. */
	phases: { before: PhaseView[]; after: PhaseView[] }
	/**
	 * Week by week from this week to the later of the two ends: what each side
	 * reads, or null on a side whose plan has ended by then.
	 */
	weeks: Array<{
		weekKey: string
		before: WeekView | null
		after: WeekView | null
	}>
	/**
	 * The loading weeks the new plan would raise more than 10 % over the
	 * loading week before (ADR 0084 §3), from the first week laid on. It warns
	 * and never blocks.
	 */
	warnings: RiseWarning[]
	/**
	 * A fingerprint of everything above and of the edit: the confirm posts it
	 * back, so the attach applied is the one the athlete saw.
	 */
	digest: string
	/** The edit that makes it so, applied as given (`attachEventToOutline`). */
	edit: {
		ending: { phaseId: string; weeks: number }
		remove: string[]
		add: LaidPhase[]
	}
	/** The rows as they will be, for a caller that reads them on. */
	rows: OutlineRows
}

export type AttachEventPreviewResult =
	| AttachEventPreview
	| { ok: false; reason: AttachEventPreviewRefusal }

/**
 * What adding `event` to `outline` would do, in the week opening on
 * `currentWeekKey` — the week being lived, in the athlete's zone. Pure — and
 * the one computation both the preview and the apply run.
 */
export function previewAttachEvent(
	outline: AttachEventOutline,
	event: AttachEventTarget,
	currentWeekKey: string,
): AttachEventPreviewResult {
	const ordered = [...outline.phases].sort(
		(a, b) => a.orderIndex - b.orderIndex,
	)
	if (ordered.length === 0) return { ok: false, reason: 'outline-not-found' }
	const specs = phaseSpecs(outline)
	// The week being lived; before the plan opens, its first week stands in.
	const current = Math.max(0, weekIndexOf(outline.startWeekKey, currentWeekKey))
	const eventWeek = weekIndexOf(outline.startWeekKey, event.weekKey)
	const endingIndex = phaseIndexForWeek(specs, current) ?? ordered.length - 1
	const ending = ordered[endingIndex]!
	const runUp = fitRunUp(
		familyRunUp(
			outlineFamily(outline.family, rhythmOf(ending.rhythm)) ?? 'classic',
		),
		eventWeek - current,
	)
	if (!runUp) return { ok: false, reason: 'event-too-soon' }
	// The plan then holds every week up to and including the Event's.
	if (eventWeek + 1 > MAX_PLAN_WEEKS) {
		return { ok: false, reason: 'plan-too-long' }
	}

	// The round being lived — or, past the plan's end, the last one, which then
	// runs on to this week.
	const lived = current - (phaseStartIndices(specs)[endingIndex] ?? 0) + 1
	const kept: PhaseRow[] = ordered.slice(0, endingIndex + 1)
	const dropped = ordered.slice(endingIndex + 1)
	const remove = dropped.map((phase) => phase.id)
	const add: LaidPhase[] = runUp.map((phase) => ({
		name: phase.name,
		weeks: phase.weeks,
		rhythm: phase.rhythm,
		tapers: phase.tapers,
		ramp: phase.ramp,
		boundaryStep: phase.boundaryStep,
		mix: phase.mix,
	}))
	const rows = rowsAfter(
		outline,
		kept,
		[{ phaseId: ending.id, weeks: lived }],
		remove,
		add,
	)

	const thisWeekKey = weekKeyAt(outline.startWeekKey, current)
	const fromWeekKey = weekKeyAt(outline.startWeekKey, current + 1)
	const beforeWeeks = weekViews(outline)
	const afterWeeks = weekViews(rows)
	const span = Math.max(beforeWeeks.length, afterWeeks.length)
	const ended = {
		name: ending.name,
		weeks: lived,
		wasWeeks: ending.weeks,
		lastWeekKey: thisWeekKey,
	}
	const removed = dropped.map((phase) => phase.name)
	const phases = {
		before: phaseViews(outline, current),
		after: phaseViews(rows, current),
	}
	const weeks = Array.from({ length: Math.max(0, span - current) }, (_, i) => ({
		weekKey: weekKeyAt(outline.startWeekKey, current + i),
		before: beforeWeeks[current + i] ?? null,
		after: afterWeeks[current + i] ?? null,
	}))
	const warnings = riseWarnings(
		rows,
		afterWeeks,
		(weekKey) => weekKey >= fromWeekKey,
	)
	const edit = { ending: { phaseId: ending.id, weeks: lived }, remove, add }
	return {
		ok: true,
		event,
		ended,
		removed,
		fromWeekKey,
		phases,
		weeks,
		warnings,
		digest: digestOf({
			event,
			ended,
			removed,
			fromWeekKey,
			phases,
			weeks,
			warnings,
			edit,
		}),
		edit,
		rows,
	}
}
