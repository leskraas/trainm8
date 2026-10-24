import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	parseFit,
	type ParsedFitSession,
} from '#app/utils/fit-parser.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import {
	readCtlByDate,
	recordLoadRecomputeNotice,
} from './recompute-notice.server.ts'
import {
	type CtlMovement,
	type LoadRecomputeKind,
	widestCtlMovement,
} from './recompute-notice.ts'
import { recomputeLoadFrom } from './snapshot.server.ts'

/**
 * One-shot data correction for #628 (ADR 0107): before #628, `parseFit` read a
 * pool swim's pace over its timer time, which counts the rest at the wall as
 * swimming, and sTSS priced that slow pace. Swims parsed since read the pace
 * over their active lengths. This re-reads every kept FIT for the swims parsed
 * before, writes the pace swum onto the import, recomputes load from the
 * athlete's earliest corrected swim, and leaves a **Load Recompute Notice**.
 *
 * **Which swims (ADR 0107 §1).** Only a swim whose stored pace is the one the
 * old parser read from the FIT kept beside it. That is exact rather than a
 * guess at provenance: an upload, a mirror a FIT refreshed (ADR 0096 §6) and a
 * vendor FIT all match; a Strava or Intervals.icu swim stores the provider's
 * own moving pace and has either no file or one whose timer pace it does not
 * equal, so it is left as the provider read it. No request goes out, so no
 * rate limit is spent (the TCX stream heal's shape, ADR 0036).
 *
 * **A Recording the athlete has built on is corrected too.** ADR 0012 and 0049
 * make history immutable to *source-side* changes. This is not one: the bytes
 * are the ones already kept, and the number was trainm8's misreading of them.
 *
 * Retry-safe: a swim already carrying the pace swum still counts as corrected,
 * so a crash between writing paces and recomputing is healed by the retry, and
 * the notice is create-only, so the first run's `ctlBefore` stands.
 */
export const SWIM_PACE_BACKFILL_JOB_KIND = 'swim-pace-backfill'

/** The `LoadRecomputeNotice.kind` this backfill writes. */
export const SWIM_REST_LEFT_THE_PACE_NOTICE: LoadRecomputeKind =
	'swim-rest-left-the-pace'

/** Two paces are the same reading to within float noise (sec/km). */
const SAME_PACE = 1e-6

/** A leg belongs to the import that starts within this of it. */
const LEG_START_TOLERANCE_MS = 60_000

/**
 * The pace swum for a stored swim, when the stored pace is the timer pace the
 * old parser read from these legs and the lengths read a different one; null
 * otherwise. `startedAt` picks the leg of a multisport file.
 */
export function swimPaceCorrection(
	storedPace: number | null,
	legs: ParsedFitSession[],
	startedAt?: Date,
): number | null {
	if (storedPace == null) return null
	for (const { activity } of legs) {
		if (
			startedAt &&
			Math.abs(activity.startedAt.getTime() - startedAt.getTime()) >
				LEG_START_TOLERANCE_MS
		) {
			continue
		}
		const { distanceM, durationSec, paceAvgSecPerKm: swum } = activity
		if (activity.discipline !== 'swim') continue
		if (distanceM == null || !(distanceM > 0) || swum == null) continue
		const timerPace = durationSec / (distanceM / 1000)
		if (Math.abs(storedPace - timerPace) > SAME_PACE) continue
		if (Math.abs(swum - timerPace) <= SAME_PACE) return null
		return swum
	}
	return null
}

/**
 * Whether the stored pace is already the pace swum on one of these legs: a swim
 * a run before this one corrected, which still needs its load recomputed.
 */
function alreadySwum(
	storedPace: number | null,
	legs: ParsedFitSession[],
): boolean {
	if (storedPace == null) return false
	return legs.some(({ activity }) => {
		const { distanceM, durationSec, paceAvgSecPerKm: swum } = activity
		if (swum == null || distanceM == null || !(distanceM > 0)) return false
		const timerPace = durationSec / (distanceM / 1000)
		return (
			Math.abs(swum - timerPace) > SAME_PACE &&
			Math.abs(storedPace - swum) <= SAME_PACE
		)
	})
}

