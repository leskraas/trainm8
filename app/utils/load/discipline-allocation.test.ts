/**
 * Property tests over track combinations (#395): every subset of the five track
 * disciplines (run, bike, swim, strength, other), random sessions on each, a
 * seeded PRNG so a failure reproduces.
 */
import { expect, test } from 'vitest'
import {
	buildDisciplineAllocation,
	type AllocationSession,
} from './discipline-allocation.ts'

const TRACKS = ['run', 'bike', 'swim', 'strength', 'other'] as const
const ENDURANCE = new Set(['run', 'bike', 'swim'])

function prng(seed: number) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** Every non-empty subset of the tracks, each with 20 random windows. */
function* cases() {
	for (let mask = 1; mask < 1 << TRACKS.length; mask++) {
		const tracks = TRACKS.filter((_, i) => mask & (1 << i))
		for (let run = 0; run < 20; run++) {
			const random = prng(mask * 1000 + run)
			const sessions: AllocationSession[] = []
			for (const discipline of tracks) {
				const count = Math.floor(random() * 6)
				for (let i = 0; i < count; i++) {
					const roll = random()
					sessions.push({
						discipline,
						tss: roll < 0.25 ? null : Math.round(random() * 200),
					})
				}
			}
			yield { tracks, sessions, random }
		}
	}
}

test('available endurance shares sum to one, or there are none', () => {
	for (const { sessions } of cases()) {
		const allocation = buildDisciplineAllocation(sessions)
		const shares = allocation.endurance.flatMap((part) =>
			part.share == null ? [] : [part.share],
		)
		if (allocation.enduranceTss > 0) {
			expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
		} else {
			expect(shares).toEqual([])
		}
		for (const share of shares) {
			expect(share).toBeGreaterThanOrEqual(0)
			expect(Number.isNaN(share)).toBe(false)
		}
	}
})

test('strength and activities never move an endurance share', () => {
	for (const { sessions, random } of cases()) {
		const without = sessions.filter((s) => ENDURANCE.has(s.discipline))
		const extra: AllocationSession[] = [
			{ discipline: 'strength', tss: Math.round(random() * 500) },
			{ discipline: 'other', tss: Math.round(random() * 500) },
		]
		const a = buildDisciplineAllocation(without)
		const b = buildDisciplineAllocation([...sessions, ...extra])
		expect(b.endurance).toEqual(a.endurance)
		expect(b.enduranceTss).toBe(a.enduranceTss)
	}
})

test('every discipline trained appears exactly once, in the mix or beside it', () => {
	for (const { sessions } of cases()) {
		const allocation = buildDisciplineAllocation(sessions)
		const trained = [...new Set(sessions.map((s) => s.discipline))].sort()
		const shown = [
			...allocation.endurance.map((p) => p.discipline),
			...allocation.beside.map((p) => p.discipline),
		].sort()
		expect(shown).toEqual(trained)
		for (const part of allocation.endurance)
			expect(ENDURANCE.has(part.discipline)).toBe(true)
		for (const part of allocation.beside)
			expect(ENDURANCE.has(part.discipline)).toBe(false)
		const counted =
			allocation.endurance.reduce((n, p) => n + p.sessions, 0) +
			allocation.beside.reduce((n, p) => n + p.sessions, 0)
		expect(counted).toBe(sessions.length)
	}
})

test('a discipline with no resolvable TSS is Unavailable, never a zero slice', () => {
	for (const { sessions } of cases()) {
		const allocation = buildDisciplineAllocation(sessions)
		for (const part of allocation.endurance) {
			const resolved = sessions.some(
				(s) => s.discipline === part.discipline && s.tss != null,
			)
			if (!resolved) {
				expect(part.tss).toBeNull()
				expect(part.share).toBeNull()
			}
		}
	}
})

test('the issue’s own example: strength leaves the denominator', () => {
	const allocation = buildDisciplineAllocation([
		{ discipline: 'run', tss: 320 },
		{ discipline: 'bike', tss: 180 },
		{ discipline: 'strength', tss: 140 },
	])
	expect(allocation.enduranceTss).toBe(500)
	expect(allocation.endurance.map((p) => [p.discipline, p.share])).toEqual([
		['run', 0.64],
		['bike', 0.36],
	])
	expect(allocation.beside).toEqual([{ discipline: 'strength', sessions: 1 }])
})
