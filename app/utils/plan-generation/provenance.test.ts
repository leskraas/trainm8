import { expect, test } from 'vitest'
import { CATALOGUE_CORPUS } from '../catalogue-corpus.all.ts'
import { CONVENTION_NOTICE, HAND_WRITTEN_NOTICE } from '../catalogue-corpus.ts'
import { COMMUNITY_NON_VOUCH } from '../community.ts'
import {
	isPlaceable,
	provenanceNonVouch,
	provenanceSentence,
	readSessionProvenance,
	type ProvenanceSource,
} from './provenance.ts'

function stock(overrides: Partial<ProvenanceSource> = {}): ProvenanceSource {
	return {
		authorship: 'system',
		description: 'A session.',
		citationAuthor: null,
		citationWork: null,
		citationYear: null,
		citationLocator: null,
		...overrides,
	}
}

test('a cited Stock Workout reads as corpus and shows its Citation', () => {
	const provenance = readSessionProvenance(
		stock({
			citationAuthor: 'Daniels',
			citationWork: "Daniels' Running Formula",
			citationYear: 2013,
		}),
	)
	expect(provenance).toEqual({
		kind: 'corpus',
		citation: {
			author: 'Daniels',
			work: "Daniels' Running Formula",
			year: 2013,
			locator: null,
		},
	})
	expect(provenanceSentence(provenance)).toBe(
		"Source: Daniels — Daniels' Running Formula (2013)",
	)
})

test('the two uncited stock kinds are told apart by the notice they open with', () => {
	expect(
		readSessionProvenance(stock({ description: `${CONVENTION_NOTICE} 5 × 1 km.` })),
	).toEqual({ kind: 'convention' })
	expect(
		readSessionProvenance(
			stock({ description: `${HAND_WRITTEN_NOTICE} A shakeout.` }),
		),
	).toEqual({ kind: 'hand-written' })
})

test('a stock row with no Citation and no notice is unsourced, never assumed convention', () => {
	const provenance = readSessionProvenance(stock())
	expect(provenance).toEqual({ kind: 'unsourced' })
	expect(isPlaceable(provenance)).toBe(false)
})

test('the three sourceable stock kinds are all placeable', () => {
	for (const description of [
		CONVENTION_NOTICE,
		HAND_WRITTEN_NOTICE,
		'anything',
	]) {
		const cited = readSessionProvenance(
			stock({
				description,
				citationAuthor: 'Seiler',
				citationWork: 'Quantifying training intensity',
			}),
		)
		expect(isPlaceable(cited)).toBe(true)
	}
	expect(
		isPlaceable(readSessionProvenance(stock({ description: CONVENTION_NOTICE }))),
	).toBe(true)
})

test('an athlete-authored row reads as community whatever its description says', () => {
	// The description sniff must never reach an athlete's row: authorship is asked
	// first, so a community session quoting the notice cannot borrow trainm8's word.
	const provenance = readSessionProvenance({
		authorship: 'athlete',
		description: `${CONVENTION_NOTICE} my own session`,
		citationAuthor: null,
		citationWork: null,
		citationYear: null,
		citationLocator: null,
		attribution: { displayName: 'Jo Kraas', publishedAt: new Date(0) },
	})
	expect(provenance.kind).toBe('community')
	expect(provenanceSentence(provenance)).toBe('Published by Jo Kraas')
	expect(provenanceNonVouch(provenance)).toBe(COMMUNITY_NON_VOUCH)
})

test('a community row with no publish record says an athlete published it, not who', () => {
	const provenance = readSessionProvenance({
		authorship: 'athlete',
		description: null,
		citationAuthor: null,
		citationWork: null,
		citationYear: null,
		citationLocator: null,
		attribution: null,
	})
	expect(provenance).toEqual({ kind: 'community', attribution: null })
	expect(provenanceSentence(provenance)).toBe(
		'Published by an athlete — trainm8 cannot state who.',
	)
})

test('only a community row carries the non-vouch', () => {
	expect(provenanceNonVouch({ kind: 'convention' })).toBeNull()
	expect(provenanceNonVouch({ kind: 'hand-written' })).toBeNull()
	expect(
		provenanceNonVouch({
			kind: 'corpus',
			citation: { author: 'a', work: 'b', year: null, locator: null },
		}),
	).toBeNull()
})

test('every row of the shipped corpus reads back the provenance it was authored with', () => {
	// The corpus states its own provenance in `CorpusSession.provenance`; the
	// reader recovers it from the columns and the description the seed writes. If
	// these two ever disagree, a generated session's slot is lying about a row.
	const disagreements = CATALOGUE_CORPUS.filter((session) => {
		const read = readSessionProvenance({
			authorship: 'system',
			description: session.description,
			citationAuthor: session.citation?.author ?? null,
			citationWork: session.citation?.work ?? null,
			citationYear: session.citation?.year ?? null,
			citationLocator: session.citation?.locator ?? null,
		})
		return read.kind !== session.provenance
	})
	expect(disagreements.map((session) => session.key)).toEqual([])
})

test('no row of the shipped corpus is unplaceable', () => {
	// The retrieval rule — a session generation cannot source is a session
	// generation does not place — must not silently hollow out the corpus.
	const unplaceable = CATALOGUE_CORPUS.filter(
		(session) =>
			!isPlaceable(
				readSessionProvenance({
					authorship: 'system',
					description: session.description,
					citationAuthor: session.citation?.author ?? null,
					citationWork: session.citation?.work ?? null,
					citationYear: session.citation?.year ?? null,
					citationLocator: session.citation?.locator ?? null,
				}),
			),
	)
	expect(unplaceable.map((session) => session.key)).toEqual([])
})
