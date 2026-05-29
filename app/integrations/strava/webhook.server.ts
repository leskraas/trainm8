import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
	autoMatchImport,
	createActivityImport,
	deleteActivityImportIfUnpromoted,
	updateActivityImportSnapshot,
} from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { StravaConnectionRevokedError } from './client.server.ts'
import {
	fetchStravaActivityById,
	mapActivityToImportInput,
} from './ingest.server.ts'
import { STRAVA_API_BASE, STRAVA_PROVIDER } from './types.ts'

/**
 * Strava webhook ingest (#76, ADR 0013). The public route verifies the
 * `X-Strava-Signature` HMAC and enqueues a job; the queue worker resolves the
 * owning athlete and performs the out-of-band work (fetch + create / refresh /
 * delete / revoke). Provider-specific concerns stay in this folder (ADR 0014).
 */

/** The `kind` registered against the job queue for webhook events. */
export const STRAVA_WEBHOOK_JOB_KIND = 'strava-webhook'

/**
 * Verify the `X-Strava-Signature` header: an HMAC-SHA256 hex digest of the raw
 * request body keyed with the webhook signing secret. Constant-time compared so
 * a mismatching or absent signature is rejected without leaking timing.
 */
export function verifyStravaSignature(
	rawBody: string,
	signature: string | null | undefined,
	secret: string,
): boolean {
	if (!signature) return false
	const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
	const expectedBuf = Buffer.from(expected, 'hex')
	const actualBuf = Buffer.from(signature.replace(/^sha256=/, ''), 'hex')
	if (expectedBuf.length !== actualBuf.length) return false
	return timingSafeEqual(expectedBuf, actualBuf)
}

/**
 * A Strava webhook event. `object_id` and `owner_id` are coerced to strings to
 * line up with how `ActivityImport.externalId` and
 * `AccountConnection.externalAthleteId` are stored. `updates` carries the
 * deauthorize flag (`{ authorized: 'false' }`) and assorted field edits.
 */
export const StravaWebhookEventSchema = z.object({
	object_type: z.enum(['activity', 'athlete']),
	object_id: z.union([z.number(), z.string()]).transform((id) => String(id)),
	aspect_type: z.enum(['create', 'update', 'delete']),
	owner_id: z.union([z.number(), z.string()]).transform((id) => String(id)),
	subscription_id: z.union([z.number(), z.string()]).optional(),
	event_time: z.number().optional(),
	updates: z.record(z.string(), z.string()).optional(),
})
export type StravaWebhookEvent = z.infer<typeof StravaWebhookEventSchema>

/** The opaque job payload enqueued for each accepted event. */
export type StravaWebhookJobPayload = {
	objectType: StravaWebhookEvent['object_type']
	objectId: string
	aspectType: StravaWebhookEvent['aspect_type']
	ownerId: string
	updates?: Record<string, string>
}

/** Project a parsed event onto the queue payload the worker consumes. */
export function toWebhookJobPayload(
	event: StravaWebhookEvent,
): StravaWebhookJobPayload {
	return {
		objectType: event.object_type,
		objectId: event.object_id,
		aspectType: event.aspect_type,
		ownerId: event.owner_id,
		...(event.updates ? { updates: event.updates } : {}),
	}
}

const StravaWebhookJobPayloadSchema = z.object({
	objectType: z.enum(['activity', 'athlete']),
	objectId: z.string(),
	aspectType: z.enum(['create', 'update', 'delete']),
	ownerId: z.string(),
	updates: z.record(z.string(), z.string()).optional(),
})

/** Parse a stored job payload back into a typed webhook payload. */
export function parseWebhookJobPayload(
	payload: Record<string, unknown>,
): StravaWebhookJobPayload {
	return StravaWebhookJobPayloadSchema.parse(payload)
}

/**
 * Process one webhook event out of band (the queue worker's job, #76). Resolves
 * the owning Account Connection from the Strava `owner_id` and dispatches by
 * `aspect_type`. Unknown owners and not-yet-handled aspects are deliberate
 * no-ops — only genuine fetch/DB errors throw so the queue retries them.
 */
export async function processStravaWebhookEvent(
	payload: StravaWebhookJobPayload,
): Promise<void> {
	const connection = await prisma.accountConnection.findFirst({
		where: {
			provider: STRAVA_PROVIDER,
			externalAthleteId: payload.ownerId,
		},
	})
	// Event for an athlete we don't have a connection for: nothing to do.
	if (!connection) return

	if (payload.objectType === 'athlete') {
		// Deauthorization at the source: move to `revoked` but keep non-promoted
		// imports so the athlete can re-authorize without losing the inbox (ADR
		// 0012). Only explicit disconnect cleans those up.
		if (
			payload.aspectType === 'update' &&
			payload.updates?.authorized === 'false'
		) {
			await prisma.accountConnection.update({
				where: { id: connection.id },
				data: { status: 'revoked' },
			})
		}
		return
	}

	if (payload.objectType === 'activity') {
		// A revoked grant can't be fetched against; skip until re-authorized.
		if (connection.status === 'revoked') return
		try {
			if (payload.aspectType === 'create') {
				await ingestCreatedActivity(connection, payload.objectId)
			} else if (payload.aspectType === 'update') {
				await refreshUpdatedActivity(connection, payload.objectId)
			} else if (payload.aspectType === 'delete') {
				// Promoted Recordings survive (ADR 0012); only the inbox copy is removed.
				await deleteActivityImportIfUnpromoted(
					STRAVA_PROVIDER,
					payload.objectId,
				)
			}
		} catch (err) {
			// A permanently revoked grant is a deliberate outcome, not a transient
			// failure: the client has already marked the connection `revoked`, so
			// complete the job as a no-op instead of retrying (matches manual sync
			// and backfill). Genuine fetch/DB errors still throw and retry.
			if (err instanceof StravaConnectionRevokedError) return
			throw err
		}
	}
}

