/**
 * A strength session as the sessions capabilities read and write it: the
 * prescription resolved to today's kilos, what is logged, last time, and the
 * plates. A translation of the strength logger's own view
 * (`getStrengthLogView`) into the engine's product terms; every rule about
 * what a load means stays in the domain.
 */
import { buildOutcomePanel } from '#app/routes/training/__runner-presenter.ts'
import {
	calculatePlates,
	type PlateRefusal,
	plateOptionsForKind,
} from '#app/utils/strength/plates.ts'
import { type LiftOutcome } from '#app/utils/strength/program-engine.ts'
import { type StrengthRecord } from '#app/utils/strength/records.ts'
import {
	buildWorkingLoad,
	untappedWorkingSets,
	workingLoadValue,
} from '#app/utils/strength/working-load.ts'
import {
	getStrengthLogView,
	type LogExercise,
	type LogRow,
	type StrengthLogView,
} from '#app/utils/strength-log.server.ts'
import { type LoadValue } from '#app/utils/strength-log.ts'
// The outcome sentences in Norwegian, as the strength logger says them.
import { type LoadTarget } from '#app/utils/workout-schema.ts'
import { nbLoadUnavailable, nbStrengthSentence } from '../nb.ts'
import {
	type LiftResult,
	type Plates,
	type PrescribedLoad,
	type SessionSnapshot,
	type StrengthExercise,
	type StrengthLoad,
	type StrengthRecordHit,
	type StrengthSessionOutput,
	type StrengthSet,
} from '../sessions.types.ts'
import { readSnapshot } from './snapshot.server.ts'

export function toStrengthLoad(load: LoadValue): StrengthLoad {
	switch (load.kind) {
		case 'external':
			return { kind: 'kg', kg: load.kg }
		case 'perSide':
			return { kind: 'kg-per-hand', kg: load.kg }
		case 'bodyweight':
			return { kind: 'bodyweight' }
		case 'bodyweightPlus':
			return { kind: 'bodyweight-plus', kg: load.addedKg }
		case 'assisted':
			return { kind: 'assisted', kg: load.assistKg }
		case 'stackLevel':
			return {
				kind: 'machine-level',
				level: load.level,
				...(load.label ? { label: load.label } : {}),
			}
		case 'band':
			return { kind: 'band', band: load.band }
		case 'unloaded':
			return { kind: 'none' }
	}
}

/** The domain's Load Value for what the athlete says was on the bar. */
export function toLoadValue(load: StrengthLoad): LoadValue {
	switch (load.kind) {
		case 'kg':
			return { kind: 'external', kg: load.kg }
		case 'kg-per-hand':
			return { kind: 'perSide', kg: load.kg, sides: 2 }
		case 'bodyweight':
			return { kind: 'bodyweight' }
		case 'bodyweight-plus':
			return { kind: 'bodyweightPlus', addedKg: load.kg }
		case 'assisted':
			return { kind: 'assisted', assistKg: load.kg }
		case 'machine-level':
			return {
				kind: 'stackLevel',
				level: load.level,
				...(load.label ? { label: load.label } : {}),
			}
		case 'band':
			return { kind: 'band', band: load.band }
		case 'none':
			return { kind: 'unloaded' }
	}
}

function nb(value: number): string {
	return String(value).replace('.', ',')
}

function prescribedLoadOf(target: LoadTarget | null): PrescribedLoad | null {
	if (!target) return null
	switch (target.kind) {
		case 'absolute':
			return { kind: 'kg', kg: target.kg, kgMax: null }
		case 'pct1RM':
			return {
				kind: 'reference',
				text: target.maxPct
					? `${nb(target.minPct)}–${nb(target.maxPct)} % av 1RM`
					: `${nb(target.minPct)} % av 1RM`,
			}
		case 'repMax':
			return { kind: 'reference', text: `${target.reps}RM` }
		case 'pctBodyweight':
			return { kind: 'reference', text: `${nb(target.pct)} % av kroppsvekt` }
		case 'bodyweight':
			return { kind: 'bodyweight', addedKg: target.addedKg ?? null }
		case 'velocity':
			return {
				kind: 'other',
				text: target.maxMs
					? `${nb(target.minMs)}–${nb(target.maxMs)} m/s`
					: `${nb(target.minMs)} m/s`,
			}
	}
}

