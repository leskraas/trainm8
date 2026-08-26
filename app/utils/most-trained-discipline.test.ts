import { expect, test } from 'vitest'
import { mostTrainedDiscipline } from './most-trained-discipline.ts'

function trained(
	discipline: 'run' | 'bike' | 'swim' | 'strength',
	day: number,
) {
	return { discipline, at: new Date(2026, 0, day) }
}

test('the discipline the athlete actually trained most leads', () => {
	expect(
		mostTrainedDiscipline([
			trained('run', 1),
			trained('bike', 2),
			trained('bike', 3),
		]),
	).toBe('bike')
})

test('nothing on record is asked for, never guessed at', () => {
	// A default that is a guess dressed as a derivation is the failure mode this
	// repo keeps naming (ADR 0065 §5) — so the answer to "no history" is the
	// absence of an answer, and the caller asks.
	expect(mostTrainedDiscipline([])).toBeNull()
})

test('a dead heat goes to the one trained most recently', () => {
	// Deterministic, and a fact about the athlete rather than about the order
	// rows came back in.
	expect(
		mostTrainedDiscipline([
			trained('swim', 20),
			trained('run', 3),
			trained('swim', 4),
			trained('run', 19),
		]),
	).toBe('swim')
})

test('one session is a history', () => {
	expect(mostTrainedDiscipline([trained('strength', 9)])).toBe('strength')
})
