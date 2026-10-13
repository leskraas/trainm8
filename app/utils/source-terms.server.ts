import { prisma } from './db.server.ts'

/**
 * The **binding set** of anything computed from an athlete's recorded training
 * (ADR 0098 §1): the Origin Platform of every import that is the Recording of
 * a completed session — the sessions the load model, the coach's verdict, the
 * Personal Records and the first run's findings read.
 *
 * Without a window it is the whole history, which is what CTL/ATL/TSB read:
 * the load curve runs forward from the first snapshot, so every counted
 * session is in its input (an old one fades, but over-attributing is harmless
 * and under-attributing breaches terms). With one, it is the sessions
 * scheduled inside it.
 *
 * Aliases (ADR 0096 §3) join the set when #547 adds them.
 */
export async function readRecordedBindingSet(
	athleteId: string,
	window?: { from: Date; to: Date },
): Promise<string[]> {
	const rows = await prisma.activityImport.findMany({
		where: {
			athleteId,
			recordingFor: {
				some: {
					status: 'completed',
					...(window
						? { scheduledAt: { gte: window.from, lte: window.to } }
						: {}),
				},
			},
		},
		distinct: ['originPlatform'],
		select: { originPlatform: true },
	})
	return rows.map((row) => row.originPlatform)
}
