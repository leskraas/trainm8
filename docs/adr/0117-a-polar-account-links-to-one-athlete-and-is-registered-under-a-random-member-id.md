# A Polar account links to one athlete, and is registered under a random member id

Status: Accepted (agent decision on #701, phase `poc`, 2026-11-13) · Builds
[ADR 0108](./0108-polar-comes-in-through-accesslink-as-fit-and-reaches-a-model-only-on-the-athletes-polar-opt-in.md)'s
"Not yet built" connect slice · Keeps
[ADR 0012](./0012-disconnect-preserves-recordings.md) · Backed by the AccessLink
v3 reference (https://www.polar.com/accesslink-api/, read 2026-11-13)

## Context

Connecting Polar takes two calls after the athlete consents in Polar Flow: the
token exchange, whose answer carries the Polar user id (`x_user_id`) and a token
that lives about a year with no refresh token, and the registration,
`POST /v3/users` with a `member-id` of our choosing. AccessLink answers that
registration with 409 for two different things: "user already registered to
partner" **or** "duplicated member-id". The webhook (next ticket) names an
exercise by Polar user id alone, so trainm8 must resolve that id to exactly one
athlete.

## Decision

1. **One Polar account, one athlete.** The callback reads `x_user_id` from the
   token answer and refuses the connect (`?polar=taken`) when another athlete
   already holds a Polar **Account Connection** with that `externalAthleteId`.
   It refuses **before** registering and never deregisters: the Polar
   registration belongs to the other athlete's connection, and a `DELETE` would
   break it. The athlete's own row (a reconnect after `revoked`) is not a
   conflict. The rule is checked in the callback, not by a unique index (see
   Consequences).
2. **A random member id per registration.** `member-id` is a fresh cuid, sent
   once and not stored; nothing in AccessLink reads it back. It is neither the
   trainm8 user id (a stable identifier handed to Polar for no use) nor reused,
   so a 409 can only mean "already registered", which counts as success (a
   reconnect after a failed deregistration). With the user id as member id, an
   athlete who reconnects with a second Polar account after a failed
   deregistration would get a "duplicated member-id" 409, read it as success,
   and hold a connection Polar never registered.
3. **Order of the callback.** state check → token exchange → taken check →
   registration → `connectAccountConnection` (Polar's token,
   `refreshToken: null`, `expiresAt` from `expires_in`) → enqueue the first
   sync. Any failure before the last write stores nothing; a registration left
   behind by a later failure is harmless, since the retry's 409 counts as
   success.
4. **Disconnect deregisters, best effort, from the hub's action.** The hub's
   `disconnect-polar` intent calls the Polar folder, which sends
   `DELETE /v3/users/{x_user_id}` with the stored token and the folder's
   timeout, logs a failure, and then runs `disconnectAccountConnection` (ADR
   0012: imports, sessions and aliases stay). There is no
   `/integrations/polar/disconnect` route, as there is none for Intervals.icu.

## Considered options

- **A unique index on `(provider, externalAthleteId)`.** Rejected for now: it
  would also bind Intervals.icu, where no rule says one key serves one athlete,
  and a migration would fail on any such pair already stored. A partial index
  (`WHERE provider = 'polar'`) is the durable form; Prisma's schema cannot state
  it, so it lives in raw SQL and every later `migrate dev` must keep it.
- **Treat every 409 as success with the user id as member id.** Rejected: §2.
- **Deregister the Polar account on a `taken` refusal.** Rejected: §1.

## Consequences

- **Debt (`poc`):** the taken check is a read before the upsert, so two athletes
  completing the callback for the same Polar account in the same instant could
  both link. The `build` move adds the partial unique index, and the webhook
  should treat a second match as an error, not pick one.
- An athlete who reconnects with a _different_ Polar account replaces the
  connection's `externalAthleteId`; the first Polar account stays registered
  with trainm8's client until its owner revokes it in Flow (as ADR 0108's
  best-effort deregistration already allows).
- A Polar token expires after about a year with no refresh; the next call
  answers 401, the connection becomes `revoked`, and the hub offers "Koble til
  på nytt". `expired` never occurs for Polar.
