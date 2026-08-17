/**
 * **The Program Definitions' seed** — write the three linear-progression
 * programs, their day shapes and their per-lift rule tables into the database.
 *
 * Every number here comes from `app/utils/strength/program.constants.ts`, which
 * is where the published figures live with their provenance beside them. This
 * file **authors nothing**: it resolves the exercise rows the rules key on,
 * writes what the pure builders return, and carries each program's Citation and
 * its provenance note onto the row so a surface can show them.
 *
 * ## The three honesty constraints this seed does not launder
 *
 * 1. **The 5×5 → 3×5 → 1×5 ladder is not StrongLifts' published rule.** It is in
 *    none of the failure article, the plateau article or the app's progression
 *    settings, and it is not encoded as a progression rule anywhere — not here
 *    and not in the builders.
 * 2. **"Three fails then cut 10 %" has no trial**, and neither does any other
 *    percentage in this family. Each program's `provenanceNote` says so, and the
 *    surfaces render it beside the number.
 * 3. **The training max has no evidence base.** It is a documented product
 *    convention, and the percentage families that need one are a later slice —
 *    nothing here mints one.
 *
 * ## Why a seed and not a migration
 *
 * The same three reasons `catalogue-seed.server.ts` gives: a definition is
 * content, a migration cannot be typechecked, and the rule tables are
 * discriminated unions that a few hundred lines of hand-written SQL would make
 * invisible. Re-running is an upsert on stable ids, so a corrected number
 * refreshes in place and **nothing an athlete owns is touched** — a
 * `ProgramInstance` and its `ProgramLiftState` rows are the athlete's run, and
 * this file never writes to either.
 *
 * ## The day shapes are Workout rows
 *
 * Each day is a system-authored `Workout` — the same referent the Catalogue
 * uses — so a program's session shape is one row every athlete reads rather than
 * a copy per instance. The sets carry **reps and no load**: the shape may be
 * stamped ahead, but the load resolves when the session is opened, because week
 * 6's weight is a function of week 5's log.
 */
import { type PrismaClient } from '@prisma/client'
import {
	type ProgramDefinition,
	type LiftProgressionRule,
} from './strength/program-rules.ts'
import {
	greySkullLp,
	startingStrengthPhaseOne,
	strongLifts5x5Basic,
} from './strength/program.constants.ts'
import { buildBlocksCreate } from './workout.server.ts'

/** The subset of the client this seed needs, so a test passes the real one and
 * nothing here reaches for a module-level singleton. */
type SeedClient = Pick<
	PrismaClient,
	| 'exercise'
	| 'workout'
	| 'strengthProgram'
	| 'strengthProgramDay'
	| 'strengthProgramLiftRule'
>

/**
 * The `Exercise` rows the three programs progress, by the slug the builders use.
 * These are the ids the shipped catalog already has (`20260519130231`); nothing
 * here mints a second id for a movement that has one, and a missing row means
 * the lift is **left out of the rule table** rather than seeded against an id
 * that resolves to nothing.
 */
export const PROGRAM_LIFT_EXERCISE_IDS = {
	squat: 'ex_bb_back_squat',
	benchPress: 'ex_bb_bench',
	barbellRow: 'ex_bb_row',
	overheadPress: 'ex_bb_ohp',
	deadlift: 'ex_bb_deadlift',
} as const

/**
 * Where each program's numbers were read from. Four columns, the same shape
 * `CatalogueEntry` uses for a **Citation** — a program that quotes published
 * figures has to say where from.
 */
const PROGRAM_CITATIONS: Record<
	string,
	{ author: string; work: string; year: number | null; locator: string }
> = {
	prog_stronglifts_5x5_basic: {
		author: 'Mehdi Hadim',
		work: 'StrongLifts 5×5 (stronglifts.com, support.stronglifts.com)',
		year: null,
		locator: 'Progression, failure and plateau articles; retrieved 2026-08-13',
	},
	prog_starting_strength_phase1: {
		author: 'Mark Rippetoe',
		work: 'Starting Strength: Basic Barbell Training / startingstrength.com',
		year: 2011,
		locator: 'The novice linear progression and its resets',
	},
	prog_greyskull_lp_base: {
		author: 'John “Johnny Pain” Sheaffer',
		work: 'Greyskull LP (primary is a paid e-book; secondary consensus used)',
		year: null,
		locator: 'The 2×5 + 1×5+ template and its AMRAP progression',
	},
}

