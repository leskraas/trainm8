// Stored Plan Outline rows → the pure derivation's inputs.
//
// Kept free of Prisma types so it is testable without a database: the row shapes
// below are structural, and the query in `training.server.ts` satisfies them.

import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import {
	totalWeeks,
	weekTargets,
	type EnduranceSegmentSpec,
	type PhaseSpec,
	type Rhythm,
	type SegmentSpec,
	type StrengthGoal,
	type TrackSpec,
	type VolumeCurrency,
} from './derive.ts'
import { isQualityZone, type QualitySessionMixEntry } from './quality-mix.ts'
import { rampWarnings, type RampWarning } from './ramp-guard.ts'
import {
	seasonSpan,
	seasonTotal,
	type SeasonSpanReading,
} from './season-span.ts'
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
	id: string
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
	/**
	 * The segment's stored **Quality Session Mix** rows — zone and count, one row per
	 * zone. No rows is an *empty mix*: the positive statement that the segment has no
	 * quality sessions, never "unknown" (ADR 0042 §6).
	 *
	 * `zone` is a plain `number` here because a row is a row: this module describes
	 * what the query returns, and narrowing to the 3–5 vocabulary is
	 * `segmentReading`'s job.
	 */
	mix: Array<{ zone: number; sessionsPerWeek: number }>
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

/**
 * One endurance segment as the surfaces read it: the segment's own id — the handle
 * the authoring service needs — beside the four rates it authors.
 *
 * `null` on a rate is the athlete choosing the **documented convention**, and the
 * surface must render it as that rather than as the convention's number, so a
 * convention that moves later cannot look like an edit to the athlete's plan
 * (ADR 0044 §4).
 */
export type SegmentReading = {
	segmentId: string
	/** Which phase this segment spans, 0-based — the 1:1 of ADR 0042 §8. */
	phaseIndex: number
	ramp: number | null
	boundaryStep: number | null
	recoveryCut: number | null
	taperCut: number | null
	/**
	 * The segment's **Quality Session Mix**, ascending by zone: the second authored
	 * axis beside volume (ADR 0042 §3), from which the **Quality Session Count** and
	 * the emphasis label are derived rather than stored (§4, §5).
	 *
	 * `[]` is an empty mix — "no quality sessions in this segment" — and is a reading
	 * of what was authored, not a missing value (ADR 0042 §6).
	 */
	mix: QualitySessionMixEntry[]
}

/** A track's authored volume, resolved into index space with its currency. */
export type ResolvedTrack = {
	discipline: Discipline
	currency: VolumeCurrency
	/** Per plan week, earliest first, in the track's own Volume Currency. */
	targets: Array<number | null>
	/** The authored progression, one entry per phase this track has a segment for. */
	segments: SegmentReading[]
	/** `anchor → peak loading week`, the season's headline (ADR 0043). */
	span: SeasonSpanReading | null
	/** Every week summed — the secondary figure beside the span, never the headline. */
	total: number | null
	/** Where the authored progression is steeper than the convention (ADR 0040 §12). */
	warnings: RampWarning[]
}

/** The phase sequence in authored order, with the fields the derivation reads. */
export function phaseSpecs(rows: OutlineRows): PhaseSpec[] {
	return orderedPhases(rows).map((phase) => ({
		weeks: phase.weeks,
		rhythm: phase.rhythm as Rhythm,
		tapers: phase.tapers,
	}))
}

/** A phase as the surfaces read it: everything it stores, and no dates. */
export type PhaseReading = {
	/**
	 * The row's own id — what a per-phase edit addresses (#402). Position orders the
	 * season and identity edits it: two phases sharing a name are still two rows.
	 */
	id: string
	name: string
	weeks: number
	rhythm: Rhythm
	tapers: boolean
}

/**
 * Phases in authored order with everything a phase carries — the arc the Plan
 * card draws (ADR 0018) plus the rhythm and taper flag the Blocks reading shows.
 * Still no dates: a phase's span is derived from the Plan Start Week and the
 * phases before it, so no stored pair can disagree about it (ADR 0044 §3).
 */
export function phaseReadings(rows: OutlineRows): PhaseReading[] {
	return orderedPhases(rows).map((phase) => ({
		id: phase.id,
		name: phase.name,
		weeks: phase.weeks,
		rhythm: phase.rhythm as Rhythm,
		tapers: phase.tapers,
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
		const enduranceSegments = spec.segments.filter(
			(segment): segment is EnduranceSegmentSpec =>
				segment.kind === 'endurance',
		)

		return {
			discipline,
			currency: track.currency as VolumeCurrency,
			targets: trackTargets(phases, spec, discipline),
			// Paired with the spec by phase, so a reading and the rate the derivation
			// used cannot come from different rows.
			segments: track.segments.flatMap((row) =>
				segmentReading(row, phaseIndexById),
			),
			// The span and the total read the **endurance** walk. A strength track's
			// weeks are Unavailable until its own walk is written (`strengthWeekTargets`
			// below), and a span over unavailable weeks would be a fabricated headline —
			// so both arrive with that walk rather than being guessed here.
			...(isCardioDiscipline(discipline)
				? {
						span: seasonSpan(phases, spec),
						total: seasonTotal(phases, spec),
					}
				: { span: null, total: null }),
			warnings: rampWarnings(phases, enduranceSegments),
		}
	})
}

/**
 * One stored endurance segment as the surfaces read it, or nothing where its phase
 * is not in this season — the same narrowing `segmentSpec` applies, for the same
 * reason: a segment positioned at a guess is worse than one not shown.
 *
 * A strength segment yields nothing: it authors its own dated shape, and there is
 * no phase card here for it to sit on — so it never carries a mix either, which is
 * the same rule the mix's foreign key makes structural (ADR 0047 §3).
 */
function segmentReading(
	row: SegmentRow,
	phaseIndexById: Map<string, number>,
): SegmentReading[] {
	if (row.kind !== 'endurance') return []
	const phaseIndex =
		row.phaseId == null ? null : phaseIndexById.get(row.phaseId)
	if (phaseIndex == null) return []
	return [
		{
			segmentId: row.id,
			phaseIndex,
			ramp: row.ramp,
			boundaryStep: row.boundaryStep,
			recoveryCut: row.recoveryCut,
			taperCut: row.taperCut,
			// Filtered through `isQualityZone` rather than cast: the migration's CHECK
			// makes a zone outside 3–5 unreachable from the database, so a row that got
			// one anyway is a broken row, and dropping it keeps a bogus zone off the
			// surface instead of letting the type system be told it is fine. Sorted here
			// too, so a reading's order does not depend on the caller's `orderBy`.
			mix: row.mix
				.flatMap((entry) =>
					isQualityZone(entry.zone)
						? [{ zone: entry.zone, sessionsPerWeek: entry.sessionsPerWeek }]
						: [],
				)
				.sort((a, b) => a.zone - b.zone),
		},
	]
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
	return isCardioDiscipline(discipline)
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
