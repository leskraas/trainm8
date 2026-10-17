// The three week numbers (#505 stories 20–26, 33, 34, 85): per **Training Week**
// and per **Training Track**, the **Week Target**, the **Planned Volume** and the
// **Actual Volume**, each in the track's own **Volume Currency** and never
// blended into one another.
//
// Pure, and fed two ways: the home presenter hands it the ledger rows it already
// has, and `week-volumes.server.ts` reads one week for the surfaces that need a
// week on its own. Both go through {@link volumeSessionOf}, so a session reads
// the same number on every surface.
//
// What this module holds to:
//
// - **A session never changes the Week Target.** The target is the plan's
//   (`weekTargets` / `strengthWeekTargets` through `resolvedTracks`, a Week
//   Volume Override where the athlete set one); sessions only move Planned and
//   Actual Volume, and a gap between target and planned is marked, not closed.
// - **Nothing is added as zero.** A session with no number in the track's
//   currency is counted apart with its reason ("+2 uten km") — an
//   **Unavailable Metric** stated, never folded into the sum.
// - **The current week is graded only against the days already past**, so a
//   Monday never reads "under" (the comment's idea I).
// - **Annet counts in nothing**: an `'other'` import (ADR 0015) or a Discipline
//   the plan has no track for is shown apart and moves no track's numbers.
//
// It returns numbers, codes and value objects only. Every word is put on them at
// the edge — `labels.ts` owns the Norwegian (ADR 0081) and the home presenter
// applies it — so `labels.ts` can name these codes by type alone.

import { addDays, weekdayIndex } from '../athlete-calendar.ts'
import { sumBlockSets } from '../dashboard.ts'
import {
	ADHERENCE_ON_TARGET_AT_OR_ABOVE,
	ADHERENCE_OVER_ABOVE,
} from '../load/adherence.ts'
import {
	type PlannedMetric,
	plannedMetricValue,
	readPlannedMetric,
} from '../planned-discipline.ts'
import {
	deriveSessionProfile,
	intentToZone,
	parseRecordingPhaseBars,
	type ProfileBar,
} from '../session-profile.ts'
import { type LedgerSession } from '../training.server.ts'
import { getSessionDiscipline, type LedgerStatus } from '../training.ts'
import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import {
	roundToCurrency,
	strengthSegmentForWeek,
	type VolumeCurrency,
} from './derive.ts'
import { resolvedTracks, type OutlineRows } from './from-rows.ts'
import { weekIndexOf } from './week-keys.ts'
import { fixedDayVolume } from './week-pattern.ts'

/**
 * How far Planned Volume may stray from the Week Target before the week carries
 * the `≠` mark (#505 story 25, the comment's idea Q). Strictly more than this
 * marks; exactly 10 % does not.
 */
export const DRIFT_TOLERANCE = 0.1

/**
 * The import-only Discipline (ADR 0015). It is not in `DISCIPLINES`, because
 * nothing is authored in it — it only ever arrives on a recording.
 */
export const OTHER_DISCIPLINE = 'other'

/** Why a session has no number in the track's currency. */
export const UNMEASURED_REASONS = [
	/** A km track, and the session prescribes or recorded no distance throughout. */
	'no-distance',
	/** An hours track, and the session prescribes or recorded no duration. */
	'no-duration',
	/** A TSS track, and no TSS resolved for the session. */
	'no-tss',
	/** A sets track, and the session prescribes no sets. */
	'no-sets',
	/** Done, with no recording yet — the numbers come later from the import. */
	'awaiting-import',
	/** A lifting session done with no working set logged (ADR 0056). */
	'no-sets-logged',
] as const
export type UnmeasuredReason = (typeof UNMEASURED_REASONS)[number]

/** Why a week has no Week Target. */
export const TARGET_ABSENCES = ['outside-plan', 'no-anchor'] as const
export type TargetAbsence = (typeof TARGET_ABSENCES)[number]

/**
 * How Actual Volume stands. `not-yet`: no day of the week is past (a Monday, a
 * week ahead). `ungraded`: days are past but there is nothing measured to hold
 * against something measured — an Unavailable Metric, never "under".
 */
