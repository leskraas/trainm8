// The community tier's rules are structural (ADR 0052) — they live in the schema
// and in `20260809090000_add_community_tier`'s CHECK constraints, not in a
// service-layer validator. These tests pin them for the reason
// `catalogue.constraints.test.ts` gives: a SQLite table rebuild carries no CHECK
// forward, and every rebuild in this repo has had to restore them by hand.
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
	data: {
		ownerId?: string | null
		authorship?: string
		visibility?: string
	} = {},
) {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title: '4 × 6 min @ T',
			discipline: 'run',
			intent: 'threshold',
			ownerId: data.ownerId ?? null,
			authorship: data.authorship ?? 'athlete',
			visibility: data.visibility ?? 'private',
		},
	})
}

// ── Visibility ─────────────────────────────────────────────────────────────

test('visibility is a closed vocabulary of exactly two values', async () => {
	await expect(createWorkout({ visibility: 'private' })).resolves.toBeTruthy()
	await expect(createWorkout({ visibility: 'public' })).resolves.toBeTruthy()
	// ADR 0037 left room for `shared` and `invited`; #452 built neither, because
	// both need the social graph that `GOAL.md`'s identity boundary still excludes.
	// An unpinned string is where that room becomes a row nothing can read.
	await expect(createWorkout({ visibility: 'shared' })).rejects.toThrow()
	await expect(createWorkout({ visibility: 'publik' })).rejects.toThrow()
})

// ── Attribution ────────────────────────────────────────────────────────────

test('an Attribution is structurally impossible on a Stock Workout', async () => {
	const stock = await createWorkout({ authorship: 'system' })
	// The mirror of the citation rule. A Citation cannot land on an athlete's row;
	// an Attribution cannot land on trainm8's. Community content can never look
	// cited, and a trainm8-shipped session can never look like somebody's post.
	await expect(
		prisma.attribution.create({
			data: {
				workoutId: stock.id,
				workoutAuthorship: 'system',
				displayName: 'Not trainm8',
			},
		}),
	).rejects.toThrow()
})

test('promoting a published Workout to system authorship is rejected', async () => {
	const athlete = await createAthlete()
	const workout = await createWorkout({
		ownerId: athlete.id,
		visibility: 'public',
	})
	await prisma.attribution.create({
		data: { workoutId: workout.id, displayName: 'Jo' },
	})

	// `ON UPDATE CASCADE` carries the new discriminator into the Attribution,
	// where the CHECK refuses it — the back door the composite key closes.
	await expect(
		prisma.workout.update({
			where: { id: workout.id },
			data: { authorship: 'system', ownerId: null },
		}),
	).rejects.toThrow()
})

test('a takedown is whole or absent', async () => {
	const athlete = await createAthlete()
	const workout = await createWorkout({ ownerId: athlete.id })
	const attribution = await prisma.attribution.create({
		data: { workoutId: workout.id, displayName: 'Jo' },
		select: { id: true },
	})

	// An author told their session was removed and not told why has been told
	// nothing.
	await expect(
		prisma.attribution.update({
			where: { id: attribution.id },
			data: { takenDownAt: new Date() },
		}),
	).rejects.toThrow()
	await expect(
		prisma.attribution.update({
			where: { id: attribution.id },
			data: { takedownReason: 'Unsafe to train' },
		}),
	).rejects.toThrow()
	await expect(
		prisma.attribution.update({
			where: { id: attribution.id },
			data: { takenDownAt: new Date(), takedownReason: 'Unsafe to train' },
		}),
	).resolves.toBeTruthy()
})

test('deleting a Workout takes its Attribution with it', async () => {
	const athlete = await createAthlete()
	const workout = await createWorkout({ ownerId: athlete.id })
	await prisma.attribution.create({
		data: { workoutId: workout.id, displayName: 'Jo' },
	})

	await prisma.workout.delete({ where: { id: workout.id } })
	expect(
		await prisma.attribution.count({ where: { workoutId: workout.id } }),
	).toBe(0)
})

// ── Reports ────────────────────────────────────────────────────────────────

test('a report reason is a closed vocabulary', async () => {
	const athlete = await createAthlete()
	const workout = await createWorkout({ visibility: 'public' })

	await expect(
		prisma.workoutReport.create({
			data: { workoutId: workout.id, reporterId: athlete.id, reason: 'unsafe' },
		}),
	).resolves.toBeTruthy()
	await expect(
		prisma.workoutReport.create({
			data: { workoutId: workout.id, reason: 'i-just-do-not-like-it' },
		}),
	).rejects.toThrow()
})

test('a report resolution is whole or absent', async () => {
	const workout = await createWorkout({ visibility: 'public' })
	const report = await prisma.workoutReport.create({
		data: { workoutId: workout.id, reason: 'spam' },
		select: { id: true },
	})

	await expect(
		prisma.workoutReport.update({
			where: { id: report.id },
			data: { resolvedAt: new Date() },
		}),
	).rejects.toThrow()
	await expect(
		prisma.workoutReport.update({
			where: { id: report.id },
			data: { resolution: 'dismissed' },
		}),
	).rejects.toThrow()
	await expect(
		prisma.workoutReport.update({
			where: { id: report.id },
			data: { resolvedAt: new Date(), resolution: 'dismissed' },
		}),
	).resolves.toBeTruthy()
})

test('one athlete reports one Workout once', async () => {
	const athlete = await createAthlete()
	const workout = await createWorkout({ visibility: 'public' })

	await prisma.workoutReport.create({
		data: { workoutId: workout.id, reporterId: athlete.id, reason: 'spam' },
	})
	// A second report is the same person saying the same thing louder.
	await expect(
		prisma.workoutReport.create({
			data: {
				workoutId: workout.id,
				reporterId: athlete.id,
				reason: 'abusive',
			},
		}),
	).rejects.toThrow()
})

test('deleting the reporter keeps the report and nulls the reporter', async () => {
	const athlete = await createAthlete()
	const workout = await createWorkout({ visibility: 'public' })
	await prisma.workoutReport.create({
		data: { workoutId: workout.id, reporterId: athlete.id, reason: 'unsafe' },
	})

	await prisma.user.delete({ where: { id: athlete.id } })

	const report = await prisma.workoutReport.findFirstOrThrow({
		where: { workoutId: workout.id },
		select: { reporterId: true, reason: true },
	})
	// A queue that empties itself when a reporter deletes their account is a
	// takedown path an author can wait out.
	expect(report).toEqual({ reporterId: null, reason: 'unsafe' })
})
