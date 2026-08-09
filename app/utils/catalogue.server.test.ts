import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	catalogueAdoptionCount,
	createCatalogueEntry,
	forkCatalogueWorkout,
	isInCatalogueList,
	listCatalogue,
	removeFromCatalogueList,
	resolveCatalogueOrigin,
	saveToCatalogueList,
} from './catalogue.server.ts'
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

/** A **Stock Workout**: no owner, `system` authorship, one real step. */
async function createStockWorkout(title = '4 × 6 min @ T') {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title,
			discipline: 'run',
			intent: 'threshold',
			authorship: 'system',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 4,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 360,
									intensity: JSON.stringify({
										kind: 'zoneLabel',
										label: 'threshold',
									}),
								},
							],
						},
					},
				],
			},
		},
	})
}

test('a Catalogue Entry takes its authorship from the Workout it belongs to', async () => {
	const stock = await createStockWorkout()
	const entry = await createCatalogueEntry(stock.id, { archetype: 'threshold' })
	expect(entry?.workoutId).toBe(stock.id)

	// The seed writes system rows; the caller never restates the discriminator.
	const stored = await prisma.catalogueEntry.findUniqueOrThrow({
		where: { id: entry!.id },
		select: { workoutAuthorship: true },
	})
	expect(stored.workoutAuthorship).toBe('system')
})

test('saving copies nothing and is idempotent', async () => {
	const athlete = await createAthlete()
	const stock = await createStockWorkout()

	await saveToCatalogueList(athlete.id, stock.id)
	await saveToCatalogueList(athlete.id, stock.id)

	expect(await isInCatalogueList(athlete.id, stock.id)).toBe(true)
	expect(await catalogueAdoptionCount(stock.id)).toBe(1)
	// No copy at save time — the corpus still holds exactly one Workout.
	expect(await prisma.workout.count({ where: { id: stock.id } })).toBe(1)
	expect(
		await prisma.workout.count({ where: { copiedFromId: stock.id } }),
	).toBe(0)

	await removeFromCatalogueList(athlete.id, stock.id)
	expect(await isInCatalogueList(athlete.id, stock.id)).toBe(false)
})

test('adoption is countable across athletes — the thing copy-on-save destroys', async () => {
	const stock = await createStockWorkout()
	const athletes = [
		await createAthlete(),
		await createAthlete(),
		await createAthlete(),
	]
	for (const athlete of athletes) {
		await saveToCatalogueList(athlete.id, stock.id)
	}
	expect(await catalogueAdoptionCount(stock.id)).toBe(3)
})

test('the first edit forks: an athlete-owned deep copy that points back', async () => {
	const athlete = await createAthlete()
	const stock = await createStockWorkout()

	const fork = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, stock.id, athlete.id),
	)

	const forked = await prisma.workout.findUniqueOrThrow({
		where: { id: fork!.id },
		select: {
			ownerId: true,
			authorship: true,
			copiedFromId: true,
			title: true,
			blocks: {
				select: {
					repeatCount: true,
					steps: { select: { durationSec: true, intensity: true } },
				},
			},
		},
	})

	expect(forked.ownerId).toBe(athlete.id)
	// A copy is written by the athlete who asked for it — never system-authored.
	expect(forked.authorship).toBe('athlete')
	expect(forked.copiedFromId).toBe(stock.id)
	// A deep copy, not a reference: the structure travels.
	expect(forked.blocks[0]?.repeatCount).toBe(4)
	expect(forked.blocks[0]?.steps[0]?.durationSec).toBe(360)

	// Nothing shared was mutated in place.
	const source = await prisma.workout.findUniqueOrThrow({
		where: { id: stock.id },
		select: { title: true, authorship: true, ownerId: true },
	})
	expect(source).toEqual({
		title: '4 × 6 min @ T',
		authorship: 'system',
		ownerId: null,
	})
})

