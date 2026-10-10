# Round 2: handoff (paused 2026-10-10)

The work was paused because the owner's budget ran low. Everything needed to pick it up again is in this folder and on the branches below.

## Where things stand
- **One PR for all of round 2:** #540 (draft), from `claude/round-2`. Main is 326fc7f (#537, deployed).
- **Already merged into `claude/round-2`:**
  - Emil Kowalski's UI skills, with a CLAUDE.md rule (was #538)
  - Matt Pocock's skills, updated and set up again (was #539)
  - `claude/sesong-family-fix`
  - `claude/sesong-small-fixes`
  - `claude/events-norwegian`
  - the season-edits e2e fix (6957491)
- **Agent branches told to commit (WIP allowed) and push, then stop.** Merge each into `claude/round-2` when you resume, and check whether its last commit starts with "WIP:":

  | Branch | Scope | Spec |
  |---|---|---|
  | `claude/cross-cutting-polish` | kilos `82,5 kg × 5 · 5 · 5 · 4`, track ink tokens, token-popover motion, Norwegian Week Replan reasons | BRIEF "Round 2" |
  | `claude/strength-runner-fixes` | repeat blocks in the runner, decimal comma in weight inputs, notes cut off, archetype contradiction | audit-bibliotek |
  | `claude/composer` | the unified Drawer composer (decisions 1, 2, 4–7, 11) | audit-create-session |
  | `claude/sentence-reader` | lifts in the line, Norwegian glue words (decisions 3, 8) | |
  | `claude/workout-detail` | Workout Detail View and full editor in Norwegian, on the design system | |
  | `claude/first-run-integrations` | audit PRs E, A, B, C | audit-firstrun-imports |
  | `claude/meg-pages` | Meg sub-pages | audit-meg |
  | `claude/sesong-plan-page` | Sesong plan page (decisions 12–14) | audit-sesong |
  | `claude/prototype-session-composer` | dev-only prototype (variant D chosen) | merging is optional; it is reference for `claude/composer` |

- **Not started yet:**
  - Bibliotek pages: PR B (catalogue, programs, hub, exercise list, Norwegian aliases, decision 9) and PR C (strength surfaces, untapped-sets prompt, decision 10). Both start after strength-runner-fixes.
  - Imports on I dag, PR D: "ekstra" and "tallene kommer fra importen" on the row, strength quick log with undo. Starts after the composer.

