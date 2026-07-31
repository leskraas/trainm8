import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { readRideWindow } from './volume-conversion.server.ts'
import { convertWeeklyVolume } from './volume-conversion.ts'

const START_WEEK_KEY = '2030-02-04' // a Monday
// The window is the four complete weeks before it: 2030-01-07 … 2030-02-03.

async function createAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	return user.id
}

let externalId = 0

async function logRide(
	athleteId: string,
	startedAt: string,
	km: number | null,
	hours: number,
	discipline = 'bike',
) {
	const started = new Date(startedAt)
	const durationSec = Math.round(hours * 3600)
	await prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider: 'manual',
			externalId: `ride-${externalId++}`,
			startedAt: started,
			endedAt: new Date(started.getTime() + durationSec * 1000),
			durationSec,
			distanceM: km == null ? null : km * 1000,
			discipline,
			rawJson: '{}',
		},
	})
}

test('readRideWindow averages distance over duration across the four weeks before the Plan Start Week', async () => {
	const athleteId = await createAthlete()
	await logRide(athleteId, '2030-01-08T09:00:00Z', 60, 2)
	await logRide(athleteId, '2030-01-22T09:00:00Z', 90, 3)
	await logRide(athleteId, '2030-02-02T09:00:00Z', 30, 1)

	const window = await readRideWindow(athleteId, START_WEEK_KEY)

	expect(window).toEqual({
		fromWeekKey: '2030-01-07',
		weeks: 4,
		rides: 3,
		km: 180,
		hours: 6,
	})
	// 30 km/h — and a plan authored off it reads distance at that speed
	const conversion = convertWeeklyVolume({
		discipline: 'bike',
		currency: 'hours',
		volume: 10,
		mix: [],
		recipe: null,
		profile: {
			lthr: 160,
			maxHr: 190,
			thresholdPaceSecPerKm: null,
			cssSecPer100m: null,
		},
		rideWindow: window,
	})
	expect(conversion.km).toMatchObject({ available: true, value: 300 })
})

test('the window is anchored to the authored start week, not to today', async () => {
	const athleteId = await createAthlete()
	// One ride inside the window, one in the Plan Start Week itself, one before it.
	await logRide(athleteId, '2030-01-10T09:00:00Z', 40, 2)
	await logRide(athleteId, '2030-02-05T09:00:00Z', 200, 2) // the start week — excluded
	await logRide(athleteId, '2029-12-20T09:00:00Z', 200, 2) // too early — excluded

	const window = await readRideWindow(athleteId, START_WEEK_KEY)

	expect(window).toMatchObject({ rides: 1, km: 40, hours: 2 })
})

test('rides of another discipline and rides with no distance never enter the average', async () => {
	const athleteId = await createAthlete()
	await logRide(athleteId, '2030-01-10T09:00:00Z', 60, 2)
	await logRide(athleteId, '2030-01-11T09:00:00Z', 100, 4, 'run')
	await logRide(athleteId, '2030-01-12T09:00:00Z', null, 3) // indoor, no distance

	const window = await readRideWindow(athleteId, START_WEEK_KEY)

	expect(window).toMatchObject({ rides: 1, km: 60, hours: 2 })
})

test('a ride recorded as zero distance is no distance, not a very slow ride', async () => {
	// Zero and null are the same statement across the app (`personal-records.ts:70`,
	// `fit-parser.server.ts:89`). Counting a zero-distance trainer ride would put
	// its duration in the denominator with nothing in the numerator — here it would
	// read 12 km/h instead of 30, on riding that never changed.
	const athleteId = await createAthlete()
	await logRide(athleteId, '2030-01-10T09:00:00Z', 60, 2)
	await logRide(athleteId, '2030-01-12T09:00:00Z', 0, 3) // trainer, distance 0

	const window = await readRideWindow(athleteId, START_WEEK_KEY)

	expect(window).toMatchObject({ rides: 1, km: 60, hours: 2 })
})

test('an empty window is null — the honest close of the distance gate', async () => {
	const athleteId = await createAthlete()
	await logRide(athleteId, '2030-01-10T09:00:00Z', null, 3)

	expect(await readRideWindow(athleteId, START_WEEK_KEY)).toBeNull()
	// …and a window of nothing but zero-distance rides closes it just the same
	const trainerOnly = await createAthlete()
	await logRide(trainerOnly, '2030-01-10T09:00:00Z', 0, 3)
	expect(await readRideWindow(trainerOnly, START_WEEK_KEY)).toBeNull()

	expect(await readRideWindow(await createAthlete(), START_WEEK_KEY)).toBeNull()
})
