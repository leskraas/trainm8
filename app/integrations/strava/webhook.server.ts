import { z } from 'zod'
import {
	autoSaveImport,
	createActivityImport,
	deleteImportIfAutoSaveMirror,
	isAutoSaveMirror,
	updateActivityImportSnapshot,
} from '#app/utils/activity-import.server.ts'
import { enrichImportTelemetry } from '#app/utils/activity-telemetry.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	StravaAppInactiveError,
	StravaConnectionRevokedError,
	StravaInsufficientScopeError,
} from './client.server.ts'
import {
	fetchStravaActivityById,
	fetchStravaActivityStreams,
	ingestActivityLaps,
	ingestActivityStreams,
	mapActivityToImportInput,
} from './ingest.server.ts'
import { STRAVA_API_BASE, STRAVA_PROVIDER } from './types.ts'

/**
 * Strava webhook ingest (#76, ADR 0013). The public route validates the event
 * and enqueues a job; the queue worker resolves the owning athlete and performs
 * the out-of-band work (fetch + create / refresh / delete / revoke).
 * Provider-specific concerns stay in this folder (ADR 0014).
 *
 * Strava does NOT sign webhook payloads — there is no `X-Strava-Signature` or
 * equivalent. Authenticity therefore rests on the subscription verify-token
 * handshake (only we can register this callback), an optional subscription-id
 * match on each event, and the fact that processing is owner-scoped and
 * idempotent: events for athletes we don't know are no-ops, and activity data
 * is always refetched from Strava with the athlete's own token, so a forged
 * event can at most trigger a redundant refetch or drop of an auto-save mirror.
 */

/** The `kind` registered against the job queue for webhook events. */
export const STRAVA_WEBHOOK_JOB_KIND = 'strava-webhook'

/**
 * A Strava webhook event. `object_id` and `owner_id` are coerced to strings to
 * line up with how `ActivityImport.externalId` and
 * `AccountConnection.externalAthleteId` are stored. `updates` carries the
 * deauthorize flag (`{ authorized: 'false' }`) and assorted field edits.
 */
const StravaWebhookEventSchema = z.object({
	object_type: z.enum(['activity', 'athlete']),
	object_id: z.union([z.number(), z.string()]).transform((id) => String(id)),
	aspect_type: z.enum(['create', 'update', 'delete']),
	owner_id: z.union([z.number(), z.string()]).transform((id) => String(id)),
	subscription_id: z.union([z.number(), z.string()]).optional(),
	event_time: z.number().optional(),
	updates: z.record(z.string(), z.string()).optional(),
})
type StravaWebhookEvent = z.infer<typeof StravaWebhookEventSchema>

/** The opaque job payload enqueued for each accepted event. */
export type StravaWebhookJobPayload = {
	objectType: StravaWebhookEvent['object_type']
	objectId: string
	aspectType: StravaWebhookEvent['aspect_type']
	ownerId: string
	updates?: Record<string, string>
}

/** Project a parsed event onto the queue payload the worker consumes. */
function toWebhookJobPayload(
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

/**
 * Validate a raw webhook body and project it onto the queue payload, or `null`
 * when the body is not a webhook event we handle. The public route is a thin
 * notification sink: it hands the parsed JSON here and enqueues whatever comes
 * back. Folding the event schema + projection inward keeps Strava's wire shape
 * private to this folder (ADR 0014).
 *
 * `expectedSubscriptionId` is an optional light guard (Strava sends the
 * subscription id on every event): when configured, an event whose
 * `subscription_id` doesn't match is treated as not-for-us and dropped. When
 * unset, subscription id is not checked, so the webhook works out of the box
 * right after registration and can be hardened later.
 */
export function parseStravaWebhookEvent(
	body: unknown,
	expectedSubscriptionId?: string | null,
): StravaWebhookJobPayload | null {
	const parsed = StravaWebhookEventSchema.safeParse(body)
	if (!parsed.success) return null
	if (
		expectedSubscriptionId &&
		String(parsed.data.subscription_id ?? '') !== expectedSubscriptionId
	) {
		return null
	}
	return toWebhookJobPayload(parsed.data)
}

const StravaWebhookJobPayloadSchema = z.object({
	objectType: z.enum(['activity', 'athlete']),
	objectId: z.string(),
	aspectType: z.enum(['create', 'update', 'delete']),
	ownerId: z.string(),
	updates: z.record(z.string(), z.string()).optional(),
})

/**
 * Process one webhook event out of band (the queue worker's job, #76). Resolves
 * the owning Account Connection from the Strava `owner_id` and dispatches by
 * `aspect_type`. Unknown owners and not-yet-handled aspects are deliberate
 * no-ops — only genuine fetch/DB errors throw so the queue retries them.
 *
 * Takes the raw stored job payload and validates it internally, so the job
 * handler stays a one-liner and the payload schema never leaves this folder.
 */
export async function processStravaWebhookEvent(
	rawPayload: Record<string, unknown>,
): Promise<void> {
	const payload = StravaWebhookJobPayloadSchema.parse(rawPayload)
	const connection = await prisma.accountConnection.findFirst({
		where: {
			provider: STRAVA_PROVIDER,
			externalAthleteId: payload.ownerId,
		},
	})
	// Event for an athlete we don't have a connection for: nothing to do.
	if (!connection) return

	if (payload.objectType === 'athlete') {
		// Deauthorization at the source: move to `revoked` but delete nothing, so
		// the athlete can re-authorize without losing anything (ADR 0012). Only an
		// explicit disconnect ever cleans up.
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
				// Only an untouched auto-save mirror follows the source-side delete;
				// a Recording the athlete has built on is their history and survives
				// (ADR 0012 as amended by ADR 0049).
				await deleteImportIfAutoSaveMirror(STRAVA_PROVIDER, payload.objectId)
			}
		} catch (err) {
			// Permanent, non-retryable outcomes complete the job as a no-op instead of
			// retrying forever (matches manual sync and backfill): a revoked grant
			// (client already marked the connection `revoked`), a missing activity
			// scope (a 403 no token refresh can fix — the athlete must reconnect), and
			// an inactive application (a 403 only the app owner can fix at Strava).
			// Genuine fetch/DB errors still throw and retry.
			if (
				err instanceof StravaConnectionRevokedError ||
				err instanceof StravaInsufficientScopeError ||
				err instanceof StravaAppInactiveError
			) {
				return
			}
			throw err
		}
	}
}

