import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	createAthlete,
	createGarminOnlyAthlete,
	createWorld,
	ctxFor,
	ORIGIN,
	TODAY,
	YESTERDAY,
} from '#tests/actions-world.ts'
import { runAction } from './run.server.ts'

// `runAction` is the registry's one entry (ADR 0092 §1): the caller, the
// scope, the input, the provenance gate and the outcome are decided here, the
// same for every reader. These tests drive it through the real actions.

const GARMIN_CREDIT = {
	platform: 'garmin',
	text: 'Insights derived in part from Garmin device-sourced data.',
}

test("a model that reaches one of the athlete's own yeses is refused, with the way to where they answer", async () => {
	const { userId } = await createWorld()
	const result = await runAction(ctxFor(userId, 'mcp'), 'answer_proposal', {
		proposalId: 'whatever',
		answer: 'accepted',
	})
	expect(result).toEqual({
		outcome: 'refused',
		code: 'needs-athlete-yes',
		next: 'ask-athlete',
		message: 'Dette må du svare på selv, i trainm8.',
		link: `${ORIGIN}/`,
	})
	// The in-app agent is a model too.
	const agent = await runAction(ctxFor(userId, 'agent'), 'ease_week', {
		weekKey: TODAY,
	})
	expect(agent).toMatchObject({ outcome: 'refused', code: 'needs-athlete-yes' })
})

test('a credential without the kind’s scope is refused before anything runs', async () => {
	const { userId } = await createWorld()
	const result = await runAction(ctxFor(userId, 'mcp', []), 'get_today', {})
	expect(result).toMatchObject({
		outcome: 'refused',
		code: 'needs-scope',
		next: 'ask-athlete',
	})
})

test('input is validated once, and a bad one is refused with advice to fix it', async () => {
	const { userId } = await createWorld()
	const ctx = ctxFor(userId, 'mcp')
	for (const input of [
		{ from: TODAY, to: YESTERDAY },
		{ from: '2026-09-01', to: '2026-09-29' }, // 29 days
		{ from: '2026-13-45', to: '2026-13-46' },
		{ from: TODAY, to: TODAY, cursor: 'not-a-cursor' },
		{ from: TODAY },
	]) {
		expect(await runAction(ctx, 'list_sessions', input)).toMatchObject({
			outcome: 'refused',
			code: 'invalid-input',
			next: 'fix-input',
		})
	}
	expect(await runAction(ctx, 'get_training_load', { weeks: 0 })).toMatchObject(
		{ outcome: 'refused', code: 'invalid-input' },
	)
})

test("another athlete's session is not found, and a missing one is not either", async () => {
	const world = await createWorld()
	const other = await createAthlete()
	for (const userId of [other.id, world.userId]) {
		const sessionId = userId === other.id ? world.run : 'no-such-session'
		const result = await runAction(ctxFor(userId, 'mcp'), 'get_session', {
			sessionId,
		})
		expect(result).toMatchObject({ outcome: 'refused', code: 'not-found' })
	}
})

test('a Garmin value reaches a model with Garmin’s credit on the result', async () => {
	const { userId, session } = await createGarminOnlyAthlete()
	const result = await runAction(ctxFor(userId, 'mcp'), 'get_session', {
		sessionId: session,
	})
	expect(result.outcome).toBe('done')
	if (result.outcome !== 'done') return
	expect(result.value.actual.durationS).toEqual({
		status: 'available',
		value: 3500,
	})
	expect(result.value.recording).toEqual({
		originPlatform: 'garmin',
		device: null,
	})
	expect(result.credits).toEqual([GARMIN_CREDIT])
})

test('a Strava value never reaches a model: it is source-terms, while the plan beside it still goes', async () => {
	const world = await createWorld()
	const model = await runAction(ctxFor(world.userId, 'mcp'), 'get_session', {
		sessionId: world.ride,
	})
	expect(model.outcome).toBe('done')
	if (model.outcome !== 'done') return
	expect(model.value.actual.durationS).toEqual({
		status: 'unavailable',
		reason: 'source-terms',
		label: expect.stringContaining('vilkårene'),
		platforms: ['strava'],
	})
	expect(model.value.actual.tss).toMatchObject({ reason: 'source-terms' })
	expect(model.credits).toEqual([])
	// The athlete's own screen is a different surface: the value is theirs.
	const web = await runAction(ctxFor(world.userId, 'web'), 'get_session', {
		sessionId: world.ride,
	})
	expect(web.outcome === 'done' && web.value.actual.durationS).toEqual({
		status: 'available',
		value: 5400,
	})
})

test('an alias binds as the import does: a Garmin run also delivered from Strava stays closed', async () => {
	const { userId } = await createGarminOnlyAthlete()
	const { recording } = await import('#tests/actions-world.ts')
	const imp = await recording(userId, {
		originPlatform: 'garmin',
		aliases: ['strava'],
		startedAt: new Date(`${TODAY}T06:00:00.000Z`),
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			recordingId: imp.id,
			scheduledAt: new Date(`${TODAY}T06:00:00.000Z`),
			status: 'completed',
			source: 'recorded',
		},
		select: { id: true },
	})
	const result = await runAction(ctxFor(userId, 'mcp'), 'get_session', {
		sessionId: session.id,
	})
	expect(result.outcome === 'done' && result.value.actual.durationS).toEqual(
		expect.objectContaining({ reason: 'source-terms', platforms: ['strava'] }),
	)
})

test("the athlete's own session may give the yes: a web caller's answer runs", async () => {
	const { userId } = await createWorld()
	const result = await runAction(ctxFor(userId, 'web'), 'answer_proposal', {
		proposalId: 'no-such-proposal',
		answer: 'accepted',
	})
	// It reached the service, which looked for the proposal and said so in the
	// card's own words.
	expect(result).toEqual({
		outcome: 'refused',
		code: 'not-found',
		next: 'fix-input',
		message: 'Fant ikke forslaget.',
	})
})
