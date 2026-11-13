/**
 * The app's own origin, from `APP_ORIGIN` (ADR 0114 §3). Better Auth's
 * `baseURL`, its trusted origins and the passkey RP ID come from here, and the
 * `/api/auth` route refuses any other `Origin`. It is never read from the
 * request: a `Host` header the client sends must not decide email links or the
 * RP ID a passkey is bound to for life.
 */
export function getAppOrigin() {
	const configured = process.env.APP_ORIGIN
	if (!configured) {
		throw new Error(
			'APP_ORIGIN is not set. Better Auth needs the app’s own origin (see .env.example).',
		)
	}
	return new URL(configured).origin
}
