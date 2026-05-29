import { expect, test } from 'vitest'
import { createRateLimiter, type Clock } from './rate-limit.ts'

/** A deterministic clock: `sleep` simply advances virtual time, never waits. */
function fakeClock(): Clock & { ms: number } {
	const clock = {
		ms: 0,
		now() {
			return clock.ms
		},
		async sleep(ms: number) {
			clock.ms += ms
		},
	}
	return clock
}

test('acquisitions under the limit resolve without waiting', async () => {
	const clock = fakeClock()
	const limiter = createRateLimiter({ limit: 3, windowMs: 1000, clock })

	await limiter.acquire()
	await limiter.acquire()
	await limiter.acquire()

	// No virtual time passed: nothing had to wait.
	expect(clock.ms).toBe(0)
})

test('throttles past the limit but drops nothing', async () => {
	const clock = fakeClock()
	const limiter = createRateLimiter({ limit: 2, windowMs: 1000, clock })

	let completed = 0
	// Fire 5 acquisitions through a budget of 2-per-1000ms window.
	for (let i = 0; i < 5; i++) {
		await limiter.acquire()
		completed++
	}

	// All five eventually proceed — throttling delays, never drops.
	expect(completed).toBe(5)
	// The 3rd–5th had to wait for the window to roll: virtual time advanced.
	expect(clock.ms).toBeGreaterThanOrEqual(2000)
})
