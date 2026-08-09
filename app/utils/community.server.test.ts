/**
 * The **community tier**'s behaviour (#452, ADR 0052).
 *
 * The rule these tests exist to hold is the one the ticket was written around:
 * **publish and report-and-takedown are one slice.** So the publish assertions and
 * the moderation assertions live in one file on purpose — a future change that
 * keeps one working and breaks the other should fail here rather than pass twice.
 */
import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	createCatalogueEntry,
	forkCatalogueWorkout,
	listCatalogue,
} from './catalogue.server.ts'
import {
	attributionsFor,
	dismissReport,
	hasReported,
	listOpenReports,
	publishWorkout,
	reportWorkout,
	resolveSharedProvenance,
	takeDownWorkout,
	unpublishWorkout,
} from './community.server.ts'
import { prisma } from './db.server.ts'

async function createAthlete(name?: string) {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true, username: true },
		data: {
			...userData,
			name: name ?? userData.name,
			password: { create: createPassword(userData.username) },
		},
	})
}

async function createOwnWorkout(
	ownerId: string,
	title = 'My threshold session',
) {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title,
			discipline: 'run',
			intent: 'threshold',
			ownerId,
			authorship: 'athlete',
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
								},
							],
						},
					},
				],
			},
		},
	})
}

async function createStockWorkout(title = 'Daniels 4 × T') {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title,
			discipline: 'run',
			intent: 'threshold',
			authorship: 'system',
		},
	})
}

async function publish(userId: string, workoutId: string, displayName = 'Jo') {
	return publishWorkout({
		userId,
		workoutId,
		displayName,
		archetype: 'threshold',
	})
}

function titles(rows: Array<{ workout: { title: string } }>) {
	return rows.map((row) => row.workout.title)
}

// ── The publish flow ───────────────────────────────────────────────────────

test('publishing turns on visibility, writes the Attribution and offers it for reuse', async () => {
	const athlete = await createAthlete()
	const workout = await createOwnWorkout(athlete.id)

	const result = await publish(athlete.id, workout.id, 'Jo Kraas')
	expect(result.ok).toBe(true)

	const after = await prisma.workout.findUniqueOrThrow({
		where: { id: workout.id },
		select: {
			visibility: true,
			attribution: { select: { displayName: true, takenDownAt: true } },
			catalogueEntry: { select: { archetype: true, retiredAt: true } },
		},
	})
	expect(after.visibility).toBe('public')
	expect(after.attribution?.displayName).toBe('Jo Kraas')
	expect(after.attribution?.takenDownAt).toBeNull()
	expect(after.catalogueEntry).toEqual({
		archetype: 'threshold',
		retiredAt: null,
	})
})

test('a published session reads through a read path that is not owner-scoped', async () => {
	const author = await createAthlete()
	const reader = await createAthlete()
	const published = await createOwnWorkout(author.id, 'Published session')
	const kept = await createOwnWorkout(author.id, 'Private session')
	await createCatalogueEntry(kept.id, { archetype: 'easy' })

	await publish(author.id, published.id)

	// The whole of #452's second requirement: before this, *every* query in the
	// app was `where: { ownerId }`.
	const forReader = await listCatalogue({ viewerId: reader.id })
	expect(titles(forReader)).toContain('Published session')
	expect(titles(forReader)).not.toContain('Private session')
})

test('publishing is refused on somebody else’s session and on a Stock Workout', async () => {
	const author = await createAthlete()
	const stranger = await createAthlete()
	const workout = await createOwnWorkout(author.id)
	const stock = await createStockWorkout()

	expect(await publish(stranger.id, workout.id)).toEqual({
		ok: false,
		reason: 'not-yours',
	})
	expect(await publish(stranger.id, stock.id)).toEqual({
		ok: false,
		reason: 'not-yours',
	})
})

test('the author can withdraw, and withdrawing un-offers without deleting', async () => {
	const author = await createAthlete()
	const reader = await createAthlete()
	const workout = await createOwnWorkout(author.id, 'Withdrawn session')
	await publish(author.id, workout.id)

	await unpublishWorkout(author.id, workout.id)

	const after = await prisma.workout.findUniqueOrThrow({
		where: { id: workout.id },
		select: {
			visibility: true,
			attribution: { select: { takenDownAt: true } },
			catalogueEntry: { select: { retiredAt: true } },
		},
	})
	expect(after.visibility).toBe('private')
	expect(after.catalogueEntry?.retiredAt).not.toBeNull()
	// A withdrawal is not a takedown: the Attribution keeps the publish record and
	// carries no removal stamp, which is what lets the author publish again.
	expect(after.attribution?.takenDownAt).toBeNull()
	expect(titles(await listCatalogue({ viewerId: reader.id }))).not.toContain(
		'Withdrawn session',
	)

	expect((await publish(author.id, workout.id)).ok).toBe(true)
	const republished = await prisma.catalogueEntry.findUniqueOrThrow({
		where: { workoutId: workout.id },
		select: { retiredAt: true },
	})
	expect(republished.retiredAt).toBeNull()
})

