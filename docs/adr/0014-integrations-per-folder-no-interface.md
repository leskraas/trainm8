# Integrations live in per-provider folders; no shared TypeScript interface

Trainm8 will integrate with multiple training-service providers over time
(Strava in V1, Garmin and Polar planned). The provider-specific work — OAuth
flow, webhook signature verification, API client, activity mapping — is
substantial, and a tempting reflex is to design a `TrainingDataProvider`
interface that all integrations implement. This ADR commits to the opposite
default.

## Decision

Each provider lives in its own folder under `app/integrations/{provider}/` with
a stable, conventional file layout. There is **no shared TypeScript interface**
that providers must implement. The only thing all providers share is the output
shape they produce: `ActivityImportInput` (already defined in
`app/utils/activity-import.server.ts`).

The expected per-provider layout:

```
app/integrations/{provider}/
  client.server.ts           API wrapper with token refresh
  oauth.server.ts            OAuth start + callback
  webhook.server.ts          signature verify + enqueue
  fetch-activity.server.ts   queue worker: fetch + map to ActivityImportInput
  discipline-map.ts          provider activity type → Discipline (incl. 'other')
  types.ts                   provider-native API types (private to the folder)
```

Provider-specific concerns (OAuth endpoints, scopes, signature algorithm,
rate-limit headers, paginated fetches, activity-type taxonomy) stay inside the
folder.

Shared infrastructure lives outside `integrations/`:

- `ActivityImportInput`, `createActivityImport()`, auto-match, promotion, TSS
  computation, snapshot recompute — already provider-agnostic, must remain so.
- The job queue (one queue, multiple enqueueing call sites).
- The SSE channel that pushes "new Activity Import landed" to the browser (one
  stream, all providers).
- The `Account Connection` table — `provider` is a string column, not a
  discriminator the schema enumerates.

## Considered options

- **Define a `TrainingDataProvider` interface in V1**: Rejected. With one
  implementation, the interface is gambled-against rather than discovered.
  Strava, Garmin, and Polar have meaningfully different OAuth models, webhook
  semantics, and rate-limit shapes; the lowest common denominator forces awkward
  leaks (e.g., "Garmin's webhook subscription is per-user; Strava's is per-app")
  that break the abstraction's promises anyway. CLAUDE.md explicitly forbids
  designing for hypothetical requirements.
- **Adapter pattern with a canonical model layer**: Rejected at this stage — the
  canonical model is `ActivityImportInput`, which already exists. Adding another
  transformation layer between "provider native" and `ActivityImportInput` would
  be the abstraction-for-its-own-sake outcome we are avoiding.
- **Scatter Strava code across `app/utils/strava-*.ts`**: Rejected. Mixing
  provider-specific code with shared utilities makes "where does Strava end and
  trainm8 begin?" answer-by-grep, and adds friction to dropping a new provider
  folder in place.

## Consequences

- Rule of three: when a third provider lands and a clear cross-provider pattern
  emerges (e.g., all three OAuth refresh flows have an identical shape), the
  pattern is extracted to `app/integrations/shared/` rather than retrofit into a
  top-level interface. Until then, two integrations may contain similar code —
  that is preferable to a wrong abstraction.
- Adding a new provider is a copy-the-folder operation: copy
  `app/integrations/strava/` to `app/integrations/garmin/`, rewrite the
  contents, register the OAuth route and webhook route, register the discipline
  mapping. No registry pattern, no plugin loader, no central switch statement
  that grows with each provider.
- Provider tests live next to provider code (`*.test.ts` siblings) and import
  only from that folder plus shared utilities.
- The Strava-specific discipline mapping table (where `Hike`, `Yoga`, `EBike`
  collapse to `'other'`) is **not** a global concept — it is private to
  `app/integrations/strava/discipline-map.ts`. Each provider's mapping is its
  own.
- Cross-provider concerns that we may discover later (dedup, conflict
  resolution, capability matrices for push-to-device) are deliberately out of
  scope for this ADR. If they materialize, they get their own ADRs and shared
  modules.