export const VOLUME_GRADES = [
	'not-yet',
	'ungraded',
	'under',
	'on',
	'over',
] as const
export type VolumeGrade = (typeof VOLUME_GRADES)[number]

/**
 * The cut points a graded week reads by: Actual Volume at or above 85 % of what
 * it is held against is on, above 108 % is over. They are the **Adherence
 * Band**'s own (ADR 0019), on purpose — one week read in TSS and the same week
 * read in km should not disagree about where "under" begins — and named here so
 * the volume grade can move apart from it in one place if it ever must.
 */
export const VOLUME_ON_AT_OR_ABOVE = ADHERENCE_ON_TARGET_AT_OR_ABOVE
export const VOLUME_OVER_ABOVE = ADHERENCE_OVER_ABOVE

/**
 * Why a session sits in Annet and counts in no track (#505 story 33):
 * an import-only `other` Discipline (ADR 0015), a Discipline the plan has no
 * track for, or the athlete's own choice (**Counts in No Track**).
 */
export const ANNET_REASONS = [
	'other-discipline',
	'no-track',
	'athlete-choice',
] as const
export type AnnetReason = (typeof ANNET_REASONS)[number]

/** Why a pace has no figure. */
export const PACE_ABSENCES = ['no-recorded-pace', 'no-easy-session'] as const
export type PaceAbsence = (typeof PACE_ABSENCES)[number]

/** Why a zone split has no figure. */
export const ZONE_ABSENCES = ['no-zone-prescribed', 'no-zone-recorded'] as const
export type ZoneAbsence = (typeof ZONE_ABSENCES)[number]

/**
 * One plan track's targets, as the week model reads them: per plan week,
 * earliest first, in the track's own currency.
 */
export type PlanTrackTargets = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	/** The Week Target per plan week; null where the rule cannot price it. */
	targets: Array<number | null>
	/** Per plan week: a **Week Volume Override** the athlete hand-set. */
	overridden: boolean[]
	/**
	 * A strength track's **Strength Frequency** per plan week — the segment's
	 * sessions per week, or null in a gap. Null on an endurance track, which
	 * authors no session count.
	 */
	sessionTargets: Array<number | null> | null
}

/**
 * Every track of a stored outline, in the shape the week model reads. The
 * targets are `resolvedTracks`' own — the same walk the plan page prints — so a
 * week header and the plan cannot disagree about a week.
 */
export function planTrackTargets(rows: OutlineRows): PlanTrackTargets[] {
	return resolvedTracks(rows).map((resolved) => {
		const row = rows.tracks.find((t) => t.id === resolved.trackId)
		return {
			trackId: resolved.trackId,
			discipline: resolved.discipline,
			currency: resolved.currency,
			targets: resolved.targets.map((t) => t.value),
			overridden: resolved.targets.map((t) => t.overridden),
			sessionTargets:
				resolved.discipline === 'strength' && row
					? strengthFrequencies(rows.startWeekKey, row, resolved.targets.length)
					: null,
		}
	})
}

/** The Strength Frequency in force each plan week, by the derivation's tie-break. */
function strengthFrequencies(
	startWeekKey: string,
	row: OutlineRows['tracks'][number],
	weeks: number,
): Array<number | null> {
	const segments = row.segments.flatMap((segment) =>
		segment.kind === 'strength' &&
		segment.startWeekKey != null &&
		segment.weeks != null
			? [
					{
						startWeekIndex: weekIndexOf(startWeekKey, segment.startWeekKey),
						weeks: segment.weeks,
						sessionsPerWeek: segment.sessionsPerWeek,
					},
				]
			: [],
	)
	return Array.from(
		{ length: weeks },
		(_, w) => strengthSegmentForWeek(segments, w)?.sessionsPerWeek ?? null,
	)
}

/** A session's figure in each currency; null where it has none. */
export type CurrencyFigures = {
	km: number | null
	hours: number | null
	tss: number | null
	sets: number | null
}

/**
 * A planned session's figures in each currency, read through the planned
 * discipline (`planned-discipline.ts`): a planned Simple Activity on `other` is
 * an Unavailable Metric (`simple-activity`) in every currency, so it can never
 * be summed into a track as a guessed number. It still sits in Annet.
 */
