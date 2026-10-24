import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { deleteAccount } from './account-deletion.server.ts'
import {
	createCatalogueEntry,
	forkCatalogueWorkout,
	listCatalogue,
	resolveCatalogueOrigin,
	saveToCatalogueList,
} from './catalogue.server.ts'
import { publishWorkout } from './community.server.ts'
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

async function createWorkout(data: {
	ownerId?: string
	authorship?: string
	title: string
}) {
	return prisma.workout.create({
		select: { id: true },
		data: { discipline: 'run', intent: 'threshold', ...data },
	})
}

test('deleting an account erases every Workout it wrote, published ones included (#468)', async () => {
	const author = await createAthlete()
	const reader = await createAthlete()
	const stock = await createWorkout({ authorship: 'system', title: 'stock' })
	await createCatalogueEntry(stock.id, { archetype: 'threshold' })

	const privateOne = await createWorkout({
		ownerId: author.id,
		title: 'my notes',
	})
	// A fork of the Stock Workout, published: the case #468 is about.
	const fork = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, stock.id, author.id),
	)
	if (!fork) throw new Error('no fork')
	const published = await publishWorkout({
		userId: author.id,
		workoutId: fork.id,
		displayName: 'Kari N.',
		archetype: 'threshold',
	})
	expect(published.ok).toBe(true)
	await saveToCatalogueList(reader.id, fork.id)
	// The reader adopted it: their own deep copy, back-pointing at the author's.
	const adopted = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, fork.id, reader.id),
	)
	if (!adopted) throw new Error('no adoption')

	const erasure = await deleteAccount(author.id)

	expect(erasure).toEqual({ erased: 2, withdrawn: 0, spliced: 1 })
	expect(await prisma.user.findUnique({ where: { id: author.id } })).toBeNull()
	expect(
		await prisma.workout.count({
			where: { id: { in: [privateOne.id, fork.id] } },
		}),
	).toBe(0)
	expect(
		await prisma.attribution.count({ where: { workoutId: fork.id } }),
	).toBe(0)
	// Nothing the author wrote is left anywhere, owned or orphaned.
	expect(
		await prisma.workout.count({
			where: { authorship: 'athlete', ownerId: null },
		}),
	).toBe(0)
	expect(
		(await listCatalogue({ viewerId: reader.id })).map((e) => e.workoutId),
	).not.toContain(fork.id)

	// The Stock Workout and the reader's adoption survive, and the adoption
	// still reaches its citation — spliced past the erased row to the corpus.
	expect(await prisma.workout.count({ where: { id: stock.id } })).toBe(1)
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: adopted.id },
			select: { ownerId: true, copiedFromId: true },
		}),
	).toEqual({ ownerId: reader.id, copiedFromId: stock.id })
	expect((await resolveCatalogueOrigin(adopted.id))?.workoutId).toBe(stock.id)
})

test('a row someone else’s training points at directly is withdrawn, never erased into their week', async () => {
	const author = await createAthlete()
	const other = await createAthlete()
	const held = await createWorkout({ ownerId: author.id, title: 'held' })
	await prisma.workout.update({
		where: { id: held.id },
		data: { visibility: 'public' },
	})
	await prisma.attribution.create({
		data: { workoutId: held.id, displayName: 'Kari N.' },
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: other.id,
			workoutId: held.id,
			scheduledAt: new Date('2030-01-01T07:00:00Z'),
			status: 'scheduled',
			source: 'authored',
		},
	})

	const erasure = await deleteAccount(author.id)

	expect(erasure).toEqual({ erased: 0, withdrawn: 1, spliced: 0 })
	expect(await prisma.workoutSession.count({ where: { id: session.id } })).toBe(
		1,
	)
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: held.id },
			select: { ownerId: true, visibility: true },
		}),
	).toEqual({ ownerId: null, visibility: 'private' })
	expect(
		await prisma.attribution.count({ where: { workoutId: held.id } }),
	).toBe(0)
})

/** A plan for `athleteId` with one Week Pattern slot pointing at `workoutId`. */
async function createSlot(
	athleteId: string,
	workoutId: string,
	kind: 'fixed' | 'lifting',
) {
	const outline = await prisma.planOutline.create({
		select: { id: true },
		data: { athleteId, startWeekKey: '2030-01-07' },
	})
	const track = await prisma.trainingTrack.create({
		select: { id: true },
		data: {
			outlineId: outline.id,
			discipline: kind === 'lifting' ? 'strength' : 'run',
			currency: kind === 'lifting' ? 'sets' : 'km',
		},
	})
	const pattern = await prisma.weekPattern.create({
		select: { id: true },
		data: { outlineId: outline.id, name: 'Base', orderIndex: 0 },
	})
	return prisma.weekPatternDay.create({
		select: { id: true },
		data: {
			kind,
			weekday: kind === 'lifting' ? null : 1,
			workoutId,
			trackId: track.id,
			patternId: pattern.id,
		},
	})
}

for (const kind of ['fixed', 'lifting'] as const) {
	test(`an athlete whose own ${kind} slot points at their own Workout can still delete their account`, async () => {
		const athlete = await createAthlete()
		const slotted = await createWorkout({
			ownerId: athlete.id,
			title: `${kind} session`,
		})
		const loose = await createWorkout({ ownerId: athlete.id, title: 'loose' })
		const slot = await createSlot(athlete.id, slotted.id, kind)

		const erasure = await deleteAccount(athlete.id)

		expect(erasure).toEqual({ erased: 2, withdrawn: 0, spliced: 0 })
		expect(
			await prisma.user.findUnique({ where: { id: athlete.id } }),
		).toBeNull()
		expect(
			await prisma.workout.count({
				where: { id: { in: [slotted.id, loose.id] } },
			}),
		).toBe(0)
		expect(await prisma.weekPatternDay.count({ where: { id: slot.id } })).toBe(
			0,
		)
	})
}

test('another athlete’s Week Pattern slot on the departing athlete’s Workout keeps it, withdrawn', async () => {
	const author = await createAthlete()
	const other = await createAthlete()
	const held = await createWorkout({ ownerId: author.id, title: 'held' })
	// The author's own slot on the same row must not block the erasure either.
	await createSlot(author.id, held.id, 'fixed')
	const theirs = await createSlot(other.id, held.id, 'fixed')

	const erasure = await deleteAccount(author.id)

	expect(erasure).toEqual({ erased: 0, withdrawn: 1, spliced: 0 })
	expect(
		await prisma.weekPatternDay.findUniqueOrThrow({
			where: { id: theirs.id },
			select: { workoutId: true },
		}),
	).toEqual({ workoutId: held.id })
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: held.id },
			select: { ownerId: true, visibility: true },
		}),
	).toEqual({ ownerId: null, visibility: 'private' })
})
