/**
 * What a row on the home timeline says — and what it refuses to say.
 *
 * A row's job is to answer the athlete's question and nothing that is already
 * answered elsewhere on the screen, so the honesty rules live here rather than
 * in the markup:
 *
 * - **Two lines, two kinds of load.** Line 1 is *what you did* — external load,
 *   the distance, the time, the pace. Line 2 is *what it cost* — internal load,
 *   the RPE and, where no chip carries it, the actual TSS. Runners read a
 *   session that way, and splitting the lines makes both scannable. Line 2
 *   renders *lighter* than line 1 on purpose: it is the newer, more informative
 *   line, and the weight says "read this second", not "this matters less".
 * - **A planned row is an instruction, not a result.** Line 1 ends in `planned`
 *   so a prescription can never be mistaken for an actual, and line 2 is the
 *   target — the pace window and the HR ceiling — rather than an outcome. This
 *   applies to every planned week, not only the current one.
 * - **No band without both sides** (ADR 0008/0019). An unplanned session reads
 *   `UNPLANNED · NO PLAN TO COMPARE`, never a fabricated percentage; an imported
 *   session gets no chip at all, because the week header already says the week
 *   came from before the plan and repeating it on every row is noise.
 * - **A missed session invents nothing.** `Nothing recorded` and `MISSED`. No
 *   line 2, because there was no cost.
 * - **An absent measurement is absent** (the Unavailable Metric principle).
 *   Every line here is assembled from the clauses that resolved and joined at
 *   the end, so a clause with no data behind it disappears instead of
 *   zero-filling.
 *
 * Three things the handoff asks for are **deliberately not emitted**, and each
 * one is a missing input rather than a missing feature:
 *
 * - *HR drift, named against its 5 % threshold.* No stored field carries it. It
 *   would have to be derived from `ActivityStream`'s heart-rate samples, which
 *   a ledger row does not fetch. Printing a number here would mean inventing
 *   one.
 * - *The heart rate on the reps of a quality session.* Same reason: the reading
 *   is per-phase, and phase heart rates are not stored.
 * - *A strength session's kilos and set-by-set outcome* (`Squat 82.5 × 5`,
 *   `SETS 14 / 15`, "squat up 5 kg since the last Workout B"). Those live in
 *   `ExerciseSetLog`, which the ledger query does not select, and the
 *   progression sentence has no producer anywhere yet. A completed lifting
 *   session therefore states no external load at all rather than leaking its
 *   *prescription's* duration onto a line that claims to say what happened.
 */
import { sumBlockDistanceM } from '#app/utils/dashboard.ts'
import {
	formatDistance,
	formatLoad,
	formatMeters,
	formatPace,
	formatPaceClock,
	formatPaceRange,
	formatSpeed,
	formatTss,
} from '#app/utils/format.ts'
import { type SessionRow } from '#app/utils/session-ledger-rows.ts'
import { type LedgerSession } from '#app/utils/training.server.ts'
import { type SessionLedgerEntry } from '#app/utils/training.ts'
import { blockRepeatTotal } from '#app/utils/workout-schema.ts'

/** The separator between clauses on a row line — one middot, everywhere. */
const CLAUSE = ' · '

/** Join the clauses that resolved, dropping the ones that did not. */
function clauses(...parts: Array<string | null | undefined>): string | null {
	const kept = parts.filter((part): part is string => !!part)
	return kept.length > 0 ? kept.join(CLAUSE) : null
}

/**
 * What the row's week already says, so the row does not say it again. Both flags
 * are the *week's* facts, never the session's: a row cannot know it sits in an
 * imported week, and that is exactly the thing that decides whether it carries a
 * compliance chip.
 */
export type RowWeekContext = {
	/** Before the plan began — history the athlete brought with them. */
	imported: boolean
	/** The current training week. */
	isNow: boolean
}

