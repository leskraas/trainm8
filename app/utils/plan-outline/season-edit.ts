// _Sesong_ edits, version 1 (#505 stories 72–77): a week's target (or back to
// the plan's own), a phase's name, length and rhythm, which week of a block is
// the easy one, and a track's **Season Anchor** (#673, ADR 0121) — each worked
// out
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
import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import { MAX_PLAN_WEEKS } from './authoring-schema.ts'
import {
	phaseIndexForWeek,
	phaseStartIndices,
	rhythmOf,
	rhythmPeriod,
	rampLevelAt,
	roundToCurrency,
	totalWeeks,
	weekTargetDerivation,
	type Rhythm,
	type VolumeCurrency,
	type WeekRole,
	type WeekTargetDerivation,
} from './derive.ts'
import {
	phaseSpecs,
	resolvedTracks,
	trackSpec,
	type OutlineRows,
} from './from-rows.ts'
import {
	digestOf,
	riseWarnings,
	weekViews,
	type RiseWarning,
	type WeekView,
} from './outline-preview.ts'
import {
	anchorInForceAt,
	earliestAnchor,
	editAnchorList,
	sortedAnchors,
} from './season-anchors.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'

export const SEASON_EDIT_KINDS = [
	'season-anchor',
	'week-target',
	'phase',
	'easy-week',
] as const
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
	| SeasonAnchorEdit

/**
 * A track's **Season Anchor** changed (ADR 0121 §1): a fresh start from a week
 * (`add`), a segment's value (`set`, the segment named by its week), or a
 * re-anchor taken back (`remove`, never the earliest).
 */
export type SeasonAnchorEdit =
	| {
			kind: 'season-anchor'
			trackId: string
			action: 'add' | 'set'
			fromWeekKey: string
			value: number
	  }
	| {
			kind: 'season-anchor'
			trackId: string
			action: 'remove'
			fromWeekKey: string
	  }

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
	 * A segment's value changed where the segment is in force at a week already
	 * begun. The refusal carries the fresh start to offer instead, when there
	 * is one (`SeasonEditRefused.offer`).
	 */
	| 'segment-lived'
	/** The season's first Season Anchor can be changed, never removed. */
	| 'earliest-anchor'
	| 'anchor-not-found'
	/** A track's first Season Anchor is added under _Avansert_ (ADR 0121 §3). */
	| 'no-season-anchor'
	/** Strength and the Simple Activities' track have no Season Anchor edit. */
	| 'not-endurance-track'

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
	/** A Season Anchor edit's span (ADR 0121 §4). */
	'phases',
	/** The weeks before the edit's own week, which the summary carries. */
	'weeks-before',
	'other-tracks',
	'hand-set-weeks',
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
	| {
			kind: 'season-anchor'
			trackId: string
			discipline: Discipline
			currency: VolumeCurrency
			/** What the edit does to the list: an `add` on a held week is a `set`. */
			act: 'add' | 'set' | 'remove'
			/** An `add` that landed on a week that already had a segment. */
			merged: boolean
			/** The segment's week — the edit's own week, which `weeks-before` names. */
			weekKey: string
			weekNumber: number
			/** The segment's value before, or null for a new one. */
			before: number | null
			/** Its value after, or null when it is removed. */
			after: number | null
			/** How many weeks get a new target. */
			changedWeeks: number
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
	/** `value: null` deletes the segment on `(trackId, fromWeekKey)`. */
	| {
			kind: 'season-anchor'
			trackId: string
			fromWeekKey: string
			value: number | null
	  }

/**
 * A **Week Volume Override** an edit leaves as it is while the rule under it
 * moves (ADR 0044 §5): its week keeps the athlete's number and is not laid
 * again, and the preview lists it as held — a revert would now restore the
 * new number.
 */
export type HeldWeek = {
	trackId: string
	weekKey: string
	weekNumber: number
	currency: VolumeCurrency
	value: number
}

/**
 * How a changed, derived after-value was worked out — `derive.ts`'s own walk,
 * with the anchor's week and the reference week as keys.
 */
export type SeasonEditDerivation = Omit<
	WeekTargetDerivation,
	'anchor' | 'referenceWeekIndex' | 'ramps' | 'boundarySteps'
> & {
	anchor: { weekKey: string; weekNumber: number; value: number }
	/** The loading week an easy or taper week is cut from. */
	reference: { weekKey: string; weekNumber: number }
	ramps: Array<{ phaseName: string; loadingWeeks: number; ramp: number }>
	boundarySteps: Array<{ phaseName: string; step: number }>
}

/** A loading week the edit would raise more than 10 % over the one before. */
export type SeasonEditWarning = RiseWarning

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
		/**
		 * Per track, as `after.targets`: how a changed, derived after-value was
		 * worked out, or null where it is hand-set, unchanged or not derived by
		 * the endurance walk.
		 */
		derivations: Array<SeasonEditDerivation | null>
	}>
	warnings: SeasonEditWarning[]
	held: HeldNumber[]
	/** Week Volume Overrides the edit holds while the rule under them moves. */
	heldWeeks: HeldWeek[]
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

