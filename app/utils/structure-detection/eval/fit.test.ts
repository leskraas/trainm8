import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { encodeActivity } from '#tests/fixtures/fit/fit-builder.ts'
import { parseFit } from '../../fit-parser.server.ts'
import { oneSecondStream, readFitFile, sessionStream } from './fit.ts'

// ── Reading FIT files for the detection scoreboard (#625) ───────────────────

const fixture = (name: string) =>
	new Uint8Array(readFileSync(`tests/fixtures/fit/${name}`))

test('a file with compressed timestamp headers decodes, laps included, as parseFit reads it', () => {
	const bytes = fixture('compressed-timestamps.fit')
	const file = readFitFile(bytes)
	const parsed = parseFit(bytes)
	expect(file.sessions).toHaveLength(parsed.sessions.length)
	// Decoded past the compressed headers: the session's sport and the records'
	// speed come from the second decode, not only from parseFit.
	expect(file.sessions[0]!.sport).toBe('running')
	expect(file.sessions[0]!.extra.speed).toHaveLength(
		parsed.sessions[0]!.stream!.time.length,
	)
	file.sessions.forEach((s, i) => {
		expect(s.raw).toEqual(parsed.sessions[i]!.stream)
		const edges = s.laps.map(({ startSec, endSec }) => ({ startSec, endSec }))
		// parseFit drops a lone whole-session lap; otherwise the edges agree.
		if (parsed.sessions[i]!.laps.length) {
			expect(edges).toEqual(parsed.sessions[i]!.laps)
		}
	})
})

test("a leg that ends where the next starts never takes the next leg's first lap", () => {
	const t0 = new Date('2026-06-07T07:00:00Z')
	const run = (offsetSec: number) => ({
		sport: 'running',
		startTime: new Date(t0.getTime() + offsetSec * 1000),
		durationSec: 600,
		distanceM: 2000,
		hr: { avg: 150, max: 170 },
		laps: [
			{ offsetSec: 0, durationSec: 300 },
			{ offsetSec: 300, durationSec: 300 },
		],
	})
	const file = readFitFile(encodeActivity({ sessions: [run(0), run(600)] }))
	expect(file.sessions).toHaveLength(2)
	for (const s of file.sessions) {
		expect(s.laps.map((l) => [l.startSec, l.endSec])).toEqual([
			[0, 300],
			[300, 600],
		])
	}
})

test('a multisport file gives each leg its own laps, as parseFit does', () => {
	const bytes = fixture('triathlon.fit')
	const file = readFitFile(bytes)
	const parsed = parseFit(bytes)
	expect(file.sessions.length).toBeGreaterThan(1)
	file.sessions.forEach((s, i) => {
		const edges = s.laps.map(({ startSec, endSec }) => ({ startSec, endSec }))
		if (parsed.sessions[i]!.laps.length) {
			expect(edges).toEqual(parsed.sessions[i]!.laps)
		}
		// Every lap starts inside its own leg.
		for (const l of s.laps) expect(l.startSec).toBeLessThan(s.durationSec + 1)
	})
})

test('streams stay on the session axis when the first record comes late', () => {
	// First record 7 s after the session start, then 1 Hz.
	const time = Array.from({ length: 60 }, (_, i) => 7 + i)
	const raw = { time, power: time.map((t) => (t < 37 ? 200 : 400)) }
	const grid = sessionStream(raw)!
	expect(grid.timeSec[0]).toBe(7)
	expect(grid.resolutionSec).toBe(5)
	const one = oneSecondStream(raw)!
	expect(one.timeSec[0]).toBe(7)
	// The step at t = 37 s sits at t = 37 s, where a lap starting then sits.
	expect(one.power![one.timeSec.indexOf(37)]).toBe(400)
	expect(one.power![one.timeSec.indexOf(36)]).toBe(200)
})
