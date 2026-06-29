// Server query backing the Cockpit Proof strip (#134). Surfaces the athlete's
// current Personal Records by feeding their qualifying efforts through the pure
// `detectPersonalRecords`. The query side stays thin — all the detection rules
// (trust gating, per-discipline scoping, previous-best/delta) live in the pure
// function so they're unit-testable without a database.

import { prisma } from './db.server.ts'
import {
	detectPersonalRecords,
	type EffortConfidence,
	type PersonalRecord,
	type PrEffort,
} from './personal-records.ts'

/**
 * The athlete's current Personal Records. Efforts are completed Workout Sessions
 * backed by a Recording — i.e. a promoted Activity Import (#134): the Recording
 * carries the achieved telemetry (discipline + distance) and the session is the
 * achieving session, supplying the date and the Load Confidence trust gate.
 *
 * Hand-logged sessions (no Recording) carry no achieved distance and are simply
 * absent from this query; the trust gate (confidence) is enforced in the pure
 * detector, so a recording whose load is low/unavailable confidence is dropped
 * there rather than here.
 */
export async function getPersonalRecords(
	userId: string,
): Promise<PersonalRecord[]> {
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, status: 'completed', recordingId: { not: null } },
		select: {
			id: true,
			scheduledAt: true,
			tssConfidence: true,
			recording: {
				select: { discipline: true, distanceM: true, tssConfidence: true },
			},
		},
	})

	const efforts: PrEffort[] = sessions.flatMap((session) =>
		session.recording
			? [
					{
						sessionId: session.id,
						discipline: session.recording.discipline,
						distanceM: session.recording.distanceM,
						achievedAt: session.scheduledAt,
						// The session is the load contribution (ADR 0008), so its
						// confidence is canonical; fall back to the Recording's own.
						confidence: (session.tssConfidence ??
							session.recording.tssConfidence) as EffortConfidence,
					},
				]
			: [],
	)

	return detectPersonalRecords(efforts)
}
