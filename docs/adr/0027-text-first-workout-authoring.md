# Text-first workout authoring: the Token Sentence over the structured form

Status: accepted · Feature issue: #219 · Slug: text-first-authoring

Structured authoring today is a long vertical form: ~540 lines of Block/Step
editor JSX duplicated across the create and edit routes, an intensity picker
whose state lives in ad-hoc `useState` serialized to a hidden JSON field
outside Conform, and cramped fixed-width set inputs. Reading a workout (the
Workout Detail View's structure lines) and editing it (the form) are entirely
different surfaces. We decided to make the athlete's own notation the primary
authoring surface: each Block/Step renders as one dense **Token Sentence**
(e.g. `2 km warm-up → 4 × 6 min @ 4:40/km · Z3 (170–178 bpm) (1 min rest) →
cool-down`) where every value is a tappable **Token** opening a small
stepper/picker popover. The sentence is always **rendered from** the Workout →
Block → Step structure — never parsed from free text — so it cannot be
invalid.

## Decisions

1. **Render, never parse.** The **Workout Notation** is a deterministic pure
   rendering of `Workout → Block → Step` (the ADR 0007 discriminated union)
   into an ordered token model, implemented as a UI-free module
   (`workout-notation`) beside the existing pure display layer
   (`intensity-target`, ADR 0023's `format`). Editing mutates structure, and
   the sentence re-renders. A future free-text parser could target the same
   token model, but no grammar or parser ships now.
   - _Alternative rejected:_ free-text input with live parsing (TrainingPeaks
     / intervals.icu style). Parsing invites invalid intermediate states and
     an error-correction UX; rendering from structure is invalid-by-
     construction and keeps the ADR 0007 union the single source of truth.

2. **Conform stays the state backbone.** Tokens are controlled inputs bound to
   the existing Conform field tree (`FormSchema` → `buildBlocksInput` →
   `WorkoutAuthoringSchema`) via `useInputControl`; insert/remove/reorder use
   Conform's field-list intents already in use. This dissolves the known pain
   point of intensity state living outside Conform: the intensity token
   popover writes the `IntensityTarget` JSON through `useInputControl` instead
   of a parallel `useState` mirror. Submission path, server validation, and
   `updateWorkoutSession`'s replace-the-subtree mutation (ADR 0003) are
   unchanged. **No schema migration.**
   - _Alternative rejected:_ a client-side reducer holding a draft
     `WorkoutAuthoringInput` serialized to one hidden JSON field. Cleaner
     in-memory model, but it forfeits Conform's per-field server error
     mapping and diverges from every other form in the repo.

3. **One shared structure editor, extracted.** The duplicated Block/Step
   editor JSX in the create and edit routes is replaced by one shared Token
   Sentence editor component (route-scoped shared module, like
   `__workout-step-fields.tsx` today). The create/edit routes keep only their
   loader/action framing.

4. **The read view and the edit view are the same rendering.** The Workout
   Detail View's structure card renders the same Token Sentence (read-only
   tokens) for the prescription. For a *scheduled* session the tokens are live
   and edits save through the existing update path; completed / missed /
   skipped sessions render the sentence inert — recorded history is immutable
   (same principle as Recording immutability, ADR 0012).

5. **The live diagram is the Workout Shape, not a new concept.** CONTEXT.md
   already defines the **Workout Shape** (and explicitly avoids the word
   "timeline"). The in-editor segment chart reuses the just-landed
   prescription diagram pieces — `expandWorkoutSteps` / `deriveSessionProfile`
   (`session-profile`) and the shared `ProfileBars` component — fed from the
   *draft* form state instead of a persisted workout, and extended (additive
   props, no fork) with bracketed repeat-group annotation. One diagram
   everywhere: editor preview, detail card, ledger cells.
   - _Alternative rejected:_ a new bespoke editor chart. Two diagrams would
     drift, and eaa7966 just made the shape part of the prescription surface.

6. **Simple mode folds into the sentence.** A "simple" session is exactly a
   one-step sentence (`45 min easy run`), so the simple/structured toggle
   disappears from the UI; the form always submits structured blocks (the
   schema keeps accepting `simple` for compatibility). This preserves #176's
   humane default — the empty state is a single-token line, not a wall of
   fieldsets.

7. **Derived facets are display-only and honest.** Editing a pace token
   re-renders the zone chip and bpm facet through the existing resolver
   (`resolveIntensity` / `describeStepTarget`) against the athlete's
   Discipline Profile. Facets that cannot be truthfully resolved (missing
   threshold) are simply omitted or shown as the captioned Training Zone —
   never fabricated (the Unavailable Metric principle). Resolved numeric
   ranges are still baked server-side on save, as today.

8. **Exercise picking becomes a searchable combobox.** The flat `Select` over
   the exercise catalog is replaced by a shadcn `command`-in-`popover`
   combobox: type-ahead, filter chips for primary muscle and equipment, a
   "Recent" group derived from the athlete's recent strength steps (a query,
   not stored state), and an inline create-custom row replacing the separate
   toggle form. New shadcn components follow the icon-workflow skill (Tabler
   sprite icons, no `lucide-react` imports left behind).

## Assumptions (headless grill — no operator available)

- **A1 — Read surfaces in v1:** the Token Sentence ships on the create route,
  the edit route, and the Workout Detail View. The Dashboard week timeline and
  Session Ledger keep their current compact rendering (they already show the
  Workout Shape); extending the sentence there is a follow-up.
- **A2 — Race-pace equivalent token (`= HM-fart`) is reserved, not shipped.**
  No truthful race-pace model exists (no race-pace reference on the athlete;
  Daniels M/T are the closest anchors). Fabricating "HM pace" from threshold
  pace would violate the honesty principle, so the notation reserves an
  `equivalent` facet slot in the token model and v1 omits it.
- **A3 — Notation language is English** (`warm-up`, `rest`), matching the
  ADR 0023 house format (en-GB), even though the operator's example is
  Norwegian. Localization is out of scope.
- **A4 — Inline edit on the detail view posts to the existing edit action**
  (fetcher to the edit route's action, or the action re-exported), not a new
  mutation path.
- **A5 — Zone mapping in the live Workout Shape stays `stepToZone`-based**
  (unresolved kinds render as honest null-zone bars), identical to the read
  view; threading athlete thresholds into zone derivation is a possible
  follow-up, not part of this feature.

## Open questions

- Should the Session Ledger / week timeline rows eventually show a truncated
  Token Sentence instead of the title-plus-target line? (Deferred, A1.)
- When a race-pace reference lands on the Athlete Profile, the reserved
  `equivalent` facet activates — where does that reference live? (Out of
  scope here; noted for a future ADR.)
- The known timezone bug (date+time concatenated as UTC in both authoring
  actions) is **not** fixed by this feature; the extraction keeps behavior
  identical and the bug tracked separately.
