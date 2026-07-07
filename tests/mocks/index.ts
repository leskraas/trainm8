import closeWithGrace from 'close-with-grace'
import { setupServer } from 'msw/node'
import { handlers as githubHandlers } from './github.ts'
import {
	handlers as intervalsIcuHandlers,
	passthroughHandlers as intervalsIcuPassthroughHandlers,
} from './intervalsicu.ts'
import { handlers as pwnedPasswordApiHandlers } from './pwned-passwords.ts'
import { handlers as resendHandlers } from './resend.ts'
import {
	handlers as stravaHandlers,
	passthroughHandlers as stravaPassthroughHandlers,
} from './strava.ts'
import { handlers as tigrisHandlers } from './tigris.ts'

// Mock Strava during tests, and in dev only when explicitly opted in via
// MOCK_STRAVA=true. Otherwise dev hits the real Strava API (real OAuth + sync),
// while the other integrations stay mocked.
const mockStrava =
	process.env.NODE_ENV === 'test' || process.env.MOCK_STRAVA === 'true'

// Same deal for Intervals.icu: mocked in tests, opt-in mock in dev.
const mockIntervalsIcu =
	process.env.NODE_ENV === 'test' || process.env.MOCK_INTERVALSICU === 'true'

export const server = setupServer(
	...resendHandlers,
	...githubHandlers,
	...tigrisHandlers,
	...pwnedPasswordApiHandlers,
	...(mockStrava ? stravaHandlers : stravaPassthroughHandlers),
	...(mockIntervalsIcu
		? intervalsIcuHandlers
		: intervalsIcuPassthroughHandlers),
)

server.listen({
	onUnhandledRequest(request, print) {
		// Do not print warnings on unhandled requests to https://<:userId>.ingest.us.sentry.io/api/
		// Note: a request handler with passthrough is not suited with this type of url
		//       until there is a more permissible url catching system
		//       like requested at https://github.com/mswjs/msw/issues/1804
		if (request.url.includes('.sentry.io')) {
			return
		}
		// React-router-devtools send custom requests internally to handle some functionality, we ignore those
		if (request.url.includes('__rrdt')) {
			return
		}
		// Print the regular MSW unhandled request warning otherwise.
		print.warning()
	},
})

if (process.env.NODE_ENV !== 'test') {
	console.info('🔶 Mock server installed')

	closeWithGrace(() => {
		server.close()
	})
}
