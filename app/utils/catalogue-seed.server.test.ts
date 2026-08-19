import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	CATALOGUE_CORPUS,
	stockEntryId,
	stockWorkoutId,
} from './catalogue-corpus.all.ts'
import {
	STRENGTH_EXERCISE_CORPUS,
	seedCatalogue,
} from './catalogue-seed.server.ts'
import { listCatalogue, resolveCatalogueOrigin } from './catalogue.server.ts'
import { readCitation } from './catalogue.ts'
import { prisma } from './db.server.ts'
import { findVariantByEquipment } from './exercise-seed.server.ts'

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

const A_CITED = 'run-C3'
const A_HAND_WRITTEN = 'run-I2'

test('the corpus seeds as Stock Workouts with no owner at all', async () => {
	const result = await seedCatalogue(prisma)
	expect(result.seeded).toBe(CATALOGUE_CORPUS.length)
	expect(result.exercises).toBeGreaterThan(0)
	expect(result.handWritten).toBeGreaterThan(0)
	expect(result.convention).toBeGreaterThan(0)
	expect(result.cited).toBe(
		result.seeded - result.handWritten - result.convention,
	)

	// **The Catalogue's own rows, not every system-authored Workout.** Migration
	// `20260818120000` ships six private `wk_prog_…` day shapes for the three
	// strength programs, and those are `authorship: 'system'` too — system-authored
	// says *nobody owns it*, which is a different question from *is it in the
	// Catalogue*. The Catalogue's rows are the ones whose ids the corpus states.
	const stock = await prisma.workout.findMany({
		where: { authorship: 'system', id: { startsWith: 'stock_' } },
		select: { id: true, ownerId: true, visibility: true },
	})
	expect(stock).toHaveLength(CATALOGUE_CORPUS.length)
	for (const row of stock) expect(row.ownerId).toBeNull()
})

test('re-seeding refreshes in place — ids, saves and lineage survive', async () => {
	await seedCatalogue(prisma)
	const athlete = await createAthlete()
	const workoutId = stockWorkoutId(A_CITED)
	await prisma.catalogueSave.create({
		data: { workoutId, ownerId: athlete.id },
		select: { id: true },
	})

	const before = await prisma.workoutBlock.count({ where: { workoutId } })
	await seedCatalogue(prisma)
	const after = await prisma.workoutBlock.count({ where: { workoutId } })

	expect(after).toBe(before)
	// Scoped to the Catalogue's own ids, for the reason stated in the first test.
	expect(
		await prisma.workout.count({
			where: { authorship: 'system', id: { startsWith: 'stock_' } },
		}),
	).toBe(CATALOGUE_CORPUS.length)
	expect(await prisma.catalogueSave.count({ where: { workoutId } })).toBe(1)
})

test('a corpus row carries its Citation and a hand-written row carries none', async () => {
	await seedCatalogue(prisma)

	const cited = await prisma.catalogueEntry.findUniqueOrThrow({
		where: { id: stockEntryId(A_CITED) },
		select: {
			citationAuthor: true,
			citationWork: true,
			citationYear: true,
			citationLocator: true,
			archetype: true,
			phases: { select: { phase: true } },
			goalEvents: { select: { goalEvent: true } },
		},
	})
	expect(readCitation(cited)).not.toBeNull()
	expect(cited.archetype).toBe('sub-threshold')
	expect(cited.phases.map((p) => p.phase).sort()).toEqual(['base', 'build'])
	expect(cited.goalEvents.length).toBeGreaterThan(0)

	const handWritten = await prisma.catalogueEntry.findUniqueOrThrow({
		where: { id: stockEntryId(A_HAND_WRITTEN) },
		select: {
			citationAuthor: true,
			citationWork: true,
			citationYear: true,
			citationLocator: true,
		},
	})
	expect(readCitation(handWritten)).toBeNull()
})

