/**
 * The hero's other three panes: Form, this week, and records.
 *
 * The hero is anchored on today and pages sideways through facets of *now*
 * (ADR 0065 §8). The first facet is today's session, which
 * `buildTimelineHero` already builds; these are the other three, and every one
 * of them is a surface the home rebuild dropped with no ADR while its data kept
 * arriving on every request:
 *
 * - **Form** — the Training Load triad (ADR 0008), whose abbreviations are
 *   legend triggers again (#181) so `Fit / Fat / Form` stops assuming expert
 *   knowledge. Cold start keeps the numbers it *can* stand behind and refuses
 *   the one it cannot, with the Coach card's own caveat (ADR 0010).
 * - **This week** — the week the stream is looking at from the plan's point of
 *   view: what it asked for, what has happened, and the Week Replan decision
 *   that closed the last one (ADR 0019, ADR 0025, ADR 0046 §4).
 * - **Records** — the Proof Strip's Personal Records (ADR 0021), through
 *   `buildProofStrip` unchanged; the detection and the formatting were never
 *   the problem, the missing surface was.
 *
 * Nothing here derives a number of its own. Where the timeline already computed
 * a line — the current week's stats, the same words its stream header uses —
 * this reads that line rather than recomputing it, because an overview that
 * disagrees with the thing it overviews is worse than no overview.
 */
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { formatDayMonth, formatLoad } from '#app/utils/format.ts'
import {
	FATIGUE_LEGEND,
	FITNESS_LEGEND,
	FORM_LEGEND,
	type LoadLegend,
} from '#app/utils/load/legends.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import {
	strengthSummaryCountLabel,
	type StrengthSummaryCount,
} from '#app/utils/strength-log.ts'
import { type WeekReplanSummary } from '#app/utils/training.server.ts'
import { buildProofStrip, type ProofRecord } from '../presenter.ts'
import { type TimelineWeek } from './presenter.ts'

/** One number of the triad: its legend (the trigger's own copy) and its reading. */
export type HeroTriadStat = {
	legend: LoadLegend
	/** The rounded reading, or null where there is no number to stand behind. */
	value: string | null
}

export type HeroFormPane = {
	stats: HeroTriadStat[]
	/**
	 * `Building baseline — day 12/42` while Form cannot be trusted; null once it
	 * can. The Training Load Section stays *visible* on a cold start and says so,
	 * rather than hiding — the same caveat the Coach card carries (ADR 0008/0010).
	 */
	caveat: string | null
	/**
	 * `Fitness 58 → 64 since 6 Apr` — the trend the triad is one day of, read off
	 * the load snapshots the loader already fetches. Null under two snapshots:
	 * one point is not a trend, and inventing the other end is exactly what the
	 * Unavailable Metric principle forbids.
	 */
	trend: string | null
}

export type HeroWeekPane = {
	/** `Build 3` — where this week sits in the plan; null when there is no plan. */
	phase: string | null
	/** `2 of 5 done · 48 of 312 TSS` — the stream's own week header line. */
	stats: string
	/**
	 * `On target · 94% of planned endurance load` — Weekly Plan Adherence with
	 * the band it falls in (ADR 0019). It says **which track**: the ratio is a
	 * TSS ratio and strength has no TSS by decision, so this figure was never
	 * the week's — it was endurance's (ADR 0046 §4). Unmeasurable weeks say so.
	 */
	adherence: string
	/** `2 of 3 lifting sessions logged` — the strength companion (ADR 0046 §4). */
	strength: string
	/**
	 * The Week Replan decision for the latest closed week (ADR 0025): the stored
	 * outcome's name and its stored reason, verbatim. Null when no decision row
	 * exists — never an invented status.
	 */
	replan: { outcome: string; reason: string } | null
}

export type HeroRecordsPane = {
	records: ProofRecord[]
}

export type HeroPanes = {
	form: HeroFormPane
	week: HeroWeekPane
	records: HeroRecordsPane
}

/**
 * As much of a **Load Snapshot** as the trend line reads: the day, and the
 * Fitness on it. Structural rather than the stored row's type, so the loader's
 * serialized shape and a fixture satisfy it equally.
 */
type LoadSnapshotReading = { date: string; ctl: number }

/** The clause the This week pane's own heading already carries. */
const THIS_WEEK = 'This week'

/**
 * The name each stored Week Replan outcome goes by — a straight mapping of the
 * persisted enum, never a status derived at render. An outcome the app has no
 * word for falls back to the neutral name rather than printing the enum.
 */
const REPLAN_OUTCOME_LABEL: Record<string, string> = {
	adjusted: 'This week adjusted',
	'no-change': 'No change',
	'insufficient-data': 'No adjustment',
}

