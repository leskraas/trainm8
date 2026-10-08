import { expect, test } from 'vitest'
import {
	addDays,
	localTimeUTC,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	autoSaveImport,
	createActivityImport,
} from './activity-import.server.ts'
import {
	answerImportQuestion,
	redoImportLink,
	undoImportLink,
} from './import-link.server.ts'
import { getClosedWeekAdherence } from './load/week-replan.server.ts'
import { createPlanOutline } from './plan-outline/authoring.server.ts'
import { getWeekVolumes } from './plan-outline/week-volumes.server.ts'
import { markSessionDone } from './workout.server.ts'

// Imports on I dag (#505 stories 78–82), at the server seam: an activity
// lands, auto-save links it or stands it up as _ekstra_, and the athlete's
// answers — "hva var dette?", Angre kobling, Koble igjen — move it, with the
// week's three numbers following.
//
// A run plan in km opens Monday 7 Jan 2030. The week read is its second
// (14 Jan); the clock is Thursday 17 Jan, so Monday to Wednesday are past.

const OSLO = 'Europe/Oslo'
const WEEK = '2030-01-14'
const TUESDAY = '2030-01-15'
const THURSDAY = new Date('2030-01-17T12:00:00Z')

async function createAthlete() {
	const userData = createUser()
	return (
		await prisma.user.create({
			select: { id: true },
			data: {
				...userData,
				password: { create: createPassword(userData.username) },
				athleteProfile: {
					create: { timezone: OSLO, defaultTrainingTime: '07:00' },
				},
			},
		})
	).id
}

async function setUp() {
	const userId = await createAthlete()
	const created = await createPlanOutline(
		userId,
		{
			startWeekKey: '2030-01-07',
			structure: { phases: [{ name: 'Blokk 1', weeks: 4, rhythm: '3:1' }] },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
		},
		new Date('2030-01-02T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	return userId
}

async function planRun(
	userId: string,
	{ date = TUESDAY, km = 10, time = '07:00' } = {},
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title: `${km} km rolig`,
			discipline: 'run',
			intent: 'endurance',
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
									distanceM: km * 1000,
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
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: localTimeUTC(date, time, OSLO),
			source: 'generated',
		},
	})
}

async function importRun(
	userId: string,
	{ date = TUESDAY, km = 10.5, discipline = 'run' } = {},
) {
	const startedAt = localTimeUTC(date, '07:30', OSLO)
	const imported = await createActivityImport(userId, {
		externalProvider: 'intervalsicu',
		externalId: `${userId}-${date}-${km}`,
		startedAt,
		endedAt: new Date(startedAt.getTime() + km * 300_000),
		durationSec: km * 300,
		distanceM: km * 1000,
		discipline,
		rawJson: '{}',
	})
	const saved = await autoSaveImport(userId, imported.id, OSLO)
	if (!saved) throw new Error('auto-save failed')
	return { importId: imported.id, ...saved }
}

async function runWeek(userId: string) {
	const { tracks, other } = await getWeekVolumes(userId, {
		weekKey: WEEK,
		now: THURSDAY,
	})
	return { run: tracks[0]!, other }
}

async function statusOf(sessionId: string) {
	return await prisma.workoutSession.findUnique({
		where: { id: sessionId },
		select: { status: true, recordingId: true },
	})
}

test('an import that fits the plan links itself, and the week counts it as the planned run done', async () => {
	const userId = await setUp()
	const plan = await planRun(userId)

	const saved = await importRun(userId)

	expect(saved).toMatchObject({ sessionId: plan.id, matchedPlan: true })
	const { run } = await runWeek(userId)
	expect(run).toMatchObject({ planned: 10, actual: 10.5 })
	expect(run.grade).toMatchObject({ status: 'on', reference: 10 })
})

