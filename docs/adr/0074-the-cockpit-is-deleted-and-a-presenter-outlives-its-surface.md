# The Cockpit is deleted, and a presenter outlives its surface

> **Scope.** This ADR records a **removal**. It settles what left the tree, what
> moved rather than left, and — for each retired surface — whether the decision
> behind it still stands. It supersedes no ADR: ADR 0031's ruling on what a
> **Discipline Allocation** number means is as true unrendered as it was
> rendered. What changes is where the code lives and what the athlete can reach.

The home rebuild shipped in `cd0928b` and replaced the **Dashboard** (the
"Cockpit" composition of ADR 0017/0018, PR #128) with the **Home Timeline**. It
replaced the surface and left the code: `app/routes/_home/cockpit/` kept nine
components and a 1,100-line presenter, and `session-ledger.tsx` kept a TanStack
table, none of it reachable from any route. #496 then re-homed the evidence
worth keeping into the **Hero**'s three non-Today panes, reusing those
presenters where they were right and leaving the components where they lay.

#499 asked for the cleanup. It was written before #496 landed and assumed the
whole folder was dead; by the time it was picked up, five live imports pointed
into it.

## Evidence

Reachability was established by grep, not by reading the issue. Every module
under `app/routes/_home/cockpit/`, plus `session-ledger.tsx`, against every
importer outside its own file, at `d0bb683`:

| Module                   | Importers outside itself                                                                                                                 | Reachable from a route? |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `cockpit.tsx`            | **none**                                                                                                                                 | no — the dead root      |
| `decision-strip.tsx`     | `cockpit.tsx`                                                                                                                            | no                      |
| `discipline-mix.tsx`     | `cockpit.tsx`                                                                                                                            | no                      |
| `fitness-journey.tsx`    | `cockpit.tsx`                                                                                                                            | no                      |
| `programs-entry-row.tsx` | `cockpit.tsx`                                                                                                                            | no                      |
| `proof-strip.tsx`        | `cockpit.tsx`                                                                                                                            | no                      |
| `recent-compare.tsx`     | `cockpit.tsx`                                                                                                                            | no                      |
| `week-timeline.tsx`      | `cockpit.tsx`                                                                                                                            | no                      |
| `weekly-build.tsx`       | `cockpit.tsx`                                                                                                                            | no                      |
| `session-ledger.tsx`     | `cockpit.tsx`                                                                                                                            | no                      |
| `shared.tsx`             | `timeline/stream.tsx` (`DiscDot`), `session-ledger.tsx`, six dead zones                                                                  | **yes**, for one export |
| `presenter.ts`           | `_home/index.tsx`, `timeline/presenter.ts`, `timeline/home-timeline.tsx`, `timeline/hero-panes.ts`, `utils/load/session-nudge.server.ts` | **yes**, heavily        |

Two facts fall out of the table. The first: `cockpit.tsx` is the only importer
of nine modules, so it is a **root** — deleting it makes nine files dead in one
step, and nothing else in the app changes. The second: the two modules with live
importers are the two that are not surfaces at all. A presenter and a lane dot
outlived the composition that named the folder.

## Decision

**Relocate what is reached; delete what is not. The folder disappears as a
consequence, not as the goal.**

Deleting a directory is not a decision — it is an outcome. The decision is where
each live module belongs once the thing that gave it its address is gone.

1. **`cockpit/presenter.ts` → `app/routes/_home/presenter.ts`.** Its readers are
   the home route module, two timeline modules and a server applier. That is not
   a Cockpit presenter; it is the home surface's presenter, and it belongs at
   the route's own root, one level above the folders that read it.
2. **`DiscDot` → `timeline/stream.tsx`.** The rest of `shared.tsx` — `Tile`,
   `BAND`, `disciplineFill`, `paletteInk`, `SessionStructure` — dressed the
   zones and dies with them. One export survives with one caller, and a shared
   module holding one component for one consumer is a directory, not a seam.
3. **The presenters whose only reader was a retired zone go with the zone.**
   `buildWeekTimeline`, `weekProgressLabel`, `buildRecentCompare`,
   `buildWeeklyBuild`, `buildDisciplineAllocation` and `buildFitnessProjection`
   leave `presenter.ts`, and their tests leave `presenter.test.ts`. A test that
   pins the behaviour of something nothing calls does not protect the athlete;
   it protects the code from being deleted.
4. **The loader stops shipping what nothing reads.** `weeklyBuild` was returned
   on every home request for a chart that no longer exists. The **query** stays
   — `sustainedAdherence` reads it to produce the streak in the **Coach card**'s
   reason line — but the series itself is no longer serialized into the
   document. `snapshots` ships `date` and `ctl` only, the two fields the
   **Form** pane's trend line reads; ATL and TSB are a _day's_ numbers and
   arrive in `current`.

Every other loader query was checked against what the hero panes read after #496
and **kept**: `getLoadSnapshots` (the Form trend), `getPersonalRecords` (the
**Records** pane), `getWeeklyAdherence` and `getStrengthSummaryCount` and
`getLatestWeekReplan` (the **This week** pane). The issue's suspicion that
several were unread was true when it was written and false by the time it was
worked.

## What is retired, and what stands

| Surface                      | Decision behind it    | Status                                                                                                |
| ---------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| Decision strip               | ADR 0010, ADR 0018    | **Re-homed** — the **Hero**'s Today pane is the merged verdict-plus-session, through `buildTodayCard` |
| Proof strip                  | ADR 0021              | **Re-homed** by #496 — the **Hero**'s Records pane, through `buildProofStrip` unchanged               |
| Week filmstrip               | ADR 0017              | **Superseded** — the **Week Strip** navigates the whole season, not one Mon→Sun week                  |
| Recent-compare strip         | ADR 0019              | **Superseded** — the **Stream** shows planned-versus-actual on the row itself                         |
| Weekly-build chart           | ADR 0019, ADR 0025    | **Retired.** The streak it drew survives as `sustained`; the eight-bar history does not               |
| Fitness-journey chart        | ADR 0008, ADR 0029    | **Retired.** **Fitness Projection** is now a decision with no surface — see below                     |
| Discipline mix               | ADR 0031, ADR 0046 §2 | **Retired.** The definition stands; the surface is unbuilt — see below                                |
| Programs entry row           | #477                  | **Re-homed** — the **End Cap**'s "Elsewhere in trainm8" nav (#471, #496) links Programs               |
| Session Ledger (the surface) | ADR 0017              | **Retired** at `cd0928b`; the component is deleted now. The **row model** is untouched                |

Three of these need more than a row.

**Fitness Projection is a decision without a surface.** `projectFitnessToRace`
and its tests stay in `app/utils/load/`: the modelling — endurance tracks only,
per-week targets, Unavailable rather than a guessed curve — was never the thing
that broke, and CONTEXT.md's entry is worth keeping as a ruling. But nothing
calls it. Anyone re-introducing a projected curve should read ADR 0041 and ADR
0045 before drawing one, and should know they are building a surface, not wiring
one up.

**Discipline Allocation is retired, not re-homed, and that is a design
judgement.** It would have been easy to make it a fifth hero pane. It should not
be one: a six-week mix is a **period**, and ADR 0065 §8 makes the Hero four
facets of _now_, anchored on today and never moving in time. A trailing-window
pie in that band would break the single rule that explains the whole screen. ADR
0031's ruling — a load view, a discipline with no trustworthy TSS is an
**Unavailable Metric** rather than a zero slice — is what the next surface
should build to.

**#395 is not closed by this.** The discipline mix carried a known bug, and
deleting the code that exhibits it fixes nothing: the bug is in what the number
means, which ADR 0046 §2 had already flagged as needing its own ruling. The
issue is commented with the fact that its surface no longer renders, and left
open.

## Consequences

- `app/routes/_home/cockpit/` no longer exists. Ten component files and the
  session ledger are deleted; `presenter.ts` and `presenter.test.ts` moved to
  `app/routes/_home/`; `DiscDot` moved into `timeline/stream.tsx`.
- CONTEXT.md's **Session Ledger**, **Dashboard**, **Discipline Allocation**,
  **Fitness Projection** and **End Cap** entries are updated to the truth after
  this change. The **Dashboard** entry no longer promises that the old
  components are in the tree.
- Two test files that asserted against unrendered components are deleted
  (`decision-strip.test.tsx`, `programs-entry-row.test.tsx`). The presenter
  tests for what is still used — `buildTodayCard`, `buildSessionNudge`,
  `buildPlanContext`, `buildPhaseBands`, `buildProofStrip`,
  `buildLoadRecomputeLine`, `sessionCtaLabel` — moved with the code and still
  run.
- **ADR 0029 and ADR 0031 point at files that are gone.** Both cite
  `cockpit/shared.tsx` as the home of the palette the Chart Primitive bridges to
  (`BAND`, `disciplineFill`). That bridge was consumed only by the two retired
  charts. The decision it illustrated — the primitive stays palette-agnostic and
  a caller passes fills in as data — is unchanged; only the worked example is
  gone. Both carry a note saying so.
- **ADR 0046 §"Downstream" cites `cockpit/presenter.ts:569-581`** for what
  Discipline Allocation shows. That range is deleted; the code is readable at
  `d0bb683`. The open question it raises is unaffected.
- **ADR 0065's Context cites `cockpit/cockpit.tsx:251`** as one of three places
  the shipped code referenced an uncommitted design handoff. The citation is a
  record of what the code said in `cd0928b` and is left standing; the file is at
  `d0bb683`.
- **`@tanstack/react-table` now has no consumer.** The session ledger was the
  only one. The dependency is left in `package.json` deliberately:
  `docs/wayfinder/plan-builder-mobile-ux/` plans the plan calendar on it and
  studies the ledger's conventions in detail. That document now describes a file
  in history rather than in the tree.
- **Home's first paint is faster, and it was measured rather than asserted.**
  Production build, `npm start` on one box, `kody`'s seeded account (66
  sessions), five warm-up requests then 30 timed requests to `/`, run twice each
  way to check the machine was not the story:

  |                         | before              | after             | delta                |
  | ----------------------- | ------------------- | ----------------- | -------------------- |
  | HTML document           | 193,937 B           | 187,229 B         | **−6,708 B (−3.5%)** |
  | median TTFB (run 1 / 2) | 118.2 ms / 109.7 ms | 93.7 ms / 94.4 ms | **≈ −20 ms**         |
  | JS preloaded for `/`    | 1,018,289 B (38)    | 1,014,635 B (38)  | −3,654 B (−0.4%)     |

  The shape of that result is the point. Deleting 2,700 lines of components
  bought almost nothing in the bundle, because an unreachable module was never
  in it — Vite only bundles what something imports. The win is the loader: a
  document that no longer carries a series and 180 numbers nothing reads. If a
  future cleanup wants home to paint faster, the payload is where to look, not
  the file count.
