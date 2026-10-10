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
 *   `UTENFOR PLANEN · INGEN PLAN Å SAMMENLIGNE MED`, never a fabricated percentage; an imported
 *   session gets no chip at all, because the week header already says the week
 *   came from before the plan and repeating it on every row is noise.
 * - **A missed session invents nothing.** `Nothing recorded` and `MISSED`. No
 *   line 2, because there was no cost.
 * - **An absent measurement is absent** (the Unavailable Metric principle).
 *   Every line here is assembled from the clauses that resolved and joined at
 *   the end, so a clause with no data behind it disappears instead of
 *   zero-filling.
 * - **A lifting session reads like every other row** (#491). Line 1 is the lifts
 *   and their kilos, from the set rows the athlete logged; line 2 is the sRPE
 *   figure *naming its own basis*, because a strength session's load is Foster's
 *   `hours × RPE × 15` and not a reading of the sets (ADR 0046 §2), and a number
 *   that looks derived from the bar when it is not is the kind of quiet claim
 *   this module exists to refuse. The set count rides a chip, so the row still
 *   says two things and refuses a third.
 *
 * Two things the handoff asks for are **deliberately not emitted**, and each one
 * is a missing input rather than a missing feature:
 *
 * - *HR drift, named against its 5 % threshold.* No stored field carries it. It
 *   would have to be derived from `ActivityStream`'s heart-rate samples, which
 *   a ledger row does not fetch. Printing a number here would mean inventing
 *   one.
 * - *The heart rate on the reps of a quality session.* Same reason: the reading
 *   is per-phase, and phase heart rates are not stored.
 *
 * And one is **somebody else's row**: the progression sentence ("squat up 5 kg
 * since the last Workout B") belongs to a *planned* lifting row, which is what a
 * program has already decided, not to a completed one, which is a result.
 */
import { sumBlockDistanceM } from '#app/utils/dashboard.ts'
import {
	formatDistance,
	formatDuration,
	formatLoad,
	formatMeters,
	formatPace,
	formatPaceClock,
	formatPaceRange,
	formatSpeed,
	formatTss,
} from '#app/utils/format.ts'
import {
	NB_ADHERENCE_CHIP_LABELS,
	NB_LOAD_WORDS,
	ROW_LABELS,
} from '#app/utils/labels.ts'
import { type SessionRow } from '#app/utils/session-ledger-rows.ts'
import {
	formatKg,
	type LoadValue,
	parseStoredLoadValue,
} from '#app/utils/strength-log.ts'
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
export type RowChipId = 'today' | 'compliance' | 'sets' | 'replan'

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
			label: ROW_LABELS.todayNotDone,
			tone: 'primary',
		})
	}
	if (compliance) chips.push(compliance)
	// A lifting session's size is its set count, which is the nearest thing it has
	// to the band the chip slot usually carries — so it sits where the band would.
	const sets = setsChip(session, entry)
	if (sets) chips.push(sets)
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
	return chip.id === 'compliance' && chip.label.startsWith('TSS ')
}

// ---------------------------------------------------------------------------
// Line 1 — external load
// ---------------------------------------------------------------------------

function externalLoad(
	session: LedgerSession,
	entry: SessionLedgerEntry,
): string | null {
	if (entry.status === 'missed') return ROW_LABELS.nothingRecorded
	if (entry.status === 'completed') {
		// A lifting session's actual is its set rows (ADR 0056) — never its
		// prescription's duration, which is not what it did.
		if (entry.discipline === 'strength') return liftedLine(session)
		return clauses(
			distanceClause(session, entry),
			entry.durationMin != null ? `${entry.durationMin} min` : null,
			rateClause(session, entry),
		)
	}
	return plannedLine(entry)
}

// ---------------------------------------------------------------------------
// Line 1, for a lifting session — what was lifted
// ---------------------------------------------------------------------------

/** One logged working set, as the ledger query hands it over. */
type LoggedWorkingSet = LedgerSession['setLogs'][number]

