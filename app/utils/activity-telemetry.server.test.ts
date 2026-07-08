import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { rederiveHrPhaseBarsForDiscipline } from './activity-telemetry.server.ts'

// ── retroactive HR phase bars ────────────────────────────────────────────────
// Phase bars are normally derived at telemetry ingest, which needs a threshold
// HR — an athlete who sets their LTHR *after* recordings were imported would
// never see the recordings' intensity diagram. `rederiveHrPhaseBarsForDiscipline`
// walks the stored streams and fills (or refreshes) the bars.

async function createAthlete() {
	return prisma.user.create({
		select: { id: true },
		data: { ...createUser() },
	})
}

/** A run import optionally carrying a stored 300s HR stream at 5s resolution. */
async function createRunImport(
	athleteId: string,
	externalId: string,
	opts: { withHrStream: boolean },
) {
	const samples = 60
	const timeSec = Array.from({ length: samples }, (_, i) => i * 5)
	const heartrate = Array.from({ length: samples }, () => 150)
	return prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId,
			externalProvider: 'intervalsicu',
			externalId,
			startedAt: new Date('2026-05-21T06:00:00.000Z'),
			endedAt: new Date('2026-05-21T06:05:00.000Z'),
			durationSec: 300,
			discipline: 'run',
			rawJson: '{}',
			stream: {
				create: {
					resolutionSec: 5,
					sampleCount: samples,
					timeSec: JSON.stringify(timeSec),
					heartrate: opts.withHrStream ? JSON.stringify(heartrate) : null,
				},
			},
		},
	})
}

test('derives phase bars for imports whose stored stream carries HR', async () => {
	const user = await createAthlete()
	const imp = await createRunImport(user.id, 'i8001', { withHrStream: true })

	await rederiveHrPhaseBarsForDiscipline(user.id, 'run', 160)

	const after = await prisma.activityImport.findUniqueOrThrow({
		where: { id: imp.id },
		select: { phaseBarsJson: true },
	})
	expect(after.phaseBarsJson).not.toBeNull()
	const bars = JSON.parse(after.phaseBarsJson!) as Array<{ zone: string }>
	expect(bars.length).toBeGreaterThan(0)
})

test('leaves imports without an HR channel honestly bar-less', async () => {
	const user = await createAthlete()
	const imp = await createRunImport(user.id, 'i8002', { withHrStream: false })

	await rederiveHrPhaseBarsForDiscipline(user.id, 'run', 160)

	const after = await prisma.activityImport.findUniqueOrThrow({
		where: { id: imp.id },
		select: { phaseBarsJson: true },
	})
	expect(after.phaseBarsJson).toBeNull()
})

test('only touches the requested discipline', async () => {
	const user = await createAthlete()
	const bike = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			externalProvider: 'intervalsicu',
			externalId: 'i8003',
			startedAt: new Date('2026-05-22T06:00:00.000Z'),
			endedAt: new Date('2026-05-22T06:05:00.000Z'),
			durationSec: 300,
			discipline: 'bike',
			rawJson: '{}',
			stream: {
				create: {
					resolutionSec: 5,
					sampleCount: 2,
					timeSec: '[0,5]',
					heartrate: '[140,141]',
				},
			},
		},
	})

	await rederiveHrPhaseBarsForDiscipline(user.id, 'run', 160)

	const after = await prisma.activityImport.findUniqueOrThrow({
		where: { id: bike.id },
		select: { phaseBarsJson: true },
	})
	expect(after.phaseBarsJson).toBeNull()
})
