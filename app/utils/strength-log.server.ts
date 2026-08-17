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
import {
	type ExercisePlateContext,
	getExercisePlateContext,
	getGymProfile,
} from './plate-inventory.server.ts'
import { type LoadResolution, resolveLoadTarget } from './strength/anchors.ts'
import { plateLineText } from './strength/plates.ts'
import { type WarmupRamp, warmupRamp } from './strength/warmup.ts'
import { getAnchorContext } from './strength-anchors.server.ts'
import {
	type LoadValue,
	type LoggedSet,
	type SetGhost,
	type SetOutcome,
	type SetRole,
	type StrengthSummaryCount,
	LoadValueSchema,
	WARMUP_ORDER_INDEX_BASE,
	effectiveLoadKg,
	ghostsForRows,
	isWarmupRampIndex,
	strengthSummaryCount,
} from './strength-log.ts'
import { type LoadTarget, LoadTargetSchema } from './workout-schema.ts'

/** A stored `load` column parsed back into its union, or null when the row
 * predates a vocabulary or was written by hand. Parse-don't-trust at the seam. */
function parseLoadValue(raw: string): LoadValue | null {
	try {
		const parsed = LoadValueSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

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
	/** A rung of the generated ramp: what to put on the bar, and what that is in
	 * plates on this rack. Null on every prescribed row. */
	warmupRung: { targetKg: number; plateLine: string } | null
	/** What was logged, or null when this set has not been done yet. */
	logged: {
		id: string
		role: SetRole
		outcome: SetOutcome
		toFailure: boolean
		load: LoadValue | null
		effectiveKg: number | null
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
									exercise: { select: { id: true, name: true } },
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
		const previous = step.exerciseId
			? await previousSessionSets(userId, step.exerciseId, session.scheduledAt)
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

function toLoggedRow(logged: SetLogRow | null): LogRow['logged'] {
	return logged
		? {
				id: logged.id,
				role: logged.role as SetRole,
				outcome: logged.outcome as SetOutcome,
				toFailure: logged.toFailure,
				load: parseLoadValue(logged.load),
				effectiveKg: logged.effectiveKg,
				reps: logged.reps,
				repsLeft: logged.repsLeft,
				durationSec: logged.durationSec,
				rir: logged.rir,
				restTakenSec: logged.restTakenSec,
			}
		: null
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
				prescribedLoad: { kind: 'absolute', kg: rung.loadKg },
				resolvedLoad: null,
				warmupRung: {
					targetKg: rung.loadKg,
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
 * The sets from the **last session that contained this exercise** — not the last
 * calendar session, which on a push/pull/legs split would show the wrong ghost
 * two days in three.
 *
 * "Last" is by the session's own scheduled day rather than by `completedAt`, so
 * back-filling last Tuesday's session today does not make it the ghost for
 * today's.
 */
async function previousSessionSets(
	userId: string,
	exerciseId: string,
	before: Date,
): Promise<LoggedSet[]> {
	const previousSession = await prisma.workoutSession.findFirst({
		where: {
			userId,
			scheduledAt: { lt: before },
			setLogs: { some: { exerciseId } },
		},
		orderBy: { scheduledAt: 'desc' },
		select: { id: true },
	})
	if (!previousSession) return []
	const rows = await prisma.exerciseSetLog.findMany({
		where: { sessionId: previousSession.id, exerciseId },
		orderBy: { orderIndex: 'asc' },
		select: setLogSelect,
	})
	return rows.flatMap((row) => {
		const load = parseLoadValue(row.load)
		if (!load) return []
		return [
			{
				orderIndex: row.orderIndex,
				role: row.role as SetRole,
				outcome: row.outcome as SetOutcome,
				load,
				reps: row.reps,
				repsLeft: row.repsLeft,
				durationSec: row.durationSec,
				rir: row.rir,
				toFailure: row.toFailure,
			},
		]
	})
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
}

export type SaveLoggedSetResult =
	| { ok: true; id: string }
	| { ok: false; reason: 'not-found' | 'not-strength' }

/**
 * Log one set, or restate it. An **upsert** on `(sessionId, stepId, orderIndex)`,
 * so the between-sets double-tap that every logger gets cannot produce two rows
 * for one set.
 *
 * `effectiveKg` is baked here from the athlete's bodyweight *now*, and the
 * bodyweight it used is stored beside it. Both are re-derivable and neither is
 * ever recomputed: a weighted-dip record from two years ago must not move when
 * the athlete's bodyweight does.
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
			sets: { select: { id: true, orderIndex: true } },
		},
	})
	if (!step) return { ok: false, reason: 'not-found' }
	if (step.kind !== 'strength') return { ok: false, reason: 'not-strength' }
	// Ownership is checked against the session rather than the Step, because a
	// Catalogue Workout's Step is reachable by everyone and its sessions are not.
	const session = await prisma.workoutSession.findFirst({
		where: { id: input.sessionId, userId: input.athleteId },
		select: { id: true },
	})
	if (!session) return { ok: false, reason: 'not-found' }

	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: input.athleteId },
		select: { weightKg: true },
	})
	const bodyweightKg = profile?.weightKg ?? null
	const dependsOnBodyweight =
		input.load.kind === 'bodyweight' ||
		input.load.kind === 'bodyweightPlus' ||
		input.load.kind === 'assisted'

	const fields = {
		role: input.role,
		outcome: input.outcome,
		toFailure: input.toFailure,
		load: JSON.stringify(input.load),
		effectiveKg: effectiveLoadKg(input.load, bodyweightKg),
		bodyweightKg: dependsOnBodyweight ? bodyweightKg : null,
		reps: input.reps,
		repsLeft: input.repsLeft,
		durationSec: input.durationSec,
		rir: input.rir,
		restTakenSec: input.restTakenSec,
		exerciseSetId:
			step.sets.find((s) => s.orderIndex === input.orderIndex)?.id ?? null,
		exerciseId: step.exerciseId,
	}

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
			...fields,
		},
		// `completedAt` is left alone on an update: correcting a typo three minutes
		// later does not move when the set happened.
		update: fields,
		select: { id: true },
	})
	return { ok: true, id: row.id }
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
