# PR #700 — Design (codebase-design vocabulary), by hand
- `placeDeterministicWeeks` is a deep pure module: one placement rule behind approval and re-lay; `generateDeterministicSeason` now a thin adapter over it. Good seam (AC10 pinned).
- `SeasonGenerator.placeWeeks` + `generatorFor(id)`: the re-lay reaches placement through the seam, never deterministic.ts. Good.
- `storedPlaceWeeksRequest` (plan-outline/generation-request.ts): pure adapter, rows+record → request. Good.
- `readPlanWeekSource`: one reader for pattern|generated|none, used by relayFutureWeeks and layPlanWeek; removes the duplicated "first pattern with days" query. Good.
- `fillKeptSlots` / `readKeptSlots`: kept-slot rule drawn out of the stamp under ADR 0109 §7 names. `readKeptSlots` adds `NOT: REPLACEABLE_SESSION`; in the stamp it is read after the clearing, so no replaceable rows remain and behaviour is unchanged.
- `writeGeneratedSessions`: one writer for approval and re-lay. Good.
- D1 (medium, fixed — same as S1) session+Workout deletion duplicated in relay.server.ts instead of reusing week-sessions' rule.
- relay.server.ts `layWeeks` is ~130 lines doing read/match/delete/write per week; acceptable, the keep loop is the only non-trivial logic and it is local.
