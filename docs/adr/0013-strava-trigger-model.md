# Activity ingest trigger model: webhook + manual sync + reconciliation poll

For the Strava integration (and future Garmin/Polar integrations), trainm8 needs
to decide how new activities flow from the source provider into our **Activity
Import** inbox. The trigger model determines whether we need a public webhook
endpoint, a job runner, polling state, and which UX latency the athlete
experiences.

## Decision

Use a three-layer hybrid trigger model from V1:

1. **Webhook (primary)** — the source provider POSTs to our public endpoint when
   activities are created, updated, or deleted. The webhook handler verifies the
   signature, enqueues a fetch job, and responds within the provider's 2-second
   timeout. The webhook is a notification only; the activity body is fetched out
   of band.
2. **Manual "Sync now" (UX safety valve)** — the athlete can trigger an
   on-demand sync from the imports UI. Same code path as webhook fetch, but
   range-scoped by `lastSyncedAt`.
3. **Reconciliation poll (sweep)** — a sparse scheduled job (daily) walks recent
   activities for each active Account Connection and creates any imports that
   were missed (webhook failures, downtime, lost events). Bounded by the
   provider's per-app rate limit budget.

All three layers feed the same job queue and the same downstream pipeline (fetch
→ create Activity Import → auto-match → SSE push).

## Considered options

- **Manual sync only**: Rejected as the long-term default — fine MVP, but the
  athlete must remember to click "Sync now" before reflecting on a workout, and
  shipping a webhook layer later would force a parallel infrastructure rewrite.
- **Polling only (every 15–30 min)**: Rejected — wastes the provider's per-app
  rate budget on athletes who haven't trained today, and adds 30 minutes of lag
  for athletes who have. With Strava's 600/15min cap shared across all Account
  Connections, frequent polling does not scale.
- **Webhook only (no reconciliation)**: Rejected — webhooks are not durable.
  Strava retries a small number of times and gives up. A 10-minute outage can
  silently drop activities across all athletes. Reconciliation is the safety
  net.
- **Synchronous fetch inside the webhook handler**: Rejected — Strava expects a
  200 within 2 seconds, and an outbound API call plus DB writes is not reliably
  within that budget. Decoupling via a queue is the only safe pattern.

## Consequences

- A new job-queue primitive is required. Trainm8 has no job runner today; this
  ADR commits us to introducing one. The minimum-viable shape is a SQLite-backed
  table plus a polling worker started from the entry server, scaling to BullMQ
  or Fly Machines schedules later.
- A new public route `/webhook/strava` is added. It must verify
  `X-Strava-Signature` (HMAC-SHA256 of raw body with the webhook signing secret)
  and reject unsigned requests. `hub.verify_token` is used only at subscription
  registration time, not on subsequent events.
- Local dev cannot receive Strava webhooks at `localhost`. An env-conditional
  path falls back to "manual sync + poll" in development; ngrok or similar is
  optional for end-to-end webhook testing.
- Strava webhooks carry only `{ object_id, owner_id, aspect_type }`. Each event
  triggers a follow-up `GET /activities/:id` call that costs a slot in the
  per-app 600/15min rate budget. Budgeting / backoff is the worker's job.
- `Account Connection.lastSyncedAt` is updated by all three triggers and is the
  high-water mark used by manual sync and reconciliation.
- The same queue and the same pipeline serve **Backfill Window** jobs on initial
  connect. One queue, three trigger sources (webhook, manual sync,
  reconciliation), one job kind (`fetch activity by external id`).
- Strava access tokens last 6 hours and refresh tokens rotate on each refresh.
  Token refresh is the worker's responsibility, performed on 401 or proactively
  before expiry; the new refresh token must be persisted.
- The reconciliation poll cadence (daily) is a knob we expect to tune once we
  have data on webhook reliability.

## Amendment (#74): job-queue technology

