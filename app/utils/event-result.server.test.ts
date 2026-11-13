import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import {
	autoSaveImport,
	createActivityImport,
	deleteImportIfAutoSaveMirror,
	detachRecordingFromPlan,
	promoteToExistingSession,
	updateActivityImportSnapshot,
} from './activity-import.server.ts'
import { readEventResultView } from './event-result.server.ts'
import {
	cancelEvent,
	createEvent,
	deleteEvent,
	setEventDistance,
	setEventResult,
	unlinkEventResult,
	updateEvent,
} from './event.server.ts'
import { answerImportQuestion, undoImportAnswer } from './import-link.server.ts'
import { recomputePlannedTssForSession } from './load/planned-tss.server.ts'
import {
	addPerformanceResult,
	deletePerformanceResult,
	listPerformanceResults,
} from './performance-result-writer.server.ts'
import { getDisciplineThresholds } from './training.server.ts'
import { deleteWorkoutSession } from './workout.server.ts'

// An Event's result (#670, ADR 0117) at the server seam: every path that
// changes the Event, its result session or its Recording goes through the one
// reconcile, which writes or removes the row and moves Planned TSS with it.

// Two days ago: a Recording's link recomputes load from its day to today, so a
// race far back would walk months of days per link.
const DAY_MS = 86_400_000
const dayKey = (offset: number) =>
	new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10)
const RACE_DAY = dayKey(-2)
const LATER_DAY = dayKey(-1)
const RACE_START = new Date(`${RACE_DAY}T08:00:00Z`)
const NOW = new Date()

/** An athlete with a threshold pace and rTSS (so a 10k-pace step has a
 * Planned TSS once a 10k result exists) but no LTHR, max HR or FTP: their
 * Recordings have no Load Confidence to speak of. */
async function athlete() {
	const user = await prisma.user.create({
		select: { id: true },
		data: createUser(),
	})
	await prisma.athleteProfile.create({
		data: {
			userId: user.id,
			timezone: 'UTC',
			disciplineProfiles: {
				create: [
					{ discipline: 'run', thresholdPaceSecPerKm: 240, preferRTSS: true },
				],
			},
		},
	})
	return user.id
}

async function runSession(
	userId: string,
	{
		at,
		status = 'scheduled',
		intensity = null,
	}: { at: Date; status?: string; intensity?: string | null },
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: intensity ? '30 min at 10k pace' : 'Sentrumsløpet',
			discipline: 'run',
			intent: 'threshold',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 1800,
									intensity,
								},
							],
						},
					},
				],
			},
		},
	})
	return (
		await prisma.workoutSession.create({
			select: { id: true },
			data: { userId, workoutId: workout.id, scheduledAt: at, status },
		})
	).id
}

/** A scheduled 30 min at 10k pace, to watch Planned TSS move. */
async function racePaceSession(userId: string) {
	const id = await runSession(userId, {
		at: new Date(`${dayKey(10)}T08:00:00Z`),
		intensity: JSON.stringify({ kind: 'racePace', event: '10k' }),
	})
	await recomputePlannedTssForSession(userId, id)
	return id
}

async function planned(sessionId: string) {
	const row = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { plannedTssValue: true, plannedTssOrigins: true },
	})
	return { tss: row.plannedTssValue, origins: row.plannedTssOrigins }
}

let n = 0
async function importRun(
	userId: string,
	{
		km = 10.21,
		seconds = 2472,
		discipline = 'run',
		originPlatform = 'garmin' as const,
	} = {},
) {
	return createActivityImport(userId, {
		externalProvider: 'intervalsicu',
		externalId: `race-${++n}`,
		originPlatform,
		deviceName: 'Garmin Forerunner 265',
		startedAt: RACE_START,
		endedAt: new Date(RACE_START.getTime() + seconds * 1000),
		durationSec: seconds - 30,
		distanceM: km == null ? null : km * 1000,
		discipline,
		rawJson: '{}',
	})
}

async function race(
	userId: string,
	fields: Partial<{ kind: 'race' | 'time-trial' | 'fitness-goal' }> & {
		distanceM?: number | null
	} = {},
) {
	return createEvent(userId, {
		name: 'Sentrumsløpet',
		kind: fields.kind ?? 'race',
		priority: 'A',
		startDate: new Date(`${RACE_DAY}T00:00:00Z`),
		disciplines: ['run'],
		status: 'planned',
		distanceM: fields.distanceM === undefined ? 10000 : fields.distanceM,
	})
}

