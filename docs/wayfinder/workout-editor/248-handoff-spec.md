# The corrected workout editor — handoff spec

> **Provenance:** the destination of wayfinder map
> [#234](https://github.com/leskraas/trainm8/issues/234) — *Correct the
> workout editor: Token Sentence as the sole authoring surface*. Every
> decision below was settled with the operator across tickets #235–#247;
> this document consolidates them with supersessions applied. Where this
> spec and an individual ticket disagree, this spec is wrong — the ticket
> resolutions are the source of truth, and later decisions supersede
> earlier ones (#242 supersedes #236's wide-screen layout; #247 refines
> #242's chip; #246's autosave supersedes any save-button chrome).
>
> **Mode note:** this is a redesign spec, not an implementation plan.
> Implementation is a separate effort that rebuilds from this document
> without drifting from intent. The design artifact's polish
> ([artifact](https://claude.ai/code/artifact/fba6ecfa-0c19-4933-9a0f-352ccb42cb6b),
> Directions 1/4/11) is the reference craft level.

Domain vocabulary is `CONTEXT.md`'s: **Workout**, **Block**, **Step**,
**Token**, **Token Sentence**, **Workout Notation**, **Workout Shape**,
**Intensity Target**, **Step Quantity**, **Unavailable Metric**. All copy in
the editor uses this athlete-domain language — internal identifiers
(`zoneLabel` enums, recipe ids, Zod paths) never render.

---

## 0. The one paradigm

**The Token Sentence is the sole authoring surface.** The classic
nested-fieldset form is deleted. The **Workout Shape** renders beneath the
sentence as a read-only preview. There is no third surface: the rich
block-editor **sheet** survives only as a *summoned* secondary surface
(opened from a menu, dismissed after use), never a permanent parallel form.

One card contains the whole editor, top to bottom:

1. **Session header** — quiet editable title + one metadata line (§2.6)
2. **The token line** — the stanza: one block per line with gutter (§2)
3. **Validation summary line** — only when the server has complaints (§10)
4. **Shape strip preview** — read-only, absent until honest (§8)

The same card is the detail view for scheduled sessions (§1). The athlete's
intent is the authority throughout; the design artifact is evidence, not
gospel.

---

## 1. Surfaces & lifecycle — the detail view IS the editor
*(from [#246](https://github.com/leskraas/trainm8/issues/246))*

- **One surface.** The Workout Detail View for a *scheduled* session embeds
  the whole editor card (header + line + strip). The "Edit session" button,
  the helper prose ("Tap a token to adjust it…"), and the standalone edit
  page **all die** (B9).
- **No viewing mode.** The always-visible ⠿/⋮/＋ chrome renders identically
  in the detail view — no dimmed variant, no wake-on-touch. A mode split is
  exactly what #236 rejected; #242's craft already keeps chrome subordinate
  to notation.
- **Autosave — save on change** (operator course-change, locked). Every
  committed token or structure change on a persisted session posts
  immediately through the existing edit action. There is no save button, no
  dirty state, no exit guard. This carves autosave out of Direction 5 as a
  correction to this editor; Direction 5's two-pane live summary stays out
  of scope.
- **Feedback is silence.** Optimistic updates; a successful autosave is not
  an event — no toast, no spinner. One quiet, delayed "saving…" indicator
  appears only when a save actually hangs (~2 s). Failures land in §10's
  error language, edit-to-clear (each subsequent change re-posts).
- **Create is the exception.** A new session is built locally and persisted
  with one explicit **"Create session"** action — the domain deliberately
  has no draft state. The empty-state composition (§11) lives on this create
  surface. After creation the athlete is in the autosaving detail view.
- **Immutable sessions** (completed / missed / skipped) render the identical
  stanza — gutter, repeat badge, typography, tinted zone chips — but
  ⠿/⋮/＋ and tap-to-edit **do not exist**. The absence of marks *is* the
  immutability signal: no lock icons, no explanatory prose. The strip
  renders where the detail view doesn't already show the Telemetry Overlay.

---

## 2. Layout & visual language — the Score direction
*(from [#242](https://github.com/leskraas/trainm8/issues/242), locked at
every width; supersedes #236's "flowing sentence on wide screens" detail.
[Prototype](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-mba2tl/docs/wayfinder/workout-editor/242-visual-craft-prototype.html),
variant C + tinted chips.)*

### 2.1 The stanza

- **One block per line, always** — at every viewport width. The line breaks
  only at block boundaries, never as a ragged wrap.
- A left **gutter** (~64 px; 48 px under 520 px) carries the block's ⠿ grip
  and, when repeat > 1, the repeat count as a small **mono badge** (`5×`) —
  like bar numbers in a score. Repeat parentheses leave the line entirely;
  the badge states the repeat. `( … rest )` parentheses stay, reserved for
  rest *steps* (§5.2).
- **Hairline rules** separate block rows; a row tints faintly on hover /
  menu-open.

### 2.2 Notation typography

- Values are **weight-and-ink text**: weight 600, **tabular numerals**,
  never boxed at rest. Words and separators sit in the muted ink. Notes are
  italic, quoted, ellipsized (22ch; 11ch narrow).
- The **one chip-shaped element on the line is the intensity chip** (§7.2):
  zone colour mixed ~22–26 % toward the surface, small-caps content.
  **Unresolved** = the same chip with a dashed border on transparent — never
  asterisks (B3). Everything else on the line is typography.
- A step and its chrome are **one unbreakable unit**; wrapping happens only
  at token boundaries under 640 px (B2 — no orphaned `×` on its own line).

### 2.3 Chrome

- ⠿ (block grip), ⋮ (step handle), ＋ (add) are **always visible**,
  ink-faint on the text baseline — never absolutely positioned off it, no
  hover reveal, no edit mode. Hover/press → accent on accent-soft (B1).
- Hit targets **≥22 px** (30 px under 640 px); popover controls ≥44 px on
  touch (§9.2).
- ⠿ must read distinctly from ⋮ (block vs step).

### 2.4 Popovers

- **Caret-anchored to their token**, 12 px radius, layered shadow,
  **130 ms scale-in** from the anchor (reduced-motion honored), uppercase
  mono cap label, max-width 324 px, flip-above when cramped.
- Every value is **type-to-edit with ± nudges** — never stepper-only (B4).
- **Non-modal and retargeting** (§9.1, from #240): activating another value
  glides the open popover to the new anchor (180 ms position transition,
  caret tracking) and swaps content in place — never close-and-reopen. Click
  outside on non-interactive ground closes; **Esc closes and returns focus
  to the anchor**. Sheets and menus swap content in place by the same rule.
- Selects render **exactly one chevron** (B6 — fix `app/components/ui/select.tsx`'s
  double indicator).

### 2.5 Foundations

- **Palette:** the design artifact's — teal accent `#0d7a68` (light) /
  `#35b89c` (dark), its Z1–Z5 zone hues, its surface/ink scale — specified
  in **both themes**.
- **Copy:** athlete-domain words only. Resolution provenance is stated in
  human words — *"Z3 · Tempo resolves to 170–178 bpm from your profile"* —
  never `zoneLabel`, recipe ids, or dev notes (B5).

### 2.6 Session header

The header shares the card, in the same language: the **title as a quiet
editable heading**, then **one metadata line of tappable text tokens**
(e.g. `Run · Threshold · Tue 14 Jul, 06:30`), separated from the blocks by
the same hairline rule (B8). No form-field greys, no label grid.

---

## 3. Structural editing from the line
*(from [#236](https://github.com/leskraas/trainm8/issues/236);
[final prototype](https://github.com/leskraas/trainm8/blob/claude/wayfinder-236-round-3-0hqk8s/docs/wayfinder/workout-editor/236-structural-editing-prototype-r3-l1-always.html).)*

The line is **pure notation with always-visible inline chrome** — no hover
reveal, no edit mode.

- **Block ⠿ grip** on every block: click opens the block menu — **Name… ·
  Repeat… · Move earlier/later · Add step · Add block after · Open block
  editor · Delete** — and drag reorders blocks (G1, G3).
- **Block names never render on the line** (G2). The name is data: it lives
  in the block menu and the sheet.
- **Repeat** is introduced from the block menu; once > 1 it renders as the
  gutter badge (§2.1).
- **Step ⋮ on every step, uniformly** — cardio, strength and rest alike:
  **Move · Duplicate · Kind (§4) · Remove** (G4). The menu's contents are
  exactly these plus §4's Kind section — the "add facets" slot #236
  penciled in was **not** adopted (§6 owns introduction), with the single
  zero-token exception in §6.3.
- **Values tap-to-edit in place** via §2.4 popovers. No add-anchors, no
  dotted underlines on the resting line.
- **The sheet** (rich block editor) opens via ⤢ from the block menu — a
  summoned, transient surface. Its controls follow the same models (kind
  routing §4.3, error mirroring §10.5).

---

## 4. Changing a step's kind (cardio ↔ strength ↔ rest)
*(from [#237](https://github.com/leskraas/trainm8/issues/237);
[prototype](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-wdhrtu/docs/wayfinder/workout-editor/237-step-kind-prototype.html),
variant A.)*

### 4.1 Affordances

- The step ⋮ menu carries a **Kind section**: the current kind checked
  (inert), the other two as **"⇄ Make strength / cardio / rest"** rows. No
  kind mark is added to the resting line — the tokens already read as their
  kind.
- Each switch row carries a one-line **preview** of its consequences —
  *keeps … / sets aside … / brings back …* — so the switch never feels
  destructive.
- **＋ (add step) opens a three-row kind chooser** — Cardio · Strength ·
  Rest, each with its seed hint — instead of blindly inserting cardio (G5).

### 4.2 Reconciliation on switch

- The **note always carries**. A **time quantity carries cardio ↔ rest**; a
  distance doesn't fit rest, so it's set aside and rest seeds 1 min.
- Every other **authored** value is **set aside in-session, not
  destroyed** — switching back restores it. Untouched seed values are not
  remembered. The stash **dies with the editing session** and is never
  persisted; on save only the active kind's fields are written.

### 4.3 One model everywhere

The sheet's Kind select routes through the **same** reconciliation, so both
surfaces agree.

---

## 5. Strength authoring as tokens
*(from [#238](https://github.com/leskraas/trainm8/issues/238);
[prototype](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-zwiccn/docs/wayfinder/workout-editor/238-strength-tokens-prototype.html),
variant B.)*

### 5.1 On the line

- `Exercise` is the shipped searchable combobox (Direction 1). The set
  notation is **one tappable token**: uniform sets collapse to
  `5 × 5 @ 80 kg`; mixed sets list each — `5 @ 100 kg / 3 @ 110 kg /
  1 @ 120 kg` (matching `formatSetsSummary`).
- **Rest-between-sets folds into the set notation**:
  `Deadlift 5 × 5 @ 100 kg · 3 min rest` — **no parentheses**. The
  parenthesized `( … rest )` form is reserved for rest *steps*, so the two
  never read alike.

### 5.2 The sets popover — uniform-first

- When every set is equal (the common case) the popover **mirrors the
  notation**: `sets × reps @ load` as three inline controls — one gesture
  per value. A kind select swaps the middle control (rep / timed / AMRAP
  sets); load is **one field with a kg ⇄ %1RM toggle** (mutually exclusive,
  as the schema's `weightXorPct` enforces).
- **"Vary sets individually ▸"** expands to a per-set grid — a row per set
  (quantity, load, ⧉ duplicate, ✕ remove, ＋ add). Mixed sets open directly
  expanded.
- **"◂ Collapse to uniform" appears only when sets are already equal** —
  the uniform editor never destroys authored variation.
- **Rest-between-sets lives in the popover's footer slot** (G10): a stepper
  + remove when set, "＋ rest between sets" when absent — rest lives with
  the sets it separates, not in the step ⋮ menu.

---

## 6. Introducing an absent facet — popover neighbours
*(from [#243](https://github.com/leskraas/trainm8/issues/243);
[prototype](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-i9z1nd/docs/wayfinder/workout-editor/243-absent-facet-prototype.html),
variant C.)*

The audit's core finding (#235): *a token renders only when its value
exists, so there is no anchor to tap to introduce an absent value.* The
answer: **no new line chrome and no menu rows** — an absent facet is
introduced from the popovers of the tokens the step already renders,
generalizing §5.2's rest-in-footer precedent.

### 6.1 The four gaps

- **Step Quantity kind (G8):** the quantity popover **leads with a
  Duration / Distance segmented switch** (switching seeds a sensible
  default). An unquantified step introduces its quantity via a
  "＋ time or distance" link in its zone/note popovers.
- **Intensity (G7):** "＋ intensity" link in the step's other value
  popovers opens the intensity popover (§7.3). Removal is a quiet *Remove
  intensity* footer action in the intensity popover itself.
- **Notes (G9):** "＋ note" link in every value popover (cardio quantities,
  the sets popover footer for strength, the rest popover). *Remove note* in
  the note popover's footer.
- **Per-step discipline (G6):** a single-chevron **discipline select**
  (`inherit · run` / run / bike / swim) rides the quantity popover (cardio)
  and the sets popover (strength). Rest steps have no discipline.

### 6.2 Override rendering

An **overridden** discipline renders as a **quiet word token** (e.g. `run`)
at the step's start — tap to edit or clear. Inherited discipline renders
nothing. The intensity chip stays the line's only chip element.

### 6.3 Zero-token fallback

A step whose every facet has been removed has no popover anchor, so its ⋮
menu grows a single fallback **"Add…"** row — present only in that state,
invisible in every normal one.

---

## 7. Intensity Targets — every metric kind, one scale
*(from [#247](https://github.com/leskraas/trainm8/issues/247); refines
#242's chip.)*

### 7.1 The common scale — zone-equivalent bucketing

A new **pure function** resolves any metric target (power W / %FTP, HR
bpm / %LTHR / %maxHR, pace) against the athlete's Discipline Profile
threshold via the existing resolver (`app/utils/zones/resolve.ts`), then
buckets the resolved value into **the zone band of the athlete's own
recipe**. The strip keeps the five-step height ladder (§8.2); recipes with
more bands (Coggan Z6/Z7) clamp to the top step.

**Honesty rule:** when the required threshold (or the zone system) is
absent, the step gets the unresolved treatment — dashed chip, fixed nominal
hatched strip height — **never a fabricated value**. (Rejected: a
continuous IF-like scale; reusing Planned-TSS midpoint machinery.)

### 7.2 On the line — the chip generalises

Intensity is always **one mark: the tinted chip**. Its **content** is the
authored value in its own form — `Z3`, `235 W`, `4:40/km`, `162 bpm`,
`RPE 7`; its **tint** is the resolved zone-equivalent; when nothing
resolves it is the same chip **dashed**. Pace moves *into* the chip (it is
no longer a separate text token); the chip remains the line's only chip
element, and the athlete's authored intent stays the authority in the text.

### 7.3 The intensity popover — zone first, quiet kind switch

- Leads with the **five zone chips** (the common case).
- Beneath: a quiet row — *"or set: pace · watts · heart rate · RPE"* — that
  **swaps the popover content in place** to that kind's inputs, ordered
  discipline-aware (run leads with pace, bike with watts).
- Unit toggles follow §5.2's pattern: **W ⇄ %FTP**, **bpm ⇄ %LTHR/%maxHR**.
- **One provenance line** at the bottom, in human words — *"≈ zone 3 for
  you"* / *"can't be placed in a zone — FTP missing in settings"* (B5).

### 7.4 RPE — in, but last, by convention

Prescribed RPE (distinct from Session Log RPE, untouched) is the last,
quiet option in the kind row — the one target kind that works without
meters or thresholds. Tint and strip height come from a **fixed documented
convention table**: RPE 1–2 → step 1, 3–4 → 2, 5–6 → 3, 7–8 → 4,
9–10 → 5. RPE is the athlete's own intensity statement — it **never
degrades** to unresolved; the provenance line says *"RPE 7 ≈ zone 4
effort"*.

---

## 8. The Workout Shape preview — honest, lean, height-profiled
*(fidelity from [#239](https://github.com/leskraas/trainm8/issues/239);
geometry from #242 and its round-4 amendment.)*

### 8.1 Honesty rules (#239)

- **Lean strip:** no time axis, no zone legend, no on-strip captions — the
  sentence one line above is the numeric statement; the strip's one job is
  pre-attentive rhythm-and-hardness.
- **No `× N` bracket rail in the preview** (the sentence states the repeat;
  other surfaces keep their brackets).
- **Never fabricates:** the intent-fallback bar is gone from the preview. A
  step with neither quantity nor intensity paints nothing; with **zero
  paintable steps the preview region is absent** entirely (B7's
  empty-workout lie killed; composition per §11).
- **Unresolved zones** keep their true width in the hatched non-zone
  treatment — visibly outside the Z1–Z5 encoding, unexplained on the strip
  itself (the sentence's chip is where unresolvedness is named and fixed).
- **Non-timed steps resolve to time widths**: distance steps via the
  athlete's resolved pace, reps-based strength via Planned-TSS-style
  estimates; when nothing resolves, a **fixed nominal width — never a
  sliver**.
- **Always full width**; relative widths carry the rhythm, total duration
  is the sentence's job.

### 8.2 Geometry (#242, round-4 amendment)

A bottom-aligned **segment chart** in the artifact's Direction-4 language,
**height = intensity**: Z1 30 % → Z5 100 % of the 42 px strip, rest
segments lowest (16 %), 2 px gaps, 3 px top radii. Where intensity is
*unknown* the height is a fixed nominal **55 % convention, never a guess**
— strength segments muted solid, unresolved zones hatched. Width stays
time-true per §8.1. Metric targets take their height from §7.1's bucketing;
RPE from §7.4's table.

---

## 9. One input model — mobile, keyboard, screen reader
*(from [#240](https://github.com/leskraas/trainm8/issues/240);
[prototype](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-norwegian-amtot9/docs/wayfinder/workout-editor/240-mobile-a11y-prototype.html),
variant A + retargeting.)*

**The same caret-anchored popover is the editor on every device.** No
bottom sheets, no separate mobile surface, no roving-focus composite
widget.

### 9.1 The retargeting popover

Part of the popover language (§2.4): non-modal; activating another value
glides the popover to the new anchor and swaps content in place (180 ms,
reduced-motion honored) — time → pace → zone is one continuous pass. Esc
closes and returns focus to the anchor token.

### 9.2 Touch (B10)

Popovers scale for touch: **≥44 px** steppers and zone chips, 16 px inputs,
`inputmode` numeric/decimal keypads, max-width clamped to the viewport with
full-value fields — **audited at 390 px with no clipping and no horizontal
overflow**. Line chrome keeps ≥22 px targets (30 px under 640 px).

### 9.3 Keyboard (B4)

Every token and every ⠿/⋮/＋ mark is a **native tab stop in notation
order**; Enter/Space opens; inside an editor Tab cycles trapped fields;
every stepper value is type-to-edit with ± nudges. The 30–50-stop cost on a
dense workout is **accepted deliberately** — the operator chose
predictability over composite-widget semantics. Keyboard reorder rides the
⋮/⠿ menus' Move actions; drag stays pointer-only.

### 9.4 Screen reader

Every token is a **button** whose accessible name carries value + facet +
position ("5 min duration, step 1 of 2, block 2 of 4"). Menus and popovers
are labelled `menu`/`dialog` surfaces. Structure changes, kind switches,
and zone re-resolution announce through a **polite live region in human
words**. The strip is **`aria-hidden`** — the sentence is the workout's
accessible statement.

---

## 10. Server-side validation errors
*(from [#244](https://github.com/leskraas/trainm8/issues/244).)*

Under this editor most Zod refinements become unauthorable from the client;
the residual server-error classes are absences, client/server drift or
manipulated submissions, and future server-only rules.

1. **Two layers, token primary.** The offending token carries an error
   tint/underline in the notation's own language — **never a new chip**.
   Its normal popover leads with the message in human words (B5). Below the
   sentence, above the strip: **one quiet summary line** ("2 things need
   fixing") whose items retarget the non-modal popover (§9.1) to each
   anchor.
2. **Absent facets anchor on the step** — the smallest unit guaranteed to
   render; a token-less step carries the tint on its ⋮ mark. Repair routes
   through §6's neighbour popovers (missing intensity → quantity popover
   with "＋ intensity" highlighted; fully token-less → the ⋮ "Add…" row).
   No synthetic ghost tokens rendered just to be red.
3. **Block and session levels, same pattern:** block errors anchor in the
   gutter (⠿/repeat badge tint → ⠿ menu leads with the message); session
   errors anchor in the header (title in place; date/time via the metadata
   line's popover). **One combined summary list in document order** —
   never two error systems on one card. "At least one block/step" defers
   to §11.
4. **Lifecycle — edit-to-clear, per anchor.** On the 400, errors paint and
   focus moves to the first anchor with a live-region announcement. A
   marking clears locally the moment the value behind it changes; the
   summary count updates live. **No client-side re-run of server rules** —
   full truth returns on the next submit (which, under §1, is the next
   autosave post).
5. **The floor and the sheet.** Unmappable paths degrade honestly to
   anchor-less summary items — plain text, no focus move, never a crash or
   silent drop; the summary line is the guaranteed floor. The sheet mirrors
   its step's/block's errors inline but is never required.

---

## 11. The empty state — honest-empty with canonical seeds
*(from [#245](https://github.com/leskraas/trainm8/issues/245).)*

1. **Honest empty.** A new session fabricates nothing — nothing can be
   saved the athlete didn't choose. The implicit "45 min easy run" framing
   and the `sentenceStep()` 10-min anchor hack **both die**.
2. **A dedicated empty composition** — no stanza chrome anchored to nothing
   (the exact B11 failure), preview absent (§8.1). The first choice
   materializes the real stanza.
3. **Three fixed archetype seeds, discipline-sensitive**, lying in the open
   as tappable **ghost-notation lines** with quiet human names above —
   teaching the notation before the first tap:
   - *Easy session* — one block: `45 min @ easy`
   - *Intervals* — warm-up `15 min` · `4 × (4 min @ threshold · 2 min
     rest)` · cool-down `10 min`
   - *Strength session* — two steps in §5's sets notation
   Quantities fixed; discipline inherits from the header (the strength seed
   sets the header to strength). These are hardcoded seeds, not templates —
   they touch no data model and never list the athlete's own Workout
   Templates (Direction 3 stays out of scope).
4. **"or start from scratch ＋"** beneath the seeds opens §4.1's three-row
   kind chooser.
5. **A pure function of zero steps** — deleting everything brings the same
   composition back; no modes, no touched-state.
6. **Zero steps + save is allowed**; the server 400 lands as one summary
   line in human words ("Add at least one step to save this session") —
   §10's floor — with focus + live-region to it. Edit-to-clear when the
   first step materializes. No disabled save button.
7. Seeds are native tab stops / buttons per §9.

---

## 12. What dies

Deleted outright by this redesign (the A1–A7 half of the punch-list
dissolves with them):

- The **nested-fieldset form** (`__workout-step-fields.tsx` and the form
  half of `__workout-editor.tsx`) — the workout stated three times, the
  ~7,400 px edit page, raw ↑↓/Remove chrome, blank/"None" selects.
- The **standalone edit page** and the detail view's "Edit session" button
  and self-narrating helper prose (§1).
- The **intent-fallback bar** in the editor preview (§8.1).
- The **`sentenceStep()` seed hack** and the implicit new-session workout
  (§11).
- **Asterisk** unresolved markers, dotted-underline tokens, stepper-only
  popovers, double select chevrons, leaked internals (`zoneLabel`,
  "Recipe: daniels-pace-5") — replaced per §2 and §7.3.

---

## 13. Acceptance checklist — the craft punch-list, traced

Every B-item from the audit of the live app
([#241](https://github.com/leskraas/trainm8/issues/241),
[punch-list](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-6zn6qm/docs/wayfinder/workout-editor/241-craft-punch-list.md))
must be verifiably fixed; A1–A7 dissolve with §12.

| Item | Defect | Fixed by |
|------|--------|----------|
| B1 | Sentence chrome reads as typographic debris (bare `+ × →`) | §2.3 chrome spec; §2.1 gutter/badge |
| B2 | Wrapping orphans a step's `×` onto its own line | §2.2 unbreakable step units; §2.1 stanza |
| B3 | Dotted-underline tokens, unexplained trailing asterisks | §2.2 typography; §7.2 dashed chip |
| B4 | Unstyled, mis-anchored, stepper-only popovers | §2.4 popover spec; §9.3 type-to-edit |
| B5 | Leaked internals (`zoneLabel`, "Recipe: daniels-pace-5") | §2.5 copy rule; §7.3 provenance line |
| B6 | Double dropdown indicators on every select | §2.4 single chevron |
| B7 | Strip paints an empty workout as a solid green bar; seams; unexplained grey | §8.1 honesty rules; §8.2 geometry |
| B8 | Undesigned session header (leftover form top) | §2.6 header |
| B9 | Self-narrating detail view + duplicate edit entry points | §1 detail-view-is-editor |
| B10 | Mobile clips values inside controls | §9.2 touch audit at 390 px |
| B11 | Threefold contradictory empty state | §11 empty composition |

And the capability gaps from the fieldset audit
([#235](https://github.com/leskraas/trainm8/issues/235),
[audit](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-sp5rdn/docs/wayfinder/workout-editor/235-fieldset-capability-audit.md))
— the fieldsets may only be deleted because each is covered:

| Gap | Capability | Covered by |
|-----|-----------|------------|
| G1 | Reorder blocks | §3 ⠿ drag + Move rows |
| G2 | Block name add/edit/clear | §3 block menu (names never on the line) |
| G3 | Introduce a repeat | §3 block menu → §2.1 gutter badge |
| G4 | Move/remove any step uniformly | §3 step ⋮ on every step |
| G5 | Switch step kind; add strength/rest steps at all | §4 kind menu + ＋ kind chooser |
| G6 | Per-step discipline | §6.1 discipline select in quantity/sets popover |
| G7 | Add/remove intensity | §6.1 "＋ intensity" / footer remove |
| G8 | Step-quantity kind (duration ⇄ distance) | §6.1 segmented switch |
| G9 | Add notes | §6.1 "＋ note" links |
| G10 | Add rest-between-sets when absent | §5.2 popover footer slot |

---

## 14. Out of scope (from the map, unchanged)

- Direction 2 (sets-as-table), Direction 3 (start-from / duplicate /
  quick-add), Direction 5's two-pane live summary (its autosave half was
  adopted by §1), Directions 6–10.
- Free-text notation parser / grammar (ADR 0027 D1 non-goal).
- The known timezone concatenation bug (tracked separately).
- Localization / non-English notation (ADR 0023).
- Token Sentence on Session Ledger / Dashboard rows (deferred, A1).

## 15. Sources

Ticket resolutions (authoritative): [#235](https://github.com/leskraas/trainm8/issues/235) ·
[#236](https://github.com/leskraas/trainm8/issues/236) ·
[#237](https://github.com/leskraas/trainm8/issues/237) ·
[#238](https://github.com/leskraas/trainm8/issues/238) ·
[#239](https://github.com/leskraas/trainm8/issues/239) ·
[#240](https://github.com/leskraas/trainm8/issues/240) ·
[#241](https://github.com/leskraas/trainm8/issues/241) ·
[#242](https://github.com/leskraas/trainm8/issues/242) ·
[#243](https://github.com/leskraas/trainm8/issues/243) ·
[#244](https://github.com/leskraas/trainm8/issues/244) ·
[#245](https://github.com/leskraas/trainm8/issues/245) ·
[#246](https://github.com/leskraas/trainm8/issues/246) ·
[#247](https://github.com/leskraas/trainm8/issues/247).

Interactive prototypes (settled variants lead; superseded candidates kept
for the record):
[structural editing](https://github.com/leskraas/trainm8/blob/claude/wayfinder-236-round-3-0hqk8s/docs/wayfinder/workout-editor/236-structural-editing-prototype-r3-l1-always.html) ·
[step kind](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-wdhrtu/docs/wayfinder/workout-editor/237-step-kind-prototype.html) ·
[strength tokens](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-zwiccn/docs/wayfinder/workout-editor/238-strength-tokens-prototype.html) ·
[visual craft](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-mba2tl/docs/wayfinder/workout-editor/242-visual-craft-prototype.html) ·
[absent facets](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-i9z1nd/docs/wayfinder/workout-editor/243-absent-facet-prototype.html) ·
[mobile & a11y](https://github.com/leskraas/trainm8/blob/claude/wayfinder-234-norwegian-amtot9/docs/wayfinder/workout-editor/240-mobile-a11y-prototype.html).

Prior effort this corrects: PRD #220, ADR
`docs/adr/0027-text-first-workout-authoring.md`, PR #230.
