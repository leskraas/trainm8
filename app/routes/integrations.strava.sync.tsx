import { redirect } from 'react-router'
import { syncStravaActivities } from '#app/integrations/strava/sync.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.strava.sync.ts'

/**
 * Where to land after a manual sync. Historically always the inbox; the
 * Integration Hub (#202) passes `?redirectTo=/settings/integrations` so its
 * "Sync now" keeps the athlete on the hub. Allowlisted — never an open
 * redirect.
 */
const SYNC_REDIRECT_ALLOWLIST = ['/imports', '/settings/integrations'] as const

function syncRedirectTarget(request: Request): string {
	const redirectTo = new URL(request.url).searchParams.get('redirectTo')
	return (
		SYNC_REDIRECT_ALLOWLIST.find((path) => path === redirectTo) ?? '/imports'
	)
}

/** Manual "Sync now" is a state-changing POST from the inbox or the hub. */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const redirectTo = syncRedirectTarget(request)
	const result = await syncStravaActivities(userId)

	if (!result.ok) {
		const description =
			result.reason === 'revoked'
				? 'Your Strava authorization was revoked. Please reconnect.'
				: result.reason === 'app-inactive'
					? 'Strava has this app disabled (status: inactive). This is on Strava’s side — reconnecting won’t help; the app must be activated in Strava’s developer settings.'
					: result.reason === 'insufficient-scope'
						? 'Trainm8 is not allowed to read your Strava activities. Reconnect and keep the activity access checkbox ticked.'
						: 'Connect your Strava account before syncing.'
		return redirectWithToast(redirectTo, {
			title: 'Sync failed',
			description,
			type: 'error',
		})
	}

	const description =
		result.created === 0
			? 'No new activities to import.'
			: `Imported ${result.created} new ${
					result.created === 1 ? 'activity' : 'activities'
				}.`
	return redirectWithToast(redirectTo, {
		title: 'Synced with Strava',
		description,
		type: 'success',
	})
}

/** A bare GET just bounces back where the POST would have landed. */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return redirect(syncRedirectTarget(request))
}
