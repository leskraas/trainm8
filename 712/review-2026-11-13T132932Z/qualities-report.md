# QUALITIES review: PR #712 (closes #528), head 5d8aa33d

Read-only review of `git diff origin/main...HEAD` (4 commits, 76 files, +623/−248) against every quality in
`.claude/skills/factory/references/qualities.md` (Speed, Failure, Access, Security, Insight, Data), plus the
mobile/touch, dark-mode, clipping, focus and test-quality checks the caller asked for.

Note: `qualities.md` is not on the PR branch's `.claude/skills/factory/references/`; it was read from the main
checkout (`/home/user/trainm8/.claude/skills/factory/references/qualities.md`). The repo has no
`docs/agents/verify/README.md` `## Budgets` section, so no budget gates applied.

How it was checked: lint and the new test were run in a copy of the PR tree
(`git archive HEAD`, `node_modules` symlinked from the main checkout); contrast was computed from the
`oklch` tokens in `app/styles/tailwind.css` (OKLab → sRGB → WCAG 2 ratio; script in
`scratchpad/scripts/`); CI state was read through the REST API.

## Summary

| # | Quality | Severity | Finding | Decision needed |
|---|---|---|---|---|
| 1 | Testability / CI | **critical** | `npm run lint` fails on the PR head: the new rule reports 3 errors in two files the PR did not migrate, and CI "Lint & TypeScript" is red | no |
| 2 | Access (touch) | **high** | Season edit links' hit area drops from 44 px to 42 px (`text-sm` → `text-footnote` under an `after:-inset-y-3` that was sized for a 20 px line) | no |
| 3 | Access (contrast, dark) | **high** | Error text in menus and popovers goes from 5.75:1 to **4.42:1** in dark mode (`text-destructive` → `text-foreground-destructive` at 13 px/400), below AA 4.5:1 | no |
| 4 | Access (focus) | **medium** | 5 hand-rolled inputs now show focus only as `ring-ring/30` (1.26:1 light, 1.36:1 dark, down from 2.31 / 3.38) and drop the `focus-visible:border-ring` that `ui/input` pairs with it | no |
| 5 | Access (non-text contrast) | **medium** | The set grid rows and their inputs lose their borders: row vs popover 1.08 light / 1.03 dark, field vs row 1.09 / 1.25 (was 1.19–1.60) | yes (design) |
| 6 | Testability (rule gaps) | **medium** | `trainm8/luma-steps` misses `text-4xl+`, `rounded-xs`, bare `rounded`, and arbitrary `text-[Npx]`: 68 such tokens remain in scope, some at 9–10.5 px | yes (scope) |
| 7 | Testability (test quality) | **low** | The test has no negative cases for the gaps above, no case for prose strings (which it flags), and costs ~15 s of typed-lint start-up in the unit suite | no |
| 8 | Access (legibility) | **low** | 58 `text-sm` (14 px) uses go to `text-footnote` (13 px), several of them running explanations and a destructive intro | yes (design) |
| 9 | Access (zone hues) | **low / info** | The zone contrast claims check out (light 3.23–5.36, dark 5.55–8.36 on `card`). Zone 3 sits at 3.00:1 in the new `bg-muted/50` shape-strip well. Adjacent zones differ by only 1.01–1.35 in luminance | no |
| 10 | Spec consistency | **low** | ADR 0113 §1 says the restyle applies to "admin included", but the rule leaves admin out and no admin file changed | yes |
| — | Speed, Failure, Security, Insight, Data, i18n | n/a | Not touched: CSS classes, tokens and a lint rule only. No loaders, actions, queries, migrations, outbound calls or new user-facing copy (only the dev-only `/design` sheet gains "Treningssoner (app)" / "Sone 1–5", which is correct Norwegian) | — |

No existing test or snapshot was changed. The only test file in the diff is the new `app/utils/luma-steps-lint.test.ts`, and it passes (9/9).

---

