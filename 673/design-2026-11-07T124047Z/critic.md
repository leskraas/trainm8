# Critic: #673 design, run 1 (unattended, one variant)

## Steps (from design-critic.md, word for word)

1. [x] **Score each variant as built**, open in a browser:
   - **Criteria**: per acceptance criterion, `holds`, `partly` or `misses`, with what you saw.
   - **Craft**: call the Skill tool with `bredvid-design-engineering:emil-design-eng`, and name the details that would make it feel wrong in use.
   - **Worst case**: call the Skill tool with `bredvid-design-engineering:break-ui` in report-only mode, and keep what broke with the fix for each.
   - **Fit**: how it sits with the rest of the product, and how it holds as the next features land on it.
   - **Build cost**: as given.

   Done when every variant has all five.
2. [x] **Recommend** the variant that holds the most criteria; between equals, the one that breaks least in the worst case, then the one with the better fit; build cost decides only between variants equal on all three. When no variant holds every criterion, recommend the closest and name, as a decision, what the build must change. With one variant, say whether it holds every criterion and what the build must fix where it doesn't.
3. [x] **Fill the overview** on the canvas as [../references/canvas.md](../references/canvas.md) says: the verdict strip, the comparison table, the decisions, your scoring in the appendix, and the worst-case board.
4. [x] **Open the designer's pick.** When it differs from yours, put the designer's reason and your answer in one line in the appendix.

## Recommendation

**Handling først, with four build changes.** It holds 10 of the 12 criteria in the browser and partly holds the other 2. Those two (the re-lay and the Avansert editor staying as it is) happen on the server or in code this change leaves alone, so a prototype cannot show them; tests must pin them. It does not hold every criterion as drawn. One worst case is a real defect, in the designer's decision 2: a fresh start from an easy week, with the pre-fill left untouched, cuts the rest of the season by about 30 %.

Decisions the build must take (all two-way, owner `dev` unless marked):

1. **Pre-fill a fresh start with the week's loading value, not its target.** For an easy or taper week, use target ÷ role factor (the last loading week's ramped value). Then confirming the pre-fill without editing it leaves the picked week unchanged. Change the helper sentence "uka du velger er dette tallet" to say the hard weeks are counted from this number. This replaces decision 2's "pre-filled with week N's current target". (`po`, because it changes what the athlete gets.)
2. **Keep the confirm reachable on a long preview.** While the preview is in view, `Bruk endringen` sits in a sticky footer inside the preview, above the tab bar, with the headline count ("29 uker får nytt mål"). Every row stays visible, so decision 7 stands. Without this, a 29-week preview puts the confirm about 2,000 px below the headline.
3. **Label weeks the same way everywhere.** The *Endre tallet* and *Fjern* pickers show "Fra uke 7 · 15. feb · 128,5 km", the date included as in *Start på nytt*, and add the year when the plan crosses New Year. The held sentence names the picked week ("ukene før uke 47"), not the first unbegun week.
4. **Pin the two criteria the prototype can only claim.** Add server tests: after the apply, only the machine's untrained sessions in `onlyWeekKeys` are laid again, the athlete's own sessions are untouched, and weeks outside the change are byte-equal. Keep `__season-anchor-editor` and its tests unchanged.

## Variant table

| Variant | Criteria held | Worst case | Build cost |
|---|---|---|---|
| Handling først | 10 hold · 2 partly · 0 miss | 1 Broken (easy-week pre-fill silently cuts the season), 1 Fragile (confirm ~2,000 px down on a 29-week preview), 3 Ugly | none given (one variant; touches season-edit.ts/.server.ts, schema, words, outline-preview, labels, __season-edits, plan lead, plan loader, tests) |

## 1. Scoring: Handling først

### Criteria

