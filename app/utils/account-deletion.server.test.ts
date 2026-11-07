import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	deleteAccount,
	eraseOrphanedWorkouts,
} from './account-deletion.server.ts'
import {
	createCatalogueEntry,
	forkCatalogueWorkout,
	listCatalogue,
	resolveCatalogueOrigin,
	saveToCatalogueList,
} from './catalogue.server.ts'
import { publishWorkout, reportWorkout } from './community.server.ts'
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

/** A Program day on `workoutId`, an athlete-authored Workout. */
async function createProgramDay(workoutId: string) {
	const program = await prisma.strengthProgram.create({
		select: { days: { select: { id: true } } },
		data: {
			id: `prog_${workoutId}`,
			key: `key_${workoutId}`,
			variantId: 'basic',
			name: 'Program',
			cursorKind: 'alternatingDays',
			initialCursor: JSON.stringify({
				kind: 'alternatingDays',
				nextDayId: 'A',
			}),
			days: {
				create: {
					dayId: 'A',
					orderIndex: 0,
					workoutId,
					workoutAuthorship: 'athlete',
				},
			},
		},
	})
	const day = program.days[0]
	if (!day) throw new Error('no Program day')
	return day
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

	expect(erasure).toEqual({ erased: 2, keptUnattributed: 0, spliced: 1 })
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

test('a row someone else’s training points at directly is kept unattributed, never erased into their week', async () => {
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

	expect(erasure).toEqual({ erased: 0, keptUnattributed: 1, spliced: 0 })
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

		expect(erasure).toEqual({ erased: 2, keptUnattributed: 0, spliced: 0 })
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

test('another athlete’s Week Pattern slot on the departing athlete’s Workout keeps it, unattributed', async () => {
	const author = await createAthlete()
	const other = await createAthlete()
	const held = await createWorkout({ ownerId: author.id, title: 'held' })
	// The author's own slot on the same row must not block the erasure either.
	await createSlot(author.id, held.id, 'fixed')
	const theirs = await createSlot(other.id, held.id, 'fixed')

	const erasure = await deleteAccount(author.id)

	expect(erasure).toEqual({ erased: 0, keptUnattributed: 1, spliced: 0 })
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

/**
 * One world both entry points run over (#468, ADR 0112): an author whose
 * Workouts are erased, another athlete whose training and lineage hang off
 * them, and the corpus the orphan scope must never reach.
 */
async function createErasureWorld() {
	const author = await createAthlete()
	const reader = await createAthlete()
	const bystander = await createAthlete()

	// The corpus: a cited Stock Workout, one with no entry, and a stock row
	// forked from the cited one (ownerless too, so `ownerId IS NULL` alone would
	// take all three).
	const stock = await createWorkout({ authorship: 'system', title: 'stock' })
	await createCatalogueEntry(stock.id, { archetype: 'threshold' })
	const bareStock = await createWorkout({
		authorship: 'system',
		title: 'bare stock',
	})
	const stockFork = await prisma.workout.create({
		select: { id: true },
		data: {
			discipline: 'run',
			intent: 'threshold',
			authorship: 'system',
			title: 'stock fork',
			copiedFromId: stock.id,
		},
	})
	const readerOwn = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, stock.id, reader.id),
	)
	if (!readerOwn) throw new Error('no reader fork')

	// What the author wrote: a private note, a published fork of the cited stock
	// row (saved and reported by others), a fork of that fork, and a root with
	// no ancestor at all.
	const privateOne = await createWorkout({
		ownerId: author.id,
		title: 'my notes',
	})
	const fork = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, stock.id, author.id),
	)
	if (!fork) throw new Error('no fork')
	expect(
		(
			await publishWorkout({
				userId: author.id,
				workoutId: fork.id,
				displayName: 'Kari N.',
				archetype: 'threshold',
			})
		).ok,
	).toBe(true)
	await saveToCatalogueList(reader.id, fork.id)
	await reportWorkout({
		reporterId: bystander.id,
		workoutId: fork.id,
		reason: 'spam',
	})
	const forkOfFork = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, fork.id, author.id),
	)
	if (!forkOfFork) throw new Error('no fork of fork')
	const root = await createWorkout({ ownerId: author.id, title: 'root' })

	// The reader's adoptions: deep copies they own, back-pointing at the author's.
	const adopted = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, forkOfFork.id, reader.id),
	)
	const fromRoot = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, root.id, reader.id),
	)
	if (!adopted || !fromRoot) throw new Error('no adoption')

	// Two of the author's rows the reader's training points at directly.
	const heldBySession = await createWorkout({
		ownerId: author.id,
		title: 'held by a session',
	})
	expect(
		(
			await publishWorkout({
				userId: author.id,
				workoutId: heldBySession.id,
				displayName: 'Kari N.',
				archetype: 'threshold',
			})
		).ok,
	).toBe(true)
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: reader.id,
			workoutId: heldBySession.id,
			scheduledAt: new Date('2030-01-01T07:00:00Z'),
			status: 'scheduled',
			source: 'authored',
		},
	})
	const heldBySlot = await createWorkout({
		ownerId: author.id,
		title: 'held by a slot',
	})
	const slot = await createSlot(reader.id, heldBySlot.id, 'fixed')
	// A Program day may point at an athlete-authored Workout: the composite key
	// carries `workoutAuthorship`, and its CHECK allows 'athlete'.
	const heldByProgramDay = await createWorkout({
		ownerId: author.id,
		title: 'held by a Program day',
	})
	const programDay = await createProgramDay(heldByProgramDay.id)

	return {
		author,
		reader,
		corpus: [stock.id, bareStock.id, stockFork.id],
		stock,
		stockFork,
		readerOwn,
		erasable: [privateOne.id, fork.id, forkOfFork.id, root.id],
		fork,
		adopted,
		fromRoot,
		held: [heldBySession.id, heldBySlot.id, heldByProgramDay.id],
		heldBySession,
		heldBySlot,
		heldByProgramDay,
		session,
		slot,
		programDay,
	}
}

