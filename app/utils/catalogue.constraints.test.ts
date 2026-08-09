// The Catalogue's four axes are structural (ADR 0051): they live in the schema
// and in the migration's CHECK constraints, not in a service-layer validator.
// These tests pin them, because a constraint nobody exercises is a constraint a
// later SQLite table rebuild can silently drop — every rebuild in this repo has
// had to restore the CHECKs by hand.
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'

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

async function createWorkout(
	data: { ownerId?: string | null; authorship?: string; title?: string } = {},
) {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title: data.title ?? '4 × 6 min @ T',
			discipline: 'run',
			intent: 'threshold',
			ownerId: data.ownerId ?? null,
			authorship: data.authorship ?? 'athlete',
		},
	})
}

// ── Authorship ─────────────────────────────────────────────────────────────

test('a system-authored Workout may not have an owner (the implication)', async () => {
	const athlete = await createAthlete()
	await expect(
		createWorkout({ authorship: 'system', ownerId: athlete.id }),
	).rejects.toThrow()
	await expect(
		createWorkout({ authorship: 'system', ownerId: null }),
	).resolves.toBeTruthy()
})

test('an orphaned athlete-authored Workout stays expressible (not the biconditional)', async () => {
	// This is the whole reason `authorship` is asserted rather than inferred from
	// `ownerId IS NULL`. A row with no owner and `athlete` authorship reads
	// "author gone"; the inference would read it as "trainm8 says so".
	await expect(
		createWorkout({ authorship: 'athlete', ownerId: null }),
	).resolves.toBeTruthy()
})

test('deleting an athlete orphans their Workouts rather than deleting them', async () => {
	const athlete = await createAthlete()
	const workout = await createWorkout({ ownerId: athlete.id })

	await prisma.user.delete({ where: { id: athlete.id } })

	const after = await prisma.workout.findUnique({
		where: { id: workout.id },
		select: { ownerId: true, authorship: true },
	})
	expect(after).toEqual({ ownerId: null, authorship: 'athlete' })
})

test('authorship is a closed vocabulary', async () => {
	await expect(createWorkout({ authorship: 'trainm8' })).rejects.toThrow()
})

// ── Lineage: the fork-on-write back-pointer ────────────────────────────────

test('a fork points at its source and survives the source being deleted', async () => {
	const athlete = await createAthlete()
	const stock = await createWorkout({ authorship: 'system' })
	const fork = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'my 4 × 6 min',
			discipline: 'run',
			intent: 'threshold',
			ownerId: athlete.id,
			copiedFromId: stock.id,
		},
	})

	await prisma.workout.delete({ where: { id: stock.id } })

	// SetNull, never Cascade: deleting a source must orphan the lineage and never
	// take the athlete's own copy with it.
	const after = await prisma.workout.findUnique({
		where: { id: fork.id },
		select: { copiedFromId: true },
	})
	expect(after).toEqual({ copiedFromId: null })
})

test('a Workout may not be its own source', async () => {
	const workout = await createWorkout()
	await expect(
		prisma.workout.update({
			where: { id: workout.id },
			data: { copiedFromId: workout.id },
		}),
	).rejects.toThrow()
})

// ── Membership ─────────────────────────────────────────────────────────────

/**
 * Deliberately writes `workoutAuthorship` by hand rather than through
 * `createCatalogueEntry`, because these tests are about what the *database*
 * refuses — a helper that derives the column would hide half of them.
 */
async function createEntry(
	workoutId: string,
	data: Record<string, unknown> = {},
) {
	return prisma.catalogueEntry.create({
		select: { id: true },
		data: {
			workoutId,
			workoutAuthorship: 'system',
			archetype: 'threshold',
			...data,
		},
	})
}

test('a Workout carries at most one Catalogue Entry', async () => {
	const stock = await createWorkout({ authorship: 'system' })
	await createEntry(stock.id)
	await expect(createEntry(stock.id)).rejects.toThrow()
})

test('the archetype and level vocabularies are closed', async () => {
	const stock = await createWorkout({ authorship: 'system' })
	await expect(
		createEntry(stock.id, { archetype: 'sweet-spot' }),
	).rejects.toThrow()
	await expect(createEntry(stock.id, { level: 'elite' })).rejects.toThrow()
	// A null level is a positive statement — the row is not level-scoped.
	await expect(createEntry(stock.id, { level: null })).resolves.toBeTruthy()
})

test('the entry cannot claim an authorship its Workout does not have', async () => {
	const athlete = await createAthlete()
	const owned = await createWorkout({ ownerId: athlete.id })
	// The composite foreign key requires (workoutId, workoutAuthorship) to match
	// the Workout's own (id, authorship).
	await expect(
		createEntry(owned.id, { workoutAuthorship: 'system' }),
	).rejects.toThrow()
})