## How to resume
1. Read `BRIEF.md` in full. It holds all owner decisions (all 15 recommendations were accepted), file ownership and the conventions.
2. For each branch above: `git fetch`, read its last commit, and merge it into `claude/round-2`. Resolve `labels.ts` conflicts by keeping both bannered sections.
3. Finish any WIP branch, using `FIX-TEMPLATE.md` (Emil's skills are mandatory; they are installed in `.claude/skills`).
4. Start Bibliotek B/C and imports D.
5. **Final pass:**
   - Run the full vitest, lint, typecheck and full e2e on a production build, with `PLAYWRIGHT_TEST_BASE_URL` set and `MOCK_INTERVALSICU=true`.
   - Recheck `cta-semantics:17` ("Se økta" twice at 1280). It passes in CI and fails only on a locally modified DB.
   - Add a `radio-group` row to `design-system.md`.
   - Rewrite the #540 body, mark it ready, and merge when green.

## Notes
- Run at most 4–5 agents at once. With 8 the machine reached load 20–28, and the jsdom route tests time out.
- Never use `pkill -f "node index.ts"`. Kill only your own PID.
- Delete `.scratch/round-2/` (this branch) once round 2 has merged.

## Agent stop reports
- **claude/meg-pages** f898220 (WIP)
  - **Done:** all 13 Meg sub-pages are in Norwegian on the design system (MEG_* labels, `__meg-ui.tsx`, `__meg-text.ts`); auth logic unchanged.
  - **Left:**
    - 3 unit tests fail (analyze.route, lifts.$exerciseId.route).
    - The settings-profile, 2fa, passkey and mobile-overflow e2e tests still assert English.
    - Lint, screenshots and the Emil tables were not done.
    - Swap the local `nbKg` for `formatNbKg`.
  - **Bug (auth code, reported only):** `/settings/profile/connections` returns 500 when the GitHub lookup gets non-JSON back (`utils/providers/github.server.ts:119`, happens with mocks).
  - **Owner decision:** the gym page's list fields take "." as the decimal separator ("2,5" would split into two plates).
- **claude/composer** 810fbf8 (WIP)
  - **Done:**
    - one composer: a Drawer on phones, the day pane / Sheet on large screens
    - entry points: "+", "legg til en til", "Ny økt"
    - sources Skriv, Bibliotek and Kopier (place-session and copy-session intents); Appen disabled
    - Annet, "Allerede gjort", one undo path, session detail in the Drawer
    - old draft, WritingPanel and reflow deleted; unit tests pass
  - **Left:**
    - ADR 0088 (amends 0076)
    - e2e rewrites (writing-line, home-timeline motion audit, session-authoring, home-large-screen)
    - Sesong "Nytt løp" / "Ny plan" links
    - design-system rows (Switch, toast)
    - lint, build, screenshots, tap/time measurements, Emil reviews
    - the dashboard test "creation survives the re-composition" needs a `/resources/week-sum` stub
- **claude/sesong-plan-page** ebec462 (WIP)
  - **Done:** only the start of step 1. There is a bannered Sesong section in labels.ts and new formatters (`formatNbWeeklyVolume`, `formatNbSignedPercent`). Nothing is wired in yet, so behaviour is unchanged and the commit is unverified.
  - **Left:** wiring the words into `plan.tsx` and the editors, then steps 2–9 and ADR 0090.
  - The replacement script that was not yet applied is in `.scratch/round-2/sesong-plan/` (`plan-e5.py` + `rep.py`). It still needs a few helpers before it compiles.
- **claude/sentence-reader** 041bb4e (WIP)
  - **Done:**
    - The line reads lifts (`Knebøy 5×5 @ 80 kg · Roing 3×8`, `82,5 kg × 5 · 5 · 5 · 4`, bodyweight, timed sets, rest), matched against the catalogue and `ExerciseAlias`. An unknown lift shows up to 3 nearest names to tap.
    - The parser API only gains fields: optional `exercises`, discipline Styrke, `lifts`, `exerciseNames`, `exercisesNeeded`.
    - ADR 0089 is claimed (amends 0027).
    - Norwegian display words come from labels.ts.
    - The 93 parser tests and the notation, stanza and label tests pass. Typecheck passes.
  - **Left:**
    - Editor route tests (token-editing, structural-chrome, intensity-popover, `sessions.$sessionId`, inline-edit) and plan route tests failed in a stopped parallel run. Some assert English token words like "rest"; others may be timeouts. Rerun them one at a time.
    - 7 failures in `index.dashboard.test.tsx` also happen when that file runs alone. Not investigated.
    - Build, e2e, screenshots and the Emil reviews were not done.
- **claude/first-run-integrations** 3eaf22a (WIP)
  - **E done (8798f5d):** 13px AA field errors, `ui/radio-group`, `RadioGroupField`/`ToggleGroupField`, no red ✕ on StatusButton. The onboarding e2e is updated but was not run.
  - **B, generator only:**
    - The stamp lays each philosophy's hard sessions.
    - Norwegian titles ("Terskeløkt · Løping").
    - "Timer i uka" is now the starting point (decision 15).
    - No more 6-minute sessions at low hours, and one rest day kept when all seven days are chosen.
    - This affects every plan, not just first run: re-laid weeks get hard sessions, and the heaviest week is stored as weekly capacity. Review it.
  - **Broken:** 2 tests in `start/first-run.route.test.ts` fail because the step 4–5 screens still use the old wording and preview titles.
  - **Not started:**
    - A (first-run UI, CLS fix, delight) and C (integrations, upload, real "Last synced", hide Strava, share-target message)
    - ADR + GLOSSARY for the stamp/hours change
    - build, e2e, screenshots, Emil reviews
    - the list of stored titles, and what PR D needs
- **claude/cross-cutting-polish** 9f5b99b (WIP, all 4 fixes in one commit)
  - **Done:**
    - `formatNbKg`/`formatLiftWork` render `82,5 kg × 5 · 5 · 5 · 4`. `formatKg` is unchanged, and a round-trip test pins it.
    - `--track-*-ink` tokens reach ≥5.0:1 on card and page; the design-system doc has the numbers. They colour I dag's week header and the season table heads.
    - The token popover now uses `motion-popup`.
    - The replan generator and session nudges produce Norwegian via labels.ts; old English rows are mapped at display time, with no migration.
    - Lint and typecheck: 0 errors.
  - **Left:**
    - build, e2e, screenshots, Emil review
    - the Workout Detail View's English "Replan note" label
    - `coach.ts` English
    - English session-title fallbacks (owner decision)
  - **Shared open issue:** `index.dashboard.test.tsx` has 7 failures stuck on "Loading..." on several branches (sentence-reader reports the same). Investigate it once, on a quiet machine.
- **claude/workout-detail** b744dab (WIP)
  - **Done:**
    - All words are in labels.ts.
    - The view leads with the session's own numbers; the archetype contradiction is fixed.
    - The block sheet is now a Drawer and the lift help a Collapsible. The token popover is off tw-animate, so the `tw-animate-css` import is removed (the package is still in package.json).
    - Controls are 44px and the dimmed text meets AA.
    - The telemetry card is lazy-loaded; it was 311 of the page's 597 elements.
    - Typecheck passes.
  - **Left:**
    - Tests asserting the old English are not updated (route/unit, plus the e2e `cta-semantics`, `session-authoring` and `strength-screens`).
    - Lint, build, the after-measurement, screenshots and the Emil reviews were not run. The before-numbers are in `.scratch/round-2/wd`.
- **claude/strength-runner-fixes** 5f36ac2 (5 commits, complete, from origin/main)
  - **Done, test-driven:**
    - Repeat blocks: round r covers orderIndex r·n…r·n+n−1.
    - Decimal comma via `strength/kilo-input.ts`.
    - Notes wrap.
    - One archetype source.
    - The circle row is a 44px auto-fit grid.
    - New e2e steps.
  - **Left:**
    - Run the e2e suite clean. The server died mid-run; the new specs never ran.
    - Write the Emil tables.
    - Decision 10 (the untapped-sets prompt) goes in Bibliotek PR C.
  - **Risk:** the hidden `valueKg` on the propose page posts `formatKg`. Keep `formatKg` unchanged; cross-cutting already pins it.
  - Roughly 67 jsdom failures in a loaded run, unverified. Likely timeouts; recheck on a quiet machine.

## All agents stopped (2026-10-10 ~18:30). Nothing is running.
Next session: follow "How to resume" above. Merge order suggestion: strength-runner-fixes → cross-cutting-polish →
sentence-reader → workout-detail → composer → first-run-integrations → meg-pages → sesong-plan-page (WIP, mostly
not started). Fix tests per branch as you merge; then the shared `index.dashboard.test.tsx` "Loading..." issue.
