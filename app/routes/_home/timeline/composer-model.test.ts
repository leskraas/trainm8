/**
 * The composer's rules, without a screen (ADR 0088): what one tap on _Legg
 * til_ writes for every state the composer can be in.
 */
import { describe, expect, test } from 'vitest'
import { parseWorkoutSentence } from '#app/utils/workout-sentence.ts'
import { type ComposerSourceItem } from '../../resources/composer-sources.tsx'
import {
	composerPlan,
	composerPost,
	composerReducer,
	type ComposerState,
	initialComposerState,
	nudgeBlock,
	planShape,
	readLine,
} from './composer-model.ts'

const TODAY = '2030-02-20'

function state(overrides: Partial<ComposerState> = {}): ComposerState {
	return {
		...initialComposerState({ dayKey: '2030-02-22', todayKey: TODAY, prefill: 'run' }),
		...overrides,
	}
}

function post(s: ComposerState) {
	return composerPost(s, composerPlan(s, readLine(s.text, s.sport)), {
		todayKey: TODAY,
	})
}

function item(overrides: Partial<ComposerSourceItem> = {}): ComposerSourceItem {
	const structure = parseWorkoutSentence('6x1000 m terskel p 90 s', {
		discipline: 'run',
	}).structure!
	return {
		id: 'workout-1',
		title: 'Terskel 6 × 1000 m',
		discipline: 'run',
		label: 'Terskel',
		sentence: '6x1000 m terskel p 90 s',
		notation: { blocks: [] },
		summed: structure,
		...overrides,
	}
}

describe('the empty state is the stamp', () => {
	test('an empty line on a cardio sport offers 45 min Z2 in that sport', () => {
		expect(post(state({ sport: 'bike' }))).toEqual({
			intent: 'stamp-day',
			date: '2030-02-22',
			discipline: 'bike',
			landing: 'toast',
		})
	})

	test('no sport chosen, strength or Annet: an empty line writes nothing, and says why', () => {
		for (const [sport, reason] of [
			[null, 'no-sport'],
			['strength', 'strength'],
			['annet', 'annet'],
		] as const) {
			const s = state({ sport })
			expect(composerPlan(s, readLine('', sport))).toEqual({
				kind: 'none',
				reason,
			})
			expect(post(s)).toBeNull()
		}
	})
})

describe('a typed line', () => {
	test('is written as the sentence, with the chip, landing by toast', () => {
		expect(post(state({ text: '  6x1000 m terskel p 90 s ' }))).toEqual({
			intent: 'write-session',
			date: '2030-02-22',
			discipline: 'run',
			sentence: '6x1000 m terskel p 90 s',
			landing: 'toast',
		})
	})

	test('a line the reader is unsure of writes nothing', () => {
		const s = state({ text: '6x1000 m trskel' })
		expect(composerPlan(s, readLine(s.text, s.sport)).kind).toBe('none')
		expect(post(s)).toBeNull()
	})

	test('Annet sends the sentence with no chip and asks for no track (owner decision 4)', () => {
		expect(post(state({ sport: 'annet', text: '25 min sykkel' }))).toEqual({
			intent: 'write-session',
			date: '2030-02-22',
			discipline: '',
			sentence: '25 min sykkel',
			landing: 'toast',
			annet: 'true',
		})
		// Without the sport word Annet has nothing to say the session is.
		expect(post(state({ sport: 'annet', text: '25 min' }))).toBeNull()
	})

	test('a note from the full part travels with the write', () => {
		expect(post(state({ text: '45 min rolig', notes: '  Med klubben ' }))).toMatchObject(
			{ notes: 'Med klubben' },
		)
	})
})

describe('Allerede gjort (owner decision 5)', () => {
	test('a day gone by starts with the switch on, and the write says done', () => {
		const past = initialComposerState({
			dayKey: '2029-12-01',
			todayKey: TODAY,
			prefill: 'run',
		})
		expect(past.done).toBe(true)
		expect(post({ ...past, text: '10 km rolig' })).toMatchObject({ done: 'true' })
		expect(post({ ...past, text: '10 km rolig', done: false })).not.toHaveProperty(
			'done',
		)
	})

	test('today and ahead never write done, whatever the switch held', () => {
		expect(post(state({ dayKey: TODAY, done: true, text: '45 min' }))).not.toHaveProperty(
			'done',
		)
	})

	test('moving the day across today resets the switch; between past days it keeps the choice', () => {
		const past = initialComposerState({
			dayKey: '2030-02-10',
			todayKey: TODAY,
			prefill: 'run',
		})
		const off = composerReducer(past, { type: 'done', done: false })
		expect(
			composerReducer(off, { type: 'day', dayKey: '2030-02-11', todayKey: TODAY })
				.done,
		).toBe(false)
		const ahead = composerReducer(off, {
			type: 'day',
			dayKey: '2030-02-24',
			todayKey: TODAY,
		})
		expect(ahead.done).toBe(false)
		expect(
			composerReducer(ahead, { type: 'day', dayKey: '2030-02-12', todayKey: TODAY })
				.done,
		).toBe(true)
	})
})

describe('Bibliotek and Kopier', () => {
	test('a pick fills the line as tokens, and untouched it is placed whole', () => {
		const picked = composerReducer(state({ sport: 'bike' }), {
			type: 'pick',
			pick: { source: 'bibliotek', item: item() },
		})
		expect(picked.text).toBe('6x1000 m terskel p 90 s')
		expect(picked.sport).toBe('run')
		expect(picked.source).toBe('skriv')
		expect(post(picked)).toEqual({
			intent: 'place-session',
			date: '2030-02-22',
			workoutId: 'workout-1',
		})
	})

	test('changed, the pick is the athlete’s own sentence', () => {
		const picked = composerReducer(state(), {
			type: 'pick',
			pick: { source: 'kopier', item: item({ id: 'session-9' }) },
		})
		expect(post(picked)).toMatchObject({ intent: 'copy-session', sessionId: 'session-9' })
		const changed = composerReducer(picked, {
			type: 'text',
			text: '8x1000 m terskel p 90 s',
		})
		expect(post(changed)).toMatchObject({
			intent: 'write-session',
			sentence: '8x1000 m terskel p 90 s',
		})
	})

	test('a pick the line cannot say is written whole while the line is left empty', () => {
		const whole = composerReducer(state(), {
			type: 'pick',
			pick: { source: 'kopier', item: item({ id: 'session-3', sentence: null }) },
		})
		expect(whole.text).toBe('')
		expect(post(whole)).toMatchObject({ intent: 'copy-session', sessionId: 'session-3' })
		expect(planShape(composerPlan(whole, readLine('', 'run')))).toBe(
			whole.pick?.item.summed,
		)
	})
})

describe('Gjør grundigere: steppers write back into the line', () => {
	const structure = parseWorkoutSentence('6x1000 m terskel p 90 s', {
		discipline: 'run',
	}).structure!

	test('one more repeat, and a new rest, said as the line', () => {
		expect(nudgeBlock(structure, 0, { repeatCount: 7 })).toBe(
			'7x1000 m terskel p 90 s',
		)
		expect(nudgeBlock(structure, 0, { restSec: 120 })).toBe(
			'6x1000 m terskel p 2 min',
		)
		expect(nudgeBlock(structure, 0, { restSec: null })).toBe(
			'6x1000 m terskel',
		)
	})
})
