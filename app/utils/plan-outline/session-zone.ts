// The **zone a session is**: one reading of a stored Workout's hardest zone,
// shared by the stamp's mix check (`stamp.server.ts`) and the season's day
// check (`training.server.ts`). Pure and a leaf: the stamp's server module is
// in an import cycle with the season read, so the reading lives here.

import { type Prisma } from '@prisma/client'
import {
	intensityTargetToZone,
	intentToZone,
	type TrainingZone,
} from '../session-profile.ts'
import { IntensityTargetSchema } from '../workout-schema.ts'

/** The Workout columns a session's zone is read off — its intent and its steps. */
export const sessionZoneSelect = {
	intent: true,
	blocks: {
		select: {
			steps: { select: { kind: true, intensity: true } },
		},
	},
} satisfies Prisma.WorkoutSelect

export type SessionZoneWorkout = Prisma.WorkoutGetPayload<{
	select: typeof sessionZoneSelect
}>

/**
 * The **zone a session is**, for the purpose of counting quality sessions: the
 * hardest zone anything in it prescribes.
 *
 * The hardest and not the longest, because that is what makes a session a quality
 * session — `20 min Z1 · 5×1000m Z4 · 10 min Z1` is a threshold session even
 * though most of its minutes are easy, and counting it as zone 1 would report a
 * disagreement nobody would recognise.
 *
 * The zone comes off the **authored intensity** through the same
 * `intensityTargetToZone` the Workout Shape uses, falling back to the workout's
 * own **intent** where no step states one — the fallback `deriveSessionProfile`
 * already makes, and the only prescription a bare volume session has. A session
 * neither can zone truthfully reads `null` and counts toward nothing: an unzoned
 * session is not evidence that a zone is missing (ADR 0008).
 */
export function sessionZone(
	workout: SessionZoneWorkout | null,
): TrainingZone | null {
	if (!workout) return null
	const zones = workout.blocks
		.flatMap((block) => block.steps)
		.flatMap((step) =>
			step.kind === 'cardio' ? [stepZone(step.intensity)] : [],
		)
		.filter((zone): zone is TrainingZone => zone != null)
	if (zones.length > 0) return Math.max(...zones) as TrainingZone
	return intentToZone(workout.intent)
}

function stepZone(intensity: string | null): TrainingZone | null {
	if (!intensity) return null
	try {
		const parsed = IntensityTargetSchema.safeParse(JSON.parse(intensity))
		return parsed.success ? intensityTargetToZone(parsed.data) : null
	} catch {
		return null
	}
}