## 1. Lint fails on the PR head; CI is red. Critical (Testability / CI)

- **Files:** `app/components/dev-athlete-switcher.tsx:67` (`text-xs`) and `:69` (`rounded-md`);
  `app/components/floating-toolbar.tsx:12` (`rounded-lg`); rule scope in `eslint.config.js` (new block).
- **Evidence:**
  - Local run on the PR tree: `eslint app eslint-rules eslint.config.js` gives
    `{('trainm8/luma-steps', 2): 3, …}`, exactly these three.
  - The CI check-runs for `5d8aa33d` show `⬣ Lint & ʦ TypeScript  completed  failure`. The job log says:
    ```
    app/components/dev-athlete-switcher.tsx
      67:18  error  `text-xs` is a raw text size … trainm8/luma-steps
      69:20  error  `rounded-md` is off the luma radius steps … trainm8/luma-steps
    app/components/floating-toolbar.tsx
      12:5   error  `rounded-lg` is off the luma radius steps … trainm8/luma-steps
    ✖ 149 problems (3 errors, 146 warnings)
    ```
  - Neither file is in the diff. Both were last changed in #540, before the merge-base.
  - `app/components/floating-toolbar.test.tsx:18` asserts `expect(el.className).toContain('rounded-lg')`, so
    fixing the toolbar also means changing that test.
- **Suggested fix:** move both files onto the steps. The toolbar is a sheet-like surface, so `rounded-4xl`,
  and its test assertion changes to match. The dev switcher can take `text-caption` and `rounded-3xl`. If the
  dev switcher should stay as it is, add it to the rule's `ignores` with a reason. Then re-run `npm run lint`.

## 2. Season edit link hit area is now 42 px, not 44 px. High (Access, mobile touch)

- **File:** `app/routes/training/__season-edits.tsx:151` (`SEASON_EDIT_LINK_CLASS`), with the doc comment at `:143–149`.
- **Evidence:** the class went from `text-sm` to `text-footnote`. The hit area is the line box plus
  `after:-inset-y-3` (12 px above and below):
  - before: `text-sm` line-height = `calc(1.25 / 0.875)` × 14 px = 20 px (`node_modules/tailwindcss/theme.css:302`), so 20 + 24 = **44 px**
  - after: `--text-footnote--line-height: 1.125rem` = 18 px (`app/styles/tailwind.css:378`), so 18 + 24 = **42 px**

  The comment above it still says "a line of text (20 px) … 44 px of target". It is now stale, and the
  measure it promises (ADR 0028 §2) no longer holds. These links are the only way into their edits from the
  Blocks and Weeks readings.
- **Suggested fix:** use `after:-inset-y-[13px]`, or keep the extension and set the line to
  `leading-5`. Keep `my-2.5` in step so two stacked links don't overlap (26 px between lines), and update
  the comment. A quick check is a test that measures `getBoundingClientRect` of the `::after`, or a
  Playwright `boundingBox` assertion.

## 3. Dark-mode error text in menus and popovers falls below AA. High (Access, contrast)

- **Files:** `app/routes/training/__validation-summary.tsx:230` (`MenuErrorLead`) and `:253`
  (`PopoverErrorLead`, rendered inside popovers from `__block-editor-sheet.tsx:218, 294` and
  `__token-sentence-editor.tsx`). The same token is also used at `__blocks-reading.tsx:142` and `__weeks-reading.tsx:216`.
- **Evidence:** the 13 px, weight-400 text (`text-footnote`) on `--popover` measures:

  | theme | before: `text-destructive` | after: `text-foreground-destructive` |
  |---|---|---|
  | light | 4.76 | 6.28 |
  | dark | **5.75** | **4.42** (fails 4.5:1) |

  Dark `--foreground-destructive: oklch(63.72% 0.2071 21.89)` (`tailwind.css:215`) on dark
  `--popover: oklch(0.235 0.008 223.9)`. On `card` it is 4.75, and on the page background it is higher, so
  the two page-level alerts pass. axe would report the popover and menu errors as `serious` color-contrast
  in dark mode.
