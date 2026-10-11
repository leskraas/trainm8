/**
 * **What a lift is logged at, and how many of what** — the reading the runner's
 * circles (ADR 0064) and the quick strength log on I dag (#505 S16) share, so
 * the two surfaces cannot log the same set two ways.
 *
 * Pure: no clock, no `prisma`. The runner's presenter re-exports the parts it
 * renders; the quick log's server reads them directly.
 */
import { formatNbKg } from '../format.ts'
import {
	RUNNER_LABELS,
	STRENGTH_RUNNER_LABELS as S,
	WORKING_LOAD_LABELS as W,
} from '../labels.ts'
import { type LogExercise, type LogRow } from '../strength-log.server.ts'
import { type LoadValue } from '../strength-log.ts'

/** What a set counts in: reps, or seconds for a timed hold. */
export type SetUnit = 'reps' | 'seconds'

/**
 * **The weight a tap posts, or the reason there is none.**
 *
 * This is the whole of ADR 0064's cost in one function: the grid no longer asks
 * the athlete what was on the bar, so the load has to come from the prescription
 * — and where the prescription does not resolve to a number in a `LoadValue`'s
 * own semantics, the honest answer is *no circles*, with the absence stated.
 *
 * `loadNumber` is in the load's **own** semantics, never the bodyweight-inclusive
 * total: a weighted dip posts the kilos on the belt, because that is what
 * `saveLoggedSet` stores and what the plate line is solved against.
 */
export type WorkingLoad =
	| {
			kind: 'resolved'
			/** The `LoadValue` member a tap posts. */
			loadKind:
				| 'external'
				| 'bodyweight'
				| 'bodyweightPlus'
				| 'assisted'
				| 'unloaded'
			/** The number a tap posts, or `''` where the kind carries none. */
			loadNumber: string
			/** The kilos, where the load has any — what the plate line solves. */
			kg: number | null
			/** `82.5 kg` / `bodyweight + 15 kg` — the sub-line's second half. */
			text: string
	  }
	| { kind: 'absent'; text: string; fix: string | null }

export function buildWorkingLoad(exercise: LogExercise): WorkingLoad {
	const row =
		exercise.rows.find(
			(r) => r.prescribedLoad != null || r.resolvedLoad != null,
		) ?? exercise.rows[0]
	const semantics = exercise.loadSemanticsKind
	if (!row) {
		return { kind: 'absent', text: W.noSets, fix: null }
	}
	const prescribed = row.prescribedLoad
	const resolution = row.resolvedLoad

	// **A stated absence is rendered as the absence.** ADR 0008's Unavailable
	// Metric, and the rule that regressed in #434: an unresolved `85 % 1RM` gets
	// its sentence and its fix, never a number and never a zero.
	if (resolution?.kind === 'unavailable') {
		return { kind: 'absent', text: resolution.text, fix: resolution.fix }
	}

	if (prescribed?.kind === 'bodyweight') {
		const added = prescribed.addedKg ?? 0
		return added > 0
			? {
					kind: 'resolved',
					loadKind: 'bodyweightPlus',
					loadNumber: postedNumber(added),
					kg: added,
					text: S.bodyweightPlus(formatNbKg(added)),
				}
			: {
					kind: 'resolved',
					loadKind: 'bodyweight',
					loadNumber: '',
					kg: null,
					text: S.bodyweight,
				}
	}

	if (prescribed == null && resolution == null) {
		// Nothing was authored, so only a kind that carries **no number** can be
		// posted without inventing one.
		if (semantics === 'bodyweight') {
			return {
				kind: 'resolved',
				loadKind: 'bodyweight',
				loadNumber: '',
				kg: null,
				text: S.bodyweight,
			}
		}
		if (semantics === 'unloaded') {
			return {
				kind: 'resolved',
				loadKind: 'unloaded',
				loadNumber: '',
				kg: null,
				text: S.load.unloaded,
			}
		}
		return {
			kind: 'absent',
			text: W.noLoad,
			fix: null,
		}
	}

	const kg =
		resolution?.kind === 'resolved'
			? resolution.kg
			: prescribed?.kind === 'absolute'
				? prescribed.kg
				: null
	if (kg == null) {
		return {
			kind: 'absent',
			text: W.noKilos,
			fix: null,
		}
	}

	// Which member of the union this lift's kilos **are**. A stated per-hand,
	// machine-level or band lift is none of them, and its absence is quoted in the
	// program's own words rather than solved as a bar.
	const loadKind =
		semantics == null || semantics === 'external'
			? 'external'
			: (semantics === 'bodyweightPlus' || semantics === 'assisted') &&
				  prescribed?.kind === 'absolute'
				? semantics
				: null
	if (loadKind == null) {
		return {
			kind: 'absent',
			text: W.notTappable(
				(RUNNER_LABELS.loadWords as Record<string, string>)[semantics ?? ''] ??
					W.thisLoad,
			),
			fix: null,
		}
	}
	return {
		kind: 'resolved',
		loadKind,
		loadNumber: postedNumber(kg),
		kg,
		text: `${formatNbKg(kg)} kg`,
	}
}