/**
 * A chip's tone. `warn` covers both edges of the Adherence Band that are not on
 * target: a session that came in light and one that ran hot are both departures
 * from the plan, and the band label already says which. `bad` is reserved for a
 * session that did not happen, and `muted` for a statement with no verdict in
 * it — the tone an unplanned session gets, because there is nothing to be right
 * or wrong about.
 */
export type RowChipTone = 'primary' | 'warn' | 'bad' | 'muted'

/** Chips are identified, not just labelled, so a caller can order or find one. */
export type RowChipId = 'today' | 'compliance' | 'replan'

export type RowChip = {
	id: RowChipId
	label: string
	tone: RowChipTone
}

export type RowContent = {
	/** Line 1 — what was done, or what is being asked for. */
	externalLoad: string | null
	/** Line 2 — what it cost, or what to hold it to. */
	internalLoad: string | null
	/** In reading order: today, then the band, then anything that changed it. */
	chips: RowChip[]
}

export function buildRowContent(
	row: SessionRow,
	week: RowWeekContext,
	{ isToday = false }: { isToday?: boolean } = {},
): RowContent {
	const { session, entry } = row
	const compliance = complianceChip({ session, entry, week, isToday })
	const chips: RowChip[] = []
	// Today's row is the one planned row that says where the day stands. Every
	// other planned row is self-evidently not done yet, and a chip saying so on
	// all of them would say nothing on any of them.
	if (isToday && entry.status === 'planned') {
		chips.push({
			id: 'today',
			label: 'TODAY · NOT DONE YET',
			tone: 'primary',
		})
	}
	if (compliance) chips.push(compliance)
	// The Replan Note (ADR 0025) stays quiet and stays verbatim: it is the stored
	// reason a session was softened, and paraphrasing it here would put a second
	// version of the decision on the screen.
	if (entry.replanReason) {
		chips.push({ id: 'replan', label: entry.replanReason, tone: 'muted' })
	}
	return {
		externalLoad: externalLoad(session, entry),
		internalLoad: internalLoad({
			session,
			entry,
			// The band chip already prints the actual TSS. Where no band exists,
			// line 2 is the only place the number can go — so it goes there, and
			// exactly once either way.
			statesLoad: compliance?.id === 'compliance' && statesTss(compliance),
		}),
		chips,
	}
}

/** True when a chip's label already carries the actual TSS figure. */
function statesTss(chip: RowChip): boolean {
	return chip.label.startsWith('TSS ')
}

// ---------------------------------------------------------------------------
// Line 1 — external load
// ---------------------------------------------------------------------------

function externalLoad(
	session: LedgerSession,
	entry: SessionLedgerEntry,
): string | null {
	if (entry.status === 'missed') return 'Nothing recorded'
	if (entry.status === 'completed') {
		// A lifting session's actual is its set rows, which this row does not
		// carry. Its prescription's duration is not what it did.
		if (entry.discipline === 'strength') return null
		return clauses(
			distanceClause(session, entry),
			entry.durationMin != null ? `${entry.durationMin} min` : null,
			rateClause(session, entry),
		)
	}
	return plannedLine(entry)
}

/** Kilometres for a run or a ride; metres for a swim, which is read that way. */
function distanceClause(
	session: LedgerSession,
	entry: SessionLedgerEntry,
): string | null {
	const metres = session.recording?.distanceM
	if (metres == null || metres <= 0) return null
	return entry.discipline === 'swim'
		? formatMeters(metres)
		: formatDistance(metres)
}

/**
 * The rate each discipline is actually read in: pace per kilometre for a run,
 * speed for a ride, pace per hundred metres for a swim. Computed from the two
 * measured quantities rather than a stored average, so the row and the two
 * numbers beside it on the same line can never disagree.
 */
function rateClause(
	session: LedgerSession,
	entry: SessionLedgerEntry,
): string | null {
	const recording = session.recording
	if (!recording?.distanceM || !recording.durationSec) return null
	const { distanceM, durationSec } = recording
	switch (entry.discipline) {
		case 'bike':
			return formatSpeed(distanceM / durationSec)
		case 'swim':
			return `${formatPaceClock(durationSec / (distanceM / 100))} /100m`
		case 'run':
			return formatPace(durationSec / (distanceM / 1000))
		default:
			// An "other" import has no unit the athlete reads it in; distance and
			// time are the whole of what it can honestly say.
			return null
	}
}

