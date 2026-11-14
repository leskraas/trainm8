# Provenance is available, not asserted: a row carries the plan, and its provenance is one tap away

Status: Accepted (agent decision on delegated issue #475, 2026-11-13) · Records
#437's rule · Narrows
[ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md) §7's
and [ADR 0051](./0051-the-catalogue-has-four-axes.md) §5's walk for the session
page · Narrows [ADR 0030](./0030-interactive-chart-contract.md) rule 3's hover
parity to fixed panels · Answers #434's "shape of the review surface"

## Context

#437 tried four treatments of a generated week's provenance against one week at
390 px and chose one: the row shows the session, and its **Session Provenance**
waits one tap away. The rule was recorded only in a closed issue and a prototype
that #540 deleted, so each later surface rediscovered it. Two screens broke it
in opposite directions. The **Plan Preview**
(`/training/plan/generate/:eventId`) printed the provenance sentence under every
placed row, the always-on treatment #437 rejected. The session page never read
`Workout.copiedFromId` at all, so a placed session lost its **Citation**, and a
session placed from a **Shared Workout** lost its non-vouch, the moment it
reached the calendar.

## Decision

1. **A row carries the plan and nothing else.** Day, sport, kind, zone and
   title. No provenance line, no mark, no badge.
2. **The provenance is one tap away, and the tap is the row.**
   - On the **Plan Preview**, tapping a placed row opens its provenance in a
     panel directly below it. One panel is open across the season.
   - On a lived plan (I dag, _Plan_, the week), rows already open the session,
     so **the session page is the tap**. It states the provenance in one quiet
     line after the session's numbers, not behind a second disclosure.
   - The **Catalogue** keeps its provenance slot inline on every card, because
     reading provenance is what that screen is for.
   - There is **no separate review screen** for a generated season. The review
     surface #434 asked about is the Plan Preview before approval and _Plan_
     after it (ADR 0100, ADR 0101).
3. **Only provenance waits behind the tap.** An unfilled slot, an absence, the
   capacity fit, a week's numbers, the `≈` mark (**Target Resolution**), and any
   warning stay visible without a tap (#429: a warning withheld is a warning
   broken). A community session's non-vouch and a moderator's takedown are
   caveats on trusting the session, so the session page shows them in its line,
   never behind a tap. The Plan Preview's panel would put them behind one, and
   is allowed to only because generation retrieves stock rows only (ADR 0053
   §4), so no community row reaches a preview; a generator that places one must
   show its non-vouch on the row.
4. **One slot, one wording.** The Catalogue card, the Plan Preview panel and the
   session page render one slot component that words a `SessionProvenance`
   itself, from `labels.ts`, so the three cannot word the same provenance
   differently. A **Citation** and an **Attribution** are different contents of
   that slot, never both (ADR 0051 §4, ADR 0052 §3).
5. **The session page reads provenance from the placed copy, not the whole
   lineage.** The provenance is the **Catalogue Entry** of the Workout the
   placing act copied from: the session's Workout's `copiedFrom`, never the
   Workout itself (ADR 0052 §4), and, for an adopted session where that misses,
   one hop further, past the adoption fork (#460). A retired entry still counts.
   Where neither hop reaches a Catalogue Entry, the session has no provenance
   line and no placeholder. "Changed by you" is read from `adoptedAt`. A
   community row's **Attribution** is read through `isPublished` like every
   other non-owner-scoped read (ADR 0051 §5): once the row is taken down (ADR
   0052 §2) or left without an owner, the line says an athlete published it,
   with the non-vouch, and names nobody.

   This narrows ADR 0053 §7's "by walking the chain and never assuming one hop",
   and ADR 0051 §5's "a reader walks it … rather than assuming one hop", for
   this one reading. A full walk would cite a Stock Workout on a session the
   athlete built from their own fork of it, and the fork's content is the
   athlete's, not the Stock Workout's. The full walk (`resolveCatalogueOrigin`)
   stays the rule for the Catalogue's "adapted from" line on a Shared Workout
   (ADR 0052 §4).

6. **An inline panel does not open on hover.** ADR 0030 rule 3's desktop hover
   parity was written for a chart whose panel is fixed below it. A panel that
   opens inside a list reflows the rows under the pointer, so hover only tints
   the row and a click or tap opens it. Rule 3's other parts hold: a panel
   below, never a floating tooltip, and re-tap or Escape dismisses.

## Considered options

- **A deliberate exception: a plan being approved asserts its provenance on
  every row.** Rejected. It doubles the row height over 100+ rows at 390 px, on
  the exact screen #437 judged, and leaves two rules where one was decided.
- **A drawer from I dag and _Plan_ rows.** Rejected. Those rows already open the
  session, and a drawer would take that tap over.
- **A "Kilde" disclosure on the session page.** Rejected. It puts the provenance
  two taps away and hides a non-vouch on a session trainm8 does not stand
  behind.
- **Copy the Citation onto the session at placement.** Rejected on ADR 0051 §5:
  a second source of truth that drifts when a citation is corrected.
- **Walk the whole `copiedFrom` chain on the session page.** Rejected: see §5.

## Consequences

- The slot component leaves the Catalogue route file for a shared module, and
  the Norwegian wording (`nbProvenanceSentence`, `nbProvenanceNonVouch`) moves
  with it.
- A session changed without being adopted keeps an unqualified provenance line.
  This covers a session placed from the Catalogue (`source: 'authored'`, which
  is edited in place) and a machine change by a **Juster** ease or a **Week
  Replan** scale, which edits the steps in place and already leaves a **Replan
  Note** on the same page. Reading "changed" from the prescription rather than
  from `adoptedAt` is the fix, owed when the project leaves `poc`.
- A session written by a copy that sets no `copiedFromId` has no line, even when
  its Workout came from a Catalogue row: a **Week Replan** make-up or add,
  copy-week and stamping all copy without the back-pointer. Those writers are
  older than this ADR, and they copy the session's own Workout, which is itself
  a placed copy: setting `copiedFromId` to that Workout would still leave the
  Catalogue row out of §5's reach. The fix, owed when the project leaves `poc`,
  is to carry the copied Workout's own `copiedFromId` onto the new copy.
- Account erasure splices `copiedFromId` past the erased rows (ADR 0051). If a
  Shared Workout was itself adapted from a Stock Workout, a session placed from
  it then reads the Stock Workout's Citation once its publisher deletes their
  account. This is the one path by which community content can still look cited,
  and it is owed the same `poc` follow-up. Where the Shared Workout has no
  surviving ancestor, the splice leaves `copiedFromId` null: the session then
  has no line at all, and a community session loses its non-vouch with its
  byline. The boot job that erases older orphans (#468) runs the same splice, so
  a community row whose publisher was deleted before account erasure existed
  ends the same way. Both are owed the same follow-up: a splice that keeps a
  community reading.
