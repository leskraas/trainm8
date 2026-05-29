import {
	STRAVA_WEBHOOK_JOB_KIND,
	StravaWebhookEventSchema,
	toWebhookJobPayload,
	verifyStravaSignature,
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
 * sink only: it verifies the `X-Strava-Signature` HMAC, enqueues a fetch job,
 * and returns 200 well within Strava's 2-second budget. The activity body is
 * fetched out of band by the queue worker.
 */
export async function action({ request }: Route.ActionArgs) {
	const secret = process.env.STRAVA_WEBHOOK_SIGNING_SECRET
	if (!secret) {
		// Webhooks are unconfigured (dev fallback is manual sync + reconciliation).
		return new Response('Webhook not configured', { status: 503 })
	}

	const rawBody = await request.text()
	const signature = request.headers.get('x-strava-signature')
	if (!verifyStravaSignature(rawBody, signature, secret)) {
		return new Response('Invalid signature', { status: 403 })
	}

	// Acknowledge unparseable or schema-invalid bodies with 200 so Strava does
	// not retry payloads this endpoint will never be able to process.
	let body: unknown
	try {
		body = JSON.parse(rawBody)
	} catch {
		return new Response('Ignored', { status: 200 })
	}

	const parsed = StravaWebhookEventSchema.safeParse(body)
	if (!parsed.success) {
		return new Response('Ignored', { status: 200 })
	}

	await enqueueJob({
		kind: STRAVA_WEBHOOK_JOB_KIND,
		payload: toWebhookJobPayload(parsed.data),
	})

	return new Response('OK', { status: 200 })
}
