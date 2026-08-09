/**
 * **Retrieval-and-substitute over cited sessions** — how a slot in a generated
 * week becomes one row of the **Catalogue** (ADR 0053, #456).
 *
 * This is the half of generation that makes it retrieval rather than invention.
 * Nothing here writes a session: it narrows the corpus by the four facets a
 * **Catalogue Entry** carries (`archetype × phase × goalEvent × level`), refuses
 * whatever it cannot source, and then makes a **reproducible** choice among what
 * is left.
 *
 * Pure: candidates in, one row out. It never queries — the server half fetches the
 * corpus once and hands it to the generator, which is what keeps the generator
 * deterministic in the strict sense (same inputs, same plan) rather than merely
 * repeatable against one database.
 *
 * ## Four rules the narrowing holds
 *
 * **1. Stock only.** Since #452 `listCatalogue` returns **Shared Workouts** to
 * every athlete, and generation still places none of them. Choosing a community
 * session off the Catalogue is the athlete's act; trainm8 *placing* one on their
 * calendar unasked is trainm8 standing behind it, which is precisely what the
 * **Attribution**'s non-vouch says it does not do (ADR 0052 §3, ADR 0053 §4). The
 * rendering handles all four provenance kinds regardless, because a generated
 * session that is later forked or adopted keeps resolving through the chain.
 *
 * **2. No rows means "not scoped", which matches.** `phases` and `goalEvents` are
 * child rows, and their absence is a positive statement rather than an unknown
 * (ADR 0051 §3). That is not a detail: **cycling rows are unscoped by goal event**
 * — `CATALOGUE_GOAL_EVENTS` is running distances only — so a filter demanding a
 * goal-event match would retrieve nothing at all for a bike track.
 *
 * **3. A level is a floor.** `suitsLevel` already says it; retrieval asks it with
 * the floor the athlete's stated intent conventionally reads at, never with a band
 * asserted about them.
 *
 * **4. A row that cannot say where it came from is not placed.** `isPlaceable`,
 * applied before the choice rather than after it, so an unsourceable row never
 * displaces a sourceable one.
 */
import {
	suitsLevel,
	type CatalogueGoalEvent,
	type CatalogueLevel,
	type CataloguePhase,
	type SessionArchetype,
} from '../catalogue.ts'
import { type QualityZone } from '../plan-outline/quality-mix.ts'
import { isPlaceable, readSessionProvenance, type ProvenanceSource } from './provenance.ts'
import { type SessionSlot } from './season.ts'

/**
 * One corpus row as retrieval reads it: the four retrieval facets, enough of the
 * Workout to place and name it, and everything the provenance slot needs.
 *
 * Structural rather than a Prisma payload, so the generator can be exercised
 * against a handful of literal rows in a test — and so the seam's inputs stay
 * visible in one type rather than spread across a query.
 */
export type RetrievableEntry = ProvenanceSource & {
	entryId: string
	workoutId: string
	title: string
	discipline: string
	archetype: string
	/** The **level floor**; null means the row is not level-scoped. */
	level: string | null
	/** Empty means the row is not phase-scoped. */
	phases: CataloguePhase[]
	/** Empty means the row is not goal-event-scoped. */
	goalEvents: CatalogueGoalEvent[]
}

/**
 * The archetypes a **Quality Session Mix** zone may retrieve, in preference order.
 *
 * The mix authors a **Training Zone** and the corpus is filed by **Session
 * Archetype**, and the two are different axes — the zone says how hard, the
 * archetype says what the session is *for* in its week. So the mapping is a
 * preference list rather than a function: a zone-3 slot wants a tempo session and
 * will take a steady one, and stating that in order is what lets a thin corner of
 * the corpus degrade to a neighbouring archetype instead of to nothing.
 *
 * **`neuromuscular` appears nowhere here, and cannot.** Zones order work by
 * *metabolic* strain, and sprint work is high mechanical intensity at low metabolic
 * cost, so it has no position on the ladder at all (ADR 0042 §7). A mix that
 * reached it would be reading a zone the recipe declares nothing for. That
 * incidentally settles the strength corpus too: **`SESSION_ARCHETYPES` has no
 * strength member**, so strength rows are filed under `neuromuscular` and
 * `technique` (#451) — neither of which any slot below can ask for.
 *
 * `sub-threshold` sits under zone 4 rather than zone 3 because that is where the
 * band declares itself: `norwegian-threshold-run`'s sub-`T` band and its `T` band
 * **both** declare **Training Zone** 4, since the five-step ladder has no step for
 * which side of LT2 a session sits on (ADR 0045, #454).
 */
export const ZONE_ARCHETYPES: Record<QualityZone, SessionArchetype[]> = {
	3: ['tempo', 'steady', 'fartlek'],
	4: ['threshold', 'sub-threshold'],
	5: ['vo2max-short', 'vo2max-long', 'anaerobic'],
}

