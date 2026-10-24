import {
	connectStravaAccount,
	destroyStravaOAuthStateCookie,
	getStravaOAuthState,
	stravaScopeGrantsActivityRead,
	verifyStravaOAuthState,
} from '#app/integrations/strava/oauth.server.ts'
import { STRAVA_PROVIDER } from '#app/integrations/strava/types.ts'
import { connectAccountConnection } from '#app/utils/account-connection.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { DeferJob, enqueueJob } from '#app/utils/jobs/queue.server.ts'
import {
	INTEGRATION_TOAST_LABELS,
	INTEGRATIONS_LABELS,
} from '#app/utils/labels.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.strava.callback.ts'

const T = INTEGRATION_TOAST_LABELS
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
			'/settings/integrations',
			{
				title: T.connectFailed(INTEGRATIONS_LABELS.strava.name),
				description,
				type: 'error',
			},
			{ headers: clearStateHeaders },
		)

	// Athlete declined consent at Strava.
	if (error) {
		return failure(T.stravaDenied)
	}

	// CSRF guard: the returned state must match the cookie we set at start.
	if (!verifyStravaOAuthState(cookieState, queryState)) {
		return failure(T.stravaState)
	}

	if (!code) {
		return failure(T.stravaNoCode)
	}

	// The athlete can untick the activity permission on Strava's consent screen.
	// Without it the token exchange still succeeds, but every activities fetch
	// 403s later — so reject the connection here with an actionable message
	// rather than storing a connection that can never sync.
	if (!stravaScopeGrantsActivityRead(url.searchParams.get('scope'))) {
		return failure(T.stravaNeedsScope)
	}

	let connection
	try {
		connection = await connectStravaAccount(code)
	} catch (err) {
		// The `/athlete` fallback found Strava's read budget spent. The athlete
		// is waiting on this redirect, so say when to try again, not wait.
		if (err instanceof DeferJob) return failure(T.stravaRateLimited(err.until))
		return failure(T.stravaCouldNotConnect)
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
		'/settings/integrations',
		{
			title: T.connected(INTEGRATIONS_LABELS.strava.name),
			description: T.connectedBody(INTEGRATIONS_LABELS.strava.name),
			type: 'success',
		},
		{ headers: clearStateHeaders },
	)
}
