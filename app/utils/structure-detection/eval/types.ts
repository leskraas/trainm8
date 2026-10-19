import { type ActivityStream } from '../../activity-stream.ts'
import { type DisciplineProfileForResolver } from '../../zones/resolve.ts'
import { type DetectionDiscipline, type Lap } from '../types.ts'

/**
 * The detection scoreboard's frozen corpus (map #600, ticket #605): real
 * recordings as the engine sees them, each with a ground-truth label, so every
 * change to Structure Detection is measured rather than argued. Build-time
 * tooling only; nothing in the app imports it.
 */

/** A structured session's truth: N reps of `workSec` with `recoverySec` between. */
export type StructuredLabel = {
	kind: 'structured'
	/** Where the rep scheme came from: the athlete's title, or the athlete's word for an untitled session. */
	source: 'title' | 'athlete'
	title: string
	reps: number
	workSec: number
	recoverySec: number
	/**
	 * The work windows, `[startSec, endSec)` on the stream's axis. Placed by
	 * fitting the title's square wave to the power channel (the one start offset,
	 * and the recovery when the title omits it, that maximise work − recovery
	 * power), so they are accurate to about one sample.
	 */
	work: Lap[]
	/** Mean measured value inside the work windows, per channel. */
	workValue: { power?: number; pace?: number; heartrate?: number }
	/** Mean work power ÷ mean recovery power at the fitted placement. */
	contrast: number
}

/** A session hand-labelled as having no repeat structure, and why. */
export type UnstructuredLabel = {
	kind: 'unstructured'
	reason: 'steady' | 'long' | 'hilly' | 'paused'
	note: string
}

/** A session nobody can label from the data at hand; reported, never scored. */
export type UnlabelledLabel = { kind: 'unlabelled'; note: string }

export type DetectionLabel =
	| StructuredLabel
	| UnstructuredLabel
	| UnlabelledLabel

export type CorpusActivity = {
	id: string
	source: 'strava'
	device: string | null
	discipline: DetectionDiscipline
	title: string
	startedAt: string
	/** The stream at stored resolution, exactly what the engine reads in production. */
	stream: ActivityStream
	/** Provider laps as stored; `null` when the provider gave none. */
	laps: Lap[] | null
	label: DetectionLabel
}

export type CorpusProfile = {
	name: string
	/** How these thresholds were arrived at. */
	provenance: string
	profile: DisciplineProfileForResolver
}

export type DetectionCorpus = {
	frozenAt: string
	from: string
	profiles: CorpusProfile[]
	activities: CorpusActivity[]
}