| # | Criterion | Score | What I saw |
|---|---|---|---|
| 1 | The lead's entry per endurance track opens the edit pre-filled, with Avansert open and scrolled to it | holds | One row per endurance track (three in the worst case), and strength points to Avansert. Tapping opens Avansert with the edit's top at 16 px (`drive-report`: `top 16, adv true`) at 390 and 1440 |
| 2 | Three acts: change a value, re-anchor from a picked week, remove a non-earliest segment | holds | Three choice cards (add/set/remove), each with its own fields. The value is in km or hours (`t` on the bike track) |
| 3 | The preview shows every changed week before → after, rise warnings and what held, and writes nothing | holds | 7 rows, 1 held row ("Uke 51 · Satt selv"), a held sentence and `Raskt opp` warnings (+20 %, +27 %, +60 %). Editing a field after previewing hides the preview, so a confirm cannot follow an edited form |
| 4 | The confirm applies exactly what was shown; a stale confirm is refused, writes nothing and offers a fresh preview | holds | With a week begun, *Bruk endringen* is hidden, "Ingenting er lagret" is shown, and *Vis ny forhåndsvisning* re-previews from week 47 |
| 5 | Lived weeks never change, no re-anchor before the first unbegun week, and a value refusal offers a pre-filled re-anchor | holds | The week picker starts at week 46. Changing the season start is refused with the reason, and "Start på nytt fra uke 46 med 36 km" previews in one tap |
| 6 | The earliest segment can be edited but not removed | holds | *Endre tallet* lists "Fra uke 36 · sesongstart". *Fjern* lists only the later segments |
| 7 | A re-anchor on a week that already has a segment edits that segment | holds | The hint says "Uka har allerede et startnivå (48 km). Det endres…", and the preview message says the same |
| 8 | An override in the span survives, still marked, and is listed as held | holds | "Uke 51 · 30 km · Satt selv … kan fortsatt settes tilbake i Endre ukemålet", and a 0-km override holds in the worst case |
| 9 | Changed weeks are laid again; the athlete's sessions and the other weeks are untouched | partly | Stated in the preview's note ("legges appens økter rundt dem") and the toast, but not shown. This is server behaviour; build decision 4 pins it |
| 10 | Every after-value keeps its authored/derived marker, with the derivation one interaction away | holds | *Regnet ut* on each row. A tap opens "Startnivå 34 km fra uke 47, så +2,5 % for hver av de 2 harde ukene før" |
| 11 | The Avansert anchor editor keeps working, and adding a first anchor stays there | partly | Not drawn. The prototype's Avansert holds only the season table and *Endre sesongen*. The design does not touch `__season-anchor-editor.tsx`, so the risk is low, but it is a claim |
| 12 | At 390: no overflow, 44 px targets, `text-base md:text-sm`, Norwegian copy in `labels.ts` | holds | 0 px overflow in 16 checks at 390, 1440 and 320. Fields are 16 px on a coarse pointer and 14 px at ≥768. The only targets under 44 px are radios inside choice cards of 44 px or more and the lead's existing event link, which this change does not touch. All copy is Norwegian. The prototype uses native `<select>`; ui-conventions requires `SelectField` |

### Craft (emil-design-eng)

| Before | After | Why |
|---|---|---|
| A *Regnet ut* chip on every changed row (7–29 identical pills) | A quiet text marker in the row's meta line ("hard uke · Oppbygging · regnet ut"); the pill only for *Satt selv* | A marker on every row is noise; the exception (hand-set) is what the eye should find |
| Stale confirm: the old before → after rows stay at full strength above the refusal | Dim the stale rows (`opacity: .5`) or collapse them until a fresh preview | Numbers that are no longer true should not read as current |
| Focus lands on `<body>` after *Vis forhåndsvisning* (the prototype re-renders) | Move focus to the preview heading (`tabIndex=-1`) and announce the headline in a polite live region | Keyboard and screen-reader users lose their place; on a phone the headline is the answer to the tap |
| The lead shows "Uke 47: 25 km" when the first unbegun week is an easy week | "Uke 47 · lett: 25 km", the role word added | Without the role, the athlete reads their volume as having dropped |
| Preview rows expand on `grid-template-rows` | `motion-collapse` (Base UI panel height) as the system names it, 200/150 | Same feel, and the sanctioned primitive; reduced motion is already a fade |
| Three ~70 px choice cards before the fields | Keep. The descriptions earn the space: they explain what each act does to the weeks, the point of the edit | Not a fault; noted because the designer named it as the cost |

Motion otherwise holds. Choice cards switch instantly. Presses use `scale(.97)` at 160 ms ease-out. Hover is gated to fine pointers. The toast enters and leaves in 250/200 ms ease-out. Reduced motion is handled. No Block.

### Worst case (break-ui, report only)

