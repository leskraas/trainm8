import { expect, test } from 'vitest'
import { localTimeUTC } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	autoSaveImport,
	createActivityImport,
} from './activity-import.server.ts'
import {
	answerImportQuestion,
	undoImportAnswer,
	undoImportLink,
} from './import-link.server.ts'
import {
	buildWeekVolumes,
	type PlanTrackTargets,
	volumeSessionOf,
} from './plan-outline/week-volumes.ts'
import { createSimpleActivitySession } from './simple-activity.server.ts'
import { readSimpleActivity } from './simple-activity.ts'
import { getLedgerWeek } from './training.server.ts'
import { deriveLedgerStatus } from './training.ts'
import { type Discipline } from './workout-schema.ts'
import { markSessionDone } from './workout.server.ts'

// A Simple Activity (ADR 0015 §A, #567) at the server seam: a planned climb,
// a climbing import on `other` that lands the same day, _Gjort_ by hand, and
// the link the athlete makes by hand — never auto-save.

const OSLO = 'Europe/Oslo'
const TUESDAY = '2030-01-15'
const TUESDAY_EVENING = new Date('2030-01-15T20:00:00Z')
const WEEK = '2030-01-14'
const WEDNESDAY_NOON = new Date('2030-01-16T12:00:00Z')

/**
 * The hours track on `other` every Simple Activity shares (spec #558). The
 * start lays it in #572; the week model already reads one.
 */
const SIMPLE_TRACK: PlanTrackTargets = {
	trackId: 'track-other',
	discipline: 'other' as Discipline,
	currency: 'hours',
	targets: [2, 2],
	overridden: [false, false],
	sessionTargets: null,
}

/** The week of Tuesday, read from the ledger rows as home reads them. */
async function weekOf(userId: string, tracks: PlanTrackTargets[]) {
	const sessions = await getLedgerWeek(userId, WEEK, OSLO)
	return buildWeekVolumes({
		weekKey: WEEK,
		todayKey: '2030-01-16',
		planStartWeekKey: '2030-01-07',
		tracks,
		sessions: sessions.map((session) =>
			volumeSessionOf(session, {
				dayKey: '2030-01-15',
				status: deriveLedgerStatus(session, WEDNESDAY_NOON, OSLO),
				thresholds: {},
			}),
		),
	})
}

async function createAthlete() {
	const userData = createUser()
	return (
		await prisma.user.create({
			select: { id: true },
			data: {
				...userData,
				password: { create: createPassword(userData.username) },
				athleteProfile: { create: { timezone: OSLO } },
			},
		})
	).id
}

async function planClimb(userId: string) {
	return createSimpleActivitySession(userId, {
		scheduledAt: localTimeUTC(TUESDAY, '17:00', OSLO),
		activity: { kind: 'climb', effortWord: 'hard', durationMin: 90 },
	})
}

async function importClimb(userId: string, minutes = 75) {
	const startedAt = localTimeUTC(TUESDAY, '17:10', OSLO)
	const imported = await createActivityImport(userId, {
		externalProvider: 'intervalsicu',
		externalId: `${userId}-climb`,
		startedAt,
		endedAt: new Date(startedAt.getTime() + minutes * 60_000),
		durationSec: minutes * 60,
		distanceM: null,
		discipline: 'other',
		rawJson: '{}',
	})
	const saved = await autoSaveImport(userId, imported.id, OSLO)
	if (!saved) throw new Error('auto-save failed')
	return { importId: imported.id, ...saved }
}

async function sessionOf(sessionId: string) {
	return prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: {
			status: true,
			recordingId: true,
			tssValue: true,
			plannedTssValue: true,
			workout: {
				select: {
					discipline: true,
					activityKind: true,
					effortWord: true,
					blocks: {
						select: {
							repeatCount: true,
							seriesRepeatCount: true,
							steps: {
								select: {
									kind: true,
									durationSec: true,
									distanceM: true,
									intensity: true,
								},
							},
						},
					},
				},
			},
		},
	})
}

test('a planned climb is a Simple Activity on other: one timed step, no Intensity Target, no Planned TSS', async () => {
	const userId = await createAthlete()
	const { sessionId } = await planClimb(userId)

	const stored = await sessionOf(sessionId)

	expect(stored.plannedTssValue).toBeNull()
	expect(stored.workout?.discipline).toBe('other')
	expect(readSimpleActivity(stored.workout)).toEqual({
		kind: 'climb',
		effortWord: 'hard',
		durationMin: 90,
	})
})