export type SeasonEditRefused = {
	ok: false
	reason: SeasonEditRefusal
	/**
	 * The edit to make instead, built by the domain beside the rule that
	 * refused (ADR 0121 §1): on `segment-lived`, a fresh start from the first
	 * unbegun week with the typed value.
	 */
	offer?: SeasonAnchorEdit
}

export type SeasonEditResult = SeasonEditPreview | SeasonEditRefused

type Refusal = SeasonEditRefused
const refuse = (
	reason: SeasonEditRefusal,
	offer?: SeasonAnchorEdit,
): Refusal => (offer ? { ok: false, reason, offer } : { ok: false, reason })

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
		case 'season-anchor':
			return previewSeasonAnchor(outline, edit, firstUnbegunWeekKey)
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
 * What _Endre startnivået_ offers for one track (ADR 0121): its segments, and
 * the weeks a fresh start may be picked from — each with its role, its target
 * and the **Volume Ramp**'s level there, the pre-fill (§2). Computed here, by
 * `derive.ts`, so the page never divides by a role factor itself.
 */
export type SeasonAnchorChoice = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	/** Earliest first. `inPlan` is false for one a shorter plan left behind. */
	anchors: Array<{
		fromWeekKey: string
		value: number
		earliest: boolean
		inPlan: boolean
		/**
		 * Whether _Fjern_ may offer it: the list lets it go (never the
		 * earliest) and it starts on or after the first unbegun week, so taking
		 * it back moves no week already begun.
		 */
		removable: boolean
	}>
	/** From the first unbegun week to the plan's end. */
	weeks: Array<{
		weekKey: string
		role: WeekRole
		target: number | null
		overridden: boolean
		/** The ramp's level here: what a fresh start from this week is pre-filled with. */
		level: number | null
	}>
}

/**
 * Every track the Season Anchor edit takes — a cardio track with a Season
 * Anchor (ADR 0121 §1) — with its choices, in the plan's track order.
 */
export function seasonAnchorChoices(
	outline: OutlineRows,
	firstUnbegunWeekKey: string,
): SeasonAnchorChoice[] {
	const phases = phaseSpecs(outline)
	const season = totalWeeks(phases)
	const resolved = resolvedTracks(outline)
	const views = weekViews(outline)
	const from = Math.max(
		0,
		weekIndexOf(outline.startWeekKey, firstUnbegunWeekKey),
	)
	return outline.tracks.flatMap((track, trackIndex) => {
		if (!isCardioDiscipline(track.discipline as Discipline)) return []
		if (track.anchors.length === 0) return []
		const spec = trackSpec(outline, track)
		const earliest = earliestAnchor(track.anchors)
		return [
			{
				trackId: track.id,
				discipline: track.discipline as Discipline,
				currency: track.currency as VolumeCurrency,
				anchors: sortedAnchors(track.anchors).map((anchor) => {
					const index = weekIndexOf(outline.startWeekKey, anchor.fromWeekKey)
					return {
						fromWeekKey: anchor.fromWeekKey,
						value: anchor.value,
						earliest: anchor === earliest,
						inPlan: index >= 0 && index < season,
						removable:
							anchor.fromWeekKey >= firstUnbegunWeekKey &&
							editAnchorList(track.anchors, {
								action: 'remove',
								fromWeekKey: anchor.fromWeekKey,
							}).ok,
					}
				}),
				weeks: Array.from({ length: Math.max(0, season - from) }, (_, i) => {
					const week = from + i
					const target = resolved[trackIndex]!.targets[week]
					return {
						weekKey: weekKeyAt(outline.startWeekKey, week),
						role: views[week]!.role,
						target: target?.value ?? null,
						overridden: target?.overridden ?? false,
						level: rampLevelAt(phases, spec, week),
					}
				}),
			},
		]
	})
}

/**
 * Change a track's **Season Anchor** (#673, ADR 0121 §1): a fresh start from a
 * week, a segment's value, or a re-anchor taken back. Every week after the
 * segment's own week is derived from it, so the preview is the season from
 * there: each week whose target moves, and each hand-set week whose rule moved
 * under it, held.
 *
 * Weeks already begun never move: a fresh start before the first unbegun week
 * is `week-lived`, a value change on a segment in force at a begun week is
 * `segment-lived` (offering the fresh start from the first unbegun week with
 * the typed value, while that segment is still in force there), and a remove
 * that would move a begun week falls to `finish`'s `changes-lived-weeks`.
 */
