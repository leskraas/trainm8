// The one read the **Volume Conversion** cannot do purely: a cyclist's own ride
// history, which is the bike distance leg's only possible source (ADR 0045 §5).
//
// The window is `RIDE_WINDOW_WEEKS` complete weeks ending the day before the
// authored **Plan Start Week**. Anchoring it to `startWeekKey` (ADR 0044 §3,
// authored and fixed) rather than to today is the load-bearing choice: it makes
// the speed a pure function of plan and history, so there is no stored field, no
// drift as later activities land, and no perverse sign where a fatigued month
// slows the athlete down and reads as *more* planned load. It re-derives
// naturally on a re-anchor. Actuals may **pre-fill**, never **drive**.
//
// This reads `ActivityImport` directly rather than through
// `WorkoutSession.recording` the way `history.server.ts` does. The two questions
// differ: the **Season Anchor** pre-fill asks "how much did you train", which is
// a question about completed *sessions*, while this asks "how fast do you ride",
// which every imported ride answers whether or not it was ever promoted to a
// session. An import that recorded no distance — `null` or zero, which the app
// reads as the same statement — contributes **neither** leg, so a window of
// indoor rides closes the gate rather than reporting a speed dragged down by
// durations with no distance against them.

import { dayBoundsUTC, addDays } from '../athlete-calendar.ts'
import { getAthleteTimezone } from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import { RIDE_WINDOW_WEEKS, type RideWindow } from './volume-conversion.ts'

/**
 * Total distance over total duration for the athlete's rides in the window
 * before `startWeekKey`.
 *
 * Returns `null` for an empty window — the honest close of the distance gate,
 * never a fallback constant, because no stable cycling ratio exists to fall back
 * to (ADR 0045 §5). No attempt is made to isolate the easy rides: roughly 80 % of
 * a cyclist's volume is easy anyway, and the small fast bias is cheaper to state
 * than to correct.
 */
export async function readRideWindow(
	athleteId: string,
	startWeekKey: string,
): Promise<RideWindow | null> {
	const timezone = await getAthleteTimezone(athleteId)
	const fromWeekKey = addDays(startWeekKey, -7 * RIDE_WINDOW_WEEKS)

	const rides = await prisma.activityImport.findMany({
		where: {
			athleteId,
			// Bike only, and not a parameter: the window exists because cycling has no
			// stable easy-pace ratio, which run and swim both do (ADR 0045 §5).
			discipline: 'bike',
			startedAt: {
				gte: dayBoundsUTC(fromWeekKey, timezone).start,
				// The Plan Start Week itself is outside the window: it is the week the
				// plan opens, so it has not been trained yet at authoring time.
				lte: dayBoundsUTC(addDays(startWeekKey, -1), timezone).end,
			},
			// `gt: 0`, not `not: null`: a trainer ride stored as zero distance is a ride
			// that recorded no distance, which is how the rest of the app reads it
			// (`personal-records.ts:70`, `fit-parser.server.ts:89`). Counting it would
			// add its duration to the denominator with nothing in the numerator, so an
			// indoor block would slow the athlete's speed down without any of their
			// riding having changed.
			distanceM: { gt: 0 },
		},
		select: { distanceM: true, durationSec: true },
	})

	let metres = 0
	let seconds = 0
	for (const ride of rides) {
		metres += ride.distanceM!
		seconds += ride.durationSec
	}
	if (rides.length === 0 || seconds === 0) return null

	return {
		fromWeekKey,
		weeks: RIDE_WINDOW_WEEKS,
		rides: rides.length,
		km: metres / 1000,
		hours: seconds / 3600,
	}
}
