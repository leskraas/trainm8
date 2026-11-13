// The Load Recompute Notice's CTL pair is both-or-neither (ADR 0117 §1): a
// hand-written CHECK in `20261107121546_a_notice_may_carry_no_ctl_pair`, not in
// schema.prisma. These tests pin it, because a SQLite table rebuild carries no
// CHECK forward and a constraint nobody exercises is one a later rebuild can
// silently drop.
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

function insert(
	athleteId: string,
	kind: string,
	ctl: { ctlBefore: number | null; ctlAfter: number | null },
) {
	return prisma.loadRecomputeNotice.create({
		data: { athleteId, kind, ...ctl },
	})
}

test('a notice with only ctlBefore is refused by the database', async () => {
	const { id } = await createAthlete()
	await expect(
		insert(id, 'swim-rest-left-the-pace', { ctlBefore: 20, ctlAfter: null }),
	).rejects.toThrow()
})

test('a notice with only ctlAfter is refused by the database', async () => {
	const { id } = await createAthlete()
	await expect(
		insert(id, 'swim-rest-left-the-pace', { ctlBefore: null, ctlAfter: 24 }),
	).rejects.toThrow()
})

test('a notice with both figures, or with neither, is accepted', async () => {
	const { id } = await createAthlete()
	await insert(id, 'strength-left-the-triad', { ctlBefore: 62, ctlAfter: 48 })
	await insert(id, 'swim-rest-left-the-pace', {
		ctlBefore: null,
		ctlAfter: null,
	})
	expect(
		await prisma.loadRecomputeNotice.count({ where: { athleteId: id } }),
	).toBe(2)
})

test('the rebuild kept the unique (athlete, kind) and the cascade', async () => {
	const { id } = await createAthlete()
	await insert(id, 'swim-rest-left-the-pace', {
		ctlBefore: null,
		ctlAfter: null,
	})
	await expect(
		insert(id, 'swim-rest-left-the-pace', { ctlBefore: 1, ctlAfter: 2 }),
	).rejects.toThrow()

	await prisma.user.delete({ where: { id } })
	expect(
		await prisma.loadRecomputeNotice.count({ where: { athleteId: id } }),
	).toBe(0)
})
