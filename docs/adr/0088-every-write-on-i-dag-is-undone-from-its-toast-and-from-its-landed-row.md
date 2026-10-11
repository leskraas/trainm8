# Every write on I dag is undone from its toast, and from its landed row

Status: Accepted · Owner decisions 1, 2 and 6 (round 2, 2026-10-10)

**Amends [ADR 0076](./0076-an-undone-stamp-leaves-nothing-behind.md)** §1 and
its first rejected alternative ("a toast with `Undo` in it"). §2 (`Undo` is a
real, owner-scoped delete) and §3 (undo is idempotent) stand unchanged.
**Records what
[ADR 0086](./0086-i-dag-has-no-hero-reads-like-a-calendar-and-the-scroll-engine-never-writes-under-a-reader.md)
shipped without saying so**: the "+ Ny" panel's writes were undone from a toast,
which 0076 had rejected by name, and nothing amended it. **Follows
[ADR 0028](./0028-mobile-first-ui-standard.md)** (390×844 first) and
[ADR 0085](./0085-the-design-system-is-shadcn-base-luma-on-base-ui-and-motion-follows-one-scale.md)
(Sonner is the toast, Base UI's Drawer the sheet).

Scope: I dag's session composer (`app/routes/_home/timeline/composer*.tsx`,
`stream.tsx`, `day-pane.tsx`, `session-detail.tsx`), home's action
(`app/routes/_home/index.tsx`) and the toaster (`components/ui/sonner.tsx`); the
strength quick log on I dag (`strength-log-panel.tsx`).

## Context

ADR 0076 put the way back on the stamped row, open in place in the list, and
rejected a toast because "a toast is a deadline". Round 2 replaced the in-place
draft with **one composer** (owner decision 1): every "+", the top line's _Ny
økt_ (decision 6) and the day pane open the same component, in a Drawer on a
phone and in the day pane or its Sheet on a large screen. The row no longer
opens in place, so 0076's "for as long as the row is open" has no row to ride.

Meanwhile the app had grown **two undo models** and four writes with none
(round-2 create-session audit §3): the stamped row's `Undo` (0076), the "+ Ny"
panel's toast `Angre` (0086, never recorded), and nothing at all after the full
editor, the Catalogue's place page, copy week and the stamp pattern. A write
that lands somewhere the athlete is not looking — a day months ahead, a week
folded away, a day behind the Drawer — can only be announced by something that
is not the row.

0076's objection still holds in part: a toast alone is a deadline, and the
athlete who most needs the way back is the one who tapped without looking.

## Decision

### 1. One rule: the toast says what changed and carries _Angre_; so does the landed row

Every write the composer makes — the stamp (`Legg til 45 min Z2`), a sentence, a
lift session, a Bibliotek placement, a Kopier copy, with or without Annet,
_Allerede gjort_ or a note — lands the same way:

- **A toast** with the week's sum before → after against its target (#505 story
  39), the athlete's own words quoted under it, and **`Angre`**. It stays 10
  seconds (`LANDED_MS`), long enough to read the sum and reach the button.
- **The row it landed as** rises into place (4 px and opacity, 200 ms
  `--ease-out`, `@starting-style`; reduced motion keeps the fade), is scrolled
  into view with `block: 'nearest'` when it is mounted, is tinted, and carries
  its own **`Angre`** for exactly as long as the toast.

Both call the same undo: home's `undo-stamp` intent, the owner-scoped delete of
0076 §2, idempotent per 0076 §3. Taking a write back from either one dismisses
the other. Its own toast then says what the undo did to the week.

The quick strength log on today's row (`Som planlagt`) follows the same rule:
its toast says how many sets were logged and carries `Angre`, which takes those
set logs back.

### 2. The deadline is bounded twice, and stated

The way back is on screen for ten seconds in two places: where the athlete is
looking (the row, when it is in the list) and where a phone's thumb already is
(the toast). After that the session is an ordinary session, deleted from its
detail — the same Drawer at full, or the day pane — as every other session is.
That is a bound, and it is the same kind 0076 accepted when it said the window
is "the open row, not a clock": a mistap is still on screen ten seconds later.

### 3. On a phone the toast sits at the bottom, above the tab bar

