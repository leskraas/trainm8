# PR #720 (closes #475): review-read, axis Standards

Head `3c5e9a5` (`origin/agent/475-build-the-review-surface`). Diff
`origin/main...head` (merge base `b4b32f5`), 27 files. `origin/main` is now
`ed354f5`; it gained #677 / #468 **after** the branch's last merge. Phase `poc`.

**Standards sources read:** `CLAUDE.md` (guard files, exact deps, UI craft
rules); `docs/agents/domain.md`; `GLOSSARY.md` (Plan Generation, Session
Provenance, Plan Preview, Placed Hours); ADRs 0028, 0030, 0051 §5, 0052,
0053 §4/§7, 0077 §3/§5, 0085, the branch's new ADR (0121 at head); `docs/design/design-system.md`
(motion table and rules, mobile baseline, components); `docs/design/ui-conventions.md`
§2.2; `.sandcastle/CODING_STANDARDS.md` (the repo's only CODING_STANDARDS file;
`.sandcastle-old/` is identical); `.claude/skills/domain-modeling/ADR-FORMAT.md` and
`SKILL.md` (glossary holds no implementation); `.claude/skills/icon-workflow/SKILL.md`;
`docs/icons.md`; Emil skills `review-animations` (ten standards), `emil-design-eng`,
`animate`, `mobile-native`; `docs/agents/production-seed-data.md`; factory `qualities.md` and
`questions.md` (the bar for `poc`); the code-review SKILL smell baseline.

Clean checks: no guard file touched (`.github/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`,
`fly.toml`, `other/**`); no new dependency; hover tint is behind the app-wide
`(hover:hover) and (pointer:fine)` gate; `touch-manipulation` comes in through `ROW_PRESS`;
`motion-collapse` is the sanctioned layout animation (design-system, ADR 0077 §3) and keeps
its documented reduced-motion answer; the 44px hit area on the locator link follows
ui-conventions §2.2; `console.warn` is the repo's server logging convention; the
`readPlacedProvenance` loader read is scoped through `getSessionByIdForUser` and runs inside
the loader's `Promise.all`. Cited ADR sections (0053 §7, 0051 §5, 0030 rule 3, 0077 §5, 0052 §2–4)
exist and say what the comments claim. The previous merge (`3c5e9a5`, which merged `b4b32f5`)
lost no lines from main. Every `-` line in the three-dot diff is an intended rewrite. The
`season-plan.md` hunk repairs a bad merge **on main**: the "holding the season editors (ADR 0101
§2)" line appears twice there, split around the Guard Notices bullet. The branch keeps all three
pieces once, so this is a correct repair, not a loss. The GLOSSARY has no duplicate entries:
the only repeated `**Target Event**:` is a line-wrapped bold term inside another entry, and main
has it too.

## (a) Violations of documented standards

### 1. HIGH: ADR number 0121 collides with main's new ADR 0121 (stale after main moved)
- **Where:** `docs/adr/0121-provenance-is-available-not-asserted-a-row-carries-the-plan-and-its-provenance-is-one-tap-away.md`
  (whole file), plus every "ADR 0121" the branch writes: `GLOSSARY.md:2389, 2428`;
  `docs/adr/0030-interactive-chart-contract.md:39`; `docs/adr/0051-the-catalogue-has-four-axes.md:156`;
  `docs/adr/0053-…-seam.md:167`; `app/components/provenance-slot.tsx:3`;
  `app/routes/training/__plan-preview-row.tsx:3,17`; `app/routes/training/catalogue.tsx:249`;
  `app/routes/training/plan.generate.$eventId.tsx:22,225`; `…/plan.generate.$eventId.route.test.tsx:161`;
  `app/routes/training/sessions.$sessionId.tsx:312,1044`; `…/sessions.$sessionId.route.test.tsx:1574`;
  `app/utils/catalogue.server.ts:433`; `app/utils/catalogue.server.test.ts:661`;
  `docs/agents/verify/features/season-plan.md:34`; `…/session-authoring.md:19`;
  `tests/e2e/mobile-overflow.test.ts` (the `#475` test comment "(ADR 0121)").
- **Rule:** `.claude/skills/domain-modeling/ADR-FORMAT.md` "sequential numbering … Scan
  `docs/adr/` for the highest existing number and increment by one"; CODING_STANDARDS
  "Reference an ADR by number".