export function plannedVolumeOf(
	discipline: string,
	figures: CurrencyFigures,
): { [C in keyof CurrencyFigures]: PlannedMetric<number> } {
	const read = (value: number | null) =>
		readPlannedMetric(discipline, 'planned-volume', () => value)
	return {
		km: read(figures.km),
		hours: read(figures.hours),
		tss: read(figures.tss),
		sets: read(figures.sets),
	}
}

/** One session, as the week model reads it. */
export type VolumeSession = {
	/** `YYYY-MM-DD` in the Athlete Timezone. */
	dayKey: string
	status: LedgerStatus
	discipline: string
	/** The Workout's intent centres on zone 1–2: what easy pace averages over. */
	easy: boolean
	/** What the prescription holds; null for a recording-only session (an extra). */
	prescribed: CurrencyFigures | null
	/** What was recorded or logged; null when nothing has come in yet. */
	recorded: CurrencyFigures | null
	/** The prescription's zones, weighted by duration — intention, not a measure. */
	plannedZones: ProfileBar[]
	/** The recording's zones, where the import carried them. */
	doneZones: ProfileBar[]
	/**
	 * The athlete put this session in Annet (**Counts in No Track**): it moves no
	 * track's numbers, whatever its Discipline.
	 */
	countsInNoTrack: boolean
}

/**
 * One ledger row as the week model reads it. Planned km and hours are read by
 * `fixedDayVolume`, the Week Pattern's own reading: only a prescription that
 * carries the unit from end to end has a figure, so "20 min warm-up + 5×1000 m"
 * is unmeasured in km rather than 5 km.
 */
export function volumeSessionOf(
	session: LedgerSession,
	{ dayKey, status }: { dayKey: string; status: LedgerStatus },
): VolumeSession {
	const { workout, recording } = session
	const discipline = getSessionDiscipline(session)
	const logged = session.setLogs.length
	const intentZone = intentToZone(workout?.intent)
	// A lifting session that names no sets (a stamped `Styrke`, a sentence) has
	// no number in sets — it is unmeasured, never `0 sett`, or a week with two
	// such sessions would read `planlagt 0 sett` beside `0 av 2 økter`.
	const prescribedSets =
		discipline === 'strength' && workout ? sumBlockSets(workout.blocks) : 0
	return {
		dayKey,
		status,
		discipline,
		easy: intentZone != null && intentZone <= 2,
		prescribed: workout
			? prescribedFigures(discipline, {
					km: fixedDayVolume(workout.blocks, 'km'),
					hours: fixedDayVolume(workout.blocks, 'hours'),
					// A Planned TSS of zero is one that did not resolve — the week's
					// TSS line reads it the same way — so it is unmeasured, not 0.
					tss:
						session.plannedTssValue != null && session.plannedTssValue > 0
							? session.plannedTssValue
							: null,
					sets: prescribedSets > 0 ? prescribedSets : null,
				})
			: null,
		recorded:
			recording || logged > 0 || session.tssValue != null
				? {
						km:
							recording?.distanceM != null ? recording.distanceM / 1000 : null,
						hours:
							recording?.durationSec != null
								? recording.durationSec / 3600
								: null,
						tss: session.tssValue,
						sets: logged > 0 ? logged : null,
					}
				: null,
		plannedZones: workout ? deriveSessionProfile(workout).bars : [],
		doneZones: parseRecordingPhaseBars(recording?.phaseBarsJson),
		countsInNoTrack: session.countsInNoTrack,
	}
}

function prescribedFigures(
	discipline: string,
	figures: CurrencyFigures,
): CurrencyFigures {
	const read = plannedVolumeOf(discipline, figures)
	return {
		km: plannedMetricValue(read.km),
		hours: plannedMetricValue(read.hours),
		tss: plannedMetricValue(read.tss),
		sets: plannedMetricValue(read.sets),
	}
}

/** A count of sessions with no number, by reason. */
export type UnmeasuredCount = { reason: UnmeasuredReason; count: number }

/** Seconds per zone, zone 1 first, and how much of it is easy (zones 1–2). */
export type ZoneSplit = {
	secondsByZone: [number, number, number, number, number]
	/** Share of the zoned time in zones 1–2, to two decimals. */
	easyShare: number
}

