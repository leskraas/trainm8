/**
 * **The model-client seam** — the one boundary a season comes through, whoever
 * produced it (ADR 0016 §2/§5, carried forward by ADR 0053, #456).
 *
 * The seam is two things and nothing else: a request type, and a function from a
 * request to a {@link GeneratedSeason}. Everything downstream — the preview
 * surface, the approval step, the provenance rendering — is written against the
 * payload, so replacing what is on this side of the boundary changes none of them.
 *
 * **It is not an inert seam.** ADR 0037's cautionary precedent is a field that
 * shipped with no consumer and sat unread through an entire map; the opposite
 * mistake would be an interface with no implementation. This one ships with its
 * implementation — {@link DETERMINISTIC_SEASON_GENERATOR} is the real generator,
 * not a stub — and a model later is a *second* implementation of an interface that
 * already has a working one.
 *
 * ## Why the corpus is an argument and not a query
 *
 * A generator is a **pure function**. It cannot reach the database, so it cannot
 * read a clock, a session, or an athlete's row behind the caller's back, and it
 * cannot answer differently on a second call. That is what makes "same inputs,
 * same plan" checkable rather than merely intended — and it is what allows the
 * approval step to *re-run* generation server-side instead of trusting a payload
 * the browser posted back, exactly as `fitPlanToEvent` recomputes its proposal.
 *
 * A model implementation is still expressible: model calls are asynchronous, so
 * such an implementation returns a promise and the seam's return type is widened
 * the day one exists. Widening it now would make every caller `await` a function
 * that never suspends, for a caller that does not exist — the shape ADR 0037
 * warns about, one layer up.
 */
import {
	DETERMINISTIC_GENERATOR_ID,
	generateDeterministicSeason,
} from './deterministic.ts'
import { type RetrievableEntry } from './retrieval.ts'
import { type GeneratedSeason, type SeasonRequest } from './season.ts'

/**
 * One way of producing a season. Named rather than anonymous so a payload can
 * carry `generatorId` and a plan can always say which implementation built it.
 */
export type SeasonGenerator = {
	/** Stamped onto every payload this generator returns. */
	id: string
	generate(
		request: SeasonRequest,
		corpus: readonly RetrievableEntry[],
	): GeneratedSeason
}

/** The implementation behind the seam today: rules, no model, no clock. */
export const DETERMINISTIC_SEASON_GENERATOR: SeasonGenerator = {
	id: DETERMINISTIC_GENERATOR_ID,
	generate: generateDeterministicSeason,
}

/**
 * Produce a season through the seam.
 *
 * The default argument is the whole point: every caller in the app goes through
 * this function and none of them names an implementation, so adding a second one
 * is a change here and nowhere else.
 */
export function generateSeason(
	request: SeasonRequest,
	corpus: readonly RetrievableEntry[],
	generator: SeasonGenerator = DETERMINISTIC_SEASON_GENERATOR,
): GeneratedSeason {
	return generator.generate(request, corpus)
}
