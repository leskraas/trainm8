# SPEC review — PR #712 against issue #528 ("Rounder look (shadcn luma feel)")

Read-only review of the worktree at PR head
`/tmp/claude-0/-home-user-trainm8/ea4dae9c-88a2-5e9b-bf7a-6b9719c6003c/scratchpad/wt/712-review`
(HEAD `5d8aa33d`, merge-base `a26da49e`). The PR body and earlier comments were
not read. 76 files changed, +623/−248.

Method: the PR's own rule (`eslint-rules/luma-steps.js`) was run over all of
`app/**` with the config's ignore list, zone contrast was recomputed from the
oklch values against `--card`/`--background` in both themes, and the diff was
read file by file. CI on the head SHA: Vitest 3/3 green, Playwright green,
**`⬣ Lint & ʦ TypeScript` failing** (3 `trainm8/luma-steps` errors).

## Verdicts per acceptance criterion

| # | Criterion | Verdict |
| - | --------- | ------- |
| 1 | Radius steps on every athlete-facing page; no `rounded-sm/md/lg/xl` left | **Not met** (3 occurrences in 2 shared components; admin untouched) |
| 2 | Type scale by role, one page title, no raw `text-xs`…`text-3xl` | **Not met** (1 raw `text-xs`; Epic-scale and arbitrary sizes remain) |
| 3 | Tabular figures; Norwegian comma | **Partly verified** — every figure checked carries `tabular-nums`; exhaustive check needs the app |
| 4 | Card surfaces, no bordered box in a card, low-opacity row rules | **Partly met** (Bibliotek lists, one lift-page card, several full-strength rules) |
| 5 | Plan empty state, validation summary, form errors on the same steps; error reads destructive in both themes | **Partly met** (summary still on the Epic scale and `text-destructive`) |
| 6 | `zone-1…5` light + dark, ≥3:1 on `card` as a mark | **Met statically** (recomputed 3.23–5.36 light, 5.55–8.36 dark); "no washed-out or glowing zone" needs the app |
| 7 | `/design` shows zones in both themes; `design-system.md` documents them, drops "temporary" | **Met** |
| 8 | 390×844 both themes: no sideways scroll, no clipping, ≥44px, motion unchanged | **Can't verify statically** — QA; motion and target sizes are provably unchanged in the diff |
| 9 | Worst-case data does not overflow or clip | **Partly verified** — picker and session title fixed in code; the rest needs the app |
| 10 | `npm run lint` fails on new off-scale page code, message names the step and the doc | **Met** |

## Findings

### F1 — CI lint is red: three off-scale classes left in shared app components (AC1, AC2)

- Severity: **critical**
- `app/components/dev-athlete-switcher.tsx:67` (`text-xs`), `:69` (`rounded-md`);
  `app/components/floating-toolbar.tsx:12` (`rounded-lg`)
- Evidence: the PR's own rule run over `app/**` with the config's ignores reports
  exactly these three; the GitHub job `⬣ Lint & ʦ TypeScript` on `5d8aa33d`
  fails with the same three (`✖ 149 problems (3 errors, 146 warnings)`,
  `Process completed with exit code 1`). ADR 0113's own Consequences name
  `dev-athlete-switcher.tsx` as a file that "moves to the steps, no exception",
  so this is not a deliberate omission.
- Suggested fix: `dev-athlete-switcher.tsx` → `text-caption` and `rounded-3xl`
  (a floating panel/well); `floating-toolbar.tsx` → `rounded-4xl` (a bar on the
  card surface). `floating-toolbar.tsx` has no call site left in `app/` — if it
  is dead, deleting it is a separate change, not this one.
- Decision needed: no.

### F2 — Admin pages were not swept, though Scope and ADR 0113 §1 include them (AC1, AC2 / Scope)

- Severity: **medium**
- `app/routes/admin/moderation.tsx:118,123,133,159,209`,
  `app/routes/admin/cache/index.tsx:123`
- Evidence: exactly the "6 occurrences" the issue's Scope names
  (`text-sm` ×3, `text-base`, `rounded-xl`, `text-lg`) are untouched; no
  `app/routes/admin/**` file appears in the diff. ADR 0113 §1 says the role map
  "applies to every page and shared component outside `app/components/ui`,
  admin included"; the lint rule correctly ignores admin, so nothing catches it.
