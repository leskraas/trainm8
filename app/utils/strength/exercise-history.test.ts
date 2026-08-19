import { expect, test } from 'vitest'
import {
	type PerformedSet,
	exerciseHistory,
	lastTimeLabel,
	lastTimeYouDidThis,
	setGhostReadings,
} from './exercise-history.ts'

const DAY = 24 * 60 * 60 * 1000
const start = new Date('2026-01-05T09:00:00Z')

function day(n: number): Date {
	return new Date(start.getTime() + n * DAY)
}

function set(partial: Partial<PerformedSet> = {}): PerformedSet {
	const load = partial.load ?? { kind: 'external' as const, kg: 100 }
	return {
		sessionId: 's1',
		exerciseId: 'squat',
		equipment: 'barbell',
		performedAt: day(0),
		orderIndex: 0,
		role: 'working',
		outcome: 'completed',
		load,
		effectiveKg: load.kind === 'external' ? load.kg : null,
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		toFailure: false,
		...partial,
	}
}

const squat = { exerciseId: 'squat', equipment: 'barbell' } as const

// ——— Rule 1: the last session containing *this exercise* ————————————————

test('the ghost comes from the last session containing this exercise, not the last calendar session', () => {
	// A push/pull/legs split trains squat on Monday and benches on Wednesday.
	// Reading the last *calendar* session would show a bench ghost on leg day,
	// which is wrong two days in three.
	const readings = setGhostReadings(
		[
			set({ sessionId: 'legs', performedAt: day(0), orderIndex: 0 }),
			set({
				sessionId: 'push',
				exerciseId: 'bench',
				performedAt: day(2),
				orderIndex: 0,
				load: { kind: 'external', kg: 80 },
				effectiveKg: 80,
			}),
		],
		{ ...squat, rowCount: 1, now: day(4) },
	)
	expect(readings[0]?.text).toBe('100 kg × 5')
})

test('history is per variant, so a dumbbell bench is not the barbell bench’s last time', () => {
	const sets = [
		set({
			sessionId: 'a',
			exerciseId: 'bench',
			equipment: 'barbell',
			performedAt: day(0),
			load: { kind: 'external', kg: 100 },
			effectiveKg: 100,
		}),
		set({
			sessionId: 'b',
			exerciseId: 'bench',
			equipment: 'dumbbell',
			performedAt: day(2),
			load: { kind: 'perSide', kg: 32, sides: 2 },
			effectiveKg: 64,
		}),
	]
	const last = lastTimeYouDidThis(sets, {
		exerciseId: 'bench',
		equipment: 'barbell',
		now: day(4),
	})
	expect(last?.sessionId).toBe('a')
	expect(last?.topSetText).toBe('100 kg × 5')
})

test('the session being logged is not its own ghost', () => {
	const readings = setGhostReadings(
		[
			set({ sessionId: 'old', performedAt: day(0), orderIndex: 0 }),
			set({
				sessionId: 'today',
				performedAt: day(7),
				orderIndex: 0,
				load: { kind: 'external', kg: 110 },
				effectiveKg: 110,
			}),
		],
		{ ...squat, rowCount: 1, now: day(7), excludeSessionId: 'today' },
	)
	expect(readings[0]?.text).toBe('100 kg × 5')
})

// ——— Rule 2: matched positionally ————————————————————————————————————————

test('the ghost is matched positionally, so a ramp shows the right row', () => {
	// Nearest-weight matching would put the 100 kg top set against the warm-up.
	const readings = setGhostReadings(
		[
			set({
				orderIndex: 0,
				load: { kind: 'external', kg: 60 },
				effectiveKg: 60,
				reps: 8,
			}),
			set({
				orderIndex: 1,
				load: { kind: 'external', kg: 80 },
				effectiveKg: 80,
				reps: 5,
			}),
			set({
				orderIndex: 2,
				load: { kind: 'external', kg: 100 },
				effectiveKg: 100,
				reps: 3,
			}),
		],
		{ ...squat, rowCount: 3, now: day(7) },
	)
	expect(readings.map((r) => r?.text)).toEqual([
		'60 kg × 8',
		'80 kg × 5',
		'100 kg × 3',
	])
	expect(readings.every((r) => r?.extrapolated === false)).toBe(true)
})

