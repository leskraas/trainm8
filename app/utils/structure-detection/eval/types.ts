import { type ActivityStream } from '../../activity-stream.ts'
import { type DisciplineProfileForResolver } from '../../zones/resolve.ts'
import { type ClassifyChannel } from '../constants.ts'
import { type DetectionDiscipline, type Lap } from '../types.ts'
import { type DeviceLap } from './fit.ts'

/**
 * The detection scoreboard's frozen corpus (map #600, ticket #605): real
 * recordings as the engine sees them, each with a ground-truth label, so every
 * change to Structure Detection is measured rather than argued. It scores the
 * Detection Confidence grades (ADR 0033) and the segment classification ladder
 * (ADR 0035). Build-time tooling only; nothing in the app imports it.
 */

/** A mean measured value per classifying channel; absent where the stream has none. */
export type ChannelMeans = Partial<Record<ClassifyChannel, number>>

/** A structured session's truth: N reps of `workSec` with `recoverySec` between. */
export type StructuredLabel = {
	kind: 'structured'
	/**
	 * Where the rep scheme came from: the athlete's title, the athlete's word
	 * for an untitled session, or the session's own laps in its FIT file
	 * (`step-laps`: active/recovery laps a structured workout wrote;
	 * `manual-laps`: reps the athlete lapped by hand, #625).
	 */
	source: 'title' | 'athlete' | 'step-laps' | 'manual-laps'
	title: string
	/** Reps per set, in order, when the laps hold more than one set; `reps` is the largest. */
	sets?: number[]
	reps: number
	workSec: number
	recoverySec: number
	/**
	 * The work windows, `[startSec, endSec)` on the stream's axis. From a title
	 * or the athlete's word, placed by fitting the square wave to the power
	 * channel (the one start offset, and the recovery when the title omits it,
	 * that maximise work − recovery power), so they are accurate to about one
	 * sample. From laps, the work laps themselves.
	 */
	work: Lap[]
	/** Mean measured value inside the work windows, per channel. */
	workValue: ChannelMeans
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

/**
 * A FIT session (#625): the file is the frozen artefact, so the corpus keeps
 * its path, laps and label, and the scoreboard decodes the 1 s stream from
 * the file (`eval/fit.ts`) rather than storing it twice.
 */
export type FitCorpusActivity = {
	id: string
	/** The FIT file's name in the private repo's `detection/fit/` (`scripts/detection/fit-dir.ts`). */
	file: string
	/** Who wrote the file (`file_id`), and the recording device when known. */
	writer: string
	device: string | null
	discipline: DetectionDiscipline
	title: string
	startedAt: string
	/** The Strava activity of the same session in `activities`, when there is one. */
	sameAs: string | null
	laps: DeviceLap[]
	/** How the label was reached, for the corpus build's cross-check. */
	labelFrom: string
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
	/**
	 * Real FIT sessions with their 1 s streams and device laps (#625): only the
	 * labelled ones (structured or unstructured), the only ones whose file is
	 * kept (in the private repo, `scripts/detection/fit-dir.ts`).
	 */
	fit: FitCorpusActivity[]
	/** What the build saw in the owner's full export, beyond the labelled sessions. */
	fitSummary: FitSummary
}

export type FitSummary = {
	/** FIT files decoded in the build that produced these labels. */
	files: number
	/** Run/bike sessions with no label: reported, never scored, file not kept. */
	unlabelled: number
	/** Sessions of a sport detection does not run for, by FIT sport. */
	excluded: Record<string, number>
}
