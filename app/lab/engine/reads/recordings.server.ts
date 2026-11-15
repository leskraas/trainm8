/**
 * `recordings`: what the watch services and uploads brought in, newest
 * first, each with the session it landed on — and whether a history import is
 * still running.
 */
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type CapabilityCtx } from '../define.ts'
import { type RecordingsOutput } from '../reads.types.ts'
import { readSources } from './athlete.server.ts'
import { maybe, sportName, sportOf, whyOf } from './shared.server.ts'

export async function readRecordings(
	ctx: CapabilityCtx,
	{ cursor, limit }: { cursor: string | null; limit: number },
): Promise<RecordingsOutput> {
	const [rows, sources] = await Promise.all([
		prisma.activityImport.findMany({
			where: {
				athleteId: ctx.userId,
				...(cursor ? { startedAt: { lt: new Date(cursor) } } : {}),
			},
			orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
			take: limit + 1,
			select: {
				id: true,
				discipline: true,
				originPlatform: true,
				startedAt: true,
				durationSec: true,
				distanceM: true,
				hrAvg: true,
				hrMax: true,
				powerAvg: true,
				powerWeightedAvg: true,
				paceAvgSecPerKm: true,
				elevationGainM: true,
				tssValue: true,
				aliases: { select: { originPlatform: true } },
				recordingFor: {
					select: { id: true, workoutId: true, source: true },
					take: 1,
				},
			},
		}),
		readSources(ctx),
	])
	const page = rows.slice(0, limit)
	const last = page.at(-1)
	return {
		source: 'athlete',
		recordings: page.map((r) => {
			const session = r.recordingFor[0] ?? null
			return {
				id: r.id,
				from: r.originPlatform,
				startedAt: r.startedAt.toISOString(),
				sport: sportOf(r.discipline),
				sportName: sportName(r.discipline),
				date: localDate(r.startedAt, ctx.timezone),
				durationS: maybe(r.durationSec, whyOf('not-resolved')),
				distanceM: maybe(r.distanceM, 'Ingen distanse i opptaket.'),
				avgHeartRate: maybe(r.hrAvg, 'Ingen puls i opptaket.'),
				maxHeartRate: maybe(r.hrMax, 'Ingen puls i opptaket.'),
				avgPower: maybe(r.powerAvg, 'Ingen watt i opptaket.'),
				normalizedPower: maybe(r.powerWeightedAvg, 'Ingen watt i opptaket.'),
				avgPace: maybe(r.paceAvgSecPerKm, 'Ingen fart i opptaket.'),
				climbM: maybe(r.elevationGainM, 'Ingen høydemeter i opptaket.'),
				load: maybe(r.tssValue, whyOf('not-resolved')),
				sessionId: session?.id ?? null,
				linkedToPlan:
					session != null &&
					session.workoutId != null &&
					session.source !== 'recorded' &&
					session.source !== 'detected',
				alsoFrom: [
					...new Set(
						r.aliases
							.map((a) => a.originPlatform)
							.filter((p) => p !== r.originPlatform),
					),
				],
			}
		}),
		nextCursor:
			rows.length > limit && last ? last.startedAt.toISOString() : null,
		importing: sources.some((s) => s.status === 'importing-history'),
		sources,
	}
}
