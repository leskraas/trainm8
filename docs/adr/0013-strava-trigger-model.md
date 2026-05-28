# Activity ingest trigger model: webhook + manual sync + reconciliation poll

For the Strava integration (and future Garmin/Polar integrations), trainm8
needs to decide how new activities flow from the source provider into our
**Activity Import** inbox. The trigger model determines whether we need a
public webhook endpoint, a job runner, polling state, and which UX latency the
athlete experiences.

## Decision

Use a three-layer hybrid trigger model from V1:

1. **Webhook (primary)** — the source provider POSTs to our public endpoint
   when activities are created, updated, or deleted. The webhook handler
   verifies the signature, enqueues a fetch job, and responds within the
   provider's 2-second timeout. The webhook is a notification only; the
   activity body is fetched out of band.
2. **Manual "Sync now" (UX safety valve)** — the athlete can trigger an
   on-demand sync from the imports UI. Same code path as webhook fetch, but
   range-scoped by `lastSyncedAt`.
3. **Reconciliation poll (sweep)** — a sparse scheduled job (daily) walks
   recent activities for each active Account Connection and creates any
   imports that were missed (webhook failures, downtime, lost events). Bounded
   by the provider's per-app rate limit budget.

All three layers feed the same job queue and the same downstream pipeline
(fetch → create Activity Import → auto-match → SSE push).

## Considered options

- **Manual sync only**: Rejected as the long-term default — fine MVP, but the
  athlete must remember to click "Sync now" before reflecting on a workout, and
  shipping a webhook layer later would force a parallel infrastructure rewrite.
- **Polling only (every 15–30 min)**: Rejected — wastes the provider's
  per-app rate budget on athletes who haven't trained today, and adds 30 minutes
  of lag for athletes who have. With Strava's 600/15min cap shared across all
  Account Connections, frequent polling does not scale.
- **Webhook only (no reconciliation)**: Rejected — webhooks are not durable.
  Strava retries a small number of times and gives up. A 10-minute outage can
  silently drop activities across all athletes. Reconciliation is the safety
  net.
- **Synchronous fetch inside the webhook handler**: Rejected — Strava expects
  a 200 within 2 seconds, and an outbound API call plus DB writes is not
  reliably within that budget. Decoupling via a queue is the only safe pattern.

## Consequences

- A new job-queue primitive is required. Trainm8 has no job runner today; this
  ADR commits us to introducing one. The minimum-viable shape is a
  SQLite-backed table plus a polling worker started from the entry server,
  scaling to BullMQ or Fly Machines schedules later.
- A new public route `/webhook/strava` is added. It must verify
  `X-Strava-Signature` (HMAC-SHA256 of raw body with the webhook signing
  secret) and reject unsigned requests. `hub.verify_token` is used only at
  subscription registration time, not on subsequent events.
- Local dev cannot receive Strava webhooks at `localhost`. An env-conditional
  path falls back to "manual sync + poll" in development; ngrok or similar is
  optional for end-to-end webhook testing.
- Strava webhooks carry only `{ object_id, owner_id, aspect_type }`. Each
  event triggers a follow-up `GET /activities/:id` call that costs a slot in
  the per-app 600/15min rate budget. Budgeting / backoff is the worker's job.
- `Account Connection.lastSyncedAt` is updated by all three triggers and is
  the high-water mark used by manual sync and reconciliation.
- The same queue and the same pipeline serve **Backfill Window** jobs on
  initial connect. One queue, three trigger sources (webhook, manual sync,
  reconciliation), one job kind (`fetch activity by external id`).
- Strava access tokens last 6 hours and refresh tokens rotate on each refresh.
  Token refresh is the worker's responsibility, performed on 401 or
  proactively before expiry; the new refresh token must be persisted.
- The reconciliation poll cadence (daily) is a knob we expect to tune once we
  have data on webhook reliability.