/** A day's shape lives on a stable Workout id, so re-seeding refreshes it in
 * place and every `StrengthProgramDay` keeps resolving. */
export function programDayWorkoutId(programId: string, dayId: string): string {
	return `wk_${programId}_day_${dayId.toLowerCase()}`
}

export type ProgramSeedResult = {
	/** Program Definitions written or refreshed. */
	programs: number
	/** Day shapes written as system-authored `Workout` rows. */
	days: number
	/** Per-lift rules written across all programs. */
	liftRules: number
	/** Lifts a program names that this database has no `Exercise` row for. An
	 * empty list is the expected state; a non-empty one is a fact about the
	 * exercise catalog and not a silent omission. */
	skippedLifts: string[]
}

/** The builders, each taking the resolved exercise ids and returning the pure
 * `ProgramDefinition` the engine reads. */
const PROGRAM_BUILDERS = [
	strongLifts5x5Basic,
	startingStrengthPhaseOne,
	greySkullLp,
]

/**
 * Seed (or refresh) the three Program Definitions.
 *
 * Idempotent on stable ids. A re-seed rewrites the definition — the rule table
 * is replaced wholesale so a corrected rule can *shrink* as well as grow — and
 * leaves every `ProgramInstance` and `ProgramLiftState` exactly as it found
 * them: an athlete's working weight is not the definition's business.
 */
export async function seedStrengthPrograms(
	prisma: SeedClient,
): Promise<ProgramSeedResult> {
	const wanted = Object.values(PROGRAM_LIFT_EXERCISE_IDS)
	const present = await prisma.exercise.findMany({
		where: { id: { in: [...wanted] } },
		select: { id: true },
	})
	const presentIds = new Set(present.map((row) => row.id))
	const ids: Record<string, string | undefined> = {}
	for (const [slug, id] of Object.entries(PROGRAM_LIFT_EXERCISE_IDS)) {
		if (presentIds.has(id)) ids[slug] = id
	}
	const skippedLifts = Object.entries(PROGRAM_LIFT_EXERCISE_IDS)
		.filter(([, id]) => !presentIds.has(id))
		.map(([slug]) => slug)

	const exerciseNames = new Map(
		(
			await prisma.exercise.findMany({
				where: { id: { in: [...presentIds] } },
				select: { id: true, name: true },
			})
		).map((row) => [row.id, row.name]),
	)

	let days = 0
	let liftRules = 0
	for (const build of PROGRAM_BUILDERS) {
		const definition = build(ids)
		await seedProgram(prisma, definition, exerciseNames)
		days += definition.dayIds.length
		liftRules += definition.liftRules.length
	}

	return {
		programs: PROGRAM_BUILDERS.length,
		days,
		liftRules,
		skippedLifts,
	}
}

async function seedProgram(
	prisma: SeedClient,
	definition: ProgramDefinition,
	exerciseNames: Map<string, string>,
) {
	const citation = PROGRAM_CITATIONS[definition.id] ?? null
	const envelope = {
		key: definition.key,
		variantId: definition.variantId,
		name: definition.name,
		authorship: 'system',
		cursorKind: definition.cursorKind,
		initialCursor: JSON.stringify(definition.initialCursor),
		citationAuthor: citation?.author ?? null,
		citationWork: citation?.work ?? null,
		citationYear: citation?.year ?? null,
		citationLocator: citation?.locator ?? null,
		provenanceNote: definition.provenanceNote,
	}
	await prisma.strengthProgram.upsert({
		where: { id: definition.id },
		create: { id: definition.id, ...envelope },
		update: envelope,
		select: { id: true },
	})

	for (const [orderIndex, dayId] of definition.dayIds.entries()) {
		const workoutId = await seedDayWorkout(
			prisma,
			definition,
			dayId,
			exerciseNames,
		)
		const day = {
			programId: definition.id,
			dayId,
			orderIndex,
			workoutId,
			workoutAuthorship: 'system',
		}
		await prisma.strengthProgramDay.upsert({
			where: { programId_dayId: { programId: definition.id, dayId } },
			create: day,
			update: day,
			select: { id: true },
		})
	}

	// Replaced wholesale rather than diffed: a rule the definition has dropped
	// must disappear, and nothing an athlete owns lives on these rows.
	await prisma.strengthProgramLiftRule.deleteMany({
		where: {
			programId: definition.id,
			NOT: {
				exerciseId: { in: definition.liftRules.map((rule) => rule.exerciseId) },
			},
		},
	})
	for (const [orderIndex, rule] of definition.liftRules.entries()) {
		const row = liftRuleRow(definition.id, rule, orderIndex)
		// Found then written rather than upserted: the progression key's
		// `equipment` half is nullable and Prisma's compound-unique input cannot
		// express a null. The triple is unique by schema, so this is still one row.
		const existing = await prisma.strengthProgramLiftRule.findFirst({
			where: {
				programId: definition.id,
				exerciseId: rule.exerciseId,
				equipment: rule.equipment,
			},
			select: { id: true },
		})
		if (existing) {
			await prisma.strengthProgramLiftRule.update({
				where: { id: existing.id },
				data: row,
				select: { id: true },
			})
		} else {
			await prisma.strengthProgramLiftRule.create({
				data: row,
				select: { id: true },
			})
		}
	}
}