/**
 * Refresh a non-promoted import from a source-side `update`. Promoted Recordings
 * are immutable (ADR 0012); when the local import is missing or already
 * promoted there is nothing to refresh and we skip the Strava fetch to spare the
 * rate budget.
 */
async function refreshUpdatedActivity(
	connection: StravaConnectionRef,
	externalId: string,
): Promise<void> {
	const existing = await prisma.activityImport.findUnique({
		where: {
			externalProvider_externalId: {
				externalProvider: STRAVA_PROVIDER,
				externalId,
			},
		},
		select: { promotedSessionId: true },
	})
	if (!existing || existing.promotedSessionId != null) return

	const activity = await fetchStravaActivityById(connection, externalId)
	await updateActivityImportSnapshot(mapActivityToImportInput(activity))
}

/**
 * Fetch a newly-created Strava activity and file it as an `ActivityImport`,
 * then auto-match it to an existing planned session (the manual-sync behaviour,
 * not backfill's auto-create). Idempotent: a duplicate event hits the unique
 * `(provider, externalId)` guard and is skipped.
 */
type StravaConnectionRef = {
	id: string
	accessToken: string
	refreshToken: string
	expiresAt: Date
	athleteId: string
}

async function ingestCreatedActivity(
	connection: StravaConnectionRef,
	externalId: string,
): Promise<void> {
	const activity = await fetchStravaActivityById(connection, externalId)
	const input = mapActivityToImportInput(activity)

	let importId: string
	try {
		importId = (await createActivityImport(connection.athleteId, input)).id
	} catch (err) {
		if (err instanceof Error && err.message.toLowerCase().includes('unique')) {
			return
		}
		throw err
	}

	// 'other' is import-only (ADR 0015): excluded from auto-match.
	if (input.discipline === 'other') return

	const timezone =
		(
			await prisma.athleteProfile.findUnique({
				where: { userId: connection.athleteId },
				select: { timezone: true },
			})
		)?.timezone ?? 'UTC'
	await autoMatchImport(connection.athleteId, importId, timezone)
}

const StravaSubscriptionSchema = z.object({
	id: z.number(),
	callback_url: z.string().optional(),
})

/**
 * Register (or confirm) the app-wide Strava push subscription (#76). Strava
 * permits exactly one subscription per app, so this first lists the existing
 * subscriptions and returns the current one untouched when present — making
 * re-runs of `scripts/register-strava-webhook.ts` idempotent. Otherwise it
 * creates the subscription; Strava then GETs the callback to verify the token.
 */
export async function registerStravaWebhookSubscription({
	callbackUrl,
	clientId,
	clientSecret,
	verifyToken,
}: {
	callbackUrl: string
	clientId: string
	clientSecret: string
	verifyToken: string
}): Promise<{ id: number; created: boolean }> {
	const listUrl = new URL(`${STRAVA_API_BASE}/push_subscriptions`)
	listUrl.searchParams.set('client_id', clientId)
	listUrl.searchParams.set('client_secret', clientSecret)

	const listResponse = await fetch(listUrl)
	if (!listResponse.ok) {
		throw new Error(
			`Strava push_subscriptions list failed (${listResponse.status})`,
		)
	}
	const existing = z
		.array(StravaSubscriptionSchema)
		.parse(await listResponse.json())
	if (existing.length > 0) {
		const current = existing[0]!
		// Strava allows only one subscription per app. If it already points at a
		// different callback, fail loudly rather than silently leaving the
		// environment wired to a stale host — the operator must recreate it.
		if (current.callback_url && current.callback_url !== callbackUrl) {
			throw new Error(
				`A Strava webhook subscription (id ${current.id}) already exists for a different callback URL (${current.callback_url}). Delete it before registering ${callbackUrl}.`,
			)
		}
		return { id: current.id, created: false }
	}

	// Strava's push-subscription create endpoint expects form-encoded parameters.
	const createResponse = await fetch(`${STRAVA_API_BASE}/push_subscriptions`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			callback_url: callbackUrl,
			verify_token: verifyToken,
		}).toString(),
	})
	if (!createResponse.ok) {
		throw new Error(
			`Strava push_subscriptions create failed (${createResponse.status})`,
		)
	}
	const created = StravaSubscriptionSchema.parse(await createResponse.json())
	return { id: created.id, created: true }
}