test('the seeded rows are retrievable by the four facets', async () => {
	await seedCatalogue(prisma)
	const athlete = await createAthlete()

	const threshold = await listCatalogue({
		viewerId: athlete.id,
		discipline: 'run',
		archetype: 'sub-threshold',
	})
	expect(threshold.length).toBeGreaterThan(0)
	for (const entry of threshold) {
		expect(entry.workout.authorship).toBe('system')
	}

	// The hole archetype I closes: race week must not come back empty.
	const raceWeek = await listCatalogue({
		viewerId: athlete.id,
		discipline: 'run',
		phase: 'race-week',
	})
	expect(raceWeek.length).toBeGreaterThan(0)
})

test('a fork of a seeded row still reaches the original Citation', async () => {
	await seedCatalogue(prisma)
	const athlete = await createAthlete()

	const fork = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'My version',
			discipline: 'run',
			intent: 'threshold',
			ownerId: athlete.id,
			copiedFromId: stockWorkoutId(A_CITED),
		},
	})

	const origin = await resolveCatalogueOrigin(fork.id)
	expect(origin?.id).toBe(stockEntryId(A_CITED))
	expect(readCitation(origin!)).not.toBeNull()
})

test('a seeded strength row reaches a real Exercise and keeps its load', async () => {
	await seedCatalogue(prisma)
	const step = await prisma.workoutStep.findFirstOrThrow({
		where: { block: { workoutId: stockWorkoutId('strength-S8') } },
		select: {
			exercise: { select: { name: true } },
			sets: {
				select: { load: true, tempo: true },
				orderBy: { orderIndex: 'asc' },
			},
		},
	})
	expect(step.exercise?.name).toBeTruthy()
	// The rep-max anchor is what made this protocol authorable at all.
	expect(step.sets[0]?.load).toContain('repMax')
})

test('progression edges resolve to real entries', async () => {
	await seedCatalogue(prisma)
	const withEdges = CATALOGUE_CORPUS.filter(
		(s) => s.progressesTo != null || s.regressesTo != null,
	)
	expect(withEdges.length).toBeGreaterThan(0)

	for (const session of withEdges) {
		const entry = await prisma.catalogueEntry.findUniqueOrThrow({
			where: { id: stockEntryId(session.key) },
			select: { progressesToId: true, regressesToId: true },
		})
		if (session.progressesTo) {
			expect(entry.progressesToId).toBe(stockEntryId(session.progressesTo))
		}
		if (session.regressesTo) {
			expect(entry.regressesToId).toBe(stockEntryId(session.regressesTo))
		}
	}
})

test('the strength corpus mints no orphan, and every row it adds has a variant to progress', async () => {
	const result = await seedCatalogue(prisma)
	expect(result.exercises).toBe(STRENGTH_EXERCISE_CORPUS.length)

	// The defect this seeder used to ship: an `Exercise` with no stated
	// authorship fell to the column's `'athlete'` default and, with no owner,
	// became a row nobody owned and nobody could see (#469).
	const orphans = await prisma.exercise.findMany({
		where: { authorship: 'athlete', createdByAthleteId: null },
		select: { id: true },
	})
	expect(orphans).toEqual([])

	// And the progression key `(exerciseId, equipment)` resolves for each of
	// them, which it could not when the seeder wrote an exercise and stopped.
	for (const row of STRENGTH_EXERCISE_CORPUS) {
		const variant = await findVariantByEquipment(
			prisma,
			row.id,
			row.variants[0]!.equipment,
		)
		expect(variant, `${row.id} has no default variant`).not.toBeNull()
	}
})

test('the strength corpus never overwrites an exercise an athlete authored and still owns', async () => {
	const athlete = await createAthlete()
	const mine = STRENGTH_EXERCISE_CORPUS[0]!
	await prisma.exercise.create({
		data: {
			id: mine.id,
			name: 'My own version of it',
			primaryMuscle: 'abs',
			authorship: 'athlete',
			createdByAthleteId: athlete.id,
		},
		select: { id: true },
	})

	await seedCatalogue(prisma)

	const after = await prisma.exercise.findUniqueOrThrow({
		where: { id: mine.id },
		select: { name: true, authorship: true, createdByAthleteId: true },
	})
	expect(after.name).toBe('My own version of it')
	expect(after.authorship).toBe('athlete')
	expect(after.createdByAthleteId).toBe(athlete.id)
})