/**
 * Refresh an auto-save mirror from a source-side `update`. Auto-save promotes
 * every import on arrival (ADR 0049), so "promoted" no longer marks the athlete's
 * history — an untouched recording-only session does track the source and
 * refreshes; a Recording matched to a plan, carrying a materialized structure, or
 * logged by the athlete is frozen (ADR 0012). When the local import is missing or
 * frozen there is nothing to refresh and we skip the Strava fetch to spare the
 * rate budget.
 *
 * A mirror re-snapshots in full (ADR 0032): after the metric columns refresh,
 * `enrichImportTelemetry` replaces the Activity Stream, re-derives phase bars,
 * and re-enqueues the `structure-detection` job — so the detection is re-computed
 * against the fresh telemetry (re-stamping engineVersion + computedAt).
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
		select: { id: true },
	})
	if (!existing) return
	if (!(await isAutoSaveMirror(existing.id))) return

	const activity = await fetchStravaActivityById(connection, externalId)
	const input = mapActivityToImportInput(activity)
	const { updated } = await updateActivityImportSnapshot(input)
	// Lost a race between the guard read and the guarded update — the athlete
	// matched, edited, or logged it in between — so it is a frozen Recording now
	// (ADR 0012) and its telemetry and detection stay untouched.
	if (!updated) return

	// A source re-type to 'other' (ADR 0015) makes the import ineligible for
	// detection. Clear any prior WorkoutDetection so a structure can't outlive the
	// signal/discipline that justified it — otherwise a later promotion would
	// materialize a stale structure onto a now-unmodeled activity. Safe: the
	// import is an auto-save mirror here (guarded above), so nothing the athlete
	// built on is touched.
	if (input.discipline === 'other') {
		await prisma.workoutDetection.deleteMany({
			where: { activityImportId: existing.id },
		})
		return
	}

	// Re-snapshot the stream and re-compute the detection. A missing stream leaves
	// the prior telemetry in place rather than wiping it.
	const raw = await fetchStravaActivityStreams(connection, externalId)
	if (!raw) return
	// Re-fetch provider laps before enrichment enqueues detection (#356): the
	// snapshot update above cleared `lapsJson`, so this repopulates it so the
	// re-computed detection reads fresh laps on first compute.
	await ingestActivityLaps(
		connection,
		externalId,
		existing.id,
		raw.time,
		input.startedAt.getTime(),
	)
	await enrichImportTelemetry(
		connection.athleteId,
		existing.id,
		input.discipline,
		raw,
	)
}

/**
 * Fetch a newly-created Strava activity, file it as an `ActivityImport`, and
 * auto-save it (ADR 0049) — matched onto a same-day planned session when exactly
 * one fits, else onto a recording-only session of its own. Idempotent: a
 * duplicate event hits the unique `(provider, externalId)` guard and is skipped.
 */
type StravaConnectionRef = {
	id: string
	accessToken: string
	refreshToken: string | null
	expiresAt: Date | null
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

	const timezone =
		(
			await prisma.athleteProfile.findUnique({
				where: { userId: connection.athleteId },
				select: { timezone: true },
			})
		)?.timezone ?? 'UTC'
	await autoSaveImport(connection.athleteId, importId, timezone)

	// 'other' is import-only (ADR 0015): it auto-saves like anything else, but
	// takes no telemetry ingest (no overlay for unmodeled activities).
	if (input.discipline === 'other') return

	// Ingest the activity's downsampled telemetry as an Activity Stream so the
	// session's Workout Detail View overlay works end-to-end (#139, best-effort).
	await ingestActivityStreams(connection, [activity])
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