/**
 * `Back Squat 82.5 × 5 · Overhead Press 45 × 5 · Deadlift 105 × 5` — the lifts,
 * one clause each, in the order they were first touched.
 *
 * **One clause per lift, not one per run of neighbouring sets.** The line is a
 * list of what was lifted, not a transcript of the order it happened in, and the
 * two rules only ever agree when the sets arrive perfectly blocked. They do not:
 * a superset alternates by design, and a batch of sets written in the same
 * instant — an import, a backfill — arrives interleaved by set position with no
 * chronology to separate them. Grouping by neighbour turned a squat-and-press
 * day into seven clauses naming two lifts, which is not a session anybody
 * trained either. Every weight and every rep count still reaches the line, on
 * the lift that did them.
 *
 * The whole line is assembled from what the set rows actually state, so every
 * absence falls out rather than being handled: a lift with no readable load
 * states its reps, a lift with neither states only its name, and a session that
 * logged nothing says so instead of rendering a row full of zeroes.
 */
function liftedLine(session: LedgerSession): string | null {
	// **Not `null`, and not a zero-filled row.** A finished lifting session with
	// no set behind it is a real thing — a hand-marked day, an import — and the
	// honest reading is that nothing was logged, which is also what the `SETS 0 /
	// n` chip beside it says. `Nothing recorded` is kept for a *missed* session:
	// these are different facts and must not share a sentence.
	if (session.setLogs.length === 0) return ROW_LABELS.nothingLogged
	return clauses(...byLift(session.setLogs).map(liftClause))
}

/**
 * The sets of each lift, kept together, with the lifts in the order the first of
 * their sets appears. A set whose Step carried free-text instead of an
 * `Exercise` row has no lift to be filed under; those collect under one key and
 * are dropped by {@link liftClause}, since a lift with no name cannot be named.
 */
function byLift(sets: LoggedWorkingSet[]): LoggedWorkingSet[][] {
	const lifts = new Map<string | null, LoggedWorkingSet[]>()
	for (const set of sets) {
		const bucket = lifts.get(set.exerciseId)
		if (bucket) bucket.push(set)
		else lifts.set(set.exerciseId, [set])
	}
	return [...lifts.values()]
}

/** Split a list into runs of neighbours that answer `key` the same way. */
function consecutiveRuns<T>(
	items: T[],
	key: (item: T) => string | null,
): T[][] {
	const runs: T[][] = []
	for (const item of items) {
		const last = runs[runs.length - 1]
		if (last && key(last[0]!) === key(item)) last.push(item)
		else runs.push([item])
	}
	return runs
}

/**
 * One lift's clause. The name comes from the `Exercise` row the set was filed
 * under; a set with no exercise names no lift, so it is dropped from the line —
 * it is still counted by the chip, because it is still a set that happened.
 */
function liftClause(sets: LoggedWorkingSet[]): string | null {
	const name = sets[0]!.exercise?.name
	if (!name) return null
	// Split on the weight, so a lift that moved up mid-session reads `Back Squat
	// 80 × 5, 85 × 3` rather than naming one of its two weights for both.
	const worked = consecutiveRuns(sets, loadText)
		.map(workClause)
		.filter((part): part is string => !!part)
	// The name alone, where nothing about the work is readable. It is less than
	// the row wanted to say and it is all that is true.
	return worked.length > 0 ? `${name} ${worked.join(', ')}` : name
}

/**
 * `82.5 × 5` / `60 × 5,5,5,4` / `bodyweight × 8` — one weight and the reps done
 * at it. Either half may be missing, and the clause is what is left.
 *
 * The `×` stays on a count that lost its weight, because `Back Squat 5` could be
 * five kilos as easily as five reps and the multiplication sign is what settles
 * it.
 */
function workClause(sets: LoggedWorkingSet[]): string | null {
	const load = loadText(sets[0]!)
	const counts = countsText(sets)
	if (counts) return load ? `${load} × ${counts}` : `× ${counts}`
	return load
}

