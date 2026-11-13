# STANDARDS review — PR #712 (closes #528)

Head reviewed: `5d8aa33d`, worktree
`/tmp/claude-0/-home-user-trainm8/ea4dae9c-88a2-5e9b-bf7a-6b9719c6003c/scratchpad/wt/712-review`.
Diff: `git diff origin/main...HEAD` (76 files, +623/−248). Read-only; nothing
was modified, committed or pushed.

Standards consulted: `CLAUDE.md`, `docs/agents/domain.md`, `GLOSSARY.md`,
`docs/design/design-system.md`, ADR 0085, the new ADR 0113,
`.claude/skills/factory/references/qualities.md`, and the UI-craft skills
(`emil-design-eng`, `mobile-native`, `break-ui`).

How the evidence was produced: the head tree and the `HEAD × origin/main`
merge tree were exported to scratch copies with the repo's existing
`node_modules` symlinked (no `npm ci`), then linted and tested from there.

## Summary

The work itself is faithful to the design system: the type and radius roles
match `design-system.md`, the zone hues are correct to two decimals, the rule
is a genuinely good piece of lint engineering, and its test drives the real
`eslint.config.js`. `eslint.config.js` only **adds** a block — no existing
rule, scope or ignore list is loosened, and the native-`<select>` guard is
proven still live by the new test.

Two things block merge: the repo-wide lint the CI job runs now fails, and the
ADR number collides with one already on `main`.

---

## 1. CRITICAL — `npm run lint` fails on the PR head (CI job fails)

**File:** `eslint.config.js:43-58` (guard scope) → fails in
`app/components/dev-athlete-switcher.tsx:67,69` and
`app/components/floating-toolbar.tsx:12`

**Evidence** (real `eslint.config.js`, head tree):

```
$ npx eslint app/components/dev-athlete-switcher.tsx app/components/floating-toolbar.tsx
app/components/dev-athlete-switcher.tsx
  67:18  error  `text-xs` is a raw text size …   trainm8/luma-steps
  69:20  error  `rounded-md` is off the luma radius steps … trainm8/luma-steps
app/components/floating-toolbar.tsx
  12:5   error  `rounded-lg` is off the luma radius steps … trainm8/luma-steps
✖ 3 problems (3 errors, 0 warnings)
```

`package.json` → `"lint": "eslint ."`, and `.github/workflows/deploy.yml:46`
runs `npm run lint`. Both files are inside the new guard's scope
(`app/**/*.{ts,tsx}` minus the seven exemptions) and neither is in the diff.
The PR body's evidence line, "ESLint on the changed files: no errors", is
accurate but does not cover the whole-repo run CI performs — that is exactly
how this slipped through.

A plain conversion of `floating-toolbar.tsx` also breaks a test:
`app/components/floating-toolbar.test.tsx:18` asserts
`expect(el.className).toContain('rounded-lg')`.

**Needs a human decision:** yes — which of the two remedies. Both files are
arguably outside the spirit of the guard (`floating-toolbar.tsx` is a stock
Epic Stack component like `app/components/ui/**`; `dev-athlete-switcher.tsx`
is a dev-only tool that never ships to an athlete), so an exemption may be
more honest than a conversion, but that is the human's call and ADR 0113 §2
would need the same two names added to its exemption list.

**Suggested fix:** either (a) add `app/components/floating-toolbar.tsx` and
`app/components/dev-athlete-switcher.tsx` to the `ignores` list in
`eslint.config.js:44-55` and to ADR 0113 §2's exemption sentence, or
(b) convert them (`text-xs`→`text-caption`, `rounded-md`/`rounded-lg`→
`rounded-2xl`/`rounded-3xl` by role) and update
`floating-toolbar.test.tsx:18` to the new class. Then re-run `npm run lint`,
not just lint over the changed files.

---

## 2. HIGH — ADR number 0113 is already taken on `main`

**File:** `docs/adr/0113-every-page-is-on-the-luma-steps-a-lint-rule-of-its-own-keeps-it-there-and-the-zone-hues-are-an-app-role.md:1`

