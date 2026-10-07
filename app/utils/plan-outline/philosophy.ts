// Switching a plan's **philosophy** — its Periodization Preset family — mid
// season (#505 stories 12–14, ADR 0079): what the plan runs from the first
// week not yet begun, worked out before anything is written, so the preview
// the athlete approves and the edit that lands are one computation.
//
// The rule, in one sentence: **weeks already begun stay as they were lived, and
// the plan from the first unbegun week on is the new family's.** The week being
// lived is begun (on a Monday nothing has been trained on yet it is not, and it
// switches too), so the phase it sits in is cut to the weeks lived and the new
// family's blocks follow it:
//
//   - **An open-ended plan** gets one round of the new family (`openEndedRound`)
//     — its rhythm, its climb and its **Quality Session Mix**. Later rounds
//     carry that round on, as every appended round does.
//   - **A plan toward an Event** gets the new family's season fitted to the
//     weeks left, ending on the Event's week (`fitRunUp`, the Season Fit rule:
//     the taper is never touched, the earliest block gives first). While the
//     plan is still in its opening block that is the family's whole season,
//     its base included; past it, the base has been lived, so it is the run-up
//     after the base (`familyRunUp`), as an open-ended plan gaining an Event
//     gets.
//
// Pure: stored rows in, the new rows and a diff out. The week targets on both
// sides come from `resolvedTracks` — the derivation every surface reads — run
// over the rows as they are and as they would be, so the preview cannot promise
// a number the plan does not then derive. The athlete's sessions are not in
// here at all — the preview shows targets, not sessions: which sessions stay
// is the clearing gate's rule, applied after the edit, and a week holding one
// of the athlete's sessions is laid around it (`relayPlanFrom`), so its
// target is met by their session plus the plan's (`philosophy.server.ts`).

import { openEndedRoundName } from '../labels.ts'
import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import {
	phaseIndexForWeek,
	phaseStartIndices,
	rhythmOf,
	weekRole,
	type Rhythm,
	type VolumeCurrency,
	type WeekRole,
} from './derive.ts'
import { fitRunUp } from './fit-proposal.ts'
import {
	phaseSpecs,
	resolvedTracks,
	type OutlineRows,
	type PhaseRow,
	type SegmentRow,
} from './from-rows.ts'
import {
	familyRunUp,
	familySeason,
	openEndedRound,
	outlineFamily,
	type PresetFamily,
} from './presets.ts'
import { type QualitySessionMixEntry } from './quality-mix.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'

/** A plan as a switch reads it: its rows, the family it records, its Event. */
export type PhilosophyOutline = OutlineRows & {
	/** `PlanOutline.family` as stored; null for a plan that records none. */
	family: string | null
	/** The Monday of the Event's week, or null for an open-ended plan. */
	eventWeekKey: string | null
}

/** A phase the new family lays, as it is written. */
export type LaidPhase = {
	name: string
	weeks: number
	rhythm: Rhythm
	tapers: boolean
	ramp: number | null
	boundaryStep: number | null
	mix: QualitySessionMixEntry[]
}

/** One phase as the preview shows it, from the switch's first week on. */
export type PhaseView = {
	name: string
	/** The weeks of it from `fromWeekKey` on — a phase being lived counts its rest. */
	weeks: number
	fromWeekKey: string
	rhythm: Rhythm
	tapers: boolean
	/** The first endurance track's mix over this phase; `[]` is "no quality sessions". */
	mix: QualitySessionMixEntry[]
}

/** One track's target in one week. */
export type TargetView = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	/** In the track's own currency; null is an Unavailable week. */
	value: number | null
}

/** One week as the plan reads it on one side of the switch. */
export type WeekView = {
	phaseName: string
	role: WeekRole
	targets: TargetView[]
}

export type PhilosophySwitchRefusal =
	/** The plan already follows this family; a switch would change nothing. */
	| 'same-family'
	/** No week is left before the Event to lay the new family into. */
	| 'event-too-soon'
	/** A plan with no phases has nothing to switch. */
	| 'no-phases'

export type PhilosophySwitchPreview = {
	ok: true
	/** The family the plan follows now, or null where it reads as none. */
	from: PresetFamily | null
	to: PresetFamily
	/** The first week the switch changes: the first not yet begun. */
	fromWeekKey: string
	/** What the plan runs from `fromWeekKey` on, before and after. */
	phases: { before: PhaseView[]; after: PhaseView[] }
	/**
	 * Week by week from `fromWeekKey` to the later of the two ends: what each
	 * side reads, or null on a side whose plan has ended by then.
	 */
	weeks: Array<{
		weekKey: string
		before: WeekView | null
		after: WeekView | null
	}>
	/**
	 * A fingerprint of everything above and of the edit: the confirm posts it
	 * back, so the switch applied is the one the athlete saw.
	 */
	digest: string
	/**
	 * The edit that makes it so, applied as given (`switchPhilosophy`): the
	 * phases kept at a new length, the ones removed, the ones laid after them.
	 */
	edit: {
		resize: Array<{ phaseId: string; weeks: number }>
		remove: string[]
		add: LaidPhase[]
	}
	/** The rows as they will be, for a caller that reads them on. */
	rows: OutlineRows
}