- Suggested fix: map those six by role (`text-callout`/`text-body`/
  `text-heading`, `rounded-3xl` for the box at `moderation.tsx:159`).
- Decision needed: no (the spec is explicit), unless the reviewer wants admin
  deferred — then say so in the PR.

### F3 — Bibliotek's list groups and one lift-page card miss the card surface (AC4)

- Severity: **medium**
- `app/routes/library_.exercises.tsx:149` (`shadow-xs`, no ring),
  `app/routes/training/catalogue.tsx:691` and `:354` (`shadow-xs`, no ring),
  `app/routes/training/exercises.$exerciseId.tsx:167` (`bg-card … rounded-4xl`
  with no shadow and no ring at all → no dark-mode edge)
- Evidence: the Design section says "List groups on Meg, the lift page and
  Bibliotek use `shadow-md` with `ring-foreground/5` (dark `/10`), not
  `shadow-xs`". Meg (`app/routes/settings/__meg-ui.tsx:65`), the lift anchors
  page (`app/routes/settings/training/lifts.$exerciseId.tsx:315`) and Plan's
  Bibliotek section (`app/routes/training/__library-section.tsx:104`) did get
  `shadow-md … ring-1`; `/library/exercises` and `/training/catalogue` — the
  rest of Bibliotek (`app/utils/app-tabs.ts:62`) — did not. Nine further
  `rounded-4xl` cards still carry `shadow-xs` and no ring
  (`start/klar.tsx:76,102`, `start/niva.tsx:448`, `start/__week-sketch.tsx:314`,
  `imports.upload.tsx:155`, `me.tsx:244`, `__bytt-okt.tsx:214`,
  `day-choice-controls.tsx:159`, `__library-section.tsx:39`), which AC4's
  "`shadow-md` on the tinted page; a dark-mode edge from `ring-foreground/10`"
  reads against.
- Suggested fix: at minimum bring the two Bibliotek lists and
  `exercises.$exerciseId.tsx:167` onto `shadow-md` + `ring-foreground/5
  dark:ring-foreground/10`.