- **Suggested fix:** lighten the dark `--foreground-destructive` to about L 0.68 (about 5:1 on popover),
  or keep `text-destructive` inside overlays. Add the pair to the contrast table in `design-system.md`.

## 4. Hand-rolled inputs lose most of their focus indicator. Medium (Access, focus)

- **Files and lines (PR head):**
  - `app/routes/training/__intensity-popover.tsx:796` (NudgeField input)
  - `app/routes/training/__sets-popover.tsx:442` (UniformLoadField input) and `:580` (SetGridRow `inputClass`)
  - `app/routes/training/__token-editor-controls.tsx:226` (TypeToEditStepper input)
  - `app/routes/training/__token-sentence-editor.tsx:1857` (BlockNameEditor input)
- **Evidence:** each went from `focus-visible:ring-ring focus-visible:ring-2` (with a visible `border-input`)
  to `focus-visible:ring-ring/30 focus-visible:ring-3 … border-transparent outline-none`. The `ui/input`
  primitive these copy (`app/components/ui/input.tsx:16`) pairs the faint ring with
  **`focus-visible:border-ring`**. None of the five carry it. `--ring` is primary at 55% (light) or 60%
  (dark), and `/30` brings that to about 16–18%:

  | | light | dark |
  |---|---|---|
  | old `ring-ring` vs card | 2.31 | 3.38 |
  | new `ring-ring/30` vs card | **1.26** | **1.36** |

  WCAG 1.4.11 asks for 3:1 on a focus indicator. A keyboard user tabbing through the sets popover can barely see where focus is.
- **Suggested fix:** add `focus-visible:border-ring` to all five, as `ui/input` does, or render the
  `ui/input` primitive. Better still, put one shared `STEPPER_INPUT_CLASS` in `__token-editor-controls.tsx`
  so the five copies cannot drift apart.

## 5. Set grid rows and inputs become near-invisible boundaries. Medium (Access, non-text contrast; design decision)

- **Files:** `app/routes/training/__sets-popover.tsx:605` (row: `border-border/70 … border` →
  `bg-muted/50`) and `:580` (inputs: `border-input bg-background` → `bg-input/50 border-transparent`). The same
  well treatment appears at `app/routes/training/__workout-editor.tsx:123, 145`.
- **Evidence (computed, in the sets popover):**

  | | light | dark |
  |---|---|---|
  | row vs popover: old `border/70` | 1.19 | 1.22 |
  | row vs popover: new `bg-muted/50` | **1.08** | **1.03** |
  | field edge: old `border-input` vs popover | 1.28 | 1.60 |
  | field vs row: new `bg-input/50` on `muted/50` | **1.09** | **1.25** |

  Both versions are under 3:1, but the new one is roughly half as distinct. In dark mode the row boundary is
  effectively gone, and empty `—` inputs inside a muted row read as plain text. This matches the luma look
  elsewhere, so it is partly a design call.
- **Suggested fix:** inputs on a `muted` well should sit on `bg-card` or `bg-background` (a field on a
  well), or keep a `ring-1 ring-foreground/10` on the row. Check it on a real phone in dark mode.
- **Decision needed:** whether luma's borderless fields are acceptable when nested inside a muted well.

## 6. The rule's coverage is narrower than "the type scale". Medium (Testability; scope decision)