/**
 * What was on the bar, from the set's own **Load Value** — never from the baked
 * `effectiveKg`, which is a kilo whose meaning depends on the kind it came from
 * and reads as a bar weight on a line like this one (ADR 0058 §4 as amended).
 * A row whose load will not parse states no weight at all rather than a guess.
 *
 * Plain kilos are written bare — `82.5`, with the `× 5` beside them supplying
 * the reading, which is how the design's line is written and how a lifter says
 * it. Every other kind carries its own words from {@link loadValueText}, so a
 * bodyweight dip and an assisted pull-up can never be read as bar weights.
 * `perSide` is the one kind restated here: `loadValueText` writes it `2 × 22.5
 * kg`, and a second `×` immediately after it would read as one multiplication
 * too many.
 */
function loadText(set: LoggedWorkingSet): string | null {
	const load = parseStoredLoadValue(set.load)
	if (!load) return null
	if (load.kind === 'external') return formatKg(load.kg)
	if (load.kind === 'perSide')
		return `${formatKg(load.kg)} ${ROW_LABELS.perSide}`
	return nbLoadValueText(load)
}

/**
 * The counts, one per set, collapsed to a single figure when every set did the
 * same — `5` for five fives, `5,5,5,4` where the last one came up short, so a
 * shortfall is visible without arithmetic.
 */
function countsText(sets: LoggedWorkingSet[]): string | null {
	const counts = sets
		.map(countText)
		.filter((count): count is string => count != null)
	if (counts.length === 0) return null
	return new Set(counts).size === 1 ? counts[0]! : counts.join(',')
}

/** One set's count. A unilateral set keeps both of its rep counts: 10 left and
 * 8 right is one set with two numbers, and averaging them to 9 invents a rep
 * nobody did. A timed set counts in seconds, because that is what it was. */
function countText(set: LoggedWorkingSet): string | null {
	const reps = [set.reps, set.repsLeft].filter(
		(count): count is number => count != null,
	)
	if (reps.length > 0) return reps.join('/')
	return set.durationSec != null ? formatDuration(set.durationSec) : null
}

/**
 * A decimal figure as I dag writes it, with a comma — `9,2 km`, `24,0 km/h` —
 * the house format's digits with the Norwegian separator (#505 S9 review D2).
 * Only a point between two digits is a decimal point; nothing else moves.
 */
function nbDecimalComma(text: string): string {
	return text.replace(/(\d)\.(\d)/g, '$1,$2')
}

/** {@link formatDistance}, with the decimal comma. */
function nbDistance(metres: number): string {
	return nbDecimalComma(formatDistance(metres))
}

/** Kilometres for a run or a ride; metres for a swim, which is read that way. */
function distanceClause(
	session: LedgerSession,
	entry: SessionLedgerEntry,
): string | null {
	const metres = session.recording?.distanceM
	if (metres == null || metres <= 0) return null
	return entry.discipline === 'swim' ? formatMeters(metres) : nbDistance(metres)
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
			return nbDecimalComma(formatSpeed(distanceM / durationSec))
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
		return duration ? ROW_LABELS.planned(duration) : null
	}
	return clauses(duration, ROW_LABELS.planned(formatTss(entry.plannedTss)))
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
		if (entry.discipline === 'strength') return liftingCostLine(entry)
		return clauses(
			!statesLoad && entry.load != null ? formatTss(entry.load) : null,
			entry.rpe != null ? `RPE ${entry.rpe}` : null,
		)
	}
	return plannedTargetLine(session, entry)
}

/**
 * `sRPE 78 — from time and effort, not from the sets`.
 *
 * **The figure names its own basis, and it is not called TSS.** A strength
 * session resolves to no TSS at all for Training Load purposes; what is stored
 * is Foster's `hours × RPE × 15`, kept as a figure the athlete reads and never
 * one the app acts on (ADR 0046 §2). Printing `78 TSS` beside a line of kilos
 * invites exactly the reading the decision refuses — that the number came off
 * the bar — so the row states where it came from instead. Recomputing it *from*
 * the sets is a separate, unbuilt slice, and until it exists the honest thing is
 * to say which one this is.
 *
 * The RPE it was computed from is not repeated: `hours × RPE × 15` is one
 * reading of one input, and stating both is stating it twice. Where the figure
 * is missing but the RPE is not — a session logged before the figure was
 * computed — the RPE stands alone, because it is what there is.
 */