test('an import on other never links itself to a planned climb; it stands as ekstra', async () => {
	const userId = await createAthlete()
	const { sessionId } = await planClimb(userId)

	const saved = await importClimb(userId)

	expect(saved).toMatchObject({ matchedPlan: false, unsure: false })
	expect(saved.sessionId).not.toBe(sessionId)
	expect(await sessionOf(sessionId)).toMatchObject({
		status: 'scheduled',
		recordingId: null,
	})
})

test('linking it by hand completes the climb with the import, adds no load, and Angre puts it back', async () => {
	const userId = await createAthlete()
	const { sessionId } = await planClimb(userId)
	const saved = await importClimb(userId)

	const answered = await answerImportQuestion(
		userId,
		saved.importId,
		{ kind: 'link', sessionId },
		TUESDAY_EVENING,
	)

	expect(answered).toMatchObject({ ok: true, sessionId })
	expect(await sessionOf(sessionId)).toMatchObject({
		status: 'completed',
		recordingId: saved.importId,
		tssValue: null,
	})
	if (!answered.ok || !answered.undo) throw new Error('expected an Angre')

	const undone = await undoImportAnswer(userId, answered.undo)

	expect(undone).toMatchObject({ ok: true, undone: true })
	expect(await sessionOf(sessionId)).toMatchObject({
		status: 'scheduled',
		recordingId: null,
	})
})

test('Angre kobling lifts a hand link off the climb too', async () => {
	const userId = await createAthlete()
	const { sessionId } = await planClimb(userId)
	const saved = await importClimb(userId)
	await answerImportQuestion(
		userId,
		saved.importId,
		{ kind: 'link', sessionId },
		TUESDAY_EVENING,
	)

	const lifted = await undoImportLink(userId, saved.importId, TUESDAY_EVENING)

	expect(lifted.ok).toBe(true)
	expect(await sessionOf(sessionId)).toMatchObject({
		status: 'scheduled',
		recordingId: null,
	})
})

test('a run import may not be linked by hand to a planned climb', async () => {
	const userId = await createAthlete()
	const { sessionId } = await planClimb(userId)
	const startedAt = localTimeUTC(TUESDAY, '07:00', OSLO)
	const run = await createActivityImport(userId, {
		externalProvider: 'intervalsicu',
		externalId: `${userId}-run`,
		startedAt,
		endedAt: new Date(startedAt.getTime() + 3_000_000),
		durationSec: 3000,
		distanceM: 10_000,
		discipline: 'run',
		rawJson: '{}',
	})
	await autoSaveImport(userId, run.id, OSLO)

	expect(
		await answerImportQuestion(userId, run.id, { kind: 'link', sessionId }),
	).toEqual({ ok: false, reason: 'not-a-fit' })
})

test('Gjort by hand completes a planned climb with no Recording and no load', async () => {
	const userId = await createAthlete()
	const { sessionId } = await planClimb(userId)

	const marked = await markSessionDone(userId, sessionId, {
		now: TUESDAY_EVENING,
		timezone: OSLO,
	})

	expect(marked.ok).toBe(true)
	expect(await sessionOf(sessionId)).toMatchObject({
		status: 'completed',
		recordingId: null,
		tssValue: null,
	})
})

test('the week counts a planned climb in hours, Gjort as its planned minutes, and a linked import by its own duration', async () => {
	const userId = await createAthlete()
	const { sessionId } = await planClimb(userId)

	const planned = (await weekOf(userId, [SIMPLE_TRACK])).tracks[0]!
	expect(planned).toMatchObject({ planned: 1.5, actual: 0 })

	await markSessionDone(userId, sessionId, {
		now: TUESDAY_EVENING,
		timezone: OSLO,
	})
	const byHand = await weekOf(userId, [SIMPLE_TRACK])
	expect(byHand.tracks[0]).toMatchObject({ planned: 1.5, actual: 1.5 })
	expect(byHand.other).toBeNull()

	const saved = await importClimb(userId, 60)
	await answerImportQuestion(userId, saved.importId, {
		kind: 'link',
		sessionId,
	})
	const linked = await weekOf(userId, [SIMPLE_TRACK])
	expect(linked.tracks[0]).toMatchObject({ planned: 1.5, actual: 1 })
})

test('with no track on other, a planned climb is apart as no track, and an unlinked import on other as Annet', async () => {
	const userId = await createAthlete()
	await planClimb(userId)
	await importClimb(userId)
	const runTrack: PlanTrackTargets = {
		...SIMPLE_TRACK,
		trackId: 'track-run',
		discipline: 'run',
		currency: 'km',
		targets: [40, 40],
	}

	const week = await weekOf(userId, [runTrack])

	expect(week.tracks[0]).toMatchObject({ planned: 0, actual: 0 })
	expect(week.other?.byReason).toEqual([
		{ reason: 'other-discipline', count: 1 },
		{ reason: 'no-track', count: 1 },
	])
})