const PLATE_REFUSAL_NB: Record<PlateRefusal, string> = {
	'stack-level-is-an-ordinal': 'Et nivå på stabelen har ingen kilo.',
	'band-is-a-force-curve': 'Et strikk har ingen kilo.',
	'unloaded-has-no-external-load': 'Øvelsen har ingen ekstra last.',
	'no-bodyweight-on-file': 'Kroppsvekten din er ukjent.',
	'assist-exceeds-bodyweight': 'Mer hjelp enn kroppsvekten din.',
	'no-dumbbell-rack-stated': 'Senteret har ikke sagt hvilke manualer det har.',
	'dumbbell-rack-is-empty': 'Senteret har ingen manualer.',
}

export function platesFor(
	kg: number,
	context: LogExercise['plateContext'],
): { plates: Plates | null; why?: string } {
	if (!context) {
		return { plates: null, why: 'Ingen treningssenter er beskrevet.' }
	}
	const options = plateOptionsForKind(
		context.options.kind ?? 'external',
		context.options,
	)
	if (!options) return { plates: null, why: 'Denne lasten tar ikke skiver.' }
	const solved = calculatePlates(kg, context.inventory, options)
	if (solved.outcome === 'unavailable') {
		return { plates: null, why: PLATE_REFUSAL_NB[solved.reason] }
	}
	return {
		plates: {
			perSide: solved.platesPerSide.flatMap((plate) =>
				Array.from({ length: plate.count }, () => plate.weightKg),
			),
			barKg: solved.barKg,
			madeKg: solved.achievedKg,
			exact: solved.outcome === 'exact',
		},
	}
}

function setOf(
	row: LogRow,
	exercise: LogExercise,
	warmup: boolean,
): StrengthSet {
	let kg: number | null = null
	let why: string | undefined
	let fix: string | undefined
	if (warmup && row.warmupRung) {
		kg = row.warmupRung.targetKg
	} else if (row.resolvedLoad?.kind === 'resolved') {
		kg = row.resolvedLoad.kg
	} else if (row.resolvedLoad?.kind === 'unavailable') {
		const said = nbLoadUnavailable(row.resolvedLoad)
		why = said.why
		fix = said.fix
	} else if (row.prescribedLoad?.kind === 'absolute') {
		kg = row.prescribedLoad.kg
	} else if (row.prescribedLoad == null) {
		why = 'Ingen vekt er satt for dette settet.'
	}
	const plates =
		kg != null && kg > 0 ? platesFor(kg, exercise.plateContext) : null
	const logged = row.logged
	return {
		setIndex: row.orderIndex,
		warmup,
		prescribed: {
			reps: row.prescribedReps,
			seconds: row.prescribedDurationSec,
			load: prescribedLoadOf(row.prescribedLoad),
			kg,
			...(why ? { kgUnknownBecause: why } : {}),
			...(fix ? { kgFix: fix } : {}),
		},
		plates: plates?.plates ?? null,
		...(plates?.why
			? { platesUnknownBecause: plates.why }
			: kg == null
				? { platesUnknownBecause: 'Ingen kilo å regne skiver for.' }
				: {}),
		logged: logged
			? {
					reps: logged.reps,
					seconds: logged.durationSec,
					load: logged.load ? toStrengthLoad(logged.load) : null,
					done: logged.outcome === 'completed',
					toFailure: logged.toFailure,
					repsInReserve: logged.rir,
				}
			: null,
		lastTime: row.ghost
			? {
					reps: row.ghost.reps,
					seconds: row.ghost.durationSec,
					load: toStrengthLoad(row.ghost.load),
				}
			: null,
	}
}

/** The load a tap logs on this lift, as the domain's runner posts it. */
export function defaultLoadOf(exercise: LogExercise): {
	load: LoadValue | null
	why?: string
} {
	const working = buildWorkingLoad(exercise)
	if (working.kind === 'absent') {
		// The working load reads the first row that says anything about its
		// load; when that row's load is unavailable, its sentence is the
		// resolver's English one, said here in Norwegian.
		const row =
			exercise.rows.find(
				(r) => r.prescribedLoad != null || r.resolvedLoad != null,
			) ?? exercise.rows[0]
		return {
			load: null,
			why:
				row?.resolvedLoad?.kind === 'unavailable'
					? nbLoadUnavailable(row.resolvedLoad).why
					: working.text,
		}
	}
	const value = workingLoadValue(working)
	return value
		? { load: value }
		: { load: null, why: 'Lasten trenger et tall.' }
}

