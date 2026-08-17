import { parseStoredStream } from '../activity-stream.ts'
import { prisma } from '../db.server.ts'
import { CARDIO_DISCIPLINES, type CardioDiscipline } from '../workout-schema.ts'
import { ANALYSIS_WINDOW_DAYS } from './constants.ts'
import { type AnalysisActivity, estimateProfile } from './estimate.ts'
import { type SampledChannel } from './mean-maximal.ts'
import {
	CONSTRUCT_COLUMN,
	CONSTRUCT_EVENT_KIND,
	type ThresholdConstruct,
	type ThresholdEstimate,
} from './types.ts'

/**
 * **Profile Analysis**, the database half: assemble the athlete's own history
 * into the pure engine's input, and write an estimate the athlete has accepted.
 *
 * The split is the same one `plan-generation` holds. `estimate.ts` cannot query
 * and reads no clock; everything impure lives here, so the decision half stays
 * testable as a value.
 */

const DAY_MS = 86_400_000

/**
 * How many **Activity Imports** one analysis will read.
 *
 * Each carries up to 1 000 samples across three channels, so an unbounded read
 * over a decade of history would pull tens of megabytes through SQLite for a
 * page nobody opens twice. The cap bites only where the window is already dense
 * enough that the curve is well covered, and the basis reports the count it
 * actually read so a truncated window is visible rather than silent.
 */
export const MAX_ANALYSED_ACTIVITIES = 250

/**
 * Convert a stored `pace` channel (seconds per km) to speed (m/s).
 *
 * The mean-*maximal* of `sec/km` is the athlete's **slowest** stretch, so the
 * curve has to be built on the quantity that increases with performance. A
 * non-positive or absent pace becomes a gap rather than an infinity — a stopped
 * athlete has no speed, and zero would drag the window mean down as though they
 * were moving slowly.
 */
export function paceChannelToSpeed(
	channel: { resolutionSec: number; samples: Array<number | null> } | null,
): SampledChannel | null {
	if (!channel) return null
	const samples = channel.samples.map((paceSecPerKm) =>
		paceSecPerKm != null && Number.isFinite(paceSecPerKm) && paceSecPerKm > 0
			? 1000 / paceSecPerKm
			: null,
	)
	return samples.some((value) => value != null)
		? { resolutionSec: channel.resolutionSec, samples }
		: null
}

function isCardio(discipline: string): discipline is CardioDiscipline {
	return (CARDIO_DISCIPLINES as readonly string[]).includes(discipline)
}

/** Read the athlete's window and reduce it to the engine's input. */
export async function readAnalysisActivities(
	userId: string,
	now: Date,
): Promise<AnalysisActivity[]> {
	const from = new Date(now.getTime() - ANALYSIS_WINDOW_DAYS * DAY_MS)
	const rows = await prisma.activityImport.findMany({
		where: {
			athleteId: userId,
			startedAt: { gte: from, lte: now },
			discipline: { in: [...CARDIO_DISCIPLINES] },
		},
		orderBy: { startedAt: 'desc' },
		take: MAX_ANALYSED_ACTIVITIES,
		select: {
			id: true,
			discipline: true,
			startedAt: true,
			hrMax: true,
			stream: {
				select: {
					resolutionSec: true,
					sampleCount: true,
					timeSec: true,
					power: true,
					heartrate: true,
					pace: true,
				},
			},
		},
	})

	const activities: AnalysisActivity[] = []
	for (const row of rows) {
		if (!isCardio(row.discipline)) continue
		// A corrupt blob degrades to "no telemetry" rather than throwing — the same
		// tolerance every other reader of this row has.
		const stream = parseStoredStream(row.stream)
		activities.push({
			id: row.id,
			discipline: row.discipline,
			occurredAt: row.startedAt,
			hrMax: row.hrMax,
			power:
				stream?.power != null
					? { resolutionSec: stream.resolutionSec, samples: stream.power }
					: null,
			speedMps: paceChannelToSpeed(
				stream?.pace != null
					? { resolutionSec: stream.resolutionSec, samples: stream.pace }
					: null,
			),
		})
	}
	return activities
}

