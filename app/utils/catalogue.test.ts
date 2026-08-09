import { expect, test } from 'vitest'
import {
	catalogueTier,
	formatCitation,
	readCitation,
	suitsLevel,
} from './catalogue.ts'

test('tier answers provenance and nothing else', () => {
	const stock = { authorship: 'system', ownerId: null }
	const mine = { authorship: 'athlete', ownerId: 'athlete-1' }
	const theirs = { authorship: 'athlete', ownerId: 'athlete-2' }

	expect(catalogueTier(stock, 'athlete-1')).toBe('stock')
	expect(catalogueTier(mine, 'athlete-1')).toBe('mine')
	expect(catalogueTier(theirs, 'athlete-1')).toBe('community')
})

test('tier is viewer-relative — the same row reads differently to two athletes', () => {
	const row = { authorship: 'athlete', ownerId: 'athlete-1' }
	expect(catalogueTier(row, 'athlete-1')).toBe('mine')
	expect(catalogueTier(row, 'athlete-2')).toBe('community')
	// Which is why it can never be a stored column.
})

test('an orphaned athlete-authored row is never read as stock', () => {
	// The `Exercise` defect, stated as a test: its author's account is gone, so
	// `ownerId` is null — but trainm8 did not write it and must not claim it.
	const orphan = { authorship: 'athlete', ownerId: null }
	expect(catalogueTier(orphan, 'athlete-1')).toBe('community')
	expect(catalogueTier(orphan, null)).toBe('community')
})

test('a level floor admits that level and up, and no floor admits everyone', () => {
	expect(suitsLevel(null, 'beginner')).toBe(true)
	expect(suitsLevel('advanced', 'beginner')).toBe(false)
	expect(suitsLevel('advanced', 'advanced')).toBe(true)
	expect(suitsLevel('beginner', 'advanced')).toBe(true)
	expect(suitsLevel('intermediate', 'beginner')).toBe(false)
})

test('a level outside the vocabulary suits nobody rather than everybody', () => {
	expect(suitsLevel('elite', 'advanced')).toBe(false)
})

test('a citation reads whole or reads as absent', () => {
	expect(
		readCitation({
			citationAuthor: 'Daniels',
			citationWork: "Daniels' Running Formula",
			citationYear: 2013,
			citationLocator: 'ISBN 9781450431835',
		}),
	).toEqual({
		author: 'Daniels',
		work: "Daniels' Running Formula",
		year: 2013,
		locator: 'ISBN 9781450431835',
	})

	// A fragment is reported as absent rather than rendered as half a source.
	expect(
		readCitation({
			citationAuthor: null,
			citationWork: null,
			citationYear: 2013,
			citationLocator: null,
		}),
	).toBeNull()
})

test('a citation with no year prints without one rather than with a blank', () => {
	expect(
		formatCitation({
			author: 'Bakken',
			work: 'The Norwegian threshold model',
			year: null,
			locator: null,
		}),
	).toBe('Bakken — The Norwegian threshold model')
})