export type PhilosophySwitchResult =
	| PhilosophySwitchPreview
	| { ok: false; reason: PhilosophySwitchRefusal }

/** Prefix of the ids a preview gives the rows it has not written yet. */
const PREVIEW_ID = 'preview:'

/**
 * What switching `outline` to `family` would do, from `firstUnbegunWeekKey` —
 * today's first week not yet begun, as the server reads it
 * (`readFirstUnbegunWeekKey`: past its Monday, or trained in, a week is
 * begun). Pure — and the one computation both the preview and the apply run.
 */
export function previewPhilosophySwitch(
	outline: PhilosophyOutline,
	family: PresetFamily,
	firstUnbegunWeekKey: string,
): PhilosophySwitchResult {
	const ordered = [...outline.phases].sort(
		(a, b) => a.orderIndex - b.orderIndex,
	)
	const last = ordered.at(-1)
	if (!last) return { ok: false, reason: 'no-phases' }
	const from = outlineFamily(outline.family, rhythmOf(last.rhythm))
	if (from === family) return { ok: false, reason: 'same-family' }

	const specs = phaseSpecs(outline)
	const starts = phaseStartIndices(specs)
	const total = specs.reduce((sum, phase) => sum + phase.weeks, 0)
	// The first week the switch may change; before the plan opens, its first.
	const boundary = Math.max(
		0,
		weekIndexOf(outline.startWeekKey, firstUnbegunWeekKey),
	)

	// The phases kept: every one wholly behind the boundary, and the one it
	// falls in cut to the weeks before it. Past the plan's end, the last phase
	// runs on over the weeks lived since, so the plan stays contiguous.
	const resize: Array<{ phaseId: string; weeks: number }> = []
	const remove: string[] = []
	const kept: PhaseRow[] = []
	if (boundary >= total) {
		kept.push(...ordered)
		if (boundary > total) {
			resize.push({ phaseId: last.id, weeks: last.weeks + boundary - total })
		}
	} else {
		const cutIndex = phaseIndexForWeek(specs, boundary) ?? 0
		const lived = boundary - (starts[cutIndex] ?? 0)
		ordered.forEach((phase, index) => {
			if (index < cutIndex) kept.push(phase)
			else if (index === cutIndex && lived > 0) {
				kept.push(phase)
				resize.push({ phaseId: phase.id, weeks: lived })
			} else remove.push(phase.id)
		})
	}

	let add: LaidPhase[]
	if (outline.eventWeekKey == null) {
		const round = openEndedRound(family)
		add = [
			{
				name: openEndedRoundName(kept.length + 1),
				weeks: round.weeks,
				rhythm: round.rhythm,
				tapers: false,
				ramp: round.ramp,
				boundaryStep: round.boundaryStep,
				mix: round.mix,
			},
		]
	} else {
		const weeksLeft =
			weekIndexOf(outline.startWeekKey, outline.eventWeekKey) - boundary + 1
		const inOpeningBlock = boundary < (specs[0]?.weeks ?? 0)
		const fitted = fitRunUp(
			inOpeningBlock ? familySeason(family) : familyRunUp(family),
			weeksLeft,
		)
		if (!fitted) return { ok: false, reason: 'event-too-soon' }
		add = fitted.map((phase) => ({
			name: phase.name,
			weeks: phase.weeks,
			rhythm: phase.rhythm,
			tapers: phase.tapers,
			ramp: phase.ramp,
			// A block the season opens with steps from nothing; one laid after a
			// kept phase steps as its family says.
			boundaryStep: phase.boundaryStep,
			mix: phase.mix,
		}))
	}

	const rows = rowsAfter(outline, kept, resize, remove, add)
	const fromWeekKey = weekKeyAt(outline.startWeekKey, boundary)
	const beforeWeeks = weekViews(outline)
	const afterWeeks = weekViews(rows)
	const span = Math.max(beforeWeeks.length, afterWeeks.length)

	const phases = {
		before: phaseViews(outline, boundary),
		after: phaseViews(rows, boundary),
	}
	const weeks = Array.from(
		{ length: Math.max(0, span - boundary) },
		(_, i) => ({
			weekKey: weekKeyAt(outline.startWeekKey, boundary + i),
			before: beforeWeeks[boundary + i] ?? null,
			after: afterWeeks[boundary + i] ?? null,
		}),
	)
	const edit = { resize, remove, add }
	return {
		ok: true,
		from,
		to: family,
		fromWeekKey,
		phases,
		weeks,
		digest: digestOf({ from, to: family, fromWeekKey, phases, weeks, edit }),
		edit,
		rows,
	}
}