test('the Set Ghost still matches positionally when a session mixes load kinds', () => {
	// The comparability partition decides what a session's *headline* is. It must
	// not reach the ghost: the ghost is row 3 against last time's row 3 (ADR 0056
	// §5's second rule), and filtering the previous session down to one basis would
	// shift every row after the odd one — or empty a row, which reads as "new
	// territory" rather than "that set was a band".
	const readings = setGhostReadings(
		[
			set({
				orderIndex: 0,
				load: { kind: 'external', kg: 60 },
				effectiveKg: 60,
				reps: 8,
			}),
			set({
				orderIndex: 1,
				load: { kind: 'band', band: 'red' },
				effectiveKg: null,
				reps: 15,
			}),
			set({
				orderIndex: 2,
				load: { kind: 'bodyweightPlus', addedKg: 30 },
				effectiveKg: 104,
				reps: 5,
			}),
		],
		{ ...squat, rowCount: 4, now: day(7) },
	)
	expect(readings.map((r) => r?.text)).toEqual([
		'60 kg × 8',
		'red band × 15',
		'bodyweight + 30 kg × 5',
		// Rule 3 still holds over a mixed session: the fourth row borrows the third.
		'bodyweight + 30 kg × 5',
	])
	expect(readings.map((r) => r?.extrapolated)).toEqual([
		false,
		false,
		false,
		true,
	])
	expect(readings[3]?.note).toBe('beyond last time')
})

// ——— Rule 3: an extra row borrows the last ghost, flagged ————————————————

test('an extra row borrows the last ghost and says it is beyond last time', () => {
	// An empty ghost on set 5 of 5 reads as "new territory" when it only means
	// "you did four last time".
	const readings = setGhostReadings([set({ orderIndex: 0 })], {
		...squat,
		rowCount: 3,
		now: day(7),
	})
	expect(readings[0]?.extrapolated).toBe(false)
	expect(readings[0]?.note).toBeNull()
	expect(readings[2]?.text).toBe('100 kg × 5')
	expect(readings[2]?.extrapolated).toBe(true)
	expect(readings[2]?.note).toBe('beyond last time')
})

// ——— Rule 4: warm-ups and abandoned sets drop out before matching ————————

test('warm-ups and abandoned sets are dropped from the previous session before matching', () => {
	// Otherwise adding one warm-up shifts every working row's ghost by one.
	const readings = setGhostReadings(
		[
			set({
				orderIndex: 0,
				role: 'warmup',
				load: { kind: 'external', kg: 40 },
				effectiveKg: 40,
			}),
			set({
				orderIndex: 1,
				load: { kind: 'external', kg: 100 },
				effectiveKg: 100,
			}),
			set({
				orderIndex: 2,
				outcome: 'abandoned',
				load: { kind: 'external', kg: 100 },
				effectiveKg: 100,
				reps: 1,
			}),
			set({
				orderIndex: 3,
				load: { kind: 'external', kg: 105 },
				effectiveKg: 105,
			}),
		],
		{ ...squat, rowCount: 2, now: day(7) },
	)
	expect(readings.map((r) => r?.text)).toEqual(['100 kg × 5', '105 kg × 5'])
})

test('no history on this lift is no ghost, never a fabricated one', () => {
	expect(setGhostReadings([], { ...squat, rowCount: 2, now: day(7) })).toEqual([
		null,
		null,
	])
})

// ——— The ghost is text ——————————————————————————————————————————————————

