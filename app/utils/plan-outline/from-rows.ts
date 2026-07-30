// Stored Plan Outline rows → the pure derivation's inputs.
//
// Kept free of Prisma types so it is testable without a database: the row shapes
// below are structural, and the query in `training.server.ts` satisfies them.

import { CARDIO_DISCIPLINES, type Discipline } from '../workout-schema.ts'
import {
	totalWeeks,
	weekTargets,
	type PhaseSpec,
	type Rhythm,
	type SegmentSpec,
	type StrengthGoal,
	type TrackSpec,
	type VolumeCurrency,
} from './derive.ts'
import { weekIndexOf } from './week-keys.ts'

export type PhaseRow = {
	id: string
	orderIndex: number
	name: string
	weeks: number
	rhythm: string
	tapers: boolean
}

export type SegmentRow = {
	kind: string
	phaseId: string | null
	ramp: number | null
	boundaryStep: number | null
	recoveryCut: number | null
	taperCut: number | null
	startWeekKey: string | null
	weeks: number | null
	goal: string | null
	sessionsPerWeek: number | null
	deloadCut: number | null
	deloadWeeks: number | null
}

export type TrackRow = {
	discipline: string
	currency: string
	anchors: Array<{ fromWeekKey: string; value: number }>
	segments: SegmentRow[]
	overrides: Array<{ weekKey: string; value: number }>
}

export type OutlineRows = {
	startWeekKey: string
	phases: PhaseRow[]
	tracks: TrackRow[]
}

/** A track's authored volume, resolved into index space with its currency. */
export type ResolvedTrack = {
	discipline: Discipline
	currency: VolumeCurrency
	/** Per plan week, earliest first, in the track's own Volume Currency. */
	targets: Array<number | null>
}

/** The phase sequence in authored order, with the fields the derivation reads. */
export function phaseSpecs(rows: OutlineRows): PhaseSpec[] {
	return orderedPhases(rows).map((phase) => ({
		weeks: phase.weeks,
		rhythm: phase.rhythm as Rhythm,
		tapers: phase.tapers,
	}))
}

/** Phase names and spans — what the Plan card's arc draws (ADR 0018). */
export function phaseArcSpecs(
	rows: OutlineRows,
): Array<{ name: string; weeks: number }> {
	return orderedPhases(rows).map((phase) => ({
		name: phase.name,
		weeks: phase.weeks,
	}))
}

function orderedPhases(rows: OutlineRows): PhaseRow[] {
	return [...rows.phases].sort((a, b) => a.orderIndex - b.orderIndex)
}

/** Every track's per-week volume, each in its own currency — never accumulated here. */
export function resolvedTracks(rows: OutlineRows): ResolvedTrack[] {
	const phases = phaseSpecs(rows)
	const phaseIndexById = new Map(
		orderedPhases(rows).map((phase, index) => [phase.id, index]),
	)

	return rows.tracks.map((track) => {
		const spec: TrackSpec = {
			currency: track.currency as VolumeCurrency,
			anchors: track.anchors.map((anchor) => ({
				fromWeekIndex: weekIndexOf(rows.startWeekKey, anchor.fromWeekKey),
				value: anchor.value,
			})),
			// Both kinds are resolved. A strength segment is no longer filtered out
			// here — ADR 0047 §1 gives it the same anchor-and-ramp progression, so what
			// it needs is a derivation walk of its own, not exclusion from the spec.
			segments: track.segments.flatMap((segment) =>
				segmentSpec(segment, rows.startWeekKey, phaseIndexById),
			),
			overrides: track.overrides.map((override) => ({
				weekIndex: weekIndexOf(rows.startWeekKey, override.weekKey),
				value: override.value,
			})),
		}

		const discipline = track.discipline as Discipline
		return {
			discipline,
			currency: track.currency as VolumeCurrency,
			targets: trackTargets(phases, spec, discipline),
		}
	})
}

/**
 * One stored segment as the derivation's input, in index space.
 *
 * A row whose positioning fields are missing yields nothing rather than a segment
 * positioned at a guess. The migration's per-kind CHECK makes that unreachable
 * from the database — an endurance segment always has a phase, a strength segment
 * always has a start week and a duration — so this is the structural narrowing of
 * two nullable columns, not a validation the schema left to be done here.
 */
function segmentSpec(
	row: SegmentRow,
	startWeekKey: string,
	phaseIndexById: Map<string, number>,
): SegmentSpec[] {
	if (row.kind === 'endurance') {
		const phaseIndex =
			row.phaseId == null ? null : phaseIndexById.get(row.phaseId)
		if (phaseIndex == null) return []
		return [
			{
				kind: 'endurance',
				phaseIndex,
				ramp: row.ramp,
				boundaryStep: row.boundaryStep,
				recoveryCut: row.recoveryCut,
				taperCut: row.taperCut,
			},
		]
	}

	if (row.kind === 'strength') {
		if (row.startWeekKey == null || row.weeks == null) return []
		return [
			{
				kind: 'strength',
				startWeekIndex: weekIndexOf(startWeekKey, row.startWeekKey),
				weeks: row.weeks,
				ramp: row.ramp,
				boundaryStep: row.boundaryStep,
				goal: row.goal as StrengthGoal | null,
				sessionsPerWeek: row.sessionsPerWeek,
				deloadCut: row.deloadCut,
				deloadWeeks: row.deloadWeeks,
			},
		]
	}

	// Unreachable from the database, where `kind` is a CHECKed vocabulary of two.
	// Falling through rather than defaulting to endurance keeps a third kind, if one
	// is ever added, from being silently priced by the wrong rule.
	return []
}

/**
 * A track's per-week volume, by the walk its Discipline progresses under.
 *
 * The Discipline is what selects the walk, not the segment kinds it happens to
 * hold: a track's currency, anchor and whole progression belong to its Discipline
 * (ADR 0043 §1), so a run track is priced by the endurance walk even if a strength
 * segment somehow sat in its spec.
 */
function trackTargets(
	phases: PhaseSpec[],
	spec: TrackSpec,
	discipline: Discipline,
): Array<number | null> {
	const isEndurance = (CARDIO_DISCIPLINES as readonly Discipline[]).includes(
		discipline,
	)
	return isEndurance
		? weekTargets(phases, spec)
		: strengthWeekTargets(phases, spec)
}

/**
 * A strength track's per-week volume — **the hole this prefactor leaves open**,
 * named and typed so the strength ticket fills a body rather than finds a seam.
 *
 * ADR 0047 §1 gives a strength track the same Season Anchor and the same Volume
 * Ramp an endurance one has, so the arithmetic is `weekTarget`'s. What it does not
 * share is the two things this walk has to supply: its segments are positioned by
 * their own dates rather than addressed by `phaseIndex`, and its week roles come
 * from a `deloadWeeks` tail closing each segment rather than from the phase rhythm,
 * which it ignores entirely (ADR 0047 §6, ADR 0044 §4). A week inside the plan but
 * outside every strength segment derives `0` — "no lifting these weeks" is a
 * positive statement — where `null` keeps meaning no anchor in force or a week
 * outside the plan.
 *
 * Until it is written every week is Unavailable, and the distinction that matters
 * is *why*: `_spec` already carries the track's anchors and its strength segments,
 * resolved and in index space, and loses its underscore the moment it is read.
 * Nothing was filtered away; nothing has read it yet.
 */
function strengthWeekTargets(
	phases: PhaseSpec[],
	_spec: TrackSpec,
): Array<number | null> {
	return Array.from({ length: totalWeeks(phases) }, () => null)
}