export type TrackWeekVolume = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	/** The **Week Target**. A session never moves it. */
	target: number | null
	targetOverridden: boolean
	targetAbsence: TargetAbsence | null
	/**
	 * The **Planned Volume**: the measured sessions' sum. `0` when nothing is
	 * planned; null when sessions are planned but none has a number.
	 */
	planned: number | null
	plannedUnmeasured: UnmeasuredCount[]
	/** How many planned sessions have no number — the n of "+n uten km". */
	plannedUnmeasuredCount: number
	/** The **Actual Volume**, by the same rule over the completed sessions. */
	actual: number | null
	actualUnmeasured: UnmeasuredCount[]
	actualUnmeasuredCount: number
	grade: {
		status: VolumeGrade
		/** The last day the grade reads; null while no day is past. */
		gradedThroughKey: string | null
		/** What actual is held against, in the currency. */
		reference: number | null
		/** What was done against that reference, over the same sessions. */
		actual: number | null
		basis: 'planned' | 'target' | null
	}
	/**
	 * The `≠` mark: Planned Volume more than {@link DRIFT_TOLERANCE} off the
	 * target. Null where unmeasured sessions could explain a short week, so the
	 * mark is never claimed on a number that is known to be incomplete.
	 */
	driftMark: boolean | null
	/** `max(target, planned)` — the strip bar, so overplanning shows. */
	stripValue: number | null
	/** Sessions: the Strength Frequency (strength only), planned and done. */
	sessions: { target: number | null; planned: number; done: number }
	/**
	 * Strength logged up to a day and not after (#505 story 85) — worded
	 * `til og med torsdag · resten ikke målt`. Sets tracks only.
	 */
	partial: {
		measuredThroughKey: string
		/** Monday-first, 0 = Monday. */
		measuredThroughWeekday: number
	} | null
	/** A km track's pace, seconds per km. Null on any other currency. */
	pace: {
		actualSecPerKm: number | null
		/** Easy sessions only (the comment's idea M). */
		easySecPerKm: number | null
		actualAbsence: PaceAbsence | null
		easyAbsence: PaceAbsence | null
	} | null
	/** An endurance track's zone split: plan as intention against done. */
	zones: {
		planned: ZoneSplit | null
		/** Always an intention (`hensikt, ikke en måling`), never a measure. */
		plannedAbsence: ZoneAbsence | null
		done: ZoneSplit | null
		doneAbsence: ZoneAbsence | null
	} | null
}

/** Annet: the sessions that count in no track, and why each is there. */
export type OtherWeekVolume = {
	sessions: number
	done: number
	byReason: Array<{ reason: AnnetReason; count: number }>
}

export type WeekVolumes = {
	weekKey: string
	tracks: TrackWeekVolume[]
	other: OtherWeekVolume | null
}

/**
 * The week model for one Training Week: every plan track's three numbers, and
 * Annet. `weekKey` is the week's Monday; `todayKey` decides which days are past.
 *
 * `closed` says the week has closed although its Sunday is today — the Week
 * Replan closes it at Sunday 20:00 local (`lastClosedWeekKey`) — so the
 * Ukeskiftet review that evening grades the whole week, Sunday included.
 */
