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
 * 2. **The transactional advance.** `applySession`'s resulting state and the
 *    appended weight and stall history land **together or not at all**. A
 *    half-written advance would leave a lift whose stall count and whose history
 *    disagree, and the history is the only honest answer to *"why did my squat
 *    drop 10 kg?"*.
 * 3. **Lazy session generation, one at a time.** The *shape* is a system-authored
 *    `Workout` the definition already references; the **load resolves when the
 *    session is opened**, because week 6's weight is a function of week 5's log.
 *    Nothing is stamped ahead with a kilo on it.
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
 */
import { prisma } from './db.server.ts'
import {
	type LiftOutcome,
	type NextSession,
	type ProgramInstanceState,
	type ProgramLiftState,
	type StallHistoryEntry,
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
	IncrementAdjustmentOnStallSchema,
	IncrementSchema,
	ProgramCursorSchema,
	ProgressionTriggerSchema,
	SetWeightSourceSchema,
	StallResponseSchema,
	SuccessPredicateSchema,
} from './strength/program-rules.ts'

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
	incrementText: string
	stallResponseText: string
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

/** What the **Stall Response** does, named as one of the three and never as a
 * single "deload percentage". */
function stallResponseText(rule: LiftProgressionRule): string {
	const after =
		rule.stallsBeforeResponse === 1
			? 'on the first miss'
			: `after ${rule.stallsBeforeResponse} misses in a row`
	switch (rule.stallResponse.kind) {
		case 'stallCut':
			return `Stall Cut of ${trim(rule.stallResponse.pct)} % ${after}`
		case 'weightRollback':
			return `Weight Rollback ${rule.stallResponse.sessionsBack} sessions ${after}`
		case 'anchorReEstimate':
			return `Anchor Re-estimate (${rule.stallResponse.estimator}) ${after}`
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
			incrementText: incrementText(rule.increment),
			stallResponseText: stallResponseText(rule),
			stallsBeforeResponse: rule.stallsBeforeResponse,
		})),
	}
}

/** Every seeded program, for the browse surface. Definitions are shared content
 * and are not scoped to an athlete; a *run* of one is. */