export function previewSeasonAnchor(
	outline: OutlineRows,
	edit: SeasonAnchorEdit,
	firstUnbegunWeekKey: string,
): SeasonEditResult {
	const track = outline.tracks.find((t) => t.id === edit.trackId)
	if (!track) return refuse('track-not-found')
	// The Simple Activities' `other` track lays the hours its fixed days give,
	// changed in Meg (ADR 0109); strength progresses by its own blocks.
	if (!isCardioDiscipline(track.discipline as Discipline)) {
		return refuse('not-endurance-track')
	}
	if (track.anchors.length === 0) return refuse('no-season-anchor')

	const season = totalWeeks(phaseSpecs(outline))
	const inPlan = (weekKey: string) => {
		const index = weekIndexOf(outline.startWeekKey, weekKey)
		return index >= 0 && index < season
	}
	if (edit.action === 'add') {
		if (!inPlan(edit.fromWeekKey)) return refuse('week-outside-plan')
		if (edit.fromWeekKey < firstUnbegunWeekKey) return refuse('week-lived')
	}
	if (edit.action === 'set') {
		const segment = track.anchors.find(
			(anchor) => anchor.fromWeekKey === edit.fromWeekKey,
		)
		if (!segment) return refuse('anchor-not-found')
		if (edit.fromWeekKey < firstUnbegunWeekKey) {
			// Still in force at the first unbegun week, inside the plan: the same
			// number from there on is a fresh start, which leaves the lived weeks.
			const stillInForce =
				inPlan(firstUnbegunWeekKey) &&
				anchorInForceAt(track.anchors, firstUnbegunWeekKey) === segment
			return refuse(
				'segment-lived',
				stillInForce
					? {
							kind: 'season-anchor',
							trackId: track.id,
							action: 'add',
							fromWeekKey: firstUnbegunWeekKey,
							value: edit.value,
						}
					: undefined,
			)
		}
	}

	const edited = editAnchorList(track.anchors, edit)
	if (!edited.ok) return refuse(edited.reason)
	const after: OutlineRows = {
		...outline,
		tracks: outline.tracks.map((t) =>
			t.id === track.id ? { ...t, anchors: edited.anchors } : t,
		),
	}

	// A hand-set week keeps its number, so its week does not change; the
	// preview names each one whose rule underneath moved.
	const trackIndex = outline.tracks.indexOf(track)
	const derivedBefore = resolvedTracks(outline)[trackIndex]!.targets
	const derivedAfter = resolvedTracks(after)[trackIndex]!.targets
	const heldWeeks: HeldWeek[] = track.overrides
		.flatMap((override) => {
			const index = weekIndexOf(outline.startWeekKey, override.weekKey)
			const was = derivedBefore[index]
			const will = derivedAfter[index]
			const currency = track.currency as VolumeCurrency
			if (
				!was ||
				!will ||
				sameFigure(was.derivedValue, will.derivedValue, currency)
			) {
				return []
			}
			return [
				{
					trackId: track.id,
					weekKey: override.weekKey,
					weekNumber: isoWeekNumber(override.weekKey),
					currency: track.currency as VolumeCurrency,
					value: override.value,
				},
			]
		})
		.sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1))

	const result = finish(outline, after, firstUnbegunWeekKey, {
		summary: {
			kind: 'season-anchor',
			trackId: track.id,
			discipline: track.discipline as Discipline,
			currency: track.currency as VolumeCurrency,
			act: edited.act,
			merged: edited.merged,
			weekKey: edit.fromWeekKey,
			weekNumber: isoWeekNumber(edit.fromWeekKey),
			before: edited.before,
			after: edit.action === 'remove' ? null : edit.value,
			changedWeeks: 0,
		},
		scope: null,
		held: () => [
			'phases',
			'weeks-before',
			...(outline.tracks.length > 1 ? (['other-tracks'] as const) : []),
			...(heldWeeks.length > 0 ? (['hand-set-weeks'] as const) : []),
		],
		heldWeeks,
		write: {
			kind: 'season-anchor',
			trackId: track.id,
			fromWeekKey: edit.fromWeekKey,
			value: edit.action === 'remove' ? null : edit.value,
		},
	})
	if (result.ok && result.weeks.length === 0 && heldWeeks.length === 0) {
		return refuse('no-change')
	}
	return result
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
		heldWeeks = [],
		write,
	}: {
		summary: SeasonEditSummary
		scope: Set<string> | null
		held: (otherWeeksHeld: boolean) => HeldNumber[]
		heldWeeks?: HeldWeek[]
		write: SeasonEditWrite
	},
): SeasonEditResult {
	const beforeViews = weekViews(before)
	const afterViews = weekViews(after)
	const beforePhases = phaseSpecs(before)
	const afterPhases = phaseSpecs(after)
	const derivationOf = derivationsFor(after)
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
			derivations: (will?.targets ?? []).map((target, trackIndex) =>
				target.overridden ||
				target.value == null ||
				sameFigure(
					target.value,
					was?.targets[trackIndex]?.value ?? null,
					target.currency,
				)
					? null
					: derivationOf(trackIndex, week),
			),
		})
		if (numbers || phaseMoved) relayWeekKeys.push(weekKey)
	}

	const touched = new Set(relayWeekKeys)
	const warnings: SeasonEditWarning[] = riseWarnings(
		after,
		afterViews,
		(weekKey, fromWeekKey) =>
			weekKey >= firstUnbegunWeekKey &&
			(touched.has(weekKey) || touched.has(fromWeekKey)),
	)

	const otherWeeksHeld =
		scope != null && relayWeekKeys.every((weekKey) => scope.has(weekKey))
	const heldNumbers = held(otherWeeksHeld)
	const counted: SeasonEditSummary =
		summary.kind === 'season-anchor'
			? { ...summary, changedWeeks: relayWeekKeys.length }
			: summary
	return {
		ok: true,
		kind: counted.kind,
		summary: counted,
		weeks,
		warnings,
		held: heldNumbers,
		heldWeeks,
		relayWeekKeys,
		write,
		digest: digestOf({
			summary: counted,
			weeks,
			warnings,
			held: heldNumbers,
			heldWeeks,
			write,
		}),
	}
}

