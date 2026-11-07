import { getAppOrigin } from './app-origin.server.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Everything `/api/auth/*` answers, in the order ADR 0113 §1–§2 fixes:
 *
 * 1. **Production answers 404**, before the module that constructs Better
 *    Auth is imported. There is no switch: only the cutover PR, which deletes
 *    this gate, makes Better Auth reachable in production.
 * 2. **A foreign `Origin` is refused with 403** on anything but `GET`,
 *    `HEAD` and `OPTIONS`, cookie or not. Better Auth checks `Origin` only
 *    when a cookie is present, and not at all under `NODE_ENV=test`. A request
 *    with no `Origin` (a server-to-server call) goes on to Better Auth.
 * 3. Better Auth's own handler.
 *
 * This module imports nothing that constructs Better Auth or reads its
 * configuration, so loading the route in production costs nothing.
 */
export async function handleAuthRequest(request: Request): Promise<Response> {
	if (process.env.NODE_ENV === 'production') {
		return new Response('Not Found', { status: 404 })
	}
	if (!SAFE_METHODS.has(request.method.toUpperCase())) {
		const origin = request.headers.get('Origin')
		if (origin !== null && origin !== getAppOrigin()) {
			return new Response('Forbidden', { status: 403 })
		}
	}
	const { auth } = await import('./better-auth.server.ts')
	return auth.handler(request)
}
