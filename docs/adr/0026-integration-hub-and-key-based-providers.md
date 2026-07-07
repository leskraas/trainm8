# Integration Hub surface and key-based providers (Intervals.icu first)

Trainm8's only provider connection today is Strava, managed from a card on the
Activity Inbox. Strava's API program has moved to paid access, and the
providers athletes actually record with (Garmin, Suunto, Polar) gate their
APIs behind partner-approval programs. Intervals.icu sits in a sweet spot: it
aggregates activities from all of those services and exposes them through a
free, athlete-owned personal API key — but that key is a fundamentally
different auth model from OAuth, and the Inbox card does not scale to a second
provider, let alone "coming soon" entries. This ADR decides where integration
management lives and how a credential-based (non-OAuth) provider fits the
existing seams (ADR 0013, ADR 0014).

## Decision

### 1. One Integration Hub surface

Connection management moves off the Activity Inbox to a dedicated settings
surface, the **Integration Hub** (`/settings/integrations`). The hub lists
every activity source in one place:

- each **Account Connection** with its plain-language state (connected /
  importing history / needs re-authorization), `lastSyncedAt`, and the
  reconnect / disconnect / manual-sync actions;
- each available provider with its connect flow (Strava's OAuth redirect,
  Intervals.icu's API-key form);
- file upload as the always-available source (link to the existing upload
  flow, per the Non-goal "no in-app recorder");
- honest **coming-soon entries** for Garmin and Suunto: greyed cards stating
  the real reason ("their APIs require acceptance into a partner program") and
  pointing out that connecting Intervals.icu already carries Garmin/Suunto
  data in the meantime. No waitlists, no email capture.

The Activity Inbox keeps a slim source-summary line linking to the hub (and
the quiet "Sync now" safety valve, ADR 0013 #136); it stops hosting
connect/disconnect.

### 2. A display directory, not a behavior interface

The hub renders from a small, static, display-only **provider directory** —
name, tagline, auth kind, availability, connect route, logo. This is UI
metadata only. ADR 0014 stands: there is still **no shared TypeScript
interface** providers implement; each hub card's actions post to that
provider's own routes, and provider behavior stays in its folder. The
directory is how the hub composes per-provider cards without a registry
pattern leaking into behavior.

### 3. Intervals.icu as the first key-based provider

A new `app/integrations/intervalsicu/` folder follows the ADR 0014 layout,
minus the files its auth model makes meaningless (no `oauth.server.ts`, no
`webhook.server.ts` — the conventional layout describes, it does not
mandate):

- **Connect flow**: the athlete pastes their personal API key (from
  Intervals.icu → Settings → Developer Settings). The server validates it
  immediately with `GET /api/v1/athlete/0` (HTTP Basic, username `API_KEY`),
  reads the athlete id from the response, and creates the Account Connection.
  A bad key fails the form inline; nothing is stored.
- **Trigger model**: ADR 0013's layers **minus webhook** — personal API keys
  get no push events. Connect enqueues the count-based Backfill Window
  (ADR 0013 #151, same constants); ongoing ingest is manual "Sync now" plus
  the daily reconciliation sweep, which is generalized to enumerate active
  connections across providers and enqueue each provider's own reconcile job
  kind. Hub copy states the honest latency: "checked daily — sync now to pull
  the latest immediately."
- **Ingest**: activities list via `/api/v1/athlete/{id}/activities`
  (`oldest`/`newest` window), mapped in the folder's own `discipline-map.ts`
  to Disciplines (unmodeled types → `'other'`, ADR 0015), producing
  `ActivityImportInput` like every other source. Per-sample streams are
  ingested to the same downsampled Activity Stream shape (ADR 0020) so the
  Telemetry Overlay and NP-based TSS (ADR 0024) work identically. Rate budget
  (5,000 req/day **per athlete key**, vs Strava's per-app 600/15min) is
  generous; a courtesy pacer suffices.

### 4. Account Connection generalizes to credential auth

`AccountConnection.refreshToken` and `expiresAt` become **nullable**: an API
key neither rotates nor expires. The key is stored in `accessToken`
(consistent with how OAuth tokens are stored today). The status machine is
unchanged — key providers simply never enter `expired`; a 401/403 on any
fetch flips the connection to `revoked` (the athlete regenerated or deleted
the key at source), which the hub surfaces as "needs re-authorization" with a
paste-a-new-key reconnect. `provider` stays a plain string column;
`'intervalsicu'` joins the `Provider` union and the
`ActivityImport.externalProvider` enum.

## Considered options

- **Keep provider cards on the Activity Inbox**: Rejected. With 2 live + 2
  coming-soon providers the inbox stops being an inbox; connection management
  is settings-shaped (visited rarely, acted on deliberately), while the inbox
  is a work queue (visited after every workout).
- **A generic "connect provider" wizard driven by provider config**: Rejected
  — the OAuth redirect flow and the paste-a-key flow share almost nothing,
  and Garmin's eventual flow (OAuth 1.0a→2.0 hybrid, partner review) will
  differ again. Per-provider connect routes, composed by the hub, keep ADR
  0014's promise.
- **Intervals.icu via OAuth instead of API key**: Rejected for this slice.
  OAuth requires registering trainm8 as an Intervals.icu app and brings a
  100-requests/user/day cap (vs 5,000 for personal keys) and no webhooks
  benefit at this scale. The personal key is the self-coaching-athlete-shaped
  choice; an OAuth app remains the escape hatch if trainm8 ever serves users
  who shouldn't handle keys.
- **Waiting for direct Garmin/Suunto integrations instead**: Rejected — both
  require partner-program acceptance with review cycles outside our control,
  and Intervals.icu already mirrors their data through the athlete's own
  account. Direct integrations stay on the roadmap (their hub cards say so);
  this ADR just refuses to block activity ingest on them.
- **Encrypting the stored API key at rest**: Deferred, explicitly. OAuth
  tokens are stored unencrypted today; a key-encryption scheme is a
  cross-cutting change deserving its own decision rather than a rider on this
  one.

## Consequences

- Relaxing `refreshToken`/`expiresAt` to nullable is a non-destructive
  migration (no data rewritten, no rows lost).
- The reconciliation schedule stops being Strava-specific: the sweep
  enumerates all `active` connections and dispatches per-provider job kinds.
  This is the first cross-provider generalization ADR 0014 anticipated —
  extracted because two real consumers exist, not speculatively.
- The second provider is the test of ADR 0014's copy-the-folder claim with a
  different auth model. Expected similar code (backfill orchestration,
  auto-match filing) is tolerated per the rule of three; if Garmin (a third
  provider) repeats it, the pattern moves to `app/integrations/shared/`.
- Connecting both Strava and Intervals.icu can deliver the same workout
  twice (Intervals.icu itself syncs from Strava). Cross-provider dedup stays
  athlete-driven (CONTEXT.md relationship holds); the hub warns plainly when
  both are connected. An automatic heuristic is future work with its own ADR.
- The hub becomes the single seam future providers extend: a Garmin
  integration is a folder + a directory entry + its connect route, and its
  card lights up.
- API facts (auth header shape, endpoints, limits) were verified against
  Intervals.icu's public docs at design time (2026-07-07) and must be
  re-verified against a live key at build time.
