# Capability audit — fieldset editor vs. Token Sentence editor

_Wayfinder research asset for [#235](https://github.com/leskraas/trainm8/issues/235), under the map "Correct the workout editor" ([#234](https://github.com/leskraas/trainm8/issues/234))._

## Purpose

Inventory every capability the classic nested-fieldset editor provides today, and
record whether the current Token Sentence editor offers an equivalent affordance.
The output is the **gap list** — the capabilities that must be designed into the
sentence before the fieldset form can be safely deleted. This is the seam the
affordance-design tickets ([#236](https://github.com/leskraas/trainm8/issues/236),
[#237](https://github.com/leskraas/trainm8/issues/237),
[#238](https://github.com/leskraas/trainm8/issues/238)) build on.

## Sources read

- `app/routes/training/__workout-editor.tsx` — the shared structure editor: block
  add/remove/reorder, step add/remove/reorder, block name, repeat count, step-kind
  switch, and the field-group host.
- `app/routes/training/__workout-step-fields.tsx` — the per-kind field groups
  (cardio, strength, rest).
- `app/routes/training/__token-sentence-editor.tsx` — the editable Token Sentence
  and every token popover / structure affordance it offers.
- `app/utils/workout-notation.ts` — the pure structure→token model: which tokens
  render, and **under what conditions** (the crux of the "absent token" gaps).
- `docs/adr/0027-text-first-workout-authoring.md`, `CONTEXT.md` — domain and prior
  intent.

## How to read this

The fieldset shows **every field of a step, always** (an empty field is still a
visible, editable input). The sentence, by design, **renders a token only when the
underlying value exists** — an empty value produces no token, so there is nothing
to tap. That single structural difference is the root of most gaps below: parity of
*editing* an existing value is largely met; parity of *introducing* an absent value
is where the sentence falls short.

## Capability-by-capability

Legend: ✅ full parity · ⚠️ partial (edit yes, but a case is unreachable) · ❌ gap.

### Structure — blocks

| Capability | Fieldset | Token Sentence | Verdict |
|---|---|---|---|
| Add block | `+ Add Block` (`__workout-editor.tsx:341`) | `+ block` button (`__token-sentence-editor.tsx:480`) | ✅ |
| Remove block (when >1) | `Remove block` (`:189`) | `×` per block (`:461`) | ✅ |
| **Reorder blocks** | ↑/↓ buttons (`:159`) | — none — | ❌ **G1** |
| Block name (add/edit/clear) | text `Field` (`:207`) | `label` token is rendered but **inert** (no `renderToken` branch for `type:'label'`), and an unnamed block renders **no** label token at all (`workout-notation.ts:708`) | ❌ **G2** |
| **Repeat count** | number `Field`, always present (`:218`) | `repeat` token renders **only when `repeatCount > 1`** (`workout-notation.ts:699`); a default 1× block has no token, so a repeat can be *edited* but never *introduced* | ⚠️→❌ **G3** |

### Structure — steps

| Capability | Fieldset | Token Sentence | Verdict |
|---|---|---|---|
| Add step | `+ Add Step` per block (`__workout-editor.tsx:321`) | `+` per block (`__token-sentence-editor.tsx:446`) — but always inserts a **cardio** `sentenceStep()` (`:208`) | ⚠️ (kind fixed — see G5) |
| Remove step (when >1) | `Remove` (`:301`) | in `TokenEditorPopover` `stepActions.onRemove` (`:412`) | ⚠️ **G4** |
| Reorder steps | ↑/↓ (`:270`) | `stepActions.onMove*` (`:404`) | ⚠️ **G4** |
| **Step-kind switch (cardio ↔ strength ↔ rest)** | `SelectField` on `kind` (`:244`) | no `kind` token exists in the model; `editorKindFor` returns `null` for anything but quantity/repeat/rest/notes (`__token-sentence-editor.tsx:96`) | ❌ **G5** |

**G4 detail — move/remove is not uniformly reachable.** Step move/remove actions
hang off `TokenEditorPopover` only (quantity / duration / rest / notes tokens). The
intensity, exercise, and sets popovers carry **no** `stepActions`
(`__token-sentence-editor.tsx:319`, `:345`, `:362`). Consequences:

- A **strength step with no rest-between-sets and no notes** has only `exercise` +
  `sets` tokens — **neither** carries step actions, so it cannot be reordered or
  removed from the sentence at all.
- A **cardio step with only an intensity token** (no duration/distance/notes) has
  the same problem. (New cardio steps are seeded with `10 min`, so this is an edge
  case, but it is reachable if the quantity is the only thing edited away.)

### Step fields — cardio

| Capability | Fieldset | Token Sentence | Verdict |
|---|---|---|---|
| **Discipline (per-step override / inherit)** | `SelectField` inherit + run/swim/bike (`__workout-step-fields.tsx:93`) | discipline feeds facet resolution (`workout-notation.ts:378`) but has **no token** and no popover | ❌ **G6** |
| **Intensity Target (add)** | `IntensityEditor`, always shown (`:109`) | intensity token renders **only when `step.intensity` exists or a draft was typed** (`workout-notation.ts:651`); a cardio step with no intensity has no token to tap to add one | ❌ **G7** |
| Intensity Target (edit existing) | same | `IntensityTokenPopover` → shared `IntensityEditor` (`__token-sentence-editor.tsx:319`) | ✅ |
| Duration (edit) | text `Field` (`:117`) | quantity stepper (`:379`, STEPPERS `duration`) | ✅ |
| Distance (edit) | text `Field` (`:125`) | quantity stepper (STEPPERS `distance`) | ✅ |
| **Step Quantity kind (duration ↔ distance, or add the absent one)** | both inputs shown side by side, so either can be filled/cleared (`:116`) | the quantity token addresses whichever field is set (`workout-notation.ts:634` — duration else distance); the stepper is min-clamped and cannot clear to empty, so you can never switch a duration step to distance (or add a distance) from the sentence | ❌ **G8** |
| Notes (add) | `TextareaField`, always shown (`:135`) | notes token renders **only when `notes.trim()`** (`workout-notation.ts:678`); a step with no notes has no marker to tap | ❌ **G9** |
| Notes (edit existing) | same | notes `TokenEditorPopover` textarea (`:379`, `:1042`) | ✅ |

### Step fields — strength

| Capability | Fieldset | Token Sentence | Verdict |
|---|---|---|---|
| Exercise pick | (moved to sentence, ADR 0027 slice 9/9) | `ExerciseTokenControl` combobox (`__token-sentence-editor.tsx:345`) | ✅ |
| Sets: add/duplicate/remove/reorder, kind, reps/secs, load (kg xor %1RM) | (moved to sentence) | `SetsTokenPopover` (`:362`, `:621`) | ✅ |
| **Rest-between-sets (add)** | number input, always shown (`__workout-step-fields.tsx:182`) | rest token renders **only when `restBetweenSetsSec != null`** (`workout-notation.ts:622`); a strength step without it has no token to add one | ❌ **G10** |
| Rest-between-sets (edit existing) | same | `restSeconds` stepper (`:103`, `:172`) | ✅ |
| Notes (add) on a strength step | `TextareaField`, always shown (`:198`) | same as G9 — no marker when notes empty | ❌ **G9** (strength case) |

> The `StrengthStepFields` comment (`__workout-step-fields.tsx:148`) already admits
> the fieldset survives *specifically* so rest-between-sets and notes "stay addable
> when a fresh step has neither." That is G10 + G9 stated in the code itself — the
> fieldset is currently the only way to introduce them.

### Step fields — rest

| Capability | Fieldset | Token Sentence | Verdict |
|---|---|---|---|
| Add a rest **step** | via step-kind switch (`__workout-editor.tsx:244`) | blocked by G5 (`+` only inserts cardio) | ❌ (subsumed by G5) |
| Duration (edit) | text `Field` (`:214`) | rest token stepper (`:96`, `rest`) | ✅ |
| Notes (add / edit) | `TextareaField` (`:222`) | add = G9; edit ✅ | ⚠️ (G9) |

## Gap list — what must be designed before the fieldsets can be deleted

Grouped by the shared root cause, with the owning design ticket.

**A. Structural editing the sentence lacks entirely** → owned by
[#236](https://github.com/leskraas/trainm8/issues/236):

- **G1 — Reorder blocks.** No affordance at all.
- **G2 — Block name.** Add, edit, and clear a block name (the `label` token is
  currently inert, and absent for unnamed blocks).
- **G3 — Introduce a repeat.** Turn a 1× block into N× (the repeat token doesn't
  render until `repeatCount > 1`).
- **G4 — Uniform step move/remove.** Every step must be reorderable/removable
  regardless of which token types it happens to show (strength and intensity-only
  steps are currently stuck).

**B. Step-kind** → owned by
[#237](https://github.com/leskraas/trainm8/issues/237):

- **G5 — Switch a step's kind** (cardio ↔ strength ↔ rest) and, by extension, add
  strength and rest steps at all (the sentence's `+` only inserts cardio steps).

**C. Strength facets** → owned by
[#238](https://github.com/leskraas/trainm8/issues/238):

- **G10 — Add rest-between-sets** to a strength step that has none.
- (G9 strength-notes case — see D; G9 is cross-cutting.)

**D. "Absent facet" family — introduce a value the sentence renders no token for.**
Not owned by any existing ticket; **graduated as a new ticket this session.** Shared
root cause: a token only renders when its value exists, so there is no anchor to tap
to add the first value.

- **G6 — Per-step discipline** (override / inherit).
- **G7 — Add (and remove) an Intensity Target** on a cardio step.
- **G8 — Step Quantity kind** — switch duration ↔ distance, or add the absent one.
- **G9 — Add notes** to any step that has none (cardio / strength / rest).

## Coverage summary

- **Met (edit-existing parity):** duration, distance, rest, notes-edit,
  intensity-edit, exercise, full set editing, add block, remove block, add step.
- **Gaps (G1–G10):** block reorder, block name, introduce repeat, uniform
  step move/remove, step-kind switch, per-step discipline, add/remove intensity,
  step-quantity kind switch, add notes, add rest-between-sets.

The recurring theme across G2, G3, G7, G8, G9, G10 is one design problem: **how do
you introduce a value the sentence isn't yet rendering a token for?** Whatever the
answer (a persistent "add" affordance per step, always-present placeholder tokens, a
step-scoped action menu, …), it should be decided once and applied consistently, or
the corrected editor will feel as piecemeal as the current one — which is exactly the
craft failure the map exists to correct.