type ErasureWorld = Awaited<ReturnType<typeof createErasureWorld>>

/** Every rule of Account Erasure, read off the world after either entry point. */
async function expectErased(world: ErasureWorld) {
	expect(
		await prisma.workout.count({ where: { id: { in: world.erasable } } }),
	).toBe(0)
	expect(
		await prisma.workoutReport.count({ where: { workoutId: world.fork.id } }),
	).toBe(0)

	// Kept unattributed: ownerless, private, no entry served, no name.
	expect(
		await prisma.workout.findMany({
			where: { id: { in: world.held } },
			select: { ownerId: true, visibility: true },
		}),
	).toEqual([
		{ ownerId: null, visibility: 'private' },
		{ ownerId: null, visibility: 'private' },
		{ ownerId: null, visibility: 'private' },
	])
	expect(
		await prisma.attribution.count({
			where: { workoutId: { in: world.held } },
		}),
	).toBe(0)
	expect(
		await prisma.catalogueEntry.count({
			where: { workoutId: { in: world.held }, retiredAt: null },
		}),
	).toBe(0)
	// Retired, not deleted: the published one's entry is still there.
	expect(
		await prisma.catalogueEntry.findFirst({
			where: { workoutId: world.heldBySession.id },
			select: { retiredAt: true },
		}),
	).toEqual({ retiredAt: expect.any(Date) })
	// …and the reader's training on them is still there, still on them.
	expect(
		await prisma.workoutSession.findUniqueOrThrow({
			where: { id: world.session.id },
			select: { workoutId: true },
		}),
	).toEqual({ workoutId: world.heldBySession.id })
	expect(
		await prisma.weekPatternDay.findUniqueOrThrow({
			where: { id: world.slot.id },
			select: { workoutId: true },
		}),
	).toEqual({ workoutId: world.heldBySlot.id })
	expect(
		await prisma.strengthProgramDay.findUniqueOrThrow({
			where: { id: world.programDay.id },
			select: { workoutId: true },
		}),
	).toEqual({ workoutId: world.heldByProgramDay.id })

	// A fork of an erased fork of a cited Stock Workout keeps its Citation; a
	// fork with no surviving ancestor keeps nothing, and still opens.
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: world.adopted.id },
			select: { ownerId: true, copiedFromId: true },
		}),
	).toEqual({ ownerId: world.reader.id, copiedFromId: world.stock.id })
	expect((await resolveCatalogueOrigin(world.adopted.id))?.workoutId).toBe(
		world.stock.id,
	)
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: world.fromRoot.id },
			select: { ownerId: true, copiedFromId: true },
		}),
	).toEqual({ ownerId: world.reader.id, copiedFromId: null })
	expect(await resolveCatalogueOrigin(world.fromRoot.id)).toBeNull()

	// The reader's saved list just lacks the erased row.
	const saved = await listCatalogue({
		viewerId: world.reader.id,
		savedBy: world.reader.id,
	})
	expect(saved.map((e) => e.workoutId)).not.toContain(world.fork.id)

	// The corpus and every owned row are untouched.
	expect(
		await prisma.workout.count({ where: { id: { in: world.corpus } } }),
	).toBe(3)
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: world.stockFork.id },
			select: { copiedFromId: true },
		}),
	).toEqual({ copiedFromId: world.stock.id })
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: world.readerOwn.id },
			select: { ownerId: true, copiedFromId: true },
		}),
	).toEqual({ ownerId: world.reader.id, copiedFromId: world.stock.id })
}

