# The App Lab runs several whole, different apps in production behind one switch

Status: Accepted · 2026-11-15 · **Sets the factory's only focus** until the
owner picks a direction; **suspends** the North-star in `GOAL.md` and the open
`agent:*` work on the classic app.

## Context

The owner does not like the app and how it works, and cannot yet say why. More
iterations on the classic app (I dag, Trening, Meg; ADRs 0083, 0101) refine an
answer to a question nobody has asked again. Nobody but the owner uses
production, so production is the cheapest place to try several answers at once
and live in each for a few days.

## Decision

1. **Several whole apps, not variants of one.** Each **Lab App** is a complete
   user journey with its own structure, navigation (or none), language,
   typography, colour and motion: _Samtale_ (a conversation with a coach),
   _Stabel_ (one full-screen card at a time), _Terreng_ (the season as a
   landscape), _Dagbok_ (a paper training diary), _Cockpit_ (a dense
   keyboard-driven panel). _Klassisk_ is the app as it was, kept as the
   reference. The registry is `app/lab/variants.ts`.
2. **One switch.** The chosen app is a cookie (`trainm8_app`). `/` opens the
   chosen app's home; a small pill in the top-right corner of every page, in
   every app, switches. `/lab` is the gallery. A Lab App lives under
   `/lab/<key>/` and owns the whole page: `root.tsx` renders no wordmark row
   and no tabs there.
3. **One read model.** Every Lab App reads the **Lab Snapshot**
   (`app/lab/snapshot.server.ts`), built from the typed reads of ADR 0092
   (`get_today`, `list_sessions`, `get_season`, `get_training_load`) and
   flattened to `number | null`. The building principle holds in the lab: a
   null is an Unavailable Metric, shown as missing, never as 0, and no Lab App
   computes a number of its own that would pass as measured. A **demo athlete**
   stands in when the athlete has nothing to show or asks for `?demo=1`, and
   every app says when it is showing demo data.
4. **Writes reuse what exists.** A Lab App writes only through existing
   resource routes and actions; anything it cannot do yet links to the classic
   page. New write paths a Lab App needs are built as actions (ADR 0092), so
   the classic app, the MCP server and every Lab App share them.
5. **Lab code is outside the luma lint** (ADR 0119 §2): each app's look is the
   experiment. The design rules in CLAUDE.md (Emil's skills, the mobile
   checklist) still apply to every app.
6. **The factory works only on the App Lab** until the owner chooses. Open
   `agent:*` issues on the classic app are parked (label `parked`, with a
   comment naming the label they had), not closed. New work is filed as
   `lab:<key>` issues. The classic app gets fixes only when it breaks.

## Consequences

- The owner tests by living in an app, not by reviewing a PR. Feedback lands as
  issues per app, and the factory deepens the apps that earn it and deletes the
  ones that don't.
- When a direction wins, a new ADR states it, the winning app becomes `/`, the
  losers and Klassisk are deleted, and the parked issues are re-triaged against
  the new app (most will close).
- Production carries five extra route trees for a while. They read through the
  same owner-scoped actions as everything else, so they add no new data access.
