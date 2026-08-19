/**
 * The server half of the strength performance side: assemble what the logging
 * grid reads, and write one set at a time.
 *
 * Split the way `plan-generation` and `profile-analysis` are (ADR 0053 §2,
 * ADR 0054 §4) — every rule about what a load *means*, what a ghost matches and
 * what counts as work lives in the pure `strength-log.ts`. This file queries and
 * writes and decides nothing.
 *
 * **It deliberately does not route through the session editor.** The
 * Conform-backed `WorkoutAuthoringSchema` round trip drops `load`, `effortCap`
 * and `tempo`, which is why `catalogue-seed.server.ts` bypasses it too. Sending a
 * logged set through it would silently discard the load — the one field the set
 * exists to record.
 */
import { type Prisma } from '@prisma/client'
import { weekBoundsUTC } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import { findVariantByEquipment } from './exercise-seed.server.ts'
import {
	type ExercisePlateContext,
	getExercisePlateContext,
	getGymProfile,
} from './plate-inventory.server.ts'
import {
	type LoadResolution,
	type ResolveContext,
	resolveLoadTarget,
} from './strength/anchors.ts'
import {
	type ExerciseScope,
	type PerformedSet,
	lastTimeYouDidThis,
} from './strength/exercise-history.ts'
import { plateLineText } from './strength/plates.ts'
import { type StrengthRecord } from './strength/records.ts'
import { type WarmupRamp, warmupRamp } from './strength/warmup.ts'
import { getAnchorContext } from './strength-anchors.server.ts'
import {
	type LoadValue,
	type LoadValueKind,
	type SetGhost,
	type SetOutcome,
	type SetRole,
	type StrengthSummaryCount,
	LOAD_VALUE_KINDS,
	WARMUP_ORDER_INDEX_BASE,
	countsTowardWork,
	effectiveLoadKg,
	ghostsForRows,
	isWarmupRampIndex,
	parseStoredLoadValue,
	readStoredSetLoad,
	statesWhatWasPerformed,
	strengthSummaryCount,
} from './strength-log.ts'
import {
	performedSetsForExercise,
	recordsSetBy,
	toEquipmentId,
} from './strength-records.server.ts'
import { type LoadTarget, LoadTargetSchema } from './workout-schema.ts'

