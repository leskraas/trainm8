import { redirect } from 'react-router'
import { syncIntervalsIcuActivities } from '#app/integrations/intervalsicu/sync.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.intervalsicu.sync.ts'

/**
 * Where to land after a manual sync. The Integration Hub (#202) passes
 * `?redirectTo=/settings/integrations` so its "Sync now" keeps the athlete on
 * the hub; the default is the inbox. Allowlisted — never an open redirect.
 * Mirrors `/integrations/strava/sync` (#205).
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
	const result = await syncIntervalsIcuActivities(userId)

	if (!result.ok) {
		const description =
			result.reason === 'revoked'
				? 'Intervals.icu rejected the stored API key — paste a new one on the Integrations page to resume imports.'
				: 'Connect your Intervals.icu account before syncing.'
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
		title: 'Synced with Intervals.icu',
		description,
		type: 'success',
	})
}

/** A bare GET just bounces back where the POST would have landed. */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return redirect(syncRedirectTarget(request))
}
