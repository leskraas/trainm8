/**
 * **Where a placed session came from** — the provenance slot a generated
 * **Workout Session** renders, read off the row rather than assumed (#456).
 *
 * ADR 0016 required that every generated session "carry its **Citation**". That
 * sentence was written when the corpus was hypothetical and a **Stock Workout**
 * without a Citation did not exist. It does now, twice over: a **Convention Row**
 * is sourced to coaching practice and names no publication, a **Hand-Written Row**
 * was written by trainm8 because the research counts an archetype it never tabled,
 * and between them they are about a third of the corpus (ADR 0051 §10, §11, #451).
 * Since #452 `listCatalogue` also returns **Shared Workouts** to every athlete,
 * which are *structurally incapable* of carrying a Citation (ADR 0052 §3).
 *
 * So the rule generation actually holds is one step up from the Citation, and is
 * the one ADR 0053 records: **a session generation cannot source is a session
 * generation does not place.** Four kinds fill the slot and each says a different
 * true thing; a fifth — `unsourced` — is the refusal, and `isPlaceable` is what
 * keeps such a row out of a plan rather than letting it render as an empty slot.
 *
 * Reading it is deliberately **not** "is there a Citation": that question has one
 * answer for a Convention Row and a community row, and they owe the athlete
 * opposite sentences. What separates the two uncited stock kinds is the fixed
 * notice their description opens with — a constant precisely so that "what does
 * trainm8 vouch for as published?" is a grep (`catalogue-corpus.ts`) — so that is
 * what is read.
 *
 * Pure. Nothing here touches the database and nothing formats a date; the surface
 * words the slot (ADR 0023).
 */
import { CONVENTION_NOTICE, HAND_WRITTEN_NOTICE } from '../catalogue-corpus.ts'
import { formatCitation, readCitation, type Citation } from '../catalogue.ts'
import {
	COMMUNITY_NON_VOUCH,
	formatAttribution,
	readAttribution,
	type Attribution,
} from '../community.ts'

/**
 * The four things a placed session's provenance slot can truthfully say, plus the
 * one that stops it being placed at all.
 *
 * `community` carries a nullable **Attribution** because the two failure modes are
 * different: a `public` row always has one (the publish flow writes both in one
 * transaction), so a null here means the row was written past that flow, and the
 * slot then says who published it *cannot* be stated rather than inventing a name.
 */
export type SessionProvenance =
	| { kind: 'corpus'; citation: Citation }
	| { kind: 'convention' }
	| { kind: 'hand-written' }
	| { kind: 'community'; attribution: Attribution | null }
	| { kind: 'unsourced' }

/**
 * What a provenance reading needs off a **Catalogue Entry** and its **Workout**.
 *
 * Structural rather than a Prisma payload type, so the pure generator can be
 * handed corpus rows in a test without a database, and so the reading cannot
 * quietly start depending on a column the seam does not carry.
 */
export type ProvenanceSource = {
	/** `system` or `athlete` — **asserted**, never inferred from a null owner. */
	authorship: string
	/** The Workout's description: where the two uncited stock kinds declare
	 * themselves. Null is not a third kind — it is simply neither notice. */
	description: string | null
	citationAuthor: string | null
	citationWork: string | null
	citationYear: number | null
	citationLocator: string | null
	/** The publish record, where one exists. Absent on every stock row. */
	attribution?: { displayName: string; publishedAt: Date } | null
}

/**
 * The provenance this row can state, in the slot's own vocabulary.
 *
 * The order of the branches is the argument. Authorship is asked **first**,
 * because it is the axis the schema enforces the asymmetry on: an athlete's row
 * cannot hold a Citation and trainm8's cannot hold an Attribution, so reading
 * either one first would be reading the consequence rather than the cause.
 *
 * A `system` row with no Citation and neither notice is `unsourced` rather than
 * silently `convention`. Defaulting there would be the fabrication in miniature:
 * it would say "coaching convention" about a row nobody has said that about.
 */
export function readSessionProvenance(
	row: ProvenanceSource,
): SessionProvenance {
	if (row.authorship === 'athlete') {
		return { kind: 'community', attribution: readAttribution(row.attribution) }
	}
	const citation = readCitation(row)
	if (citation) return { kind: 'corpus', citation }
	const description = row.description ?? ''
	if (description.startsWith(HAND_WRITTEN_NOTICE)) return { kind: 'hand-written' }
	if (description.startsWith(CONVENTION_NOTICE)) return { kind: 'convention' }
	return { kind: 'unsourced' }
}

/**
 * May generation place this row? Everything but `unsourced`.
 *
 * The predicate exists so the rule reads as one word at the retrieval site.
 * "Cannot source" is a property of the row and not of the slot it was going into,
 * so a row that fails here fails for every week of every plan — which is what
 * makes the resulting hole a stated absence rather than an intermittent one.
 */
export function isPlaceable(provenance: SessionProvenance): boolean {
	return provenance.kind !== 'unsourced'
}

/**
 * The **Convention Row**'s slot line. Short where the description's notice is
 * long, and it does not restate it: the notice is the row's own words in the
 * session's description, and this is the slot saying which of the four kinds it
 * is. Both are shown, and neither is a substitute for the other.
 */
export const CONVENTION_SLOT_LINE =
	'Coaching convention — trainm8 claims no published source for this session.'

/** The **Hand-Written Row**'s slot line, in the same register. */
export const HAND_WRITTEN_SLOT_LINE =
	'Written by trainm8 — no published source, and none claimed.'

/** Where the publishing athlete's name is missing on a row that has one. */
export const UNNAMED_PUBLISHER_LINE =
	'Published by an athlete — trainm8 cannot state who.'

/**
 * The slot's first line: one sentence per kind, in the athlete's words.
 *
 * `unsourced` is total here rather than throwing, because a renderer must not be
 * the thing that decides a row is unplaceable — `isPlaceable` already did, before
 * the session existed. If one ever reaches a screen, saying so plainly beats an
 * exception in a loader.
 */
export function provenanceSentence(provenance: SessionProvenance): string {
	switch (provenance.kind) {
		case 'corpus':
			return `Source: ${formatCitation(provenance.citation)}`
		case 'convention':
			return CONVENTION_SLOT_LINE
		case 'hand-written':
			return HAND_WRITTEN_SLOT_LINE
		case 'community':
			return provenance.attribution
				? formatAttribution(provenance.attribution)
				: UNNAMED_PUBLISHER_LINE
		case 'unsourced':
			return 'No source could be read for this session.'
	}
}

/**
 * trainm8's standing statement about itself, on the one kind that needs it, and
 * `null` everywhere else.
 *
 * It is `COMMUNITY_NON_VOUCH` and not a second wording: the non-vouch is identical
 * on every community row by construction, which is why it lives in code where it
 * cannot be per-row edited, absent or disagreed with (ADR 0052 §3). A convention
 * or hand-written row does **not** get one — trainm8 wrote or transcribed those,
 * and disclaiming them would be disclaiming its own corpus rather than somebody
 * else's session.
 */
export function provenanceNonVouch(
	provenance: SessionProvenance,
): string | null {
	return provenance.kind === 'community' ? COMMUNITY_NON_VOUCH : null
}
