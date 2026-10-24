import { redirect } from 'react-router'
import { syncStravaActivities } from '#app/integrations/strava/sync.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	INTEGRATION_TOAST_LABELS,
	INTEGRATIONS_LABELS,
} from '#app/utils/labels.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.strava.sync.ts'

/**
 * Where to land after a manual sync. Historically the Activity Inbox; the
 * Integration Hub (#202) passes `?redirectTo=/settings/integrations` so its
 * "Sync now" keeps the athlete on the hub. Allowlisted — never an open
 * redirect.
 */
const SYNC_REDIRECT_ALLOWLIST = ['/settings/integrations', '/'] as const

function syncRedirectTarget(request: Request): string {
	const redirectTo = new URL(request.url).searchParams.get('redirectTo')
	return (
		SYNC_REDIRECT_ALLOWLIST.find((path) => path === redirectTo) ??
		'/settings/integrations'
	)
}

const T = INTEGRATION_TOAST_LABELS

/** Manual "Sync now" is a state-changing POST from the Integration Hub. */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const redirectTo = syncRedirectTarget(request)
	const result = await syncStravaActivities(userId)

	if (!result.ok) {
		const description =
			result.reason === 'revoked'
				? T.stravaRevoked
				: result.reason === 'app-inactive'
					? T.stravaAppInactive
					: result.reason === 'insufficient-scope'
						? T.stravaScope
						: result.reason === 'rate-limited'
							? T.stravaRateLimited
							: T.connectFirstNamed(INTEGRATIONS_LABELS.strava.name)
		return redirectWithToast(redirectTo, {
			title: T.syncFailed,
			description,
			type: 'error',
		})
	}

	const description =
		result.created === 0 ? T.nothingNew : T.imported(result.created)
	return redirectWithToast(redirectTo, {
		title: T.syncedWith(INTEGRATIONS_LABELS.strava.name),
		description,
		type: 'success',
	})
}

/** A bare GET just bounces back where the POST would have landed. */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return redirect(syncRedirectTarget(request))
}
