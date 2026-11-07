import { handleAuthRequest } from '#app/utils/auth/handler.server.ts'
import { type Route } from './+types/api.auth.$.ts'

/**
 * `/api/auth/*`: Better Auth (ADR 0094 §1), dark until the login cutover.
 * Production answers 404 and a foreign `Origin` gets 403 before Better Auth
 * sees the request (ADR 0113 §1–§2); `handleAuthRequest` holds both rules.
 */
export async function loader({ request }: Route.LoaderArgs) {
	return handleAuthRequest(request)
}

export async function action({ request }: Route.ActionArgs) {
	return handleAuthRequest(request)
}