function liftRuleRow(
	programId: string,
	rule: LiftProgressionRule,
	orderIndex: number,
) {
	return {
		programId,
		exerciseId: rule.exerciseId,
		equipment: rule.equipment,
		orderIndex,
		dayIds: JSON.stringify(rule.dayIds),
		setCount: rule.setCount,
		repsPerSet: rule.repsPerSet,
		setWeightSources: JSON.stringify(rule.setWeightSources),
		trigger: JSON.stringify(rule.trigger),
		successPredicate: JSON.stringify(rule.successPredicate),
		increment: JSON.stringify(rule.increment),
		stallsBeforeResponse: rule.stallsBeforeResponse,
		stallResponse: JSON.stringify(rule.stallResponse),
		incrementAdjustmentOnStall: JSON.stringify(rule.incrementAdjustmentOnStall),
		defaultStartKg: rule.defaultStartKg,
		startSeedRepMaxReps: rule.startSeedRepMaxReps,
		notes: null,
	}
}

/**
 * One day of a program as a system-authored `Workout`.
 *
 * The sets state **reps and no load**. A stamped kilo would be a claim about a
 * session that has not happened yet, and the whole point of an outcome-indexed
 * program is that the load is a function of the last log — so the shape is
 * authored here and the number arrives when the session is opened.
 */
async function seedDayWorkout(
	prisma: SeedClient,
	definition: ProgramDefinition,
	dayId: string,
	exerciseNames: Map<string, string>,
): Promise<string> {
	const id = programDayWorkoutId(definition.id, dayId)
	const lifts = definition.liftRules.filter((rule) =>
		rule.dayIds.includes(dayId),
	)
	const envelope = {
		title: `${definition.name} · Workout ${dayId}`,
		description: lifts
			.map(
				(rule) =>
					`${exerciseNames.get(rule.exerciseId) ?? 'Lift'} ${rule.setCount}×${rule.repsPerSet}`,
			)
			.join(' · '),
		discipline: 'strength',
		intent: 'strength-max',
		// The strength channel's own axis (ADR 0055's carve-out): a Strength Goal
		// is stated and the endurance archetype stays null.
		strengthGoal: 'maximal-strength',
		archetype: null,
		authorship: 'system',
		ownerId: null,
	}
	const blocks = buildBlocksCreate([
		{
			repeatCount: 1,
			steps: lifts.map((rule) => ({
				kind: 'strength' as const,
				exerciseId: rule.exerciseId,
				sets: Array.from({ length: rule.setCount }, (_, index) => ({
					kind: 'reps' as const,
					orderIndex: index,
					reps: rule.repsPerSet,
				})),
			})),
		},
	])

	const existing = await prisma.workout.findUnique({
		where: { id },
		select: { id: true },
	})
	if (existing) {
		await prisma.workout.update({
			where: { id },
			data: { ...envelope, blocks: { deleteMany: {}, create: blocks } },
			select: { id: true },
		})
	} else {
		await prisma.workout.create({
			data: { id, ...envelope, blocks: { create: blocks } },
			select: { id: true },
		})
	}
	return id
}