export function buildWeekVolumes({
	weekKey,
	todayKey,
	planStartWeekKey,
	tracks,
	sessions,
	closed = false,
}: {
	weekKey: string
	todayKey: string
	/** The plan's first Monday, or null without a plan. */
	planStartWeekKey: string | null
	tracks: readonly PlanTrackTargets[]
	sessions: readonly VolumeSession[]
	closed?: boolean
}): WeekVolumes {
	const weekIndex =
		planStartWeekKey == null ? null : weekIndexOf(planStartWeekKey, weekKey)
	const sunday = addDays(weekKey, 6)
	const isClosed = closed || todayKey > sunday
	const gradedThroughKey = isClosed ? sunday : lastPastDay(weekKey, todayKey)
	const trackDisciplines = new Set<string>(tracks.map((t) => t.discipline))

	const annetReason = (s: VolumeSession): AnnetReason | null => {
		if (s.countsInNoTrack) return 'athlete-choice'
		if (s.discipline === OTHER_DISCIPLINE) return 'other-discipline'
		if (trackDisciplines.size > 0 && !trackDisciplines.has(s.discipline)) {
			return 'no-track'
		}
		return null
	}
	const others = sessions.flatMap((s) => {
		const reason = annetReason(s)
		return reason ? [{ session: s, reason }] : []
	})
	const counted = sessions.filter((s) => !s.countsInNoTrack)

	return {
		weekKey,
		tracks: tracks.map((track) =>
			trackWeek(
				track,
				weekIndex,
				{ gradedThroughKey, closed: isClosed },
				counted.filter((s) => s.discipline === track.discipline),
			),
		),
		other:
			others.length === 0
				? null
				: {
						sessions: others.length,
						done: others.filter((o) => o.session.status === 'completed').length,
						byReason: ANNET_REASONS.flatMap((reason) => {
							const count = others.filter((o) => o.reason === reason).length
							return count > 0 ? [{ reason, count }] : []
						}),
					},
	}
}

/** The last day of an open week that is already past, or null while none is. */
function lastPastDay(weekKey: string, todayKey: string): string | null {
	if (todayKey <= weekKey) return null
	return addDays(todayKey, -1)
}

type Tally = { sum: number; measured: number; unmeasured: UnmeasuredCount[] }

function tally(
	sessions: readonly VolumeSession[],
	read: (s: VolumeSession) => number | null,
	reason: (s: VolumeSession) => UnmeasuredReason,
): Tally {
	const result: Tally = { sum: 0, measured: 0, unmeasured: [] }
	for (const session of sessions) {
		const value = read(session)
		if (value != null) {
			result.sum += value
			result.measured++
			continue
		}
		const why = reason(session)
		const existing = result.unmeasured.find((u) => u.reason === why)
		if (existing) existing.count++
		else result.unmeasured.push({ reason: why, count: 1 })
	}
	return result
}

/** The sum, or null when there were sessions and none had a number. */
function total(t: Tally, currency: VolumeCurrency): number | null {
	if (t.measured === 0 && t.unmeasured.length > 0) return null
	return roundToCurrency(t.sum, currency)
}

function unmeasuredTotal(list: UnmeasuredCount[]): number {
	return list.reduce((n, u) => n + u.count, 0)
}

const PLANNED_REASON: Record<VolumeCurrency, UnmeasuredReason> = {
	km: 'no-distance',
	hours: 'no-duration',
	tss: 'no-tss',
	sets: 'no-sets',
}

function actualReason(
	session: VolumeSession,
	currency: VolumeCurrency,
): UnmeasuredReason {
	if (currency === 'sets') return 'no-sets-logged'
	if (session.recorded == null) return 'awaiting-import'
	return PLANNED_REASON[currency]
}

