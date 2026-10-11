/**
 * **What a Catalogue card says, and in which order** (#505 round 2, Arket M:
 * the sport's own currency first). A card leads with the session itself — its
 * **Token Sentence**, then its minutes or km and the level it suits — and only
 * then the prose and the provenance footnote. It used to lead with a paragraph
 * of English prose with raw markdown in it, and say nothing about how long or
 * how far.
 *
 * Pure: the loader hands over the Workout tree it read for the page's rows.
 */
import {
	CONVENTION_NOTICE,
	HAND_WRITTEN_NOTICE,
} from '#app/utils/catalogue-corpus.ts'
import { formatCitation } from '#app/utils/catalogue.ts'
import { CATALOGUE_LABELS, NB_PROVENANCE_LABELS } from '#app/utils/labels.ts'
import { type SessionProvenance } from '#app/utils/plan-generation/provenance.ts'
import {
	deriveWorkoutNotation,
	notationSentence,
	workoutToNotationInput,
} from '#app/utils/workout-notation.ts'
import { buildSessionSummary } from './__workout-detail-summary.ts'

/**
 * The prose under the session, cleaned for reading: the corpus writes emphasis
 * as markdown (`*shrinking the recovery*`), which a card would print as
 * asterisks, and an uncited row's description opens with the notice its
 * provenance slot already states. Null where nothing is left to say.
 */
export function catalogueBlurb(description: string | null): string | null {
	if (!description) return null
	let text = description.trim()
	for (const notice of [CONVENTION_NOTICE, HAND_WRITTEN_NOTICE]) {
		if (text.startsWith(notice)) text = text.slice(notice.length)
	}
	text = text
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/\s+/g, ' ')
		.trim()
	return text === '' ? null : text
}

/** The provenance slot's first line, in Norwegian (`provenanceSentence`'s twin). */
export function nbProvenanceSentence(provenance: SessionProvenance): string {
	switch (provenance.kind) {
		case 'corpus':
			return NB_PROVENANCE_LABELS.source(formatCitation(provenance.citation))
		case 'convention':
			return NB_PROVENANCE_LABELS.convention
		case 'hand-written':
			return NB_PROVENANCE_LABELS.handWritten
		case 'community':
			return provenance.attribution
				? NB_PROVENANCE_LABELS.publishedBy(provenance.attribution.displayName)
				: NB_PROVENANCE_LABELS.unnamedPublisher
		case 'unsourced':
			return NB_PROVENANCE_LABELS.unsourced
	}
}

/** trainm8's non-vouch, on the one kind that needs it (ADR 0052 §3). */
export function nbProvenanceNonVouch(
	provenance: SessionProvenance,
): string | null {
	return provenance.kind === 'community' ? NB_PROVENANCE_LABELS.nonVouch : null
}

/** The Workout tree a card reads — the loader's select, structurally. */
export type CardWorkout = Parameters<typeof workoutToNotationInput>[0] & {
	discipline: string
	blocks: Array<{
		repeatCount: number
		seriesRepeatCount?: number | null
		steps: Array<{
			kind: string
			durationSec?: number | null
			distanceM?: number | null
			exerciseId?: string | null
			sets?: Array<{ weightKg?: number | null }>
		}>
	}>
}

export type CatalogueCard = {
	/** The Token Sentence, with its Norwegian glue words (ADR 0089). */
	sentence: string | null
	/** `10 km · 50 min · Viderekommen og opp`, lead figure first. */
	figures: string[]
}

export function buildCatalogueCard(input: {
	workout: CardWorkout | null
	/** The level's name, already in Norwegian, or null where none is stated. */
	level: string | null
}): CatalogueCard {
	const { workout } = input
	// No thresholds: a corpus row belongs to nobody, so every load and pace
	// renders exactly as authored ("omitting it is the Catalogue's case").
	const sentence = workout
		? notationSentence(deriveWorkoutNotation(workoutToNotationInput(workout)))
		: ''
	const figures = workout
		? buildSessionSummary({
				discipline: workout.discipline,
				status: 'scheduled',
				currency: null,
				recording: null,
				loggedSets: 0,
				workout: {
					blocks: workout.blocks.map((block) => ({
						repeatCount: block.repeatCount,
						seriesRepeatCount: block.seriesRepeatCount ?? null,
						steps: block.steps.map((step) => ({
							kind: step.kind,
							durationSec: step.durationSec ?? null,
							distanceM: step.distanceM ?? null,
							exerciseId: step.exerciseId ?? null,
							sets: (step.sets ?? []).map((set) => ({
								weightKg: set.weightKg ?? null,
							})),
						})),
					})),
				},
			}).map((figure) => figure.text)
		: []
	if (input.level) {
		figures.push(CATALOGUE_LABELS.levelAndUp(input.level))
	}
	return { sentence: sentence === '' ? null : sentence, figures }
}
