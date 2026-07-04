import fs from 'node:fs'
import path from 'node:path'
import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import {
	isNum,
	parseStoredStream,
	STREAM_MAX_SAMPLES,
	STREAM_RESOLUTION_FLOOR_SEC,
} from '#app/utils/activity-stream.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './imports.upload.tsx'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'fit')
const TCX_FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'tcx')

/** Narrow an action result to the `data({ error })` shape (not a redirect). */
function errorResult(result: Awaited<ReturnType<typeof action>>) {
	if (result instanceof Response) {
		throw new Error(`Expected an error result, got a ${result.status} response`)
	}
	return { error: result.data.error, status: result.init?.status }
}

async function setupAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	const session = await prisma.session.create({
		select: { id: true },
		data: { userId: user.id, expirationDate: getSessionExpirationDate() },
	})
	const cookieHeader = await getSessionCookieHeader(session)
	return { userId: user.id, cookieHeader }
}

function fitFile(name: string) {
	const bytes = fs.readFileSync(path.join(FIXTURES, name))
	return new File([new Uint8Array(bytes)], name, {
		type: 'application/octet-stream',
	})
}

function tcxFile(name: string) {
	const content = fs.readFileSync(path.join(TCX_FIXTURES, name), 'utf-8')
	return new File([content], name, {
		type: 'application/vnd.garmin.tcx+xml',
	})
}