/** An ordinary training day: the aerobic volume the week is mostly made of. */
export const ORDINARY_ARCHETYPES: SessionArchetype[] = ['easy', 'recovery']

/** The long day, which the starter pattern weights double. */
export const LONG_ARCHETYPES: SessionArchetype[] = ['long', 'easy']

/**
 * Race week. The corpus's `race-simulation` rows include the three **Hand-Written
 * Rows** of running archetype I — written by trainm8 exactly because the research
 * tables leave a hole in the week before the **Target Event** (ADR 0051 §11) — so
 * this is the one slot where an uncited stock row is the *expected* answer rather
 * than a degradation.
 */
export const RACE_WEEK_ARCHETYPES: SessionArchetype[] = [
	'race-simulation',
	'recovery',
	'easy',
]

/** Which archetypes a slot may be filled from, in preference order. */
export function archetypesForSlot(
	slot: SessionSlot,
	zone: QualityZone | null,
): SessionArchetype[] {
	switch (slot) {
		case 'quality':
			return zone == null ? [] : ZONE_ARCHETYPES[zone]
		case 'long':
			return LONG_ARCHETYPES
		case 'ordinary':
			return ORDINARY_ARCHETYPES
		case 'race-week':
			return RACE_WEEK_ARCHETYPES
	}
}

/** What one slot asks the corpus for. */
export type RetrievalCriteria = {
	discipline: string
	/** Tried in order; the first archetype with any candidate wins outright. */
	archetypes: SessionArchetype[]
	cataloguePhase: CataloguePhase
	/** Null means the Event names no distance the corpus scopes by — see below. */
	goalEvent: CatalogueGoalEvent | null
	level: CatalogueLevel
	/**
	 * Which of the surviving candidates to take. Any integer; see
	 * {@link retrieveSession} for why it is an index and not a seed.
	 */
	rotation: number
}

/** Does this row survive the four facets? Exported so a test can ask directly. */
export function matchesCriteria(
	entry: RetrievableEntry,
	criteria: Omit<RetrievalCriteria, 'archetypes' | 'rotation'> & {
		archetype: SessionArchetype
	},
): boolean {
	if (entry.authorship !== 'system') return false
	if (entry.discipline !== criteria.discipline) return false
	if (entry.archetype !== criteria.archetype) return false
	if (!suitsLevel(entry.level, criteria.level)) return false
	// No rows means "not scoped", which matches every phase and every distance.
	if (entry.phases.length > 0 && !entry.phases.includes(criteria.cataloguePhase)) {
		return false
	}
	// A null goal event does not narrow. The alternative — matching only unscoped
	// rows — would read "this Event has no distance" as "this Event wants generic
	// sessions", and would silently exclude the whole running corpus from a plan
	// for a race the app happens not to model a distance for.
	if (
		criteria.goalEvent != null &&
		entry.goalEvents.length > 0 &&
		!entry.goalEvents.includes(criteria.goalEvent)
	) {
		return false
	}
	return isPlaceable(readSessionProvenance(entry))
}

/**
 * The row this slot gets, or `null` where the corpus has nothing for it.
 *
 * **Preference order is a cliff, not a blend.** The first archetype in the list
 * with any candidate at all supplies the session; a zone-3 slot with one tempo row
 * available takes that row every time rather than mixing tempo and steady
 * candidates into one pool. A blended pool would make the second-choice archetype
 * as likely as the first, which is a different plan from the one the preference
 * order describes.
 *
 * **The choice is an index into a sorted list, and that is what makes generation
 * deterministic.** Candidates are sorted by their entry id — stable, seeded ids
 * (`stockentry_<key>`), so the order does not depend on the database's row order —
 * and `rotation` picks one modulo the count. The caller passes the week and the
 * day, so consecutive weeks walk through the available rows instead of repeating
 * one, and the same request produces the same walk on every run. There is no
 * random source anywhere in generation, seeded or otherwise: a seeded shuffle
 * would be reproducible too, but nobody could predict it, and a plan an athlete
 * cannot predict is one they cannot check.
 */
export function retrieveSession(
	corpus: readonly RetrievableEntry[],
	criteria: RetrievalCriteria,
): RetrievableEntry | null {
	for (const archetype of criteria.archetypes) {
		const candidates = corpus
			.filter((entry) => matchesCriteria(entry, { ...criteria, archetype }))
			.sort((a, b) => (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0))
		if (candidates.length === 0) continue
		// Non-negative modulo, so a caller is never obliged to pre-normalise.
		const index =
			((criteria.rotation % candidates.length) + candidates.length) %
			candidates.length
		return candidates[index]!
	}
	return null
}
