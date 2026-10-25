import { expect, test, vi } from 'vitest'
import { createAthlete, ctxFor } from '#tests/actions-world.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { runAction } from './run.server.ts'

// What `runAction` says when an action throws (ADR 0092 §5): a read wrote
// nothing, so it is `not-run`; a write may already have landed, so it is
// `unknown` and the reader is told to read before retrying.

vi.mock('#app/utils/load/week-change-card.server.ts', () => ({
	readWeekChange: vi.fn().mockRejectedValue(new Error('database went away')),
}))
vi.mock('#app/utils/load/week-replan-answers.server.ts', () => ({
	answerProposal: vi.fn().mockRejectedValue(new Error('lost mid-write')),
	acceptRoundWithFactor: vi.fn(),
	easeWeek: vi.fn(),
}))

test('a read that throws is not-run: nothing happened, and it may succeed later', async () => {
	consoleError.mockImplementation(() => {})
	const { id } = await createAthlete()
	expect(await runAction(ctxFor(id, 'mcp'), 'get_week_change', {})).toEqual({
		outcome: 'not-run',
		reason: 'internal',
	})
})

test('a write that throws is unknown: it may have happened, so read first', async () => {
	consoleError.mockImplementation(() => {})
	const { id } = await createAthlete()
	expect(
		await runAction(ctxFor(id, 'web'), 'answer_proposal', {
			proposalId: 'p',
			answer: 'accepted',
		}),
	).toMatchObject({
		outcome: 'unknown',
		message: expect.stringMatching(/read/i),
	})
})
