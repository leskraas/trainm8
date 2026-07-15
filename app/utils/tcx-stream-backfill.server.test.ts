import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { isNum, parseStoredStream } from './activity-stream.ts'
import { prisma } from './db.server.ts'
import {
	ensureTcxStreamBackfillEnqueued,
	runTcxStreamBackfill,
	TCX_STREAM_BACKFILL_JOB_KIND,
} from './tcx-stream-backfill.server.ts'

// ── the one-shot TCX stream heal (ADR 0036) ────────────────────────────────
// TCX used to be the only import format that ingested no Activity Stream. The
// forward path now parses trackpoints into one; this backfill re-derives the
// stream from each historical TCX import's stored XML (zero I/O) and recomputes
// NP-based Coggan TSS.

async function createBikeAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: [
							{
								discipline: 'bike',
								ftp: 250,
								preferCogganTss: true,
								preferRTSS: false,
							},
						],
					},
				},
			},
		},
	})
}

/** A one-lap bike TCX with per-minute HR + power trackpoints — an interval-ish
 * ride (alternating 150/300 W) so its true NP sits above the average. */
function rideTcx(startIso: string, minutes = 30): string {
	const start = Date.parse(startIso)
	const points = Array.from({ length: minutes + 1 }, (_, i) => {
		const time = new Date(start + i * 60_000).toISOString()
		const watts = i % 2 === 0 ? 150 : 300
		const distance = i * 500
		return `<Trackpoint><Time>${time}</Time><DistanceMeters>${distance}</DistanceMeters><HeartRateBpm><Value>150</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:Watts>${watts}</ns3:Watts></ns3:TPX></Extensions></Trackpoint>`
	}).join('\n')
	return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities>
    <Activity Sport="Biking">
      <Id>${startIso}</Id>
      <Lap StartTime="${startIso}">
        <TotalTimeSeconds>${minutes * 60}.0</TotalTimeSeconds>
        <DistanceMeters>${minutes * 500}.0</DistanceMeters>
        <AverageHeartRateBpm><Value>150</Value></AverageHeartRateBpm>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>${points}</Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`
}

/**
 * A promoted, completed TCX ride recorded yesterday, filed the old way: full
 * TCX XML in `rawJson`, `powerAvg` from the lap summary, but no Activity Stream
 * and no computed TSS — exactly what a pre-ADR-0036 import looks like.
 */
async function createStreamlessTcxRide(
	userId: string,
	opts: { discipline?: string; fileName?: string; fileContent?: string } = {},
) {
	const scheduledAt = new Date()
	scheduledAt.setUTCDate(scheduledAt.getUTCDate() - 1)
	scheduledAt.setUTCHours(12, 0, 0, 0)
	const discipline = opts.discipline ?? 'bike'

	const imp = await prisma.activityImport.create({
		data: {
			athleteId: userId,
			externalProvider: 'manual',
			externalId: faker.string.uuid(),
			startedAt: scheduledAt,
			endedAt: new Date(scheduledAt.getTime() + 1800 * 1000),
			durationSec: 1800,
			discipline,
			powerAvg: 225,
			rawJson: JSON.stringify({
				fileName: opts.fileName ?? 'ride.tcx',
				fileContent: opts.fileContent ?? rideTcx(scheduledAt.toISOString()),
			}),
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt,
			status: 'completed',
			recordingId: imp.id,
		},
		select: { id: true },
	})
	await prisma.activityImport.update({
		where: { id: imp.id },
		data: { promotedSessionId: session.id },
	})
	return { importId: imp.id, sessionId: session.id }
}

test('ensureTcxStreamBackfillEnqueued enqueues exactly once, ever', async () => {
	await prisma.job.deleteMany({ where: { kind: TCX_STREAM_BACKFILL_JOB_KIND } })

	await ensureTcxStreamBackfillEnqueued()
	await ensureTcxStreamBackfillEnqueued()
	expect(
		await prisma.job.count({ where: { kind: TCX_STREAM_BACKFILL_JOB_KIND } }),
	).toBe(1)

	// A finished job still counts as "ran" — later boots must not re-enqueue.
	await prisma.job.updateMany({
		where: { kind: TCX_STREAM_BACKFILL_JOB_KIND },
		data: { status: 'completed' },
	})
	await ensureTcxStreamBackfillEnqueued()
	expect(
		await prisma.job.count({ where: { kind: TCX_STREAM_BACKFILL_JOB_KIND } }),
	).toBe(1)
})

test('the backfill heals an existing TCX import: stream, lap markers, and NP-based Coggan TSS', async () => {
	const user = await createBikeAthlete()
	const { importId, sessionId } = await createStreamlessTcxRide(user.id)

	await runTcxStreamBackfill()

	// The Activity Stream is re-derived from the stored XML, carrying the power
	// channel the trackpoints held.
	const imported = await prisma.activityImport.findUniqueOrThrow({
		where: { id: importId },
		include: { stream: true },
	})
	const stream = parseStoredStream(imported.stream)
	expect(stream).not.toBeNull()
	expect(stream!.power?.some(isNum)).toBe(true)

	// The lap markers are backfilled too (#328).
	expect(imported.lapsJson).not.toBeNull()
	const laps = JSON.parse(imported.lapsJson!) as Array<{ trigger: string | null }>
	expect(laps[0]?.trigger).toBe('Manual')

	// TSS now flows from true Normalized Power → Coggan at high confidence, and
	// the variable 150/300 W ride costs more than its 225 W average would (NP >
	// avg for an interval ride).
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { tssValue: true, tssFormula: true, tssConfidence: true },
	})
	expect(session.tssFormula).toBe('coggan')
	expect(session.tssConfidence).toBe('high')
	expect(session.tssValue).toBeGreaterThan(0)

	// The corrected number lands in the day's Load Snapshot (Dashboard).
	const dateStr = new Date(Date.now() - 24 * 3600 * 1000)
		.toISOString()
		.slice(0, 10)
	const snap = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: user.id, date: dateStr } },
	})
	expect(snap?.tssTotal).toBeGreaterThan(0)
})

test("an 'other'-sport TCX import gains no stream from the backfill (ADR 0015)", async () => {
	const user = await createBikeAthlete()
	const { importId } = await createStreamlessTcxRide(user.id, {
		discipline: 'other',
	})

	await runTcxStreamBackfill()

	const imported = await prisma.activityImport.findUniqueOrThrow({
		where: { id: importId },
		include: { stream: true },
	})
	expect(imported.stream).toBeNull()
})

test('a non-TCX manual import (GPX) is left untouched by the TCX backfill', async () => {
	const user = await createBikeAthlete()
	const { importId } = await createStreamlessTcxRide(user.id, {
		fileName: 'run.gpx',
		fileContent: '<gpx><trk><trkseg></trkseg></trk></gpx>',
	})

	await runTcxStreamBackfill()

	const imported = await prisma.activityImport.findUniqueOrThrow({
		where: { id: importId },
		include: { stream: true },
	})
	expect(imported.stream).toBeNull()
	expect(imported.lapsJson).toBeNull()
})