test('a fork reaches its citation through the pointer rather than a copy of it', async () => {
	const athlete = await createAthlete()
	const stock = await createStockWorkout()
	await createCatalogueEntry(stock.id, {
		archetype: 'threshold',
		citationAuthor: 'Daniels',
		citationWork: "Daniels' Running Formula",
		citationYear: 2013,
	})

	const fork = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, stock.id, athlete.id),
	)
	const forkOfFork = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, fork!.id, athlete.id),
	)

	// A chain, walked — a fork of a fork still came from the corpus.
	const origin = await resolveCatalogueOrigin(forkOfFork!.id)
	expect(origin?.citationAuthor).toBe('Daniels')
	expect(origin?.workoutId).toBe(stock.id)

	// The citation is not on the fork, so correcting it corrects every descendant.
	await prisma.catalogueEntry.update({
		where: { workoutId: stock.id },
		data: { citationYear: 2014 },
	})
	expect((await resolveCatalogueOrigin(fork!.id))?.citationYear).toBe(2014)
})

test('a workout with no corpus ancestry resolves to nothing, not to a guess', async () => {
	const athlete = await createAthlete()
	const own = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'my own tempo run',
			discipline: 'run',
			intent: 'tempo',
			ownerId: athlete.id,
		},
	})
	expect(await resolveCatalogueOrigin(own.id)).toBeNull()
})

test('retiring an entry stops retrieval but never rewrites where a session came from', async () => {
	const athlete = await createAthlete()
	const stock = await createStockWorkout('mis-cited threshold session')
	await createCatalogueEntry(stock.id, {
		archetype: 'threshold',
		citationAuthor: 'Daniels',
		citationWork: "Daniels' Running Formula",
	})
	const fork = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, stock.id, athlete.id),
	)

	await prisma.catalogueEntry.update({
		where: { workoutId: stock.id },
		data: { retiredAt: new Date() },
	})

	const retrievable = await listCatalogue({ viewerId: athlete.id })
	expect(retrievable.map((entry) => entry.workoutId)).not.toContain(stock.id)

	// The plan that already used it keeps reading its source.
	const origin = await resolveCatalogueOrigin(fork!.id)
	expect(origin?.workoutId).toBe(stock.id)
	expect(origin?.retiredAt).not.toBeNull()
})

test('retrieval filters on archetype, phase and goal event', async () => {
	const athlete = await createAthlete()
	const threshold = await createStockWorkout('terskeløkt')
	const long = await createStockWorkout('langtur')

	await createCatalogueEntry(threshold.id, {
		archetype: 'threshold',
		phases: { create: [{ phase: 'build' }] },
		goalEvents: { create: [{ goalEvent: '10k' }] },
	})
	await createCatalogueEntry(long.id, {
		archetype: 'long',
		phases: { create: [{ phase: 'base' }] },
		goalEvents: { create: [{ goalEvent: 'marathon' }] },
	})

	const byArchetype = await listCatalogue({
		viewerId: athlete.id,
		archetype: 'threshold',
	})
	expect(byArchetype.map((e) => e.workoutId)).toEqual([threshold.id])

	const byPhase = await listCatalogue({ viewerId: athlete.id, phase: 'base' })
	expect(byPhase.map((e) => e.workoutId)).toEqual([long.id])

	const byGoal = await listCatalogue({ viewerId: athlete.id, goalEvent: '10k' })
	expect(byGoal.map((e) => e.workoutId)).toEqual([threshold.id])
})

test('retrieval reads asserted authorship, not a null owner', async () => {
	const athlete = await createAthlete()
	const other = await createAthlete()

	// An athlete-authored entry whose author's account was deleted. Under the
	// `Exercise` inference this row would be served to everybody as trainm8's.
	const orphan = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'someone else’s session',
			discipline: 'run',
			intent: 'tempo',
			ownerId: other.id,
		},
	})
	await createCatalogueEntry(orphan.id, { archetype: 'tempo' })
	await prisma.user.delete({ where: { id: other.id } })

	const listed = await listCatalogue({ viewerId: athlete.id })
	expect(listed.map((entry) => entry.workoutId)).not.toContain(orphan.id)
})