// ── Report ─────────────────────────────────────────────────────────────────

test('a report hides the row from the reporter at once and from nobody else', async () => {
	const author = await createAthlete()
	const reporter = await createAthlete()
	const bystander = await createAthlete()
	const workout = await createOwnWorkout(author.id, 'Reported session')
	await publish(author.id, workout.id)

	const result = await reportWorkout({
		reporterId: reporter.id,
		workoutId: workout.id,
		reason: 'unsafe',
		detail: 'Twelve maximal 400s off 30 s rest for a beginner.',
	})
	expect(result).toEqual({ ok: true, alreadyReported: false })

	expect(titles(await listCatalogue({ viewerId: reporter.id }))).not.toContain(
		'Reported session',
	)
	// The half a single athlete does *not* get to decide.
	expect(titles(await listCatalogue({ viewerId: bystander.id }))).toContain(
		'Reported session',
	)
	expect(await hasReported(reporter.id, workout.id)).toBe(true)
})

test('reporting is idempotent, refused on your own session, and refused on an unpublished one', async () => {
	const author = await createAthlete()
	const reporter = await createAthlete()
	const published = await createOwnWorkout(author.id)
	const unpublished = await createOwnWorkout(author.id, 'Never published')
	await publish(author.id, published.id)

	await reportWorkout({
		reporterId: reporter.id,
		workoutId: published.id,
		reason: 'spam',
	})
	expect(
		await reportWorkout({
			reporterId: reporter.id,
			workoutId: published.id,
			reason: 'abusive',
		}),
	).toEqual({ ok: true, alreadyReported: true })
	expect(
		await prisma.workoutReport.count({ where: { workoutId: published.id } }),
	).toBe(1)

	expect(
		await reportWorkout({
			reporterId: author.id,
			workoutId: published.id,
			reason: 'spam',
		}),
	).toEqual({ ok: false, reason: 'your-own' })

	expect(
		await reportWorkout({
			reporterId: reporter.id,
			workoutId: unpublished.id,
			reason: 'spam',
		}),
	).toEqual({ ok: false, reason: 'not-public' })
})

// ── Takedown ───────────────────────────────────────────────────────────────

test('a takedown removes it for everyone, tells the author why, and is permanent', async () => {
	const author = await createAthlete()
	const reporter = await createAthlete()
	const bystander = await createAthlete()
	const moderator = await createAthlete()
	const workout = await createOwnWorkout(author.id, 'Taken down session')
	await publish(author.id, workout.id)
	await reportWorkout({
		reporterId: reporter.id,
		workoutId: workout.id,
		reason: 'unsafe',
	})

	expect(await listOpenReports()).toHaveLength(1)

	await takeDownWorkout({
		moderatorId: moderator.id,
		workoutId: workout.id,
		reason: 'Unsafe to train',
	})

	const after = await prisma.workout.findUniqueOrThrow({
		where: { id: workout.id },
		select: {
			visibility: true,
			attribution: { select: { takenDownAt: true, takedownReason: true } },
			catalogueEntry: { select: { retiredAt: true } },
			blocks: { select: { id: true } },
		},
	})
	expect(after.visibility).toBe('private')
	expect(after.catalogueEntry?.retiredAt).not.toBeNull()
	expect(after.attribution?.takedownReason).toBe('Unsafe to train')
	expect(after.attribution?.takenDownAt).not.toBeNull()
	// Never deleted: the author's own session, and its prescription, survive.
	expect(after.blocks).toHaveLength(1)

	expect(titles(await listCatalogue({ viewerId: bystander.id }))).not.toContain(
		'Taken down session',
	)
	// The queue reflects the decision rather than re-asking it once per reporter.
	expect(await listOpenReports()).toHaveLength(0)

	expect(await publish(author.id, workout.id)).toEqual({
		ok: false,
		reason: 'taken-down',
	})
})

