# Standards review: leskraas/trainm8#699 (issue #587), head efb344f

Reviewed cold: `git diff origin/main...HEAD` (44 files, +5596/−568), 30 commits. I did not read the PR body or earlier run comments.

**Standards sources read:** `CLAUDE.md` (agent rules, UI-craft rule), `.sandcastle/CODING_STANDARDS.md` (the repo's only CODING_STANDARDS; no CONTRIBUTING), `docs/design/ui-conventions.md` (ADR 0028), `docs/design/design-system.md` (ADR 0085 / 0119), `docs/agents/domain.md`, `docs/agents/factory.md`, `docs/guiding-principles.md`, `GLOSSARY.md`, ADR 0109, and the code-review smell baseline. I checked `.claude/skills` emil-design-eng and mobile-native for focus/scroll rules only. The diff adds no motion, so `review-animations` has nothing to judge.

**Checked and clean:** no guard file (`.github/**`, `.claude/**`, `CLAUDE.md`, `fly.toml`, `other/**`) is touched; no new dependency; no `any`; no raw `text-xs…` or off-step `rounded-*` (lint enforces those anyway); no `transition-all` or keyframes; every Norwegian string comes from `labels/`; every Prisma read uses `select`; the outline read is scoped to the owner (`athleteId: userId`); GLOSSARY gains **Retired track** with its _Avoid_ terms. Relative `../` imports in `app/utils/**` and the `../start/` imports in routes follow existing precedent (the standard only bans `../../..`), so I don't flag them.

Severity: there are no critical or high findings. (a) is documented-standard breaches; (b) is baseline smells, which are always judgement calls.

---

## (a) Documented-standard violations

### A1 — medium · The activities editor's refusal is not tied to its fieldset
`app/routes/settings/__activities-edit.tsx:150-162, 206-212`
- **Rule:** CODING_STANDARDS › Accessibility says "All form fields have an associated `<label>` … Error messages link via `aria-describedby`". CODING_STANDARDS › Forms says to use conform for every form and not to hand-roll `useState` form state.
- **What happens:** the refusal "Velg minst én aktivitet…" or "Styrke legges ved siden av…" shows in a free-floating `<p role="status" data-activities-note>`. No `aria-describedby` links it to the `<fieldset data-activities-editor>`, and `ActivityChips` gets no `invalid`. On the start (`trening.tsx`) the same chips get `invalid={Boolean(fields.discipline.errors?.length)}` and a linked `ErrorList`. The picks are hand-rolled `useState` plus hidden inputs instead of conform. Conform is a poor fit for chips with order semantics, so that part is arguable. The missing error association is not arguable.
- **Fix:** give the note an id, put `aria-describedby` on the fieldset, and pass `invalid` when `reply.kind === 'refused'` for `no-activity` or `lifting-only`.

### A2 — medium · The "one rule" for a retired track is written three ways
`app/utils/plan-outline/from-rows.ts:474-484` (new `trackRetiredAt`) vs `app/utils/plan-outline/season-anchors.ts:85` (`held.value === 0`) and `:101` (`anchorInForceAt(anchors, …)?.value === 0`)
- **Rule:** ADR 0109 §3 says "A retired track is read by one rule … `trackRetiredAt` … Every reader of the plan's activities goes through it". `docs/guiding-principles.md` says "Only one way".
- **What happens:** `trackRetiredAt` hand-rolls an "anchor in force at week" loop. `season-anchors.ts` already exports `anchorInForceAt` (on main) for exactly that, and `season-anchors.ts` has no imports, so using it creates no cycle. Meanwhile `editAnchorList` writes the retired test inline twice instead of calling `trackRetiredAt`. Three spellings of one rule can drift. This is also possible Duplicated Code.
- **Fix:** have `trackRetiredAt` return `anchorInForceAt(track.anchors, weekKey)?.value === 0`, and call it from `editAnchorList`.

### A3 — medium · The writer re-derives a rule the pure splice already decided
`app/utils/first-run/activities-edit.server.ts:542-555` vs `app/utils/first-run/activities-edit.ts:506-512`; also `activities-edit.server.ts:698-713` vs `activities-edit.ts:648-653`
- **Rule:** ADR 0109 §5 says "made = shown [is] a property of one computation". It requires the week to be laid from the rows as the apply will store them.
- **What happens:**
  - The added-track anchors ("0 from the plan's first week, then the draft's value from the boundary, or only the latter when they coincide") are computed in `spliceActivitiesEdit` (`addedTracks`). `writeActivitiesEdit` then recomputes them from `splice.rows.startWeekKey` and `from` instead of writing `splice.rows`' anchors.
  - The rule "one lifting slot per lift" is likewise expressed separately. The preview uses `input.lifting.slice(0, liftCount)`; the apply runs a `for (orderInDay < lifts)` loop with `weekday: null`.
  - The digest catches a divergence only if it reaches the laid week.
- **Fix:** write the anchors and slots straight from the splice output.

### A4 — low · An off-ladder heading hierarchy on the Nivå og økter page
`app/routes/settings/level.tsx:139-149, 155, 169`; `app/routes/settings/__activities-edit.tsx:304, 322`
- **Rule:** design-system › Type says "By role … Section, row title and row fact are three visible steps". ui-conventions §1.7 sets one section-heading style.
- **What happens:** the page now has two sibling `<h2>`s in different styles:
  - "Aktiviteter" uses `MeSectionHeading`: overline, uppercase, muted.
  - "Svarene dine" is a hand-rolled `<h2 className="text-heading">` rather than `MegSection`.
  - Inside "Svarene dine", the legends "Nivå" and the preferences are also `text-heading`, so parent and child sit on the same step.
  - The preview's `<h3>` is `text-heading`, which is visually larger than its own `<h2>` (overline).
- **Fix:** use `MegSection` for "Svarene dine", or give the legends a step below the section.

### A5 — low · A route file overrides control fonts and heights
`app/routes/settings/__activities-edit.tsx:200, 349` (`StatusButton className="text-callout …"`); `app/routes/start/__activity-chips.tsx:137` (`ToggleGroupItem … text-callout h-11`), `:179` (`Button … text-footnote`)
- **Rule:** ui-conventions §2.6 says "Per-screen code never sets control heights or fonts — a `text-sm` or `h-7` on a control in a route file is a review flag". design-system says generated components keep their `text-sm`.
- **Context:** the old level.tsx Save button had the same override, and the chips moved verbatim from `trening.tsx`. So this is precedent, not new, but the new editor copies the flag twice more.

### A6 — low · Off-ladder spacing with no stated reason
`app/routes/settings/__activities-edit.tsx:321, 325` (`space-y-3`), `:333` (`space-y-0.5`), `:174, 300, 329` (`space-y-1`)
- **Rule:** ui-conventions §1.4 says "8px grid, one value per role. Off-ladder spacing needs a stated reason."

### A7 — low · The preview card doesn't match the documented surface
`app/routes/settings/__activities-edit.tsx:286`
- **Rule:** design-system › Surfaces says a content block is "`bg-card`, `shadow-md` … `ring-foreground/5` (dark `/10`)". The preview uses `shadow-xs`.
- **Context:** this has precedent on the start's cards (`__week-sketch.tsx:325`, `klar.tsx:76`). Note it, or fix the doc.

### A8 — low · The stale alert uses `text-destructive`
`app/routes/settings/__activities-edit.tsx:294`
- **Rule:** design-system › Type says "field errors `text-footnote` (errors in `text-foreground-destructive` …)".
- **Context:** Meg's own helpers use `text-destructive` throughout (`__meg-ui.tsx:213, 331, 355`), so this is consistent locally but off the written token.

### A9 — low · A focus target with no visible focus
`app/routes/settings/__activities-edit.tsx:283-286`
- **Rule:** CODING_STANDARDS › Accessibility says "a visible focus state".
- **What happens:** a fresh preview's `<section tabIndex={-1}>` gets programmatic focus (line 137) with `outline-none` and no `focus:` ring. Commits 574d29c and efb344f gave the done and stale lines rings for exactly this reason, so the preview is now the odd one out. It matches `__treningsform.tsx:205`.

### A10 — low · Route tests read the real clock
`app/routes/settings/level.route.test.ts:183` (`new Date(Date.now() + 120 * 24 * 3600 * 1000)`), `:248` (`readFirstUnbegunWeekKey(userId, new Date(), …)`)
- **Rule:** CODING_STANDARDS › Testing says "Tests must run deterministically. No real network, no real clock".
- **What happens:** the boundary depends on the weekday (ADR 0109 §2: a Monday with nothing trained is this week), and the test computes it with a separate `new Date()` from the loader's. A run across midnight Sunday→Monday can disagree. The server test does it right with a fixed `NOW` (`activities-edit.server.test.ts:67`).

### A11 — low · One action branch is untested and gives the wrong message
`app/routes/settings/__activities-edit.server.ts:320-324`
- **Rule:** CODING_STANDARDS › Testing says "Every loader/action that branches on input state should have at least one test that exercises each branch".
- **What happens:** the zod-failure branch (for example `sports=ski`) has no test in `level.route.test.ts`. It also answers with `W.refusal['not-editable']` ("Planen kan ikke legges på nytt herfra lenger"), which says something untrue about the plan for a malformed post.

### A12 — low · The e2e test locates by data attributes and doesn't emulate a phone
`tests/e2e/meg-activities-edit.test.ts:12, 44, 71, 106`
- **Rule:** CODING_STANDARDS › Testing says "role-based locators … not by `data-testid` unless there's no semantic alternative". ui-conventions §5 says "Playwright, 390×844, `isMobile`".
- **What happens:** `[data-meg-activities]`, `[data-activities-preview]` and `[data-activities-done]` work as test ids. The preview is a labelled `<section>`, so `getByRole('region', { name })` is available. `isMobile` is unset, as in all 14 of the repo's 390-wide e2e tests, so this is precedent.

### A13 — low · The ADR's State section names the wrong file
`docs/adr/0109-…md`, "State"
- **Rule:** docs/agents/domain.md says to keep ADRs true.
- **What happens:** it says "the Meg editor in `level.tsx`", but the editor is `app/routes/settings/__activities-edit.tsx`; level.tsx only mounts it.

---

## (b) Baseline smells (judgement calls)

### B1 — possible Speculative Generality: an optional digest on the apply
`app/utils/first-run/activities-edit.server.ts:421-434`

```ts
 * Omitted, nothing is compared: a caller that never showed a preview.
 …
 { digest }: { digest?: string } = {},
 …
 if (digest != null && computed.preview.digest !== digest) {
```

The only production caller always passes a digest, and the route refuses without one (`__activities-edit.server.ts:328`). The optional path exists for tests (`activities-edit.server.test.ts:295`) and is a quiet way around "made = shown". Make the digest required, and have tests read a preview first.

### B2 — possible Duplicated Code / Data Clumps: one concept, two types
`app/routes/start/__activity-chips.tsx:46-52` (`ActivityPicks`) and `app/utils/first-run/activities-edit.ts:81-88` (`ActivitiesChoice`) are field-for-field the same `{ sports: CardioDiscipline[]; activities: ActivityKind[]; strength: StrengthPerWeek | null }`. The main-sport hand-over is also written twice:

```ts
sports: [...before.sports.slice(1), before.sports[0]!],
```

It appears at `trening.tsx:280` and `__activities-edit.tsx:168`. A pure `switchMainSport(picks)` beside `pressActivities` would serve both.

### B3 — possible Duplicated Code: strength-frequency narrowing
`app/utils/first-run/plan-start-options.server.ts:75-82` (`strengthChoice`) and `app/routes/settings/__activities-edit.server.ts:271-277` both repeat:

```ts
(STRENGTH_PER_WEEK_CHOICES as readonly number[]).includes(value)
```

Each comes with a cast. `start-schema.ts` already has `StrengthPerWeekSchema` and `StartActivitiesSchema`, which `ActivitiesFormSchema` partly re-declares. The sports field can't reuse `SportsSchema`, because that one reorders to the fixed order and loses main-first. A shared `isStrengthPerWeek` guard would remove both casts.

### B4 — possible Primitive Obsession: Discipline carried as `string`
In `activities-edit.ts`, `TrackChange.discipline: string` (`:172`), `KeptSession.discipline: string` (`:690`) and `removed: string[]` (`:717`) are carried as strings. The code then casts them back: `track.discipline as Discipline` (`:657`), `session.discipline as Discipline | 'other'` (`:799`), `track.currency as VolumeCurrency` (`:605, :658`), `cutGoal as StrengthGoal | null` (`:390`). Separately, `trening.tsx:140` (`picks.strength as StrengthPerWeek | null`) is a redundant cast left after commit 39c2d7d ("so no call site casts"). `plan-start-options.ts:136` hard-codes `'other'` where `isSimpleActivityTrack` exists.

### B5 — possible Duplicated Code in the writer
`app/utils/first-run/activities-edit.server.ts`:
- The "first Week Pattern with days" query is written twice: `:446-450` and `:642-646`.
- The endurance-segment `create` data (`ramp`/`boundaryStep`/`recoveryCut`/`taperCut`) is written twice back to back: `:571-583` and `:584-606`.
- `activities-edit.ts:410-416` copies the same four fields plus `mix` field by field, where `LaidSegment` already names the clump.

### B6 — possible Data Clumps: the same five arguments everywhere
`(db, userId, outlineId, weekKey, timezone)` travels together through `readHeldSessions` (`stamp.server.ts:524`, now six positional args with `known?`), `readKeptSlots`, `clearPlanWeek`, `readKeptSessions` and `readKeptAhead` (`activities-edit.server.ts:355-366, 466-474`). They want to be one `PlanWeekRef`.

### B7 — possible Divergent Change / configuration-by-flag: `readPlanStartAnswers`
`app/utils/first-run/plan-start-options.server.ts:112-118, 237-243`

```ts
{ offerStrength = false }: { offerStrength?: boolean } = {},
…
readOnly: season.eventId != null ? 'event' : otherCurrency ? 'currency' : null,
```

The general "read a plan back as the start's answers" now carries an edit-only verdict (`readOnly`, `eventName`) and a boolean that changes its I/O. CODING_STANDARDS › Architecture says "Prefer composition over … configuration-by-flags". The retired-track filter also runs twice: once in the server (`:131`) and again in `planStartAnswers` (`plan-start-options.ts:122`), which is handed the unfiltered list.

### B8 — possible Mysterious Name / odd discriminant: `EditContext`
`app/utils/first-run/activities-edit.server.ts:122-132, 412, 430`:
- `EditContext.liftingDays` is typed as `ReturnType<…> extends Promise<infer Days> ? Days : never`, which is just `Awaited<ReturnType<typeof readAvailablePatternDays>>`.
- `readEditContext` returns `EditContext | { ok: false; … }`, and callers tell the two apart with `'ok' in context`, so the success shape has no `ok`.
- In `__activities-edit.tsx:43`, `sameChoice` reads equality through a refusal code (`choiceRefusal(a, b) === 'same'`), which hides what "same" means.

### B9 — possible Duplicated Code: one sentence stored twice
The retired-track sentence is copied verbatim into `labels/sesong.ts:920` (`retiredTrack`) and `labels/plan-domain.ts:622` (`'retired-track'`). The comment says they are the same refusal, so one should reference the other.

### B10 — Long functions (outside the baseline list)
`spliceActivitiesEdit` (`activities-edit.ts:291-598`, about 300 lines) and `writeActivitiesEdit` (`activities-edit.server.ts:493-733`, about 240 lines, nine kinds of write). Both are hard to review against ADR 0109 §3 item by item. Splitting per section (phases / tracks / strength / pattern) would map them onto the ADR.

---

## Not checked
CLAUDE.md's UI-craft rule also asks the PR to say "what still needs a real phone". That lives in the PR body, which this review was told not to read.

**Summary:** 13 documented-standard findings (3 medium, 10 low, none critical or high) and 10 judgement-call smells. The worst are A2 (the "one rule" for a retired track is written three ways, against ADR 0109 §3), A3 (the writer re-derives anchors and lifting slots the pure splice already decided, against ADR 0109 §5) and A1 (the editor's refusal isn't tied to its fieldset with `aria-describedby`).