test('a ghost is text only, so nothing here can be dropped into an input’s value', () => {
	// The observed failure mode across several apps is athletes logging the ghost
	// by accident and never noticing. This module hands out no number to prefill.
	const [reading] = setGhostReadings([set({ orderIndex: 0 })], {
		...squat,
		rowCount: 1,
		now: day(7),
	})
	expect(Object.keys(reading!).sort()).toEqual(['extrapolated', 'note', 'text'])
	expect(typeof reading!.text).toBe('string')
})

test('a ghost states what a load meant, and never collapses two sides into one number', () => {
	const readings = setGhostReadings(
		[
			set({
				orderIndex: 0,
				load: { kind: 'perSide', kg: 32, sides: 2 },
				effectiveKg: 64,
				reps: 10,
				repsLeft: 8,
			}),
			set({
				orderIndex: 1,
				load: { kind: 'stackLevel', level: 7 },
				effectiveKg: null,
				reps: 12,
			}),
			set({
				orderIndex: 2,
				load: { kind: 'bodyweight' },
				effectiveKg: 80,
				reps: null,
				durationSec: 45,
			}),
		],
		{ ...squat, rowCount: 3, now: day(7) },
	)
	expect(readings.map((r) => r?.text)).toEqual([
		'2 × 32 kg × 10 / 8',
		'level 7 × 12',
		'bodyweight × 45 s',
	])
})

// ——— The per-exercise curve —————————————————————————————————————————————

test('the history is one entry per session, newest first, topped by the heaviest working set', () => {
	const history = exerciseHistory(
		[
			set({
				sessionId: 'a',
				performedAt: day(0),
				orderIndex: 0,
				load: { kind: 'external', kg: 100 },
				effectiveKg: 100,
			}),
			set({
				sessionId: 'a',
				performedAt: day(0),
				orderIndex: 1,
				load: { kind: 'external', kg: 105 },
				effectiveKg: 105,
			}),
			set({
				sessionId: 'b',
				performedAt: day(7),
				orderIndex: 0,
				load: { kind: 'external', kg: 110 },
				effectiveKg: 110,
			}),
		],
		{ ...squat, now: day(9) },
	)
	expect(history.map((s) => [s.sessionId, s.topSetKg])).toEqual([
		['b', 110],
		['a', 105],
	])
	expect(history[1]?.workingSetCount).toBe(2)
})

test('warm-ups and abandoned sets are absent from the curve, so a session is a session of work', () => {
	const history = exerciseHistory(
		[
			set({ sessionId: 'a', orderIndex: 0, role: 'warmup' }),
			set({
				sessionId: 'a',
				orderIndex: 1,
				outcome: 'abandoned',
				load: { kind: 'external', kg: 140 },
				effectiveKg: 140,
			}),
			set({
				sessionId: 'a',
				orderIndex: 2,
				load: { kind: 'external', kg: 110 },
				effectiveKg: 110,
			}),
		],
		{ ...squat, now: day(2) },
	)
	expect(history).toHaveLength(1)
	expect(history[0]?.topSetKg).toBe(110)
	expect(history[0]?.workingSetCount).toBe(1)
})

test('a session logged only in stack levels still has its own curve, and says it compares to nothing else', () => {
	const history = exerciseHistory(
		[
			set({
				sessionId: 'a',
				exerciseId: 'lat-pulldown',
				equipment: 'machine',
				performedAt: day(0),
				load: { kind: 'stackLevel', level: 6 },
				effectiveKg: null,
				reps: 10,
			}),
			set({
				sessionId: 'b',
				exerciseId: 'lat-pulldown',
				equipment: 'machine',
				performedAt: day(3),
				load: { kind: 'stackLevel', level: 7 },
				effectiveKg: null,
				reps: 10,
			}),
		],
		{ exerciseId: 'lat-pulldown', equipment: 'machine', now: day(5) },
	)
	expect(history.map((s) => s.topSetText)).toEqual([
		'level 7 × 10',
		'level 6 × 10',
	])
	expect(history.every((s) => s.topSetKg === null)).toBe(true)
	expect(history.every((s) => s.comparable === false)).toBe(true)
})

