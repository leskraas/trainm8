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
}

export type ZoneRecipe = {
	id: string
	discipline: CardioDiscipline
	anchor: ZoneAnchor
	zones: ZoneBand[]
}