/**
 * A prescription's line 1. It ends in `planned` — the one word that keeps a
 * plan and a result apart in a stream that mixes them — and carries only the
 * quantities the prescription itself fixes. A distance-quantified session says
 * nothing here about minutes it never authored; its distance belongs with the
 * pace it is to be run at, on line 2.
 */
function plannedLine(entry: SessionLedgerEntry): string | null {
	const duration =
		entry.durationMin != null && entry.durationMin > 0
			? `${entry.durationMin} min`
			: null
	if (entry.plannedTss == null) {
		return duration ? `${duration} planned` : null
	}
	return clauses(duration, `${formatTss(entry.plannedTss)} planned`)
}

// ---------------------------------------------------------------------------
// Line 2 — internal load
// ---------------------------------------------------------------------------

function internalLoad({
	session,
	entry,
	statesLoad,
}: {
	session: LedgerSession
	entry: SessionLedgerEntry
	statesLoad: boolean
}): string | null {
	// A missed session has no cost to report. The block-level context the rule
	// also wants ("second quality session missed in this block") needs the other
	// sessions in the block, which one row does not have.
	if (entry.status === 'missed') return null
	if (entry.status === 'completed') {
		return clauses(
			!statesLoad && entry.load != null ? formatTss(entry.load) : null,
			entry.rpe != null ? `RPE ${entry.rpe}` : null,
		)
	}
	return plannedTargetLine(session, entry)
}

/**
 * What a planned session asks the athlete to hold: how far, at what pace, under
 * what ceiling. A lifting session has no TSS and no pace by decision (ADR 0046
 * §2), so its size is its set count — the Summary Count that stands in for a
 * load number.
 */
function plannedTargetLine(
	session: LedgerSession,
	entry: SessionLedgerEntry,
): string | null {
	const workout = session.workout
	if (!workout) return null
	if (entry.discipline === 'strength') {
		const sets = plannedWorkingSets(workout)
		// "First time at 90 kg" and "squat up 2.5 kg from Tuesday" need the lift's
		// own history, which nothing here has. The count is what is true.
		return sets > 0 ? `${sets} ${sets === 1 ? 'set' : 'sets'}` : null
	}
	const steps = workout.blocks.flatMap((block) => block.steps)
	const distance = sumBlockDistanceM(workout.blocks)
	const pace = paceWindow(steps, entry.discipline)
	const effort =
		distance != null && pace
			? `${formatDistance(distance)} at ${pace}`
			: (pace ?? (distance != null ? formatDistance(distance) : null))
	return clauses(effort, hrCeiling(steps))
}

type PlannedStep = NonNullable<
	LedgerSession['workout']
>['blocks'][number]['steps'][number]

/**
 * The session's pace window, or nothing. Every step that authors a pace has to
 * agree on it: a session whose warm-up and reps ask for different paces has no
 * single pace, and printing one of the two would be picking a favourite. A
 * discipline whose intensity is not a pace gets no clause here at all.
 */
function paceWindow(steps: PlannedStep[], discipline: string): string | null {
	if (discipline === 'bike') return powerWindow(steps)
	const authored = steps.filter((step) => step.intensityPaceMin != null)
	if (authored.length === 0) return null
	const distinct = new Set(
		authored.map(
			(step) => `${step.intensityPaceMin}:${step.intensityPaceMax ?? ''}`,
		),
	)
	if (distinct.size !== 1) return null
	const step = authored[0]!
	if (discipline === 'swim') {
		// A swim's authored pace is seconds per hundred metres, so it must not be
		// rendered by the per-kilometre formatter.
		return step.intensityPaceMax != null
			? `${formatPaceClock(step.intensityPaceMin!)}–${formatPaceClock(step.intensityPaceMax)} /100m`
			: `${formatPaceClock(step.intensityPaceMin!)} /100m`
	}
	return formatPaceRange(step.intensityPaceMin!, step.intensityPaceMax)
}

