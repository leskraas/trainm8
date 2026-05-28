import { redirect } from 'react-router'
import {
	buildStravaAuthorization,
	isStravaOAuthConfigured,
} from '#app/integrations/strava/oauth.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.strava.connect.ts'

/** Starting the OAuth flow is a state-changing POST (CSRF-safe). */
export async function action({ request }: Route.ActionArgs) {
	await requireUserId(request)

	if (!isStravaOAuthConfigured()) {
		return redirectWithToast('/imports', {
			title: 'Strava unavailable',
			description: 'Strava is not configured on this server.',
			type: 'error',
		})
	}

	const { url, setCookie } = buildStravaAuthorization()
	return redirect(url, { headers: { 'set-cookie': setCookie } })
}

/** A bare GET to the start route just bounces back to the inbox. */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return redirect('/imports')
}
