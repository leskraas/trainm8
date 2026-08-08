import { type TrainingZone } from '../session-profile.ts'
import { type CardioDiscipline } from '../workout-schema.ts'

export type ZoneAnchor =
	| 'ftp'
	| 'runPower'
	| 'lthr'
	| 'maxHr'
	| 'thresholdPace'
	| 'css'
	| 'rpe'

export type ZoneBand = {
	label: string
	minRatio: number
	maxRatio?: number
	/**
	 * What the zone code means to the athlete, in plain words (e.g. Daniels "E"
	 * → "easy/endurance"). Display captions the code with it so structure lines
	 * never show a bare single letter (#180). Optional: per-athlete
	 * `zoneOverrides` bands carry ratios only and inherit the recipe's wording.
	 */
	description?: string
	/**
	 * Which of the app's five **Training Zones** this band *is* — declared per
	 * recipe rather than inferred (ADR 0045 §3).
	 *
	 * Neither of the two alternatives works. **Position** in the ladder
	 * (`bandIndexToStep`, fit for the editor's chip tint) misplaces
	 * `daniels-pace-5`, whose `T` sits third but is threshold, and has nothing to
	 * offer `css-3`'s three bands. **The `description` string** cannot carry it
	 * either: `olt-hr-5-*` names how hard a zone *feels* ("comfortably hard"), so
	 * no physiological word is there to match on.
	 *
	 * `undefined` is a positive statement that this band is not a position on the
	 * five-zone metabolic axis — Daniels' `R` and Stryd's `Z5` are neuromuscular
	 * work, which ADR 0042 §7 deliberately left off that axis — or that the
	 * recipe is too coarse to express the zone at all (`css-3` declares no 3 or
	 * 5; `css-5` is the five-band swim recipe that does). A consumer asking for an
	 * undeclared zone substitutes the nearest declared band and must *name the
	 * substitution*, never silently clamp.
	 */
	zone?: TrainingZone
}

export type ZoneRecipe = {
	id: string
	/**
	 * The recipe's name in the athlete's words — the named physiological model
	 * plus how many bands it has ("Daniels pace — 5 zones"). It lives on the
	 * recipe rather than in a lookup beside the picker, because a recipe id is
	 * reference data and a label derived from it by string-munging would drift
	 * the first time an id is versioned.
	 */
	name: string
	discipline: CardioDiscipline
	anchor: ZoneAnchor
	zones: ZoneBand[]
}