/**
 * A short fingerprint of what a preview showed and the edit behind it. The
 * confirm posts it back, and the apply refuses when the switch it would make
 * now has a different one — a plan edited, or a week begun, since the athlete
 * looked (`preview-stale`).
 */
function digestOf(value: unknown): string {
	// FNV-1a over the JSON: stable across server and tests, and only ever
	// compared with itself.
	let hash = 0x811c9dc5
	for (const char of JSON.stringify(value)) {
		hash ^= char.codePointAt(0)!
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}

/** The rows as the edit leaves them, the new ones under preview ids. */
function rowsAfter(
	outline: PhilosophyOutline,
	kept: PhaseRow[],
	resize: Array<{ phaseId: string; weeks: number }>,
	remove: string[],
	add: LaidPhase[],
): OutlineRows {
	const resized = new Map(resize.map((r) => [r.phaseId, r.weeks]))
	const laid = add.map((phase, index) => ({
		id: `${PREVIEW_ID}phase-${index}`,
		orderIndex: kept.length + index,
		name: phase.name,
		weeks: phase.weeks,
		rhythm: phase.rhythm,
		tapers: phase.tapers,
	}))
	return {
		startWeekKey: outline.startWeekKey,
		phases: [
			...kept.map((phase, orderIndex) => ({
				...phase,
				orderIndex,
				weeks: resized.get(phase.id) ?? phase.weeks,
			})),
			...laid,
		],
		tracks: outline.tracks.map((track) => ({
			...track,
			segments: [
				// A strength segment floats free of the phases (ADR 0047 §6) and
				// stays; an endurance one goes with its phase.
				...track.segments.filter(
					(segment) =>
						segment.phaseId == null || !remove.includes(segment.phaseId),
				),
				...(isCardioDiscipline(track.discipline as Discipline)
					? laid.map(
							(phase, index): SegmentRow => ({
								id: `${PREVIEW_ID}${track.id}-${index}`,
								kind: 'endurance',
								phaseId: phase.id,
								ramp: add[index]!.ramp,
								boundaryStep: add[index]!.boundaryStep,
								recoveryCut: null,
								taperCut: null,
								startWeekKey: null,
								weeks: null,
								goal: null,
								sessionsPerWeek: null,
								deloadCut: null,
								deloadWeeks: null,
								mix: add[index]!.mix,
							}),
						)
					: []),
			],
		})),
	}
}

/** The phases that reach `boundary` or later, counted from it. */
function phaseViews(rows: OutlineRows, boundary: number): PhaseView[] {
	const ordered = [...rows.phases].sort((a, b) => a.orderIndex - b.orderIndex)
	const starts = phaseStartIndices(phaseSpecs(rows))
	const mixTrack = rows.tracks.find((track) =>
		isCardioDiscipline(track.discipline as Discipline),
	)
	return ordered.flatMap((phase, index) => {
		const start = starts[index] ?? 0
		const end = start + phase.weeks
		if (end <= boundary) return []
		const opens = Math.max(start, boundary)
		const segment = mixTrack?.segments.find(
			(s) => s.kind === 'endurance' && s.phaseId === phase.id,
		)
		return [
			{
				name: phase.name,
				weeks: end - opens,
				fromWeekKey: weekKeyAt(rows.startWeekKey, opens),
				rhythm: rhythmOf(phase.rhythm),
				tapers: phase.tapers,
				mix: [...(segment?.mix ?? [])]
					.sort((a, b) => a.zone - b.zone)
					.map((entry) => ({
						zone: entry.zone as QualitySessionMixEntry['zone'],
						sessionsPerWeek: entry.sessionsPerWeek,
					})),
			},
		]
	})
}

/** Every week of the plan as the derivation reads it. */
function weekViews(rows: OutlineRows): WeekView[] {
	const specs = phaseSpecs(rows)
	const ordered = [...rows.phases].sort((a, b) => a.orderIndex - b.orderIndex)
	const tracks = resolvedTracks(rows)
	const total = specs.reduce((sum, phase) => sum + phase.weeks, 0)
	return Array.from({ length: total }, (_, week) => ({
		phaseName: ordered[phaseIndexForWeek(specs, week) ?? 0]?.name ?? '',
		role: weekRole(specs, week),
		targets: tracks.map((track) => ({
			trackId: track.trackId,
			discipline: track.discipline,
			currency: track.currency,
			value: track.targets[week]?.value ?? null,
		})),
	}))
}
