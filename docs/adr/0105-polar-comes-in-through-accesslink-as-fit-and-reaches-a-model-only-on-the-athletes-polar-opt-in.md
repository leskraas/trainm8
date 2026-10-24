# Polar comes in through AccessLink as FIT, and reaches a model only on the athlete's Polar opt-in

Status: Proposed, owner to confirm · Ticket #555 (map #541, W3) · Backed by
[`watch-data-sources.md` §2.2, §6, §7](../research/watch-data-sources.md#22-polar-accesslink-v3)
and the AccessLink v3 reference (https://www.polar.com/accesslink-api/, read
2026-10-24). Builds on
[ADR 0096](./0096-every-import-records-its-origin-platform-and-one-activity-is-one-row.md)
and gives [ADR 0098](./0098-source-terms-bind-per-origin-platform.md)'s `polar`
row its mechanism. Not legal advice.

## Decision

1. **Transport and origin.** A Polar exercise is filed with
   `externalProvider = 'polar'`, `originPlatform = 'polar'` and the exercise's
   hashed id as `externalId`, through `ingestFit` and so through
   `fileActivityImport` (ADR 0096 §4/§5). A Polar FIT of a run the athlete
   already uploaded or got through Intervals.icu becomes an Import Alias.
   `originPlatformForTransport('polar')` is `polar`.
2. **Endpoints.** The non-transactional `GET /v3/exercises` (the last 30 days,
   only what reached Flow after registration) and `GET /v3/exercises/{id}/fit`.
   The transactional endpoints are deprecated in Polar's reference, so they are
   not used. Polar's 30-day gap is covered by FIT upload and the Intervals.icu
   bridge, as WS §7 says.
3. **Triggers.** The signed webhook (one per client, `EXERCISE` events) names an
   exercise; the fetch always uses the athlete's own token, so a forged event
   can only cause a refetch. A sync over `GET /v3/exercises` is the backfill and
   the safety net (Polar drops a webhook after 7 days of failures). An exercise
   already held (transport key, import or alias) is never downloaded again.
4. **Signature.** `Polar-Webhook-Signature` is the hex HMAC-SHA256 of the raw
   body under the `signature_secret_key` Polar returns once at webhook creation
   (`POLAR_WEBHOOK_SECRET`). It is compared in constant time before the body is
   parsed; a truncated or missing signature fails.
5. **A 401/403 revokes the connection** and deletes nothing (ADR 0012). A FIT
   larger than 64 MiB is refused, as for an upload (#548).
6. **The Polar opt-in.** ADR 0098's `polar` model rule becomes `opt-in`:
   `sourceTerms(bindingSet, 'model', { optIns })` opens Polar only when the
   athlete's **Model Sharing Opt-In** for Polar is in `optIns`, and an opt-in
   can never open a platform whose rule is closed (Strava, the phone stores,
   unknown). It carries the Polar credit. The opt-in is separate from any
   general AI consent (Polar §3.1.1) and is off by default.
7. **The flag.** Nothing about Polar is offered until `POLAR_CLIENT_ID`,
   `POLAR_CLIENT_SECRET` and `POLAR_REDIRECT_URI` exist; the webhook route
   answers 503 until `POLAR_WEBHOOK_SECRET` exists (`docs/secrets.md`).

## Not yet built (this branch's slice)

The OAuth connect/callback/disconnect routes (`POST /v3/users` registration,
`DELETE /v3/users/{id}` on disconnect, tokens through `connectAccountConnection`
so they are encrypted at rest), the `/webhook/polar` route and its job, the hub
card, the opt-in table (`ModelSharingOptIn`, in the export) and its toggle. They
follow this ADR unchanged.

## Deferred hardening

- **No replay window on the webhook.** A captured, validly signed delivery can
  be replayed; it only re-triggers an idempotent fetch with the athlete's own
  token, so `timestamp` is not checked yet.
- **One webhook secret, no rotation.** `POLAR_WEBHOOK_SECRET` holds one key;
  rotating it means recreating Polar's webhook and redeploying, with deliveries
  failing between the two.
- **Deregistration on disconnect is best-effort** (when built): if
  `DELETE /v3/users/{id}` fails, trainm8 forgets the token while Polar still
  holds the grant until the athlete revokes it in Flow.
- **The opt-in record has no consent-text version or withdrawal history** until
  #549's consent records exist.
