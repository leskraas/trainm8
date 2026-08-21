/**
 * The server half of the **program engine**: assemble what a Program Definition
 * and a Program Instance are, hand them to the pure engine, and write back what
 * it decided.
 *
 * Split exactly the way `strength-log.server.ts` is split from
 * `strength-log.ts`: **this file queries and writes and decides nothing.** Every
 * progression call — did the lift make the weight, does the increment fire, is
 * this the third miss, what does the Stall Response do — comes from
 * `app/utils/strength/program-engine.ts`, which is pure and is tested at the
 * higher seam. Nothing here re-implements a rule, and nothing here trusts a
 * posted number: the engine is re-run server-side over the rows that were
 * actually logged.
 *
 * ## The four things this file is responsible for
 *
 * 1. **Ownership scoping.** A `ProgramInstance` is reachable only by its
 *    athlete, and every read here is filtered by `userId` rather than checked
 *    after the fact.
 * 2. **The transactional advance, exactly once.** `applySession`'s resulting
 *    state and the appended weight and stall history land **together or not at
 *    all**. A half-written advance would leave a lift whose stall count and
 *    whose history disagree, and the history is the only honest answer to *"why
 *    did my squat drop 10 kg?"*. The same transaction **claims the session**
 *    by inserting a `ProgramSessionApplication` row on a unique index, so a
 *    double tap on Finish, a retried request or a back-button re-submit fold the
 *    log in once and the second attempt replays the first answer instead of
 *    advancing the program a second time — ADR 0056 §2's argument for the set-log
 *    upsert, applied to the write that cannot be re-derived from the set logs at
 *    all.
 * 3. **Lazy session generation, one at a time.** The *shape* is a system-authored
 *    `Workout` the definition already references; the **load resolves when the
 *    session is opened**, because week 6's weight is a function of week 5's log.
 *    Nothing is stamped ahead with a kilo on it. The resolved kilo lands on a
 *    copy of the shape that **belongs to the athlete** — never on the shared row
 *    every athlete on the program reads (ADR 0056 §2); see
 *    {@link openNextProgramSession}.
 * 4. **Saying what happened once, as a notice.** The outcomes come back with
 *    their reasons and the surface renders them; a **Stall Cut** is a notice with
 *    a reason and **offers nothing**, which is the Load Recompute Notice pattern
 *    one level down.
 *
 * ## Vocabulary
 *
 * **Stall Response**, **Stall Cut**, **Weight Rollback**, **Anchor Re-estimate**,
 * **Stall Count**. The word *deload* belongs to ADR 0047's planned week and does
 * not appear here.
 *
 * ## The two guards, and which one is idempotence
 *
 * **`ProgramSessionApplication` is the idempotence key, and only it.** One row
 * per `(instanceId, sessionId)`, inserted inside the advancing transaction, on a
 * unique index. The second insert fails on the constraint — in the database, on
 * a column that means *this session has been folded into this run* and nothing
 * else — and the whole second advance rolls back with it. The row carries the
 * first fold's `outcomes` verbatim, so a second Finish returns the original
 * sentences and the original timestamps rather than a restatement of them.
 *
 * **`WorkoutSession.status` still moves to `completed` in the same transaction,
 * and it guards nothing.** It is the athlete's statement that the session is
 * done — calendar and list state — and it is written here rather than after the
 * fold so that marking the session done and folding it in stay one write. It
 * used to be the idempotence guard too, as a conditional `UPDATE`; that was
 * atomic but rested on shared state, so anything that set a completed session
 * back to `scheduled` would have let the same log advance the program twice and
 * write the weight and stall history — the one state no set log can re-derive —
 * a second time.
 *
 * `restateRecordedSession` survives for exactly one case: a **legacy row**, one
 * the table's migration reconstructed from a lift's `weightHistory`, whose
 * `outcomes` and `appliedAt` are NULL because they were never recorded. Those
 * rows are restated the way every second Finish used to be; every row written
 * since is replayed verbatim.
 */
import { Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import {
	getExercisePlateContext,
	getGymProfile,
} from './plate-inventory.server.ts'
import { repLoadBasis, repLoadBasisText } from './strength/anchors.constants.ts'
import {
	estimateOneRm,
	gradeDownForRepLoadBasis,
	oneRmRefusalText,
} from './strength/one-rm.ts'
import { roundToLoadable } from './strength/plates.ts'
import {
	type AnchorReEstimator,
	type LiftOutcome,
	type LoadabilityBasisReader,
	type LoadableRounder,
	type NextSession,
	type ProgramInstanceState,
	type ProgramLiftState,
	type StallHistoryEntry,
	type StampedPrescriptionReader,
	type WeightHistoryEntry,
	applySession,
	nextSession,
} from './strength/program-engine.ts'
import {
	type Increment,
	type LiftProgressionRule,
	type LoggedWorkSet,
	type ProgramCursor,
	type ProgramCursorKind,
	type ProgramDefinition,
	type ProgramSetOutcome,
	type ProgramSetRole,
	type StallResponse,
	IncrementAdjustmentOnStallSchema,
	IncrementSchema,
	ProgramCursorSchema,
	ProgressionTriggerSchema,
	SetWeightSourceSchema,
	StallResponseSchema,
	SuccessPredicateSchema,
	liftIsOnDay,
	normaliseKg,
	prescribesAmrapLastSet,
} from './strength/program-rules.ts'
import { roundToDefaultStepKg } from './strength/program.constants.ts'
import {
	type EstimatorName,
	ESTIMATOR_NAMES,
	readStoredSetLoad,
} from './strength-log.ts'
import {
	type CopyableWorkout,
	copyWorkout,
	workoutCopySelect,
} from './workout.server.ts'

/** `active | paused | ended` — a run that stopped keeps every set logged under
 * it, which is why stopping is a status and never a delete. */
export const PROGRAM_INSTANCE_STATUSES = ['active', 'paused', 'ended'] as const
export type ProgramInstanceStatus = (typeof PROGRAM_INSTANCE_STATUSES)[number]

// ——— Reading a Program Definition ————————————————————————————————————————

/** One lift as the browse and start surfaces read it — the published numbers,
 * with the words the program itself uses. */
export type ProgramLiftSummary = {
	exerciseId: string
	equipment: string | null
	name: string
	dayIds: string[]
	setCount: number
	repsPerSet: number
	/** The program's own published starting weight, pre-offered so the athlete
	 * answers one question per lift and is never asked again. */
	defaultStartKg: number | null
	/** The program's other published seeding instruction — *"a weight you could
	 * lift for 10 reps"*. A rep count, not a weight: it needs no anchor. */
	startSeedRepMaxReps: number | null
	/** The **typed** increment, carried through rather than rendered here. A
	 * surface that wants `+2.5 kg, doubled at ≥10 reps` reads the union; nothing
	 * downstream parses a sentence back into numbers. */
	increment: Increment
	/** The **typed** Stall Response, for the same reason: which of the three
	 * remedies fires is a discriminated union, not an English clause. */
	stallResponse: StallResponse
	stallsBeforeResponse: number
}

export type ProgramCitation = {
	author: string | null
	work: string | null
	year: number | null
	locator: string | null
}

export type ProgramSummary = {
	id: string
	key: string
	variantId: string
	name: string
	dayIds: string[]
	/** Said out loud rather than smoothed over: which numbers are quoted, which
	 * are program convention with no trial behind them, and which are
	 * reverse-engineered. */
	provenanceNote: string | null
	citation: ProgramCitation
	lifts: ProgramLiftSummary[]
}

const programSelect = {
	id: true,
	key: true,
	variantId: true,
	name: true,
	cursorKind: true,
	initialCursor: true,
	provenanceNote: true,
	citationAuthor: true,
	citationWork: true,
	citationYear: true,
	citationLocator: true,
	days: {
		orderBy: { orderIndex: 'asc' as const },
		select: { dayId: true, workoutId: true },
	},
	liftRules: {
		orderBy: { orderIndex: 'asc' as const },
		select: {
			exerciseId: true,
			equipment: true,
			dayIds: true,
			setCount: true,
			repsPerSet: true,
			setWeightSources: true,
			trigger: true,
			successPredicate: true,
			increment: true,
			stallsBeforeResponse: true,
			stallResponse: true,
			incrementAdjustmentOnStall: true,
			defaultStartKg: true,
			startSeedRepMaxReps: true,
			exercise: { select: { name: true } },
		},
	},
} as const

type ProgramRow = {
	id: string
	key: string
	variantId: string
	name: string
	cursorKind: string
	initialCursor: string
	provenanceNote: string | null
	citationAuthor: string | null
	citationWork: string | null
	citationYear: number | null
	citationLocator: string | null
	days: { dayId: string; workoutId: string }[]
	liftRules: {
		exerciseId: string
		equipment: string | null
		dayIds: string
		setCount: number
		repsPerSet: number
		setWeightSources: string
		trigger: string
		successPredicate: string
		increment: string
		stallsBeforeResponse: number
		stallResponse: string
		incrementAdjustmentOnStall: string
		defaultStartKg: number | null
		startSeedRepMaxReps: number | null
		exercise: { name: string } | null
	}[]
}

/** Parse-don't-trust at the seam: a JSON column that does not parse is a rule
 * this app cannot honour, and the lift is dropped rather than run on a guess. */
function parseRule(
	row: ProgramRow['liftRules'][number],
): LiftProgressionRule | null {
	try {
		const dayIds = JSON.parse(row.dayIds)
		const sources = SetWeightSourceSchema.array().safeParse(
			JSON.parse(row.setWeightSources),
		)
		const trigger = ProgressionTriggerSchema.safeParse(JSON.parse(row.trigger))
		const predicate = SuccessPredicateSchema.safeParse(
			JSON.parse(row.successPredicate),
		)
		const increment = IncrementSchema.safeParse(JSON.parse(row.increment))
		const stallResponse = StallResponseSchema.safeParse(
			JSON.parse(row.stallResponse),
		)
		const adjustment = IncrementAdjustmentOnStallSchema.safeParse(
			JSON.parse(row.incrementAdjustmentOnStall),
		)
		if (
			!Array.isArray(dayIds) ||
			!sources.success ||
			!trigger.success ||
			!predicate.success ||
			!increment.success ||
			!stallResponse.success ||
			!adjustment.success
		) {
			return null
		}
		return {
			exerciseId: row.exerciseId,
			equipment: row.equipment,
			dayIds: dayIds.filter((id: unknown) => typeof id === 'string'),
			setCount: row.setCount,
			repsPerSet: row.repsPerSet,
			setWeightSources: sources.data,
			trigger: trigger.data,
			successPredicate: predicate.data,
			increment: increment.data,
			stallsBeforeResponse: row.stallsBeforeResponse,
			stallResponse: stallResponse.data,
			incrementAdjustmentOnStall: adjustment.data,
			defaultStartKg: row.defaultStartKg,
			startSeedRepMaxReps: row.startSeedRepMaxReps,
		}
	} catch {
		return null
	}
}

function parseCursor(raw: string): ProgramCursor | null {
	try {
		const parsed = ProgramCursorSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

function toDefinition(row: ProgramRow): ProgramDefinition | null {
	const initialCursor = parseCursor(row.initialCursor)
	if (!initialCursor) return null
	const liftRules = row.liftRules
		.map(parseRule)
		.filter((rule): rule is LiftProgressionRule => rule != null)
	return {
		id: row.id,
		key: row.key,
		variantId: row.variantId,
		name: row.name,
		cursorKind: row.cursorKind as ProgramCursorKind,
		initialCursor,
		dayIds: row.days.map((day) => day.dayId),
		liftRules,
		provenanceNote: row.provenanceNote,
	}
}

/** What the increment says, in the program's own terms. The four bases are not
 * interchangeable and none of them is flattened to "+2.5 kg" here. */
function incrementText(increment: Increment): string {
	switch (increment.kind) {
		case 'absolute':
			return `+${trim(increment.deltaKg)} kg`
		case 'pctOfLastTopSet':
			return `+${trim(increment.pct)} % of the last top set`
		case 'byAmrapReps':
			return `by the reps on the last set (${increment.table
				.map((row) => `${row.minReps}+ → +${trim(row.deltaKg)} kg`)
				.join(', ')})`
		case 'multipliedOnAmrap':
			return `+${trim(increment.baseDeltaKg)} kg, doubled at ${increment.atOrAboveReps}+ reps on the last set`
	}
}

function trim(value: number): string {
	return Number.isInteger(value) ? String(value) : String(value)
}

function toSummary(
	row: ProgramRow,
	definition: ProgramDefinition,
): ProgramSummary {
	const names = new Map(
		row.liftRules.map((rule) => [
			rule.exerciseId,
			rule.exercise?.name ?? 'Lift',
		]),
	)
	return {
		id: definition.id,
		key: definition.key,
		variantId: definition.variantId,
		name: definition.name,
		dayIds: definition.dayIds,
		provenanceNote: definition.provenanceNote,
		citation: {
			author: row.citationAuthor,
			work: row.citationWork,
			year: row.citationYear,
			locator: row.citationLocator,
		},
		lifts: definition.liftRules.map((rule) => ({
			exerciseId: rule.exerciseId,
			equipment: rule.equipment,
			name: names.get(rule.exerciseId) ?? 'Lift',
			dayIds: rule.dayIds,
			setCount: rule.setCount,
			repsPerSet: rule.repsPerSet,
			defaultStartKg: rule.defaultStartKg,
			startSeedRepMaxReps: rule.startSeedRepMaxReps,
			increment: rule.increment,
			stallResponse: rule.stallResponse,
			stallsBeforeResponse: rule.stallsBeforeResponse,
		})),
	}
}

/**
 * **The order the browse surface lists programs in**, stated rather than
 * alphabetical.
 *
 * The rule is *most-run beginner program first, then decreasing prescriptiveness*
 * — StrongLifts 5×5 is the one a first-time lifter has heard of and the one whose
 * rule needs no explanation, Starting Strength is its stricter cousin, and
 * GreySkull LP asks the athlete to judge an AMRAP set. Alphabetical order put
 * GreySkull first and StrongLifts last, which is the exact reverse of what a
 * beginner should read first.
 *
 * A program not named here sorts after these, by name, so seeding a fourth
 * program cannot hide it.
 */
const PROGRAM_DISPLAY_ORDER = [
	'prog_stronglifts_5x5_basic',
	'prog_starting_strength_phase1',
	'prog_greyskull_lp_base',
] as const

function programDisplayRank(programId: string): number {
	const index = (PROGRAM_DISPLAY_ORDER as readonly string[]).indexOf(programId)
	return index === -1 ? PROGRAM_DISPLAY_ORDER.length : index
}

/** Every seeded program, for the browse surface. Definitions are shared content
 * and are not scoped to an athlete; a *run* of one is. */
export async function listPrograms(): Promise<ProgramSummary[]> {
	const rows = await prisma.strengthProgram.findMany({
		where: { authorship: 'system' },
		orderBy: { name: 'asc' },
		select: programSelect,
	})
	return rows
		.flatMap((row) => {
			const definition = toDefinition(row)
			return definition ? [toSummary(row, definition)] : []
		})
		.sort((a, b) => programDisplayRank(a.id) - programDisplayRank(b.id))
}

export async function getProgram(
	programId: string,
): Promise<ProgramSummary | null> {
	const row = await prisma.strengthProgram.findUnique({
		where: { id: programId },
		select: programSelect,
	})
	if (!row) return null
	const definition = toDefinition(row)
	return definition ? toSummary(row, definition) : null
}

// ——— Starting a run ———————————————————————————————————————————————————————

export type StartingWeightInput = {
	exerciseId: string
	equipment: string | null
	weightKg: number
}

/**
 * **The training max a percentage family needs on day one**, or `null` for the
 * absolute-increment family, which needs none of it.
 *
 * 5/3/1 and nSuns prescribe every set as a percentage of a training max, so a
 * run started without one resolves every load to `no-training-max` and the
 * program cannot be run at all. The one number the athlete stated is their max
 * for the lift, and the training max is the program's own published fraction of
 * it — the same fraction an **Anchor Re-estimate** later resets it to, so
 * starting and re-estimating write the same construct.
 *
 * **The training max has no evidence base** (ADR 0059): it ships as a documented
 * product convention, which is why `workingFraction` is stored explicitly beside
 * it rather than folded into the kilo as a silent multiplier.
 */
function startingTrainingMax(
	rule: LiftProgressionRule,
	statedMaxKg: number,
): { trainingMaxKg: number; workingFraction: number } | null {
	if (rule.stallResponse.kind !== 'anchorReEstimate') return null
	const pct = rule.stallResponse.trainingMaxPct
	return {
		trainingMaxKg: normaliseKg(statedMaxKg * (pct / 100)),
		workingFraction: pct / 100,
	}
}

export type StartProgramResult =
	| { ok: true; instanceId: string }
	| { ok: false; reason: 'no-such-program' | 'no-starting-weights' }

/**
 * Start a program: one number per lift, and the athlete is never asked again.
 *
 * A lift the athlete gave no weight for falls back to the program's **own
 * published default** where it has one (StrongLifts' empty bar). Where the
 * program publishes no default — Starting Strength and GreySkull both seed from
 * a tested weight rather than a fixed number — the lift is left out rather than
 * started at an invented kilo.
 */
export async function startProgram(input: {
	userId: string
	programId: string
	startedOn: Date
	startingWeights: StartingWeightInput[]
}): Promise<StartProgramResult> {
	const row = await prisma.strengthProgram.findUnique({
		where: { id: input.programId },
		select: programSelect,
	})
	if (!row) return { ok: false, reason: 'no-such-program' }
	const definition = toDefinition(row)
	if (!definition) return { ok: false, reason: 'no-such-program' }

	const stated = new Map(
		input.startingWeights
			.filter((entry) => Number.isFinite(entry.weightKg) && entry.weightKg > 0)
			.map((entry) => [`${entry.exerciseId}::${entry.equipment ?? ''}`, entry]),
	)
	const liftStates = definition.liftRules.flatMap((rule) => {
		const key = `${rule.exerciseId}::${rule.equipment ?? ''}`
		const weightKg = stated.get(key)?.weightKg ?? rule.defaultStartKg
		if (weightKg == null) return []
		const trainingMax = startingTrainingMax(rule, weightKg)
		return [
			{
				exerciseId: rule.exerciseId,
				equipment: rule.equipment,
				currentWorkingWeightKg: weightKg,
				unroundedWorkingWeightKg: weightKg,
				trainingMaxKg: trainingMax?.trainingMaxKg ?? null,
				workingFraction: trainingMax?.workingFraction ?? null,
				stallCount: 0,
				currentIncrement: JSON.stringify(rule.increment),
				stallCutPctOverride: null,
				progressEveryNSessionsOverride: null,
				weightHistory: '[]',
				stallHistory: '[]',
			},
		]
	})
	if (liftStates.length === 0)
		return { ok: false, reason: 'no-starting-weights' }

	const instance = await prisma.programInstance.create({
		select: { id: true },
		data: {
			programId: definition.id,
			variantId: definition.variantId,
			userId: input.userId,
			startedOn: input.startedOn,
			status: 'active',
			cursor: JSON.stringify(definition.initialCursor),
			liftStates: { create: liftStates },
		},
	})
	return { ok: true, instanceId: instance.id }
}

// ——— Reading a run ————————————————————————————————————————————————————————

const instanceSelect = {
	id: true,
	programId: true,
	variantId: true,
	status: true,
	startedOn: true,
	/** **When the run row itself was written** — the only fact that separates
	 * this run's sessions from a previous run's on the same day, because
	 * `startedOn` is a day the athlete states and two runs can state the same
	 * one. See {@link runOwnSessionWhere}. */
	createdAt: true,
	cursor: true,
	liftStates: {
		select: {
			exerciseId: true,
			equipment: true,
			currentWorkingWeightKg: true,
			unroundedWorkingWeightKg: true,
			trainingMaxKg: true,
			workingFraction: true,
			stallCount: true,
			currentIncrement: true,
			stallCutPctOverride: true,
			progressEveryNSessionsOverride: true,
			weightHistory: true,
			stallHistory: true,
			exercise: { select: { name: true } },
		},
	},
} as const

type InstanceRow = {
	id: string
	programId: string
	variantId: string
	status: string
	startedOn: Date
	createdAt: Date
	cursor: string
	liftStates: {
		exerciseId: string
		equipment: string | null
		currentWorkingWeightKg: number
		unroundedWorkingWeightKg: number | null
		trainingMaxKg: number | null
		workingFraction: number | null
		stallCount: number
		currentIncrement: string
		stallCutPctOverride: number | null
		progressEveryNSessionsOverride: number | null
		weightHistory: string
		stallHistory: string
		exercise: { name: string } | null
	}[]
}

function parseJsonArray<T>(raw: string): T[] {
	try {
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? (parsed as T[]) : []
	} catch {
		return []
	}
}

function toLiftState(row: InstanceRow['liftStates'][number]): ProgramLiftState {
	const increment = (() => {
		try {
			const parsed = IncrementSchema.safeParse(JSON.parse(row.currentIncrement))
			return parsed.success ? parsed.data : null
		} catch {
			return null
		}
	})()
	return {
		exerciseId: row.exerciseId,
		equipment: row.equipment,
		currentWorkingWeightKg: row.currentWorkingWeightKg,
		unroundedWorkingWeightKg: row.unroundedWorkingWeightKg,
		trainingMaxKg: row.trainingMaxKg,
		workingFraction: row.workingFraction,
		stallCount: row.stallCount,
		// A stored increment that does not parse would silently become a different
		// program's rule, so it becomes "no jump" and the surface shows a repeat.
		currentIncrement: increment ?? { kind: 'absolute', deltaKg: 0 },
		stallCutPctOverride: row.stallCutPctOverride,
		progressEveryNSessionsOverride: row.progressEveryNSessionsOverride,
		weightHistory: parseJsonArray(row.weightHistory),
		stallHistory: parseJsonArray(row.stallHistory),
	}
}

function toInstanceState(row: InstanceRow): ProgramInstanceState | null {
	const cursor = parseCursor(row.cursor)
	if (!cursor) return null
	return {
		programId: row.programId,
		variantId: row.variantId,
		cursor,
		lifts: row.liftStates.map(toLiftState),
	}
}

/** The instance, its definition and its parsed state — the one read every other
 * function here starts from. **Scoped by `userId`**, so a run is reachable only
 * by its athlete. */
async function loadRun(
	userId: string,
	instanceId: string,
	db: Prisma.TransactionClient = prisma,
) {
	const instance = (await db.programInstance.findFirst({
		where: { id: instanceId, userId },
		select: instanceSelect,
	})) as InstanceRow | null
	if (!instance) return null
	const programRow = (await db.strengthProgram.findUnique({
		where: { id: instance.programId },
		select: programSelect,
	})) as ProgramRow | null
	if (!programRow) return null
	const definition = toDefinition(programRow)
	const state = toInstanceState(instance)
	if (!definition || !state) return null
	return { instance, programRow, definition, state }
}

/**
 * **Which scheduled session belongs to *this* run of the program.**
 *
 * A run mints its sessions lazily, and nothing on `WorkoutSession` names the
 * run, so ownership is read off the two facts that do bound it:
 *
 * 1. **`scheduledAt >= startedOn`** — a session dated before the run began is
 *    not a session of it.
 * 2. **`createdAt >= instance.createdAt`** — a session *written* before the run
 *    row existed cannot be one of its sessions. This is the guard that
 *    `startedOn` alone could not give: `startedOn` is a **day the athlete
 *    states**, so a run started today and a session opened earlier today by a
 *    run the athlete already stopped both sit on the same date, and the new run
 *    adopted the stale session — handing out a prescription from a program that
 *    had been ended. Row age is the one ordering that cannot collide that way.
 *
 * Plus the two conditions that are about the session rather than the run: it has
 * not already been folded into a run (`programApplications`), and it is on this
 * day's shape — either the shared shape itself, for a session opened before the
 * load was materialised, or the athlete's stamped copy of it.
 *
 * Shared by the overview and by opening, deliberately: two different answers to
 * *"which session is open"* is the two surfaces quoting two different weights.
 */
function runOwnSessionWhere(
	userId: string,
	instance: { startedOn: Date; createdAt: Date },
	dayWorkoutId: string,
): Prisma.WorkoutSessionWhereInput {
	return {
		userId,
		status: 'scheduled',
		scheduledAt: { gte: instance.startedOn },
		createdAt: { gte: instance.createdAt },
		programApplications: { none: {} },
		OR: [
			{ workoutId: dayWorkoutId },
			{ workout: { copiedFromId: dayWorkoutId } },
		],
	}
}

/**
 * **The production wiring of the engine's {@link LoadableRounder} seam** — what
 * *this* athlete's rack can actually make of a number.
 *
 * The engine may not prescribe a weight nobody can load. 10 % off 22.5 kg is
 * 20.25 kg, and the app used to store exactly that, then say `20.3` on the
 * overview, `20.25` in the grid and *"your gym makes 20 kg"* under the plate
 * line — three numbers for one prescription. The rounding rule is **not
 * reimplemented here**: `roundToLoadable` is `calculatePlates` run backwards, so
 * a rounded weight is by construction a weight the solver can lay out in plates,
 * and the two can never disagree.
 *
 * Three answers, in order of how much this app knows:
 *
 * 1. **A gym on file** — the plate solver against that inventory and this
 *    exercise's Load Semantics, ties going to the lighter weight.
 * 2. **A load with no honest kilo** (stack level, band, unloaded hold) — the
 *    solver refuses, and so does this: `null` tells the engine to leave the
 *    number alone rather than force an ordinal through a kilo rounding
 *    (ADR 0056 §3, ADR 0008).
 * 3. **No gym described at all** — {@link roundToDefaultStepKg}, a stated 2.5 kg
 *    step rather than a guessed rack. Inventing an inventory would be a claim
 *    about somebody's gym; a named default is not.
 *
 * Built once per call and resolved per exercise up front, so folding a session
 * does not issue a query per kilo.
 */
async function buildLoadableRounder(
	userId: string,
	exerciseIds: string[],
): Promise<{
	roundToLoadable: LoadableRounder
	loadabilityBasis: LoadabilityBasisReader
}> {
	const gym = await getGymProfile(userId)
	// **Which of the three answers was given is part of the answer.** The engine's
	// sentence used to say *"27 kg is not a weight that can be loaded"* about an
	// athlete with no gym on file at all — a claim about a rack nobody had
	// described. So the basis travels beside the number: no gym means the stated
	// default step, and the sentence says exactly that.
	if (!gym) {
		return {
			roundToLoadable: ({ kg }) => roundToDefaultStepKg(kg),
			loadabilityBasis: () => 'default-step',
		}
	}

	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { weightKg: true },
	})
	const contexts = new Map(
		await Promise.all(
			[...new Set(exerciseIds)].map(
				async (exerciseId) =>
					[
						exerciseId,
						await getExercisePlateContext({
							userId,
							exerciseId,
							bodyweightKg: profile?.weightKg ?? null,
							gym,
						}),
					] as const,
			),
		),
	)
	return {
		roundToLoadable: ({ exerciseId, kg }) => {
			const context = contexts.get(exerciseId)
			if (!context) return roundToDefaultStepKg(kg)
			return roundToLoadable(kg, context.inventory, context.options)
		},
		loadabilityBasis: ({ exerciseId }) =>
			contexts.has(exerciseId) ? 'inventory' : 'default-step',
	}
}

/**
 * **Today's line, restated in the open session's own stamped kilos.**
 *
 * Only where the stamp actually prices a set: a set the stamp left unpriced is
 * left as the resolution found it, because an unstamped set is the absence of a
 * number and not a statement that there is none.
 */
function withStampedLoads(
	today: NextSession,
	stamped: StampedPrescriptionReader,
): NextSession {
	return {
		...today,
		lifts: today.lifts.map((lift) => {
			const kgs = stamped(lift)
			if (!kgs) return lift
			return {
				...lift,
				sets: lift.sets.map((set, index) => {
					const kg = kgs[index]
					if (kg == null) return set
					return {
						...set,
						weight: {
							kind: 'resolved' as const,
							kg,
							unroundedKg: kg,
							basis: 'the weight this session was stamped with',
						},
					}
				}),
			}
		}),
	}
}

export type ProgramLiftOverview = {
	exerciseId: string
	equipment: string | null
	name: string
	currentWorkingWeightKg: number
	/** Shown only where it is non-zero: a lift on zero has nothing to say. */
	stallCount: number
	incrementText: string
	/** The most recent **Stall Response** on this lift, if any — the honest answer
	 * to *"why did my squat drop 10 kg?"*. */
	lastStall: {
		fromKg: number
		toKg: number
		response: string
	} | null
}

export type ProgramOverview = {
	instanceId: string
	status: ProgramInstanceStatus
	startedOn: Date
	program: ProgramSummary
	/**
	 * What today's session is.
	 *
	 * Its loads are resolved **now** — until a session is open and being logged,
	 * at which point they are that session's **own stamped kilos**. See
	 * {@link openSessionId}.
	 */
	today: NextSession
	/**
	 * **The session that is open and being logged, if there is one** — and the
	 * reason `today` can be a stamp rather than a resolution.
	 *
	 * The grid is frozen at its stamp on purpose: re-stamping a session with sets
	 * already logged against it would move the target out from under them. The
	 * overview, resolving live, therefore said 50 kg about a grid one tap away that
	 * said 60 — one prescription, two numbers, and neither labelled. The grid is
	 * the correct one, because it is the one the athlete is lifting to, so once a
	 * session is being logged this line states the session's own numbers and says
	 * so.
	 */
	openSessionId: string | null
	/**
	 * **Whether that open session's stamp is frozen or still movable**, and the
	 * reason the surface can say which.
	 *
	 * With sets logged against it the stamp cannot move: re-cutting it would shift
	 * the target out from under rows already filled in, so a working weight saved
	 * here takes effect on the *next* session. With nothing logged against it,
	 * `openNextProgramSession` re-stamps it on the next open — so a working weight
	 * saved here takes effect on *this* one. Two different consequences for the
	 * same action, and the athlete is told which they are getting.
	 */
	openSessionHasLoggedSets: boolean
	/** The lift names for the resolved session, so the surface stays dumb. */
	liftNames: Record<string, string>
	/** Which day the cursor names after today's — *what is next*, from a stored
	 * cursor and never from counting sessions. */
	nextDayId: string | null
	lifts: ProgramLiftOverview[]
}

/**
 * Everything the program overview reads: the working weight per lift, the Stall
 * Count where it is non-zero, what today's session is, and what is next.
 *
 * The loads in `today` are resolved at the moment this is called. Nothing was
 * stamped weeks ago, because week 6's weight is a function of week 5's log.
 */
export async function getProgramOverview(
	userId: string,
	instanceId: string,
	now: Date = new Date(),
): Promise<ProgramOverview | null> {
	const run = await loadRun(userId, instanceId)
	if (!run) return null
	const { instance, programRow, definition, state } = run

	const summary = toSummary(programRow, definition)
	// The same rounder the session copy is stamped with, so the overview and the
	// grid cannot name two different weights for one prescription.
	const today = nextSession(state, definition, now.toISOString(), {
		roundToLoadable: (
			await buildLoadableRounder(
				userId,
				definition.liftRules.map((rule) => rule.exerciseId),
			)
		).roundToLoadable,
	})
	// **The session the athlete has open**, if any: scheduled, and not yet folded
	// in. That is the one carrying a stamp, and therefore the one `today` has to
	// quote.
	//
	// **`setLogs: { some: {} }` used to be a third condition here, and it made the
	// two surfaces disagree.** A session opened with nothing logged against it yet
	// was invisible to this query, so the overview live-resolved and said
	// *"Back Squat 5×5 @ 150 kg"* while that same session's grid, one tap away, was
	// asking for 77.5 kg. The stamp exists from the moment the session is opened,
	// so it is honoured from that moment. Whether anything has been logged against
	// it is a **separate** fact, and it is reported separately, because it decides
	// whether the stamp is frozen or will be re-cut on the next open.
	const todayDay = programRow.days.find(
		(candidate) => candidate.dayId === today.dayId,
	)
	const openSession = todayDay
		? await prisma.workoutSession.findFirst({
				where: runOwnSessionWhere(userId, instance, todayDay.workoutId),
				orderBy: { scheduledAt: 'desc' },
				select: {
					id: true,
					workoutId: true,
					_count: { select: { setLogs: true } },
				},
			})
		: null
	const stampedToday = openSession
		? withStampedLoads(
				today,
				await readStampedPrescription(openSession.workoutId),
			)
		: today

	const names = new Map(
		instance.liftStates.map((row) => [
			row.exerciseId,
			row.exercise?.name ?? 'Lift',
		]),
	)
	for (const rule of programRow.liftRules) {
		if (!names.has(rule.exerciseId)) {
			names.set(rule.exerciseId, rule.exercise?.name ?? 'Lift')
		}
	}

	const dayIndex = definition.dayIds.indexOf(today.dayId ?? '')
	const nextDayId =
		dayIndex === -1
			? null
			: (definition.dayIds[(dayIndex + 1) % definition.dayIds.length] ?? null)

	return {
		instanceId: instance.id,
		status: instance.status as ProgramInstanceStatus,
		startedOn: instance.startedOn,
		program: summary,
		today: stampedToday,
		openSessionId: openSession?.id ?? null,
		openSessionHasLoggedSets: (openSession?._count.setLogs ?? 0) > 0,
		liftNames: Object.fromEntries(names),
		nextDayId,
		lifts: state.lifts.map((lift) => {
			const stalls = lift.stallHistory as StallHistoryEntry[]
			const last = stalls.length > 0 ? stalls[stalls.length - 1]! : null
			return {
				exerciseId: lift.exerciseId,
				equipment: lift.equipment,
				name: names.get(lift.exerciseId) ?? 'Lift',
				currentWorkingWeightKg: lift.currentWorkingWeightKg,
				stallCount: lift.stallCount,
				incrementText: incrementText(lift.currentIncrement),
				lastStall: last
					? { fromKg: last.fromKg, toKg: last.toKg, response: last.response }
					: null,
			}
		}),
	}
}

/** The athlete's runs, newest first — for the browse surface's *"you are already
 * running this"*. */
export async function listProgramInstances(userId: string) {
	return prisma.programInstance.findMany({
		where: { userId },
		orderBy: { startedOn: 'desc' },
		select: {
			id: true,
			programId: true,
			status: true,
			startedOn: true,
			program: { select: { name: true } },
		},
	})
}

/**
 * The active run whose day shape this session prescribes, **through the copy**.
 *
 * A program session points at the athlete's own stamped copy of the day shape,
 * so a lookup that compares the session's `workoutId` to
 * `StrengthProgramDay.workoutId` finds nothing. This resolves the one hop up
 * `copiedFromId` that the copy introduced, and keeps the direct match for a
 * session opened before the load was materialised.
 *
 * A paused or ended run is deliberately not found: folding a log into a run the
 * athlete stopped would advance a program nobody is on.
 */
export async function programRunForSession(input: {
	userId: string
	sessionId: string
}): Promise<{ instanceId: string; name: string } | null> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: input.sessionId, userId: input.userId },
		select: { workoutId: true, workout: { select: { copiedFromId: true } } },
	})
	const dayShapeIds = [
		session?.workoutId ?? null,
		session?.workout?.copiedFromId ?? null,
	].filter((id): id is string => id != null)
	if (dayShapeIds.length === 0) return null

	const instance = await prisma.programInstance.findFirst({
		where: {
			userId: input.userId,
			status: 'active',
			program: { days: { some: { workoutId: { in: dayShapeIds } } } },
		},
		orderBy: { startedOn: 'desc' },
		select: { id: true, program: { select: { name: true } } },
	})
	return instance
		? { instanceId: instance.id, name: instance.program.name }
		: null
}

