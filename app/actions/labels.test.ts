import { expect, test } from 'vitest'
import {
	ACTION_TITLE_LABELS,
	READING_UNAVAILABLE_LABELS,
	REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { listActions } from './registry.server.ts'
import { REFUSAL_CODES, UNAVAILABLE_REASONS } from './vocabulary.ts'

// labels.ts words every refusal code, every unavailable reason and every
// action's title (ADR 0092 §10), and nothing that is not one.

test('every refusal code has the athlete’s words, and only the codes do', () => {
	expect(Object.keys(REFUSAL_LABELS).sort()).toEqual([...REFUSAL_CODES].sort())
	for (const text of Object.values(REFUSAL_LABELS))
		expect(text.trim()).not.toBe('')
})

test('every unavailable reason has the athlete’s words, and only the reasons do', () => {
	expect(Object.keys(READING_UNAVAILABLE_LABELS).sort()).toEqual(
		[...new Set(UNAVAILABLE_REASONS)].sort(),
	)
	for (const text of Object.values(READING_UNAVAILABLE_LABELS)) {
		expect(text.trim()).not.toBe('')
	}
})

test('every action’s title comes from labels.ts, and every title is an action’s', () => {
	const actions = listActions()
	expect(Object.keys(ACTION_TITLE_LABELS).sort()).toEqual(
		actions.map((a) => a.name).sort(),
	)
	for (const action of actions) {
		expect(action.title).toBe(
			ACTION_TITLE_LABELS[action.name as keyof typeof ACTION_TITLE_LABELS],
		)
	}
})
