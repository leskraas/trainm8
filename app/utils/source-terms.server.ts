import {
	originPlatformOf,
	type OriginPlatform,
} from '#app/integrations/shared/origin-platform.ts'
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
 * Each import's aliases (ADR 0096 §3) join the set: an upload that duplicates
 * a Strava import is still Strava data.
 */
export async function readRecordedBindingSet(
	athleteId: string,
	window?: { from: Date; to: Date },
): Promise<OriginPlatform[]> {
	const counted = {
		athleteId,
		recordingFor: {
			some: {
				status: 'completed',
				...(window
					? { scheduledAt: { gte: window.from, lte: window.to } }
					: {}),
			},
		},
	}
	const [imports, aliases] = await Promise.all([
		prisma.activityImport.findMany({
			where: counted,
			distinct: ['originPlatform'],
			select: { originPlatform: true },
		}),
		prisma.activityImportAlias.findMany({
			where: { athleteId, activityImport: counted },
			distinct: ['originPlatform'],
			select: { originPlatform: true },
		}),
	])
	return [
		...new Set(
			[...imports, ...aliases].map((row) =>
				originPlatformOf(row.originPlatform),
			),
		),
	]
}
