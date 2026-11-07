import {
	CATALOGUE_CORPUS,
	stockEntryId,
	stockWorkoutId,
} from '#app/utils/catalogue-corpus.all.ts'
import { type CorpusBlock } from '#app/utils/catalogue-corpus.ts'
import { type RetrievableEntry } from '#app/utils/plan-generation/retrieval.ts'
import { buildBlocksCreate } from '#app/utils/workout.server.ts'

/**
 * A corpus row's blocks as the database stores them: built by
 * `buildBlocksCreate`, the builder the corpus seed writes with, so a rest's
 * `durationSec` and a Send-Off's JSON are what the generator reads in the app.
 */
export function storedBlocks(
	blocks: readonly CorpusBlock[],
): RetrievableEntry['blocks'] {
	return buildBlocksCreate([...blocks]).map((block) => ({
		repeatCount: block.repeatCount,
		seriesRepeatCount: block.seriesRepeatCount,
		betweenSeriesRestSec: block.betweenSeriesRestSec,
		sendOff: block.sendOff,
		steps: block.steps.create.map((step) => ({
			kind: step.kind,
			discipline: 'discipline' in step ? (step.discipline ?? null) : null,
			intensity: 'intensity' in step ? (step.intensity ?? null) : null,
			durationSec: 'durationSec' in step ? (step.durationSec ?? null) : null,
			distanceM: 'distanceM' in step ? (step.distanceM ?? null) : null,
		})),
	}))
}

/** The shipped corpus, in the shape retrieval reads: the real rows, no database. */
export const GENERATION_CORPUS: RetrievableEntry[] = CATALOGUE_CORPUS.map(
	(session) => ({
		entryId: stockEntryId(session.key),
		workoutId: stockWorkoutId(session.key),
		title: session.title,
		description: session.description,
		discipline: session.discipline,
		authorship: 'system',
		archetype: session.archetype,
		level: session.level,
		phases: session.phases,
		goalEvents: session.goalEvents,
		citationAuthor: session.citation?.author ?? null,
		citationWork: session.citation?.work ?? null,
		citationYear: session.citation?.year ?? null,
		citationLocator: session.citation?.locator ?? null,
		blocks: storedBlocks(session.blocks),
	}),
)