- **What happened:** the merge renumbered 0117 to 0121 against `b4b32f5`, where 0120 was the
  highest. Main then merged #677 (`33d29f8`, 2026-11-14 11:56), which adds
  `0121-orphaned-workouts-are-erased-once-by-a-boot-job-and-lint-keeps-deleteaccount-the-one-path.md`.
  Git sees no textual conflict, so merging the PR as it stands produces two ADR 0121 files.
  After that merge, "ADR 0121" means both. In the merged `0051` it links to two different files
  (lines 156 and 270), and `GLOSSARY.md:1054` (main's Orphaned Workout) uses the same number.
- **Verify:** `git merge-tree --write-tree origin/main origin/agent/475-build-the-review-surface`, then
  `git ls-tree --name-only <tree> docs/adr/ | grep 0121` (shows both files);
  `git ls-tree --name-only origin/main docs/adr | tail -1`.
- **Fix:** merge `origin/main` again and renumber the provenance ADR to **0122**. Move every
  reference listed above, but only the provenance ones: main's `account-deletion`,
  `eslint.config.js`, `server/index.ts` and `orphaned-workout-purge` references stay 0121.
  Mechanical, and it blocks the merge.

### 2. LOW: the hairline chevron is an inline `<svg>`, not the sprite `Icon`
- **Where:** `app/routes/training/__plan-preview-row.tsx:157-177` (`Chevron`).
- **Rule:** `.sandcastle/CODING_STANDARDS.md` §Icons "Icons go through the shared `Icon`
  component backed by the SVG sprite"; `icon-workflow` SKILL "Render via `Icon` component in
  app code"; design-system "Icons in every primitive are the Tabler sprite `Icon`".
- **Mitigation:** the comment gives a true reason. `other/svg-icons/chevron-down.svg` hard-codes
  `stroke-width="2"` on the path, and `<use>` cannot override it. Adding a hairline glyph means
  editing `other/**`, which CLAUDE.md reserves for a human. Under `poc` this is a **Debt:** line,
  not a blocker. The sibling `Disclosure` on the same screen (`__plan-chrome.tsx`) uses the
  stroke-2 sprite chevron, so the preview now shows two chevron weights.
- **Verify:** `cat other/svg-icons/chevron-down.svg`; `git grep -n "<Icon name=\"chevron-down\"" origin/agent/475-build-the-review-surface -- app/routes/training/__plan-chrome.tsx`.

### 3. LOW: tests select by `data-*` attribute where a role or text query exists
- **Where:** `app/routes/training/plan.generate.$eventId.route.test.tsx:170`
  (`document.querySelector('[data-provenance]')`); `tests/e2e/mobile-overflow.test.ts`, the
  `#475` preview test (`'[data-session-row] > button'`, `'[data-provenance-panel]'`) and the
  session-page test (`'[data-provenance]'`).
- **Rule:** CODING_STANDARDS §Testing "Query by role/label/text — not by `data-testid` unless
  there's no semantic alternative"; "E2E … role-based locators".
- **Mitigation:** the verify docs make `data-*` hooks a house convention (`[data-plan-guards]`),
  and the same file already does this at 597 and 668. The row is a named button
  (`getByRole('button', { name: /5 × 1 km/ })`), and the unit test file already does that.
  Line 170 is redundant next to the `queryByText(/Kilde:/)` on line 169.
- **Verify:** read the lines above.

### 4. LOW: ADR 0121 §3's guard is written in prose only, and a test asserts the opposite case
- **Where:** ADR (head) §3, lines 42-46 ("a generator that places one must show its non-vouch on
  the row"); `__plan-preview-row.tsx:216-301` (no community branch);
  `plan.generate.$eventId.route.test.tsx:276-307`, which asserts a community row's non-vouch
  appears only **after** the tap.
- **Rule:** the PR's own ADR §3 and #429 ("a warning withheld is a warning broken"); domain.md
  "Flag ADR conflicts".
- **Why low:** generation places stock rows only (ADR 0053 §4), so the happy path cannot reach
  this. The test still pins, as intended behaviour, the treatment the ADR forbids. Cheap fixes:
  render the non-vouch on the row when `session.provenance.kind === 'community'`, or reword the
  test as "a community row would …" and assert the non-vouch on the row.
- **Verify:** compare the ADR §3 text with the test's assertions after `user.click(await row('Attributed'))`.

### 5. LOW: the ADR's last consequence leaves out main's new purge path (follow-on to 1)
- **Where:** ADR (head) lines 110-114 ("Account erasure splices `copiedFromId` … the one path by
  which community content can still look cited").
- **Rule:** domain.md "Flag ADR conflicts / surface it explicitly".
- **What:** main's #468 ADR adds `eraseOrphanedWorkouts`, a boot job that runs the same splice
  over pre-#641 orphans. That is a second way a session placed from a Shared Workout ends up
  citing a Stock Workout. When renumbering, name it beside ADR 0051.
- **Verify:** `git show origin/main:docs/adr/0121-orphaned-workouts-…md | sed -n 14,30p`.

### Not checkable from a cold read
- CLAUDE.md UI craft asks the PR to "say … what still needs a real phone" and to carry the
  `review-animations` table, the `mobile-native` checklist and `break-ui` evidence. The PR body
  is hidden from this read (`pr_body: true`), so whether they are there is unverified. The parent
  should check.

## (b) Baseline smells and motion judgement calls (all judgement)

| # | Sev | Where (head) | Smell / rule | Note and fix |
|---|---|---|---|---|
| 6 | low | `__plan-preview-row.tsx:144-155` | review-animations #6 interruptibility; internal inconsistency | `revealWhenOpen` fires a smooth `scrollIntoView` 200ms after the tap, with no cancel. `holdInPlace` lets go on `pointerdown`/`wheel`/`keydown`, but this timer still scrolls the page against a flick that started inside those 200ms. Fix: cancel on the same `ATHLETE_SCROLL` events, or clear the timer on re-toggle and unmount. Needs a real phone. |
| 7 | low | `__plan-preview-row.tsx:42-46, 134` | Mysterious assumption | `HOLD_FRAMES` counts frames at 60 Hz. On a 120 Hz phone the hold lasts 100ms, not the 200ms open. Fix: hold until `performance.now() - start >= COLLAPSE_OPEN_MS`. |
| 8 | low | `__plan-preview-row.tsx:148-149` | Speculative Generality (test-only code) | `typeof window.matchMedia === 'function' &&` and the optional `scrollIntoView?.` exist for jsdom. Production code bends to the test DOM. Stub `matchMedia` in the test setup instead. |
| 9 | low | `__plan-preview-row.tsx:268-271` vs `__plan-chrome.tsx:253` | Duplicated Code | The row's trigger layout string (`-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center … rounded-2xl px-2 py-2 text-left`) retypes the `Disclosure` trigger's, differing only in gap and padding. Commit f5d4541 extracted `ROW_PRESS` and `COLLAPSIBLE_CHEVRON` but not this. Extract a `ROW_TRIGGER` beside `ROW_PRESS`. |
| 10 | low | `provenance-slot.tsx:66-82`; `catalogue.server.ts:455,494`; `sessions.$sessionId.tsx` (ProvenanceSlot call) | Data Clumps; CODING_STANDARDS "boolean prop sprawl" | `provenance` + `takenDown` (+ `adopted`) travel together from the loader to the slot, and `takenDown` means something only for `kind: 'community'` (guarded at line 134). Putting `takenDown` on the community branch of the reading would make the invalid state unrepresentable and drop a flag. |
| 11 | low | `plan-generation/provenance.ts:97-99, 110-123`; `__catalogue-card.ts:30` | Repeated Switches | The kind↔notice mapping is written twice: `readSessionProvenance` reads notice→kind, `withoutProvenanceNotice` writes kind→notice. One `{ convention: CONVENTION_NOTICE, 'hand-written': HAND_WRITTEN_NOTICE }` map could serve both. `catalogueBlurb` loops over both kinds and ignores the kind the loader already read. The two sites also differ on trimming: the reader uses the raw text, the stripper trims. |
| 12 | low | `sessions.$sessionId.tsx:851-858` | CODING_STANDARDS "Data loading belongs in loader … push domain logic out of route files" | The description is stripped of its notice in the component on every render. Better done once in the loader, beside `placedProvenance`. |
| 13 | info | `__plan-preview-row.tsx:258-300` | review-animations #2 (keyboard-initiated: no animation) | Enter, Space and Escape animate the panel through `motion-collapse`. The repo overrides this: the design system sanctions `motion-collapse` for every Collapsible and ADR 0077 §5 keeps it, so no finding. Recorded only because the skill would flag it. |
| 14 | info | `GLOSSARY.md` (Placed Hours) | Divergent Change (noise) | The whole paragraph is reflowed for a two-word rename ("generate preview" → **Plan Preview**). The words are right; only the diff is noisy. |

`review-animations` verdict for this diff: **Approve**. No `ease-in`, no `transition-all`,
no `scale(0)`. The height animation is the documented exception; reduced motion is honoured
(`revealWhenOpen` scrolls instantly, `motion-collapse` keeps its documented answer); the press
tint is instant (`motion-safe:active:duration-0`). Items 6 and 7 need a real phone.

## Summary for the factory (`poc` bar)
- **Back to implement:** #1 only. It is mechanical, but merging as is leaves two ADR 0121s,
  so it must be fixed before merge.
- **Debt lines:** #2 (hairline glyph needs a human change to `other/svg-icons`), #4, #6–#12.