The Backfill Window (#74) is the first consumer of the job-queue primitive this
ADR committed to, so the implementation choice is recorded here.

- **Technology: a SQLite-backed `Job` table polled by an in-process worker.** No
  Redis, no BullMQ — the queue lives in the same SQLite database as the rest of
  the app and the worker is started from the entry server (`server/index.ts`)
  after `app.listen()`, stopped via `closeWithGrace`. This keeps trainm8 a
  single-process deploy. BullMQ + Redis or Fly Machines remain the documented
  escape hatch if queue volume ever outgrows polling.
- **Generic, not Strava-specific.** The `Job` model is domain-agnostic: a `kind`
  string selects a handler from a registry and an opaque JSON `payload` carries
  its arguments. `strava-backfill` is the first kind; webhook-fetch (#76) and
  reconciliation-poll (#77) register their own handlers against the same table
  and worker.
- **Lifecycle & retries.** `status` moves pending → running → completed |
  failed. `claimNextJob` atomically flips a single row to `running` (claim by
  id, so two workers never take the same job). A throwing handler calls
  `failJob`, which either returns the job to `pending` with `runAt` pushed out
  by exponential backoff (`1s * 2^attempts`) or, once `maxAttempts` is reached,
  marks it terminally `failed`. A job with no registered handler fails rather
  than spinning.
- **Concurrency = 1, by design.** The worker drains jobs sequentially. This is
  what makes multiple concurrent backfills _queue_ behind one another instead of
  hammering Strava's per-app budget all at once. Within the budget, a shared
  sliding-window rate limiter (600 req / 15 min) paces the activity fetches so
  throttling delays requests rather than dropping activities.
- **Backfill specifics.** `strava-backfill` fetches the 42-day window, files
  `ActivityImport` rows (idempotent via the unique `(provider, externalId)`
  guard), auto-promotes unmatched modeled-discipline imports to recording-only
  Workout Sessions (`'other'` excluded, ADR 0015), stamps `lastSyncedAt` to the
  latest activity and `backfillCompletedAt` on success, and recomputes Training
  Load across the window. Retries converge: an import left unpromoted by an
  interrupted run is promoted on the next attempt.

## Amendment (#77): reconciliation poll trigger and behaviour

The reconciliation sweep this ADR committed to is implemented as the third
trigger feeding the same queue and pipeline.

- **In-process daily schedule.** A single `unref`'d interval started from the
  entry server (`startReconciliationSchedule`, next to `startJobWorker`) fires
  daily and enqueues one `strava-reconcile` job per `status: 'active'` Account
  Connection. The cadence is the tuning knob this ADR anticipated. Consistent
  with the queue-technology amendment (#74), this is the minimum-viable shape
  for a single-process deploy; BullMQ repeatable jobs or Fly Machines schedules
  remain the documented escape hatch. The first sweep runs after one interval
  (not on boot) so frequent restarts don't trigger repeated fleet-wide polls.
- **Non-active connections are not polled.** Only `active` connections are
  dispatched; `revoked`, `error`, and `expired` are skipped. The per-connection
  handler re-checks status, so a connection revoked between dispatch and
  processing is a deliberate no-op rather than a fetch against a dead grant.
- **48h overlap window.** Each job fetches activities since `lastSyncedAt - 48h`
  so late edits and events that landed just before the watermark advanced are
  still caught. Deduplication relies on the unique `(provider, externalId)`
  guard — duplicate inserts are no-ops, so re-runs never double-import.
- **Forward-only watermark.** `lastSyncedAt` advances to the latest fetched
  activity time but never regresses (the overlap reaches back before the
  watermark); a sweep that finds only older activities leaves it untouched.
- **Auto-match, not auto-create.** Reconciliation links new imports to existing
  planned sessions (the manual-sync / webhook-`create` behaviour) and never
  auto-creates recording-only sessions — that asymmetry is backfill's alone.
  `'other'` imports (ADR 0015) wait in the inbox. Because every
  `createActivityImport` publishes to the Live Imports Stream (#75), recovered
  activities surface live without extra wiring.

## Amendment (#136): manual sync demoted to a secondary affordance

With all three trigger layers live — webhook (primary), reconciliation poll
(daily sweep), and the Live Imports Stream (#75) refreshing the inbox on its own
— the manual **"Sync now"** control no longer carries the normal path and a
prominent button for it misleads: it implies the athlete must press it to see
their activities.

- **Layer retained, emphasis lowered.** The "manual sync = UX safety valve"
  layer above is **kept**, not removed. It is still the athlete's only _fast_
  recourse when a webhook is missed or delayed (reconciliation is only daily, so
  removing it would regress that to a ≤24h wait), and it stays load-bearing for
  local development, where webhooks cannot reach `localhost`.
- **UI-only change.** On the Imports surface the control moves from a primary
  button in the card header to a quiet, secondary affordance in the card body,
  paired with copy that tells the athlete syncing is automatic. The underlying
  `syncStravaActivities` action and the `/integrations/strava/sync` route are
  unchanged — behaviour is identical; only visual emphasis changed.

## Amendment (#151): the Backfill Window is count-based, not a fixed 42 days

The backfill specifics amendment (#74) fetched a fixed **42-day** window, sized
to the CTL time constant. That size is right for one job — seeding Training Load
— but wrong for the job athletes actually care about on connect: getting a real
picture of _how they train_. Two consumers pull in opposite directions:

- **Training Load (CTL/ATL/TSB)** is an EWMA with a ~42-day time constant, so
  activities older than ~42 days contribute almost nothing to today's fitness.
  For this job, 42 days is the correct reach and more history is wasted work.
- **Athlete profiling** — AI plan generation, derived Personal Records (ADR
  0021), discipline coverage, "what kind of athlete is this" — is served by the
  _volume and variety_ of workouts, and barely cares about recency. A fixed
  recent window punishes infrequent or returning athletes (a once-a-week athlete
  has ~6 workouts in 42 days; a gap from injury leaves almost none).

### Decision

Make the reach **count-based with two guards** instead of a fixed window. On
connect, reach back far enough to collect at least `BACKFILL_TARGET_SESSIONS`
(50) modeled-discipline workouts, bounded by:

- `BACKFILL_MIN_DAYS` (42) — a hard minimum so Training Load is always seeded,
  even for an athlete who only just started; and
- `BACKFILL_MAX_DAYS` (365) — an age cap, so a sparse athlete's stale years
  don't misrepresent current training and the work stays bounded.

The cutoff is `max(now − MAX_DAYS, min(targetCutoff, now − MIN_DAYS))`, where
`targetCutoff` is the start of the Nth-newest modeled activity (or unbounded
when fewer than N exist). Only modeled disciplines count toward the target;
`'other'` activities (ADR 0015) ride along when they fall inside the chosen
window but never extend it. The three constants are tunable knobs, in the same
spirit as the reconciliation cadence (#77).

### Consequences

- **Eager enrichment stays eager, scoped to the kept set.** Phase bars and
  Activity Streams are still ingested during backfill (not deferred to read
  time), but over the count-bounded kept set rather than an open-ended window.
  At the target (~50 workouts) that is ~50–100 Strava requests — comfortably
  inside the per-app 600/15min budget (ADR 0013), paced by the shared limiter.
  This keeps phase bars populated for the **Session Ledger** list (which reads
  `ActivityImport.phaseBarsJson`), so a count-based window does not regress it.
- **Deferring telemetry to read time was considered and rejected — for now.**
  Lazy, on-detail-view stream fetches would decouple cost from window size, but
  (a) they aren't needed while the count target bounds eager work, (b) a
  rate-limited fetch inside a page loader can stall a page load, and (c) phase
  bars feed a _list_ surface, so they can't be lazily fetched on detail open
  without a regression. Lazy streams remain the documented escape hatch if the
  count target is ever raised high enough to strain the budget.
- **Load recompute is decoupled from the import reach.** Backfill recomputes
  Training Load only across `BACKFILL_MIN_DAYS`, not the (now longer) import
  window — current fitness depends only on the recent window, so recomputing
  further back is wasted work that cannot change today's numbers.
- **List-fetch cost is bounded but not minimised.** Backfill still pages the
  whole age-capped window from Strava (bounded by the fetcher's page cap) and
  trims afterward, rather than stopping early. Early-stop would depend on
  Strava's activity ordering; trimming after a full fetch is order-independent,
  and the list calls (≤ the page cap) are cheap next to the per-activity
  enrichment the count target already bounds.
