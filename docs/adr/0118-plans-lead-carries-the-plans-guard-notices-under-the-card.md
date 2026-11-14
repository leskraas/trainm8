# _Plan_'s lead carries the plan's Guard Notices under the card

Status: Accepted · Recorded in ticket #672 (part of #457)

**Amends
[ADR 0101](./0101-three-tabs-and-a-calm-i-dag-that-shows-today-and-this-week.md)
§2's order** (what _Plan_ leads with) and its "everything else ... unchanged"
for _Avansert_: the three **Guard Notices** leave _Avansert_'s Blokker reading.
**Follows [ADR 0040](./0040-volume-continuity-and-authored-overload.md) §12**
(the guard warns and never blocks, which only works if it is read without
asking),
[ADR 0081](./0081-the-planning-redesign-speaks-norwegian-and-labels-ts-still-owns-every-word.md)
(every word in `labels.ts`) and
[ADR 0085](./0085-the-design-system-is-shadcn-base-luma-on-base-ui-and-motion-follows-one-scale.md).

## Context

ADR 0101 §2 moved everything the old Sesong page held behind a closed
_Avansert_, "unchanged". That included the plan's three guards: the **Ramp
Guard**, the availability fit notice (the two **Training Availability** fit
checks and ADR 0104's day clashes) and the band fit notice (ADR 0042 §9, ADR
0047 §3). They rendered at the top of the Blokker reading, open on arrival, so
on the Sesong page they were read without asking. Behind a closed _Avansert_
they are not: an athlete whose plan rises faster than the convention, or does
not fit the hours they gave, is never told unless they open an expert section. A
warning withheld is a warning broken (#429), and ADR 0040 §12's "warns and never
blocks" assumed the warning is seen.

## Decision

### 1. The order of _Plan_'s lead

In order:

- the lead card, as ADR 0101 §2 lists it: the plan's plain name and its family's
  name small, the season curve with this week marked, _Legg til et løp_, _Bytt
  treningsform_, and any later action that changes the plan as a whole (they sit
  inside the card);
- the resting line, when this plan rests or another one does (ADR 0079);
- **the Guard Notices**, ramp, then availability, then band, as one stack with
  no heading. With no guard firing there is nothing: no heading, no wrapper and
  no space;
- the _Bibliotek_ section;
- the closed _Avansert_.

A notice follows the card it is about, as I dag's **Autopilot Notice** follows
the today card (ADR 0101 §3). Warnings never come before the plan's own name.

### 2. Each Guard Notice appears once

The Blokker reading inside _Avansert_ no longer renders them. One module owns
the three notices and the one entry that mounts them from the loader's `season`;
nothing else mounts a single notice, so a second copy cannot come back by a
caller adding one.

### 3. The plan being viewed

The notices read the same `season` the rest of the page reads, so `?outline=`,
`?event=` and a resting plan each show their own guards. A dismissal belongs to
one plan: moving to another plan's page brings its notices back open, even where
the two plans' warnings read the same.

### 4. Content and dismissal are unchanged; the role is not a live region

The words stay `SESONG_NOTICE_LABELS`'. Dismissal stays per visit, stored
nowhere, re-keyed on what the notice says, and leaves the focus line behind
(#399 story 95). Because the lead mounts the notices on every visit, they are
standing content, not news: they take `role="note"`, not `role="alert"`, which
would read three long notices aloud on each arrival. The shared `Alert` keeps
`role="alert"` for its other callers; the guards override it where they mount.

## Considered options

- **Inside the card.** Rejected: a card inside a card, and it pushes _Legg til
  et løp_ and _Bytt treningsform_ off the first screen.
- **Above the card.** Rejected: warnings before the plan's own name, against ADR
  0101 §2's "the plan in plain words" first.
- **A count line in the card linking down to _Avansert_.** Rejected: says it
  twice, and still makes the athlete open an expert section to read it.
- **Open _Avansert_ whenever a guard fires.** Rejected: it opens every editor to
  show three notices, and the page's resting state would depend on the plan's
  data.
- **Keep the notices in Blokker and copy them into the lead.** Rejected: two
  copies with two dismissals of one warning.
- **Make `Alert` itself `role="note"`.** Rejected: the passkey and integration
  pages' alerts are news, and stay live.

## Consequences

- ADR 0101 carries a note pointing here.
- The mix-disagreement notices and _Hva planen ikke kan si_ stay where they are:
  they are statements about the plan, not Guard Notices.
- A notice in the lead is part of the page's first screen on a large phone and
  below it on a small one (320×700). A long band fit notice (one line per
  off-band session) can make the lead long; grouping its lines is a follow-up,
  not a reason to hide it.
- A fix link from a ramp line to its phase in _Avansert_ needs phase anchors and
  open-on-hash; it is a follow-up. The links the notices hold today
  (`/settings/profile`, each band session) work from the lead as they are.
