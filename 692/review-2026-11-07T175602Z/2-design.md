# PR #692 — Design (codebase-design)

D1 (good). `weekDays(week)` (`presenter.ts:440`) is a deep module: one function hides laziness, caching and the build closure; every reader (`stream.tsx`, `anchoring` via WeekBlock, `day-lookup.ts`, `week-change.ts`, `__calm-today.ts`) goes through it. Two adapters at the seam (`buildWeek` and tests via `withWeekDays`), so the seam is real. Tests cross the same interface (`presenter.week-days.test.ts`).
D2 (low, interface invariant not in the type). `TimelineWeek` no longer carries its days; they live in a WeakMap keyed on object identity. A spread copy (`{...week, x}`) or a structured clone typechecks and then throws at the first `weekDays` read. Today the only spread (`stream.tsx:197`) feeds `weekHeightEstimate` and passes `days` itself, so nothing breaks. The error message names the fix. Accept; recorded in the module comment ("Every reader of a week's days comes through here").
D3 (good). `buildLedgerRows` now composes `buildSessionEntryRows` + `sessionProfile`: one rule for what a row is, bars derived by the ledger's own rule. No duplication.
D4 (low). Lazy `importFacts` closure shared by all weeks of a season: fine, once per season.
D5 (low). `findDay` returns null at the first week whose span holds `key` — correct given weeks are disjoint Monday–Sunday spans.
No finding needs a change.
