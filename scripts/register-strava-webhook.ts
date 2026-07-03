import 'dotenv/config'
import { registerStravaWebhookSubscription } from '#app/integrations/strava/webhook.server.ts'

/**
 * One-shot operator CLI to register the app-wide Strava push subscription
 * (#76, ADR 0013). Run once per environment after deploying a publicly
 * reachable `/webhook/strava`. Idempotent: re-running reports the existing
 * subscription rather than creating a duplicate (Strava allows only one per
 * app).
 *
 *   npx tsx scripts/register-strava-webhook.ts <callback-url>
 *
 * The callback URL defaults to the origin of STRAVA_REDIRECT_URI + /webhook/strava.
 * See app/integrations/strava/webhook-runbook.md for the full runbook.
 */

function resolveCallbackUrl(): string {
	const fromArg = process.argv[2]
	if (fromArg) return fromArg
	const fromEnv = process.env.STRAVA_WEBHOOK_CALLBACK_URL
	if (fromEnv) return fromEnv
	const redirect = process.env.STRAVA_REDIRECT_URI
	if (redirect) return new URL('/webhook/strava', redirect).toString()
	throw new Error(
		'No callback URL: pass one as the first argument, set STRAVA_WEBHOOK_CALLBACK_URL, or set STRAVA_REDIRECT_URI.',
	)
}

function required(name: string): string {
	const value = process.env[name]
	if (!value) throw new Error(`Missing required env var ${name}`)
	return value
}

async function main() {
	const result = await registerStravaWebhookSubscription({
		callbackUrl: resolveCallbackUrl(),
		clientId: required('STRAVA_CLIENT_ID'),
		clientSecret: required('STRAVA_CLIENT_SECRET'),
		verifyToken: required('STRAVA_WEBHOOK_VERIFY_TOKEN'),
	})

	if (result.created) {
		console.log(`✅ Created Strava webhook subscription (id ${result.id}).`)
	} else {
		console.log(
			`ℹ️  Strava webhook subscription already exists (id ${result.id}); nothing to do.`,
		)
	}
	console.log(
		`\n   Optional hardening: set STRAVA_WEBHOOK_SUBSCRIPTION_ID=${result.id} so\n   incoming events are matched against this subscription.`,
	)
}

main().catch((error: unknown) => {
	console.error('❌ Failed to register Strava webhook subscription:')
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
