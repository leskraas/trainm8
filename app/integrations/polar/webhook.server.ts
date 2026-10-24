import { createHmac, timingSafeEqual } from 'node:crypto'
import { PolarWebhookEventSchema } from './types.ts'

/**
 * Polar's webhook (ADR 0105). One webhook per client; every delivery carries
 * `Polar-Webhook-Signature`, the hex HMAC-SHA256 of the raw body under the
 * `signature_secret_key` Polar returned once, when the webhook was created
 * (`POLAR_WEBHOOK_SECRET`). The route is a notification sink: a verified
 * EXERCISE event becomes a job that fetches the FIT with the athlete's own
 * token, so a forged event can at most cause a refetch.
 */

export type PolarWebhookDelivery =
	| { kind: 'exercise'; polarUserId: string; exerciseId: string }
	| { kind: 'ping' }
	/** Signed, but not an event trainm8 reads (sleep, a malformed body). */
	| { kind: 'ignored' }
	| { kind: 'bad-signature' }

/** Constant-time check of the hex signature over the raw body. */
export function verifyPolarSignature(
	rawBody: string,
	signature: string | null,
	secret: string,
): boolean {
	if (!signature || !secret) return false
	const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
	const given = Buffer.from(signature.trim().toLowerCase(), 'hex')
	return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Verify, then read, one delivery. Nothing in the body is trusted before the
 * signature checks out.
 */
export function parsePolarWebhook(
	rawBody: string,
	signature: string | null,
	secret: string,
): PolarWebhookDelivery {
	if (!verifyPolarSignature(rawBody, signature, secret)) {
		return { kind: 'bad-signature' }
	}
	let json: unknown
	try {
		json = JSON.parse(rawBody)
	} catch {
		return { kind: 'ignored' }
	}
	const parsed = PolarWebhookEventSchema.safeParse(json)
	if (!parsed.success) return { kind: 'ignored' }
	const event = parsed.data
	if (event.event === 'PING') return { kind: 'ping' }
	if (event.event === 'EXERCISE' && event.user_id && event.entity_id) {
		return {
			kind: 'exercise',
			polarUserId: event.user_id,
			exerciseId: event.entity_id,
		}
	}
	return { kind: 'ignored' }
}
