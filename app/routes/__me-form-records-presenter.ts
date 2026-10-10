/**
 * Meg's Form and Rekorder sections: what the athlete's training has built, read
 * off the same server functions the home hero's Form and Records panes read
 * (`getCurrentLoad`, `getTsbTrust`, `getLoadSnapshots`, `getPersonalRecords`).
 *
 * The hero is gone from I dag (#505, the owner's decision of 2026-10-10), and
 * these two panes were the only place in the app either reading was shown, so
 * they moved here rather than going with it. The honesty rules came with them:
 *
 * - **Form is refused on a cold start** and said out loud instead (ADR
 *   0008/0010). Fitness and Fatigue are averages of what was logged and read
 *   from day one; Form is their difference and needs the 42 days the gate
 *   counts. A cold start keeps two numbers and refuses one, rather than blanking
 *   the section or printing a TSB the coach line refuses to quote.
 * - **Every "ikke målt" gives its reason** (#505 story 71). A missing number is
 *   `null` here, never a zero, and the reading carries the sentence that says
 *   why it is missing.
 * - **Trust is shown, not implied.** Below the gate the reading carries how far
 *   along it is (a progress, `dag 12 av 42`); past it, how much history the
 *   numbers stand on and the day they were computed.
 * - **Records are derived, never authored** (ADR 0021), and an athlete with
 *   none is told what will produce one.
 *
 * Nothing here derives a number of its own: every figure is the stored one,
 * rounded the way `formatLoad` always rounded it. What changed from the hero is
 * the writing: a Norwegian surface writes `21,1 km` and `1 500 m` (ADR 0081),
 * where the hero had inherited `21.1 km` and `1,500 m` from the English Proof
 * Strip.
 */
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import {
	formatLoad,
	formatNbDate,
	formatNbDayMonth,
	formatNbVolumeFigure,
	formatSignedTsb,
} from '#app/utils/format.ts'
import {
	ME_FORM_LABELS,
	ME_RECORD_LABELS,
	NB_LOAD_LEGENDS,
	NB_READINESS_LABELS,
	NB_RECORD_NOUNS,
	nbDisciplineLabel,
} from '#app/utils/labels.ts'
import { type LoadLegend } from '#app/utils/load/legends.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import {
	type BenchmarkKind,
	type PersonalRecord,
} from '#app/utils/personal-records.ts'

// ── Form ────────────────────────────────────────────────────────────────────

/** One number of the triad: its legend (the trigger's own copy) and its reading. */
export type FormStat = {
	key: 'fitness' | 'fatigue' | 'form'
	legend: LoadLegend
	/** The rounded reading, or null where there is no number to stand behind. */
	value: string | null
}

export type FormReading = {
	/** Kondisjon, Tretthet, Form — always all three, in that order. */
	stats: FormStat[]
	/**
	 * `i balanse` — what the Form number means, in the coach's words (ADR
	 * 0010). Null whenever Form itself is not shown: a state read off a number
	 * the section refuses to print would be the number by the back door.
	 */
	state: string | null
	/**
	 * Why one or more stats read "ikke målt"; null when all three are measured.
	 * The section never shows a missing number without this sentence.
	 */
	unmeasured: string | null
	/**
	 * The cold-start gate's progress while Form cannot be trusted: the day the
	 * athlete is on and the day it opens. Null once it is open.
	 */
	baseline: { day: number; required: number; label: string } | null
	/**
	 * Past the gate: `Bygger på 60 dager med belastning · regnet ut 9. okt` —
	 * what the numbers stand on, and how fresh they are. Null below the gate
	 * (the baseline says it there) and when there is no reading at all.
	 */
	trust: string | null
	/**
	 * `Kondisjon 51 → 62 siden 4. jan` — the trend the triad is one day of.
	 * Null under two snapshots: one point is not a trend, and inventing the
	 * other end is what the Unavailable Metric principle forbids.
	 */
	trend: string | null
}

/**
 * As much of a **Load Snapshot** as the trend line reads. Structural rather
 * than the stored row's type, so the loader's rows and a fixture satisfy it
 * equally.
 */
export type LoadSnapshotReading = { date: string; ctl: number }

