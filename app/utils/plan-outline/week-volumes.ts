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
// The numbers are numbers; the few words that come back (the unmeasured count,
// the strength partial line, Annet) are worded in `labels.ts` (ADR 0081).

import { addDays, weekdayIndex } from '../athlete-calendar.ts'
import { sumBlockSets } from '../dashboard.ts'
import {
	ANNET_TRACK_LABELS,
	strengthPartialLabel,
	unmeasuredCountLabel,
	ZONE_INTENT_NOTE,
} from '../labels.ts'
import { adherenceBand } from '../load/adherence.ts'
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
	return {
		dayKey,
		status,
		discipline,
		easy: intentZone != null && intentZone <= 2,
		prescribed: workout
			? {
					km: fixedDayVolume(workout.blocks, 'km'),
					hours: fixedDayVolume(workout.blocks, 'hours'),
					tss: session.plannedTssValue,
					sets: discipline === 'strength' ? sumBlockSets(workout.blocks) : null,
				}
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
	/** `+2 uten km`, or null when every planned session has a number. */
	plannedUnmeasuredLabel: string | null
	/** The **Actual Volume**, by the same rule over the completed sessions. */
	actual: number | null
	actualUnmeasured: UnmeasuredCount[]
	actualUnmeasuredLabel: string | null
	grade: {
		status: VolumeGrade
		/** The last day the grade reads; null while no day is past. */
		gradedThroughKey: string | null
		/** What actual is held against, in the currency. */
		reference: number | null
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
	 * Strength logged up to a day and not after (#505 story 85):
	 * `til og med torsdag · resten ikke målt`. Sets tracks only.
	 */
	partial: { measuredThroughKey: string; label: string } | null
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
		plannedAbsence: ZoneAbsence | null
		/** `hensikt, ikke en måling` — a planned zone is an intention. */
		plannedNote: string
		done: ZoneSplit | null
		doneAbsence: ZoneAbsence | null
	} | null
}

/** Sessions that count in nothing: an `'other'` import, or no track to count in. */
export type OtherWeekVolume = {
	label: string
	note: string
	sessions: number
	done: number
}

export type WeekVolumes = {
	weekKey: string
	tracks: TrackWeekVolume[]
	other: OtherWeekVolume | null
}

/**
 * The week model for one Training Week: every plan track's three numbers, and
 * Annet. `weekKey` is the week's Monday; `todayKey` decides which days are past.
 */
export function buildWeekVolumes({
	weekKey,
	todayKey,
	planStartWeekKey,
	tracks,
	sessions,
}: {
	weekKey: string
	todayKey: string
	/** The plan's first Monday, or null without a plan. */
	planStartWeekKey: string | null
	tracks: readonly PlanTrackTargets[]
	sessions: readonly VolumeSession[]
}): WeekVolumes {
	const weekIndex =
		planStartWeekKey == null ? null : weekIndexOf(planStartWeekKey, weekKey)
	const gradedThroughKey = lastPastDay(weekKey, todayKey)
	const trackDisciplines = new Set<string>(tracks.map((t) => t.discipline))

	const others = sessions.filter(
		(s) =>
			s.discipline === OTHER_DISCIPLINE ||
			(trackDisciplines.size > 0 && !trackDisciplines.has(s.discipline)),
	)

	return {
		weekKey,
		tracks: tracks.map((track) =>
			trackWeek(
				track,
				weekIndex,
				gradedThroughKey,
				sessions.filter((s) => s.discipline === track.discipline),
			),
		),
		other:
			others.length === 0
				? null
				: {
						label: ANNET_TRACK_LABELS.name,
						note: ANNET_TRACK_LABELS.note,
						sessions: others.length,
						done: others.filter((s) => s.status === 'completed').length,
					},
	}
}

/** The last day of the week that is already past, or null while none is. */
function lastPastDay(weekKey: string, todayKey: string): string | null {
	const sunday = addDays(weekKey, 6)
	if (todayKey > sunday) return sunday
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
	gradedThroughKey: string | null,
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
		plannedUnmeasuredLabel: countLabel(plannedTally.unmeasured, currency),
		actual,
		actualUnmeasured: doneTally.unmeasured,
		actualUnmeasuredLabel: countLabel(doneTally.unmeasured, currency),
		grade: grade({
			through: gradeThrough,
			closed: gradedThroughKey != null && weekdayIndex(gradedThroughKey) === 6,
			target,
			currency,
			plannedSessions,
			doneSessions,
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

function countLabel(
	list: UnmeasuredCount[],
	currency: VolumeCurrency,
): string | null {
	const count = unmeasuredTotal(list)
	return count === 0 ? null : unmeasuredCountLabel(count, currency)
}

/**
 * Actual against what was asked for **through the graded day**. The reference
 * is the planned sessions on those days; a closed week with nothing planned in
 * the unit is held against its whole target instead. A current week with no
 * planned reference is ungraded — a fraction of the target would be a number
 * the plan never set.
 */
function grade({
	through,
	closed,
	target,
	currency,
	plannedSessions,
	doneSessions,
	readPlanned,
	readDone,
}: {
	through: string | null
	closed: boolean
	target: number | null
	currency: VolumeCurrency
	plannedSessions: readonly VolumeSession[]
	doneSessions: readonly VolumeSession[]
	readPlanned: (s: VolumeSession) => number | null
	readDone: (s: VolumeSession) => number | null
}): TrackWeekVolume['grade'] {
	if (through == null) {
		return {
			status: 'not-yet',
			gradedThroughKey: null,
			reference: null,
			basis: null,
		}
	}
	const upTo = (s: VolumeSession) => s.dayKey <= through
	const plannedThen = tally(
		plannedSessions.filter(upTo),
		readPlanned,
		() => PLANNED_REASON[currency],
	)
	const doneThen = tally(doneSessions.filter(upTo), readDone, (s) =>
		actualReason(s, currency),
	)

	let reference: number | null = null
	let basis: 'planned' | 'target' | null = null
	if (plannedThen.measured > 0 && plannedThen.sum > 0) {
		reference = roundToCurrency(plannedThen.sum, currency)
		basis = 'planned'
	} else if (closed && target != null && target > 0) {
		reference = target
		basis = 'target'
	}

	const actualThen =
		doneThen.measured > 0 || doneThen.unmeasured.length === 0
			? roundToCurrency(doneThen.sum, currency)
			: null
	if (reference == null || actualThen == null) {
		return { status: 'ungraded', gradedThroughKey: through, reference, basis }
	}
	const tone = adherenceBand(actualThen / reference).tone
	return {
		status: tone === 'on-target' ? 'on' : tone,
		gradedThroughKey: through,
		reference,
		basis,
	}
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
		label: strengthPartialLabel(weekdayIndex(lastMeasured)),
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
		plannedNote: ZONE_INTENT_NOTE,
		done: doneSplit,
		doneAbsence: doneSplit ? null : 'no-zone-recorded',
	}
}