test('Angre kobling and Koble igjen: a round trip the week follows', async () => {
	const userId = await setUp()
	const plan = await planRun(userId)
	const { importId } = await importRun(userId)

	const undone = await undoImportLink(userId, importId, THURSDAY)

	// The run stands on its own as ekstra; the plan is back to not done.
	expect(undone.ok).toBe(true)
	if (!undone.ok) return
	expect(undone.sessionId).not.toBe(plan.id)
	expect(await statusOf(plan.id)).toEqual({
		status: 'scheduled',
		recordingId: null,
	})
	const ekstra = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: undone.sessionId },
		select: { source: true, status: true, recordingId: true },
	})
	expect(ekstra).toEqual({
		source: 'recorded',
		status: 'completed',
		recordingId: importId,
	})
	// The km still happened, but the planned run reads as missed now.
	const apart = await runWeek(userId)
	expect(apart.run).toMatchObject({ planned: 10, actual: 10.5 })
	expect(apart.run.grade).toMatchObject({ status: 'under', actual: 0 })

	const redone = await redoImportLink(userId, importId, THURSDAY)

	expect(redone).toEqual({ ok: true, sessionId: plan.id })
	expect(await statusOf(plan.id)).toEqual({
		status: 'completed',
		recordingId: importId,
	})
	// The ekstra shell went with the link.
	expect(
		await prisma.workoutSession.findUnique({ where: { id: undone.sessionId } }),
	).toBeNull()
	const together = await runWeek(userId)
	expect(together.run.grade).toMatchObject({ status: 'on', actual: 10.5 })
	// Nothing left to put back.
	expect(await redoImportLink(userId, importId, THURSDAY)).toEqual({
		ok: false,
		reason: 'nothing-to-relink',
	})
})

test('hva var dette? — linking it to one of two planned runs takes that one and leaves the other', async () => {
	const userId = await setUp()
	const morning = await planRun(userId, { km: 10, time: '07:00' })
	const evening = await planRun(userId, { km: 6, time: '18:00' })
	const saved = await importRun(userId)
	expect(saved).toMatchObject({ matchedPlan: false, unsure: true })

	const answered = await answerImportQuestion(
		userId,
		saved.importId,
		{ kind: 'link', sessionId: evening.id },
		THURSDAY,
	)

	expect(answered).toEqual({ ok: true, sessionId: evening.id })
	expect(await statusOf(evening.id)).toEqual({
		status: 'completed',
		recordingId: saved.importId,
	})
	expect(await statusOf(morning.id)).toEqual({
		status: 'scheduled',
		recordingId: null,
	})
	const stored = await prisma.activityImport.findUniqueOrThrow({
		where: { id: saved.importId },
		select: { linkAnsweredAt: true },
	})
	expect(stored.linkAnsweredAt).toEqual(THURSDAY)
})

test('hva var dette? — keeping it as ekstra moves nothing; Annet takes it out of the track', async () => {
	const userId = await setUp()
	await planRun(userId, { km: 10, time: '07:00' })
	await planRun(userId, { km: 6, time: '18:00' })
	const kept = await importRun(userId, { km: 5 })
	const commute = await importRun(userId, { km: 4 })
	const before = await runWeek(userId)
	expect(before.run.actual).toBe(9)

	expect(
		await answerImportQuestion(userId, kept.importId, { kind: 'keep' }),
	).toEqual({ ok: true, sessionId: kept.sessionId })
	expect(
		await answerImportQuestion(userId, commute.importId, { kind: 'annet' }),
	).toEqual({ ok: true, sessionId: commute.sessionId })

	const after = await runWeek(userId)
	expect(after.run.actual).toBe(5)
	expect(after.other).toMatchObject({
		byReason: [{ reason: 'athlete-choice', count: 1 }],
	})
	const answered = await prisma.activityImport.findMany({
		where: { id: { in: [kept.importId, commute.importId] } },
		select: { linkAnsweredAt: true },
	})
	expect(answered.every((row) => row.linkAnsweredAt != null)).toBe(true)
})

