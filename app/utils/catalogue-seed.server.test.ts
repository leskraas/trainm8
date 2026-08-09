import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	CATALOGUE_CORPUS,
	stockEntryId,
	stockWorkoutId,
} from './catalogue-corpus.all.ts'
import { seedCatalogue } from './catalogue-seed.server.ts'
import { listCatalogue, resolveCatalogueOrigin } from './catalogue.server.ts'
import { readCitation } from './catalogue.ts'
import { prisma } from './db.server.ts'

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
	expect(result.handWritten).toBeGreaterThan(0)
	expect(result.convention).toBeGreaterThan(0)
	expect(result.cited).toBe(
		result.seeded - result.handWritten - result.convention,
	)

	const stock = await prisma.workout.findMany({
		where: { authorship: 'system' },
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
	expect(
		await prisma.workout.count({ where: { authorship: 'system' } }),
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