/**
 * **Where each lift of a run now stands, and how it got there** — the run of made
 * sessions behind a weight, and the Stall Count behind one that is held.
 *
 * The runner's help panel says the weight in the athlete's own numbers (*"82.5 kg
 * is your working weight after five made sessions"*), and neither half of that is
 * derivable from the prescription: the kilo on the bar is in the stamp, but *why*
 * it is that kilo lives in `ProgramLiftState`. So this reads the state and hands
 * the counts on; the sentence itself is the runner presenter's, where it can be
 * tested without a database.
 *
 * `madeInARow` is the **trailing** run of successes in `weightHistory`, which is
 * the only claim the history supports: it says this lift has made its last *n*
 * sessions, not that it has made *n* sessions in total. `stallCount` is read as
 * stored (ADR 0060's rule: the app counts consecutive incomplete sessions and
 * that count survives an out-of-order log) rather than counted again here, so the
 * panel cannot disagree with the engine that will move the weight.
 */
export type LiftProgressRow = {
	exerciseId: string
	/** The other half of the progression key, so barbell and dumbbell bench are
	 * two lifts and not one. */
	equipment: string | null
	workingWeightKg: number
	stallCount: number
	madeInARow: number
}

export async function programLiftProgress(input: {
	userId: string
	instanceId: string
}): Promise<LiftProgressRow[]> {
	const instance = await prisma.programInstance.findFirst({
		where: { id: input.instanceId, userId: input.userId },
		select: {
			liftStates: {
				select: {
					exerciseId: true,
					equipment: true,
					currentWorkingWeightKg: true,
					stallCount: true,
					weightHistory: true,
				},
			},
		},
	})
	if (!instance) return []
	return instance.liftStates.map((row) => {
		const history = parseJsonArray<WeightHistoryEntry>(row.weightHistory)
		let madeInARow = 0
		for (let index = history.length - 1; index >= 0; index -= 1) {
			if (history[index]?.succeeded !== true) break
			madeInARow += 1
		}
		return {
			exerciseId: row.exerciseId,
			equipment: row.equipment,
			workingWeightKg: row.currentWorkingWeightKg,
			stallCount: row.stallCount,
			madeInARow,
		}
	})
}

