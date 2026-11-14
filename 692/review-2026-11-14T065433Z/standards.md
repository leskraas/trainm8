# Standards review: PR #692 (closes #503), head c3c1b09

Diff: `git diff 4c0bc03f...HEAD` (32 files, +1432/-382). Phase: `poc` (docs/agents/factory.md).
Bound to: CLAUDE.md, docs/agents/domain.md + GLOSSARY.md + ADRs 0078/0086/0113, docs/agents/factory.md,
docs/guiding-principles.md, docs/testing.md, .claude/skills/domain-modeling/ADR-FORMAT.md,
.claude/skills/tdd (mocking.md), factory qualities.md / questions.md, Fowler baseline.
Not covered: what tooling enforces (lint, prettier, tsc; CI's Lint & TS job is green on this branch).

Under the `poc` bar, only finding H1 sends this back to implement. Everything else is a `Debt:` line or a doc fix.

---

## A. Hard violations (a documented standard is broken)

### H1 (high): the WebKit Playwright project turns the required CI gate red, so `main` cannot deploy
- **Where:** `playwright.config.ts:31-41` (new `webkit` project). The CI workflow `.github/workflows/deploy.yml:110-111` installs only `npx playwright install chromium`, and `deploy` `needs: [static, vitest, playwright, container]` (deploy.yml:186).
- **Rule:** CLAUDE.md "Guard files": agents never change `.github/**`, so the install line is a human step (the spec says the same). That makes the PR unmergeable until that human step is done. Merged as it stands, every push to `main` fails 🎭 Playwright and skips 🚀 Deploy.
- **Show it:** CI on the branch already fails, and only on WebKit. Job 128489927470 (commit 0d04dd9) shows `[webkit] › tests/e2e/home-reading-position.test.ts … browserType.launch: Executable doesn't exist at …/webkit-2215/pw_run.sh` with "2 failed, 137 passed". Check it with: `gh api repos/leskraas/trainm8/actions/jobs/128489927470/logs | grep -i webkit`.
- **Fix, either:** (a) a human changes deploy.yml:111 to `npx playwright install --with-deps chromium webkit` before merge and records it in `human_steps`; or (b) gate the project until then, e.g. `...(process.env.PW_WEBKIT ? [webkitProject] : [])`. Option (b) still needs (a) before criterion 7 is pinned in CI.

### H2 (medium): `playwright.config.ts` is in `human-edits`, so this merge waits for leskraas
- **Where:** `playwright.config.ts:31-41`.
- **Rule:** docs/agents/factory.md `human-edits: eslint.config.js, tsconfig.json, playwright.config.ts`. A new file can merge; an edit to an existing one waits, in every phase ("the files in `human-paths` and `human-edits` still wait for leskraas").
- **Show it:** `git diff 4c0bc03f...HEAD --stat -- playwright.config.ts`
- **Action:** the conductor must not agent-merge. Put it in front of leskraas together with H1's deploy.yml step.

### H3 (medium): ADR 0113 contradicts the code it records (§3 still describes the rejected `useMemo` design)
- **Where:** `docs/adr/0113-opening-the-full-view-costs-what-it-mounts-and-the-weeks-hydrate-one-by-one.md:91-94`: "The week elements handed to the boundaries are referentially stable (built in a `useMemo` over the visible weeks and their stable props)".
- **What the code does:** `app/routes/_home/timeline/stream.tsx:258-265` uses `StreamWeek = memo(Suspense(WeekBlock))`, and `home-timeline.tsx:519` maps `visibleWeeks` without any `useMemo`. The build's own decision rejected the `useMemo` list ("a list in one useMemo is rebuilt whole when any of its inputs changes"). That rejection was never written back into the ADR's Decision. The Consequences say only "beside the memoised `WeekBlock`".
- **Rule:** docs/agents/domain.md "Flag ADR conflicts". An ADR is the record of the decision, and a reader who follows §3 rebuilds the design that was measured as worse.
- **Fix:** rewrite §3's last sentence to "each week is a memoised `StreamWeek` with the memo outside the boundary", and add one rejected option: one `useMemo` over the list.

### H4 (medium, known): ADR number 0113 collides with `main`
- **Where:** `docs/adr/0113-opening-the-full-view-….md`. `origin/main` already has `0113-a-plan-holds-its-own-copy-…` and runs to 0118.
- **Rule:** .claude/skills/domain-modeling/ADR-FORMAT.md "Numbering: scan docs/adr/ for the highest existing number and increment by one". The next free number is 0119.
- **Show it:** `git ls-tree --name-only origin/main docs/adr/ | grep -E '/011[3-9]-'`
- **Note:** this is also Shotgun Surgery. 26 references to "ADR 0113" across 20 files (code comments, tests, playwright.config.ts, verify docs, ADR 0078/0086 links) must all move: `grep -rn "ADR 0113\|0113-opening" app tests scripts docs playwright.config.ts | wc -l` gives 26. This is part of taking `main`, so it is not new work, but the rename must be complete.

### H5 (low): docs still say the Stream builds rows from `buildLedgerRows`
- **Where:** `GLOSSARY.md:178` (Session Ledger: "`toSessionLedgerEntry` and `buildLedgerRows` still decide what a session _is_ (… shape bars), and the Stream builds every row from them") and `app/routes/_home/timeline/presenter.ts:25-27` ("`buildLedgerRows`' own profile rule for the shape bars").
- **What the code does:** the presenter now reads `buildSessionEntryRows` and derives bars with `sessionProfile` in `buildSession`. `buildLedgerRows` has no production caller left (see J1).
- **Rule:** docs/agents/domain.md ("use the glossary's vocabulary"). The glossary describes the row model, and the row model's entry point changed.
- **Fix:** name `buildSessionEntryRows` / `sessionProfile` in both places, or delete `buildLedgerRows` (J1) and update the glossary in the same change.

### H6 (low): ADR 0113's budget and numbers are stale against the spec
- **Where:** ADR 0113:98 ("within 15% of the seed season, by URL and by navigation") and :181-183 ("pooled over 19 interleaved runs … 17–23% later").
- **Spec now:** criterion 1 is ≤25% for "hydrated", each season's median over ≥20 runs, with +20.7% pooled over 24 runs. Criteria 2 and 3 keep 15%.
- **Rule:** same as H3. The ADR's "If the budget is still missed" is the rule the next build follows, so it must state the budget that applies.
- **Fix:** state the 25%/≥20-runs figure for "hydrated", and the 24-run figures.

---

## B. Judgement calls (Fowler baseline and repo conventions)

### J1 (medium): Speculative Generality / dead code: `buildLedgerRows`, `SessionRow`, `NowRow` and `LedgerRow` are kept alive only by their own test; Mysterious Name: four files alias `SessionEntryRow as SessionRow`
- **Where:** `app/utils/session-ledger-rows.ts:42-77` (the PR refactors `buildLedgerRows` to delegate instead of deleting it). The aliases are at `presenter.ts:111`, `row-content.ts:80`, `import-link.ts:39` and `strength-log.ts:12`:
  ```ts
  import { type SessionEntryRow as SessionRow } from '#app/utils/session-ledger-rows.ts'
  ```
- **Why it matters:** the same module still exports a different `SessionRow` (with `bars`/`groups`). In those four files `SessionRow` means a type without bars, which is a name that lies to the next reader. guiding-principles "Only one way": two row builders now exist for one row model, and only one is used.
- **Show it:** `git grep -n "buildLedgerRows\|LedgerRow\b\|NowRow" -- app ':!*.test.ts'` finds only the definitions.
- **Fix:** delete `buildLedgerRows` / `LedgerRow` / `NowRow` / bars-`SessionRow` and its test, or point that test at `buildSessionEntryRows`. Then rename `SessionEntryRow` to `SessionRow` and drop the aliases. Under `poc` this can be a `Debt:` line.

### J2 (medium): an e2e uses fixed sleeps where the repo has a hydration helper, and the PR's own verify note says to use it
- **Where:** `tests/e2e/home-reading-position.test.ts:109` (`await page.waitForTimeout(2000) // The live import stream is open once the page has hydrated`), plus :114, :149, :167, :179.
- **Standard:** `tests/playwright-utils.ts:53` `untilHydrated` ("wait for the handler instead"). The PR itself adds to `docs/agents/verify/features/today-and-timeline.md:46-48`: "Wait with `untilHydrated` on the control before a tap that writes". This test then writes (the import upload) after a 2s sleep. On a slow WebKit CI runner (H1) a 2s guess is the flake risk.
- **Show it:** run `npx playwright test home-reading-position --project=webkit --repeat-each=10` with CPU throttled, or read line 109.
- **Fix:** `await untilHydrated(stream)` (the stream carries `__reactProps$` once hydrated). For the second test, `await expect.poll(weeks).toBe(TODAY_INDEX+1+AHEAD_INITIAL)` before measuring, instead of `waitForTimeout(1500)`. The 300ms settle waits can stay as documented frame waits.

### J3 (low): Duplicated Code in the new e2e
- `tests/e2e/home-reading-position.test.ts:64-71` `scrollStreamTo` is a copy of `tests/e2e/home-timeline.test.ts:97-105`, and the comment says so ("the same rule as `home-timeline.test.ts`").
- `:51-58` `dayKeyOf` reimplements `localDate` from `#app/utils/athlete-calendar.ts`, which `tests/e2e/imports.test.ts:7` already imports.
- **Rule:** guiding-principles "Only one way".
- **Fix:** move `scrollStreamTo` to `tests/playwright-utils.ts` and import `localDate`.
- **Minor:** `seedReader` (:34-46) does about 75 sequential `prisma.workoutSession.create` awaits. `createMany` would be one round trip.

### J4 (low): Duplicated Code: a third formatter cache, normalised differently from the two it copies
- **Where:** `app/utils/athlete-calendar.ts:29-45` (`FORMATTERS`, keyed `shape + zone.toLowerCase()`). `app/utils/format.ts:283` `NB_PART_FORMATTERS` holds the same `en-CA` y/m/d formatter as the new `'date'` shape, and `:1013` `NB_CLOCK_FORMATTERS` is keyed on the raw zone.
- **Why it matters:** the PR's own argument for lower-casing ("a user rewriting their zone in new casings would grow the process-lifetime cache without end", athlete-calendar.test.ts:1611ff) applies to the two `format.ts` caches the PR left alone. There are now two policies for one concern.
- **Fix:** export `cachedFormatter` from athlete-calendar, or have `nbParts` reuse it. Or write it as a `Debt:` line.

### J5 (low): implementation-coupled unit tests
- **Where:** `app/routes/_home/timeline/presenter.week-days.test.ts:21-44` mocks the internal collaborators `formatNbWeekdayShort` and `deriveSessionProfile` to count "days built". `app/utils/session-profile.test.ts:1874` spies on `IntensityTargetSchema.safeParse`.
- **Rule:** .claude/skills/tdd/mocking.md ("Don't mock: internal collaborators"); tdd SKILL.md "Implementation-coupled … the test breaks when you refactor but behaviour hasn't changed". For example, if a row label stops calling `formatNbWeekdayShort`, the test reports "0 days built" and still passes.
- **Mitigation:** the spec asked for exactly this pin ("a unit test pins that an unread week builds no days"), so it is accepted. A sturdier probe counts through the module's own seam, e.g. a counter on the `withWeekDays` build callback.
- **Smaller issue:** tests that rely on a cold module cache ("a zone no other test uses", "an RPE no other test uses") are order-sensitive within a file.

### J6 (low): state hidden in a side table; `TimelineWeek` no longer carries its days in its type
- **Where:** `presenter.ts:426-463` (`WEEK_DAYS` WeakMap, `weekDays`, `withWeekDays`).
- **Why it matters:** any structural copy of a week (`{...week}`, `structuredClone`, a future `.map(w => ({...w, x}))`) type-checks and then throws at runtime ("has no days"). The test at presenter.week-days.test.ts:1196 pins the throw but not the hazard. A lazy field on the type (`days: () => readonly TimelineDay[]`) would keep the invariant visible to `tsc`.
- **Also:** `withWeekDays<Week extends TimelineWeek>` is generic for one type (Speculative Generality), and tests have to write `withWeekDays<TimelineWeek>(…)`.
- **Status:** a design choice recorded in ADR 0113 §2, so no change asked. Keep it as a `Debt:` line.

### J7 (low): Primitive Obsession in the measurement script
- **Where:** `scripts/measure-home-stream.ts:79` `type Run = Record<string, number>` replaces the precise `Run` type. The budget keys at :327 (`['hydrated','longestTask']`, `['longestTask','shown']`) are then unchecked strings, so a typo prints `NaN%` instead of failing `tsc`.
- **Fix:** `type UrlRun = {...}; type NavRun = {...}` and `keys: Array<keyof …>`.

### J8 (low): Duplicated Code / Feature Envy: "does this week hold day `key`" written inline twice
- **Where:** `app/routes/_home/timeline/day-lookup.ts:24` (`key < week.key || key > addDays(week.key, 6)`) and `app/routes/_home/__calm-today.ts:216` (`addDays(week.key, 6) <= after`). Both compute a `TimelineWeek`'s span outside it.
- **Fix:** `mondayOfDay(key) === week.key` (athlete-calendar.ts:263) says it directly in day-lookup. Optional.

### J9 (low): naming convention for module-level caches
- **Where:** `app/utils/session-profile.ts:197` `intensityZones` is camelCase. The repo's module-level Maps are SCREAMING_CASE, including `STORED_WORD_ZONES` in the same file (:74), `NB_PART_FORMATTERS`, and the PR's own `FORMATTERS` and `WEEK_DAYS`.
- **Fix:** `INTENSITY_ZONES`.

### J10 (info): Middle Man, accepted
- `StreamWeek` (`stream.tsx:258`) only wraps `WeekBlock` in `<Suspense>`. Its docstring explains why: the memo has to sit outside the boundary. Keep it.

### J11 (info, not verified): UI craft and real-phone note
- The diff changes when the Stream's weeks become interactive and adds weeks after hydration. It changes no visuals or motion, so review-animations and break-ui have little to act on.
- CLAUDE.md still asks the PR to say what needs a real phone (criterion 11). I did not read the PR body (cold review), so check it there.

---

## Checked and clean
- No guard file (`.github/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `fly.toml`, `other/**`) is changed.
- No new dependency. `package.json` changes only the `test:e2e:install` script.
- No `--no-verify` in the commits. No seed or migration.
- `progressiveChunkSize: Infinity` (entry.server.tsx:116) is document-wide and carries its reason in a comment and in ADR 0113's Consequences.
- ADR 0078 and 0086 are amended with a link rather than rewritten, consistent with domain.md.
- The test-file naming `presenter.week-days.test.ts` has precedent (`labels.*.test.ts`, `misc.*.test.ts`).
- Both new caches have stated bounds: IANA for formatters, 512 entries for intensities.

## Severity tally
high 1 (H1) · medium 5 (H2, H3, H4, J1, J2) · low 9 (H5, H6, J3–J9) · info 2 (J10, J11)