function liftingCostLine(entry: SessionLedgerEntry): string | null {
	if (entry.load != null) {
		return ROW_LABELS.srpe(formatLoad(entry.load))
	}
	return entry.rpe != null ? `RPE ${entry.rpe}` : null
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
		return sets > 0 ? ROW_LABELS.sets(sets) : null
	}
	const steps = workout.blocks.flatMap((block) => block.steps)
	const distance = sumBlockDistanceM(workout.blocks)
	const pace = paceWindow(steps, entry.discipline)
	const effort =
		distance != null && pace
			? ROW_LABELS.distanceAt(nbDistance(distance), pace)
			: (pace ?? (distance != null ? nbDistance(distance) : null))
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
	return ROW_LABELS.hrCeiling(Math.max(...caps))
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
// The sets chip
// ---------------------------------------------------------------------------

/**
 * `SETS 14 / 15` — how much of the prescription was actually lifted, in the only
 * currency a lifting session has.
 *
 * It is a **Summary Count** and not a second Adherence Band, for the reason ADR
 * 0046 §4 gives and ADR 0058 §3 repeats: a band's cut points are asymmetric on a
 * stated principle about volume overshoot, and no source supplies that
 * asymmetry for a set count. So the chip states the two numbers and leaves the
 * verdict to the tone — `warn` short of the prescription, `primary` once it is
 * met. That amber is what `--warning` was minted for.
 *
 * Both sides have to exist, exactly as no band exists without both of its own.
 * A session whose prescription authors no working set has no denominator, and
 * `SETS 3 / 0` is not a fraction — so the chip stays away and line 1 carries the
 * lifts on its own. A planned row is not counted at all: nothing has been lifted
 * yet, and its set count is already line 2's job as an instruction.
 */
function setsChip(
	session: LedgerSession,
	entry: SessionLedgerEntry,
): RowChip | null {
	if (entry.discipline !== 'strength') return null
	if (entry.status !== 'completed') return null
	const prescribed = session.workout ? plannedWorkingSets(session.workout) : 0
	if (prescribed <= 0) return null
	const logged = session.setLogs.length
	return {
		id: 'sets',
		label: ROW_LABELS.setsChip(logged, prescribed),
		tone: logged >= prescribed ? 'primary' : 'warn',
	}
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
		return { id: 'compliance', label: ROW_LABELS.missed, tone: 'bad' }
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
			label: ROW_LABELS.unplanned,
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
		label: `TSS ${formatLoad(entry.load)} / ${formatLoad(entry.plannedTss)} · ${NB_ADHERENCE_CHIP_LABELS[entry.adherence.tone]}`,
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

/**
 * A logged load that is not plain kilos, in the row's Norwegian — the same
 * kinds `loadValueText` words for the English surfaces, so a bodyweight dip and
 * an assisted pull-up can never be read as bar weights here either.
 */
function nbLoadValueText(load: LoadValue): string {
	switch (load.kind) {
		case 'external':
			return `${formatKg(load.kg)} kg`
		case 'perSide':
			return `${load.sides} × ${formatKg(load.kg)} kg`
		case 'bodyweight':
			return NB_LOAD_WORDS.bodyweight
		case 'bodyweightPlus':
			return `${NB_LOAD_WORDS.bodyweight} + ${formatKg(load.addedKg)} kg`
		case 'assisted':
			return `${NB_LOAD_WORDS.assisted} − ${formatKg(load.assistKg)} kg`
		case 'stackLevel':
			return load.label ?? NB_LOAD_WORDS.level(load.level)
		case 'band':
			return NB_LOAD_WORDS.band(load.band)
		case 'unloaded':
			return NB_LOAD_WORDS.unloaded
	}
}
