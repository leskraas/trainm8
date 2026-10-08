// _Sesong_ edits, version 1 (#505 stories 72–77): a week's target (or back to
// the plan's own), a phase's name, length and rhythm, and which week of a block
// is the easy one — each worked out
// before anything is written, so the preview the athlete approves and the edit
// that lands are one computation. (The fourth Sesong edit, the philosophy, is
// `philosophy.ts`, built the same way.)
//
// Pure: stored rows in, a preview out. Both sides of every week come from
// `weekViews` — the derivation every surface reads — run over the rows as they
// are and as they would be, so the preview cannot promise a number the plan
// does not then derive. The preview carries:
//
//   - **the weeks that change**, before and after;
//   - **rise warnings** (`weekRiseWarnings`, ADR 0084): a loading week that
//     would rise more than 10 % over the loading week before it, for the weeks
//     the edit touches;
//   - **what did not move** (`held`), so the message can say which number
//     stayed (story 77): "Uke 42: mål 40 → 46 km. Fasen og de andre ukene står
//     som før.";
//   - **the write**, applied as given by `season-edit.server.ts`, and a
//     `digest` the confirm posts back, so a preview gone stale is refused.
//
// **Weeks already begun are history.** An edit that would change the role,
// the target or the phase of a week before the first unbegun one is refused
// (`week-lived`, `changes-lived-weeks`), the line ADR 0040 §5 draws for the
// anchor and the philosophy switch draws for itself. A name is intent, not a
// number, so renaming a phase that has been lived in is fine.

import { isoWeekNumber } from '../athlete-calendar.ts'
import { type Discipline } from '../workout-schema.ts'
import { MAX_PLAN_WEEKS } from './authoring-schema.ts'
import {
	phaseIndexForWeek,
	phaseStartIndices,
	rhythmOf,
	rhythmPeriod,
	totalWeeks,
	type Rhythm,
	type VolumeCurrency,
} from './derive.ts'
import { phaseSpecs, resolvedTracks, type OutlineRows } from './from-rows.ts'
import { digestOf, weekViews, type WeekView } from './outline-preview.ts'
import { weekRiseWarnings } from './ramp-guard.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'

export const SEASON_EDIT_KINDS = ['week-target', 'phase', 'easy-week'] as const
export type SeasonEditKind = (typeof SEASON_EDIT_KINDS)[number]

/** What the athlete asked for, as the form posts it. */
export type SeasonEdit =
	/** `value: null` hands the week back to the plan's own target. */
	| {
			kind: 'week-target'
			trackId: string
			weekKey: string
			value: number | null
	  }
	/** A null field keeps what the phase has. */
	| {
			kind: 'phase'
			phaseId: string
			name: string | null
			weeks: number | null
			rhythm: Rhythm | null
			tapers: boolean | null
	  }
	/** The week chosen as the easy one; its phase is the one it falls in. */
	| { kind: 'easy-week'; weekKey: string }

export type SeasonEditRefusal =
	| 'track-not-found'
	| 'phase-not-found'
	| 'week-outside-plan'
	/** The week has begun or is behind; its target is history. */
	| 'week-lived'
	/** The edit would change a week already begun. */
	| 'changes-lived-weeks'
	/** The phase's rhythm has no easy week to move, or it tapers. */
	| 'no-easy-week'
	| 'plan-too-long'
	/** What was asked for is what the plan already says. */
	| 'no-change'
	/** Back to the plan's target, for a week that already follows it. */
	| 'not-hand-set'

/**
 * The numbers an edit leaves where they were — the message names them (story
 * 77). Each is stated only where the preview shows it to hold.
 */
export const HELD_NUMBERS = [
	'phase',
	'phase-name',
	'phase-length',
	'other-weeks',
	'week-targets',
	'plan-start',
	'other-phases',
] as const
export type HeldNumber = (typeof HELD_NUMBERS)[number]

/** What the message headline says, per kind. */
export type SeasonEditSummary =
	| {
			kind: 'week-target'
			weekKey: string
			weekNumber: number
			currency: VolumeCurrency
			before: number | null
			/** Null when the plan's own target for the week is Unavailable. */
			after: number | null
			/** Whether the week goes back to the plan's own target. */
			revert: boolean
	  }
	| {
			kind: 'phase'
			name: { before: string; after: string }
			weeks: { before: number; after: number }
			rhythm: { before: Rhythm; after: Rhythm }
			tapers: { before: boolean; after: boolean }
	  }
	| {
			kind: 'easy-week'
			phaseName: string
			weekNumber: number
			/** The block's easy week until now, or null when it had none. */
			previousWeekNumber: number | null
	  }

