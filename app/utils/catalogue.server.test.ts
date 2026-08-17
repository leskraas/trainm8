import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { localTimeUTC } from './athlete-calendar.ts'
import {
	catalogueAdoptionCount,
	createCatalogueEntry,
	forkCatalogueWorkout,
	isInCatalogueList,
	listCatalogue,
	placeCatalogueSession,
	readRetrievableEntry,
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
async function createStockWorkout(
	title = '4 × 6 min @ T',
	description: string | null = null,
) {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title,
			description,
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

/** A **Shared Workout**: athlete-owned, `public`, and therefore in everyone's list. */
async function createSharedWorkout(ownerId: string, title = 'my double day') {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title,
			discipline: 'run',
			intent: 'threshold',
			ownerId,
			visibility: 'public',
		},
	})
}

test('retrieval filters on the level floor: at or below, plus the rows with none', async () => {
	const athlete = await createAthlete()
	const anyLevel = await createStockWorkout('progression run')
	const beginner = await createStockWorkout('first threshold')
	const advanced = await createStockWorkout('double threshold day')

	await createCatalogueEntry(anyLevel.id, { archetype: 'steady' })
	await createCatalogueEntry(beginner.id, {
		archetype: 'threshold',
		level: 'beginner',
	})
	await createCatalogueEntry(advanced.id, {
		archetype: 'threshold',
		level: 'advanced',
	})

	const forBeginner = await listCatalogue({
		viewerId: athlete.id,
		level: 'beginner',
	})
	// A row with no floor suits everybody — that is a positive statement about the
	// row, not a gap, so it belongs in every level's answer.
	expect(forBeginner.map((e) => e.workoutId).sort()).toEqual(
		[anyLevel.id, beginner.id].sort(),
	)

	const forAdvanced = await listCatalogue({
		viewerId: athlete.id,
		level: 'advanced',
	})
	expect(forAdvanced.map((e) => e.workoutId).sort()).toEqual(
		[anyLevel.id, beginner.id, advanced.id].sort(),
	)
})

test('free text matches the title and the description', async () => {
	const athlete = await createAthlete()
	const byTitle = await createStockWorkout('Yasso 800s')
	const byDescription = await createStockWorkout(
		'ten by four hundred',
		'Short reps on the track, marathon-goal pacing.',
	)
	const neither = await createStockWorkout('easy jog')

	await createCatalogueEntry(byTitle.id, { archetype: 'vo2max-short' })
	await createCatalogueEntry(byDescription.id, { archetype: 'vo2max-short' })
	await createCatalogueEntry(neither.id, { archetype: 'easy' })

	expect(
		(await listCatalogue({ viewerId: athlete.id, q: 'yasso' })).map(
			(e) => e.workoutId,
		),
	).toEqual([byTitle.id])
	expect(
		(await listCatalogue({ viewerId: athlete.id, q: 'track' })).map(
			(e) => e.workoutId,
		),
	).toEqual([byDescription.id])
	expect(await listCatalogue({ viewerId: athlete.id, q: 'kayak' })).toEqual([])
})

test('tier is a facet in SQL: stock, mine and community each narrow to their own', async () => {
	const athlete = await createAthlete()
	const other = await createAthlete()
	const stock = await createStockWorkout('stock threshold')
	const mine = await createSharedWorkout(athlete.id, 'my published session')
	const theirs = await createSharedWorkout(other.id, 'their published session')

	for (const workout of [stock, mine, theirs]) {
		await createCatalogueEntry(workout.id, { archetype: 'threshold' })
	}

	const ids = async (tier: 'stock' | 'mine' | 'community') =>
		(await listCatalogue({ viewerId: athlete.id, tier })).map(
			(e) => e.workoutId,
		)

	expect(await ids('stock')).toEqual([stock.id])
	expect(await ids('mine')).toEqual([mine.id])
	expect(await ids('community')).toEqual([theirs.id])
})

test('saved is a facet and not a tier — it spans every tier at once', async () => {
	const athlete = await createAthlete()
	const other = await createAthlete()
	const stock = await createStockWorkout('stock threshold')
	const theirs = await createSharedWorkout(other.id, 'their published session')
	const unsaved = await createStockWorkout('a session nobody saved')

	for (const workout of [stock, theirs, unsaved]) {
		await createCatalogueEntry(workout.id, { archetype: 'threshold' })
	}
	await saveToCatalogueList(athlete.id, stock.id)
	await saveToCatalogueList(athlete.id, theirs.id)

	const saved = await listCatalogue({
		viewerId: athlete.id,
		savedBy: athlete.id,
	})
	expect(saved.map((e) => e.workoutId).sort()).toEqual(
		[stock.id, theirs.id].sort(),
	)
	// Another athlete's list is their own.
	expect(
		await listCatalogue({ viewerId: other.id, savedBy: other.id }),
	).toEqual([])
})

