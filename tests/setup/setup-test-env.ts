import 'dotenv/config'
import './db-setup.ts'
import '#app/utils/env.server.ts'
// we need these to be imported first 👆

import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, vi, type MockInstance } from 'vitest'
import { resetStravaRateLimiter } from '#app/integrations/strava/rate-limit.ts'
import { server } from '#tests/mocks/index.ts'
import './custom-matchers.ts'

// Each test starts with Strava's whole read budget, so the reads earlier
// tests in a file made against MSW never defer a later one.
beforeEach(() => resetStravaRateLimiter())

// `findBy*` / `waitFor` give up after Testing Library's 1s default, but a route
// mounts through React Router's transition, so the DOM keeps HydrateFallback
// ("Loading...") until the whole tree commits. Some routes (plan.generate with
// its kept-mounted preset gallery: ~2,100 jsdom nodes, 15 chart tables) cost
// 0.3–1.8s of CPU to mount in jsdom, more under contention. That is the same
// starvation `testTimeout` in vite.config.ts already allows for; give the
// async utils the same headroom, still well under `testTimeout`, so a truly
// missing element fails with Testing Library's message, not a test timeout.
configure({ asyncUtilTimeout: 10_000 })

afterEach(() => server.resetHandlers())
afterEach(() => cleanup())

export let consoleError: MockInstance<(typeof console)['error']>
export let consoleWarn: MockInstance<(typeof console)['warn']>

beforeEach(() => {
	const originalConsoleError = console.error
	consoleError = vi.spyOn(console, 'error')
	consoleError.mockImplementation(
		(...args: Parameters<typeof console.error>) => {
			originalConsoleError(...args)
			throw new Error(
				'Console error was called. Call consoleError.mockImplementation(() => {}) if this is expected.',
			)
		},
	)

	const originalConsoleWarn = console.warn
	consoleWarn = vi.spyOn(console, 'warn')
	consoleWarn.mockImplementation((...args: Parameters<typeof console.warn>) => {
		originalConsoleWarn(...args)
		throw new Error(
			'Console warn was called. Call consoleWarn.mockImplementation(() => {}) if this is expected.',
		)
	})
})
