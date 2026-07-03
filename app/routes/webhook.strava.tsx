import {
	parseStravaWebhookEvent,
	STRAVA_WEBHOOK_JOB_KIND,
} from '#app/integrations/strava/webhook.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import { type Route } from './+types/webhook.strava.ts'

/**
 * GET subscription verification, used only at subscription-registration time
 * (ADR 0013). Strava echoes a challenge that we must return as JSON, but only
 * when the `hub.verify_token` matches the configured token.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const mode = url.searchParams.get('hub.mode')
	const verifyToken = url.searchParams.get('hub.verify_token')
	const challenge = url.searchParams.get('hub.challenge')

	const expectedToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN
	if (
		mode === 'subscribe' &&
		expectedToken &&
		verifyToken === expectedToken &&
		challenge
	) {
		return Response.json({ 'hub.challenge': challenge })
	}
	return new Response('Forbidden', { status: 403 })
}

/**
 * Public Strava webhook endpoint (#76, ADR 0013). The handler is a notification
 * sink only: it validates the event, enqueues a fetch job, and returns 200 well
 * within Strava's 2-second budget. The activity body is fetched out of band by
 * the queue worker.
 *
 * Strava does not sign webhook payloads, so there is no HMAC to verify (see
 * webhook.server.ts). "Configured" therefore keys off the verify token — the
 * value that gates the subscription handshake — and events are additionally
 * matched against the optional subscription id.
 */
export async function action({ request }: Route.ActionArgs) {
	if (!process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
		// Webhooks are unconfigured (dev fallback is manual sync + reconciliation).
		return new Response('Webhook not configured', { status: 503 })
	}

	// Acknowledge unparseable or schema-invalid bodies with 200 so Strava does
	// not retry payloads this endpoint will never be able to process.
	let body: unknown
	try {
		body = await request.json()
	} catch {
		return new Response('Ignored', { status: 200 })
	}

	const payload = parseStravaWebhookEvent(
		body,
		process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID,
	)
	if (!payload) {
		return new Response('Ignored', { status: 200 })
	}

	await enqueueJob({ kind: STRAVA_WEBHOOK_JOB_KIND, payload })

	return new Response('OK', { status: 200 })
}
