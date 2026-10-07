import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { MACHINE_OWNED_SESSION, sessionOwner } from './session-ownership.ts'

// Ownership is stated twice — a predicate for rows already read and a `where`
// fragment for queries — and the two must never disagree, or a write the
// predicate would refuse slips through the query. Every combination of the
// three facts is written to the database and read back through the fragment.

const SOURCES = ['authored', 'generated', 'recorded', 'detected'] as const
const AT = new Date('2030-01-09T12:00:00Z')

test('the where-fragment selects exactly the sessions the predicate calls the machine’s', async () => {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	const combinations = SOURCES.flatMap((source) =>
		[null, AT].flatMap((adoptedAt) =>
			[null, AT].map((releasedAt) => ({ source, adoptedAt, releasedAt })),
		),
	)
	const written = await Promise.all(
		combinations.map(async (facts) => {
			const { id } = await prisma.workoutSession.create({
				select: { id: true },
				data: {
					...facts,
					userId: user.id,
					scheduledAt: AT,
					status: 'scheduled',
				},
			})
			return { id, facts }
		}),
	)

	const selected = await prisma.workoutSession.findMany({
		where: { userId: user.id, ...MACHINE_OWNED_SESSION },
		select: { id: true },
	})

	expect(written).toHaveLength(16)
	const expected = written
		.filter(({ facts }) => sessionOwner(facts) === 'machine')
		.map(({ id }) => id)
		.sort()
	expect(selected.map(({ id }) => id).sort()).toEqual(expected)
	// And the rule is not vacuous: both owners occur.
	expect(expected.length).toBeGreaterThan(0)
	expect(expected.length).toBeLessThan(16)
})
