import { expect, test } from 'vitest'
import { runIntervalsIcuBackfill } from '#app/integrations/intervalsicu/backfill.server.ts'
import { fileIntervalsIcuActivities } from '#app/integrations/intervalsicu/ingest.server.ts'
import { IntervalsIcuActivitySchema } from '#app/integrations/intervalsicu/types.ts'
import { fileActivitiesWithAutoSave } from '#app/integrations/strava/ingest.server.ts'
import { StravaActivitySchema } from '#app/integrations/strava/types.ts'
import { ingestActivityFile } from '#app/utils/activity-file-ingest.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { encodeActivity } from '#tests/fixtures/fit/fit-builder.ts'
import {
	MOCK_INTERVALSICU_API_KEY,
	MOCK_INTERVALSICU_ATHLETE_ID,
} from '#tests/mocks/intervalsicu.ts'

// ADR 0096 §5: every ingest path files through the one choke point, so an
// activity a second source delivers becomes an alias whichever path brings it.

async function athlete() {
	return prisma.user.create({
		select: { id: true },
		data: { ...createUser(), athleteProfile: { create: { timezone: 'UTC' } } },
	})
}

/** The athlete's own FIT of a 50-minute run. */
async function uploadRun(athleteId: string, startTime: Date) {
	await ingestActivityFile(
		athleteId,
		{
			fileName: 'run.fit',
			bytes: encodeActivity({
				sessions: [
					{
						sport: 'running',
						startTime,
						durationSec: 3000,
						distanceM: 10000,
						hr: { avg: 150, max: 178 },
					},
				],
			}),
		},
		{ timezone: 'UTC' },
	)
}

const sessions = (userId: string) =>
	prisma.workoutSession.count({ where: { userId } })

const aliases = (athleteId: string) =>
	prisma.activityImportAlias.findMany({
		where: { athleteId },
		select: { externalProvider: true, externalId: true, originPlatform: true },
	})

test('an Intervals.icu sync of a run the athlete uploaded becomes an alias', async () => {
	const { id } = await athlete()
	await uploadRun(id, new Date('2026-06-01T07:30:00Z'))

	const result = await fileIntervalsIcuActivities(
		id,
		[
			IntervalsIcuActivitySchema.parse({
				id: 'i9001',
				type: 'Run',
				moving_time: 2970,
				elapsed_time: 3000,
				distance: 10000,
				start_date: '2026-06-01T07:30:04Z',
				source: 'GARMIN_CONNECT',
				device_name: 'Garmin Forerunner 965',
			}),
		],
		'UTC',
	)

	expect(result).toMatchObject({ created: 0, skipped: 1 })
	expect(await sessions(id)).toBe(1)
	expect(await aliases(id)).toEqual([
		{
			externalProvider: 'intervalsicu',
			externalId: 'i9001',
			originPlatform: 'garmin',
		},
	])
})

test('a Strava sync of a run already held becomes an alias carrying Strava', async () => {
	const { id } = await athlete()
	await uploadRun(id, new Date('2026-06-01T07:30:00Z'))

	const result = await fileActivitiesWithAutoSave(
		id,
		[
			StravaActivitySchema.parse({
				id: 1234567,
				type: 'Run',
				sport_type: 'Run',
				moving_time: 2990,
				elapsed_time: 3000,
				distance: 10010,
				start_date: '2026-06-01T07:29:58Z',
			}),
		],
		'UTC',
	)

	expect(result).toMatchObject({ created: 0, skipped: 1 })
	expect(await sessions(id)).toBe(1)
	expect(await aliases(id)).toEqual([
		{ externalProvider: 'strava', externalId: '1234567', originPlatform: 'strava' },
	])
})

test('the Intervals.icu backfill files an uploaded run as an alias, not a second session', async () => {
	const { id } = await athlete()
	// The mocked list's first activity: a run at 2026-05-20T06:00Z, 3000 s.
	await uploadRun(id, new Date('2026-05-20T06:00:00Z'))
	await prisma.accountConnection.create({
		data: {
			athleteId: id,
			provider: 'intervalsicu',
			externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
			accessToken: MOCK_INTERVALSICU_API_KEY,
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00Z'),
		},
	})

	const before = await sessions(id)
	const listed = await runIntervalsIcuBackfill(id, {
		now: new Date('2026-05-25T00:00:00Z'),
	})
	expect(listed.ok).toBe(true)

	const held = await prisma.activityImport.findMany({
		where: { athleteId: id, externalProvider: 'intervalsicu' },
		select: { externalId: true },
	})
	expect(held.map((h) => h.externalId)).not.toContain('i2001')
	expect(await aliases(id)).toContainEqual(
		expect.objectContaining({ externalProvider: 'intervalsicu', externalId: 'i2001' }),
	)
	// Every other listed activity is new; the uploaded run gained no twin.
	expect(await sessions(id)).toBe(before + held.length)
})