/**
 * How each track's derived target in `rows` was worked out, by the endurance
 * walk that priced it; null for a track the strength walk prices or the
 * Simple Activities' flat one, whose derivation is not this walk's.
 */
function derivationsFor(rows: OutlineRows) {
	const phases = phaseSpecs(rows)
	const ordered = [...rows.phases].sort((a, b) => a.orderIndex - b.orderIndex)
	const nameOf = (phaseIndex: number) => ordered[phaseIndex]?.name ?? ''
	const keyAt = (index: number) => weekKeyAt(rows.startWeekKey, index)
	return (trackIndex: number, week: number): SeasonEditDerivation | null => {
		const track = rows.tracks[trackIndex]
		if (!track || !isCardioDiscipline(track.discipline as Discipline)) {
			return null
		}
		const derivation = weekTargetDerivation(
			phases,
			trackSpec(rows, track),
			week,
		)
		if (!derivation) return null
		const anchorKey = keyAt(derivation.anchor.fromWeekIndex)
		const referenceKey = keyAt(derivation.referenceWeekIndex)
		return {
			value: derivation.value,
			role: derivation.role satisfies WeekRole,
			factor: derivation.factor,
			anchor: {
				weekKey: anchorKey,
				weekNumber: isoWeekNumber(anchorKey),
				value: derivation.anchor.value,
			},
			reference: {
				weekKey: referenceKey,
				weekNumber: isoWeekNumber(referenceKey),
			},
			ramps: derivation.ramps.map((ramp) => ({
				phaseName: nameOf(ramp.phaseIndex),
				loadingWeeks: ramp.loadingWeeks,
				ramp: ramp.ramp,
			})),
			boundarySteps: derivation.boundarySteps.map((step) => ({
				phaseName: nameOf(step.phaseIndex),
				step: step.step,
			})),
		}
	}
}

/**
 * Whether two sides of one week read the same role and the same targets — at
 * each currency's precision, the figure the athlete reads: a re-anchor at the
 * ramp's level reproduces the weeks after it up to floating point, and a
 * difference no figure shows is no change to preview or lay again.
 */
function sameNumbers(a: WeekView | null, b: WeekView | null): boolean {
	if (a == null || b == null) return a === b
	if (a.role !== b.role) return false
	// A week turning hand-set (or back) is a change even when its figure reads
	// the same: the confirm writes or deletes a Week Volume Override there.
	return a.targets.every(
		(target, index) =>
			target.overridden === (b.targets[index]?.overridden ?? false) &&
			sameFigure(
				target.value,
				b.targets[index]?.value ?? null,
				target.currency,
			),
	)
}

/** Two targets that read as one figure in `currency`. */
function sameFigure(
	a: number | null,
	b: number | null,
	currency: VolumeCurrency,
): boolean {
	if (a == null || b == null) return a === b
	return roundToCurrency(a, currency) === roundToCurrency(b, currency)
}