test('the facets compose — every one of them narrows the same query', async () => {
	const athlete = await createAthlete()
	const wanted = await createStockWorkout(
		'cruise intervals',
		'Comfortably hard.',
	)
	const wrongPhase = await createStockWorkout('cruise intervals in base')
	const wrongDiscipline = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'cruise intervals on the bike',
			discipline: 'bike',
			intent: 'threshold',
			authorship: 'system',
		},
	})

	await createCatalogueEntry(wanted.id, {
		archetype: 'threshold',
		level: 'intermediate',
		phases: { create: [{ phase: 'build' }] },
		goalEvents: { create: [{ goalEvent: '10k' }] },
	})
	await createCatalogueEntry(wrongPhase.id, {
		archetype: 'threshold',
		phases: { create: [{ phase: 'base' }] },
		goalEvents: { create: [{ goalEvent: '10k' }] },
	})
	await createCatalogueEntry(wrongDiscipline.id, {
		archetype: 'threshold',
		phases: { create: [{ phase: 'build' }] },
		goalEvents: { create: [{ goalEvent: '10k' }] },
	})

	const narrowed = await listCatalogue({
		viewerId: athlete.id,
		discipline: 'run',
		archetype: 'threshold',
		phase: 'build',
		goalEvent: '10k',
		level: 'advanced',
		tier: 'stock',
		q: 'cruise',
	})
	expect(narrowed.map((e) => e.workoutId)).toEqual([wanted.id])
})

test('a reported row is gone for its reporter at once, and for nobody else', async () => {
	const reporter = await createAthlete()
	const bystander = await createAthlete()
	const author = await createAthlete()
	const shared = await createSharedWorkout(
		author.id,
		'a session worth reporting',
	)
	await createCatalogueEntry(shared.id, { archetype: 'threshold' })

	await prisma.workoutReport.create({
		data: { workoutId: shared.id, reporterId: reporter.id, reason: 'unsafe' },
	})

	// The half of report-and-takedown that does not wait for a moderator.
	expect(
		(await listCatalogue({ viewerId: reporter.id })).map((e) => e.workoutId),
	).not.toContain(shared.id)
	expect(
		(await listCatalogue({ viewerId: bystander.id })).map((e) => e.workoutId),
	).toContain(shared.id)

	// The same guard gates placement, so a stale link cannot place it either.
	expect(await readRetrievableEntry(reporter.id, shared.id)).toBeNull()
	expect(
		await placeCatalogueSession({
			athleteId: reporter.id,
			workoutId: shared.id,
			date: '2026-09-01',
		}),
	).toEqual({ ok: false, reason: 'not-retrievable' })
})

test('placing a session copies the row, points back at it, and mutates nothing', async () => {
	const athlete = await createAthlete()
	await prisma.athleteProfile.create({
		data: {
			userId: athlete.id,
			timezone: 'Europe/Oslo',
			defaultTrainingTime: '06:30',
		},
	})
	const stock = await createStockWorkout()
	await createCatalogueEntry(stock.id, { archetype: 'threshold' })

	const placed = await placeCatalogueSession({
		athleteId: athlete.id,
		workoutId: stock.id,
		date: '2026-09-01',
	})
	expect(placed.ok).toBe(true)
	if (!placed.ok) return

	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: placed.sessionId },
		select: {
			userId: true,
			source: true,
			status: true,
			scheduledAt: true,
			targetEventId: true,
			workout: {
				select: {
					id: true,
					ownerId: true,
					authorship: true,
					copiedFromId: true,
					blocks: {
						select: {
							repeatCount: true,
							steps: { select: { durationSec: true } },
						},
					},
				},
			},
		},
	})

	// A fresh Workout per session, back-pointing at the corpus row — never the
	// corpus row itself, which is one-to-many and would make one edit everybody's.
	expect(session.workout?.id).not.toBe(stock.id)
	expect(session.workout?.copiedFromId).toBe(stock.id)
	expect(session.workout?.ownerId).toBe(athlete.id)
	expect(session.workout?.authorship).toBe('athlete')
	// The structure travels, including the facets a form round trip would drop.
	expect(session.workout?.blocks[0]?.repeatCount).toBe(4)
	expect(session.workout?.blocks[0]?.steps[0]?.durationSec).toBe(360)

	// Picking a session is the athlete's act, not generation's — and it anchors
	// to no Event unless one was chosen.
	expect(session.source).toBe('authored')
	expect(session.status).toBe('scheduled')
	expect(session.targetEventId).toBeNull()
	expect(session.scheduledAt).toEqual(
		localTimeUTC('2026-09-01', '06:30', 'Europe/Oslo'),
	)

	// Nothing shared was touched.
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

test('a community row is placeable — generation retrieves stock-only, the athlete does not', async () => {
	const athlete = await createAthlete()
	const author = await createAthlete()
	const shared = await createSharedWorkout(author.id)
	await createCatalogueEntry(shared.id, { archetype: 'threshold' })

	const placed = await placeCatalogueSession({
		athleteId: athlete.id,
		workoutId: shared.id,
		date: '2026-09-01',
	})
	expect(placed.ok).toBe(true)
})

test('a retired row cannot be placed, and a malformed date is refused before anything is written', async () => {
	const athlete = await createAthlete()
	const stock = await createStockWorkout()
	await createCatalogueEntry(stock.id, { archetype: 'threshold' })

	expect(
		await placeCatalogueSession({
			athleteId: athlete.id,
			workoutId: stock.id,
			date: 'next tuesday',
		}),
	).toEqual({ ok: false, reason: 'bad-date' })

	await prisma.catalogueEntry.update({
		where: { workoutId: stock.id },
		data: { retiredAt: new Date() },
	})
	expect(
		await placeCatalogueSession({
			athleteId: athlete.id,
			workoutId: stock.id,
			date: '2026-09-01',
		}),
	).toEqual({ ok: false, reason: 'not-retrievable' })
	expect(
		await prisma.workoutSession.count({ where: { userId: athlete.id } }),
	).toBe(0)
})
