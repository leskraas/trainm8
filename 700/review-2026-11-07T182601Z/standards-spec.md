# PR #700 — Standards and Spec (bredvid-code-review axes, run by hand in sequence; no subagents)
Diff: git diff origin/main...f891a84 (24 files, +1843/-321). Spec: issue #686 ACs, Design, Architecture, Decisions. Read cold (PR body hidden).

## Standards
- S1 (medium, fixed) app/utils/plan-generation/relay.server.ts:240-250 — the re-lay deletes doomed sessions then their Workouts by hand, a second copy of the ordering rule `clearPlanWeek` (week-sessions.server.ts:136-149) states. Duplicated rule. Fix: one `deletePlanSessions(tx, doomed)` used by both.
- S2 (low, left) relay.server.ts freezeRecordDays — `generationRecordDay.createMany` runs outside a transaction; two concurrent first re-lays of a legacy plan would both compute days and the second hits the unique (recordId, discipline, weekday) index and throws. Issue decision "When a legacy plan's days are written" chose a write of its own; the race is a follow-up.
- Imports, naming, ADR/GLOSSARY updates: conform. ADR 0113 written as a new file (workspace.md). Migration generated, header per production-seed-data.md.

## Spec (issue #686)
- AC1 approval writes record in the same tx as sessions: generate.server.ts approveSeason — met, tested.
- AC2, AC3, AC4, AC5/6, AC7, AC9, AC10: met and tested in relay.server.test.ts.
- AC8: met by `readPlanWeekSource` (pattern wins); test checks the reader only, not a re-lay through the stamp afterwards (low, left: the stamp path is unchanged and covered elsewhere).
- SP1 (medium, fixed) Architecture §3 says `layPlanWeek` lays a generated plan's unlaid week instead of returning `no-pattern` (horizon-fill.server.ts:76-93): new behaviour with no test. Fix: test "the horizon fill lays a generated plan's unlaid week by its generator".
- SP2 (medium, fixed) Architecture §3 "a week past a shortened plan's end has its REPLACEABLE_SESSIONs cleared" (relay.server.ts `outside` branch): untested (AC3 test only lengthens). Fix: test "a shortened generated plan clears the machine's sessions past its new end".
- SP3 (low, left) "the migration applied twice with equal counts" is a test the build owes; it is claimed in the migration header only, with no test in the repo. No sqlite3 CLI here to re-run it.
- Decision "A Generation Record naming a generator this build lacks": implemented (readGeneratedOutline returns null; layPlanWeek returns no-pattern), untested (low, left).

## Found while fixing (verified at f891a84 by the new SP2 test)
- SP4 (high, fixed in 901fc13) relay.server.ts `stillAsksFor` kept a replaceable session whose archetype was any of the slot's listed archetypes, including fallbacks. Shortening a generated plan left three old `easy` sessions in the week that became race week (test failure: expected stock_race1 x4, received easy2, easy1, easy2, race1), against AC 3 "race-week sessions in the last week". Fix: a kept session must be of the archetype the generator retrieves for the slot; ADR 0113 §4 step 2 worded to match.