function exerciseOf(exercise: LogExercise): StrengthExercise {
	const fallback = defaultLoadOf(exercise)
	return {
		stepId: exercise.stepId,
		exerciseId: exercise.exerciseId,
		name: exercise.name,
		restSeconds: exercise.restBetweenSetsSec,
		oneSideAtATime: exercise.unilateral,
		defaultLoad: fallback.load ? toStrengthLoad(fallback.load) : null,
		...(fallback.why ? { defaultLoadUnknownBecause: fallback.why } : {}),
		sets: [
			...exercise.warmupRows.map((row) => setOf(row, exercise, true)),
			...exercise.rows.map((row) => setOf(row, exercise, false)),
		],
		noWarmupBecause:
			exercise.warmupRows.length > 0
				? null
				: nbStrengthSentence(exercise.warmupUnavailable),
	}
}

export function strengthSetFrom(
	view: StrengthLogView,
	stepId: string,
	orderIndex: number,
): StrengthSet | null {
	const exercise = view.exercises.find((one) => one.stepId === stepId)
	if (!exercise) return null
	const warm = exercise.warmupRows.find((row) => row.orderIndex === orderIndex)
	if (warm) return setOf(warm, exercise, true)
	const row = exercise.rows.find((one) => one.orderIndex === orderIndex)
	return row ? setOf(row, exercise, false) : null
}

export function countWorking(view: StrengthLogView): {
	logged: number
	unlogged: number
} {
	const logged = view.exercises
		.flatMap((exercise) => exercise.rows)
		.filter(
			(row) =>
				row.logged != null &&
				row.logged.role !== 'warmup' &&
				row.logged.outcome === 'completed',
		).length
	return {
		logged,
		unlogged: untappedWorkingSets(
			view.exercises,
			(_, row) => row.logged != null,
		),
	}
}

/** The whole strength session, or null when it is not the athlete's. */
export async function readStrengthSession(
	userId: string,
	sessionId: string,
	timezone: string,
): Promise<
	| { ok: true; value: StrengthSessionOutput; view: StrengthLogView }
	| { ok: false; reason: 'not-found' | 'not-strength' }
> {
	const view = await getStrengthLogView(userId, sessionId)
	if (!view) return { ok: false, reason: 'not-found' }
	if (view.exercises.length === 0) return { ok: false, reason: 'not-strength' }
	const session = (await readSnapshot(
		userId,
		sessionId,
		timezone,
	)) as SessionSnapshot
	const counts = countWorking(view)
	return {
		ok: true,
		view,
		value: {
			session,
			bodyweightKg: view.bodyweightKg,
			hasGymOnFile: view.hasGymOnFile,
			program: view.program ? { name: view.program.name } : null,
			exercises: view.exercises.map(exerciseOf),
			loggedWorkingSets: counts.logged,
			unloggedWorkingSets: counts.unlogged,
		},
	}
}

const RECORD_KIND: Record<StrengthRecord['kind'], StrengthRecordHit['kind']> = {
	heaviestLoad: 'heaviest',
	repMax: 'rep-max',
	e1RM: 'estimated-1rm',
	stackLevel: 'machine-level',
}

export function recordHits(records: StrengthRecord[]): StrengthRecordHit[] {
	return records.map((record) => ({
		exerciseId: record.exerciseId,
		kind: RECORD_KIND[record.kind],
		reps: record.reps,
		value: record.value,
		unit: record.unit,
		previous: record.previousValue,
	}))
}

export function liftResults(
	outcomes: LiftOutcome[],
	names: Record<string, string>,
): LiftResult[] {
	const words = buildOutcomePanel(outcomes, names)
	return outcomes.map((outcome, index) => {
		const said = words[index]
		const result: LiftResult['result'] =
			outcome.kind === 'incremented'
				? 'goes-up'
				: outcome.kind === 'stalled'
					? 'goes-down'
					: outcome.kind === 'skipped'
						? 'skipped'
						: outcome.kind === 'liftedLighter'
							? 'lifted-lighter'
							: outcome.kind === 'unverifiable'
								? 'not-readable'
								: 'stays'
		return {
			exerciseId: outcome.exerciseId,
			name: names[outcome.exerciseId] ?? outcome.exerciseId,
			result,
			nextKg: outcome.standsAtKg,
			reason: said ? `${said.headline}. ${said.reason}` : outcome.reason,
		}
	})
}
