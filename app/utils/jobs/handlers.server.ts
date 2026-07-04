import { runStravaBackfill } from '#app/integrations/strava/backfill.server.ts'
import {
	runStravaReconciliation,
	STRAVA_RECONCILE_JOB_KIND,
} from '#app/integrations/strava/reconcile.server.ts'
import {
	processStravaWebhookEvent,
	STRAVA_WEBHOOK_JOB_KIND,
} from '#app/integrations/strava/webhook.server.ts'
import {
	NP_TSS_BACKFILL_JOB_KIND,
	runNpTssBackfill,
} from '#app/utils/load/np-tss-backfill.server.ts'
import { type JobHandlers } from './queue.server.ts'

/**
 * The registry of job kinds the worker knows how to run (ADR 0013). Adding a new
 * background job is a matter of enqueuing its `kind` and registering a handler
 * here — the queue and worker are otherwise unchanged.
 */
export const jobHandlers: JobHandlers = {
	'strava-backfill': async (payload) => {
		const athleteId = payload.athleteId
		if (typeof athleteId !== 'string') {
			throw new Error('strava-backfill job requires a string athleteId payload')
		}
		// `revoked` / `not-connected` are deliberate outcomes, not failures: the
		// Account Connection carries the truth and a fresh connect re-enqueues a
		// backfill. Only genuine fetch/DB errors throw and trigger retry.
		await runStravaBackfill(athleteId)
	},
	[STRAVA_WEBHOOK_JOB_KIND]: async (payload) => {
		// A missing Account Connection or a revoked grant is a deliberate no-op
		// inside the processor — only genuine fetch/DB errors throw and retry.
		await processStravaWebhookEvent(payload)
	},
	[STRAVA_RECONCILE_JOB_KIND]: async (payload) => {
		const athleteId = payload.athleteId
		if (typeof athleteId !== 'string') {
			throw new Error(
				'strava-reconcile job requires a string athleteId payload',
			)
		}
		// `not-connected` / `inactive` are deliberate outcomes, not failures: a
		// connection that was revoked between dispatch and processing is simply not
		// polled. Only genuine fetch/DB errors throw and trigger retry.
		await runStravaReconciliation(athleteId)
	},
	[NP_TSS_BACKFILL_JOB_KIND]: async () => {
		// One-shot TSS correction (#174): recompute Coggan rows so streams yield
		// true Normalized Power and average-power fallbacks read medium confidence.
		await runNpTssBackfill()
	},
}