export function buildFormReading({
	current,
	trust,
	snapshots = [],
	timezone = 'UTC',
}: {
	/** The latest Load Snapshot; `date` is its athlete-local day. */
	current: (LoadTriad & { date?: string }) | null
	trust: TsbTrust
	snapshots?: LoadSnapshotReading[]
	timezone?: string
}): FormReading {
	// The cold-start gate is Form's alone (ADR 0008).
	const formShown = trust.trustworthy && current != null
	const stats: FormStat[] = [
		{
			key: 'fitness',
			legend: NB_LOAD_LEGENDS.fitness,
			value: current ? formatLoad(current.ctl) : null,
		},
		{
			key: 'fatigue',
			legend: NB_LOAD_LEGENDS.fatigue,
			value: current ? formatLoad(current.atl) : null,
		},
		{
			key: 'form',
			legend: NB_LOAD_LEGENDS.form,
			// Signed with a real minus, the way the coach's verdict writes it, so
			// the number here and the number in the sentence look the same.
			value: formShown ? formatSignedTsb(current.tsb) : null,
		},
	]
	// One reason, the one that explains the most: with no load at all every
	// number is missing for the same reason, and the gate is beside the point.
	const unmeasured = !current
		? ME_FORM_LABELS.noLoad
		: !trust.trustworthy
			? ME_FORM_LABELS.formColdStart(trust.daysOfHistory, trust.requiredDays)
			: null
	return {
		stats,
		state: formShown
			? NB_READINESS_LABELS[readinessFromTsb(current.tsb).tone]
			: null,
		unmeasured,
		baseline: trust.trustworthy
			? null
			: {
					// A count past the gate cannot happen while it is closed, but a bar
					// overfull by a rounding would claim it had.
					day: Math.min(trust.daysOfHistory, trust.requiredDays),
					required: trust.requiredDays,
					label: ME_FORM_LABELS.baselineValue(
						trust.daysOfHistory,
						trust.requiredDays,
					),
				},
		trust: formShown ? trustLine(trust, current.date, timezone) : null,
		trend: fitnessTrend(snapshots, timezone),
	}
}

function trustLine(
	trust: TsbTrust,
	date: string | undefined,
	timezone: string,
): string {
	const days = ME_FORM_LABELS.trusted(trust.daysOfHistory)
	return date
		? `${days} · ${ME_FORM_LABELS.asOf(dayLabel(date, timezone))}`
		: days
}

/** A snapshot's `YYYY-MM-DD` (athlete-local) as `4. jan`. */
function dayLabel(date: string, timezone: string): string {
	return formatNbDayMonth(dayBoundsUTC(date, timezone).start, timezone)
}

/**
 * Off the first and last snapshot the loader fetched — the span the data
 * covers, not the span that was asked for: a 90-day query against 20 days of
 * history is 20 days of history.
 */
function fitnessTrend(
	snapshots: LoadSnapshotReading[],
	timezone: string,
): string | null {
	if (snapshots.length < 2) return null
	const first = snapshots[0]!
	const last = snapshots[snapshots.length - 1]!
	return ME_FORM_LABELS.fitnessTrend(
		formatLoad(first.ctl),
		formatLoad(last.ctl),
		dayLabel(first.date, timezone),
	)
}

// ── Rekorder ────────────────────────────────────────────────────────────────

export type RecordLine = {
	discipline: string
	disciplineLabel: string
	/** `Lengste løpetur`. */
	label: string
	/** `21,1 km` / `1 500 m`. */
	value: string
	/** `+11,1 km over forrige beste`, or `Første registrerte` with nothing before. */
	gain: string
	/** `satt 10. feb 2030`. */
	setOn: string
}

/** The benchmark a record holds, as Meg names it (ADR 0081). */
const BENCHMARK_LABEL: Record<BenchmarkKind, (discipline: string) => string> = {
	farthest: (discipline) =>
		ME_RECORD_LABELS.longest(NB_RECORD_NOUNS[discipline] ?? 'økt'),
}

/**
 * Swims read in metres (a swimmer thinks "1 500 m", not "1,5 km"); run and bike
 * in the shared distance formatter's kilometres, with the Norwegian decimal
 * comma. Metres group with a no-break space, the Norwegian thousands mark — a
 * comma there would read as a decimal (`1,500 m` is one and a half metres).
 */
function formatRecordDistance(discipline: string, meters: number): string {
	if (discipline === 'swim') {
		const grouped = String(Math.round(meters)).replace(
			/\B(?=(\d{3})+(?!\d))/g,
			' ',
		)
		return `${grouped} m`
	}
	if (meters < 1000) return `${Math.round(meters)} m`
	// The week figures' own writing (`formatNbVolumeFigure`): a whole kilometre
	// written whole (`15 km`, not `15,0 km`), a decimal comma, and a long ride
	// grouped (`1 204,5 km`).
	return `${formatNbVolumeFigure(meters / 1000, 'km')} km`
}

export function buildRecordLines(
	records: PersonalRecord[],
	timezone = 'UTC',
): RecordLine[] {
	return records.map((record) => ({
		discipline: record.discipline,
		disciplineLabel: nbDisciplineLabel(record.discipline),
		label: BENCHMARK_LABEL[record.kind](record.discipline),
		value: formatRecordDistance(record.discipline, record.value),
		gain:
			record.delta != null
				? ME_RECORD_LABELS.overBest(
						`+${formatRecordDistance(record.discipline, record.delta)}`,
					)
				: ME_RECORD_LABELS.firstOnRecord,
		// With the year: a record can stand for seasons, and `10. feb` alone
		// does not say which February.
		setOn: ME_RECORD_LABELS.setOn(formatNbDate(record.achievedAt, timezone)),
	}))
}