// ——— Opening the next session (lazily, one at a time) —————————————————————

export type OpenedProgramSession = {
	sessionId: string
	dayId: string | null
	workoutId: string
	prescription: NextSession
	liftNames: Record<string, string>
}

/**
 * Open the next session of a run.
 *
 * **One at a time, and the load resolves here.** The *shape* is the day-shape
 * `Workout` the definition references; the kilos are resolved at this moment
 * from the state as it stands, and stamped onto a copy of that shape which
 * belongs to this athlete. Opening the same day twice returns the same
 * `WorkoutSession` rather than a second one, because a double tap on *"start
 * today's workout"* is not two workouts.
 *
 * ## Where the resolved load lives, and why it is not the shared row
 *
 * The day shape is **corpus content**: `authorship: 'system'`, `ownerId: NULL`,
 * one row every athlete on the program reads. ADR 0056 §2 refused to write one
 * athlete's performance onto shared rows, and one athlete's working weight is
 * the same kind of claim — a 60 kg squat stamped on the shared shape would be
 * every other athlete's prescription too, and the next athlete to open Workout A
 * would silently overwrite it. So the shape stays untouched and the number lands
 * on rows the athlete owns.
 *
 * Two ways to do that, and this is the second:
 *
 * 1. **Resolve on read**, leaving the session pointed at the shared shape and
 *    joining the working weight in at every reader. Rejected: the runner is not
 *    the only reader — the grid, the plate line, the **warm-up ramp**, the
 *    session detail page and the calendar all read a prescribed set — and each
 *    one that forgot the join would show `Target 5 reps` and no kilos, which is
 *    exactly the defect this fixes. A prescription that is only correct if every
 *    reader remembers something is not a prescription.
 * 2. **Materialise onto the athlete's own session rows.** The session gets its
 *    own `Workout`, copied from the day shape with `copiedFromId` pointing back
 *    at it, with the resolved kilo on each `ExerciseSet`. Every reader that
 *    already knows how to read a prescription now reads a complete one, and
 *    `calculatePlates` and `warmupRamp` get a real working weight without either
 *    of them learning what a program is.
 *
 * This is the same fork-on-write ADR 0051 §5 gives session adoption and ADR 0016
 * gives plan generation — a generated session has pointed at its own copy of a
 * Catalogue row since #456 — so nothing new is being invented here.
 *
 * ADR 0059 is honoured in the direction it actually states: **the shape may be
 * stamped ahead, the load may not.** Nothing is stamped at start time; the copy
 * and its kilos are written the moment the athlete opens the session, so week
 * 6's weight is still a function of week 5's log. A session opened and left
 * unopened for a week keeps the weight that was true when it was opened, which
 * is what a printed workout is.
 */