/** What the apply writes, exactly. */
export type SeasonEditWrite =
	/** `value: null` removes the week's override. */
	| {
			kind: 'week-target'
			trackId: string
			weekKey: string
			value: number | null
	  }
	| {
			kind: 'phase'
			phaseId: string
			name: string
			weeks: number
			rhythm: Rhythm
			tapers: boolean
			/**
			 * The chosen easy week, cleared when the phase no longer reaches it or
			 * its blocks change shape (a new rhythm, or a taper) — ADR 0084 §2.
			 */
			recoveryWeekIndex: number | null
	  }
	| { kind: 'easy-week'; phaseId: string; recoveryWeekIndex: number }

/** A loading week the edit would raise more than 10 % over the one before. */
export type SeasonEditWarning = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	weekKey: string
	weekNumber: number
	fromWeekKey: string
	from: number
	to: number
	rise: number
}

export type SeasonEditPreview = {
	ok: true
	kind: SeasonEditKind
	summary: SeasonEditSummary
	/** Every week whose phase, role or target changes, before and after. */
	weeks: Array<{
		weekKey: string
		weekNumber: number
		before: WeekView | null
		after: WeekView | null
	}>
	warnings: SeasonEditWarning[]
	held: HeldNumber[]
	/**
	 * The weeks whose role or target changes (or that the plan no longer
	 * reaches), earliest first — the ones to lay again after the edit. Empty
	 * for a rename, which moves no number.
	 */
	relayWeekKeys: string[]
	write: SeasonEditWrite
	/** The confirm posts it back; the apply refuses when it no longer matches. */
	digest: string
}

export type SeasonEditResult =
	| SeasonEditPreview
	| { ok: false; reason: SeasonEditRefusal }

type Refusal = { ok: false; reason: SeasonEditRefusal }
const refuse = (reason: SeasonEditRefusal): Refusal => ({ ok: false, reason })

/**
 * What `edit` would do to the plan in `outline`, from `firstUnbegunWeekKey` on
 * (`readFirstUnbegunWeekKey`: past its Monday, or trained in, a week is
 * begun). Dispatches to the three previews below.
 */
export function previewSeasonEdit(
	outline: OutlineRows,
	edit: SeasonEdit,
	firstUnbegunWeekKey: string,
): SeasonEditResult {
	switch (edit.kind) {
		case 'week-target':
			return previewWeekTarget(outline, edit, firstUnbegunWeekKey)
		case 'phase':
			return previewPhaseEdit(outline, edit, firstUnbegunWeekKey)
		case 'easy-week':
			return previewEasyWeek(outline, edit, firstUnbegunWeekKey)
	}
}

/**
 * Hand-set one week's target in one track (story 72) — a **Week Volume
 * Override** — or hand it back to the plan's own target (`value: null`). An
 * override is a leaf: no other week derives from it (ADR 0044 §5), so the
 * phase and the other weeks stay as they were.
 */
export function previewWeekTarget(
	outline: OutlineRows,
	edit: Extract<SeasonEdit, { kind: 'week-target' }>,
	firstUnbegunWeekKey: string,
): SeasonEditResult {
	const track = outline.tracks.find((t) => t.id === edit.trackId)
	if (!track) return refuse('track-not-found')
	const weekIndex = weekIndexOf(outline.startWeekKey, edit.weekKey)
	if (weekIndex < 0 || weekIndex >= totalWeeks(phaseSpecs(outline))) {
		return refuse('week-outside-plan')
	}
	if (edit.weekKey < firstUnbegunWeekKey) return refuse('week-lived')
	const revert = edit.value == null
	if (revert && !track.overrides.some((o) => o.weekKey === edit.weekKey)) {
		return refuse('not-hand-set')
	}

	const after: OutlineRows = {
		...outline,
		tracks: outline.tracks.map((t) =>
			t.id === track.id
				? {
						...t,
						overrides: [
							...t.overrides.filter((o) => o.weekKey !== edit.weekKey),
							...(edit.value == null
								? []
								: [{ weekKey: edit.weekKey, value: edit.value }]),
						],
					}
				: t,
		),
	}
	const targetOf = (rows: OutlineRows) =>
		weekViews(rows)[weekIndex]?.targets.find((t) => t.trackId === track.id)
			?.value ?? null
	const before = targetOf(outline)
	if (!revert && before === edit.value) return refuse('no-change')

	return finish(outline, after, firstUnbegunWeekKey, {
		summary: {
			kind: 'week-target',
			weekKey: edit.weekKey,
			weekNumber: isoWeekNumber(edit.weekKey),
			currency: track.currency as VolumeCurrency,
			before,
			after: revert ? targetOf(after) : edit.value,
			revert,
		},
		scope: new Set([edit.weekKey]),
		held: (otherWeeksHeld) => [
			'phase',
			...(otherWeeksHeld ? (['other-weeks'] as const) : []),
		],
		write: {
			kind: 'week-target',
			trackId: track.id,
			weekKey: edit.weekKey,
			value: edit.value,
		},
	})
}