/** A run race, a planned session on its day holding a Garmin Recording, and
 * a racePace session ahead. */
async function linkedRace() {
	const userId = await athlete()
	const ahead = await racePaceSession(userId)
	const event = await race(userId)
	const sessionId = await runSession(userId, {
		at: RACE_START,
		status: 'scheduled',
	})
	const imported = await importRun(userId)
	await promoteToExistingSession(userId, imported.id, sessionId)
	return { userId, ahead, eventId: event.id, sessionId, importId: imported.id }
}

const eventRow = (eventId: string) =>
	prisma.performanceResult.findUnique({ where: { eventId } })

test('linking the raced session writes one verified result at the Event Distance, and moves Planned TSS with its origin', async () => {
	const { userId, ahead, eventId, sessionId, importId } = await linkedRace()
	expect(await planned(ahead)).toEqual({ tss: null, origins: null })

	await setEventResult(userId, eventId, sessionId)

	expect(await eventRow(eventId)).toMatchObject({
		discipline: 'run',
		distanceM: 10000,
		timeSec: 2472,
		occurredAt: new Date(`${RACE_DAY}T00:00:00Z`),
		source: 'race',
		verified: true,
		activityImportId: importId,
	})
	// 41:12 is 4:07/km; the scheduled session resolves against it, and its
	// Planned TSS carries the Garmin origin (ADR 0117 §4).
	const after = await planned(ahead)
	expect(after.tss).not.toBeNull()
	expect(JSON.parse(after.origins!)).toEqual(['garmin'])
	const thresholds = await getDisciplineThresholds(userId)
	expect(thresholds.run?.raceAnchorPaces).toEqual({ '10k': 247 })
	expect(thresholds.run?.raceAnchorOrigins).toEqual({ '10k': ['garmin'] })
})

test('Load Confidence plays no part: an athlete with no thresholds for load and no heart rate still gets a verified result', async () => {
	const { userId, eventId, sessionId } = await linkedRace()
	await prisma.disciplineProfile.updateMany({
		where: { athleteProfile: { userId } },
		data: { thresholdPaceSecPerKm: null, lthr: null, maxHr: null },
	})
	await setEventResult(userId, eventId, sessionId)
	expect(await eventRow(eventId)).toMatchObject({ verified: true })
})

test('unlinking, cancelling and deleting each remove the result and move Planned TSS back', async () => {
	for (const remove of [
		(userId: string, eventId: string) => unlinkEventResult(userId, eventId),
		(userId: string, eventId: string) => cancelEvent(userId, eventId),
		(userId: string, eventId: string) => deleteEvent(userId, eventId),
	]) {
		const { userId, ahead, eventId, sessionId } = await linkedRace()
		await setEventResult(userId, eventId, sessionId)
		expect((await planned(ahead)).tss).not.toBeNull()

		await remove(userId, eventId)

		expect(await eventRow(eventId)).toBeNull()
		expect(await planned(ahead)).toEqual({ tss: null, origins: null })
	}
})

test('deleting the result session removes the result, though the Event outlives it', async () => {
	const { userId, ahead, eventId, sessionId } = await linkedRace()
	await setEventResult(userId, eventId, sessionId)

	await deleteWorkoutSession(userId, sessionId)

	expect(await eventRow(eventId)).toBeNull()
	expect(await prisma.event.count({ where: { id: eventId } })).toBe(1)
	expect((await planned(ahead)).tss).toBeNull()
})

test('lifting the Recording off the result session removes the result; one linked later writes it then', async () => {
	const { userId, ahead, eventId, sessionId, importId } = await linkedRace()
	await setEventResult(userId, eventId, sessionId)

	await detachRecordingFromPlan(userId, importId)
	expect(await eventRow(eventId)).toBeNull()
	expect((await planned(ahead)).tss).toBeNull()

	// The Event is still done; the Recording comes back to its session.
	const again = await importRun(userId, { km: 10.1 })
	await promoteToExistingSession(userId, again.id, sessionId)
	expect(await eventRow(eventId)).toMatchObject({
		activityImportId: again.id,
		verified: true,
	})
	expect((await planned(ahead)).tss).not.toBeNull()
})