export async function openNextProgramSession(input: {
	userId: string
	instanceId: string
	scheduledAt?: Date
	now?: Date
}): Promise<OpenedProgramSession | null> {
	const run = await loadRun(input.userId, input.instanceId)
	if (!run) return null
	const { instance, definition, state, programRow } = run
	// **A run that is not running opens nothing.** A paused or ended instance
	// that could still mint sessions is how a scheduled session outlives the run
	// it belongs to and is then adopted by the next one.
	if (instance.status !== 'active') return null
	const now = input.now ?? new Date()
	const scheduledAt = input.scheduledAt ?? now

	const prescription = nextSession(state, definition, now.toISOString(), {
		roundToLoadable: (
			await buildLoadableRounder(
				input.userId,
				definition.liftRules.map((rule) => rule.exerciseId),
			)
		).roundToLoadable,
	})
	const day = programRow.days.find(
		(candidate) => candidate.dayId === prescription.dayId,
	)
	if (!day) return null

	// An existing scheduled session on this day's shape is *this* session; a new
	// row would give the athlete two of today. Either the session points at the
	// athlete's stamped copy of the shape, or — for a session opened before the
	// load was materialised — at the shared shape itself.
	//
	// **Every guard here was a bug before it was a guard**, and they live in
	// {@link runOwnSessionWhere}: a session belonging to a previous run of the
	// same program, which a brand-new instance adopting one turns into weights
	// from a program the athlete already stopped, and a session that has already
	// been folded into a run, which is spent — reopening it would offer the
	// athlete a session whose log has already moved the weights.
	const existing = await prisma.workoutSession.findFirst({
		where: runOwnSessionWhere(input.userId, instance, day.workoutId),
		orderBy: { scheduledAt: 'desc' },
		select: {
			id: true,
			workoutId: true,
			_count: { select: { setLogs: true } },
		},
	})

	// A session already in progress keeps the shape *and the numbers* it has: its
	// `ExerciseSetLog` rows name that Workout's Steps, so moving or re-stamping it
	// would strand the athlete's own sets outside the grid, and the weight they
	// have been lifting all session is the weight they were shown.
	const inProgress = existing != null && existing._count.setLogs > 0
	// A session opened **before** the load was materialised points straight at the
	// shared shape and therefore prescribes no kilos. With nothing logged against
	// it, it is repointed at a stamped copy, because a prescription with no weight
	// on it is not one the athlete can run.
	const pointsAtSharedShape =
		existing != null && existing.workoutId === day.workoutId

	// **A copy stamped earlier is a copy of an earlier answer.** Change the
	// working weight and reopen, and the overview read `60 kg` while the grid —
	// same session, same second — read `20.25 kg`, because the stale copy was
	// handed back verbatim. Nothing has been logged against it, so it is
	// re-stamped from the prescription as it stands now.
	if (existing != null && !inProgress && !pointsAtSharedShape) {
		await restampSessionLoads(existing.workoutId, prescription)
	}

	const session =
		existing != null && (inProgress || !pointsAtSharedShape)
			? existing
			: // The copy and the session that points at it commit together: a copy with
				// no session is an orphan prescription, and a session pointing at a
				// half-written one would show a grid with holes in it.
				await prisma.$transaction(async (tx) => {
					const shape = await tx.workout.findUnique({
						where: { id: day.workoutId },
						select: workoutCopySelect,
					})
					if (!shape) throw new Error('the program day shape has gone missing')
					const copy = await copyWorkout(tx, shape, input.userId, {
						blocks: stampResolvedLoads(shape.blocks, prescription),
						copiedFromId: shape.id,
					})
					return existing
						? tx.workoutSession.update({
								where: { id: existing.id },
								data: { workoutId: copy.id },
								select: { id: true, workoutId: true },
							})
						: tx.workoutSession.create({
								select: { id: true, workoutId: true },
								data: {
									userId: input.userId,
									workoutId: copy.id,
									scheduledAt,
									source: 'generated',
								},
							})
				})

	const names = new Map(
		programRow.liftRules.map((rule) => [
			rule.exerciseId,
			rule.exercise?.name ?? 'Lift',
		]),
	)
	return {
		sessionId: session.id,
		dayId: prescription.dayId,
		// The athlete's stamped copy, which is what the session actually prescribes.
		// The shared shape it was copied from is `Workout.copiedFromId`.
		workoutId: session.workoutId ?? day.workoutId,
		prescription,
		liftNames: Object.fromEntries(names),
	}
}

/**
 * **Re-stamp an already-copied session with the prescription as it stands now.**
 *
 * The copy is the athlete's own row and nothing has been logged against it, so
 * the kilos on it are a cached answer and nothing more. Reused verbatim it
 * became a second, older prescription living beside the live one, and the two
 * surfaces that read them said two different weights for one session — which,
 * beside a success predicate that did not read the load at all, meant the
 * athlete logged the weight the grid showed and was credited with the weight the
 * engine imagined.
 *
 * A set the engine can no longer price is **cleared** rather than left holding
 * yesterday's number: `loadTargetText` and the warm-up ramp both read an absent
 * kilo as *"no load prescribed"*, which is the honest reading, and a stale one
 * would be a claim.
 *
 * Only rows that actually differ are written.
 */
async function restampSessionLoads(
	workoutId: string | null,
	prescription: NextSession,
): Promise<void> {
	if (!workoutId) return
	const resolvedByExercise = new Map(
		prescription.lifts.map((lift) => [lift.exerciseId, lift.sets]),
	)
	const sets = await prisma.exerciseSet.findMany({
		where: { step: { block: { workoutId } } },
		select: {
			id: true,
			orderIndex: true,
			weightKg: true,
			step: { select: { exerciseId: true } },
		},
	})
	await Promise.all(
		sets.map(async (set) => {
			const resolved = set.step.exerciseId
				? resolvedByExercise.get(set.step.exerciseId)
				: undefined
			// A step this program has no rule for is not this function's business:
			// assistance work authored on the day shape keeps whatever it was given.
			if (!resolved) return
			const weight = resolved.find(
				(candidate) => candidate.setIndex === set.orderIndex,
			)?.weight
			const kg = weight?.kind === 'resolved' ? weight.kg : null
			if (kg === set.weightKg) return
			await prisma.exerciseSet.update({
				where: { id: set.id },
				select: { id: true },
				data: {
					load: kg == null ? null : JSON.stringify({ kind: 'absolute', kg }),
					weightKg: kg,
				},
			})
		}),
	)
}

/**
 * **The prescription this session was actually stamped with, as the engine reads
 * it.**
 *
 * The root fix for two fabrications, and it is a *read* rather than a second
 * resolution. `applySession` used to re-resolve the prescription from live
 * `ProgramLiftState` while the grid stayed frozen at its stamp — correctly
 * frozen, because re-stamping mid-session would move the target out from under
 * sets already logged. Two prescriptions for one session, and the grader used the
 * one nobody had seen: stamp at 60 kg, change the working weight to 90 on the
 * overview, log the rest at the 60 kg the grid asked for, and the outcome said
 * *"logged at 60 kg, not the 90 kg 5×5 it prescribed"*.
 *
 * These are the same `ExerciseSet` rows the grid renders, so grading against them
 * is grading against the screen, by construction.
 *
 * Two absences, and they are different statements:
 *
 * - **No rows for this lift** — assistance work, or a session opened before loads
 *   were materialised: `null`, and the engine falls back to resolving from state.
 * - **Rows whose every kilo is `null`** — also `null` here, deliberately. An
 *   unstamped session is *not* a claim that this lift has no kilos, and reading it
 *   as one is how a no-kilo log would be credited as making a kg prescription.
 *   The engine's genuine no-kilo case is a stamp that prices *some* sets and not
 *   others, and a lift the engine itself refuses to price.
 *
 * Matched on `exerciseId` alone: an `ExerciseSet` carries no equipment, and no
 * program in the family puts two realizations of one movement on one day.
 */
async function readStampedPrescription(
	workoutId: string | null,
): Promise<StampedPrescriptionReader> {
	if (!workoutId) return () => null
	const rows = await prisma.exerciseSet.findMany({
		where: { step: { block: { workoutId } } },
		orderBy: { orderIndex: 'asc' },
		select: {
			orderIndex: true,
			weightKg: true,
			step: { select: { exerciseId: true } },
		},
	})
	const byExercise = new Map<string, Array<number | null>>()
	for (const row of rows) {
		const exerciseId = row.step.exerciseId
		if (!exerciseId) continue
		const kgs = byExercise.get(exerciseId) ?? []
		kgs.push(row.weightKg)
		byExercise.set(exerciseId, kgs)
	}
	return ({ exerciseId }) => {
		const kgs = byExercise.get(exerciseId)
		if (!kgs || kgs.every((kg) => kg == null)) return null
		return kgs
	}
}

/**
 * The copied day shape with **this athlete's resolved kilos on it**.
 *
 * One `ExerciseSet` at a time, matched by exercise and set index against what
 * `nextSession` resolved. A set the engine could not resolve — a percentage
 * family with no training max, an anchor that is not on file — is left with **no
 * load at all** rather than a zero or a guess: `loadTargetText` and the ramp both
 * read an absent kilo as *"no load prescribed"*, which is the honest reading, and
 * a fabricated one would be the #434 regression again.
 *
 * The absolute `LoadTarget` and the legacy `weightKg` projection are written
 * together, the way `ExerciseSet`'s own comment says an absolute set mirrors.
 */