Below `md` (where the tab bar is, ADR 0083) the toaster is `bottom-center`,
offset above the tab bar: it leaves downward, the way the composer's Drawer just
did, and `Angre` is in the thumb's reach rather than over the top line. From
`md` up, where the caller asked. (Local deviation D15 in
`docs/design/design-system.md`.)

### 4. The detail is where a session is deleted

Tapping a session row or its glyph opens the same Drawer at full (or the day
pane from `lg`) as the session's details, with its own way to delete. The
composer itself has no delete: it only writes, and every write it makes is
undone by §1.

## Alternatives considered

- **Keep 0076: undo only on the open row.** Rejected — the composer does not
  open a row in place, and a write to a day out of view has no row to look at.
- **Toast only.** Rejected — 0076's objection is right about a toast alone; the
  row is where the athlete looks once the Drawer is gone.
- **Multi-step undo with Ctrl+Z (Arket N).** Not now. One undo per write covers
  the mistap; a history is a large-screen tool and an owner call.
- **A soft-deleted session to make the window longer.** Rejected for 0076 §2's
  reasons, which are unchanged.

## Consequences

- One sentence teaches every write on I dag: "it says what it did, and you can
  take it back right there".
- The undo is a clock again, bounded at ten seconds and doubled in place. A
  longer window is the soft state 0076 §2 rejected.
- Writes that still happen off I dag (Sesong's copy week and stamp pattern, the
  full editor) are not covered by this ADR; they owe the same toast and `Angre`
  in their own areas (audit slice 10).

## Amended (round 2, 2026-10-11): _Gjort_ and a link answer are writes too

Two writes on I dag's rows had no way back after this ADR shipped (round-2
imports audit, item 9): _Gjort_ by hand (#505 story 82) and the answer to "hva
var dette?" that links an import to a planned session (story 80). They now land
by §1, through the same toast and the same landed-row _Angre_ as the composer's
writes (`ComposerActions.land` in `composer-context.tsx`), with these
differences:

- **The undo restores rather than deletes.** Neither write created the session,
  so §1's owner-scoped delete does not apply. Each write's reply carries a token
  — the stamp it wrote (`markedDoneAt`, `linkAnsweredAt`) and, for _Gjort_, the
  status and `markedDoneAt` that stood before — and _Angre_ posts it back to
  that write's own route as an action intent (`/resources/session-done`
  `intent=undo`, `/resources/import-link` `intent=undo-answer`). The undo takes
  back only the write whose stamp is still there, so it stays idempotent (0076
  §3): a second tap is a no-op, and one after something else has happened on top
  is refused rather than trampling it (an import linked onto a session marked
  done; a link undone with _Angre kobling_ in the meantime).
- **_Angre_ on _Gjort_** puts back the status (`scheduled` or `missed`) and
  `markedDoneAt`, clears the TSS the mark's recompute priced, and recomputes.
- **_Angre_ on a link** puts the planned session back to its `statusBeforeLink`
  without the Recording, stands the import on an _ekstra_ shell again as
  auto-save does (`promoteToNewSession`, detection included), and clears
  `linkAnsweredAt`, so "hva var dette?" is asked again — as before the tap.
  Unlike _Angre kobling_ it remembers no `unlinkedFromSessionId`: the athlete
  took an answer back, not gave one. The shell is a new row; the link had
  deleted the old one.
- **No _Angre_ where the write folded something an undo cannot unwind.** The
  write's toast and tint still land, without the button, when
  - the load recompute the write set off rewrote another of the athlete's
    sessions (the Session Nudge eased the next one, the week change laid or
    changed one — `recomputeRewroteSince`), or
  - the link deleted an _ekstra_ that was more than a bare shell (adopted, in
    Annet, holding a note, sets or an Event result, or no longer on the import's
    start), or the import had been answered before. This is the quick log's rule
    for program sessions, whose fold moves the run on: _Gjort_ is never offered
    on strength, so it never folds a program run.
- _Angre kobling_ and _Koble igjen_ are unchanged: each is the other's way back.
  The question's other two answers, _En ekstra økt_ and Annet, still land
  without _Angre_; they are not in this amendment.
