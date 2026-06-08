import {
	connectStravaAccount,
	destroyStravaOAuthStateCookie,
	getStravaOAuthState,
	verifyStravaOAuthState,
} from '#app/integrations/strava/oauth.server.ts'
import { STRAVA_PROVIDER } from '#app/integrations/strava/types.ts'
import { connectAccountConnection } from '#app/utils/account-connection.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.strava.callback.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const url = new URL(request.url)

	const error = url.searchParams.get('error')
	const code = url.searchParams.get('code')
	const queryState = url.searchParams.get('state')
	const cookieState = getStravaOAuthState(request)

	// Always clear the one-shot state cookie on the way out.
	const clearStateHeaders = { 'set-cookie': destroyStravaOAuthStateCookie }
	const failure = (description: string) =>
		redirectWithToast(
			'/imports',
			{ title: 'Strava connection failed', description, type: 'error' },
			{ headers: clearStateHeaders },
		)

	// Athlete declined consent at Strava.
	if (error) {
		return failure('Authorization was denied.')
	}

	// CSRF guard: the returned state must match the cookie we set at start.
	if (!verifyStravaOAuthState(cookieState, queryState)) {
		return failure('Security check failed. Please try connecting again.')
	}

	if (!code) {
		return failure('Strava did not return an authorization code.')
	}

	let connection
	try {
		connection = await connectStravaAccount(code)
	} catch {
		return failure('Could not connect your Strava account. Please try again.')
	}

	await connectAccountConnection({
		athleteId: userId,
		provider: STRAVA_PROVIDER,
		...connection,
	})

	// Kick off the 42-day Backfill Window out of band (#74). The callback must
	// return well within Strava's timeout, so the fetch runs on the worker.
	await enqueueJob({
		kind: 'strava-backfill',
		payload: { athleteId: userId },
	})

	return redirectWithToast(
		'/imports',
		{
			title: 'Connected to Strava',
			description: 'Your Strava account is now linked to Trainm8.',
			type: 'success',
		},
		{ headers: clearStateHeaders },
	)
}