- **File:** `eslint-rules/luma-steps.js:12-13` (`RADIUS`, `TEXT` regexes).
- **Evidence:** a probe through the real `eslint.config.js` on `app/routes/training/plan.tsx`:
  ```
  text-4xl                    not reported
  rounded-xs                  not reported
  bare rounded                not reported
  text-[13px]                 not reported
  non-class string ('Bruk text-sm her')  REPORTED
  sm:rounded-lg / group-[.x]:text-sm     REPORTED
  ```
  In the rule's scope (excluding ui, admin, marketing, SEO, auth, prototypes and tests) there are **68**
  `text-[Npx]`, `text-4xl+`, `rounded-xs` or bare `rounded` tokens. Examples:
  - `app/components/profile-bars.tsx:321` `text-[9px]`
  - `app/routes/_home/timeline/composer.tsx:271` `text-[13px]`/`text-[12px]`, `:277` `text-[10px]`, `:583` `text-[10.5px]`
  - `app/components/tab-bar.tsx:77` `text-[11px]`

  These pass lint, so the guard ADR 0113 §2 describes ("keeps page code there") still lets raw sizes
  through, and the 9–10.5 px ones are legibility risks.
- **Suggested fix:** extend `TEXT` to `text-(?:xs|sm|base|lg|[2-9]?xl)` and `RADIUS` to include `xs` and the
  bare `rounded`. Decide whether arbitrary `text-[Npx]` should be reported, with
  `eslint-disable-next-line` for the deliberate ones (`text-[16px]` iOS no-zoom, `text-[0.8em]` chips).
- **Decision needed:** whether arbitrary sizes are in the rule's scope.

## 7. Test quality of `app/utils/luma-steps-lint.test.ts`. Low (Testability)

- **Good:**
  - It lints through the real `eslint.config.js`, so scope and registration are tested, not just the rule.
  - It checks that the native-`<select>` guard still fires.
  - It covers the template-literal, `cn()`, variant-prefix and `!` paths.
  - It passes: `9 passed`, 14.9 s.
