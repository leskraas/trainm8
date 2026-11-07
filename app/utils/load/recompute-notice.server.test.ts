import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { exportUserData } from '#app/utils/user-data-export.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	dismissLoadRecomputeNotice,
	getLoadRecomputeNotice,
	recordLoadRecomputeNotice,
} from './recompute-notice.server.ts'

// The Load Recompute Notice's store (ADR 0114): an absent CTL pair is written
// as NULL on both sides, read back as one `ctl: null`, exported as `null`, and
// dismissed like any other notice.

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

test('an absent pair is stored as NULL on both sides and read back as one null', async () => {
	const { id: athleteId } = await createAthlete()

	expect(
		await recordLoadRecomputeNotice({
			athleteId,
			kind: 'swim-rest-left-the-pace',
			ctl: null,
		}),
	).toBe(true)

	const row = await prisma.loadRecomputeNotice.findFirstOrThrow({
		where: { athleteId },
	})
	// No CTL movement to name: neither a zero nor today's CTL stands in for it.
	expect(row.ctlBefore).toBeNull()
	expect(row.ctlAfter).toBeNull()
	expect(await getLoadRecomputeNotice(athleteId)).toEqual({
		kind: 'swim-rest-left-the-pace',
		ctl: null,
	})
})

test('a pair is read back as one value', async () => {
	const { id: athleteId } = await createAthlete()
	await recordLoadRecomputeNotice({
		athleteId,
		kind: 'strength-left-the-triad',
		ctl: { ctlBefore: 62.4, ctlAfter: 47.8 },
	})

	expect(await getLoadRecomputeNotice(athleteId)).toEqual({
		kind: 'strength-left-the-triad',
		ctl: { ctlBefore: 62.4, ctlAfter: 47.8 },
	})
})

test('a second write for the same kind neither duplicates nor overwrites, pair or not', async () => {
	const { id: athleteId } = await createAthlete()
	await recordLoadRecomputeNotice({
		athleteId,
		kind: 'swim-rest-left-the-pace',
		ctl: null,
	})
	expect(
		await recordLoadRecomputeNotice({
			athleteId,
			kind: 'swim-rest-left-the-pace',
			ctl: { ctlBefore: 20, ctlAfter: 24 },
		}),
	).toBe(false)

	await recordLoadRecomputeNotice({
		athleteId,
		kind: 'strength-left-the-triad',
		ctl: { ctlBefore: 62.4, ctlAfter: 47.8 },
	})
	expect(
		await recordLoadRecomputeNotice({
			athleteId,
			kind: 'strength-left-the-triad',
			ctl: null,
		}),
	).toBe(false)

	const rows = await prisma.loadRecomputeNotice.findMany({
		where: { athleteId },
		select: { kind: true, ctlBefore: true, ctlAfter: true },
		orderBy: { kind: 'asc' },
	})
	expect(rows).toEqual([
		{ kind: 'strength-left-the-triad', ctlBefore: 62.4, ctlAfter: 47.8 },
		{ kind: 'swim-rest-left-the-pace', ctlBefore: null, ctlAfter: null },
	])
})

test('dismissing an absent-pair notice dismisses it alone; the other kind is then shown', async () => {
	const { id: athleteId } = await createAthlete()
	await recordLoadRecomputeNotice({
		athleteId,
		kind: 'strength-left-the-triad',
		ctl: { ctlBefore: 62.4, ctlAfter: 47.8 },
	})
	// Newest first: the swim notice is the one on screen.
	await prisma.loadRecomputeNotice.create({
		data: {
			athleteId,
			kind: 'swim-rest-left-the-pace',
			createdAt: new Date(Date.now() + 1000),
		},
	})
	expect((await getLoadRecomputeNotice(athleteId))?.kind).toBe(
		'swim-rest-left-the-pace',
	)

	await dismissLoadRecomputeNotice(athleteId, 'swim-rest-left-the-pace')

	// A fresh read (a reload): the swim notice is gone for good, the strength
	// one is outstanding and shown.
	expect(await getLoadRecomputeNotice(athleteId)).toEqual({
		kind: 'strength-left-the-triad',
		ctl: { ctlBefore: 62.4, ctlAfter: 47.8 },
	})
	const swim = await prisma.loadRecomputeNotice.findUniqueOrThrow({
		where: {
			athleteId_kind: { athleteId, kind: 'swim-rest-left-the-pace' },
		},
	})
	expect(swim.dismissedAt).not.toBeNull()
})

test('the data export lists an absent pair as null, never 0', async () => {
	const { id: athleteId } = await createAthlete()
	await recordLoadRecomputeNotice({
		athleteId,
		kind: 'swim-rest-left-the-pace',
		ctl: null,
	})

	const { tables } = await exportUserData({
		userId: athleteId,
		domain: 'https://x.test',
	})
	expect(tables.LoadRecomputeNotice).toEqual([
		expect.objectContaining({
			kind: 'swim-rest-left-the-pace',
			ctlBefore: null,
			ctlAfter: null,
		}),
	])
})