/**
 * Rename a phase, change its length, its rhythm or whether it tapers — any of
 * them at once (story 73). The phases after it slide, because none stores a
 * date; the plan's start stays (ADR 0044 §3). A phase already begun can grow,
 * or shrink down to the weeks lived in it; its rhythm can change only where
 * that leaves the weeks lived as they were.
 */
export function previewPhaseEdit(
	outline: OutlineRows,
	edit: Extract<SeasonEdit, { kind: 'phase' }>,
	firstUnbegunWeekKey: string,
): SeasonEditResult {
	const phase = outline.phases.find((p) => p.id === edit.phaseId)
	if (!phase) return refuse('phase-not-found')
	const name = edit.name?.trim() || phase.name
	const weeks = edit.weeks ?? phase.weeks
	const wasRhythm = rhythmOf(phase.rhythm)
	const rhythm = edit.rhythm ?? wasRhythm
	const tapers = edit.tapers ?? phase.tapers
	const renamed = name !== phase.name
	const resized = weeks !== phase.weeks
	const rhythmChanged = rhythm !== wasRhythm || tapers !== phase.tapers
	if (!renamed && !resized && !rhythmChanged) return refuse('no-change')
	const season = totalWeeks(phaseSpecs(outline))
	if (season - phase.weeks + weeks > MAX_PLAN_WEEKS) {
		return refuse('plan-too-long')
	}
	// A chosen easy week belongs to the blocks it was chosen in: a new rhythm
	// or a taper reshapes them, and a shorter phase may no longer reach it.
	const chosen = phase.recoveryWeekIndex ?? null
	const recoveryWeekIndex =
		chosen != null && chosen < weeks && !rhythmChanged ? chosen : null

	const after: OutlineRows = {
		...outline,
		phases: outline.phases.map((p) =>
			p.id === phase.id
				? { ...p, name, weeks, rhythm, tapers, recoveryWeekIndex }
				: p,
		),
	}
	return finish(outline, after, firstUnbegunWeekKey, {
		summary: {
			kind: 'phase',
			name: { before: phase.name, after: name },
			weeks: { before: phase.weeks, after: weeks },
			rhythm: { before: wasRhythm, after: rhythm },
			tapers: { before: phase.tapers, after: tapers },
		},
		scope: null,
		held: () =>
			resized
				? [
						...(renamed ? [] : (['phase-name'] as const)),
						'plan-start',
						'other-phases',
					]
				: rhythmChanged
					? [...(renamed ? [] : (['phase-name'] as const)), 'phase-length']
					: ['phase-length', 'week-targets'],
		write: {
			kind: 'phase',
			phaseId: phase.id,
			name,
			weeks,
			rhythm,
			tapers,
			recoveryWeekIndex,
		},
	})
}

/**
 * Make `weekKey` the easy week of its block (story 74), the
 * `recoveryWeekIndex` `weekRole` reads: that block recovers on the chosen
 * week, every other block of the phase keeps the rhythm's own. The phase keeps
 * its length; the loading weeks after the moved easy week climb from it.
 */
export function previewEasyWeek(
	outline: OutlineRows,
	edit: Extract<SeasonEdit, { kind: 'easy-week' }>,
	firstUnbegunWeekKey: string,
): SeasonEditResult {
	const specs = phaseSpecs(outline)
	const weekIndex = weekIndexOf(outline.startWeekKey, edit.weekKey)
	const phaseIndex = phaseIndexForWeek(specs, weekIndex)
	if (phaseIndex == null) return refuse('week-outside-plan')
	if (edit.weekKey < firstUnbegunWeekKey) return refuse('week-lived')
	const ordered = [...outline.phases].sort(
		(a, b) => a.orderIndex - b.orderIndex,
	)
	const phase = ordered[phaseIndex]!
	const period = rhythmPeriod(rhythmOf(phase.rhythm))
	if (period === 0 || phase.tapers) return refuse('no-easy-week')

	const phaseStart = phaseStartIndices(specs)[phaseIndex]!
	const recoveryWeekIndex = weekIndex - phaseStart
	const views = weekViews(outline)
	if (views[weekIndex]?.role === 'recovery') return refuse('no-change')

	const blockStart =
		phaseStart + Math.floor(recoveryWeekIndex / period) * period
	const blockEnd = Math.min(blockStart + period, phaseStart + phase.weeks)
	const blockKeys = Array.from({ length: blockEnd - blockStart }, (_, i) =>
		weekKeyAt(outline.startWeekKey, blockStart + i),
	)
	const previous = blockKeys.find(
		(_, i) => views[blockStart + i]?.role === 'recovery',
	)

	const after: OutlineRows = {
		...outline,
		phases: outline.phases.map((p) =>
			p.id === phase.id ? { ...p, recoveryWeekIndex } : p,
		),
	}
	return finish(outline, after, firstUnbegunWeekKey, {
		summary: {
			kind: 'easy-week',
			phaseName: phase.name,
			weekNumber: isoWeekNumber(edit.weekKey),
			previousWeekNumber: previous ? isoWeekNumber(previous) : null,
		},
		scope: new Set(blockKeys),
		held: (otherWeeksHeld) => [
			'phase-length',
			...(otherWeeksHeld ? (['other-weeks'] as const) : []),
		],
		write: { kind: 'easy-week', phaseId: phase.id, recoveryWeekIndex },
	})
}