export async function listPrograms(): Promise<ProgramSummary[]> {
	const rows = await prisma.strengthProgram.findMany({
		where: { authorship: 'system' },
		orderBy: { name: 'asc' },
		select: programSelect,
	})
	return rows.flatMap((row) => {
		const definition = toDefinition(row)
		return definition ? [toSummary(row, definition)] : []
	})
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
		return [
			{
				exerciseId: rule.exerciseId,
				equipment: rule.equipment,
				currentWorkingWeightKg: weightKg,
				unroundedWorkingWeightKg: weightKg,
				trainingMaxKg: null,
				workingFraction: null,
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
async function loadRun(userId: string, instanceId: string) {
	const instance = (await prisma.programInstance.findFirst({
		where: { id: instanceId, userId },
		select: instanceSelect,
	})) as InstanceRow | null
	if (!instance) return null
	const programRow = (await prisma.strengthProgram.findUnique({
		where: { id: instance.programId },
		select: programSelect,
	})) as ProgramRow | null
	if (!programRow) return null
	const definition = toDefinition(programRow)
	const state = toInstanceState(instance)
	if (!definition || !state) return null
	return { instance, programRow, definition, state }
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
	/** What today's session is, with its loads resolved **now**. */
	today: NextSession
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
	const today = nextSession(state, definition, now.toISOString())
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
		today,
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
 * **One at a time, and never a stamped load.** The shape is the `Workout` the
 * definition already references — a shared row, not a copy — and the kilos are
 * resolved here, at open time, from the state as it stands. Opening the same day
 * twice returns the same `WorkoutSession` rather than a second one, because a
 * double tap on *"start today's workout"* is not two workouts.
 */
export async function openNextProgramSession(input: {
	userId: string
	instanceId: string
	scheduledAt?: Date
	now?: Date
}): Promise<OpenedProgramSession | null> {
	const run = await loadRun(input.userId, input.instanceId)
	if (!run) return null
	const { definition, state, programRow } = run
	const now = input.now ?? new Date()
	const scheduledAt = input.scheduledAt ?? now

	const prescription = nextSession(state, definition, now.toISOString())
	const day = programRow.days.find(
		(candidate) => candidate.dayId === prescription.dayId,
	)
	if (!day) return null

	// An existing scheduled session on this day's shape is *this* session; a new
	// row would give the athlete two of today.
	const existing = await prisma.workoutSession.findFirst({
		where: {
			userId: input.userId,
			workoutId: day.workoutId,
			status: 'scheduled',
		},
		orderBy: { scheduledAt: 'desc' },
		select: { id: true },
	})
	const sessionId =
		existing?.id ??
		(
			await prisma.workoutSession.create({
				select: { id: true },
				data: {
					userId: input.userId,
					workoutId: day.workoutId,
					scheduledAt,
					source: 'generated',
				},
			})
		).id

	const names = new Map(
		programRow.liftRules.map((rule) => [
			rule.exerciseId,
			rule.exercise?.name ?? 'Lift',
		]),
	)
	return {
		sessionId,
		dayId: prescription.dayId,
		workoutId: day.workoutId,
		prescription,
		liftNames: Object.fromEntries(names),
	}
}

// ——— Folding a logged session back in ————————————————————————————————————

export type RecordProgramSessionResult =
	| { ok: true; outcomes: LiftOutcome[]; liftNames: Record<string, string> }
	| { ok: false; reason: 'not-found' | 'no-day' }

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
 */
export async function recordProgramSession(input: {
	userId: string
	instanceId: string
	sessionId: string
	now?: Date
}): Promise<RecordProgramSessionResult> {
	const run = await loadRun(input.userId, input.instanceId)
	if (!run) return { ok: false, reason: 'not-found' }
	const { instance, programRow, definition, state } = run

	const session = await prisma.workoutSession.findFirst({
		where: { id: input.sessionId, userId: input.userId },
		select: { id: true, workoutId: true },
	})
	if (!session) return { ok: false, reason: 'not-found' }

	const performedDayId =
		programRow.days.find((day) => day.workoutId === session.workoutId)?.dayId ??
		null
	if (performedDayId == null) return { ok: false, reason: 'no-day' }

	const logs = await prisma.exerciseSetLog.findMany({
		where: { sessionId: session.id },
		orderBy: { orderIndex: 'asc' },
		select: {
			orderIndex: true,
			role: true,
			outcome: true,
			reps: true,
			effectiveKg: true,
			exerciseId: true,
			variant: { select: { equipment: true } },
		},
	})
	const loggedSets: LoggedWorkSet[] = logs.flatMap((log) => {
		if (!log.exerciseId) return []
		// The progression key is the **pair**. A logged set names its variant once
		// Slice 6's variants are the referent; until then the lift's own key is the
		// honest answer, and a set that matches no lift in this run is dropped.
		const lift = state.lifts.find(
			(candidate) =>
				candidate.exerciseId === log.exerciseId &&
				(log.variant?.equipment == null ||
					candidate.equipment === log.variant.equipment),
		)
		if (!lift) return []
		return [
			{
				exerciseId: log.exerciseId,
				equipment: lift.equipment,
				orderIndex: log.orderIndex,
				role: log.role as ProgramSetRole,
				outcome: log.outcome as ProgramSetOutcome,
				reps: log.reps,
				weightKg: log.effectiveKg,
			},
		]
	})

	const now = input.now ?? new Date()
	const { nextState, outcomes } = applySession(
		state,
		definition,
		loggedSets,
		session.id,
		now.toISOString(),
		{ performedDayId },
	)

	// **Together or not at all.** The cursor, every lift's new state and the
	// appended weight and stall history are one write; a partial advance would
	// leave a Stall Count that its own history contradicts.
	await prisma.$transaction([
		prisma.programInstance.update({
			where: { id: instance.id },
			data: { cursor: JSON.stringify(nextState.cursor) },
			select: { id: true },
		}),
		...nextState.lifts.map((lift) =>
			// `updateMany` rather than `update`: the progression key's `equipment`
			// half is nullable, and Prisma's compound-unique input cannot express a
			// null. The `(instanceId, exerciseId, equipment)` triple is unique by
			// schema, so this still touches exactly one row.
			prisma.programLiftState.updateMany({
				where: {
					instanceId: instance.id,
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
			}),
		),
	])

	const names = new Map(
		programRow.liftRules.map((rule) => [
			rule.exerciseId,
			rule.exercise?.name ?? 'Lift',
		]),
	)
	return { ok: true, outcomes, liftNames: Object.fromEntries(names) }
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
