# Workouts gain a private-by-default visibility field; sharing is a separate effort

Map #326 (Workout auto-analysis) auto-materializes a **Workout** onto a
recording-only session when a **Structure Detection** clears the honesty gate
(ADR 0032/0033). ADR 0033 fixed that template-library membership is a
Workout-level *visibility* axis, orthogonal to the `detected` **Session Source**,
and left the field's shape and the promotion flow to "the save-as-template work".
Ticket #336 was that decision.

Grilling #336 against the codebase surfaced two facts that reframed it:

1. **There is no library and no sharing today.** Every `Workout` is a private
   row, 1:1 with its session, never shared, and there is no template library or
   "save as template" (ADR 0003). Nothing in the app lists Workouts as reusable
   (`workout.findMany` does not exist). A materialized `detected` Workout is
   therefore already out of any library *by construction*, exactly like a
   `generated` session's Workout — which needed no visibility field for the same
   reason.
2. **The visibility the map owner wants is not library-membership — it is
   *social*.** The intent is public and shared workouts, invites to planned
   sessions, a Strava-rival social layer. That is a much larger effort whose
   model (public / shared / invited / followers, and enforcement) does not exist
   yet, seeded as its own map in #337.

So #336's stated premise — "auto-import can't create the out-of-library Workout
until this field exists" — does not hold: auto-import ships without it.

## Decision

**Land a minimal, private-by-default visibility axis now as inert groundwork;
defer all real sharing semantics to the social-layer effort (#337).**

- **A Workout-level `visibility` field.** It lives on `Workout` (per ADR 0033's
  orthogonality), not on the session. It is a **string with a documented
  vocabulary and a default**, matching the repo idiom for `source`
  (`@default("authored")`) and `status` (`@default("scheduled")`) — *not* a
  boolean. V1 vocabulary is a single value, **`private`**, with room for the
  social effort to add `public` / `shared` / `invited` / etc. A string enum
  avoids the boolean trap (a `Boolean isPublic` would foreclose shared/invited
  and force a migration the moment sharing lands).
- **Default `private` for every source.** `authored`, `generated`, `recorded`,
  and `detected` Workouts are all created `private`. This exactly preserves
  today's behaviour (every Workout is already effectively private — enforced
  implicitly by every query being scoped to `ownerId`) and makes that privacy an
  **explicit, queryable fact** instead of an implicit one.
- **No consumer, no flow, no UI now.** Nothing reads `visibility` yet; there is
  no library query to filter and no "save as template" / promotion flow. #336
  asked for that flow — "minimal for now" means we do **not** design it here. The
  `detected → authored` adopt-on-edit rule (ADR 0033) is unchanged and
  independent of visibility.
- **The social-layer effort (#337) owns the real semantics** — the full
  vocabulary, per-Workout vs per-Session visibility, the social graph, invite
  mechanics, copy-vs-reference on adoption (ADR 0003 rejected shared Workout
  rows), and how **Session Source** interacts with sharing. It inherits this
  field and its `private` default; every pre-existing Workout is already correct.

### Scope boundary (a scoping act, not a route step)

The social layer sits **past this map's destination** (detect structure +
auto-import). It is ruled **out of scope** for #326 and seeded as a separate
future map (#337). #336 itself stays *on* the route — it made a real, minimal
decision (the field) — while the sharing platform it pointed at does not.

## Alternatives considered

- **Rule #336 fully out of scope, land nothing.** Defensible — auto-import needs
  nothing. Rejected in favour of the map owner's call to plant the private-default
  axis now, so privacy is explicit and the social effort starts from a correct,
  migrated baseline rather than a bare model.
- **`Boolean isPublic` (default false).** Rejected: a boolean forecloses
  `shared` / `invited` / follower-scoped visibility and would be ripped out the
  moment the social model lands. A string enum extends without a breaking change.
- **Design the full save-as-template / promotion flow now** (as #336's text
  proposed). Rejected as speculative: the flow's shape depends on the undecided
  social model. Building it now would be a throwaway against an unknown target
  (the same reason ADR 0033 deferred it).
- **Redraw #326's destination to include social sharing.** Rejected: it is a
  much larger effort deserving its own map, not a late expansion of the
  auto-analysis destination.

## Consequences

- `Workout` gains `visibility String @default("private")` (a migration, at
  hand-off). No query, mutation, or UI consumes it yet — it is forward-groundwork.
- CONTEXT.md's **Workout** term notes the private-by-default visibility axis and
  that sharing semantics are deferred to the social-layer effort; a relationship
  line records that every Workout (all sources) is `private` until that effort
  lands.
- Map #326: #336 resolves on the route (minimal field); the social layer is
  logged in **Out of scope**, seeded as #337. With #336 closed the map's frontier
  is empty — the remaining items are implementation hand-offs and the
  re-detection-triggers fog, none blocking engine + auto-import.
- The social-layer map (#337) owns the real visibility vocabulary and all
  sharing/invite mechanics; it must reconcile visibility with **Session Source**
  and with ADR 0003's copy-not-share stance.
