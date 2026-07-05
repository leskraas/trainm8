import { type CardioDiscipline } from '../workout-schema.ts'

export type ZoneAnchor =
	| 'ftp'
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
}

export type ZoneRecipe = {
	id: string
	discipline: CardioDiscipline
	anchor: ZoneAnchor
	zones: ZoneBand[]
}