/**
 * The {@link LoadValue} a resolved working load is logged as — the member and
 * the number the runner's tap posts (`loadKind`, `loadNumber`), so a set logged
 * from I dag and re-tapped on the runner is the same load, not a restatement
 * (`saveLoggedSet`'s load-kind lock). Null where a kind that needs a number has
 * none.
 */
export function workingLoadValue(
	working: Extract<WorkingLoad, { kind: 'resolved' }>,
): LoadValue | null {
	const kg = working.loadNumber === '' ? null : Number(working.loadNumber)
	switch (working.loadKind) {
		case 'external':
			return kg != null && kg > 0 ? { kind: 'external', kg } : null
		case 'bodyweight':
			return { kind: 'bodyweight' }
		case 'bodyweightPlus':
			return kg != null && kg > 0
				? { kind: 'bodyweightPlus', addedKg: kg }
				: null
		case 'assisted':
			return kg != null && kg > 0 ? { kind: 'assisted', assistKg: kg } : null
		case 'unloaded':
			return { kind: 'unloaded' }
	}
}

/** One prescribed row as the circles count it: a timed hold in seconds,
 * everything else in reps. `target` is null where nothing was prescribed. */
export type PlannedRow = {
	orderIndex: number
	target: number | null
	unit: SetUnit
}

export function plannedRowsOf(rows: readonly LogRow[]): PlannedRow[] {
	return rows.map((row) => {
		const timed =
			row.prescribedReps == null && row.prescribedDurationSec != null
		return {
			orderIndex: row.orderIndex,
			target: timed ? row.prescribedDurationSec : row.prescribedReps,
			unit: timed ? 'seconds' : 'reps',
		}
	})
}

/**
 * A lift's scheme as a fact — how many sets, and the one count they all ask
 * for, if they do. The runner says it `5×5` / `5 sets`; I dag says `5×5` /
 * `5 sett`.
 */
export type LiftScheme = {
	sets: number
	same: { count: number; unit: SetUnit } | null
}

export function liftSchemeOf(rows: readonly LogRow[]): LiftScheme {
	const same = <T>(values: readonly (T | null)[]): T | null =>
		values[0] != null && values.every((v) => v === values[0]) ? values[0] : null
	const reps = same(rows.map((r) => r.prescribedReps))
	if (reps != null) {
		return { sets: rows.length, same: { count: reps, unit: 'reps' } }
	}
	const seconds = same(rows.map((r) => r.prescribedDurationSec))
	if (seconds != null) {
		return { sets: rows.length, same: { count: seconds, unit: 'seconds' } }
	}
	return { sets: rows.length, same: null }
}

/**
 * The scheme, as the card's sub-line says it — `5×5`, or `5 sets` where the rows
 * do not ask for the same count.
 *
 * A timed hold counts in seconds, because a hold has no reps to promise
 * (`isMissedSet`'s own distinction, one screen up).
 */
export function buildLiftScheme(rows: readonly LogRow[]): string | null {
	if (rows.length === 0) return null
	const { sets, same } = liftSchemeOf(rows)
	if (same?.unit === 'reps') return `${sets}×${same.count}`
	if (same?.unit === 'seconds') return `${sets}×${same.count} s`
	return sets === 1 ? '1 set' : `${sets} sets`
}

/**
 * `5×5 · 82.5 kg` — the one line under the lift's name, and the only place the
 * runner states the weight the program resolved.
 *
 * Where the weight is an absence, the absence takes the number's place. It never
 * reads `5×5 · 0 kg`.
 */
export function buildLiftSubline(exercise: LogExercise): string | null {
	const scheme = buildLiftScheme(exercise.rows)
	const load = buildWorkingLoad(exercise)
	const parts = [scheme, load.text].filter(
		(part): part is string => part != null && part !== '',
	)
	return parts.length ? parts.join(' · ') : null
}

/**
 * A kilo as a **posted field**, not as a rendered one.
 *
 * `formatNbKg` is for reading (`82,5`); this is for the wire, so `82.5` posts as `82.5` and
 * a percentage-derived `118.99999999999999` posts as `119` rather than as
 * seventeen digits the athlete never typed. Two decimals is the smallest plate
 * anybody owns, twice over.
 */
export function postedNumber(kg: number): string {
	return String(Number(kg.toFixed(2)))
}

/**
 * **How many working sets are still untapped** (owner decision 10): prescribed,
 * tappable, and not logged. Finish asks about these before folding, so an
 * untapped set never silently counts as made or as missed.
 *
 * A lift with no resolved weight is skipped: its circles cannot be tapped (the
 * sub-line says why), so there is nothing the athlete could have logged.
 * `isLogged` is the caller's own record — the server's set logs, or the
 * runner's map of taps — so both sides count by one rule.
 */
export function untappedWorkingSets(
	exercises: readonly LogExercise[],
	isLogged: (exercise: LogExercise, row: LogRow) => boolean,
): number {
	let untapped = 0
	for (const exercise of exercises) {
		if (buildWorkingLoad(exercise).kind !== 'resolved') continue
		for (const row of exercise.rows) {
			const target = row.prescribedReps ?? row.prescribedDurationSec
			if (target != null && !isLogged(exercise, row)) untapped += 1
		}
	}
	return untapped
}