- Decision needed: **yes** for the wider set — whether AC4's surface rule binds
  every card (first run, imports, Meg's profile link) or only the list groups the
  Design section enumerates. The PR implements the narrow reading.

### F4 — Full-strength row rules remain on athlete-facing pages (AC4)

- Severity: **medium**
- `app/routes/_home/timeline/home-timeline.tsx:748`,
  `app/routes/_home/timeline/stream.tsx:1533` and `:1563`,
  `app/routes/training/__outcome-panel.tsx:160`,
  `app/routes/start/koble.tsx:134`, `app/routes/training/__rest-bar.tsx:100`
  (bare `border-t`, i.e. full-strength `--border`)
- Evidence: AC4 ends "Rows inside a card are separated by a low-opacity rule,
  not a full-strength border", and the Design section says row dividers are
  `divide-border/60` "including the remaining full-strength ones". The PR did
  convert `divide-border/70` → `/60` in seven places but left these six bare
  `border-border`/`border-t` rules — three of them in I dag's leftovers, which
  AC1 names explicitly.
- Suggested fix: `border-border/60` on those rules.
- Decision needed: no.

### F5 — Plan's validation summary is still on the Epic scale and `text-destructive` (AC5, AC2)

- Severity: **medium**
- `app/routes/training/__validation-summary.tsx:181` (`text-body-xs`),
  `:185`, `:192`, `:199`, `:218` (`text-destructive`)
- Evidence: AC5 asks the empty state, the validation summary and form errors to
  use "the same steps and surfaces"; the Design section sets field errors to
  `text-footnote` in `text-foreground-destructive`. In the same file the two
  popover/menu leads were converted
  (`:230` → `text-foreground-destructive text-footnote`, `:253` likewise), but
  the summary body itself was not, and `text-body-xs` (14/18, Epic scale) is not
  a luma step. The shared `ErrorList` already uses
  `text-footnote text-foreground-destructive` (`app/components/forms.tsx:44`),
  so three error surfaces now read at three different sizes.
  Contrast is not the problem: computed `destructive` on `card` is 4.76:1 light
  and 6.19:1 dark, `foreground-destructive` 6.28:1 / 4.75:1 — all AA, so "an
  error still reads as `destructive` in both themes" holds either way.
- Suggested fix: `text-footnote` on the container and
  `text-foreground-destructive` on the lines and
  `VALIDATION_LINK_CLASS` (`:218`).
- Decision needed: no.

### F6 — Epic-scale and arbitrary text sizes survive in page code, and the rule cannot see them (AC2, AC10)

- Severity: **medium**
- Epic scale: `app/routes/training/__token-sentence-editor.tsx:1333`
  (`text-body-sm`, the Token Sentence editor's base size),
  `app/routes/training/__sets-popover.tsx:608` (`text-body-2xs`),
  `app/routes/training/__validation-summary.tsx:181` (`text-body-xs`, see F5),
  `app/components/error-boundary.tsx` and `app/routes/$.tsx` (`text-h2`,
  `text-body-lg`, `text-body-md`).
  Arbitrary: ~60 `text-[Npx]` in athlete page code, e.g.
  `app/routes/_home/timeline/week-change-card.tsx` (26),
  `app/routes/_home/timeline/composer.tsx` (13),
  `app/routes/_home/timeline/season-pane.tsx` (6),
  `app/routes/_home/timeline/week-strip.tsx:420,470,532`,
  `app/components/tab-bar.tsx:77`, `app/components/profile-bars.tsx:321`.
- Evidence: AC2's first sentence is "Text on those pages uses the type scale",
  and AC1 names "I dag's leftovers" as in scope. The literal sentence the PR
  implemented is the third one ("No raw `text-xs`…`text-3xl`"), and the rule's
  `TEXT` regex (`eslint-rules/luma-steps.js:12`) matches only that set, so
  neither the Epic scale nor `text-[13px]` is caught in the editor or in CI.
- Suggested fix: either convert the five Epic-scale sites and document the
  arbitrary sizes as deliberate, or extend the rule to
  `text-(body-*|h[1-6])` and optionally `text-[…]`.
- Decision needed: **yes** — whether AC2 binds only the raw `text-xs…3xl` set
  (PR's reading) or every off-scale size, including the dense I dag timeline's
  arbitrary px sizes.

### F7 — ADR 0085's body still lists `zone-*` as temporary (AC7, Architecture)

- Severity: **low**
- `docs/adr/0085-the-design-system-is-shadcn-base-luma-on-base-ui-and-motion-follows-one-scale.md:74-76`
- Evidence: the file gains an "Amended by ADR 0113" banner at `:5-9`, but §2's
  prose still reads "The older app tokens the timeline still reads (`ink-*`,
  `hairline*`, `warning`, `--shadow-pill`, `zone-*`) are documented as
  temporary". `docs/design/design-system.md` is correct — "temporary" is gone
  and the zone table at `:85-91` is right — so AC7 itself is met.
- Suggested fix: strike `zone-*` from that sentence with a pointer to ADR 0113.
- Decision needed: no.

### F8 — The lift history page's one title is a figure, not the exercise name (AC2)

- Severity: **low**
- `app/routes/training/exercises.$exerciseId.tsx:176` (`text-title` on the
  working-weight figure), the exercise name reaching `PageHeader`'s h1 at
  `text-heading` (`app/components/page-header.tsx:54`, `:158` of the route)
- Evidence: the design Decisions say the page title is "the content's name …
  on the lift page the exercise name" at `text-title`. The last commit
  (`5d8aa33d`) applied exactly that to the anchors page
  (`app/routes/settings/training/lifts.$exerciseId.tsx:274`), but the history
  page keeps the name at heading size while a figure carries `text-title`.
  The session page has the same shape, but there it is pre-existing and
  untouched (`sessions.$sessionId.tsx:897` and `:1113`).
- Suggested fix: decide whether "the lift page" means both routes; if so, the
  history page's name wants `text-title` and the figure a step down.
- Decision needed: **yes** (one line, taste).

### F9 — Meg's profile card is still a bordered card (AC4)

- Severity: **low**
- `app/routes/me.tsx:244` (`border-border/70 … border … shadow-xs`)
- Evidence: AC4 wants content blocks on the card surface with tone and shadow;
  `MegRows` right below it moved to `shadow-md … ring-1`
  (`app/routes/settings/__meg-ui.tsx:65`), so the two surfaces on the same
  screen no longer agree. Not a box *nested* in a card, so AC4's hard rule is
  not broken.
- Suggested fix: drop the border, add `shadow-md ring-foreground/5
  dark:ring-foreground/10`.
- Decision needed: no (follows from F3's decision).

## What the PR gets right (evidence)

- **The rule and its wiring.** `eslint-rules/luma-steps.js` is a local plugin
  registered in `eslint.config.js:2,56-57` with one block, `files:
  app/**/*.{ts,tsx}` and the ignore list ADR 0113 §2 specifies
  (`eslint.config.js:41-55`). Re-running it over the repo reproduces CI exactly
  (3 errors), it ignores all twelve `__prototype-*` files (which would otherwise
  raise 306 errors), `app/components/ui/**`, admin, `_marketing`, `_seo`,
  `_auth` and tests, and the native-`<select>` block above it is untouched. The
  message names the step by role and ends in `docs/design/design-system.md`
  (Radius / Type). Variant prefixes and `!` are stripped
  (`baseClass`, `luma-steps.js:17-29`), and template chunks are read
  (`TemplateElement`, `:69-71`). `app/utils/luma-steps-lint.test.ts` exercises
  all of it through the real config, including the native-`<select>` guard.
  Named disables carry reasons: `__design-tokens.tsx:310,312`,
  `_home/index.tsx:111`, `__exercise-combobox.tsx:78`.
- **Zones.** Recomputing from `app/styles/tailwind.css:179-188` and `:251-257`
  against `--card` gives 3.93 / 3.88 / 3.23 / 3.96 / 5.36 (light) and
  7.25 / 7.60 / 8.36 / 7.48 / 5.55 (dark) — every one ≥3:1, in sRGB gamut, and
  matching `docs/design/design-system.md:87-91` digit for digit. The old light
  hues measured 2.79 / 2.78 / 2.04 / 2.67 / 3.85, so the change is load-bearing.
  `/design` shows them in both themes between the track and phase groups
  (`app/routes/__design-tokens.tsx:115-123`, `ThemePanel` re-scopes tokens with
  `.light`/`.dark`, `:168-177`).
- **Surfaces where they were done.** The bordered boxes inside the workout
  editor and the sets popover became borderless wells
  (`__workout-editor.tsx:123,143`, `__sets-popover.tsx:605`), and popover fields
  took the `ui/input` look (`__sets-popover.tsx:442,580`).
- **Worst case, in code.** The exercise picker trigger now wraps:
  `h-11` → `min-h-11`, `line-clamp-1` and `whitespace-nowrap` removed,
  `[overflow-wrap:anywhere]` added (`__exercise-combobox.tsx:78,244`). The
  session title keeps `[overflow-wrap:anywhere]` at `text-title`
  (`sessions.$sessionId.tsx:897`).
- **Nothing out of scope moved.** No `app/components/ui/**` file, no motion or
  size class, and no formatter changed: the only `motion-*`/`transition-*`/
  `duration-*` lines in the diff are shape/type edits to the same strings, and
  `tabular-nums` is net zero (24 added, 24 removed, all re-ordered lines).
  No new dependency; no guard file (`.github/**`, `.claude/**`, `fly.toml`)
  touched. `eslint.config.js` is the one `human-edits` file, as planned.

## Bottom line

AC6, AC7 and AC10 are met. AC1 and AC2 fail on three leftover classes that also
turn CI red (F1) plus the unswept admin pages (F2); AC4 and AC5 are partly met
(F3–F5). AC3, AC8 and AC9 need the running app and are QA's. Two reviewer
decisions are open: how far AC4's surface rule reaches (F3) and whether AC2
covers Epic-scale and arbitrary sizes (F6), with a third minor one on the lift
history page's title (F8).
