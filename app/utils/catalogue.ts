/**
 * The **Catalogue**'s vocabularies and its one derived value (ADR 0051).
 *
 * Four orthogonal axes answer four different questions about one **Workout**:
 *
 * | Axis | Where it lives | Answers |
 * | --- | --- | --- |
 * | Authorship | `Workout.authorship` + nullable `Workout.ownerId` | who wrote it |
 * | Membership | a `CatalogueEntry` row, 1:1 | is it offered for reuse at all |
 * | Collection | `CatalogueSave` rows, many | is it in *this* athlete's list |
 * | Visibility | `Workout.visibility` | who may read it |
 *
 * Nothing here touches the database — the server half is `catalogue.server.ts`.
 * "Library" is banned vocabulary: the word is **Catalogue**.
 */

/**
 * Authorship, **asserted** and never inferred from `ownerId IS NULL`. The
 * inference is the defect `Exercise` already ships: an athlete's account is
 * deleted, `createdByAthleteId` goes null, and the catalogue read path then
 * serves that row to everybody as a trainm8-authored entry. It cannot tell
 * "nobody wrote this" from "the author is gone".
 */
export const WORKOUT_AUTHORSHIPS = ['system', 'athlete'] as const
export type WorkoutAuthorship = (typeof WORKOUT_AUTHORSHIPS)[number]

/**
 * **Session Archetype** — what kind of session this is, the corpus's primary
 * retrieval filter. The sixteen values `CONTEXT.md` defines.
 *
 * On a **Catalogue Entry** this is *authored*, and that does not breach ADR
 * 0042's derived-never-authored rule: the rule is about classifying a session in
 * an athlete's **Training Week**, where a 100-minute easy run is `easy` in a
 * 120 km week and `long` in a 50 km one. A corpus row has no week. It is
 * published *as* a threshold session by its source, and that is a fact about the
 * row rather than a guess about an athlete (ADR 0051 §3).
 */
export const SESSION_ARCHETYPES = [
	'recovery',
	'easy',
	'long',
	'steady',
	'tempo',
	'threshold',
	'sub-threshold',
	'vo2max-long',
	'vo2max-short',
	'anaerobic',
	'neuromuscular',
	'fartlek',
	'race-simulation',
	'test',
	'brick',
	'technique',
] as const
export type SessionArchetype = (typeof SESSION_ARCHETYPES)[number]

/**
 * The **level floor** a Catalogue Entry carries — the lowest athlete level the
 * row is appropriate for (`workouts-running.md` §12 rates rows off-limits below
 * a band). A null level is a positive statement — the row is not level-scoped —
 * and never "we have not decided".
 */
export const CATALOGUE_LEVELS = [
	'beginner',
	'intermediate',
	'advanced',
] as const
export type CatalogueLevel = (typeof CATALOGUE_LEVELS)[number]

/** How the levels order, so a filter can ask for "at or below mine". */
const LEVEL_RANK: Record<CatalogueLevel, number> = {
	beginner: 0,
	intermediate: 1,
	advanced: 2,
}

/**
 * The phases a Catalogue Entry may be scoped to. Multi-valued — most rows span
 * two or three — so they are rows on `CatalogueEntryPhase` rather than a JSON
 * array (ADR 0044's idiom). No rows means the entry is not phase-scoped.
 */
export const CATALOGUE_PHASES = [
	'base',
	'build',
	'peak',
	'taper',
	'race-week',
] as const
export type CataloguePhase = (typeof CATALOGUE_PHASES)[number]

/**
 * The goal events a Catalogue Entry may be scoped to: the six `RACE_ANCHORS`
 * plus the two the trail rows need. An enumerated set and never a free distance,
 * the same rule the race anchors already carry. The **Discipline** comes from
 * the Workout, so this names the distance only.
 */
export const CATALOGUE_GOAL_EVENTS = [
	'1500m',
	'3k',
	'5k',
	'10k',
	'hm',
	'marathon',
	'trail',
	'ultra',
] as const
export type CatalogueGoalEvent = (typeof CATALOGUE_GOAL_EVENTS)[number]