test('Gjort by hand: the import links onto it later, and undoing that link keeps it done', async () => {
	const userId = await setUp()
	const plan = await planRun(userId)

	expect(
		await markSessionDone(userId, plan.id, { now: THURSDAY, timezone: OSLO }),
	).toEqual({ ok: true })
	// Done, but no numbers yet: counted apart as done without km, never as 0.
	expect((await runWeek(userId)).run).toMatchObject({
		actual: null,
		actualUnmeasuredCount: 1,
	})

	const { importId, matchedPlan } = await importRun(userId)
	expect(matchedPlan).toBe(true)
	expect((await runWeek(userId)).run.actual).toBe(10.5)

	await undoImportLink(userId, importId, THURSDAY)
	expect(await statusOf(plan.id)).toEqual({
		status: 'completed',
		recordingId: null,
	})
})

test('Gjort refuses a session whose day has not begun, and one already done', async () => {
	const userId = await setUp()
	const saturday = await planRun(userId, { date: '2030-01-19' })
	const tuesday = await planRun(userId)

	expect(
		await markSessionDone(userId, saturday.id, {
			now: THURSDAY,
			timezone: OSLO,
		}),
	).toEqual({ ok: false, reason: 'not-markable' })
	await markSessionDone(userId, tuesday.id, { now: THURSDAY, timezone: OSLO })
	expect(
		await markSessionDone(userId, tuesday.id, {
			now: THURSDAY,
			timezone: OSLO,
		}),
	).toEqual({ ok: false, reason: 'not-markable' })
})

test('another athlete is refused every answer, and nothing moves', async () => {
	const userId = await setUp()
	const plan = await planRun(userId)
	const { importId } = await importRun(userId)
	const strangerId = await createAthlete()
	const strangersPlan = await planRun(strangerId)

	expect(await undoImportLink(strangerId, importId)).toEqual({
		ok: false,
		reason: 'import-not-found',
	})
	expect(await redoImportLink(strangerId, importId)).toEqual({
		ok: false,
		reason: 'import-not-found',
	})
	expect(
		await answerImportQuestion(strangerId, importId, { kind: 'keep' }),
	).toEqual({ ok: false, reason: 'import-not-found' })
	expect(
		await markSessionDone(strangerId, plan.id, {
			now: THURSDAY,
			timezone: OSLO,
		}),
	).toEqual({ ok: false, reason: 'session-not-found' })
	// Nor may the athlete link their import onto someone else's session.
	await undoImportLink(userId, importId)
	expect(
		await answerImportQuestion(userId, importId, {
			kind: 'link',
			sessionId: strangersPlan.id,
		}),
	).toEqual({ ok: false, reason: 'session-not-found' })
	expect(await statusOf(strangersPlan.id)).toEqual({
		status: 'scheduled',
		recordingId: null,
	})
})