**Evidence:**

```
$ git ls-tree --name-only origin/main docs/adr/ | grep 0113
docs/adr/0113-a-plan-holds-its-own-copy-of-every-workout-its-week-pattern-days-use.md

$ git merge-tree --write-tree HEAD origin/main      # → a7209d96
$ git ls-tree --name-only a7209d96 docs/adr/ | grep 0113
docs/adr/0113-a-plan-holds-its-own-copy-of-every-workout-its-week-pattern-days-use.md
docs/adr/0113-every-page-is-on-the-luma-steps-…-app-role.md
```

`main` also already holds 0114, 0115 and 0116. After merge two different
ADRs answer to "0113", and the 12 `ADR 0113` references this PR adds
(`app/styles/tailwind.css:179,250`, `app/components/score-stanza.tsx:300`,
`app/components/shape-strip.tsx:8`, `eslint-rules/luma-steps.js:1`,
`eslint.config.js:37`, `docs/design/design-system.md` ×4,
`docs/adr/0085-…md`, the test header) point at an ambiguous number. The
branch already renumbered once for the same reason
(`3af6bf4d Renumber this PR's ADR 0114 to 0115: main took 0114 first`).

**Needs a human decision:** no (mechanical), but it must be done before merge.

**Suggested fix:** renumber this ADR to `0117-…`, update the back-reference
in `docs/adr/0085-…md:5-9` and every `ADR 0113 §n` citation in code, comments
and `design-system.md`.

---

## 3. HIGH — merging current `main` re-breaks lint (a third file)

**File:** `app/routes/settings/hjemsted.tsx:229` (on `main`, added after the
merge base `a26da49e`)

**Evidence** — same rule block run over the merge tree `a7209d96`:

```
app/routes/settings/hjemsted.tsx | 229 | trainm8/luma-steps |
  `text-base` is a raw text size: use the type scale by role. …
```

(head tree: 3 rule errors; merge tree: 4.) The branch is 102 commits behind
`main`, so even after finding 1 is fixed, `npm run lint` fails on the merge
commit.

**Needs a human decision:** no.

**Suggested fix:** rebase on `main` and convert the newly landed page code in
the same pass (`text-base` → `text-body` at `hjemsted.tsx:229`); re-run the
whole-repo lint on the rebased head, since more pages may land before merge.

---

## 4. MEDIUM — the rule misses the two sharpest radius steps and the large type steps

**File:** `eslint-rules/luma-steps.js:11-13`

```js
const RADIUS = /^rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?-(?:sm|md|lg|xl)$/
const TEXT   = /^text-(?:xs|sm|base|lg|xl|2xl|3xl)(?:\/[\w.[\]-]+)?$/
```