/**
 * **Tier** answers *provenance only*, is derived, and is viewer-relative — the
 * same row is `mine` to its author and `community` to everyone else, so it can
 * never be a stored column.
 *
 * "It is in my list" is a **separate facet** and never a tier value. That
 * conflation is the flaw #438 caught: for a retrieval corpus an athlete's list
 * is overwhelmingly sessions they did *not* write, so a tier that means "I wrote
 * it" cannot answer the question the athlete is actually asking.
 *
 * `community` is not reachable today — `public` visibility and the publish flow
 * that produces it land whole in #452 — but the arm exists here because it is
 * the *derivation* that is being stated, not a stored value awaiting a consumer.
 */
export const CATALOGUE_TIERS = ['stock', 'community', 'mine'] as const
export type CatalogueTier = (typeof CATALOGUE_TIERS)[number]

export function catalogueTier(
	workout: { authorship: string; ownerId: string | null },
	viewerId: string | null,
): CatalogueTier {
	if (workout.authorship === 'system') return 'stock'
	if (viewerId != null && workout.ownerId === viewerId) return 'mine'
	return 'community'
}

/**
 * Is this row appropriate for an athlete at `level`? A row with no level floor
 * suits everybody; a row with one suits that level and up. Answering "no" is a
 * fact about the row's dose, not a judgement about the athlete — the regression
 * rule reduces volume or density and never the anchor.
 */
export function suitsLevel(
	entryLevel: string | null,
	athleteLevel: CatalogueLevel,
): boolean {
	if (entryLevel == null) return true
	if (!isCatalogueLevel(entryLevel)) return false
	return LEVEL_RANK[entryLevel] <= LEVEL_RANK[athleteLevel]
}

export function isCatalogueLevel(value: string): value is CatalogueLevel {
	return (CATALOGUE_LEVELS as readonly string[]).includes(value)
}

export function isSessionArchetype(value: string): value is SessionArchetype {
	return (SESSION_ARCHETYPES as readonly string[]).includes(value)
}

export function isCataloguePhase(value: string): value is CataloguePhase {
	return (CATALOGUE_PHASES as readonly string[]).includes(value)
}

export function isCatalogueGoalEvent(
	value: string,
): value is CatalogueGoalEvent {
	return (CATALOGUE_GOAL_EVENTS as readonly string[]).includes(value)
}

export function isCatalogueTier(value: string): value is CatalogueTier {
	return (CATALOGUE_TIERS as readonly string[]).includes(value)
}

/**
 * A **Citation** — the published source a **Stock Workout** comes from. Non-null
 * only on a system-authored row, which the schema enforces structurally rather
 * than by convention: a nullable citation an athlete may fill puts "Daniels
 * 2013" on a session Daniels never wrote, in the same slot as real authority.
 */
export type Citation = {
	author: string
	work: string
	year: number | null
	/** DOI, ISBN or URL — whatever the source is actually locatable by. */
	locator: string | null
}

/**
 * Read the four citation columns as one value, or `null` where there is no
 * citation. Deliberately total: a fragment (a year with no work) cannot survive
 * the schema's `CatalogueEntry_citation_whole` CHECK, so a partial read here
 * means the row was written past the constraint and is reported as absent rather
 * than rendered as half a source.
 */
export function readCitation(entry: {
	citationAuthor: string | null
	citationWork: string | null
	citationYear: number | null
	citationLocator: string | null
}): Citation | null {
	if (entry.citationAuthor == null || entry.citationWork == null) return null
	return {
		author: entry.citationAuthor,
		work: entry.citationWork,
		year: entry.citationYear,
		locator: entry.citationLocator,
	}
}

/** `Daniels — Daniels' Running Formula (2013)`. Year omitted where absent. */
export function formatCitation(citation: Citation): string {
	const year = citation.year == null ? '' : ` (${citation.year})`
	return `${citation.author} — ${citation.work}${year}`
}