/**
 * The whole Workout table, to show a run changed nothing — `updatedAt` too, so a
 * write that sets a column to the value it already holds counts as a change.
 */
async function snapshotWorkouts() {
	return prisma.workout.findMany({
		orderBy: { id: 'asc' },
		select: {
			id: true,
			ownerId: true,
			authorship: true,
			visibility: true,
			copiedFromId: true,
			updatedAt: true,
			attribution: { select: { displayName: true } },
			catalogueEntry: { select: { retiredAt: true } },
		},
	})
}

test('deleting an account applies Account Erasure to everything the athlete wrote', async () => {
	const world = await createErasureWorld()

	const erasure = await deleteAccount(world.author.id)

	expect(erasure).toEqual({ erased: 4, keptUnattributed: 3, spliced: 2 })
	expect(
		await prisma.user.findUnique({ where: { id: world.author.id } }),
	).toBeNull()
	await expectErased(world)
})

test('the purge applies the same Account Erasure to Workouts orphaned before #641', async () => {
	const world = await createErasureWorld()
	// How every account was deleted before #641: the Workouts stay, ownerless.
	await prisma.user.delete({ where: { id: world.author.id } })
	const catalogueBefore = await Promise.all(
		(['stock', 'community'] as const).map((tier) =>
			listCatalogue({ viewerId: world.reader.id, tier }),
		),
	)

	const erasure = await prisma.$transaction((tx) => eraseOrphanedWorkouts(tx))

	expect(erasure).toEqual({ erased: 4, keptUnattributed: 3, spliced: 2 })
	await expectErased(world)
	const catalogueAfter = await Promise.all(
		(['stock', 'community'] as const).map((tier) =>
			listCatalogue({ viewerId: world.reader.id, tier }),
		),
	)
	expect(catalogueAfter).toEqual(catalogueBefore)
})

test('the purge never reaches the corpus or a Workout somebody owns', async () => {
	const world = await createErasureWorld()
	const before = await snapshotWorkouts()

	// Nothing is orphaned yet: every ownerless row is a Stock Workout.
	const erasure = await prisma.$transaction((tx) => eraseOrphanedWorkouts(tx))

	expect(erasure).toEqual({ erased: 0, keptUnattributed: 0, spliced: 0 })
	expect(await snapshotWorkouts()).toEqual(before)
	expect(
		await prisma.workout.count({ where: { id: { in: world.corpus } } }),
	).toBe(3)
})

test('a second purge changes nothing: a row kept unattributed stays kept', async () => {
	const world = await createErasureWorld()
	await prisma.user.delete({ where: { id: world.author.id } })
	await prisma.$transaction((tx) => eraseOrphanedWorkouts(tx))
	const before = await snapshotWorkouts()

	const again = await prisma.$transaction((tx) => eraseOrphanedWorkouts(tx))

	expect(again).toEqual({ erased: 0, keptUnattributed: 3, spliced: 0 })
	expect(await snapshotWorkouts()).toEqual(before)
	await expectErased(world)
})