function stampResolvedLoads(
	blocks: CopyableWorkout['blocks'],
	prescription: NextSession,
): CopyableWorkout['blocks'] {
	const resolvedByExercise = new Map(
		prescription.lifts.map((lift) => [lift.exerciseId, lift.sets]),
	)
	return blocks.map((block) => ({
		...block,
		steps: block.steps.map((step) => {
			const sets = step.exerciseId
				? resolvedByExercise.get(step.exerciseId)
				: undefined
			if (!sets) return step
			return {
				...step,
				sets: step.sets.map((set) => {
					const weight = sets.find((r) => r.setIndex === set.orderIndex)?.weight
					if (weight?.kind !== 'resolved') return set
					return {
						...set,
						load: JSON.stringify({ kind: 'absolute', kg: weight.kg }),
						weightKg: weight.kg,
					}
				}),
			}
		}),
	}))
}

// ——— Folding a logged session back in ————————————————————————————————————

export type RecordProgramSessionResult =
	| {
			ok: true
			outcomes: LiftOutcome[]
			liftNames: Record<string, string>
			/** True when this session had **already** been folded in and this call
			 * changed nothing — a double tap on Finish, a retried request or a
			 * back-button re-submit. The outcomes are then the first fold's own,
			 * replayed from the `ProgramSessionApplication` row rather than produced by
			 * a second advance; only a legacy row, folded in before that table existed,
			 * is restated from the recorded history. */
			alreadyRecorded: boolean
	  }
	| { ok: false; reason: 'not-found' | 'no-day' }

/** One `ExerciseSetLog` row as this file reads it — the progression fields, plus
 * what the 1RM estimator needs to grade the set it reads. */
type LoggedSetRow = {
	id: string
	orderIndex: number
	role: string
	outcome: string
	reps: number | null
	effectiveKg: number | null
	/** The `LoadValue` JSON the set was logged with. Read for two things: what kind
	 * of load `effectiveKg` is a kilo of, so a sentence quoting it can say — and
	 * whether that kilo is the one this load explains at all. */
	load: string
	/** The bodyweight the bake used, and the only bodyweight the check may use: a
	 * bodyweight-derived kilo is checked against the athlete's weight **then**. */
	bodyweightKg: number | null
	exerciseId: string | null
	rir: number | null
	toFailure: boolean
	completedAt: Date
	/** **The equipment the set itself states**, stamped at log time — the second
	 * half of the progression key. Read off the row and never re-derived from
	 * `variant.equipment`: that join made the key a function of a mutable row, and
	 * one `UPDATE ExerciseVariant SET equipment = …` rekeyed every set logged
	 * against it. NULL is a set that names no equipment, which contradicts no rule.
	 */
	equipment: string | null
}

/**
 * **The real 1RM estimator, injected at the seam the engine left for it.**
 *
 * `program-engine.ts` takes the re-estimation as a function so it stays pure and
 * so the estimator's vocabulary — its equations, its ten-rep gate, its four
 * refusals — does not leak into the progression rules. This is the production
 * wiring of that seam: without it every `anchorReEstimate` response resolves to
 * `stallResponseUnavailable`, which means 5/3/1 and nSuns cannot stall at all.
 *
 * Three things it does not do. It does not invent a number when the estimator
 * refuses — the refusal's own sentence is passed through, and the engine turns
 * it into a `stallResponseUnavailable` outcome that says why. It does not
 * substitute another equation for one this app has not implemented. And it does
 * not write an `ExerciseThreshold`: an anchor is derived-then-authored (ADR
 * 0050) and becomes the athlete's when they accept it, whereas the training max
 * this feeds is program state and deliberately not a threshold construct.
 *
 * ## `toFailure` is read, never inferred from the miss
 *
 * This used to pass `toFailure: true` unconditionally, reasoning that the engine
 * calls it only on a session that failed its success predicate, so the athlete
 * stopped where they stopped. **That launders a missed set into a maximal
 * effort.** A miss is not a failure: the athlete may have racked it early, run
 * out of time, stopped on form, or cut the session short — and `toFailure` means
 * *taken to failure on purpose*, which is a plan and not an outcome. Asserting
 * it is the app turning an absence into a claim, and the claim then moves a
 * stored training max. `one-rm.ts` is explicit that in lifting a maximal effort
 * has **no signature**, so there is nothing to infer it from.
 *
 * So the flag now comes from one of two places, both of them records:
 *
 * - **The program says so.** GreySkull's `5+`, 5/3/1's `+` set and nSuns' `1+`
 *   are printed *as many reps as possible*, and the engine reads exactly that
 *   set. A prescribed AMRAP is a plan to go to failure, which is what the flag
 *   means, and {@link prescribesAmrapLastSet} reads it off the rule.
 * - **The athlete says so.** The logged set's own `toFailure`, and its `rir`,
 *   are passed through, so a set marked to failure or reported within two reps
 *   of it qualifies on its own terms.
 *
 * With neither, the estimator refuses `effort-unknown`, the engine turns that
 * into a `stallResponseUnavailable` that says nothing was changed, and the
 * refusal's sentence tells the athlete exactly what would fix it. That is a
 * worse-feeling answer and a truer one.
 */
function anchorReEstimator(args: {
	now: Date
	logs: LoggedSetRow[]
	movementPatterns: Map<string, string | null>
	rules: LiftProgressionRule[]
}): AnchorReEstimator {
	return ({ exerciseId, equipment, estimator, setLogId, weightKg, reps }) => {
		if (!(ESTIMATOR_NAMES as readonly string[]).includes(estimator)) {
			return {
				kind: 'refusal',
				reason: `this program asks for the ${estimator} estimator, which this app does not implement`,
			}
		}
		// **The row the engine read, by its id** — not a row that happens to share
		// its number. This used to be
		// `row.reps === reps && row.effectiveKg === weightKg`, and that row then
		// supplied the load kind, the RIR, `toFailure` and the date: a per-hand set
		// at 42.5 kg a side and a barbell set at 85 kg stand at the same effective
		// 85 kg, so the first of them answered for the second. It is instance seven
		// of one class of bug, and `allRepsAllSets` already fixed its own copy of it
		// by carrying the set rather than looking a kind back up by `weightKg`.
		const log =
			setLogId == null
				? undefined
				: args.logs.find((row) => row.id === setLogId)
		// A row whose stored kilo does not follow from its own load column explains
		// nothing, and a 1RM read off it would be read off a number nobody can stand
		// behind. The engine already refuses such a session (`kiloContradictsLoad`),
		// so this is the belt: stated here so a caller that reaches this seam another
		// way cannot bypass it.
		const contradicted = log != null && readLoad(log).contradicted
		if (contradicted) {
			return { kind: 'refusal', reason: contradicted.explanation }
		}
		const rule = args.rules.find(
			(candidate) =>
				candidate.exerciseId === exerciseId &&
				candidate.equipment === equipment,
		)
		// **The same evidence axis the propose surface uses**, from the one shared
		// home, so a deadlift is not served an estimate on one screen and refused on
		// the other. An Anchor Re-estimate is an anchor: it is graded the way every
		// other anchor is, and a borrowed curve costs the same grade here.
		const basis = repLoadBasis(args.movementPatterns.get(exerciseId) ?? null)
		const reading = gradeDownForRepLoadBasis(
			estimateOneRm({
				now: args.now,
				estimator: estimator as EstimatorName,
				hasValidatedRepLoadMapping: basis !== 'unmapped',
				sets: [
					{
						setLogId: log?.id ?? null,
						loadKg: weightKg,
						reps,
						performedAt: log?.completedAt ?? args.now,
						rir: log?.rir ?? null,
						// **What kind of kilo the engine handed over.** The engine already
						// refuses an Anchor Re-estimate off an unreadable load kind
						// (`unreadableLoad`); stating the kind here means the estimator's own
						// gate agrees rather than trusting that check to have happened, and a
						// row whose `load` column will not read is refused rather than priced
						// as a weight on the bar.
						loadKind: log ? readLoad(log).loadKind : null,
						toFailure:
							(rule != null && prescribesAmrapLastSet(rule)) ||
							(log?.toFailure ?? false),
					},
				],
			}),
			basis,
		)
		if (reading.kind === 'refusal') {
			return { kind: 'refusal', reason: oneRmRefusalText(reading.refusal) }
		}
		const basisNote = repLoadBasisText(basis)
		return {
			kind: 'estimate',
			oneRmKg: reading.valueKg,
			// Provenance, not decoration: an estimate carries the reps it was read
			// from, the equation that produced it and a grade — never `athlete-stated`,
			// which is the one protocol the app refuses to grade. Where the equation
			// was not fitted to this movement, the borrowing is said out loud in the
			// same breath rather than buried in a grade nothing renders.
			basis: `The estimate is ${reading.valueKg} kg from ${reading.reps} reps by ${reading.protocol}, graded ${reading.confidence}.${basisNote ? ` ${basisNote}` : ''}`,
		}
	}
}

/**
 * Fold a finished session into the run: read what was logged, hand it to the
 * pure engine, and write the new state and the appended history **in one
 * transaction**.
 *
 * The day is read from the session's own `Workout` rather than counted, so a
 * back-filled or duplicated session advances the cursor from the day that was
 * actually performed and does not desync the program.
 *
 * The posted numbers are never trusted: the sets come from `ExerciseSetLog`, and
 * the engine is re-run over them server-side.
 *
 * **A session folds in exactly once**, and the unique index on
 * `ProgramSessionApplication(instanceId, sessionId)` is the thing that makes it
 * so. The row is inserted inside this transaction, so a second attempt fails on
 * the constraint and takes the whole second advance down with it — the cursor,
 * every lift's state and the appended weight and stall history are all rolled
 * back together. Nothing is read and then written, because a read-then-write
 * check races against itself and this is the one piece of state that cannot be
 * re-derived from the set logs.
 *
 * The second attempt is not an error: it answers with the outcomes the first one
 * stored, word for word. `WorkoutSession.status` moves to `completed` in the
 * same transaction because finishing and folding are one act — but it is the
 * athlete's statement, not the guard.
 */