// ── Provenance asymmetry ───────────────────────────────────────────────────

test('a Citation is available only to a system-authored row', async () => {
	const athlete = await createAthlete()
	const owned = await createWorkout({ ownerId: athlete.id })
	const stock = await createWorkout({ authorship: 'system' })

	// The failure this prevents: an athlete typing "Daniels 2013" onto a session
	// Daniels never wrote, in the same slot as real authority.
	await expect(
		createEntry(owned.id, {
			workoutAuthorship: 'athlete',
			citationAuthor: 'Daniels',
			citationWork: "Daniels' Running Formula",
		}),
	).rejects.toThrow()

	await expect(
		createEntry(stock.id, {
			workoutAuthorship: 'system',
			citationAuthor: 'Daniels',
			citationWork: "Daniels' Running Formula",
			citationYear: 2013,
		}),
	).resolves.toBeTruthy()
})

test('a citation is whole or absent — a year with no work is a fragment', async () => {
	const stock = await createWorkout({ authorship: 'system' })
	await expect(
		createEntry(stock.id, { workoutAuthorship: 'system', citationYear: 2013 }),
	).rejects.toThrow()
	await expect(
		createEntry(stock.id, {
			workoutAuthorship: 'system',
			citationAuthor: 'Daniels',
		}),
	).rejects.toThrow()
})

test('a cited Workout cannot be demoted to athlete-authored', async () => {
	const athlete = await createAthlete()
	const stock = await createWorkout({ authorship: 'system' })
	await createEntry(stock.id, {
		workoutAuthorship: 'system',
		citationAuthor: 'Seiler',
		citationWork: 'Seiler & Hetlelid 2005',
	})

	// ON UPDATE CASCADE carries the new authorship into the entry, where the
	// citation CHECK rejects it — so the citation cannot be smuggled onto an
	// athlete-authored row through the back door either.
	await expect(
		prisma.workout.update({
			where: { id: stock.id },
			data: { authorship: 'athlete', ownerId: athlete.id },
		}),
	).rejects.toThrow()
})

// ── The multi-valued facets ────────────────────────────────────────────────

test('phase and goal-event vocabularies are closed and each appears once', async () => {
	const stock = await createWorkout({ authorship: 'system' })
	const entry = await createEntry(stock.id)

	await expect(
		prisma.catalogueEntryPhase.create({
			data: { entryId: entry.id, phase: 'off-season' },
		}),
	).rejects.toThrow()
	await expect(
		prisma.catalogueEntryGoalEvent.create({
			data: { entryId: entry.id, goalEvent: '3.7k' },
		}),
	).rejects.toThrow()

	await prisma.catalogueEntryPhase.create({
		data: { entryId: entry.id, phase: 'build' },
	})
	await expect(
		prisma.catalogueEntryPhase.create({
			data: { entryId: entry.id, phase: 'build' },
		}),
	).rejects.toThrow()
})

test('a progression edge points somewhere else, and retiring one keeps the other', async () => {
	const a = await createEntry(
		(await createWorkout({ authorship: 'system' })).id,
	)
	const b = await createEntry(
		(await createWorkout({ authorship: 'system' })).id,
	)

	await expect(
		prisma.catalogueEntry.update({
			where: { id: a.id },
			data: { progressesToId: a.id },
		}),
	).rejects.toThrow()

	await prisma.catalogueEntry.update({
		where: { id: a.id },
		data: { progressesToId: b.id },
	})
	await prisma.catalogueEntry.delete({ where: { id: b.id } })

	const after = await prisma.catalogueEntry.findUnique({
		where: { id: a.id },
		select: { progressesToId: true },
	})
	expect(after).toEqual({ progressesToId: null })
})

// ── Collection ─────────────────────────────────────────────────────────────

test('an athlete saves a Workout once', async () => {
	const athlete = await createAthlete()
	const other = await createAthlete()
	const stock = await createWorkout({ authorship: 'system' })

	await prisma.catalogueSave.create({
		data: { workoutId: stock.id, ownerId: athlete.id },
	})
	await expect(
		prisma.catalogueSave.create({
			data: { workoutId: stock.id, ownerId: athlete.id },
		}),
	).rejects.toThrow()
	// A second athlete saving the same row is the point — that is what makes
	// adoption countable.
	await expect(
		prisma.catalogueSave.create({
			data: { workoutId: stock.id, ownerId: other.id },
		}),
	).resolves.toBeTruthy()
})
