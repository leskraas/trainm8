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
   typography, colour and motion: _Brev_ (one honest letter a week), _Prat_ (the
   plan explained and negotiated in a dialogue), _Sti_ (the season as a path
   through a landscape), _Tommel_ (the app decides, the athlete answers yes or
   no), _Hovedbok_ (everything in one dense table, edited in its cells). The
   concepts were invented from the product brief alone
   (`docs/lab/product-brief.md`, `docs/lab/concepts/`), by a designer who saw
   nothing of the existing app. _Klassisk_ is the app as it was, kept as the
   reference. The registry is `app/lab/variants.ts`.
2. **One switch.** The chosen app is a cookie (`trainm8_app`). `/` opens the
   chosen app's home; a small pill in the top-right corner of every page, in
   every app, switches. `/lab` is the gallery. A Lab App lives under
   `/lab/<key>/` and owns the whole page: `root.tsx` renders no wordmark row and
   no tabs there.
3. **One engine.** Every Lab App reads and writes only through the **Lab
   Engine** (`app/lab/engine/`): named capabilities over the existing domain
   (the typed actions of ADR 0092 and the server modules behind them), in
   product language, documented as a contract in `docs/lab/capabilities/`. The
   apps' designers see the product brief, their own concept and that contract,
   never the existing app, so no app inherits its structure. The building
   principle holds: every number is a value or null with a reason, shown as
   missing, never as 0. Demo data comes back only when a read is asked for it,
   marked `source: 'demo'`.
4. **Writes reuse what exists.** A Lab App writes only through existing resource
   routes and actions; anything it cannot do yet links to the classic page. New
   write paths a Lab App needs are built as actions (ADR 0092), so the classic
   app, the MCP server and every Lab App share them.
5. **Lab code is outside the luma lint** (ADR 0119 §2): each app's look is the
   experiment. The design rules in CLAUDE.md (Emil's skills, the mobile
   checklist) still apply to every app.
6. **The factory works only on the App Lab** until the owner chooses. Open
   `agent:*` issues on the classic app are parked (label `parked`, with a
   comment naming the label they had), not closed. New work is filed as
   `lab:<key>` issues. The classic app gets fixes only when it breaks.

7. **Each app holds one axis, and says what it costs.** Borrowed from the
   `prototype-ui` divergence method: every registry entry names the axis it
   diverges on (rhythm of use, interaction, metaphor, who decides, density),
   when it is the right answer and what it costs. Two apps that differ only in
   look are one app. The set stays at six or fewer. The switch is harness
   chrome: the same in every app, number keys `1`–`6` flip instantly, no
   animation on the swap.
8. **`riff`, `drop`, `keep`.** The owner steers with three words on an issue:
   `riff <key>` starts a new round of apps around one they liked, `drop <key>`
   deletes one (archived first on `lab-archive/<key>`, linked from the issue),
   `keep <key>` picks the direction and ends the lab.

## Consequences

- The owner tests by living in an app, not by reviewing a PR. Feedback lands as
  issues per app, and the factory deepens the apps that earn it and deletes the
  ones that don't.
- When a direction wins, a new ADR states it, the winning app becomes `/`, the
  losers and Klassisk are deleted, and the parked issues are re-triaged against
  the new app (most will close).
- Production carries five extra route trees for a while. They read through the
  same owner-scoped actions as everything else, so they add no new data access.
