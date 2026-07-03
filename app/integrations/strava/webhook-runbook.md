# Strava webhook runbook

How the Strava webhook ingest (#76, ADR 0013) is wired and how an operator
registers it per environment.

## What it does

Strava POSTs a tiny event (`{ object_type, object_id, aspect_type, owner_id }`)
to `/webhook/strava` whenever an athlete's activity is created, updated, or
deleted, or when the athlete deauthorizes the app. The route verifies the
`X-Strava-Signature` HMAC, enqueues a `strava-webhook` job, and returns `200`
within Strava's 2-second budget. The queue worker (ADR 0013) does the
out-of-band work:

- **create** — fetch the activity, file an `ActivityImport`, auto-match it to a
  planned same-day session (manual-sync behaviour). The single insert choke
  point pushes the live Imports SSE event (#75).
- **update** — refresh a non-promoted import's snapshot from Strava. Promoted
  **Recordings** are immutable to source-side edits (ADR 0012); the fetch is
  skipped entirely for them.
- **delete** — remove a non-promoted import. Promoted **Recordings** survive
  (ADR 0012).
- **deauthorize** (`object_type: athlete`, `updates.authorized: 'false'`) — move
  the `AccountConnection` to `revoked`. Non-promoted imports are **kept** so the
  athlete can re-authorize without losing the inbox.

All flows are idempotent: duplicate `create` events hit the unique
`(provider, externalId)` guard, and refresh/delete/revoke are effect-idempotent.

## Environment variables

| Var                              | Purpose                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| `STRAVA_CLIENT_ID`               | Strava app client id (subscription registration).             |
| `STRAVA_CLIENT_SECRET`           | Strava app client secret.                                     |
| `STRAVA_WEBHOOK_VERIFY_TOKEN`    | Random string echoed during the GET subscription handshake.   |
| `STRAVA_WEBHOOK_SUBSCRIPTION_ID` | Optional. Match incoming events against this subscription id. |
| `STRAVA_WEBHOOK_CALLBACK_URL`    | Optional. Public URL of `/webhook/strava`.                    |

When `STRAVA_WEBHOOK_VERIFY_TOKEN` is unset, the route reports the integration
as unconfigured (`503`) and the system relies on the dev fallback below.

## Security model (Strava does not sign events)

Strava's webhook API has **no payload signature** — there is no
`X-Strava-Signature` header or equivalent. Do not add an HMAC check; it would
reject every real event. Event trust rests on three things instead:

1. **Verify token** — set at subscription time and echoed back during the GET
   handshake, so only someone who knows it can register this callback.
2. **Subscription id** (optional) — Strava stamps each event with its
   `subscription_id`; set `STRAVA_WEBHOOK_SUBSCRIPTION_ID` to drop events that
   don't match yours.
3. **Safe processing** — the worker only acts on `owner_id`s we have a
   connection for, refetches activity data from Strava with the athlete's own
   token, and never mutates a promoted Recording. A forged event can therefore
   at most trigger a redundant refetch or drop an inbox-only import.

## Registering the subscription (once per environment)

After deploying a publicly reachable `/webhook/strava`:

```sh
npx tsx scripts/register-strava-webhook.ts https://your-host/webhook/strava
```

The callback URL can also come from `STRAVA_WEBHOOK_CALLBACK_URL`, or is derived
from the origin of `STRAVA_REDIRECT_URI`. Strava immediately GETs the callback
with `hub.challenge` + `hub.verify_token`; the route echoes the challenge when
the token matches. The script is **idempotent** — Strava allows only one
subscription per app, so a re-run reports the existing subscription instead of
creating a duplicate.

## Local development fallback

`localhost` cannot receive Strava webhooks. In development, leave the webhook
unconfigured and rely on:

- **Manual "Sync now"** (#72) from the Imports surface, and
- the **daily reconciliation poll** (#77),

which feed the same queue and pipeline. Use ngrok (or similar) only if you want
to exercise the webhook path end-to-end locally; it is not required.