test('a distance set on a done Event writes the result then; a wrong one removes it', async () => {
	const userId = await athlete()
	const ahead = await racePaceSession(userId)
	const event = await race(userId, { distanceM: null })
	const sessionId = await runSession(userId, { at: RACE_START })
	const imported = await importRun(userId)
	await promoteToExistingSession(userId, imported.id, sessionId)
	await setEventResult(userId, event.id, sessionId)
	expect(await eventRow(event.id)).toBeNull()
	expect((await readEventResultView(userId, event.id))?.verdict).toEqual({
		kind: 'missing',
		reason: 'no-distance',
	})

	await setEventDistance(userId, event.id, 10000)
	expect(await eventRow(event.id)).toMatchObject({ distanceM: 10000 })
	expect((await planned(ahead)).tss).not.toBeNull()

	await setEventDistance(userId, event.id, 21097)
	expect(await eventRow(event.id)).toBeNull()
	expect((await readEventResultView(userId, event.id))?.verdict).toEqual({
		kind: 'missing',
		reason: 'distance-mismatch',
		measuredM: 10210,
		raceDistanceM: 21097,
	})
	expect((await planned(ahead)).tss).toBeNull()
})

test("changing the kind or the disciplines rewrites or removes the result, and clears a distance the Event can't take", async () => {
	const { userId, eventId, sessionId } = await linkedRace()
	await setEventResult(userId, eventId, sessionId)
	const base = {
		name: 'Sentrumsløpet',
		priority: 'A' as const,
		startDate: new Date(`${RACE_DAY}T00:00:00Z`),
		status: 'planned' as const,
		resultSessionId: sessionId,
		distanceM: 10000,
	}

	await updateEvent(userId, eventId, {
		...base,
		kind: 'time-trial',
		disciplines: ['run'],
	})
	expect(await eventRow(eventId)).toMatchObject({ source: 'timeTrial' })

	await updateEvent(userId, eventId, {
		...base,
		kind: 'race',
		disciplines: ['run', 'bike'],
	})
	expect(await eventRow(eventId)).toBeNull()
	expect(
		(await prisma.event.findUniqueOrThrow({ where: { id: eventId } }))
			.distanceM,
	).toBeNull()
})

test('a Recording that is not a run, has no distance, or is outside ±5 % writes nothing', async () => {
	for (const recording of [
		{ discipline: 'bike', km: 10.2 },
		{ discipline: 'run', km: null },
		{ discipline: 'run', km: 11.4 },
	]) {
		const userId = await athlete()
		const event = await race(userId)
		const sessionId = await runSession(userId, { at: RACE_START })
		const imported = await importRun(userId, recording as never)
		await promoteToExistingSession(userId, imported.id, sessionId)
		await setEventResult(userId, event.id, sessionId)
		expect(await eventRow(event.id)).toBeNull()
	}
})

test('a fitness goal writes no result', async () => {
	const userId = await athlete()
	const event = await race(userId, { kind: 'fitness-goal' })
	const sessionId = await runSession(userId, { at: RACE_START })
	const imported = await importRun(userId)
	await promoteToExistingSession(userId, imported.id, sessionId)
	await setEventResult(userId, event.id, sessionId)
	expect(await eventRow(event.id)).toBeNull()
	expect(
		(await prisma.event.findUniqueOrThrow({ where: { id: event.id } }))
			.distanceM,
	).toBeNull()
})

test("a source refreshing or removing the Recording rewrites or removes the Event's result", async () => {
	const userId = await athlete()
	const ahead = await racePaceSession(userId)
	const event = await race(userId)
	const imported = await importRun(userId)
	// No planned session fits, so auto-save stands the Recording up on its own
	// session, which the athlete links as the race.
	const saved = await autoSaveImport(userId, imported.id, 'UTC')
	await setEventResult(userId, event.id, saved!.sessionId)
	expect(await eventRow(event.id)).toMatchObject({ timeSec: 2472 })

	const input = {
		externalProvider: 'intervalsicu' as const,
		externalId: (await prisma.activityImport.findUniqueOrThrow({
			where: { id: imported.id },
		}))!.externalId,
		startedAt: RACE_START,
		endedAt: new Date(RACE_START.getTime() + 2500_000),
		durationSec: 2470,
		distanceM: 10150,
		discipline: 'run',
		rawJson: '{}',
	}
	await updateActivityImportSnapshot(userId, input)
	expect(await eventRow(event.id)).toMatchObject({ timeSec: 2500 })

	await deleteImportIfAutoSaveMirror(userId, 'intervalsicu', input.externalId)
	expect(
		await prisma.performanceResult.count({ where: { eventId: event.id } }),
	).toBe(0)
	expect((await planned(ahead)).tss).toBeNull()
})

