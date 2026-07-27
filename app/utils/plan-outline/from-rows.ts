// Stored Plan Outline rows → the pure derivation's inputs.
//
// Kept free of Prisma types so it is testable without a database: the row shapes
// below are structural, and the query in `training.server.ts` satisfies them.

import { CARDIO_DISCIPLINES, type Discipline } from '../workout-schema.ts'
import {
	weekTargets,
	type PhaseSpec,
	type Rhythm,
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
			// Only endurance segments carry the rate rule; a strength segment
			// interpolates between Volume Landmarks instead (ADR 0041 §4), and those
			// landmarks are athlete attributes this schema does not yet carry.
			segments: track.segments
				.filter((segment) => segment.kind === 'endurance' && segment.phaseId != null)
				.flatMap((segment) => {
					const phaseIndex = phaseIndexById.get(segment.phaseId!)
					return phaseIndex == null
						? []
						: [
								{
									phaseIndex,
									ramp: segment.ramp,
									boundaryStep: segment.boundaryStep,
									recoveryCut: segment.recoveryCut,
									taperCut: segment.taperCut,
								},
							]
				}),
			overrides: track.overrides.map((override) => ({
				weekIndex: weekIndexOf(rows.startWeekKey, override.weekKey),
				value: override.value,
			})),
		}

		const isEndurance = (CARDIO_DISCIPLINES as readonly string[]).includes(
			track.discipline,
		)
		return {
			discipline: track.discipline as Discipline,
			currency: track.currency as VolumeCurrency,
			// A strength track has no rate rule to replay, so its weeks are
			// Unavailable rather than derived from an endurance formula.
			targets: isEndurance
				? weekTargets(phases, spec)
				: weekTargets(phases, spec).map(() => null),
		}
	})
}