/** A ride's equivalent of the pace window, under the same agreement rule. */
function powerWindow(steps: PlannedStep[]): string | null {
	const authored = steps.filter((step) => step.intensityPowerMin != null)
	if (authored.length === 0) return null
	const distinct = new Set(
		authored.map(
			(step) => `${step.intensityPowerMin}:${step.intensityPowerMax ?? ''}`,
		),
	)
	if (distinct.size !== 1) return null
	const step = authored[0]!
	return step.intensityPowerMax != null
		? `${step.intensityPowerMin}–${step.intensityPowerMax} W`
		: `${step.intensityPowerMin} W`
}

/**
 * The session's heart-rate ceiling: the **loosest** cap any step authors. A cap
 * is a promise about the whole session, and the only cap true of every step is
 * the highest one — quoting the warm-up's 145 for a session whose reps allow
 * 172 would be a ceiling the athlete is meant to break.
 */
function hrCeiling(steps: PlannedStep[]): string | null {
	const caps = steps
		.map((step) => step.intensityHrMax)
		.filter((cap): cap is number => cap != null)
	if (caps.length === 0) return null
	return `under ${Math.max(...caps)} bpm`
}

/**
 * How many working sets the prescription asks for, counting a block's repeats.
 * Every prescribed set is a working set: a warm-up rung is generated when the
 * session opens and was never part of what was asked for.
 */
function plannedWorkingSets(
	workout: NonNullable<LedgerSession['workout']>,
): number {
	let total = 0
	for (const block of workout.blocks) {
		const repeats = blockRepeatTotal(block)
		for (const step of block.steps) {
			if (step.kind !== 'strength') continue
			total += step.sets.length * repeats
		}
	}
	return total
}

// ---------------------------------------------------------------------------
// The compliance chip
// ---------------------------------------------------------------------------

/**
 * **The chip names its basis and its band** — `TSS 88 / 91 · ON TARGET`, not a
 * bare "On target", because a band with the numbers hidden is an opinion. And
 * it only exists where both sides do.
 */
function complianceChip({
	session,
	entry,
	week,
	isToday,
}: {
	session: LedgerSession
	entry: SessionLedgerEntry
	week: RowWeekContext
	isToday: boolean
}): RowChip | null {
	// The week header already said this week came from before the plan. Saying it
	// again on every row in it is noise.
	if (week.imported) return null
	if (entry.status === 'missed') {
		return { id: 'compliance', label: 'MISSED', tone: 'bad' }
	}
	// Nothing has happened on a planned row, so there is nothing to comply with.
	// `isToday` is read only so that today's own chip can take the slot instead.
	if (entry.status === 'planned') {
		void isToday
		return null
	}
	if (unplanned(session)) {
		return {
			id: 'compliance',
			label: 'UNPLANNED · NO PLAN TO COMPARE',
			tone: 'muted',
		}
	}
	// `entry.adherence` is null unless both sides are present and the planned
	// side is positive — the gate lives in `sessionAdherence`, so this row and
	// Weekly Plan Adherence can never disagree about what is comparable.
	if (
		entry.adherence == null ||
		entry.load == null ||
		entry.plannedTss == null
	) {
		return null
	}
	return {
		id: 'compliance',
		label: `TSS ${formatLoad(entry.load)} / ${formatLoad(entry.plannedTss)} · ${entry.adherence.label.toUpperCase()}`,
		tone: entry.adherence.tone === 'on-target' ? 'primary' : 'warn',
	}
}

/**
 * Whether the session had no plan to compare against. A **recorded** session is
 * one the athlete just did; a **detected** one had its structure derived from
 * that very recording (ADR 0032/0033), so banding it would be the app grading a
 * ride against itself. Either way the honest chip says so rather than showing a
 * percentage that only looks like a comparison.
 */
function unplanned(session: LedgerSession): boolean {
	return session.source === 'recorded' || session.source === 'detected'
}
