import { z } from 'zod'

const schema = z.object({
	NODE_ENV: z.enum(['production', 'development', 'test'] as const),
	DATABASE_PATH: z.string(),
	DATABASE_URL: z.string(),
	SESSION_SECRET: z.string(),
	INTERNAL_COMMAND_TOKEN: z.string(),
	HONEYPOT_SECRET: z.string(),
	CACHE_DATABASE_PATH: z.string(),
	// If you plan on using Sentry, remove the .optional()
	SENTRY_DSN: z.string().optional(),
	// If you plan to use Resend, remove the .optional()
	RESEND_API_KEY: z.string().optional(),

	// AI Training Plan generation (PRD #103, ADR 0016). The hosted-Claude model
	// client reads this key; optional so the app boots locally/in CI without it.
	// When unset, plan generation falls back to the deterministic stub client and
	// the wizard never reaches the real provider. Set as a Fly secret before the
	// feature ships (`fly secrets set ANTHROPIC_API_KEY=…`).
	ANTHROPIC_API_KEY: z.string().optional(),
	// Alternative to ANTHROPIC_API_KEY for local dev: a Claude Code OAuth token
	// (`sk-ant-oat01-…` from `claude setup-token`) lets a developer with only a
	// Claude subscription drive the real provider. Routed as Bearer auth with the
	// Claude Code identity prefix (see anthropic-client.ts). Optional; prefer a
	// real API key in production.
	CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),
	// If you plan to use GitHub auth, remove the .optional()
	GITHUB_CLIENT_ID: z.string().optional(),
	GITHUB_CLIENT_SECRET: z.string().optional(),
	GITHUB_REDIRECT_URI: z.string().optional(),
	GITHUB_TOKEN: z.string().optional(),

	// Strava Account Connection (ADR 0014). Optional: when unset, the connect
	// affordance is hidden and the OAuth routes report the integration as
	// unconfigured rather than crashing.
	STRAVA_CLIENT_ID: z.string().optional(),
	STRAVA_CLIENT_SECRET: z.string().optional(),
	STRAVA_REDIRECT_URI: z.string().optional(),
	// Webhook ingest (#76, ADR 0013). Strava does NOT sign webhook payloads, so
	// event authenticity rests on: (1) the verify token, echoed during the
	// subscription handshake so only we can register this callback; (2) the
	// optional subscription id, matched against incoming events as a light guard;
	// and (3) owner-scoped, idempotent processing (unknown athletes are no-ops,
	// data is refetched from Strava with the real token). Optional: when the
	// verify token is unset, the webhook route reports the integration as
	// unconfigured and the dev fallback is manual sync + reconciliation.
	STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
	STRAVA_WEBHOOK_SUBSCRIPTION_ID: z.string().optional(),

	ALLOW_INDEXING: z.enum(['true', 'false']).optional(),

	// Tigris Object Storage Configuration
	AWS_ACCESS_KEY_ID: z.string(),
	AWS_SECRET_ACCESS_KEY: z.string(),
	AWS_REGION: z.string(),
	AWS_ENDPOINT_URL_S3: z.string().url(),
	BUCKET_NAME: z.string(),
})

declare global {
	namespace NodeJS {
		interface ProcessEnv extends z.infer<typeof schema> {}
	}
}

export function init() {
	const parsed = schema.safeParse(process.env)

	if (parsed.success === false) {
		console.error(
			'❌ Invalid environment variables:',
			parsed.error.flatten().fieldErrors,
		)

		throw new Error('Invalid environment variables')
	}
}

/**
 * This is used in both `entry.server.ts` and `root.tsx` to ensure that
 * the environment variables are set and globally available before the app is
 * started.
 *
 * NOTE: Do *not* add any environment variables in here that you do not wish to
 * be included in the client.
 * @returns all public ENV variables
 */
export function getEnv() {
	return {
		MODE: process.env.NODE_ENV,
		SENTRY_DSN: process.env.SENTRY_DSN,
		ALLOW_INDEXING: process.env.ALLOW_INDEXING,
	}
}

type ENV = ReturnType<typeof getEnv>

declare global {
	var ENV: ENV
	interface Window {
		ENV: ENV
	}
}