**Evidence** (the rule's own exports, run directly):

```
rounded-xs  -> passes      rounded     -> passes
text-4xl    -> passes      text-[13px] -> passes
rounded-sm  -> FLAGGED     md:!rounded-lg -> FLAGGED   (variant/!-stripping works)
```

Tailwind v4 renamed the scale, so bare `rounded` (4px) and `rounded-xs` (2px)
are *sharper* than anything the rule rejects and sail through. Live, in-scope
examples:

- `app/components/chart/chart.tsx:401` — `… touch-manipulation rounded focus-visible:outline-2 …`
- `app/routes/_home/index.tsx:105` — `text-4xl … md:text-5xl` passes, while the
  sibling `<p>` at `:111` needed an `eslint-disable-next-line` for `text-xl`.
  The same file is thus half-guarded.
- `app/routes/_home/__calm-today-view.tsx` keeps `text-[16px]` (arbitrary
  sizes are outside the rule by design, but worth saying in the ADR).

**Needs a human decision:** no (the intent is already in ADR 0113 §1).

**Suggested fix:** widen to `(?:xs|sm|md|lg|xl)` plus a bare `rounded`
alternative, and extend `TEXT` to `4xl|5xl|6xl` (with a `text-title`/
`text-display` hint in the message); then fix `chart.tsx:401` and decide
whether `_home/index.tsx:105` gets a disable like its sibling.

---

## 5. MEDIUM — the destructive-text role is applied to a minority of the places that need it

**Files:** `docs/design/design-system.md:150-152` (new rule: field errors in
`text-foreground-destructive`) vs. e.g.
`app/routes/training/__validation-summary.tsx:185,192,199,218`,
`app/routes/training/__exercise-combobox.tsx:391`

**Evidence:** the PR converts `__validation-summary.tsx:230,253`,
`__weeks-reading.tsx:216` and `__blocks-reading.tsx:142` to
`text-foreground-destructive`, yet 28 `text-destructive` usages remain in page
code (`grep -rn text-destructive app --include=*.tsx | grep -v 'components/ui/\|\.test\.'`),
four of them in the *same file* as a converted line, and one on the error text
of a component this PR edited heavily. `trainm8/luma-steps` cannot catch colour
drift, so nothing will.

Not a contrast failure: computed from `app/styles/tailwind.css:103,106`,
`--destructive` reads 4.76:1 on light `card` (AA for body text) against 6.28:1
for `--foreground-destructive`; dark is 6.19 vs 4.75. So this is a consistency
and reviewability finding, not an accessibility one.

**Needs a human decision:** yes, on scope — finish the sweep in this PR, or
record it as follow-up work in #528 so the half-applied role is deliberate.

**Suggested fix:** either convert the remaining in-scope error text (start with
the files this PR already touches) or add one sentence to ADR 0113's
Consequences saying the colour role is a later pass.

---

## 6. MEDIUM — ADR 0113 contradicts itself (and the PR) about admin

**File:** `docs/adr/0113-…-app-role.md:30` vs `:45`, and `eslint.config.js:46`

- §1, line 30: "This applies to every page and shared component outside
  `app/components/ui`, **admin included**."
- §2, line 45: "Like the native-`<select>` guard it **leaves out the admin**,
  marketing, SEO and auth routes."
- `eslint.config.js:46` ignores `app/routes/admin/**`; the PR body lists admin
  under "Left out on purpose"; no admin file is in the diff, and
  `app/routes/admin/moderation.tsx` still carries 5 off-scale tokens.

Related: `docs/design/design-system.md:109-110` describes the guard as
rejecting these classes "outside `app/components/ui`", naming one of the seven
exemptions (`eslint.config.js:44-55` also exempts admin, marketing, SEO, auth,
`auth-layout.tsx`, `__prototype-*`, `prototype-switcher.tsx`,
`plan.prototype.tsx` and `*.test.*`). `docs/agents/domain.md` asks that ADR
conflicts be surfaced rather than silently overridden.

**Needs a human decision:** yes — which statement is the decision.

**Suggested fix:** drop "admin included" from §1 (matching the shipped scope
and the PR body), and have `design-system.md:109` point at the config block
rather than naming one exemption.

---

## 7. LOW — the rule reads every string literal, not class attributes

**File:** `eslint-rules/luma-steps.js:57-77`

`check()` is wired to `Literal` and `TemplateElement`, so **any** string
anywhere in `app/**` — a label, a server-side template, a fixture, a
`data-*` value — is split on whitespace and matched. Today there are zero
false positives (the whole-app run reports only the three errors of finding 1),
and the broad reach is what lets it see `cn()` arguments and template chunks,
which the test covers. But the only escape for a legitimate string is a
`eslint-disable-next-line`, and the error text ("use the type scale by role")
will read as nonsense on a non-class string.

**Needs a human decision:** no.

**Suggested fix:** leave as is if the trade-off is deliberate, but say so in
ADR 0113 §2 (one sentence: the rule is text-based on purpose, because class
strings reach JSX through `cn`, `cva` and constants). If false positives ever
appear, narrow to `JSXAttribute[name.name=/^class(Name)?$/]` plus
`CallExpression[callee.name='cn']` arguments and string constants.

---

## 8. LOW — `baseClass` and `offScale` are exported but nothing imports them

**File:** `eslint-rules/luma-steps.js:17,30`

The only importer of the module is `eslint.config.js:2`, which takes the
default export; `app/utils/luma-steps-lint.test.ts` goes through the real
ESLint instead (`offScale` there is a local fixture string, not the import).

**Needs a human decision:** no.

**Suggested fix:** either drop both `export` keywords, or add a fast unit test
over them (`rounded-xs`, bare `rounded`, `md:!text-lg`, `text-sm/6`) — which
would also have caught finding 4, and costs milliseconds against the ESLint
test's 11 s.

---

## 9. LOW — UI-craft items the PR itself defers, and one comment nit

- `app/routes/training/__exercise-combobox.tsx:244` drops `line-clamp-1` and
  `whitespace-nowrap` for `[overflow-wrap:anywhere]`, and `:78` goes `h-11` →
  `min-h-11`: a long exercise name now grows the trigger instead of being cut.
  This is the right `break-ui` answer, and the PR body already lists "the
  three-line exercise trigger" under "Needs a real phone" — no change asked,
  recorded so the human merging knows the touch target can now be three lines
  tall inside a popover.
- `app/routes/_home/timeline/week-strip.tsx`: the strip goes `rounded-xl` →
  `rounded-3xl` (13px) while its selection marker goes `rounded-lg` →
  `rounded-2xl` (11px) at `inset-y-0` inside a 44px strip; corner bleed between
  the two radii is the kind of thing only a device shows. Worth adding to the
  PR's "needs a real phone" list.
- `app/components/score-stanza.tsx:301`: the reflowed comment line is 103
  characters, against the 80-column comment style used throughout the file.
  Prettier does not reflow comments, so it will not be caught
  (`prettier --check` over all 76 changed files passes).

---

## Checks that passed (no finding)

- **Guard files:** the diff touches no `.github/**`, `.claude/**`, `AGENTS.md`,
  `CLAUDE.md`, `fly.toml` or `other/**` (`git diff --name-only origin/main...HEAD`).
  `eslint.config.js` is changed, and the PR body flags it as a `human-edits`
  file awaiting a human at merge, as CLAUDE.md requires.
- **No loosening in `eslint.config.js`:** the diff is purely additive (one new
  block plus one import); the existing native-`<select>` block at lines 12-35 is
  untouched, and the new block sets only `trainm8/luma-steps`, so flat config's
  per-block rule replacement cannot shadow it. Proven live by
  `app/utils/luma-steps-lint.test.ts:79-91` ("the native-`<select>` guard still
  fires"), which passes.
- **Zone hues:** every contrast figure in `docs/design/design-system.md:84-90`
  reproduces exactly from the OKLCH values in `app/styles/tailwind.css:184-188,
  253-257` against `card`/`background` (light 3.93/3.88/3.23/3.96/5.36, dark
  7.25/7.60/8.36/7.48/5.55). All ≥ 3:1 (WCAG 1.4.11), and the hues are used as
  marks only (`bg-zone-*` in `shape-strip.tsx`, `color-mix` tints in
  `score-stanza.tsx`), never as text, as ADR 0113 §3 requires. Light zone 3 is
  the tightest at 3.01:1 on `background`.
- **Type-scale conversions are role-correct:** `text-sm font-medium` →
  `text-callout` keeps weight 500 (`tailwind.css:372-375`); `text-caption
  font-normal` matches the new `design-system.md:155` sentence; the three
  reading steps stay distinct.
- **Tests:** the new `app/utils/luma-steps-lint.test.ts` passes 9/9 in 11 s;
  `profile-bars`, `score-stanza`, `shape-strip`, `__exercise-combobox` and
  `floating-toolbar` tests pass 43/43 against the head tree.
- **Formatting:** `prettier --check` over all 76 changed files is clean.
- **Qualities** (`qualities.md`): the diff is presentational — no query, route
  loader, outbound call, migration or authorization change, so Speed, Failure,
  Security, Insight and Data are untouched. Access is the one quality in play
  and is improved (zone marks now ≥ 3:1 in both themes); finding 5 is the only
  loose end on it, and it is not a regression.
