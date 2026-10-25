/**
 * A Training Week's three numbers per track — Week Target, Planned Volume,
 * Actual Volume (#505, `week-volumes.ts`) — as Readings, in each track's own
 * Volume Currency. Shared by `get_today` and `get_season`.
 */

import { z } from 'zod/v4'
import { type OriginPlatform } from '#app/integrations/shared/origin-platform.ts'
import { VOLUME_CURRENCIES } from '#app/utils/plan-outline/derive.ts'
import { type TrackWeekVolume } from '#app/utils/plan-outline/week-volumes.ts'
import {
	NumberReading,
	reading,
	type ReadingContext,
	unavailable,
} from './reading.ts'

export const WeekTrackSchema = z.object({
	discipline: z.string(),
	/** The unit every number on the track is in: km, hours, TSS or sets. */
	currency: z.enum(VOLUME_CURRENCIES),
	/** The **Week Target**. */
	target: NumberReading(),
	/** The **Planned Volume**: what the week's sessions add up to. */
	planned: NumberReading(),
	/** The **Actual Volume**: what was done, by the same rule. */
	actual: NumberReading(),
})
export type WeekTrack = z.infer<typeof WeekTrackSchema>

/**
 * One track's week, with its binding sets (ADR 0098 §1): `recorded`, the
 * week's Recordings, which the Actual Volume is derived from; `detected`, the
 * Recordings of the week's detected sessions, whose measured Workouts count in
 * the Planned Volume (`volumeSessionOf`). The target is plan-side and binds to
 * nothing.
 */
export function toWeekTrack(
	track: TrackWeekVolume,
	{
		recorded,
		detected,
	}: {
		recorded: readonly OriginPlatform[]
		detected: readonly OriginPlatform[]
	},
	ctx: ReadingContext,
): WeekTrack {
	return {
		discipline: track.discipline,
		currency: track.currency,
		target: reading(
			track.target ??
				unavailable(
					track.targetAbsence === 'outside-plan'
						? 'outside-plan'
						: track.targetAbsence === 'no-anchor'
							? 'no-season-anchor'
							: 'not-resolved',
				),
			[],
			ctx,
		),
		// `0` is a true zero here — nothing planned, nothing done — and null
		// means sessions are there but none has a number in the currency.
		planned: reading(
			track.planned ?? unavailable('not-resolved'),
			detected,
			ctx,
		),
		actual: reading(track.actual ?? unavailable('not-resolved'), recorded, ctx),
	}
}
