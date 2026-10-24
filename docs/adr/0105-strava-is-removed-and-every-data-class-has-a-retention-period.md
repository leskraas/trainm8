# Strava is removed, and every data class has a retention period

Status: Accepted, owner to confirm the calls marked _Proposed_ · Ticket #543
(map #541) · Feeds #549 (the Art. 13 notice and the DPIA) · Backed by
[`ai-product-privacy-cost.md` §3.9 row 6, §6.1](../research/ai-product-privacy-cost.md#39-compliance-checklist-for-launch),
[`watch-data-trainm8-ingest.md` §6.3](../research/watch-data-trainm8-ingest.md#63-strava-is-still-wired-but-hidden-verified)
and
[`agent-strategy.md`, owner decisions 4–5](../research/agent-strategy.md#risks-open-questions-and-the-owners-decisions).
Not legal advice.

**Amends [ADR 0013](./0013-strava-trigger-model.md)**: Strava is no longer an
ingest source; the three-layer trigger model stands for the watch vendors.
**Amends [ADR 0012](./0012-disconnect-preserves-recordings.md)**: its "long
quiet timeout, to be calibrated later" is 90 days (§3). **Settles
[ADR 0098](./0098-source-terms-bind-per-origin-platform.md) §5's** open Strava
retention. **Amends
[ADR 0081](./0081-the-planning-redesign-speaks-norwegian-and-labels-ts-still-owns-every-word.md)
§4**: the privacy notice and the health-data consent are Norwegian wherever they
appear, because a legal text must read the same as the notice it points to.

## Context

Strava is wired but hidden: its routes, webhook, job kinds and sync fan-out are
live, and the connect route answers whenever the Strava secrets are set. The
owner does not use Strava, and the map's destination (an athlete's own assistant
reading trainm8 over MCP) is exactly what Strava's API Policy forbids for Strava
data and anything derived from it, consent or not (§5.3, §5.10, §5.16). Its §6.2
caps any cache of Strava data at seven days, and nothing enforces that today.
Separately, the Art. 13 notice and the DPIA must state how long each kind of
data is kept, and today nothing has a period.

Whether production holds any Strava rows is **unchecked**; nobody has run the
query. The check below is read-only.

## Decision

### 1. Strava is removed, not kept hidden and not revived

The integration code goes: `app/integrations/strava/`, the
`integrations.strava.*` and `webhook.strava` routes, the four Strava job kinds,
the Strava branch of the reconcile sweep and of `integrations.sync`, the hub's
legacy Strava card, `STRAVA_*` in `env.server.ts`, `tests/mocks/strava.ts` and
the two Strava scripts. The owner unsets the secrets:

```sh
fly secrets unset STRAVA_CLIENT_ID STRAVA_CLIENT_SECRET STRAVA_REDIRECT_URI \
  STRAVA_WEBHOOK_VERIFY_TOKEN STRAVA_WEBHOOK_SUBSCRIPTION_ID --app trainm8-085d
```

and deletes the webhook subscription at Strava
(`app/integrations/strava/webhook-runbook.md` has the call) before the code that
could do it is gone.

The string `strava` stays a valid **Origin Platform** and stays closed on the
`model` surface in `app/utils/source-terms.ts`, so a row that survives (§2) can
never reach a model. An athlete's own Strava bulk export uploaded as a file is
`upload`, not Strava API data, and is unaffected: that is how an athlete brings
Strava history in from now on.

**Not done in this change** (deadline): the code removal itself graduates as a
build ticket. Until it lands, unsetting the secrets above closes the connect
route and the webhook (both report "not configured" without them).

### 2. Strava rows already stored

- **Tokens:** a Strava `AccountConnection` is deleted outright. A credential for
  an integration that no longer exists has no purpose.
- **Payloads past seven days:** for every `originPlatform = 'strava'` import
  older than seven days, the cached payload goes: `rawJson` (replaced by a purge
  marker, the column is required), `polyline`, `lapsJson` and the
  `ActivityStream`. This is Policy §6.2's cache term.
- **The summary row** (date, discipline, duration, distance, TSS) is kept for
  now so the athlete's Training Load history does not shift (ADR 0012's reason).
  _Proposed, owner to confirm, and a question for legal_: Strava's agreement may
  require deleting **all** Strava data once trainm8 stops using the API. If
  legal reads it that way, the athlete first re-imports the same history from
  Strava's bulk export (origin `upload`), then the summary rows are deleted and
  load is recomputed. Order matters: an upload made while the Strava row exists
  dedupes into an alias of it and would go with it.

### 3. Retention per data class

| Data class                                               | Kept                                                                                                                                           | Then                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| The training record (sessions, logs, RPE, profile, load) | While the account exists                                                                                                                       | Deleted with the account (cascade)                                                  |
| Original files (`ActivityFile`, TCX/GPX in `rawJson`)    | While the import exists                                                                                                                        | Deleted with the import or the account                                              |
| Activity streams                                         | While the import exists                                                                                                                        | As above                                                                            |
| Provider payload `rawJson`, Intervals.icu                | While the import exists. _Proposed, owner to confirm_: no cache term binds it, and it is the fallback record where the FIT harvest got no file | As above                                                                            |
| Anything with Origin Platform `strava`                   | Payloads seven days (§2)                                                                                                                       | Purged; summary per §2                                                              |
| Provider tokens (`AccountConnection`)                    | While connected. A connection that has not been `active` for 90 days is disconnected (ADR 0012's quiet timeout)                                | Deleted on disconnect, timeout or account deletion                                  |
| Health-data consent records (#549)                       | While the account exists, every version and withdrawal                                                                                         | Deleted with the account                                                            |
| MCP audit log (ADR 0092 §11, from Phase 2)               | 12 months rolling. _Proposed, owner to confirm_                                                                                                | Deleted at 12 months or with the account                                            |
| Agent transcripts and tool payloads                      | **Not stored.** An assistant's chat lives with its provider. An in-app agent (ADR 0095) would get 30 days and a new decision here              | Never written to logs or the error tracker                                          |
| Login sessions, verifications                            | Until they expire (Epic Stack defaults)                                                                                                        | Deleted                                                                             |
| Job rows                                                 | 30 days after they finish. _Proposed_                                                                                                          | Deleted                                                                             |
| Deleted accounts                                         | Gone from the live database at once (`onDelete: Cascade`)                                                                                      | Survive only in backups, below                                                      |
| Backups                                                  | Fly's daily volume snapshots, kept 5 days (Fly's default; the owner verifies with `fly volumes snapshots list`)                                | Expire. A restore must re-delete accounts deleted after the snapshot (runbook owed) |
| Server logs and Sentry (if `SENTRY_DSN` is set)          | The provider's retention; the owner fills in the figure                                                                                        | Expire                                                                              |

The periods are enforced by a daily **retention sweep** beside the reconcile
sweep (`server/index.ts`), one query per row of the table that has a clock. _Not
built in this change_ (deadline): it graduates with the Strava removal.

## Read-only check for the owner (production)

Run with
`fly ssh console --app trainm8-085d -C "sqlite3 -readonly /litefs/data/sqlite.db"`:

```sql
SELECT 'connections' AS what, status, COUNT(*) FROM AccountConnection WHERE provider = 'strava' GROUP BY status
UNION ALL
SELECT 'imports', CASE WHEN promotedSessionId IS NULL THEN 'unpromoted' ELSE 'promoted' END, COUNT(*)
  FROM ActivityImport WHERE originPlatform = 'strava' OR externalProvider = 'strava' GROUP BY 2
UNION ALL
SELECT 'imports-older-than-7d', '', COUNT(*) FROM ActivityImport
  WHERE (originPlatform = 'strava' OR externalProvider = 'strava')
    AND createdAt < (CAST(strftime('%s','now','-7 days') AS INTEGER) * 1000)
UNION ALL
SELECT 'streams', '', COUNT(*) FROM ActivityStream s JOIN ActivityImport i ON i.id = s.activityImportId
  WHERE i.originPlatform = 'strava' OR i.externalProvider = 'strava'
UNION ALL
SELECT 'aliases', '', COUNT(*) FROM ActivityImportAlias WHERE originPlatform = 'strava' OR externalProvider = 'strava'
UNION ALL
SELECT 'pending-strava-jobs', status, COUNT(*) FROM Job WHERE kind LIKE 'strava%' GROUP BY status;
```

(Prisma stores SQLite `DateTime` as milliseconds since the epoch.) All zeros: §2
is moot and the removal is code only.

## Considered options

- **Keep Strava hidden and enforce the cache.** Rejected: hidden code is still
  an unauthenticated webhook and an OAuth callback in production, and every
  future model-facing reader would carry a Strava gate for a source nobody uses.
- **Revive Strava.** Rejected: its terms forbid the product's direction
  outright.
- **Delete every Strava row now, by migration.** Rejected while production is
  unchecked: it could silently rewrite the owner's load history.
- **Purge Intervals.icu `rawJson` after 90 days.** Considered; deferred to the
  owner (the table's _Proposed_ row).

## Open for the owner

- Run the check above; unset the Strava secrets; delete the Strava webhook
  subscription.
- _Proposed, owner to confirm:_ keep Strava summary rows until legal reads
  Strava's termination clause (§2).
- _Proposed, owner to confirm:_ Intervals.icu `rawJson` kept with the import;
  audit log 12 months; job rows 30 days.
- `prisma/seed-data/kody-strava-history.json` is a committed snapshot of Strava
  API data in a public repository, past the seven-day term even though it only
  seeds development. Recommended: rebuild the seed and the detection corpus from
  `intervals-real-history.json` or the owner's bulk export.
- Fill in Fly's log retention and Sentry's (if enabled) for the notice.

## Deferred hardening

Tracked for #639.

- **The Strava webhook and connect routes stay deployed until the removal ticket
  lands.** Unsetting the secrets closes them; if the secrets stay set, an
  unauthenticated public endpoint for an unused integration stays live.
- **No retention sweep yet.** Until it ships, Strava payloads past seven days,
  stale provider tokens and old job rows are kept with no limit, against what
  this ADR and the notice say.
- **A backup restore resurrects deleted accounts** for up to five days of
  deletions, with no runbook to re-delete them.
