import { expect, test, vi } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import {
	createActivityImport,
	type ActivityImportInput,
} from './activity-import.server.ts'
import { prisma } from './db.server.ts'
import {
	publishActivityImportCreated,
	subscribeActivityImportCreated,
} from './imports-events.server.ts'

function importInput(
	overrides: Partial<ActivityImportInput> = {},
): ActivityImportInput {
	const startedAt = new Date('2026-05-20T06:00:00.000Z')
	return {
		externalProvider: 'manual',
		externalId: `ext-${Math.random().toString(36).slice(2)}`,
		startedAt,
		endedAt: new Date(startedAt.getTime() + 3600 * 1000),
		durationSec: 3600,
		discipline: 'run',
		rawJson: '{}',
		...overrides,
	}
}

async function createAthlete() {
	return prisma.user.create({ data: { ...createUser() }, select: { id: true } })
}

test('publish/subscribe delivers an event to the athlete listener', () => {
	const listener = vi.fn()
	const unsubscribe = subscribeActivityImportCreated('athlete-1', listener)

	publishActivityImportCreated('athlete-1')

	expect(listener).toHaveBeenCalledTimes(1)
	unsubscribe()
})

test('unsubscribe detaches the listener', () => {
	const listener = vi.fn()
	const unsubscribe = subscribeActivityImportCreated('athlete-1', listener)
	unsubscribe()

	publishActivityImportCreated('athlete-1')

	expect(listener).not.toHaveBeenCalled()
})

test('creating an Activity Import emits an event for the owning athlete', async () => {
	const athlete = await createAthlete()
	const listener = vi.fn()
	const unsubscribe = subscribeActivityImportCreated(athlete.id, listener)

	await createActivityImport(athlete.id, importInput())

	expect(listener).toHaveBeenCalledTimes(1)
	unsubscribe()
})

test('per-athlete isolation: athlete B does not receive athlete A events', async () => {
	const [athleteA, athleteB] = await Promise.all([
		createAthlete(),
		createAthlete(),
	])
	const listenerA = vi.fn()
	const listenerB = vi.fn()
	const unsubA = subscribeActivityImportCreated(athleteA.id, listenerA)
	const unsubB = subscribeActivityImportCreated(athleteB.id, listenerB)

	await createActivityImport(athleteA.id, importInput())

	expect(listenerA).toHaveBeenCalledTimes(1)
	expect(listenerB).not.toHaveBeenCalled()
	unsubA()
	unsubB()
})

test('a failed insert (duplicate) does not emit', async () => {
	const athlete = await createAthlete()
	const input = importInput({ externalId: 'dup-1' })
	await createActivityImport(athlete.id, input)

	const listener = vi.fn()
	const unsubscribe = subscribeActivityImportCreated(athlete.id, listener)

	// Same (externalProvider, externalId) violates the unique guard and throws.
	await expect(createActivityImport(athlete.id, input)).rejects.toThrow()

	expect(listener).not.toHaveBeenCalled()
	unsubscribe()
})
