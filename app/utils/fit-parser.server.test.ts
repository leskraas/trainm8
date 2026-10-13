import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { encodeActivity } from '#tests/fixtures/fit/fit-builder.ts'
import { parseFit } from './fit-parser.server.ts'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'fit')
const fixture = (name: string) =>
	new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)))

test('the file_id becomes the FIT key and the creator device its display name', () => {
	const parsed = parseFit(fixture('run-with-laps.fit'))
	expect(parsed.fitFileKey).toBe('fit:1:4315:3412345678:1780552800')
	expect(parsed.deviceName).toBe('Garmin Forerunner 965')
})

test('a file without a file_id message has no FIT key', () => {
	const parsed = parseFit(
		encodeActivity({
			fileId: null,
			sessions: [
				{
					sport: 'running',
					startTime: new Date('2026-06-01T07:30:00Z'),
					durationSec: 600,
					distanceM: 2000,
				},
			],
		}),
	)
	expect(parsed.fitFileKey).toBeNull()
	expect(parsed.sessions).toHaveLength(1)
})

test('laps map to elapsed-second edges on the session axis', () => {
	const [session] = parseFit(fixture('run-with-laps.fit')).sessions
	expect(session!.laps).toEqual([
		{ startSec: 0, endSec: 600 },
		{ startSec: 600, endSec: 780 },
		{ startSec: 780, endSec: 900 },
		{ startSec: 900, endSec: 1080 },
		{ startSec: 1080, endSec: 1200 },
		{ startSec: 1200, endSec: 1380 },
		{ startSec: 1380, endSec: 2400 },
	])
})

test('a file without laps parses with none', () => {
	const [session] = parseFit(fixture('run-with-hr.fit')).sessions
	expect(session!.laps).toEqual([])
})

test('a lone lap spanning the whole session is no structure and is dropped', () => {
	const [session] = parseFit(
		encodeActivity({
			sessions: [
				{
					sport: 'running',
					startTime: new Date('2026-06-01T07:30:00Z'),
					durationSec: 1200,
					distanceM: 4000,
					hr: { avg: 140, max: 150 },
					laps: [{ offsetSec: 0, durationSec: 1200 }],
				},
			],
		}),
	).sessions
	expect(session!.laps).toEqual([])
})

test('a triathlon is one session per leg, transitions dropped', () => {
	const { sessions, fitFileKey } = parseFit(fixture('triathlon.fit'))
	expect(fitFileKey).toBe('fit:1:3906:3300112233:1780815600')
	expect(
		sessions.map((s) => [
			s.activity.discipline,
			s.activity.durationSec,
			s.activity.distanceM,
			s.activity.startedAt.toISOString(),
		]),
	).toEqual([
		['swim', 1800, 1500, '2026-06-07T07:00:00.000Z'],
		['bike', 4200, 40000, '2026-06-07T07:33:00.000Z'],
		['run', 2700, 10000, '2026-06-07T08:45:00.000Z'],
	])
})

test("each triathlon leg's stream and laps hold only that leg", () => {
	const [swim, bike, run] = parseFit(fixture('triathlon.fit')).sessions
	for (const [leg, durationSec] of [
		[swim!, 1800],
		[bike!, 4200],
		[run!, 2700],
	] as const) {
		const time = leg.stream!.time
		expect(time[0]).toBe(0)
		expect(time.at(-1)).toBeLessThan(durationSec)
	}
	// Only the bike carried power; the run's stream never sees the bike's.
	expect(bike!.stream!.power).toBeDefined()
	expect(run!.stream!.power).toBeUndefined()
	expect(bike!.laps).toEqual([
		{ startSec: 0, endSec: 2100 },
		{ startSec: 2100, endSec: 4200 },
	])
	expect(run!.laps).toEqual([])
})

test('a file with compressed timestamp headers decodes every sample', () => {
	const parsed = parseFit(fixture('compressed-timestamps.fit'))
	expect(parsed.fitFileKey).toBe('fit:294:841:5550001:1780678800')
	const [session] = parsed.sessions
	expect(session!.activity).toMatchObject({
		discipline: 'run',
		durationSec: 1800,
		distanceM: 5000,
		hrAvg: 145,
		hrMax: 170,
	})
	// One sample every 10 s from 0 to 1800, the offset rolling over every 32 s.
	const time = session!.stream!.time
	expect(time).toHaveLength(181)
	expect(time.slice(0, 5)).toEqual([0, 10, 20, 30, 40])
	expect(time.at(-1)).toBe(1800)
	expect(session!.stream!.heartrate?.at(-1)).toBe(155)
})

test('SuuntoPlus Guide fields come back paired by index', () => {
	const [session] = parseFit(fixture('suunto-guide-run.fit')).sessions
	expect(session!.suuntoPlusGuides).toEqual([
		{ ownerId: 'zztrainm8', externalId: 'trainm8-session-ckx1' },
	])
})

test('a file from any other device carries no guide fields', () => {
	const [session] = parseFit(fixture('run-with-hr.fit')).sessions
	expect(session!.suuntoPlusGuides).toEqual([])
})