export function buildHeroPanes({
	current,
	trust,
	snapshots = [],
	thisWeek,
	weeklyAdherence = null,
	strengthCount = null,
	weekReplan = null,
	personalRecords = [],
	timezone = 'UTC',
}: {
	current: LoadTriad | null
	trust: TsbTrust
	snapshots?: LoadSnapshotReading[]
	/** The week today falls in, as the season already built it. */
	thisWeek: TimelineWeek | null
	weeklyAdherence?: WeeklyAdherence | null
	strengthCount?: StrengthSummaryCount | null
	weekReplan?: WeekReplanSummary | null
	personalRecords?: PersonalRecord[]
	timezone?: string
}): HeroPanes {
	return {
		form: buildFormPane({ current, trust, snapshots, timezone }),
		week: buildWeekPane({
			thisWeek,
			weeklyAdherence,
			strengthCount,
			weekReplan,
		}),
		records: { records: buildProofStrip(personalRecords) },
	}
}

function buildFormPane({
	current,
	trust,
	snapshots,
	timezone,
}: {
	current: LoadTriad | null
	trust: TsbTrust
	snapshots: LoadSnapshotReading[]
	timezone: string
}): HeroFormPane {
	// The cold-start gate is Form's alone (ADR 0008): Fitness and Fatigue are
	// averages of what was actually logged and stay readable from day one, while
	// Form is their difference and needs the history the gate is counting. So a
	// cold start suppresses one number and keeps two, rather than blanking the
	// pane or — worse — printing a TSB the coach line has just refused to quote.
	const coldStart = !trust.trustworthy || current?.tsb == null
	return {
		stats: [
			{
				legend: FITNESS_LEGEND,
				value: current ? formatLoad(current.ctl) : null,
			},
			{
				legend: FATIGUE_LEGEND,
				value: current ? formatLoad(current.atl) : null,
			},
			{
				legend: FORM_LEGEND,
				value: coldStart ? null : formatLoad(current!.tsb),
			},
		],
		// The caveat belongs to the gate, not to the missing number: it is the
		// count of days the gate is waiting on, so an athlete past the gate with no
		// snapshot yet gets dashes and silence rather than "day 60/42".
		caveat: trust.trustworthy
			? null
			: `Building baseline — day ${trust.daysOfHistory}/${trust.requiredDays}`,
		trend: fitnessTrend(snapshots, timezone),
	}
}

/**
 * `Fitness 58 → 64 since 6 Apr`, off the first and last snapshot the loader
 * fetched. Deliberately the span the data covers rather than the span that was
 * asked for: a 90-day query against 20 days of history is 20 days of history,
 * and saying "since" a date the athlete was not training on would be a claim
 * about a period the app cannot see.
 */
function fitnessTrend(
	snapshots: LoadSnapshotReading[],
	timezone: string,
): string | null {
	if (snapshots.length < 2) return null
	const first = snapshots[0]!
	const last = snapshots[snapshots.length - 1]!
	const from = formatDayMonth(
		dayBoundsUTC(first.date, timezone).start,
		timezone,
	)
	return `Fitness ${formatLoad(first.ctl)} → ${formatLoad(last.ctl)} since ${from}`
}

function buildWeekPane({
	thisWeek,
	weeklyAdherence,
	strengthCount,
	weekReplan,
}: {
	thisWeek: TimelineWeek | null
	weeklyAdherence: WeeklyAdherence | null
	strengthCount: StrengthSummaryCount | null
	weekReplan: WeekReplanSummary | null
}): HeroWeekPane {
	// The stream's week header says `Build 3 · This week`; the pane's own heading
	// already says which week this is, so the clause that repeats it comes out.
	// Saying it twice, in two type sizes, reads as two different claims.
	const phase = (thisWeek?.phaseLabel ?? '')
		.split(' · ')
		.filter((part) => part !== THIS_WEEK)
		.join(' · ')
	return {
		phase: phase || null,
		stats: thisWeek?.statsLabel ?? 'Nothing written',
		// The same spelled-out claim the Dashboard's week reading made (#181), and
		// the same honest refusal when there is no ratio to quote — a week with no
		// comparable session has no adherence, and 0% would be a lie about a week
		// nobody planned.
		adherence: weeklyAdherence
			? `${weeklyAdherence.band.label} · ${Math.round(weeklyAdherence.ratio * 100)}% of planned endurance load`
			: 'Planned endurance load unavailable',
		strength: strengthSummaryCountLabel(strengthCount),
		replan: weekReplan
			? {
					outcome: REPLAN_OUTCOME_LABEL[weekReplan.outcome] ?? 'Week replan',
					reason: weekReplan.reason,
				}
			: null,
	}
}