- **Gaps:**
  - No negative cases for the misses in #6, and no case documenting that prose strings are flagged
    (`'Bruk text-sm her'` reports). Either pin these as intended or fix them.
  - The on-steps case covers `text-callout`, `rounded-4xl` and `rounded-3xl` only. It does not cover
    `rounded-full`, `rounded-[3px]`, `rounded-2xl`, `text-body`, `text-footnote`, `text-caption` or
    `text-muted-foreground`. Those are the strings most likely to hit a regex false positive.
  - `baseClass` and `offScale` are exported but have no direct unit tests. Nested arbitrary variants such as
    `[&:has(a:hover)]:text-sm`, where a colon sits inside brackets, would make cheap table tests.
  - It does not lint the actual tree. That is lint's job, but finding #1 shows the PR shipped without running
    it.
  - Speed: the typed parser builds a program in `beforeAll` (120 s timeout), which adds about 15 s to the
    Vitest shard. Acceptable, but `parserOptions.project: false` / `projectService: false` for this
    `ESLint` instance (or `overrideConfig`) would make it near-instant if the rule needs no types (it doesn't).
- **Suggested fix:** add the negative and positive cases above, plus a small `test.each` over `baseClass`
  and `offScale`.

## 8. Many 14 px texts shrink to 13 px. Low (Access, legibility; design decision)

- **Evidence:**
  - `git diff … -- app | grep -c '^-.*\btext-sm\b'` gives 58, and 46 of them become `text-footnote`
    (0.8125 rem = 13 px, weight 400).
  - These include running explanations, not just row facts: `__fit-to-event.tsx:39`,
    `__phase-editor.tsx` (`deleteIntro`, the delete-plan explanation, and `growsForward`),
    `__weeks-reading.tsx` footnotes, and `__segment-editor.tsx` `mixIntro`/`derivedNote`.
  - Contrast still passes (muted-foreground on card 5.47 light / 7.33 dark).
  - ADR 0113 §1 maps "descriptions" to footnote, so this follows the decision.
- **Suggested fix:** put multi-sentence explanatory paragraphs (especially the delete-plan intro) on
  `text-body` or `text-callout`, and keep `text-footnote` for one-line facts.
- **Decision needed:** whether "descriptions" in ADR 0113 covers multi-sentence explanations.

## 9. Zone hues. Low / info (Access, contrast; dark mode)

- **Files:** `app/styles/tailwind.css:184-188` (light), `:253-257` (dark).
- **Evidence:** the computed numbers match `docs/design/design-system.md:87-91` exactly.

  | zone | light on card | light old | dark on card | dark old |
  |---|---|---|---|---|
  | 1 | 3.93 | 2.79 | 7.25 | 6.41 |
  | 2 | 3.88 | 2.78 | 7.60 | 6.44 |
  | 3 | 3.23 | 2.04 | 8.36 | 8.78 |
  | 4 | 3.96 | 2.67 | 7.48 | 6.71 |
  | 5 | 5.36 | 3.85 | 5.55 | 4.64 |

  - The PR fixes the four light zones that failed 3:1 and does not regress dark mode.
  - Text on the zone chip tints (`score-stanza.tsx:304-310`, `text-foreground`) stays at 10.2–15.2:1 in both themes.
  - No zone hue is used as text outside the excluded prototypes.
  - **Caveats:**
    - The Workout Shape strip now sits in a `bg-muted/50` well (`__workout-editor.tsx:145`). There zone 3
      measures **3.00:1** (light), the bare minimum.
    - Adjacent zones differ by only 1.01–1.35 in luminance, so the ladder is carried by hue alone, which is
      a colour-vision risk for zones 2/3/4. That predates this PR. Profile bars also encode zones by height,
      so the risk is mostly in the shape strip and the chips (chips carry the "Z3" text).
- **Suggested fix:** none required. Optionally put the shape strip on `bg-card`, or nudge zone 3 light to
  L 0.63. Note the colour-vision point for a later pass.

## 10. ADR says "admin included", the rule excludes admin. Low (spec consistency)

- **Evidence:** ADR 0113 §1 says "This applies to every page and shared component outside
  `app/components/ui`, admin included". §2 and `eslint.config.js` ignore `app/routes/admin/**`, and the diff
  touches no admin file.
- **Suggested fix:** either restyle admin and drop it from `ignores`, or change §1 to say admin is out.
- **Decision needed:** which one.

---

## Checked, no finding

- **Touch targets kept:**
  - every stepper `−`/`+` stays `size-11`
  - `QUIET_TEXT_BUTTON_CLASS`, the intensity group, zone and unit toggles, and `SCRATCH_TRIGGER_CLASS` keep `min-h-11`
  - `EdgeButton` stays `h-11`
  - the exercise-picker trigger goes from `h-11` to `min-h-11`, which only grows
  - the `FilterChip` at `__exercise-combobox.tsx:62` is `h-7` (28 px) plus Toggle's `after:-inset-y-1`, 36 px total; that predates this PR
- **iOS zoom:** every input touched stays at 16 px (`text-base` → `text-body` = 1 rem). `md:text-body`
  replaces `md:text-base` on Meg fields and selects.
- **Clipping:**
  - `PageHeader` h1 keeps `truncate` at the same 18 px size
  - the exercise-picker trigger drops `line-clamp-1`/`whitespace-nowrap` for `[overflow-wrap:anywhere]`, so long exercise names now wrap instead of clipping (an improvement)
  - the lift name becomes `text-title` with `[overflow-wrap:anywhere]`
  - the season span drops from `text-xl` to `text-heading`, which wraps less
- **`cn` merge:** `extendTailwindMerge` already registers `title`, `heading`, `body`, `callout`, `footnote`,
  `caption` and `overline` as font sizes (`app/utils/misc.tsx:67-92`), so they don't collide with
  `text-muted-foreground`.
- **Weight:** `text-caption` carries weight 500, so the many added `font-normal` keep muted captions at 400,
  as intended (commit 5d8aa33d). There is no unintended bold.
- **Dark mode:** lists moved from `shadow-xs` to `shadow-md` with `dark:ring-foreground/10`, and the phase,
  track and status tokens are unchanged.
- **Security, Data, Insight, Failure, Speed (runtime):** nothing in the diff reaches a loader, action, query,
  migration, outbound call or log. The CSS bundle change is a few `oklch` declarations.
