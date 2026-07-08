# Intervals.icu upgrades to a registered OAuth app with webhooks

ADR 0026 shipped Intervals.icu as a key-based provider and explicitly rejected
OAuth for that slice: no webhook benefit "at this scale", a 100 req/user/day
OAuth cap vs 5,000 for personal keys, and app-registration friction. The
operator has since requested near-realtime ingest (#206), which Intervals.icu
only offers to registered OAuth applications — webhooks are the point, and
they drag OAuth in as a prerequisite. This ADR records the reversal and how
the OAuth + webhook layers fit the seams already proven by Strava (ADR 0013,
ADR 0014) and laid by the integration hub (ADR 0026).

## Decision

### 1. OAuth replaces the key connect flow — env-gated, with graceful fallback

`app/integrations/intervalsicu/` gains `oauth.server.ts` mirroring Strava's:
`isIntervalsIcuOAuthConfigured()`, authorize-URL builder with a CSRF `state`
cookie, code exchange, and a `connectIntervalsIcuOAuthAccount()` returning the
same domain connection metadata — now with real `refreshToken`/`expiresAt`.
New routes `integrations.intervalsicu.connect` (redirect) and
`integrations.intervalsicu.callback` follow the Strava route shapes.

- **When OAuth is configured** (env vars present), the hub card's connect
  action is the OAuth redirect; the paste-a-key form is retired from the UI.
- **When OAuth is not configured** (local dev before credentials exist, or
  the operator hasn't been approved yet), the card falls back to the existing
  paste-a-key flow — the same gate pattern as `isStravaOAuthConfigured()`.
  This keeps the feature buildable and demoable before the operator's app
  registration completes.

Dual-path forever was rejected (below); the fallback is a deployment gate,
not a product choice.

### 2. Existing key connections keep working; migration is reconnect

No forced break and no data migration. A key-stored connection
(`refreshToken IS NULL`) keeps its Basic-auth client, daily sweep, and "Sync
now". The client picks auth per connection: `refreshToken === null` → HTTP
Basic with the stored key (today's path); otherwise → `Bearer` access token
with Strava-style refresh machinery (proactive refresh before `expiresAt`,
persist rotated tokens, 4xx on refresh → `revoked`). The hub card on a
key-based connection shows a plain nudge: reconnecting via OAuth enables
near-realtime sync. Reconnect upserts the same `(athleteId, provider)` row
(`connectAccountConnection` already rotates credentials), so imports and
watermarks survive.

### 3. Webhook receiver, third verse of ADR 0013

A new public route `webhook.intervalsicu` + folder `webhook.server.ts`,
mirroring Strava's shape: verify → enqueue → 200 fast; the activity body is
fetched out of band by a worker job.

- **Verification**: Intervals.icu webhooks carry the secret configured in the
  app management UI; the handler compares it against
  `INTERVALSICU_WEBHOOK_SECRET` and rejects mismatches. Unconfigured secret →
  503 (same as Strava's unconfigured sink).
- **Events**: `ACTIVITY_UPLOADED` and `ACTIVITY_ANALYZED` map to
  create/update. Create → fetch + `createActivityImport` (idempotent on the
  unique `(provider, externalId)` guard) + auto-match; analyzed/update →
  `updateActivityImportSnapshot` (promoted Recordings untouched, ADR 0012).
  Unknown athlete → no-op. Exact event names and payload shape must be
  re-verified against the live app registration at build time.
- **Layers complete**: webhook (primary) + "Sync now" (safety valve) + daily
  reconciliation sweep (safety net) — ADR 0013's model, now whole for this
  provider. The sweep is unchanged.

### 4. Honest copy update

Once a connection is OAuth-based, the hub stops saying "checked daily": the
directory tagline and the connected-card copy state near-realtime sync with
the daily sweep as backstop. Key-based connections keep the daily-sync copy —
the copy tells the truth per connection, not per provider.

### 5. Environment contract (the first Intervals.icu env vars)

Following the Strava block in `.env.example` and the optional-zod pattern in
`env.server.ts`:

- `INTERVALSICU_CLIENT_ID`, `INTERVALSICU_CLIENT_SECRET`,
  `INTERVALSICU_REDIRECT_URI` — gate the OAuth flow.
- `INTERVALSICU_WEBHOOK_SECRET` — gates the webhook sink.

All optional: absent vars degrade gracefully (key flow, no webhook) rather
than crash. Production values arrive via `fly secrets` after the operator
registers the app (email api@intervals.icu with name, description, website,
logo, privacy policy, redirect URIs — see #206). Stored tokens remain
unencrypted at rest, inheriting ADR 0026's explicit deferral.

### 6. Living inside the 100 req/user/day OAuth cap

The cap ADR 0026 cited is real and per-user (vs 5,000 for personal keys).
Steady state is cheap — a webhook event costs ~1–2 requests. The pressure
point is connect-day backfill (~50–100 enrichment requests for the
count-based window, ADR 0013 #151). The backfill job budgets against the cap:
if the day's budget is exhausted, the job reschedules itself for the next day
and resumes (retries already converge, ADR 0013 #74). The per-athlete pacer
replaces the courtesy pacer for OAuth connections. Cap value and reset
semantics must be re-verified at build time; the budget constant is a knob.

## Considered options

- **Keep dual connect paths (key or OAuth) forever**: Rejected — #206 records
  the operator's call ("dual-path was explicitly not chosen"). Two live
  connect paths mean two copy states, two connect forms, and an athlete
  choice that is really a deployment detail. The key path survives only as
  the unconfigured-env fallback and for existing connections.
- **Force-migrate existing key connections**: Rejected — breaking a working
  connection to serve an upgrade inverts the honesty principle; reconnect is
  a one-tap athlete action the hub nudges toward.
- **Verify webhooks by IP allowlist or signature**: Not available —
  Intervals.icu offers a configured shared secret; that plus owner-scoped
  idempotent processing (the Strava precedent) is the available strength.
- **Synchronous fetch in the webhook handler**: Rejected for the same reasons
  as ADR 0013 — verify, enqueue, respond fast.
- **New provider string (`intervalsicu-oauth`)**: Rejected — same provider,
  same external athlete ids, same imports; the auth mode is a per-connection
  fact (`refreshToken` null or not), not a provider identity.

## Consequences

- No schema migration: ADR 0026 already made `refreshToken`/`expiresAt`
  nullable; OAuth simply populates them. The auth-mode dispatch keys off that.
- The client grows refresh machinery copied from Strava's shape. That is the
  second copy (rule of three, ADR 0026): if Garmin repeats it, token refresh
  moves to `app/integrations/shared/`.
- The operator's app registration is an external, human-time dependency.
  BUILD does not block on it: everything is env-gated and testable with
  mocks; production cut-over is `fly secrets set` + configuring the callback
  URL and secret in the Intervals.icu app UI.
- A second public webhook route exists. Like Strava's, it is a notification
  sink whose worst abuse case (forged event) causes an authenticated re-fetch
  no-op, bounded by the queue.
- The duplicate-delivery caveat (Strava + Intervals.icu both connected,
  ADR 0026) gets more visible with faster ingest; dedup stays athlete-driven,
  the hub warning stands.
- API facts asserted here (event names, payload shape, OAuth endpoints, cap
  semantics) were grounded in Intervals.icu's public docs/forum at design
  time (2026-07-08) and must be re-verified during BUILD against the real
  registered app.