/**
 * Enqueue the one-shot swim recompute if it has never been enqueued. Any job of
 * this kind, in any state, means boot does not enqueue another.
 */
export async function ensureSwimPaceBackfillEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: SWIM_PACE_BACKFILL_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: SWIM_PACE_BACKFILL_JOB_KIND })
}

type Correction = { importId: string; startedAt: Date; pace: number | null }

/**
 * The swims to correct, by athlete. Reads one file at a time: the bytes are
 * the heavy column, and a history can hold hundreds of swims.
 */
async function findCorrections(): Promise<Map<string, Correction[]>> {
	const swims = await prisma.activityImport.findMany({
		where: { discipline: 'swim', originalFile: { isNot: null } },
		select: {
			id: true,
			athleteId: true,
			startedAt: true,
			paceAvgSecPerKm: true,
		},
	})

	const byAthlete = new Map<string, Correction[]>()
	for (const swim of swims) {
		const file = await prisma.activityFile.findUnique({
			where: { activityImportId: swim.id },
			select: { format: true, bytes: true },
		})
		if (file?.format !== 'fit') continue

		let legs: ParsedFitSession[]
		try {
			legs = parseFit(file.bytes).sessions
		} catch (err) {
			// A kept FIT the parser cannot read (the harvest keeps those for a
			// later parser): nothing to re-read, so nothing to correct.
			console.error(`swim pace backfill: FIT of ${swim.id} did not parse`, err)
			continue
		}
		const pace = swimPaceCorrection(swim.paceAvgSecPerKm, legs, swim.startedAt)
		if (pace == null && !alreadySwum(swim.paceAvgSecPerKm, legs)) continue

		const list = byAthlete.get(swim.athleteId) ?? []
		list.push({ importId: swim.id, startedAt: swim.startedAt, pace })
		byAthlete.set(swim.athleteId, list)
	}
	return byAthlete
}

/** Today's CTL on both sides: the movement of a recompute that moved none. */
function latestCtl(ctlByDate: Map<string, number>): CtlMovement {
	const latest = [...ctlByDate.keys()].sort().at(-1)
	const ctl = latest ? ctlByDate.get(latest)! : 0
	return { ctlBefore: ctl, ctlAfter: ctl }
}

/**
 * Correct every swim `findCorrections` names, athlete by athlete: write the
 * pace swum, recompute load from the earliest corrected swim's day, and leave
 * one notice naming the widest CTL rise.
 */
export async function runSwimPaceBackfill(): Promise<void> {
	for (const [athleteId, corrections] of await findCorrections()) {
		const profile = await prisma.athleteProfile.findUnique({
			where: { userId: athleteId },
			select: { timezone: true },
		})

		const before = await readCtlByDate(athleteId)
		const toWrite = corrections.filter((c) => c.pace != null)
		await prisma.$transaction(
			toWrite.map((c) =>
				prisma.activityImport.update({
					where: { id: c.importId },
					data: { paceAvgSecPerKm: c.pace },
				}),
			),
		)
		// A retry that wrote nothing new still recomputes (a crash may have left
		// the paces ahead of the load). No Athlete Profile → no thresholds →
		// nothing to recompute.
		if (profile) {
			const earliest = corrections.reduce(
				(min, c) => (c.startedAt < min ? c.startedAt : min),
				corrections[0]!.startedAt,
			)
			await recomputeLoadFrom(athleteId, localDate(earliest, profile.timezone))
		}
		// The pace on each corrected swim is a number the athlete read, so the
		// notice is owed even when CTL moved too little to show (no CSS, or a
		// lone swim); the line then leaves its movement out (ADR 0107 §2). A retry
		// that wrote no pace still owes it when a crash came before the notice;
		// the notice is create-only, so one already written stands.
		const after = await readCtlByDate(athleteId)
		await recordLoadRecomputeNotice({
			athleteId,
			kind: SWIM_REST_LEFT_THE_PACE_NOTICE,
			...(widestCtlMovement(before, after, 'rise') ?? latestCtl(after)),
		})
	}
}