test("a typed result is untouched by an Event's, and wins on the same day", async () => {
	const { userId, eventId, sessionId } = await linkedRace()
	await addPerformanceResult(
		userId,
		{ anchor: '10k', timeSec: 2465, date: RACE_DAY, source: 'race' },
		NOW,
	)
	await setEventResult(userId, eventId, sessionId)

	// Both rows stand; the resolver uses the typed one (41:05, 4:07/km → 247
	// rounds the same, so read the choice, not the pace).
	const rows = await listPerformanceResults(userId)
	expect(rows).toHaveLength(2)
	const typed = rows.find((row) => row.event == null)!
	const measured = rows.find((row) => row.event != null)!
	expect(typed.inUse).toBe(true)
	expect(measured).toMatchObject({
		inUse: false,
		event: { id: eventId, name: 'Sentrumsløpet' },
		recording: {
			originPlatform: 'garmin',
			deviceName: 'Garmin Forerunner 265',
		},
	})
	expect((await readEventResultView(userId, eventId))?.stored?.use).toBe(
		'typed-same-day',
	)

	// The typed writer can neither replace nor delete the Event's result.
	expect(await deletePerformanceResult(userId, measured.id)).toBe(false)
	await addPerformanceResult(
		userId,
		{ anchor: '10k', timeSec: 2470, date: RACE_DAY, source: 'race' },
		NOW,
	)
	expect(await eventRow(eventId)).not.toBeNull()

	// Removing the Event's result touches no typed one.
	await unlinkEventResult(userId, eventId)
	expect(await listPerformanceResults(userId)).toEqual([
		expect.objectContaining({ event: null, timeSec: 2470 }),
	])
})

test('a newer result at the anchor takes over, and the Event page says so', async () => {
	const { userId, eventId, sessionId } = await linkedRace()
	await setEventResult(userId, eventId, sessionId)
	expect((await readEventResultView(userId, eventId))?.stored?.use).toBe(
		'in-use',
	)
	await addPerformanceResult(
		userId,
		{ anchor: '10k', timeSec: 2440, date: LATER_DAY, source: 'race' },
		NOW,
	)
	expect((await readEventResultView(userId, eventId))?.stored?.use).toBe(
		'newer',
	)
})

test('a distance that is no Race Anchor is stored at exact metres and resolves no target', async () => {
	const userId = await athlete()
	const ahead = await racePaceSession(userId)
	const event = await race(userId, { distanceM: 7500 })
	const sessionId = await runSession(userId, { at: RACE_START })
	const imported = await importRun(userId, { km: 7.62, seconds: 1862 })
	await promoteToExistingSession(userId, imported.id, sessionId)
	await setEventResult(userId, event.id, sessionId)

	expect(await eventRow(event.id)).toMatchObject({ distanceM: 7500 })
	expect((await readEventResultView(userId, event.id))?.stored?.use).toBe(
		'not-anchor',
	)
	expect((await getDisciplineThresholds(userId)).run?.raceAnchorPaces).toEqual(
		{},
	)
	expect((await planned(ahead)).tss).toBeNull()
})

test("taking back the answer that linked the Recording to the result session (Angre) removes the Event's result", async () => {
	const userId = await athlete()
	const ahead = await racePaceSession(userId)
	const event = await race(userId)
	// No planned session yet, so auto-save stands the Recording up on its own;
	// the athlete then answers "this was my planned race" by hand.
	const imported = await importRun(userId)
	await autoSaveImport(userId, imported.id, 'UTC')
	const sessionId = await runSession(userId, { at: RACE_START })
	const answered = await answerImportQuestion(
		userId,
		imported.id,
		{ kind: 'link', sessionId },
		NOW,
	)
	if (!answered.ok || !answered.undo) throw new Error('expected an Angre')
	await setEventResult(userId, event.id, sessionId)
	expect(await eventRow(event.id)).toMatchObject({
		activityImportId: imported.id,
	})
	expect((await planned(ahead)).tss).not.toBeNull()

	const undone = await undoImportAnswer(userId, answered.undo)

	expect(undone).toMatchObject({ ok: true, undone: true })
	expect(await eventRow(event.id)).toBeNull()
	expect((await planned(ahead)).tss).toBeNull()
})
