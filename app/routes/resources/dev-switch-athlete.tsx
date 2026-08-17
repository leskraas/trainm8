/**
 * DEV ONLY — the action behind the floating athlete switcher.
 *
 * Action-only resource route. It 404s outside development (see
 * `requireDevelopment`) and logs in through the *real* `login()` +
 * `handleNewSession()` path with the seeded credentials, so there is no second
 * auth path to audit.
 */
import { login } from '#app/utils/auth.server.ts'
import {
	findDevCredentials,
	requireDevelopment,
} from '#app/utils/dev-athletes.server.ts'
import { handleNewSession } from '../_auth/login.server.ts'
import { type Route } from './+types/dev-switch-athlete.ts'

export async function loader() {
	requireDevelopment()
	throw new Response('Not found', { status: 404 })
}

/**
 * Only same-origin, root-relative paths get through — never an absolute URL and
 * never a protocol-relative `//host` path, which browsers treat as off-site.
 */
function safeReturnTo(value: unknown): string {
	if (typeof value !== 'string') return '/'
	if (!value.startsWith('/')) return '/'
	if (value.startsWith('//')) return '/'
	return value
}

export async function action({ request }: Route.ActionArgs) {
	requireDevelopment()

	const formData = await request.formData()
	const username = String(formData.get('username') ?? '')
	const redirectTo = safeReturnTo(formData.get('returnTo'))

	const credentials = findDevCredentials(username)
	if (!credentials) throw new Response('Unknown athlete', { status: 400 })

	// The real login helper, with the real password check — not a bypass of it.
	const session = await login(credentials)
	if (!session) {
		throw new Response(`Login failed for ${username} — reseed?`, {
			status: 400,
		})
	}

	return handleNewSession({ request, session, remember: true, redirectTo })
}
