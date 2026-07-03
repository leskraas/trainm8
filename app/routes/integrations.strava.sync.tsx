import { redirect } from 'react-router'
import { syncStravaActivities } from '#app/integrations/strava/sync.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.strava.sync.ts'

/** Manual "Sync now" is a state-changing POST from the Imports surface. */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const result = await syncStravaActivities(userId)

	if (!result.ok) {
		const description =
			result.reason === 'revoked'
				? 'Your Strava authorization was revoked. Please reconnect.'
				: result.reason === 'insufficient-scope'
					? 'Trainm8 is not allowed to read your Strava activities. Reconnect and keep the activity access checkbox ticked.'
					: 'Connect your Strava account before syncing.'
		return redirectWithToast('/imports', {
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
	return redirectWithToast('/imports', {
		title: 'Synced with Strava',
		description,
		type: 'success',
	})
}

/** A bare GET just bounces back to the inbox. */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return redirect('/imports')
}