test('a session’s top set is not chosen by a kilo that means something else', () => {
	// One session, two kinds. The dip belt bakes the athlete's 74 kg into 104 kg
	// (ADR 0056 §3), so picking the largest `effectiveKg` made a bodyweight-derived
	// number the headline of a session whose bar topped out at 100 kg — and flagged
	// it comparable, which put it on the same axis as every barbell session.
	const history = exerciseHistory(
		[
			set({
				sessionId: 'a',
				orderIndex: 0,
				load: { kind: 'external', kg: 100 },
				effectiveKg: 100,
			}),
			set({
				sessionId: 'a',
				orderIndex: 1,
				load: { kind: 'bodyweightPlus', addedKg: 30 },
				effectiveKg: 104,
				reps: 8,
			}),
		],
		{ ...squat, now: day(2) },
	)
	expect(history[0]?.topSetKg).toBe(100)
	expect(history[0]?.topSetText).toBe('100 kg × 5')
	expect(history[0]?.loadBasis).toBe('bar')
	expect(history[0]?.comparable).toBe(true)
	// The dip-belt kilo is real, and it is a reading of its own basis — present,
	// and never flagged as something a bar can be read against.
	const belt = exerciseHistory(
		[
			set({
				sessionId: 'b',
				load: { kind: 'bodyweightPlus', addedKg: 30 },
				effectiveKg: 104,
			}),
		],
		{ ...squat, now: day(2) },
	)
	expect(belt[0]?.topSetKg).toBe(104)
	expect(belt[0]?.loadBasis).toBe('bodyweightDerived')
	expect(belt[0]?.comparable).toBe(false)
})

test('a session whose every set is unorderable still happened, and its last working set stands for it', () => {
	// An assisted machine's number grows as the work shrinks, so the session has no
	// maximum to headline — but it is a session of work, and dropping it would make
	// the next one read as a first time on a lift trained every week.
	const history = exerciseHistory(
		[
			set({
				sessionId: 'a',
				orderIndex: 0,
				load: { kind: 'assisted', assistKg: 20 },
				effectiveKg: 54,
				reps: 8,
			}),
			set({
				sessionId: 'a',
				orderIndex: 1,
				load: { kind: 'assisted', assistKg: 15 },
				effectiveKg: 59,
				reps: 6,
			}),
		],
		{ ...squat, now: day(2) },
	)
	expect(history).toHaveLength(1)
	expect(history[0]?.workingSetCount).toBe(2)
	expect(history[0]?.topSetText).toBe('assisted − 15 kg × 6')
	expect(history[0]?.topSetKg).toBeNull()
	expect(history[0]?.loadBasis).toBe('unreadable')
	expect(history[0]?.comparable).toBe(false)
})

test('a session in the future is not history, and now is an argument', () => {
	const sets = [
		set({ sessionId: 'a', performedAt: day(0) }),
		set({ sessionId: 'planned', performedAt: day(10) }),
	]
	expect(exerciseHistory(sets, { ...squat, now: day(5) })).toHaveLength(1)
	expect(exerciseHistory(sets, { ...squat, now: day(20) })).toHaveLength(2)
})

// ——— Last time ———————————————————————————————————————————————————————————

test('last time reads in plain time, from the now it is given', () => {
	const last = lastTimeYouDidThis([set({ performedAt: day(0) })], {
		...squat,
		now: day(3),
	})
	expect(lastTimeLabel(last, day(3))).toBe('Last time: 3 days ago')
	expect(lastTimeLabel(last, day(1))).toBe('Last time: yesterday')
	expect(lastTimeLabel(last, day(0))).toBe('Last time: today')
	expect(lastTimeLabel(last, day(21))).toBe('Last time: 3 weeks ago')
})

test('a lift with no history says so, rather than showing an empty last time', () => {
	expect(lastTimeYouDidThis([], { ...squat, now: day(3) })).toBeNull()
	expect(lastTimeLabel(null, day(3))).toBe('First time on this lift')
})
