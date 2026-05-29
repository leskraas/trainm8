import { stravaApiGet } from '#app/integrations/strava/client.server.ts'
import {
	destroyStravaOAuthStateCookie,
	exchangeStravaCode,
	getStravaOAuthState,
	stravaExpiresAtToDate,
	verifyStravaOAuthState,
} from '#app/integrations/strava/oauth.server.ts'
import {
	STRAVA_PROVIDER,
	StravaAthleteSchema,
} from '#app/integrations/strava/types.ts'
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

	let tokens
	try {
		tokens = await exchangeStravaCode(code)
	} catch {
		return failure('Could not exchange the authorization code with Strava.')
	}

	// Strava usually returns the athlete summary inline; otherwise fetch it.
	let externalAthleteId: string
	if (tokens.athlete) {
		externalAthleteId = tokens.athlete.id
	} else {
		try {
			const athlete = StravaAthleteSchema.parse(
				await stravaApiGet(
					{
						id: 'pending',
						accessToken: tokens.access_token,
						refreshToken: tokens.refresh_token,
						expiresAt: stravaExpiresAtToDate(tokens.expires_at),
					},
					'/athlete',
				),
			)
			externalAthleteId = athlete.id
		} catch {
			return failure('Could not read your Strava athlete profile.')
		}
	}

	await connectAccountConnection({
		athleteId: userId,
		provider: STRAVA_PROVIDER,
		externalAthleteId,
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: stravaExpiresAtToDate(tokens.expires_at),
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