function trackWeek(
	track: PlanTrackTargets,
	weekIndex: number | null,
	{
		gradedThroughKey,
		closed,
	}: { gradedThroughKey: string | null; closed: boolean },
	sessions: readonly VolumeSession[],
): TrackWeekVolume {
	const { currency } = track
	const inPlan =
		weekIndex != null && weekIndex >= 0 && weekIndex < track.targets.length
	const target = inPlan ? (track.targets[weekIndex] ?? null) : null

	const plannedSessions = sessions.filter((s) => s.prescribed != null)
	const doneSessions = sessions.filter((s) => s.status === 'completed')
	const readPlanned = (s: VolumeSession) => s.prescribed?.[currency] ?? null
	const readDone = (s: VolumeSession) => s.recorded?.[currency] ?? null

	const plannedTally = tally(
		plannedSessions,
		readPlanned,
		() => PLANNED_REASON[currency],
	)
	const doneTally = tally(doneSessions, readDone, (s) =>
		actualReason(s, currency),
	)
	const planned = total(plannedTally, currency)
	const actual = total(doneTally, currency)

	const partial =
		currency === 'sets' ? strengthPartial(doneSessions, readDone) : null
	const gradeThrough =
		partial && gradedThroughKey && partial.measuredThroughKey < gradedThroughKey
			? partial.measuredThroughKey
			: gradedThroughKey

	return {
		trackId: track.trackId,
		discipline: track.discipline,
		currency,
		target,
		targetOverridden: inPlan ? (track.overridden[weekIndex] ?? false) : false,
		targetAbsence:
			target != null ? null : inPlan ? 'no-anchor' : 'outside-plan',
		planned,
		plannedUnmeasured: plannedTally.unmeasured,
		plannedUnmeasuredCount: unmeasuredTotal(plannedTally.unmeasured),
		actual,
		actualUnmeasured: doneTally.unmeasured,
		actualUnmeasuredCount: unmeasuredTotal(doneTally.unmeasured),
		grade: grade({
			through: gradeThrough,
			closed,
			target,
			currency,
			sessions,
			readPlanned,
			readDone,
		}),
		driftMark: drift(target, planned, unmeasuredTotal(plannedTally.unmeasured)),
		stripValue:
			target == null && planned == null
				? null
				: Math.max(target ?? 0, planned ?? 0),
		sessions: {
			target:
				inPlan && track.sessionTargets
					? (track.sessionTargets[weekIndex] ?? null)
					: null,
			planned: plannedSessions.length,
			done: doneSessions.length,
		},
		partial,
		pace: currency === 'km' ? pace(doneSessions) : null,
		zones: isCardioDiscipline(track.discipline)
			? zones(plannedSessions, doneSessions)
			: null,
	}
}

/**
 * Actual against what was asked for **through the graded day**, over the
 * sessions measured on **both** sides only: a planned number in the currency,
 * and — when done — a recorded one. A missed session is a true zero done; a
 * session with either side unmeasured is left out of both sums, never read as
 * 0 — so a run whose import has not come cannot make a week "under", and an
 * unplanned-in-km run cannot make it "over".
 *
 * A **closed** week is the exception, read first: once every done session has
 * its number it is held against its whole Week Target, which is what the
 * folded line names (`35 av 46 km · under`). Only when a done number is still
 * missing does it fall back to the pairs. With no pair either, the week is
 * `ungraded` — a fraction of the target would be a number the plan never set.
 */
function grade({
	through,
	closed,
	target,
	currency,
	sessions,
	readPlanned,
	readDone,
}: {
	through: string | null
	closed: boolean
	target: number | null
	currency: VolumeCurrency
	sessions: readonly VolumeSession[]
	readPlanned: (s: VolumeSession) => number | null
	readDone: (s: VolumeSession) => number | null
}): TrackWeekVolume['grade'] {
	if (through == null) {
		return {
			status: 'not-yet',
			gradedThroughKey: null,
			reference: null,
			actual: null,
			basis: null,
		}
	}
	const past = sessions.filter((s) => s.dayKey <= through)

	// A closed week is held against what the plan asked of it — the whole Week
	// Target — once every done session has its number (#505 story 31, S3): a
	// folded week reads `35 av 46 km · under` with 46 the target, and its
	// verdict must be about that 46, not about the sessions planned under it.
	// A done session still waiting for its number would read as 0 against the
	// whole target, so such a week falls through to the measured pairs below.
	const doneAll = sessions.filter((s) => s.status === 'completed')
	if (
		closed &&
		target != null &&
		target > 0 &&
		doneAll.every((s) => readDone(s) != null)
	) {
		const sum = doneAll.reduce((n, s) => n + (readDone(s) ?? 0), 0)
		return graded(through, target, roundToCurrency(sum, currency), 'target')
	}

	let asked = 0
	let did = 0
	let pairs = 0
	for (const s of past) {
		const plannedValue = s.prescribed ? readPlanned(s) : null
		if (plannedValue == null) continue
		if (s.status === 'completed') {
			const doneValue = readDone(s)
			if (doneValue == null) continue
			did += doneValue
		} else if (s.status !== 'missed') {
			continue
		}
		asked += plannedValue
		pairs++
	}

	if (pairs > 0 && asked > 0) {
		return graded(
			through,
			roundToCurrency(asked, currency),
			roundToCurrency(did, currency),
			'planned',
		)
	}

	return {
		status: 'ungraded',
		gradedThroughKey: through,
		reference: null,
		actual: null,
		basis: null,
	}
}