test('Angre kobling leaves no TSS behind: the week’s adherence and volumes count the run once', async () => {
	// Real past dates: the load recompute prices days up to today only.
	const userId = await createAthlete()
	await prisma.athleteProfile.update({
		where: { userId },
		data: {
			timezone: 'UTC',
			disciplineProfiles: { create: [{ discipline: 'run', lthr: 160 }] },
		},
	})
	const now = new Date()
	const thisMonday = weekMonday(now, 'UTC')
	const weekKey = addDays(thisMonday, -7)
	const created = await createPlanOutline(
		userId,
		{
			startWeekKey: weekKey,
			structure: { phases: [{ name: 'Blokk 1', weeks: 4, rhythm: '3:1' }] },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
		},
		new Date(`${addDays(weekKey, -5)}T12:00:00Z`),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	const tuesday = addDays(weekKey, 1)
	const plan = await planRun(userId, { date: tuesday })
	await prisma.workoutSession.update({
		where: { id: plan.id },
		data: { plannedTssValue: 60 },
	})
	const startedAt = localTimeUTC(tuesday, '07:30', 'UTC')
	const imported = await createActivityImport(userId, {
		externalProvider: 'intervalsicu',
		externalId: `${userId}-adherence`,
		startedAt,
		endedAt: new Date(startedAt.getTime() + 3000_000),
		durationSec: 3000,
		distanceM: 10_500,
		discipline: 'run',
		hrAvg: 150,
		rawJson: '{}',
	})
	await autoSaveImport(userId, imported.id, 'UTC')

	const read = async () => {
		const sessions = await prisma.workoutSession.findMany({
			where: { userId },
			select: { tssValue: true },
		})
		const volumes = await getWeekVolumes(userId, { weekKey, now })
		return {
			adherence: await getClosedWeekAdherence(userId, weekKey, 'UTC'),
			tssOnSessions: sessions.reduce((sum, s) => sum + (s.tssValue ?? 0), 0),
			actualKm: volumes.tracks[0]!.actual,
		}
	}

	const linked = await read()
	expect(linked.adherence).toMatchObject({ sessionCount: 1, totalPlanned: 60 })
	const runTss = linked.adherence!.totalActual
	expect(runTss).toBeGreaterThan(0)
	expect(linked.tssOnSessions).toBeCloseTo(runTss)
	expect(linked.actualKm).toBe(10.5)

	await undoImportLink(userId, imported.id)

	// The planned run was not done after all: nothing to compare, and its
	// old TSS does not linger beside the ekstra that now carries it.
	const apart = await read()
	expect(apart.adherence).toBeNull()
	expect(apart.tssOnSessions).toBeCloseTo(runTss)
	expect(apart.actualKm).toBe(10.5)
	expect(
		await prisma.workoutSession.findUniqueOrThrow({
			where: { id: plan.id },
			select: { status: true, tssValue: true, tssFormula: true },
		}),
	).toEqual({ status: 'scheduled', tssValue: null, tssFormula: null })

	await redoImportLink(userId, imported.id)

	const together = await read()
	expect(together.adherence).toMatchObject({ sessionCount: 1 })
	expect(together.adherence!.totalActual).toBeCloseTo(runTss)
	expect(together.tssOnSessions).toBeCloseTo(runTss)
})

test('undo restores the status the session had before the link', async () => {
	const userId = await setUp()
	const plan = await planRun(userId)
	await prisma.workoutSession.update({
		where: { id: plan.id },
		data: { status: 'missed' },
	})
	const { importId } = await importRun(userId)
	expect(await statusOf(plan.id)).toEqual({
		status: 'completed',
		recordingId: importId,
	})

	await undoImportLink(userId, importId, THURSDAY)

	// The athlete had said it was missed; the run was not it.
	expect(await statusOf(plan.id)).toEqual({
		status: 'missed',
		recordingId: null,
	})
})

test('linking away from an adopted ekstra keeps it done', async () => {
	const userId = await setUp()
	const { importId, sessionId: ekstraId } = await importRun(userId)
	// The athlete corrected the detected structure: the session is theirs now.
	await prisma.workoutSession.update({
		where: { id: ekstraId },
		data: { source: 'detected', adoptedAt: THURSDAY },
	})
	const plan = await planRun(userId, { time: '18:00' })

	const answered = await answerImportQuestion(
		userId,
		importId,
		{ kind: 'link', sessionId: plan.id },
		THURSDAY,
	)

	expect(answered).toEqual({ ok: true, sessionId: plan.id })
	expect(await statusOf(ekstraId)).toEqual({
		status: 'completed',
		recordingId: null,
	})
})

test('a link answer must name a session the import fits', async () => {
	const userId = await setUp()
	const { importId } = await importRun(userId)
	// Another day, and another sport that day: neither fits.
	const wednesday = await planRun(userId, { date: '2030-01-16' })
	const bike = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title: 'Sykkel',
			discipline: 'bike',
			intent: 'endurance',
		},
	})
	const ride = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId: bike.id,
			scheduledAt: localTimeUTC(TUESDAY, '18:00', OSLO),
		},
	})

	for (const sessionId of [wednesday.id, ride.id]) {
		expect(
			await answerImportQuestion(userId, importId, {
				kind: 'link',
				sessionId,
			}),
		).toEqual({ ok: false, reason: 'not-a-fit' })
	}
	expect(await statusOf(wednesday.id)).toEqual({
		status: 'scheduled',
		recordingId: null,
	})
})