/**
 * The diff of the two sides, the lived-week check, the warnings and the
 * digest — what every preview shares.
 *
 * `scope` is the weeks the edit is about; `held` is told whether every week
 * that changes lies inside it, which is when "the other weeks" held.
 */
function finish(
	before: OutlineRows,
	after: OutlineRows,
	firstUnbegunWeekKey: string,
	{
		summary,
		scope,
		held,
		write,
	}: {
		summary: SeasonEditSummary
		scope: Set<string> | null
		held: (otherWeeksHeld: boolean) => HeldNumber[]
		write: SeasonEditWrite
	},
): SeasonEditResult {
	const beforeViews = weekViews(before)
	const afterViews = weekViews(after)
	const beforePhases = phaseSpecs(before)
	const afterPhases = phaseSpecs(after)
	const span = Math.max(beforeViews.length, afterViews.length)

	const weeks: SeasonEditPreview['weeks'] = []
	const relayWeekKeys: string[] = []
	for (let week = 0; week < span; week++) {
		const was = beforeViews[week] ?? null
		const will = afterViews[week] ?? null
		const weekKey = weekKeyAt(before.startWeekKey, week)
		const numbers = !sameNumbers(was, will)
		const phaseMoved =
			phaseIndexForWeek(beforePhases, week) !==
			phaseIndexForWeek(afterPhases, week)
		if (!numbers && !phaseMoved && was?.phaseName === will?.phaseName) continue
		if (weekKey < firstUnbegunWeekKey && (numbers || phaseMoved)) {
			return refuse('changes-lived-weeks')
		}
		weeks.push({
			weekKey,
			weekNumber: isoWeekNumber(weekKey),
			before: was,
			after: will,
		})
		if (numbers || phaseMoved) relayWeekKeys.push(weekKey)
	}

	const touched = new Set(relayWeekKeys)
	const warnings: SeasonEditWarning[] = []
	const resolved = resolvedTracks(after)
	for (const [trackIndex, track] of after.tracks.entries()) {
		// A strength track rests on its own block's deload, not on the phase's
		// rhythm (ADR 0047 §6): its deload is its easy week, and a gap between
		// blocks is never compared, like a taper.
		const strengthRoles = resolved[trackIndex]?.strengthRoles ?? null
		const series = afterViews.map((view, week) => ({
			role:
				strengthRoles == null
					? view.role
					: strengthRoles[week] === 'loading'
						? ('loading' as const)
						: strengthRoles[week] === 'deload'
							? ('recovery' as const)
							: ('taper' as const),
			value: view.targets[trackIndex]?.value ?? null,
		}))
		for (const rise of weekRiseWarnings(series)) {
			const weekKey = weekKeyAt(after.startWeekKey, rise.weekIndex)
			const fromWeekKey = weekKeyAt(after.startWeekKey, rise.fromWeekIndex)
			if (weekKey < firstUnbegunWeekKey) continue
			if (!touched.has(weekKey) && !touched.has(fromWeekKey)) continue
			warnings.push({
				trackId: track.id,
				discipline: track.discipline as Discipline,
				currency: track.currency as VolumeCurrency,
				weekKey,
				weekNumber: isoWeekNumber(weekKey),
				fromWeekKey,
				from: rise.from,
				to: rise.to,
				rise: rise.rise,
			})
		}
	}

	const otherWeeksHeld =
		scope != null && relayWeekKeys.every((weekKey) => scope.has(weekKey))
	const heldNumbers = held(otherWeeksHeld)
	return {
		ok: true,
		kind: summary.kind,
		summary,
		weeks,
		warnings,
		held: heldNumbers,
		relayWeekKeys,
		write,
		digest: digestOf({ summary, weeks, warnings, held: heldNumbers, write }),
	}
}

/** Whether two sides of one week read the same role and the same targets. */
function sameNumbers(a: WeekView | null, b: WeekView | null): boolean {
	if (a == null || b == null) return a === b
	if (a.role !== b.role) return false
	return a.targets.every(
		(target, index) => target.value === b.targets[index]?.value,
	)
}