| # | Severity | Field | Worst-case value | What happens | Fix |
|---|---|---|---|---|---|
| 1 | Broken | fresh-start pre-fill | Pick week 47 (an easy week) and leave the pre-filled "34" untouched | Previewing "nothing" changes 6 weeks: wk 47 34 → 24, wk 48 50 → 34, wk 49 51 → 35… The pre-fill is the easy week's *target*, but the anchor is a *loading* value (derive.ts: `target = anchor × roleFactor`). The helper sentence "uka du velger er dette tallet" is also wrong for an easy or taper week | Pre-fill target ÷ roleFactor (the last loading week's value), and reword the helper. Build decision 1 |
| 2 | Fragile | changed-week count | 29 weeks (a re-anchor from week 46 with no later segment) | The confirm is ~2,000 px below the headline (929 px at 7 rows plus a warning) | Sticky confirm footer inside the preview with the count. Build decision 2 |
| 3 | Ugly | set/remove picker labels | "Fra uke 53 · 112,5 km", "Fra uke 7 · 128,5 km" | These have no date, while the add picker has one ("Uke 1 · 4. jan"). Across New Year, "uke 7" after "uke 53" needs a second look | Same week label everywhere, with the date, and the year when the plan crosses New Year. Build decision 3 |
| 4 | Ugly | held sentence | A re-anchor from week 47 while week 46 is the first unbegun week | "ukene før uke 46 … står som før" for an edit from week 47, the wrong week named | Name the edit's own week. Build decision 3 |
| 5 | Ugly | inline pre-fill | Week 46 → 47 → 46 | The value follows the week the first time ("34") but not on the way back (stays "34", the target is 48,5) | Re-prefill on every week change until the athlete types, and never after |
| 6 | Fragile | value | 4000 km/uke | Accepted. Only the rise warning catches it. `authoring-schema.ts` has `.positive()` with no maximum | Leave as a warning (ADR 0084 §3 warns, never blocks). Note: no maximum anywhere |
| 7 | Ugly | 200 % zoom | Worst data at a 195 px CSS viewport | 12 px horizontal overflow; the preview message and warning are clipped at the right | `min-width: 0` on the preview's flex/grid children. It holds at 320 (the WCAG reflow bar) |

What held: three tracks with mixed currencies (km, t); six segments, one outside the plan ("Utenfor planen", and editing it answers "Ingenting å endre"); a 60-character phase name (one-line clamp, full name in the derivation); a 0-km and a 142,5-km override; blank, `abc`, `0`, `-5` and `48.5` (a dot decimal is accepted); Enter submits the preview; editing after a preview hides it; dark mode; 320 px with no overflow; no console errors.

### Fit

- It fits the product. It reuses `EditShell`'s single form → one digest → confirm, the *Endre sesongen* card, the held-sentence vocabulary of ADR 0084 §4, `weekRiseWarnings`, and the `?edit=…#season-edit-…` deep link `__plan-advanced.tsx` already opens on. The new copy follows the existing tone ("Du ser hver endring før den gjelder").
- It holds as the next features land. Out-of-scope edits (Volume Ramp, Block Boundary Step, cuts) can join as further kinds of the same edit, or as further choice cards, without a second preview shape. The expandable "Regnet ut" derivation row is the shape every later derived-number preview will want, so build it once in `outline-preview.ts`.
- One door. Decision 1 (what the lead shows per track) is the only one-way door: a new standing row on Plan's lead. It is right to add it. The role word for an easy or taper week (craft table) should come with it.
- One risk. The segments are a picker, so this surface never shows the anchor history. That is fine while the Avansert editor stays; if that editor is ever deleted, a visible segment list has to come back here.

### Build cost

As given: none (one variant). The code it touches is `season-edit.ts`, `season-edit.server.ts`, `season-edit-schema.ts`, `season-edit-words.ts`, `outline-preview.ts`, `labels/plan-domain.ts`, `labels/sesong.ts`, `__season-edits.tsx` (+server), `__plan-lead-card.tsx`, `__plan-lead.ts`, the `plan.tsx` loader, and tests. Build decisions 1–4 add no files: a role-factor division in the pre-fill, a sticky footer in the shared preview, a label helper, and server tests.

## 2. The designer's pick

I opened it after writing everything above. The pick is the same variant, Handling først. **Disagreement, in one line:** the designer pre-fills a fresh start with "that week's own target", and would answer the long preview by repeating the headline above *Bruk endringen*. My answer: on an easy or taper week the target is not an anchor value (the untouched pre-fill cuts 6 weeks by ~30 %), so pre-fill target ÷ role factor; and a repeated headline still leaves the confirm ~2,000 px down, so a sticky confirm footer inside the preview reaches it without hiding rows.

## Probes

Settled by probe: does an untouched pre-fill change the plan? I ran `src/critic-probe.mjs` (Playwright at 390): add from week 47, kept "34", previewed. It showed 6 weeks changed, week 48 50 → 34. The output is in `src/critic-probe.json`.
Settled by probe: how far down is the confirm on a long preview? I ran `src/critic-probe.mjs` and `src/critic-probe2.mjs`. The confirm is 929 px below the preview heading at 7 rows plus a warning and 883 px at 5 rows plus a warning, so about 2,000 px at 29 rows.
Settled by probe: reflow at 200 % zoom. A 195 px viewport shows 12 px of overflow (`critic-zoom200-worst.png`); 320 px shows 0.
