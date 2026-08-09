/**
 * **Performance Result** reads — the athlete's own dated maximal performances,
 * and the one rung of the **Race Equivalence** ladder this repo can walk today
 * (research: `portable-intensity-anchors.md` §4.3, rung 1).
 *
 * The ladder's other four rungs — a result at another distance converted through
 * Riegel / Daniels–Gilbert / Critical Speed, a stored **Threshold** read as a
 * virtual race result, a mean-maximal-curve fit, and then nothing truthful to
 * say — are deliberately absent. Each needs an equivalence model shipped as
 * versioned reference data with its own confidence rule (ratio ≤ 2 high, ≤ 4
 * medium, > 4 low), and a resolution that cannot state which rung it came from
 * cannot be rendered honestly. So this module resolves rung 1 or nothing: a
 * `racePace` target with no result at that distance degrades to its bare
 * authored form, exactly as a `powerPct` target does without an FTP.
 */
import { prisma } from './db.server.ts'
import {
	RACE_ANCHOR_DISTANCE_M,
	RACE_ANCHORS,
	type RaceAnchor,
} from './workout-schema.ts'
import { type RaceAnchorPaces } from './zones/index.ts'

/** The **Race Anchor** a distance in metres names, or null when it names none.
 * Exact metres only: a 4.8 km parkrun is not a 5k, and rounding one into the
 * other would put a pace the athlete never ran behind a 5k-pace target. */
export function raceAnchorForDistance(distanceM: number): RaceAnchor | null {
	return (
		RACE_ANCHORS.find(
			(anchor) => RACE_ANCHOR_DISTANCE_M[anchor] === distanceM,
		) ?? null
	)
}

type ResultRow = {
	distanceM: number
	timeSec: number
	occurredAt: Date
}

/**
 * The athlete's pace at each **Race Anchor**, in seconds per km — the **most
 * recent** result at each distance, not the fastest.
 *
 * Recency rather than best is the deliberate call: a prescription resolves
 * against what this athlete can do *now*, and a personal best from three
 * seasons ago would prescribe a target they cannot hold. The fastest-ever
 * reading is a **Personal Record**, which is a different question with its own
 * derivation (ADR 0021).
 */
export function raceAnchorPacesFrom(rows: ResultRow[]): RaceAnchorPaces {
	const newest = new Map<RaceAnchor, ResultRow>()
	for (const row of rows) {
		const anchor = raceAnchorForDistance(row.distanceM)
		if (!anchor) continue
		const held = newest.get(anchor)
		if (!held || row.occurredAt > held.occurredAt) newest.set(anchor, row)
	}
	const paces: RaceAnchorPaces = {}
	for (const [anchor, row] of newest) {
		paces[anchor] = Math.round(row.timeSec / (row.distanceM / 1000))
	}
	return paces
}

/** {@link raceAnchorPacesFrom} for one athlete's stored results in a discipline. */
export async function raceAnchorPacesFor(
	athleteProfileId: string,
	discipline: string,
): Promise<RaceAnchorPaces> {
	const rows = await prisma.performanceResult.findMany({
		where: {
			athleteProfileId,
			discipline,
			distanceM: { in: Object.values(RACE_ANCHOR_DISTANCE_M) },
		},
		select: { distanceM: true, timeSec: true, occurredAt: true },
		orderBy: { occurredAt: 'desc' },
	})
	return raceAnchorPacesFrom(rows)
}