function gpxFile(name = 'morning-run.gpx') {
	const content = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
	<trk>
		<type>running</type>
		<trkseg>
			<trkpt lat="59.9100" lon="10.7400"><time>2026-06-01T07:30:00Z</time></trkpt>
			<trkpt lat="59.9200" lon="10.7400"><time>2026-06-01T07:45:00Z</time></trkpt>
			<trkpt lat="59.9300" lon="10.7400"><time>2026-06-01T08:00:00Z</time></trkpt>
		</trkseg>
	</trk>
</gpx>`
	return new File([content], name, { type: 'application/gpx+xml' })
}

async function uploadFile(
	cookieHeader: string,
	file: File,
	{ disciplineOverride }: { disciplineOverride?: string } = {},
) {
	const formData = new FormData()
	formData.set('file', file)
	if (disciplineOverride) formData.set('disciplineOverride', disciplineOverride)
	const request = new Request(`${BASE_URL}/imports/upload`, {
		method: 'POST',
		headers: { cookie: cookieHeader },
		body: formData,
	})
	return action({ request, params: {}, context: {} } as any)
}

async function createPlannedSession(
	userId: string,
	discipline: string,
	scheduledAt: Date,
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
			discipline,
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									notes: '40 min easy',
									discipline,
									intensity: 'easy',
									orderIndex: 0,
								},
							],
						},
					},
				],
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: { userId, workoutId: workout.id, scheduledAt, status: 'planned' },
	})
}

// ── FIT single-file import ─────────────────────────────────────────────────

test('a .fit run lands in the inbox with duration, distance and HR metrics', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	const response = await uploadFile(cookieHeader, fitFile('run-with-hr.fit'))
	expect(response).toHaveRedirect('/imports')

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.externalProvider).toBe('manual')
	expect(imported.discipline).toBe('run')
	expect(imported.startedAt.toISOString()).toBe('2026-06-01T07:30:00.000Z')
	expect(imported.durationSec).toBe(2400)
	expect(imported.distanceM).toBe(8000)
	expect(imported.hrAvg).toBe(152)
	expect(imported.hrMax).toBe(176)
	expect(imported.cadenceAvg).toBe(86)
	expect(imported.elevationGainM).toBe(120)
	// 2400 s over 8 km → 5:00 min/km
	expect(imported.paceAvgSecPerKm).toBe(300)
	expect(imported.speedMaxMps).toBeCloseTo(4.5)
	// The fixture carries no power data — power stays an Unavailable Metric
	expect(imported.powerAvg).toBeNull()
	expect(imported.powerMax).toBeNull()
})

test('a .fit ride imports with power metrics and the bike Discipline', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, fitFile('ride-with-power.fit'))

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.discipline).toBe('bike')
	expect(imported.powerAvg).toBe(210)
	expect(imported.powerMax).toBe(450)
	expect(imported.powerWeightedAvg).toBe(225)
})

test('a .fit import auto-matches a same-day same-Discipline planned session', async () => {
	const { userId, cookieHeader } = await setupAthlete()
	const planned = await createPlannedSession(
		userId,
		'run',
		new Date('2026-06-01T06:00:00Z'),
	)

	await uploadFile(cookieHeader, fitFile('run-with-hr.fit'))

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.promotedSessionId).toBe(planned.id)
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: planned.id },
	})
	expect(session.recordingId).toBe(imported.id)
})

test('an unmodeled FIT sport imports as other and stays in the inbox (ADR 0015)', async () => {
	const { userId, cookieHeader } = await setupAthlete()
	// A same-day planned session exists, but 'other' never auto-matches.
	await createPlannedSession(userId, 'run', new Date('2026-06-03T08:00:00Z'))

	await uploadFile(cookieHeader, fitFile('hike.fit'))

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.discipline).toBe('other')
	expect(imported.promotedSessionId).toBeNull()
})

test('the single-file Discipline override applies to a .fit upload', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, fitFile('run-with-hr.fit'), {
		disciplineOverride: 'bike',
	})

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.discipline).toBe('bike')
})

test('re-uploading the same .fit file reports a duplicate', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, fitFile('run-with-hr.fit'))
	const response = await uploadFile(cookieHeader, fitFile('run-with-hr.fit'))

	const { error, status } = errorResult(response)
	expect(status).toBe(400)
	expect(error).toMatch(/already been imported/i)
	const count = await prisma.activityImport.count({
		where: { athleteId: userId },
	})
	expect(count).toBe(1)
})

test('a garbled .fit payload returns a clear parse error', async () => {
	const { userId, cookieHeader } = await setupAthlete()
	const garbled = new File(
		[new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])],
		'broken.fit',
	)

	const response = await uploadFile(cookieHeader, garbled)

	const { error, status } = errorResult(response)
	expect(status).toBe(400)
	expect(error).toMatch(/fit/i)
	expect(
		await prisma.activityImport.count({ where: { athleteId: userId } }),
	).toBe(0)
})

// ── TCX single-file import ─────────────────────────────────────────────────

test('a .tcx run lands in the inbox with duration, distance and HR metrics', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	const response = await uploadFile(cookieHeader, tcxFile('run-with-hr.tcx'))
	expect(response).toHaveRedirect('/imports')

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.externalProvider).toBe('manual')
	expect(imported.discipline).toBe('run')
	expect(imported.startedAt.toISOString()).toBe('2026-06-02T07:00:00.000Z')
	expect(imported.endedAt?.toISOString()).toBe('2026-06-02T07:40:00.000Z')
	expect(imported.durationSec).toBe(2400)
	expect(imported.distanceM).toBe(8000)
	// Time-weighted across laps: (148·1200 + 156·1200) / 2400
	expect(imported.hrAvg).toBe(152)
	expect(imported.hrMax).toBe(176)
	// 2400 s over 8 km → 5:00 min/km
	expect(imported.paceAvgSecPerKm).toBe(300)
	expect(imported.speedMaxMps).toBeCloseTo(4.5)
	// Positive altitude deltas over the trackpoints: +50 and +30
	expect(imported.elevationGainM).toBe(80)
	// The fixture carries no power or cadence — those stay Unavailable Metrics
	expect(imported.powerAvg).toBeNull()
	expect(imported.powerMax).toBeNull()
	expect(imported.cadenceAvg).toBeNull()
})

test('a .tcx ride imports with power and cadence and the bike Discipline', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, tcxFile('ride-with-power.tcx'))

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.discipline).toBe('bike')
	expect(imported.durationSec).toBe(3600)
	expect(imported.distanceM).toBe(30000)
	expect(imported.powerAvg).toBe(210)
	expect(imported.powerMax).toBe(450)
	expect(imported.cadenceAvg).toBe(90)
	expect(imported.hrAvg).toBe(141)
})

test('a .tcx import auto-matches a same-day same-Discipline planned session', async () => {
	const { userId, cookieHeader } = await setupAthlete()
	const planned = await createPlannedSession(
		userId,
		'run',
		new Date('2026-06-02T06:00:00Z'),
	)

	await uploadFile(cookieHeader, tcxFile('run-with-hr.tcx'))

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.promotedSessionId).toBe(planned.id)
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: planned.id },
	})
	expect(session.recordingId).toBe(imported.id)
})

test('the single-file Discipline override applies to a .tcx upload', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, tcxFile('run-with-hr.tcx'), {
		disciplineOverride: 'bike',
	})

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.discipline).toBe('bike')
})

test('re-uploading the same .tcx file reports a duplicate', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, tcxFile('run-with-hr.tcx'))
	const response = await uploadFile(cookieHeader, tcxFile('run-with-hr.tcx'))

	const { error, status } = errorResult(response)
	expect(status).toBe(400)
	expect(error).toMatch(/already been imported/i)
	expect(
		await prisma.activityImport.count({ where: { athleteId: userId } }),
	).toBe(1)
})

test('a garbled .tcx payload returns a clear parse error', async () => {
	const { userId, cookieHeader } = await setupAthlete()
	const garbled = new File(['<html>not a tcx</html>'], 'broken.tcx')

	const response = await uploadFile(cookieHeader, garbled)

	const { error, status } = errorResult(response)
	expect(status).toBe(400)
	expect(error).toMatch(/tcx/i)
	expect(
		await prisma.activityImport.count({ where: { athleteId: userId } }),
	).toBe(0)
})

// ── telemetry parity: Activity Stream + phase bars (#168) ──────────────────

test('a .fit import persists a downsampled Activity Stream and HR phase bars', async () => {
	const { userId, cookieHeader } = await setupAthlete()
	// A run threshold HR lets record HR be bucketed into zones.
	await prisma.athleteProfile.create({
		data: {
			userId,
			disciplineProfiles: { create: { discipline: 'run', lthr: 160 } },
		},
	})

	await uploadFile(cookieHeader, fitFile('run-with-hr.fit'))

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
		include: { stream: true },
	})

	// The Activity Stream is downsampled per ADR 0020 and carries the channels
	// the FIT records actually wrote: heart rate and pace (from speed).
	const stream = parseStoredStream(imported.stream)
	invariant(stream, 'expected an Activity Stream on the FIT import')
	expect(stream.resolutionSec).toBeGreaterThanOrEqual(
		STREAM_RESOLUTION_FLOOR_SEC,
	)
	expect(stream.timeSec.length).toBeLessThanOrEqual(STREAM_MAX_SAMPLES)
	expect(stream.heartrate?.some(isNum)).toBe(true)
	expect(stream.pace?.some(isNum)).toBe(true)
	// The fixture carries no power records — power stays absent, never invented.
	expect(stream.power).toBeUndefined()
	// The fixture runs 140 bpm → 164 bpm at halfway; steady 3.33 m/s ≈ 300 s/km.
	const hrReadings = stream.heartrate!.filter(isNum)
	expect(Math.min(...hrReadings)).toBe(140)
	expect(Math.max(...hrReadings)).toBe(164)
	expect(stream.pace!.find(isNum)).toBe(300)

	// Phase bars derived from the same HR against the athlete's LTHR span the
	// easy (zone 3) and hard (zone 4) halves.
	invariant(imported.phaseBarsJson, 'expected phase bars on the FIT import')
	const bars = JSON.parse(imported.phaseBarsJson) as Array<{
		zone: number | null
		durationSec: number
	}>
	expect(bars.length).toBeGreaterThan(0)
	expect(new Set(bars.map((b) => b.zone))).toEqual(new Set([3, 4]))
})

test('a .fit ride import carries the power channel in its Activity Stream', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, fitFile('ride-with-power.fit'))

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
		include: { stream: true },
	})
	const stream = parseStoredStream(imported.stream)
	invariant(stream, 'expected an Activity Stream on the ride import')
	expect(stream.power?.some(isNum)).toBe(true)
})

test('without an LTHR the stream persists but phase bars stay absent (never fabricated)', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, fitFile('run-with-hr.fit'))

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
		include: { stream: true },
	})
	expect(imported.stream).not.toBeNull()
	expect(imported.phaseBarsJson).toBeNull()
})

test("an 'other' FIT import gets no Activity Stream (no overlay per ADR 0015)", async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, fitFile('hike.fit'))

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
		include: { stream: true },
	})
	expect(imported.stream).toBeNull()
	expect(imported.phaseBarsJson).toBeNull()
})

test('a .gpx upload with HR extensions persists an HR Activity Stream and phase bars', async () => {
	const { userId, cookieHeader } = await setupAthlete()
	await prisma.athleteProfile.create({
		data: {
			userId,
			disciplineProfiles: { create: { discipline: 'run', lthr: 160 } },
		},
	})

	// 30 min of one-minute samples: easy first half, hard second half.
	const points = Array.from({ length: 31 }, (_, i) => {
		const time = new Date(
			Date.parse('2026-06-01T07:30:00Z') + i * 60_000,
		).toISOString()
		const hr = i < 15 ? 140 : 168
		return `<trkpt lat="${(59.91 + i * 0.001).toFixed(4)}" lon="10.7400"><time>${time}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`
	}).join('\n\t\t\t')
	const content = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
	<trk>
		<type>running</type>
		<trkseg>
			${points}
		</trkseg>
	</trk>
</gpx>`
	const file = new File([content], 'hr-run.gpx', {
		type: 'application/gpx+xml',
	})

	await uploadFile(cookieHeader, file)

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
		include: { stream: true },
	})
	const stream = parseStoredStream(imported.stream)
	invariant(stream, 'expected an Activity Stream on the GPX import')
	expect(stream.heartrate?.some(isNum)).toBe(true)
	invariant(imported.phaseBarsJson, 'expected phase bars on the GPX import')
	const bars = JSON.parse(imported.phaseBarsJson) as Array<{ zone: number }>
	expect(new Set(bars.map((b) => b.zone))).toEqual(new Set([3, 4]))
})

test('a .gpx without HR persists no Activity Stream (nothing plottable)', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await uploadFile(cookieHeader, gpxFile())

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
		include: { stream: true },
	})
	expect(imported.stream).toBeNull()
})

// ── existing GPX behavior stays intact ─────────────────────────────────────

test('a .gpx upload still imports and auto-matches as before', async () => {
	const { userId, cookieHeader } = await setupAthlete()
	const planned = await createPlannedSession(
		userId,
		'run',
		new Date('2026-06-01T06:00:00Z'),
	)

	const response = await uploadFile(cookieHeader, gpxFile())
	expect(response).toHaveRedirect('/imports')

	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: userId },
	})
	expect(imported.discipline).toBe('run')
	expect(imported.durationSec).toBe(1800)
	expect(imported.promotedSessionId).toBe(planned.id)
})

test('an unsupported file type returns a clear message', async () => {
	const { cookieHeader } = await setupAthlete()
	const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

	const response = await uploadFile(cookieHeader, file)

	const { error, status } = errorResult(response)
	expect(status).toBe(400)
	expect(error).toMatch(/\.gpx, \.tcx and \.fit/i)
})
