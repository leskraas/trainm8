/**
 * One session as the sessions capabilities hand it back after a write: its
 * day, state, length, owner and feeling, in the athlete's timezone.
 */
import { type Prisma } from '@prisma/client'
import { localDate, localTimeOfDay } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sumBlockDurationMin } from '#app/utils/prescribed-duration.ts'
import { sessionOwner } from '#app/utils/session-ownership.ts'
import { getDisciplineThresholds } from '#app/utils/training.server.ts'
import {
	type SessionSnapshot,
	type SessionState,
	type Sport,
} from '../sessions.types.ts'

export const snapshotSelect = {
	id: true,
	scheduledAt: true,
	status: true,
	source: true,
	adoptedAt: true,
	releasedAt: true,
	recordingId: true,
	countsInNoTrack: true,
	replanReason: true,
	sessionLog: { select: { content: true, rpe: true } },
	recording: { select: { discipline: true } },
	workout: {
		select: {
			title: true,
			discipline: true,
			blocks: {
				orderBy: { orderIndex: 'asc' },
				select: {
					repeatCount: true,
					seriesRepeatCount: true,
					betweenSeriesRestSec: true,
					sendOff: true,
					steps: {
						orderBy: { orderIndex: 'asc' },
						select: {
							kind: true,
							discipline: true,
							intensity: true,
							durationSec: true,
							distanceM: true,
						},
					},
				},
			},
		},
	},
} satisfies Prisma.WorkoutSessionSelect

type Row = Prisma.WorkoutSessionGetPayload<{ select: typeof snapshotSelect }>

const SPORTS: readonly string[] = ['run', 'bike', 'swim', 'strength', 'other']

export function stateOf(status: string): SessionState {
	switch (status) {
		case 'completed':
			return 'done'
		case 'missed':
			return 'missed'
		case 'skipped':
			return 'skipped'
		default:
			return 'planned'
	}
}

function sportOf(row: Row): Sport | null {
	const raw = row.workout?.discipline ?? row.recording?.discipline ?? null
	return raw && SPORTS.includes(raw) ? (raw as Sport) : raw ? 'other' : null
}

/**
 * Snapshots of the athlete's sessions with these ids, in the order given.
 * Ids that are not the athlete's (or are gone) are left out.
 */
export async function readSnapshots(
	userId: string,
	ids: readonly string[],
	timezone: string,
): Promise<SessionSnapshot[]> {
	const unique = [...new Set(ids)]
	if (unique.length === 0) return []
	const [rows, thresholds] = await Promise.all([
		prisma.workoutSession.findMany({
			where: { id: { in: unique }, userId },
			select: snapshotSelect,
		}),
		getDisciplineThresholds(userId),
	])
	const byId = new Map(rows.map((row) => [row.id, row]))
	return unique.flatMap((id) => {
		const row = byId.get(id)
		return row ? [toSnapshot(row, timezone, thresholds)] : []
	})
}

export async function readSnapshot(
	userId: string,
	id: string,
	timezone: string,
): Promise<SessionSnapshot | null> {
	return (await readSnapshots(userId, [id], timezone))[0] ?? null
}

function toSnapshot(
	row: Row,
	timezone: string,
	thresholds: Awaited<ReturnType<typeof getDisciplineThresholds>>,
): SessionSnapshot {
	const sport = sportOf(row)
	let minutes: number | null = null
	let why: string | undefined
	if (!row.workout) {
		why = 'Bare et opptak, uten plan.'
	} else if (row.workout.discipline === 'strength') {
		why = 'Styrkeøkter måles i sett, ikke minutter.'
	} else {
		minutes = sumBlockDurationMin(row.workout.blocks, {
			thresholds,
			discipline: row.workout.discipline,
		})
		if (minutes == null) why = 'Økta kan ikke tidfestes fra start til slutt.'
	}
	const note = row.sessionLog?.content?.trim() ? row.sessionLog.content : null
	return {
		id: row.id,
		date: localDate(row.scheduledAt, timezone),
		time: localTimeOfDay(row.scheduledAt, timezone),
		title: row.workout?.title ?? null,
		sport,
		state: stateOf(row.status),
		minutes,
		...(why ? { minutesUnknownBecause: why } : {}),
		owner: sessionOwner(row) === 'athlete' ? 'athlete' : 'plan',
		hasRecording: row.recordingId != null,
		countsTowardPlan: !row.countsInNoTrack,
		changeNote: row.replanReason,
		rpe: row.sessionLog?.rpe ?? null,
		note,
	}
}
