/**
 * A small, fixed training world for the action registry's tests (#553): one
 * athlete in UTC with a Garmin-recorded run, a Strava-recorded ride and a
 * planned run, a Session Log, a little load history, and helpers to make a
 * caller's context. The clock is fixed at {@link NOW} (a Wednesday), so every
 * day the reads compute is known.
 */

import { type ActionCtx } from '#app/actions/define.ts'
import { type Caller, type Scope } from '#app/actions/vocabulary.ts'
import { addDays } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from './db-utils.ts'

/** Wednesday 21 October 2026, noon UTC. */
export const NOW = new Date('2026-10-21T12:00:00.000Z')
export const TODAY = '2026-10-21'
export const YESTERDAY = '2026-10-20'
export const ORIGIN = 'http://localhost:3000'

export async function createAthlete() {
	const user = await prisma.user.create({
		data: {
			...createUser(),
			athleteProfile: { create: { timezone: 'UTC' } },
		},
		select: { id: true, username: true },
	})
	return user
}

export function ctxFor(
	userId: string,
	caller: Caller,
	scopes?: readonly Scope[],
): ActionCtx {
	return {
		userId,
		caller,
		now: NOW,
		timezone: 'UTC',
		origin: ORIGIN,
		...(scopes
			? { scopes }
			: caller === 'web'
				? {}
				: { scopes: ['training:read'] }),
	}
}

async function workout(
	ownerId: string,
	{
		title,
		discipline,
		durationSec,
	}: { title: string; discipline: string; durationSec: number },
) {
	return prisma.workout.create({
		data: {
			title,
			discipline,
			intent: 'endurance',
			ownerId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{ orderIndex: 0, kind: 'cardio', discipline, durationSec },
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
}

let importSeq = 0

export async function recording(
	athleteId: string,
	{
		originPlatform,
		startedAt,
		discipline = 'run',
		durationSec = 3500,
		distanceM = 10_000 as number | null,
		deviceName = null as string | null,
		aliases = [] as string[],
	}: {
		originPlatform: string
		startedAt: Date
		discipline?: string
		durationSec?: number
		distanceM?: number | null
		deviceName?: string | null
		aliases?: string[]
	},
) {
	importSeq += 1
	return prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider: 'intervalsicu',
			externalId: `i${importSeq}-${Math.random().toString(36).slice(2)}`,
			originPlatform,
			deviceName,
			startedAt,
			endedAt: new Date(startedAt.getTime() + durationSec * 1000),
			durationSec,
			distanceM,
			discipline,
			// Provider text that must never reach a model.
			rawJson: JSON.stringify({ name: 'PROVIDER ACTIVITY NAME' }),
			aliases: {
				create: aliases.map((platform, i) => ({
					athleteId,
					externalProvider: 'upload',
					externalId: `a${importSeq}-${i}`,
					originPlatform: platform,
					matchedBy: 'fit-key',
				})),
			},
		},
		select: { id: true },
	})
}

/**
 * The world: a Garmin run yesterday (the athlete's own, logged), a Strava ride
 * this morning (recording-only), a planned run this evening (the machine's),
 * and load snapshots for the last ten days.
 */
export async function createWorld() {
	const athlete = await createAthlete()
	const userId = athlete.id

	const garminRun = await workout(userId, {
		title: 'Min tirsdagstur',
		discipline: 'run',
		durationSec: 3600,
	})
	const garminImport = await recording(userId, {
		originPlatform: 'garmin',
		deviceName: 'Garmin Forerunner 965',
		startedAt: new Date(`${YESTERDAY}T07:00:00.000Z`),
	})
	const run = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: garminRun.id,
			recordingId: garminImport.id,
			scheduledAt: new Date(`${YESTERDAY}T07:00:00.000Z`),
			status: 'completed',
			source: 'authored',
			tssValue: 60,
			plannedTssValue: 55,
			sessionLog: { create: { content: 'Tunge bein, men fin tur.', rpe: 6 } },
		},
		select: { id: true },
	})

	const stravaImport = await recording(userId, {
		originPlatform: 'strava',
		discipline: 'bike',
		durationSec: 5400,
		distanceM: 40_000,
		startedAt: new Date(`${TODAY}T07:00:00.000Z`),
	})
	const ride = await prisma.workoutSession.create({
		data: {
			userId,
			recordingId: stravaImport.id,
			scheduledAt: new Date(`${TODAY}T07:00:00.000Z`),
			status: 'completed',
			source: 'recorded',
			tssValue: 80,
		},
		select: { id: true },
	})

	const eveningRun = await workout(userId, {
		title: 'Rolig tur',
		discipline: 'run',
		durationSec: 1800,
	})
	const planned = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: eveningRun.id,
			scheduledAt: new Date(`${TODAY}T18:00:00.000Z`),
			status: 'scheduled',
			source: 'generated',
			plannedTssValue: 30,
		},
		select: { id: true },
	})

	for (let i = 9; i >= 0; i--) {
		await prisma.loadSnapshot.create({
			data: {
				athleteId: userId,
				date: addDays(TODAY, -i),
				tssTotal: i === 1 ? 60 : 0,
				ctl: 20 + i,
				atl: 30 + i,
				tsb: -10,
			},
		})
	}

	return {
		userId,
		username: athlete.username,
		run: run.id,
		ride: ride.id,
		planned: planned.id,
	}
}

/** An athlete whose only recording is Garmin's: every number may reach a model, with credit. */
export async function createGarminOnlyAthlete() {
	const athlete = await createAthlete()
	const userId = athlete.id
	const w = await workout(userId, {
		title: 'Terskel',
		discipline: 'run',
		durationSec: 3600,
	})
	const imp = await recording(userId, {
		originPlatform: 'garmin',
		startedAt: new Date(`${YESTERDAY}T07:00:00.000Z`),
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: w.id,
			recordingId: imp.id,
			scheduledAt: new Date(`${YESTERDAY}T07:00:00.000Z`),
			status: 'completed',
			source: 'generated',
			tssValue: 60,
			plannedTssValue: 55,
		},
		select: { id: true },
	})
	await prisma.loadSnapshot.create({
		data: {
			athleteId: userId,
			date: TODAY,
			tssTotal: 0,
			ctl: 40,
			atl: 50,
			tsb: -8,
		},
	})
	return { userId, session: session.id }
}
