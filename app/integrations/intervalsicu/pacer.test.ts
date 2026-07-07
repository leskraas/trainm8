import { expect, test } from 'vitest'
import { createCourtesyPacer, type Clock } from './pacer.ts'

/** A virtual clock: `sleep` advances time instantly. */
function fakeClock() {
	let t = 0
	const clock: Clock = {
		now: () => t,
		sleep: async (ms) => {
			t += ms
		},
	}
	return { clock, now: () => t }
}

test('the first request passes immediately', async () => {
	const { clock, now } = fakeClock()
	const pacer = createCourtesyPacer({ minIntervalMs: 250, clock })

	await pacer.acquire()

	expect(now()).toBe(0)
})

test('back-to-back requests are spaced by the courtesy interval', async () => {
	const { clock, now } = fakeClock()
	const pacer = createCourtesyPacer({ minIntervalMs: 250, clock })

	await pacer.acquire()
	await pacer.acquire()
	await pacer.acquire()

	// Two enforced gaps of 250ms each.
	expect(now()).toBe(500)
})

test('a request after a natural pause is not delayed', async () => {
	const { clock, now } = fakeClock()
	const pacer = createCourtesyPacer({ minIntervalMs: 250, clock })

	await pacer.acquire()
	await clock.sleep(1000) // real work between requests
	await pacer.acquire()

	expect(now()).toBe(1000)
})