export async function recordProgramSession(input: {
	userId: string
	instanceId: string
	sessionId: string
	now?: Date
}): Promise<RecordProgramSessionResult> {
	const run = await loadRun(input.userId, input.instanceId)
	if (!run) return { ok: false, reason: 'not-found' }
	const { programRow, definition } = run

	const session = await prisma.workoutSession.findFirst({
		where: { id: input.sessionId, userId: input.userId },
		select: {
			id: true,
			workoutId: true,
			workout: { select: { copiedFromId: true } },
		},
	})
	if (!session) return { ok: false, reason: 'not-found' }

	// **Which day was performed, through the copy.** The session points at the
	// athlete's stamped copy of the day shape and `copiedFromId` points back at the
	// shape itself, so the day is found one hop up the lineage. The direct match is
	// kept for a session opened before the load was materialised, which points at
	// the shared shape.
	const performedDayId =
		programRow.days.find(
			(day) =>
				day.workoutId === session.workoutId ||
				day.workoutId === session.workout?.copiedFromId,
		)?.dayId ?? null
	if (performedDayId == null) return { ok: false, reason: 'no-day' }

	const logs: LoggedSetRow[] = await prisma.exerciseSetLog.findMany({
		where: { sessionId: session.id },
		orderBy: { orderIndex: 'asc' },
		select: {
			id: true,
			orderIndex: true,
			role: true,
			outcome: true,
			reps: true,
			effectiveKg: true,
			load: true,
			bodyweightKg: true,
			exerciseId: true,
			rir: true,
			toFailure: true,
			completedAt: true,
			// The stamp, not a join: the key half is the row's own statement.
			equipment: true,
		},
	})
	const movementPatterns = new Map(
		(
			await prisma.exercise.findMany({
				where: {
					id: { in: definition.liftRules.map((rule) => rule.exerciseId) },
				},
				select: { id: true, movementPattern: true },
			})
		).map((row) => [row.id, row.movementPattern]),
	)

	const now = input.now ?? new Date()
	const names = Object.fromEntries(
		programRow.liftRules.map((rule) => [
			rule.exerciseId,
			rule.exercise?.name ?? 'Lift',
		]),
	)
	const { roundToLoadable, loadabilityBasis } = await buildLoadableRounder(
		input.userId,
		definition.liftRules.map((rule) => rule.exerciseId),
	)
	const stampedPrescription = await readStampedPrescription(session.workoutId)

	// **Together or not at all, and once.** The claim, the cursor, every lift's
	// new state and the appended weight and stall history are one write: a partial
	// advance would leave a Stall Count that its own history contradicts, and a
	// second advance would leave a history that says the same session twice.
	let firstFold: LiftOutcome[] | null = null
	try {
		firstFold = await prisma.$transaction(async (tx) => {
			// The athlete's own statement that the session is done, written here so
			// that finishing it and folding it in land together. It guards nothing:
			// `status` is shared calendar and list state that other surfaces own.
			await tx.workoutSession.updateMany({
				where: { id: session.id, userId: input.userId },
				data: { status: 'completed' },
			})

			// Re-read inside the transaction: the state the engine folds must be the
			// state as it stands now, not as it stood before the transaction opened.
			const fresh = await loadRun(input.userId, input.instanceId, tx)
			if (!fresh) {
				throw new Error(
					'the program run disappeared while it was being advanced',
				)
			}
			const loggedSets = toLoggedWorkSets(logs, fresh.state)
			const applied = applySession(
				fresh.state,
				definition,
				loggedSets,
				session.id,
				now.toISOString(),
				{
					performedDayId,
					reEstimateAnchor: anchorReEstimator({
						now,
						logs,
						movementPatterns,
						rules: definition.liftRules,
					}),
					// **The prescription the grid actually showed**, read off the
					// athlete's own stamped `ExerciseSet` rows. The rounder is still
					// passed for the fallback and for the weights the engine *writes*
					// (an increment, a Stall Cut), and the basis with it so a rounding
					// sentence never claims to know a rack that was never described.
					stampedPrescription,
					roundToLoadable,
					loadabilityBasis,
				},
			)
			await tx.programInstance.update({
				where: { id: fresh.instance.id },
				data: { cursor: JSON.stringify(applied.nextState.cursor) },
				select: { id: true },
			})
			for (const lift of applied.nextState.lifts) {
				// `updateMany` rather than `update`: the progression key's `equipment`
				// half is nullable, and Prisma's compound-unique input cannot express a
				// null. The `(instanceId, exerciseId, equipment)` triple is unique by
				// schema, so this still touches exactly one row.
				await tx.programLiftState.updateMany({
					where: {
						instanceId: fresh.instance.id,
						exerciseId: lift.exerciseId,
						equipment: lift.equipment,
					},
					data: {
						currentWorkingWeightKg: lift.currentWorkingWeightKg,
						unroundedWorkingWeightKg: lift.unroundedWorkingWeightKg,
						trainingMaxKg: lift.trainingMaxKg,
						workingFraction: lift.workingFraction,
						stallCount: lift.stallCount,
						currentIncrement: JSON.stringify(lift.currentIncrement),
						weightHistory: JSON.stringify(lift.weightHistory),
						stallHistory: JSON.stringify(lift.stallHistory),
					},
				})
			}
			// **The guard, and the answer kept.** The unique index refuses the second
			// insert, which aborts this transaction and rolls the whole second advance
			// back; the stored `outcomes` are what a second Finish then replays.
			await tx.programSessionApplication.create({
				select: { id: true },
				data: {
					instanceId: fresh.instance.id,
					sessionId: session.id,
					appliedAt: now,
					outcomes: JSON.stringify(applied.outcomes),
				},
			})
			return applied.outcomes
		})
	} catch (error) {
		// A unique-constraint failure here is the guard doing its job, and it is an
		// answer rather than an error: this session had already been folded in.
		// Anything else is a real failure and is not swallowed.
		if (
			!(error instanceof Prisma.PrismaClientKnownRequestError) ||
			error.code !== 'P2002'
		) {
			throw error
		}
	}

	if (firstFold) {
		return {
			ok: true,
			outcomes: firstFold,
			liftNames: names,
			alreadyRecorded: false,
		}
	}

	// The fold rolled back, but the athlete's statement that the session is done
	// stands on its own: it is not the guard, so it does not ride on the guard.
	await prisma.workoutSession.updateMany({
		where: {
			id: session.id,
			userId: input.userId,
			status: { not: 'completed' },
		},
		data: { status: 'completed' },
	})

	const application = await prisma.programSessionApplication.findUnique({
		where: {
			instanceId_sessionId: {
				instanceId: input.instanceId,
				sessionId: session.id,
			},
		},
		select: { outcomes: true },
	})
	const stored = parseStoredOutcomes(application?.outcomes ?? null)
	if (stored) {
		return {
			ok: true,
			outcomes: stored,
			liftNames: names,
			alreadyRecorded: true,
		}
	}

	// A **legacy row**: a fold that happened before this table existed, which the
	// migration reconstructed from the weight history without an answer to keep.
	// Those are restated, which is what every second Finish used to be.
	const recorded = await loadRun(input.userId, input.instanceId)
	return {
		ok: true,
		outcomes: recorded
			? restateRecordedSession({
					state: recorded.state,
					definition,
					sessionId: session.id,
					performedDayId,
					nowISO: now.toISOString(),
				})
			: [],
		liftNames: names,
		alreadyRecorded: true,
	}
}

/** The stored answer, or `null` where there is none to replay — a legacy row, or
 * a column that does not parse, which is the same situation from here. */
function parseStoredOutcomes(raw: string | null): LiftOutcome[] | null {
	if (raw == null) return null
	try {
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? (parsed as LiftOutcome[]) : null
	} catch {
		return null
	}
}

/**
 * The logged sets the engine folds, keyed to the lifts this run progresses.
 *
 * ## The seam, and what `equipment` means on each side of it
 *
 * The progression key is the **pair** `(exerciseId, equipment)`. Both sides of
 * this match must therefore resolve the same second half, and this function is
 * the only place they meet:
 *
 * - on the **lift state**, `equipment` is the realization the program's rule
 *   states — `'barbell'` for all three seeded programs, because a barbell
 *   program means the barbell lift;
 * - on the **logged set**, it is the `equipment` the row itself carries, stamped
 *   by the runner at log time beside the variant it was lifted on. It is read and
 *   never re-derived: deriving it from `variant.equipment` made this side of the
 *   key a function of a row that can still change, so one `UPDATE` to a variant
 *   moved every set ever logged on it — and every record keyed by it — onto
 *   another key, silently.
 *
 * A pair matches when the exercise matches and the two equipment answers **do
 * not contradict each other**. Contradiction, not equality, because either side
 * may legitimately say nothing:
 *
 * - a rule with `equipment: NULL` means *this lift, however you realize it* —
 *   the leniency lives on the **rule** side, where a program author can state
 *   it, and none of the seeded programs do;
 * - a log with a NULL `equipment` is a set that **names no equipment**, which is
 *   every set logged before the stamp existed and every row an import wrote. It
 *   cannot contradict a barbell rule and is folded in.
 *
 * This is the bug that made StrongLifts unrunnable, and it is worth naming
 * precisely: the reader used to be lenient about the *log* saying `'barbell'`
 * against a rule saying NULL only because the log always said nothing. The
 * moment the writer started stamping the variant, `'barbell' !== null` dropped
 * every set, `progressionSets` returned nothing and the engine emitted
 * `skipped`. The unit tests missed it because they supplied `equipment`
 * consistently on both sides; the production writer and the production reader
 * never met in a test at all.
 */
/**
 * **The stored load pair, read rather than trusted** — one call, so the kind the
 * engine grades on and the question of whether the kilo beside it is believable
 * are answered by the same reading.
 *
 * A malformed `load` column still costs a qualifying clause rather than a fold
 * (`uncheckable`): that is `unreadableLoad`'s stated decision and there is a test
 * pinning it. A kilo that **contradicts** a load that parses fine is the other
 * case, and it is refused.
 */
