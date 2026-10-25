/**
 * The pure eased-prescription builder (#158, PRD #156, feature #154), Slice 2.
 *
 * From an athlete's next planned *cardio* session it produces the canonical
 * eased target — the concrete prescription the server applier persists and the
 * home surface then reads back: one endurance-intent block in the SAME
 * Discipline, targeting the athlete's own endurance (zone 2) band resolved through
 * the existing zone-recipe resolver (ADR 0006), capped at an hour
 * (`EASED_CAP_MIN`). Strength has no zone model to ease into, so it produces no
 * target at all.
 *
 * Pure and page-agnostic, mirroring `decideSessionNudge` / the load utilities.
 * It never touches the DB or the clock: the caller supplies the source session's
 * discipline + planned duration and the athlete's Discipline Profile for that
 * discipline; the applier (`session-nudge.server.ts`, `applySessionNudgeForUser`)
 * persists the result as the session's blocks/steps.
 *
 * **Honesty over guessing (the Unavailable Metric principle, GLOSSARY.md / ADR
 * 0008).** We always author the endurance *zone label* (so a future threshold
 * fill-in resolves it), but we never fabricate a range: when the athlete's zone
 * recipe or its anchor threshold can't resolve the endurance zone, the result is
 * flagged `intensityResolvable: false` so nothing downstream invents numbers.
 */

import {
	CARDIO_DISCIPLINES,
	type IntensityTarget,
} from '#app/utils/workout-schema.ts'
import { bandForZone } from '#app/utils/zones/band-for-zone.ts'
import {
	getRecipe,
	resolveIntensity,
	type DisciplineProfileForResolver,
} from '#app/utils/zones/index.ts'
import { ZONE_WORDS } from '#app/utils/zones/words.ts'
import { EASED_CAP_MIN } from './session-nudge.ts'

const CARDIO_DISCIPLINE_SET: ReadonlySet<string> = new Set(CARDIO_DISCIPLINES)

/**
 * The endurance zone label when the athlete has no configured recipe to read
 * one off: zone 2's word, never the code `Z2` — a code is a recipe's band label,
 * and Stryd's `Z2` declares zone 3 (#627). The word reads through whichever
 * recipe the athlete later picks.
 */
const DEFAULT_ENDURANCE_LABEL = ZONE_WORDS[2]

/** A single authored step of the eased prescription (mirrors WorkoutStep JSON). */
export type EasedStep = {
	kind: 'cardio'
	discipline: string
	/** Authored endurance-zone target; resolvability is flagged separately. */
	intensity: IntensityTarget
	durationSec: number
}

export type EasedBlock = {
	repeatCount: number
	steps: EasedStep[]
}

/**
 * The canonical eased prescription for a session.
 *
 * - `blocks` is `null` for a non-cardio (strength) discipline — no target.
 * - `intensityResolvable` is `false` when the endurance zone can't resolve
 *   against the athlete's profile (missing recipe or anchor threshold); the zone
 *   label is still authored, but downstream must treat the intensity as an
 *   Unavailable Metric rather than a concrete range.
 */
export type EasedPrescription = {
	discipline: string
	intent: 'endurance'
	/** min(source planned duration, EASED_CAP_MIN); the cap when unknown. */
	durationMin: number
	/** `null` for strength (no eased target). */
	blocks: EasedBlock[] | null
	/** Whether the authored endurance zone resolves to a concrete range. */
	intensityResolvable: boolean
}

/**
 * The endurance zone label for the athlete's configured recipe: the label of
 * the band the recipe *declares* as zone 2 (`bandForZone`, ADR 0045 §3) — `Z2`
 * on Coggan/Friel/CSS, `E` on Daniels, `Z1` on Stryd. Never a label literal:
 * Stryd's `Z2` is zone 3, so matching on the code eased a Stryd runner into
 * tempo (#627). Without a recipe we use zone 2's word.
 */
function enduranceZoneLabel(
	profile: DisciplineProfileForResolver | null,
): string {
	if (!profile?.zoneSystem) return DEFAULT_ENDURANCE_LABEL
	const recipe = getRecipe(profile.zoneSystem)
	if (!recipe) return DEFAULT_ENDURANCE_LABEL
	return bandForZone(recipe, 2)?.band.label ?? DEFAULT_ENDURANCE_LABEL
}

/**
 * Build the canonical eased prescription for the athlete's next planned session.
 *
 * @param discipline    the source session's discipline (unchanged in the ease).
 * @param durationMin   the source session's planned duration in minutes, or null.
 * @param profile       the athlete's Discipline Profile for `discipline`, used to
 *                      resolve the endurance zone. `null`/absent ⇒ unresolvable.
 * @param capMin        the longest the eased session may be. The Session Nudge
 *                      caps at an hour (`EASED_CAP_MIN`); _For sliten i dag_
 *                      (spec #558 S5) has already chosen its own length.
 */
export function buildEasedPrescription(input: {
	discipline: string
	durationMin: number | null
	profile: DisciplineProfileForResolver | null
	capMin?: number
}): EasedPrescription {
	const { discipline, durationMin, profile, capMin = EASED_CAP_MIN } = input

	const cappedMin = durationMin != null ? Math.min(durationMin, capMin) : capMin

	// Strength (any non-cardio discipline): no zone model to ease into — no target.
	if (!CARDIO_DISCIPLINE_SET.has(discipline)) {
		return {
			discipline,
			intent: 'endurance',
			durationMin: cappedMin,
			blocks: null,
			intensityResolvable: false,
		}
	}

	const label = enduranceZoneLabel(profile)
	const intensity: IntensityTarget = { kind: 'zoneLabel', label }

	// Resolvable only when the recipe + its anchor threshold produce a range.
	const resolved = profile ? resolveIntensity(intensity, profile) : null
	const intensityResolvable = resolved != null && !resolved.unavailable

	return {
		discipline,
		intent: 'endurance',
		durationMin: cappedMin,
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline,
						intensity,
						durationSec: cappedMin * 60,
					},
				],
			},
		],
		intensityResolvable,
	}
}