function graded(
	through: string,
	reference: number,
	actual: number,
	basis: 'planned' | 'target',
): TrackWeekVolume['grade'] {
	const ratio = actual / reference
	const status: VolumeGrade =
		ratio < VOLUME_ON_AT_OR_ABOVE
			? 'under'
			: ratio > VOLUME_OVER_ABOVE
				? 'over'
				: 'on'
	return { status, gradedThroughKey: through, reference, actual, basis }
}

function drift(
	target: number | null,
	planned: number | null,
	unmeasured: number,
): boolean | null {
	if (target == null) return false
	const plannedSum = planned ?? 0
	if (target === 0) return plannedSum > 0 ? true : unmeasured > 0 ? null : false
	const off = (plannedSum - target) / target
	if (off > DRIFT_TOLERANCE) return true
	// Short, but sessions without a number could be what is missing.
	if (unmeasured > 0) return null
	return off < -DRIFT_TOLERANCE
}

/**
 * A clean break in the strength log: every logged session sits before every
 * unlogged one. Only then is "til og med {dag} · resten ikke målt" true; any
 * other mix is reported as the count of unlogged sessions alone.
 */
function strengthPartial(
	done: readonly VolumeSession[],
	read: (s: VolumeSession) => number | null,
): TrackWeekVolume['partial'] {
	const measured = done.filter((s) => read(s) != null).map((s) => s.dayKey)
	const unmeasured = done.filter((s) => read(s) == null).map((s) => s.dayKey)
	if (measured.length === 0 || unmeasured.length === 0) return null
	const lastMeasured = measured.reduce((a, b) => (a > b ? a : b))
	const firstUnmeasured = unmeasured.reduce((a, b) => (a < b ? a : b))
	if (lastMeasured >= firstUnmeasured) return null
	return {
		measuredThroughKey: lastMeasured,
		measuredThroughWeekday: weekdayIndex(lastMeasured),
	}
}

function pace(done: readonly VolumeSession[]): TrackWeekVolume['pace'] {
	const secPerKm = (sessions: readonly VolumeSession[]) => {
		let seconds = 0
		let km = 0
		for (const s of sessions) {
			const d = s.recorded?.km
			const h = s.recorded?.hours
			if (d == null || h == null || d <= 0) continue
			seconds += h * 3600
			km += d
		}
		return km > 0 ? Math.round(seconds / km) : null
	}
	const actualSecPerKm = secPerKm(done)
	const easy = done.filter((s) => s.easy)
	const easySecPerKm = secPerKm(easy)
	return {
		actualSecPerKm,
		easySecPerKm,
		actualAbsence: actualSecPerKm == null ? 'no-recorded-pace' : null,
		easyAbsence:
			easySecPerKm != null
				? null
				: easy.length === 0
					? 'no-easy-session'
					: 'no-recorded-pace',
	}
}

function zoneSplit(bars: readonly ProfileBar[]): ZoneSplit | null {
	const secondsByZone: ZoneSplit['secondsByZone'] = [0, 0, 0, 0, 0]
	for (const bar of bars) {
		if (bar.zone == null || bar.durationSec <= 0) continue
		const slot = (bar.zone - 1) as 0 | 1 | 2 | 3 | 4
		secondsByZone[slot] += bar.durationSec
	}
	const zoned = secondsByZone.reduce((a, b) => a + b, 0)
	if (zoned === 0) return null
	return {
		secondsByZone,
		easyShare:
			Math.round(((secondsByZone[0] + secondsByZone[1]) / zoned) * 100) / 100,
	}
}

function zones(
	planned: readonly VolumeSession[],
	done: readonly VolumeSession[],
): TrackWeekVolume['zones'] {
	const plannedSplit = zoneSplit(planned.flatMap((s) => s.plannedZones))
	const doneSplit = zoneSplit(done.flatMap((s) => s.doneZones))
	return {
		planned: plannedSplit,
		plannedAbsence: plannedSplit ? null : 'no-zone-prescribed',
		done: doneSplit,
		doneAbsence: doneSplit ? null : 'no-zone-recorded',
	}
}
