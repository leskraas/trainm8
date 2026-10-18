import { expect, test } from 'vitest'
import { FIVE_MINUTES, inWholeFiveMinutes } from './five-minutes.ts'

// A laid session's minutes are whole five minutes (owner decision 2, #571):
// one rounding for the draft, the week split, Juster and the start's shares.

test.each([
	[42, 40],
	[42.5, 45],
	[43, 45],
	[45, 45],
	[0, 0],
	[2.4, 0],
] as const)('%f minutes is laid as %i', (minutes, laid) => {
	expect(inWholeFiveMinutes(minutes)).toBe(laid)
	expect(inWholeFiveMinutes(minutes) % FIVE_MINUTES).toBe(0)
})
