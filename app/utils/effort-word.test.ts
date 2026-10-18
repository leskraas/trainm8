import { expect, test } from 'vitest'
import { effortWordOfZone } from './effort-word.ts'

// One reading of a zone as an Effort Word, shared by the Start Option cards
// and I dag (spec #558): a threshold session is _hard_ on both, never _hard_
// on one and _middels_ on the other.

test.each([
	[1, 'rolig'],
	[2, 'rolig'],
	[3, 'middels'],
	[4, 'hard'],
	[5, 'hard'],
] as const)('zone %i reads %s', (zone, word) => {
	expect(effortWordOfZone(zone)).toBe(word)
})