function parseLoadTarget(raw: string | null): LoadTarget | null {
	if (!raw) return null
	try {
		const parsed = LoadTargetSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

const setLogSelect = {
	id: true,
	orderIndex: true,
	role: true,
	outcome: true,
	toFailure: true,
	load: true,
	effectiveKg: true,
	// Read so the pair can be **checked** rather than trusted: `effectiveKg` is a
	// pure function of `(load, bodyweightKg)`, and the bodyweight it has to be
	// checked against is the one stored beside it. See `readStoredSetLoad`.
	bodyweightKg: true,
	reps: true,
	repsLeft: true,
	durationSec: true,
	rir: true,
	restTakenSec: true,
	completedAt: true,
	exerciseSetId: true,
	stepId: true,
} satisfies Prisma.ExerciseSetLogSelect

type SetLogRow = Prisma.ExerciseSetLogGetPayload<{
	select: typeof setLogSelect
}>

/** One row of the grid: the prescribed set, what was logged against it, and the
 * ghost. All three, because the interaction is "tap to accept last time, or
 * overtype one number" and each needs a different one of them. */
export type LogRow = {
	/** Position in the exercise's set list, 0-based, matching `ExerciseSet`. */
	orderIndex: number
	/** The prescribed set this row answers; null on a set the athlete added. */
	exerciseSetId: string | null
	/** The prescribed rep count, so "missed" is derivable without a second read. */
	prescribedReps: number | null
	prescribedDurationSec: number | null
	/** The authored Load Target, rendered as-is. It may be a *reference*
	 * (`85 % 1RM`, `8RM`) that resolves against this athlete's anchors. */
	prescribedLoad: LoadTarget | null
	/**
	 * The authored target resolved **now**, against this athlete's anchors as of
	 * the session's own day — or the authored form with its absence stated.
	 *
	 * Never stamped: week six's weight is a function of week five's log, so the
	 * kilos are resolved when the session is opened and not when it was scheduled.
	 * `unavailable` is a first-class answer and the surface must render the
	 * authored form beside it rather than a number nobody has.
	 */
	resolvedLoad: LoadResolution | null
	/**
	 * A rung of the generated ramp: what to put on the bar, and what that is in
	 * plates on this rack. Null on every prescribed row.
	 *
	 * `targetKg` is `WarmupSet.statedKg` — the rung in the load's **own**
	 * semantics, which is what the `+ kg` box takes. `effectiveKg` is the
	 * bodyweight-inclusive total (`WarmupSet.effectiveKg`) and is here for one
	 * job only: `effectiveKg > targetKg` is what says this ramp resolves against the
	 * athlete, so the rung can be *described* as `bodyweight + 15 kg` instead of
	 * falling silent on the base rungs, where `targetKg` is `0`. It is never a
	 * number to put in the box.
	 */
	warmupRung: {
		targetKg: number
		effectiveKg: number
		plateLine: string
	} | null
	/** What was logged, or null when this set has not been done yet. */
	logged: {
		id: string
		role: SetRole
		outcome: SetOutcome
		toFailure: boolean
		load: LoadValue | null
		effectiveKg: number | null
		/**
		 * **Why this row's stored kilo is not being shown**, where it is not — the
		 * `load` column and the `effectiveKg` beside it disagree, and a number
		 * neither of them can vouch for is worse than an absence.
		 *
		 * Null in the ordinary case, which is every row `saveLoggedSet` wrote.
		 * Where it is set, `effectiveKg` is null and `load` is still the row's own
		 * stated load — the half that is readable, and the half the athlete typed.
		 * The row is **not** dropped: a set that happened must not vanish because a
		 * derived column got out of step with it.
		 */
		loadUnreadable?: string | null
		reps: number | null
		repsLeft: number | null
		durationSec: number | null
		rir: number | null
		restTakenSec: number | null
	} | null
	ghost: SetGhost | null
}

/** One exercise in the session, with its rows. The grid stacks these on one
 * scroll — never a wizard step per exercise. */
export type LogExercise = {
	stepId: string
	exerciseId: string | null
	name: string
	/** Rest between sets as prescribed, which is what the timer counts down after
	 * a set that met its target. A missed set rests longer — `strength/rest.ts`. */
	restBetweenSetsSec: number | null
	/**
	 * Whether this movement is worked one side at a time, so the row menu asks for
	 * the other side's reps **only where that means something**.
	 *
	 * Three answers, not two (ADR 0061): `true` is a stated unilateral movement,
	 * `false` is a stated bilateral one — a barbell back squat has no other side
	 * and must not be asked for one — and **`null` means nobody stated it**, which
	 * is not `false`. A NULL still offers the field, phrased as the question it is.
	 */
	unilateral: boolean | null
	/**
	 * The **Load Semantics** the corpus authored for this movement: which member
	 * of the `LoadValue` union its number is, or `null` where nobody stated one.
	 *
	 * This is what a bodyweight plank knows about itself, and it is why the log
	 * grid can open on `Bodyweight` rather than on an empty kg box the athlete can
	 * only satisfy by inventing a kilo (ADR 0056 §3, ADR 0008's Unavailable
	 * Metric). A prescription still outranks it, and what was logged outranks
	 * both.
	 */
	loadSemanticsKind: LoadValueKind | null
	rows: LogRow[]
	/**
	 * The generated ramp's rows, in their own reserved index band
	 * ({@link WARMUP_ORDER_INDEX_BASE}) so a rung cannot land on set one.
	 *
	 * Empty where there is nothing to ramp: no resolved work weight, no gym on
	 * file, or a load kind the published mechanics do not cover.
	 */
	warmupRows: LogRow[]
	/** Why there is no ramp, in the ramp module's own words. Null when there is
	 * one, or when nothing was asked of it. */
	warmupUnavailable: string | null
	/**
	 * What this movement does to the plate arithmetic, plus the rack it is solved
	 * against. Null where the athlete has not described a gym — an absence the
	 * surface states rather than a bar it assumes.
	 *
	 * Sent whole to the browser on purpose: the plate line is a **passive
	 * annotation that updates as you type**, so the solver has to run client-side,
	 * and it is a pure module that can.
	 */
	plateContext: ExercisePlateContext | null
}

export type StrengthLogView = {
	sessionId: string
	sessionTitle: string
	scheduledAt: Date
	status: string
	/** The athlete's bodyweight, for the bodyweight-derived load kinds. Null is a
	 * real answer: those kinds then bake `effectiveKg = null` rather than a guess. */
	bodyweightKg: number | null
	exercises: LogExercise[]
	/** Whether the athlete has described a gym at all. `false` is why a plate line
	 * is missing, and the surface says which. */
	hasGymOnFile: boolean
	/**
	 * The **Program Instance** this session's shape belongs to, where one is
	 * running. Finishing the session folds the log back into it, and this is how
	 * the runner knows there is anything to fold.
	 */
	program: { instanceId: string; name: string } | null
}

/**
 * Everything the runner reads: the grid, the ramp, the resolved loads, the rack
 * and the program the session belongs to.
 *
 * Returns `null` when the session is not this athlete's, and an empty
 * `exercises` when it has no strength Step — the surface then says so rather
 * than rendering an empty grid.
 *
 * **Nothing here is stamped.** The loads resolve against the anchors as of the
 * session's own day, and the ramp is generated from the load that resolved, at
 * the moment the session is opened.
 */
export async function getStrengthLogView(
	userId: string,
	sessionId: string,
): Promise<StrengthLogView | null> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			id: true,
			scheduledAt: true,
			status: true,
			workoutId: true,
			workout: {
				select: {
					title: true,
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							orderIndex: true,
							steps: {
								orderBy: { orderIndex: 'asc' },
								where: { kind: 'strength' },
								select: {
									id: true,
									notes: true,
									exerciseId: true,
									restBetweenSetsSec: true,
									exercise: {
										select: {
											id: true,
											name: true,
											equipment: true,
											unilateral: true,
											// The **Load Semantics** the corpus authored: what kind of
											// number this movement takes, if any. Read from the default
											// variant, and read here rather than from the plate context
											// because the plate context is null without a gym on file —
											// and a plank is bodyweight-loaded in a garage too.
											variants: {
												orderBy: [
													{ isDefault: 'desc' as const },
													{ createdAt: 'asc' as const },
												],
												take: 1,
												select: { loadKind: true },
											},
										},
									},
									sets: {
										orderBy: { orderIndex: 'asc' },
										select: {
											id: true,
											orderIndex: true,
											reps: true,
											durationSec: true,
											load: true,
											weightKg: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
	if (!session) return null

	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { weightKg: true },
	})

	const steps = (session.workout?.blocks ?? []).flatMap((b) => b.steps)
	const logs = await prisma.exerciseSetLog.findMany({
		where: { sessionId },
		orderBy: { orderIndex: 'asc' },
		select: setLogSelect,
	})
	const logsByStep = new Map<string, SetLogRow[]>()
	for (const log of logs) {
		// A row whose `stepId` was set to NULL — the prescription it answered was
		// deleted — belongs to no slot in this grid, so it cannot be placed in one.
		// **Reported, not decided here:** `stepId` became nullable in the schema
		// change landing alongside this one, and where such a row should surface is
		// that change's question, not this seam's.
		if (log.stepId == null) continue
		const bucket = logsByStep.get(log.stepId)
		if (bucket) bucket.push(log)
		else logsByStep.set(log.stepId, [log])
	}

	const bodyweightKg = profile?.weightKg ?? null
	// One read for the whole view: every exercise solves against the same rack
	// unless its variant names another one.
	const gym = await getGymProfile(userId)

	const exercises: LogExercise[] = []
	for (const step of steps) {
		const allStepLogs = logsByStep.get(step.id) ?? []
		// The ramp's rows live in their own index band, so they cannot be counted as
		// prescribed rows — without this split one logged rung would grow the grid
		// by a thousand empty sets.
		const stepLogs = allStepLogs.filter((l) => !isWarmupRampIndex(l.orderIndex))
		const rampLogs = allStepLogs.filter((l) => isWarmupRampIndex(l.orderIndex))
		// The grid shows one row per prescribed set, plus any set the athlete added
		// beyond the prescription. Never fewer rows than there is data for.
		const rowCount = Math.max(
			step.sets.length,
			...stepLogs.map((l) => l.orderIndex + 1),
			// A strength Step with no authored sets is still loggable — the athlete
			// went to the gym and the prescription was vague. One row to start.
			1,
		)
		// The ghost reads the **same query and the same scope as the records** —
		// `(exerciseId, equipment)`. Before ADR 0058 this ran its own unscoped pair
		// of queries, so a dumbbell session could ghost against a barbell one.
		const previous = step.exerciseId
			? lastSessionSets(
					await performedSetsForExercise(userId, step.exerciseId),
					{
						exerciseId: step.exerciseId,
						equipment: toEquipmentId(step.exercise?.equipment),
						now: session.scheduledAt,
					},
					session.id,
				)
			: []
		const ghosts = ghostsForRows(previous, rowCount)

		// The anchors are read **as of the session's own day**, never as of now: a
		// session from March must resolve against March's 1RM, and reading April's
		// re-test into it would quietly restate what was prescribed.
		const anchorCtx = step.exerciseId
			? await getAnchorContext(userId, step.exerciseId, session.scheduledAt)
			: null
		const plateContext = await getExercisePlateContext({
			userId,
			exerciseId: step.exerciseId,
			bodyweightKg,
			gym,
		})

		const rows: LogRow[] = []
		for (let index = 0; index < rowCount; index++) {
			const prescribed = step.sets.find((s) => s.orderIndex === index) ?? null
			const logged = stepLogs.find((l) => l.orderIndex === index) ?? null
			const prescribedLoad = prescribed
				? (parseLoadTarget(prescribed.load) ??
					// The legacy projection, still the only load on rows authored
					// before `load` existed.
					(prescribed.weightKg != null
						? ({ kind: 'absolute', kg: prescribed.weightKg } as LoadTarget)
						: null))
				: null
			rows.push({
				orderIndex: index,
				exerciseSetId: prescribed?.id ?? null,
				prescribedReps: prescribed?.reps ?? null,
				prescribedDurationSec: prescribed?.durationSec ?? null,
				prescribedLoad,
				resolvedLoad:
					prescribedLoad && anchorCtx
						? resolveLoadTarget(prescribedLoad, anchorCtx)
						: null,
				warmupRung: null,
				logged: toLoggedRow(logged),
				ghost: ghosts[index] ?? null,
			})
		}

		const ramp = buildWarmupRows({
			rows,
			rampLogs,
			plateContext,
		})

		exercises.push({
			stepId: step.id,
			exerciseId: step.exerciseId,
			// A Step without an `Exercise` row still has a name: its notes are what
			// the athlete wrote in the slot. Never a bare "Exercise".
			name: step.exercise?.name ?? step.notes ?? 'Lift',
			restBetweenSetsSec: step.restBetweenSetsSec,
			// A Step naming no catalogued `Exercise` states nothing about laterality,
			// which is exactly `null` — never `false`.
			unilateral: step.exercise?.unilateral ?? null,
			loadSemanticsKind: toLoadValueKind(step.exercise?.variants[0]?.loadKind),
			rows,
			warmupRows: ramp.rows,
			warmupUnavailable: ramp.unavailable,
			plateContext,
		})
	}

	return {
		sessionId: session.id,
		sessionTitle: session.workout?.title ?? 'Strength session',
		scheduledAt: session.scheduledAt,
		status: session.status,
		bodyweightKg,
		exercises,
		hasGymOnFile: gym != null,
		program: await programForSession(userId, session.workoutId),
	}
}

/** The stored `loadKind` string, narrowed to the shipped union. An unknown
 * string is `null` — nobody stated a kind this app understands — never a guess
 * at `external`. */
function toLoadValueKind(stored: string | undefined): LoadValueKind | null {
	return (LOAD_VALUE_KINDS as readonly string[]).includes(stored ?? '')
		? (stored as LoadValueKind)
		: null
}

/**
 * One stored row as the grid reads it — and the seam where the **stored kilo is
 * checked against the load that explains it** rather than believed.
 *
 * `readStoredSetLoad` does the deciding (see its own note for why the check is
 * never a correction). A `contradicted` row keeps its `load`, so the grid still
 * shows what the athlete stated and the row is not silently dropped, but its
 * kilo is refused and the reason travels with it in `loadUnreadable`. An
 * `uncheckable` row — a `load` column that will not parse — is read exactly as it
 * was before this check existed.
 */
function toLoggedRow(logged: SetLogRow | null): LogRow['logged'] {
	if (!logged) return null
	const reading = readStoredSetLoad(logged)
	return {
		id: logged.id,
		role: logged.role as SetRole,
		outcome: logged.outcome as SetOutcome,
		toFailure: logged.toFailure,
		load: reading.load,
		// The **stored** kilo where the pair agrees, and none at all where it does
		// not. Never the recomputed one: ADR 0056 §3's bake is the record of what
		// happened, and quietly substituting a fresh reading for it is the rewrite
		// that ADR exists to forbid.
		effectiveKg: reading.kind === 'contradicted' ? null : reading.effectiveKg,
		loadUnreadable:
			reading.kind === 'contradicted' ? reading.explanation : null,
		reps: logged.reps,
		repsLeft: logged.repsLeft,
		durationSec: logged.durationSec,
		rir: logged.rir,
		restTakenSec: logged.restTakenSec,
	}
}

/**
 * The ramp, generated from the **heaviest resolved working set** — you warm up to
 * the top set, not to the first one — and only where every input for it is on
 * file: a rack, a resolved kilo, and a load kind the published mechanics cover.
 *
 * Each rung's rows are `LogRow`s so the grid renders them with the same three
 * controls as everything else. Unlike the reference product's, the ramp is
 * **editable** — a deliberate departure, and the reason a rung is a row rather
 * than a line of text.
 */
function buildWarmupRows(input: {
	rows: LogRow[]
	rampLogs: SetLogRow[]
	plateContext: ExercisePlateContext | null
}): { rows: LogRow[]; unavailable: string | null } {
	const { plateContext } = input
	if (!plateContext) return { rows: [], unavailable: null }

	const workKg = input.rows.reduce<number | null>((heaviest, row) => {
		const resolved = row.resolvedLoad
		if (resolved?.kind !== 'resolved') return heaviest
		return heaviest == null || resolved.kg > heaviest ? resolved.kg : heaviest
	}, null)
	if (workKg == null) return { rows: [], unavailable: null }

	const ramp: WarmupRamp = warmupRamp(workKg, {
		...plateContext.options,
		inventory: plateContext.inventory,
	})
	if (ramp.outcome === 'unavailable') {
		return { rows: [], unavailable: ramp.explanation }
	}

	return {
		unavailable: null,
		rows: ramp.sets.map((rung) => {
			const orderIndex = WARMUP_ORDER_INDEX_BASE + rung.orderIndex
			const logged =
				input.rampLogs.find((l) => l.orderIndex === orderIndex) ?? null
			return {
				orderIndex,
				// A generated rung answers no authored `ExerciseSet`, which is exactly
				// what `exerciseSetId` being nullable is for.
				exerciseSetId: null,
				prescribedReps: rung.reps,
				prescribedDurationSec: null,
				prescribedLoad: { kind: 'absolute', kg: rung.statedKg },
				resolvedLoad: null,
				warmupRung: {
					targetKg: rung.statedKg,
					effectiveKg: rung.effectiveKg,
					plateLine: plateLineText(rung.solution),
				},
				logged: toLoggedRow(logged),
				// No ghost on a warm-up: the ramp is generated from *today's* work
				// weight, and last time's rungs are not this session's prescription.
				ghost: null,
			}
		}),
	}
}

/** The active **Program Instance** whose day shape is this session's `Workout`,
 * if any. A paused or ended run is deliberately not found: folding a log into a
 * run the athlete stopped would advance a program nobody is on. */
async function programForSession(
	userId: string,
	workoutId: string | null,
): Promise<{ instanceId: string; name: string } | null> {
	if (!workoutId) return null
	const instance = await prisma.programInstance.findFirst({
		where: {
			userId,
			status: 'active',
			program: { days: { some: { workoutId } } },
		},
		orderBy: { startedOn: 'desc' },
		select: { id: true, program: { select: { name: true } } },
	})
	return instance
		? { instanceId: instance.id, name: instance.program.name }
		: null
}

/**
 * The sets from the **last session that contained this lift on this equipment**
 * — not the last calendar session, which on a push/pull/legs split would show
 * the wrong ghost two days in three, and not the last session on the *movement*,
 * which would ghost a dumbbell day against a barbell one.
 *
 * Which session that is, is decided by the pure module's `lastTimeYouDidThis`,
 * so the ghost and the history surface answer "last time" with one rule rather
 * than two. "Last" is by the session's own scheduled day rather than by
 * `completedAt`, so back-filling last Tuesday's session today does not make it
 * the ghost for today's. The session being logged is excluded, so a row cannot
 * become its own ghost.
 *
 * The role and outcome gate is left to `ghostsForRows`, which drops warm-ups and
 * abandoned sets before matching positionally (ADR 0056 §5).
 */
function lastSessionSets(
	sets: PerformedSet[],
	scope: ExerciseScope,
	excludeSessionId: string,
): PerformedSet[] {
	const last = lastTimeYouDidThis(sets, { ...scope, excludeSessionId })
	if (!last) return []
	return sets
		.filter(
			(set) =>
				set.sessionId === last.sessionId && set.equipment === scope.equipment,
		)
		.sort((a, b) => a.orderIndex - b.orderIndex)
}

/**
 * **This athlete's anchors for every lift a workout names**, keyed by exercise
 * id — the context the Token Sentence resolves `@ 85 % 1RM` and `@ 8RM` against
 * on the session detail screen.
 *
 * ADR 0027 is why this is a loader's job and not the notation's: the sentence
 * stays a pure function of structure, so the anchors are read here and handed
 * in. `deriveWorkoutNotation` never queries.
 *
 * `asOf` is an **argument**, never a clock read — a session from March resolves
 * against March's anchor, and reading April's re-test into it would quietly
 * restate what was prescribed. A step with no exercise contributes no key, and a
 * lift with no anchors still gets a context: the resolver then states the
 * absence, which is what the surface must show instead of a number.
 */
export async function getWorkoutLoadContexts(
	userId: string,
	workout:
		| { blocks: Array<{ steps: Array<{ exerciseId?: string | null }> }> }
		| null
		| undefined,
	asOf: Date,
): Promise<Record<string, ResolveContext>> {
	const exerciseIds = [
		...new Set(
			(workout?.blocks ?? []).flatMap((block) =>
				block.steps.flatMap((step) =>
					step.exerciseId ? [step.exerciseId] : [],
				),
			),
		),
	]
	const contexts = await Promise.all(
		exerciseIds.map(async (exerciseId) => {
			return [
				exerciseId,
				await getAnchorContext(userId, exerciseId, asOf),
			] as const
		}),
	)
	return Object.fromEntries(contexts)
}

export type SaveLoggedSetInput = {
	athleteId: string
	sessionId: string
	stepId: string
	orderIndex: number
	role: SetRole
	outcome: SetOutcome
	toFailure: boolean
	load: LoadValue
	reps: number | null
	repsLeft: number | null
	durationSec: number | null
	rir: number | null
	restTakenSec: number | null
	/**
	 * Whether this save is allowed to restate the **kind** of load on a set that
	 * is already recorded.
	 *
	 * Absent or `false` is the ordinary case, and it is a lock rather than a
	 * preference: a logged set is a record of what happened, and a save that
	 * changes `{"kind":"stackLevel","level":7}` into `{"kind":"external","kg":7}`
	 * turns an ordinal into 7 kg of iron and bakes an `effectiveKg` for it — a
	 * fabricated kilo that then feeds records and the program fold. The observed
	 * defect reached that state as a *side effect* of typing reps, because the
	 * kind came off a per-exercise picker that had re-defaulted on reload.
	 *
	 * So changing it has to be said. The runner sets this only when the athlete has
	 * actually touched *"How this is loaded"*; a caller that merely re-posts a row
	 * is refused with `load-kind-locked` and the stored row is left alone.
	 */
	changeLoadKind?: boolean
}

export type SaveLoggedSetResult =
	| {
			ok: true
			id: string
			/**
			 * The records this set just took, if any — what the PR banner is made of.
			 * Empty is the ordinary answer, and empty is also what a warm-up, an
			 * abandoned set and a set on a lift with no history all get.
			 *
			 * Derived, never stored: the set row *is* the measurement, so this is a
			 * reading over what was just written and not a second source of truth
			 * about it (ADR 0058 §1).
			 */
			records: StrengthRecord[]
	  }
	| {
			ok: false
			reason: 'not-found' | 'not-strength' | 'no-count'
	  }
	| {
			ok: false
			reason: 'load-kind-locked'
			/** What the stored row says it was loaded with, so the surface can name it
			 * rather than describing the refusal in the abstract. */
			recordedKind: LoadValue['kind']
	  }

/**
 * Log one set, or restate it. An **upsert** on `(sessionId, stepId, orderIndex)`,
 * so the between-sets double-tap that every logger gets cannot produce two rows
 * for one set.
 *
 * `effectiveKg` is baked on the way in from the athlete's bodyweight, and the
 * bodyweight it used is stored beside it. **Neither is ever recomputed by an
 * edit**: a weighted-dip record from two years ago must not move when the
 * athlete's bodyweight does, and the witness standing beside it must not move
 * either. Which columns an update is allowed to carry, and why, is
 * {@link setLogWrite}'s — this function does not assemble a write payload of its
 * own, because one payload serving both branches of the upsert is what produced
 * the defect (ADR 0056 §3).
 *
 * **The load kind of a recorded set is locked** unless the caller says it means to
 * change it (`changeLoadKind`). Restating a set is how a typo gets fixed, but the
 * kind is not a number in a field — it is what the set *was* — and a save that
 * quietly swaps it is the one edit that can turn an ordinal into kilos.
 *
 * **`no-count` is refused before anything is written.** A completed working set
 * that says nothing about what was performed is not a set: it would mint a record
 * off an effort nobody made, and a null rep count reads as zero reps in the
 * program engine's success predicate, so one accidental tap would stall the
 * program. The rule and its exemptions — an abandoned set, a warm-up rung, a
 * timed hold counted in seconds — are `statesWhatWasPerformed`'s, not this file's:
 * the write seam asks, it does not decide.
 */
export async function saveLoggedSet(
	input: SaveLoggedSetInput,
): Promise<SaveLoggedSetResult> {
	const step = await prisma.workoutStep.findFirst({
		where: {
			id: input.stepId,
			block: { workout: { sessions: { some: { id: input.sessionId } } } },
		},
		select: {
			id: true,
			kind: true,
			exerciseId: true,
			exercise: { select: { id: true, equipment: true } },
			sets: { select: { id: true, orderIndex: true } },
		},
	})
	if (!step) return { ok: false, reason: 'not-found' }
	if (step.kind !== 'strength') return { ok: false, reason: 'not-strength' }
	if (!statesWhatWasPerformed(input)) return { ok: false, reason: 'no-count' }
	// Ownership is checked against the session rather than the Step, because a
	// Catalogue Workout's Step is reachable by everyone and its sessions are not.
	const session = await prisma.workoutSession.findFirst({
		where: { id: input.sessionId, userId: input.athleteId },
		select: { id: true },
	})
	if (!session) return { ok: false, reason: 'not-found' }

	// **What a recorded row already says it was loaded with.** Read before the
	// upsert, because the upsert cannot tell a correction from an overwrite: an
	// `update` that carries a different `kind` rewrites history, and no rep-count
	// edit has any business doing that (see `changeLoadKind`).
	const recorded = await prisma.exerciseSetLog.findUnique({
		where: {
			sessionId_stepId_orderIndex: {
				sessionId: input.sessionId,
				stepId: input.stepId,
				orderIndex: input.orderIndex,
			},
		},
		select: { load: true, effectiveKg: true, bodyweightKg: true },
	})
	const recordedKind = recorded
		? parseStoredLoadValue(recorded.load)?.kind
		: null
	if (
		recordedKind != null &&
		recordedKind !== input.load.kind &&
		!input.changeLoadKind
	) {
		return { ok: false, reason: 'load-kind-locked', recordedKind }
	}

	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: input.athleteId },
		select: { weightKg: true },
	})

	const write = setLogWrite({
		input,
		recorded,
		statedBodyweightKg: profile?.weightKg ?? null,
		exerciseSetId:
			step.sets.find((s) => s.orderIndex === input.orderIndex)?.id ?? null,
		exerciseId: step.exerciseId,
		// The other half of the progression key, both halves of it. Resolved here
		// rather than posted, for the same reason `exerciseSetId` is.
		...(await realizationForStep(step.exercise)),
	})

	const row = await prisma.exerciseSetLog.upsert({
		where: {
			sessionId_stepId_orderIndex: {
				sessionId: input.sessionId,
				stepId: input.stepId,
				orderIndex: input.orderIndex,
			},
		},
		create: {
			sessionId: input.sessionId,
			stepId: input.stepId,
			orderIndex: input.orderIndex,
			...write.create,
		},
		update: write.update,
		select: { id: true },
	})
	// **Detection runs on the working set that finished, and on nothing else.**
	// The gate is asked here, off what was just posted, so a warm-up rung — most
	// of the taps on a heavy day — never pays for the history read at all. The
	// hottest surface in the app stays one write and one cheap question.
	const records = countsTowardWork({ role: input.role, outcome: input.outcome })
		? await recordsSetBy(input.athleteId, row.id)
		: []
	return { ok: true, id: row.id, records }
}

/** What the row already says, read before the write. The three load columns are
 * here because the update branch has to be able to tell a correction of the set's
 * *content* from a restatement of what it was *loaded with*. */
type RecordedSetLog = {
	load: string
	effectiveKg: number | null
	bodyweightKg: number | null
}

/**
 * **The one place that knows which columns of a set log are immutable**, and the
 * reason `saveLoggedSet` has no `fields` object any more.
 *
 * A single object serving both branches of the upsert was the defect: an edit to
 * a rep count carried a freshly baked `effectiveKg` and a freshly read
 * `bodyweightKg` along with it, so raising a profile weight 74 → 84 and then
 * changing 5 reps to 6 moved a stored dip from 104 kg to 114 kg *and* overwrote
 * the 74 that was standing beside it as the audit trail — the exact silent
 * rewrite [ADR 0056 §3] exists to forbid, with its own witness destroyed in the
 * same statement. A conditional inside a shared object would not have fixed it,
 * because the shared object is the bug. So the columns are split by what they are
 * *about*:
 *
 * - **What the set was** — `role`, `outcome`, `toFailure`, `reps`, `repsLeft`,
 *   `durationSec`, `rir`, `restTakenSec`. Statements about the effort, every one
 *   of them correctable after the fact, and all an ordinary edit may touch.
 * - **What it was loaded with** — `load`, `effectiveKg`, `bodyweightKg`. Written
 *   on a create, and on an update **only when the posted load actually differs
 *   from the recorded one** (see `restated` below). Re-posting the same load
 *   while fixing reps leaves all three columns out of the update entirely, which
 *   is what makes the reported defect unreachable rather than merely unlikely.
 * - **Facts about the moment of logging** — `exerciseSetId`, `exerciseId`,
 *   `variantId`, and `completedAt` (which is simply never named). Create-only.
 *   The movement and its realization are what the athlete *lifted*; if the
 *   prescription is later edited to a different exercise, an update that
 *   re-derived them would walk a squat's record onto front squat. Changing what
 *   movement a logged set was is not an edit — it is un-logging it
 *   (`clearLoggedSet`) and logging the new one.
 *
 * `effectiveKg` and `bodyweightKg` are only ever written **together**, in the same
 * object, so a baked kilo can never end up standing next to a bodyweight that did
 * not produce it.
 */
function setLogWrite(args: {
	input: SaveLoggedSetInput
	recorded: RecordedSetLog | null
	/** The athlete's bodyweight as their profile states it now. */
	statedBodyweightKg: number | null
	exerciseSetId: string | null
	exerciseId: string | null
	variantId: string | null
	equipment: string | null
}) {
	const { input, recorded } = args

	/** What the set was, and the only thing an ordinary edit may say. */
	const performed = {
		role: input.role,
		outcome: input.outcome,
		toFailure: input.toFailure,
		reps: input.reps,
		repsLeft: input.repsLeft,
		durationSec: input.durationSec,
		rir: input.rir,
		restTakenSec: input.restTakenSec,
	}

	/** Facts about the moment of logging. Create-only. */
	const asLogged = {
		exerciseSetId: args.exerciseSetId,
		exerciseId: args.exerciseId,
		variantId: args.variantId,
		// **The equipment, stamped**, and stamped here because it belongs with the
		// `variantId` standing beside it: the two are the one progression key
		// `(exerciseId, equipment)`, and a key half that is re-derived from a
		// mutable `ExerciseVariant` row at read time is not a key. One
		// `UPDATE ExerciseVariant SET equipment = 'dumbbell'` used to move eight
		// barbell bench sessions onto a dumbbell key and rekey their records with
		// them. Create-only for the same reason the rest of this block is.
		equipment: args.equipment,
	}

	// **A restatement is a load that differs from the recorded one**, compared
	// canonically so that key order in the posted object is not mistaken for a
	// change. Everything else — the between-sets double-tap, a rep fix, an RIR
	// added afterwards — re-posts the identical load and is an edit. An
	// unparseable stored load counts as restated: there is nothing there worth
	// preserving.
	const recordedLoad = recorded ? parseStoredLoadValue(recorded.load) : null
	const restated =
		recorded == null ||
		recordedLoad == null ||
		canonicalLoad(recordedLoad) !== canonicalLoad(input.load)

	// **Which bodyweight a bake uses.** On a create it is the athlete's stated
	// weight now, which is the bodyweight *then* by definition. On a restatement it
	// is the bodyweight already standing beside the row whenever there is one:
	// restating a load corrects what the set was loaded with, not when it happened,
	// so correcting a two-year-old dip from `bw + 20` to `bw + 25` must still bake
	// against the 74 kg that set was performed at and not against today's 84. The
	// current stated weight is the fallback, and it is the right answer in the one
	// case that reaches it — a row with no bodyweight beside it, because the load
	// kind used not to depend on one (`changeLoadKind` from `external` to
	// `bodyweightPlus`) or because none was on file when it was logged.
	const bakeBodyweightKg = recorded?.bodyweightKg ?? args.statedBodyweightKg
	const dependsOnBodyweight =
		input.load.kind === 'bodyweight' ||
		input.load.kind === 'bodyweightPlus' ||
		input.load.kind === 'assisted'
	const loadedWith = {
		load: JSON.stringify(input.load),
		effectiveKg: effectiveLoadKg(input.load, bakeBodyweightKg),
		// Written in the same breath as the kilo above, never separately, and null
		// only where the kind has no bodyweight in it to audit.
		bodyweightKg: dependsOnBodyweight ? bakeBodyweightKg : null,
	}

	return {
		create: { ...performed, ...asLogged, ...loadedWith },
		update: restated ? { ...performed, ...loadedWith } : performed,
	}
}

/** A Load Value as a string that is equal whenever the value is, regardless of
 * the order the caller happened to build the object in. Every member of the
 * union is a flat object, so sorting the keys is the whole of it. */
function canonicalLoad(load: LoadValue): string {
	return JSON.stringify(
		Object.entries(load).sort(([a], [b]) => a.localeCompare(b)),
	)
}

/**
 * **Which realization of the movement this set was lifted on** — *both* halves of
 * what the row stamps about it: the `ExerciseVariant` it was lifted on, and the
 * `equipment` that variant is, without which barbell bench and dumbbell bench
 * share one record.
 *
 * The equipment is the movement's own, as the `Exercise` row states it: the
 * runner has no per-set equipment control, and inventing one from the load kind
 * would read a `perSide` load as "dumbbell" on a trap bar. The day a picker
 * exists it states the equipment here and nothing else changes.
 *
 * **The two are stamped together and neither is derived from the other later.**
 * `equipment` is resolved *now*, from the variant that answered, because the
 * progression key `(exerciseId, equipment)` may not be a function of a row that
 * can still change: the variant is mutable and one `UPDATE` to it used to rekey
 * every set ever logged against it.
 *
 * **`null` is a real answer** and is returned for both halves in two cases: the
 * Step carries free text instead of an `Exercise`, or the `Exercise` states no
 * equipment. In a third — the movement has no variant for the equipment it states
 * — the `variantId` alone is null while the equipment is still stamped from the
 * `Exercise`: `findVariantByEquipment` answers with nothing rather than a
 * neighbouring realization, because a fabricated variant would merge two
 * histories that progress independently, but the set still knows what it was
 * lifted on.
 */
async function realizationForStep(
	exercise: { id: string; equipment: string | null } | null,
): Promise<{ variantId: string | null; equipment: string | null }> {
	if (!exercise?.equipment) return { variantId: null, equipment: null }
	const variant = await findVariantByEquipment(
		prisma,
		exercise.id,
		exercise.equipment,
	)
	// **The variant's own word for it where a variant answered**, and the movement's
	// otherwise. The variant is the row that states the realization, so where one
	// exists its `equipment` is what the set was lifted on; where none does, the set
	// still names the equipment the `Exercise` states, which is what every reader
	// used to fall back to at read time.
	return {
		variantId: variant?.id ?? null,
		equipment: variant?.equipment ?? exercise.equipment,
	}
}

/** Un-log a set. Deletion rather than a `cleared` flag: a set that did not
 * happen has nothing to say, and a tombstone would enter every count as a row
 * that has to be filtered out forever. */
export async function clearLoggedSet(
	athleteId: string,
	sessionId: string,
	stepId: string,
	orderIndex: number,
): Promise<boolean> {
	const result = await prisma.exerciseSetLog.deleteMany({
		where: {
			sessionId,
			stepId,
			orderIndex,
			session: { userId: athleteId },
		},
	})
	return result.count > 0
}

/**
 * ADR 0046 §4's **Strength Summary Count** for the current Training Week —
 * mandated there and never built, because until now "completed" on a gym session
 * meant only that somebody had typed an RPE.
 *
 * The denominator is the strength sessions **materialized** in the week, since a
 * Summary Count is defined as derived from existing sessions; the numerator is
 * the ones with at least one logged working set. A week with no strength session
 * returns `null`, which the surface renders as an absence rather than `0 of 0`.
 */
export async function getStrengthSummaryCount(
	userId: string,
	now: Date = new Date(),
): Promise<StrengthSummaryCount | null> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	const { start, end } = weekBoundsUTC(now, profile?.timezone ?? 'UTC')
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: start, lte: end },
			workout: { discipline: 'strength' },
		},
		select: {
			id: true,
			setLogs: {
				where: { role: 'working', outcome: 'completed' },
				select: { id: true },
			},
		},
	})
	return strengthSummaryCount(
		sessions.map((s) => ({ loggedWorkingSets: s.setLogs.length })),
	)
}