export type ProfileAnalysis = {
	estimates: ThresholdEstimate[]
	/** What the athlete already has stored, so the surface can show the delta. */
	stored: Record<
		CardioDiscipline,
		{
			maxHr: number | null
			lthr: number | null
			ftp: number | null
			runPowerThresholdW: number | null
			thresholdPaceSecPerKm: number | null
			cssSecPer100m: number | null
		}
	>
	activitiesRead: number
	windowDays: number
	hasBirthdate: boolean
}

const EMPTY_STORED = {
	maxHr: null,
	lthr: null,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
}

/** Run the whole analysis for one athlete. Reads; writes nothing. */
export async function analyseProfile(
	userId: string,
	now: Date = new Date(),
): Promise<ProfileAnalysis> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: {
			birthdate: true,
			disciplineProfiles: {
				select: {
					discipline: true,
					maxHr: true,
					lthr: true,
					ftp: true,
					runPowerThresholdW: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
				},
			},
		},
	})

	const activities = await readAnalysisActivities(userId, now)
	const estimates = estimateProfile({
		now,
		birthdate: profile?.birthdate ?? null,
		activities,
	})

	const stored = Object.fromEntries(
		CARDIO_DISCIPLINES.map((discipline) => {
			const row = profile?.disciplineProfiles.find(
				(candidate) => candidate.discipline === discipline,
			)
			return [
				discipline,
				row
					? {
							maxHr: row.maxHr,
							lthr: row.lthr,
							ftp: row.ftp,
							runPowerThresholdW: row.runPowerThresholdW,
							thresholdPaceSecPerKm: row.thresholdPaceSecPerKm,
							cssSecPer100m: row.cssSecPer100m,
						}
					: EMPTY_STORED,
			]
		}),
	) as ProfileAnalysis['stored']

	return {
		estimates,
		stored,
		activitiesRead: activities.length,
		windowDays: ANALYSIS_WINDOW_DAYS,
		hasBirthdate: profile?.birthdate != null,
	}
}

/**
 * Find one estimate again, by the pair that identifies it.
 *
 * The accept path **re-runs the analysis server-side** rather than trusting the
 * value the browser posted back — the same rule `approveSeason` holds for a
 * generated season and `fitPlanToEvent` holds for a **Season Fit** proposal. The
 * engine is deterministic given the same history, so re-deriving is exact and
 * an athlete cannot accept a number the app never produced.
 */
export function findEstimate(
	analysis: ProfileAnalysis,
	discipline: CardioDiscipline,
	construct: ThresholdConstruct,
): Extract<ThresholdEstimate, { kind: 'estimate' }> | null {
	const found = analysis.estimates.find(
		(estimate) =>
			estimate.discipline === discipline &&
			estimate.construct === construct &&
			estimate.kind === 'estimate',
	)
	return (found as Extract<ThresholdEstimate, { kind: 'estimate' }>) ?? null
}

/**
 * The `DisciplineProfile` column an accepted estimate lands in, and the
 * `ThresholdEvent` provenance to file alongside it.
 *
 * The **coercion is here and nowhere else**: a `cp` writes the `ftp` column
 * because that is the only column the app has, and the event records
 * `construct: 'cp'` so the history never claims the two are the same quantity.
 */
export function acceptancePlan(
	estimate: Extract<ThresholdEstimate, { kind: 'estimate' }>,
): {
	column: (typeof CONSTRUCT_COLUMN)[ThresholdConstruct]
	value: number
	kind: (typeof CONSTRUCT_EVENT_KIND)[ThresholdConstruct]
	construct: ThresholdConstruct
	protocol: ThresholdEstimate['protocol']
	confidence: string
} {
	return {
		column: CONSTRUCT_COLUMN[estimate.construct],
		value: estimate.value,
		kind: CONSTRUCT_EVENT_KIND[estimate.construct],
		construct: estimate.construct,
		protocol: estimate.protocol,
		confidence: estimate.confidence,
	}
}