test('dismissing a report leaves it published and still hidden from the reporter', async () => {
	const author = await createAthlete()
	const reporter = await createAthlete()
	const bystander = await createAthlete()
	const moderator = await createAthlete()
	const workout = await createOwnWorkout(author.id, 'Contested session')
	await publish(author.id, workout.id)
	await reportWorkout({
		reporterId: reporter.id,
		workoutId: workout.id,
		reason: 'other',
		detail: 'I do not like it',
	})

	const [report] = await listOpenReports()
	expect(await dismissReport(moderator.id, report!.id)).toEqual({ ok: true })

	expect(titles(await listCatalogue({ viewerId: bystander.id }))).toContain(
		'Contested session',
	)
	// Not the moderator's to overturn: the reporter asked not to see it.
	expect(titles(await listCatalogue({ viewerId: reporter.id }))).not.toContain(
		'Contested session',
	)
	expect(await listOpenReports()).toHaveLength(0)
})

test('a report outlives the reporter’s account', async () => {
	const author = await createAthlete()
	const reporter = await createAthlete()
	const workout = await createOwnWorkout(author.id)
	await publish(author.id, workout.id)
	await reportWorkout({
		reporterId: reporter.id,
		workoutId: workout.id,
		reason: 'spam',
	})

	await prisma.user.delete({ where: { id: reporter.id } })

	const open = await listOpenReports()
	expect(open).toHaveLength(1)
	expect(open[0]!.reporter).toBeNull()
})

// ── Provenance: the walk, not one hop ──────────────────────────────────────

test('the publish flow walks copiedFrom for provenance, over more than one hop', async () => {
	const first = await createAthlete()
	const second = await createAthlete()
	const stock = await createStockWorkout('Daniels 4 × T')
	await createCatalogueEntry(stock.id, {
		archetype: 'threshold',
		citationAuthor: 'Daniels',
		citationWork: "Daniels' Running Formula",
		citationYear: 2013,
	})

	// A fork of a fork: the corpus row is two hops up, which is exactly the case
	// a one-hop read would answer wrongly.
	const forkOne = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, stock.id, first.id),
	)
	const forkTwo = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, forkOne!.id, second.id),
	)

	await publish(second.id, forkTwo!.id)

	const provenance = await resolveSharedProvenance(forkTwo!.id)
	expect(provenance.adaptedFrom).toEqual({
		author: 'Daniels',
		work: "Daniels' Running Formula",
		year: 2013,
		locator: null,
	})
	expect(provenance.adaptedFromWorkoutId).toBe(stock.id)

	// Read, never copied: the published row's own entry carries no citation, and
	// the schema is what guarantees it.
	const ownEntry = await prisma.catalogueEntry.findUniqueOrThrow({
		where: { workoutId: forkTwo!.id },
		select: { citationAuthor: true, workoutAuthorship: true },
	})
	expect(ownEntry.citationAuthor).toBeNull()
	expect(ownEntry.workoutAuthorship).toBe('athlete')
})

test('a published row’s own membership is not mistaken for its provenance', async () => {
	const athlete = await createAthlete()
	const workout = await createOwnWorkout(athlete.id)
	await publish(athlete.id, workout.id)

	// It has a Catalogue Entry of its own now. The walk starts one hop up, so an
	// original session reports no origin rather than reporting itself.
	const provenance = await resolveSharedProvenance(workout.id)
	expect(provenance.adaptedFromWorkoutId).toBeNull()
})

test('forking a published session does not inherit its publication', async () => {
	const author = await createAthlete()
	const forker = await createAthlete()
	const workout = await createOwnWorkout(author.id, 'Shared session')
	await publish(author.id, workout.id)

	const fork = await prisma.$transaction((tx) =>
		forkCatalogueWorkout(tx, workout.id, forker.id),
	)

	const forked = await prisma.workout.findUniqueOrThrow({
		where: { id: fork!.id },
		select: { visibility: true, attribution: { select: { id: true } } },
	})
	// Publishing is an act, never something inherited: a public fork with no
	// Attribution is a community row nobody published and no moderator could find.
	expect(forked.visibility).toBe('private')
	expect(forked.attribution).toBeNull()
})

test('attributionsFor batches one query’s worth of bylines', async () => {
	const author = await createAthlete()
	const one = await createOwnWorkout(author.id, 'One')
	const two = await createOwnWorkout(author.id, 'Two')
	await publish(author.id, one.id, 'Jo')
	await publish(author.id, two.id, 'Jo')

	const map = await attributionsFor([one.id, two.id])
	expect(map.get(one.id)?.displayName).toBe('Jo')
	expect(map.get(two.id)?.displayName).toBe('Jo')
	expect(await attributionsFor([])).toEqual(new Map())
})
