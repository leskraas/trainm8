import { type TrainingZone } from '../session-profile.ts'

/**
 * The one word each **Training Zone** is written as (#607 D1): what the writing
 * line, the day stamp and an eased session with no recipe store as a
 * `zoneLabel`.
 *
 * A word and not a code, because a code is a recipe's band label: a stored `Z2`
 * is Stryd's `Z2`, which declares zone 3, and a stored `Z3` is css-3's `Z3`,
 * which declares zone 4 (#627). No recipe uses a Norwegian word as a band
 * label, so a word is always read through the band the recipe declares for
 * its zone (`bandForZone`).
 */
export const ZONE_WORDS: Record<TrainingZone, string> = {
	1: 'lett',
	2: 'rolig',
	3: 'moderat',
	4: 'terskel',
	5: 'hardt',
}