function readLoad(log: {
	load: string
	effectiveKg: number | null
	bodyweightKg: number | null
}) {
	const reading = readStoredSetLoad(log)
	return {
		/** The kilo the fold may read, or `null` where there is none to believe. */
		weightKg: reading.kind === 'contradicted' ? null : reading.effectiveKg,
		loadKind: reading.load?.kind ?? null,
		contradicted: reading.kind === 'contradicted' ? reading : null,
	}
}

function toLoggedWorkSets(
	logs: LoggedSetRow[],
	state: ProgramInstanceState,
): LoggedWorkSet[] {
	return logs.flatMap((log) => {
		if (!log.exerciseId) return []
		const loggedEquipment = log.equipment
		const lift = state.lifts.find(
			(candidate) =>
				candidate.exerciseId === log.exerciseId &&
				(candidate.equipment == null ||
					loggedEquipment == null ||
					candidate.equipment === loggedEquipment),
		)
		if (!lift) return []
		const read = readLoad(log)
		return [
			{
				// **The row, carried.** Anything that has to go back to this set — the
				// Anchor Re-estimate's provenance, above all — goes back to this row and
				// not to whichever row shares its numbers.
				setLogId: log.id,
				exerciseId: log.exerciseId,
				equipment: lift.equipment,
				orderIndex: log.orderIndex,
				role: log.role as ProgramSetRole,
				outcome: log.outcome as ProgramSetOutcome,
				reps: log.reps,
				// **Checked against the load that explains it, not believed.**
				// `effectiveKg` is a pure function of `(load, bodyweightKg)` on every
				// branch, so a row whose stored kilo is not that function's answer is a
				// row nothing may be derived from — the hand-written `30 kg` load beside
				// `effectiveKg: 300` reached a stored 330 kg 1RM and a 264 kg
				// prescription. The kilo is dropped and the contradiction is stated
				// (`kiloContradictsLoad`), so the session grades `unverifiable` and
				// nothing moves. It is never recomputed and written back: ADR 0056 §3's
				// bake is the record of what happened.
				weightKg: read.weightKg,
				kiloContradictsLoad: read.contradicted != null,
				// **Graded on, and it has to be.** `effectiveKg` is a real kilo of
				// whatever the equipment measures: a barbell squat logged as
				// **Bodyweight** bakes the athlete's own 74 kg in, and the assisted
				// machine's number means *less* work as it grows. The engine compares the
				// kilo to the prescription only where this kind says the two are the same
				// quantity (`loadKindComparability`); otherwise the session is
				// `unverifiable` and nothing moves. `null` — a `load` column that will not
				// parse — costs a qualifying clause and never a fold.
				loadKind: read.loadKind,
			},
		]
	})
}

const STALL_RESPONSE_LABELS: Record<string, string> = {
	stallCut: 'Stall Cut',
	weightRollback: 'Weight Rollback',
	anchorReEstimate: 'Anchor Re-estimate',
}

/**
 * **What a session that was already folded in did**, read back off the history
 * it wrote rather than computed a second time.
 *
 * This is what a second Finish answers with. Every number is the recorded one:
 * the weight this session used is its own `weightHistory` entry, the weight it
 * produced is the *next* entry (or the current working weight where this was the
 * last session folded), and a **Stall Response** is the `stallHistory` entry
 * naming the session. The Stall Count is replayed the way the engine counts it —
 * reset on a success and on a response, incremented on a miss — so it is the
 * count as of that session and not the count as of today.
 *
 * **Two things are restatements rather than recordings**: the sentence, and
 * `appliedAtISO`, which is the time of this reading because the time of the
 * original fold is not stored anywhere. Storing the outcomes verbatim is what
 * the follow-up migration in this file's notes would buy.
 */
function restateRecordedSession(args: {
	state: ProgramInstanceState
	definition: ProgramDefinition
	sessionId: string
	performedDayId: string
	nowISO: string
}): LiftOutcome[] {
	const { state, definition, sessionId, performedDayId, nowISO } = args
	return state.lifts.flatMap((lift): LiftOutcome[] => {
		const rule = definition.liftRules.find(
			(candidate) =>
				candidate.exerciseId === lift.exerciseId &&
				candidate.equipment === lift.equipment,
		)
		if (!rule) return []
		const key = { exerciseId: lift.exerciseId, equipment: lift.equipment }
		const history = lift.weightHistory as WeightHistoryEntry[]
		const index = history.findIndex((entry) => entry.sessionId === sessionId)
		if (index === -1) {
			// No entry means the fold left this lift alone: it logged nothing on a day
			// it was on, or it was not on that day at all.
			if (!liftIsOnDay(rule, performedDayId)) return []
			return [
				{
					...key,
					kind: 'skipped',
					// A replay states where the lift stands **now**, which is the stored
					// working weight — the same number this outcome's `weightKg` names.
					standsAtKg: lift.currentWorkingWeightKg,
					weightKg: lift.currentWorkingWeightKg,
					reason:
						'Already folded in: no working sets were logged for this lift, so nothing moved.',
					appliedAtISO: nowISO,
				},
			]
		}

		const entry = history[index]!
		const stalled = (lift.stallHistory as StallHistoryEntry[]).find(
			(row) => row.sessionId === sessionId,
		)
		if (stalled) {
			const label = STALL_RESPONSE_LABELS[stalled.response] ?? stalled.response
			return [
				{
					...key,
					kind: 'stalled',
					response: stalled.response,
					// The percentage families move the training max, not the working
					// weight, and saying "your squat dropped" about a training max would
					// be a lie.
					moved:
						stalled.response === 'anchorReEstimate'
							? 'trainingMax'
							: 'workingWeight',
					// Where the lift stands is the stored working weight, not the
					// response's `toKg`: a training-max response never touched it, and
					// later sessions may have moved it since.
					standsAtKg: lift.currentWorkingWeightKg,
					fromKg: stalled.fromKg,
					toKg: stalled.toKg,
					reason: `Already folded in: this session's ${label} took the lift from ${stalled.fromKg} kg to ${stalled.toKg} kg. Finishing again restates it rather than moving the weight twice.`,
					appliedAtISO: nowISO,
				},
			]
		}

		const afterKg = history[index + 1]?.weightKg ?? lift.currentWorkingWeightKg
		if (entry.succeeded) {
			if (afterKg > entry.weightKg) {
				return [
					{
						...key,
						kind: 'incremented',
						standsAtKg: lift.currentWorkingWeightKg,
						fromKg: entry.weightKg,
						toKg: afterKg,
						reason: `Already folded in: this session took the lift from ${entry.weightKg} kg to ${afterKg} kg. Finishing again restates it rather than adding the jump twice.`,
						appliedAtISO: nowISO,
					},
				]
			}
			return [
				{
					...key,
					kind: 'repeated',
					standsAtKg: lift.currentWorkingWeightKg,
					weightKg: entry.weightKg,
					stallCount: 0,
					reason: `Already folded in: this session made ${entry.weightKg} kg and the weight repeated.`,
					appliedAtISO: nowISO,
				},
			]
		}

		const stallCount = replayedStallCount(lift, index)
		if (stallCount >= rule.stallsBeforeResponse) {
			// A miss that reached the threshold and left no stall history behind is
			// the response that could not be applied — the one outcome that keeps its
			// count instead of resetting it.
			const label =
				STALL_RESPONSE_LABELS[rule.stallResponse.kind] ??
				rule.stallResponse.kind
			return [
				{
					...key,
					kind: 'stallResponseUnavailable',
					response: rule.stallResponse.kind,
					standsAtKg: lift.currentWorkingWeightKg,
					weightKg: entry.weightKg,
					stallCount,
					reason: `Already folded in: the ${label} this session was due could not be applied, and nothing was changed.`,
					appliedAtISO: nowISO,
				},
			]
		}
		return [
			{
				...key,
				kind: 'repeated',
				standsAtKg: lift.currentWorkingWeightKg,
				weightKg: entry.weightKg,
				stallCount,
				reason: `Already folded in: this session missed at ${entry.weightKg} kg, so the weight repeated.`,
				appliedAtISO: nowISO,
			},
		]
	})
}

/** The **Stall Count** as it stood after the session at `index`, replayed the way
 * the engine counts it: zero on a success, zero again once a **Stall Response**
 * fires, and one more on every other miss. */
function replayedStallCount(lift: ProgramLiftState, index: number): number {
	const responded = new Set(
		(lift.stallHistory as StallHistoryEntry[]).map((row) => row.sessionId),
	)
	let count = 0
	for (const entry of (lift.weightHistory as WeightHistoryEntry[]).slice(
		0,
		index + 1,
	)) {
		if (entry.succeeded) {
			count = 0
			continue
		}
		count = responded.has(entry.sessionId) ? 0 : count + 1
	}
	return count
}

// ——— The two edits the athlete owns ——————————————————————————————————————

/**
 * Set a working weight by hand — *"I know something the log does not"*.
 *
 * The Stall Count is **not** reset: a hand edit is a statement about the weight
 * and not about whether the last three sessions were made, and inferring the
 * second from the first would be the app deciding something.
 */
export async function setWorkingWeight(input: {
	userId: string
	instanceId: string
	exerciseId: string
	equipment: string | null
	weightKg: number
}): Promise<boolean> {
	const owned = await prisma.programInstance.findFirst({
		where: { id: input.instanceId, userId: input.userId },
		select: { id: true },
	})
	if (!owned) return false
	const result = await prisma.programLiftState.updateMany({
		where: {
			instanceId: input.instanceId,
			exerciseId: input.exerciseId,
			equipment: input.equipment,
		},
		data: {
			currentWorkingWeightKg: input.weightKg,
			unroundedWorkingWeightKg: input.weightKg,
		},
	})
	return result.count > 0
}

/** Stop a run. A status and never a delete: every set logged under it stays
 * exactly where it is. */
export async function endProgram(
	userId: string,
	instanceId: string,
	now: Date = new Date(),
): Promise<boolean> {
	const result = await prisma.programInstance.updateMany({
		where: { id: instanceId, userId },
		data: { status: 'ended', endedAt: now },
	})
	return result.count > 0
}
