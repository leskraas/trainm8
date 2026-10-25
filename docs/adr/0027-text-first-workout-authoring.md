# Text-first workout authoring: the Token Sentence over the structured form

> **Amended by
> [ADR 0089](./0089-the-writing-line-reads-lifts-and-the-token-sentence-speaks-norwegian.md)
> (round 2, owner decisions 3 and 8):** the writing line's reader reads lifts
> (`Knebøy 5×5 @ 80 kg`) into the strength editor's structure, and the
> notation's glue words and zone labels are Norwegian on display — A3's English
> glue no longer holds; nothing stored changes.

> **Amended (#449), on A2 and A3.** A3's en-GB rule is right for glue words and
> wrong for names — _langtur_, _terskeløkt_, _bakkedrag_ and the I1–I5 ladder
> are content, not translations. A2's decision stands and its wording is
> corrected: "no race-pace **reference** on the athlete", not "no race-pace
> **model** exists". The missing `PerformanceResult` table has landed, so the
> race-authored direction ships and the `equivalent` slot stays reserved for the
> inverse. Both assumptions carry their amendment inline below. See
> [`docs/research/portable-intensity-anchors.md`](../research/portable-intensity-anchors.md).
>
> **Still open from the original Revisit:** the renderer needs recursion once
> `Block` nests. `Block` has not nested — #450 chose two named repeat levels
> over a recursive tree — so nothing is owed yet.
>
> **Amended (#451): three of #450's facets are now drawn, and three are not.**
> #450 landed the columns and left the sentence silent about them, on the
> reasoning that they should be drawn by the ticket that has rows to draw. The
> Catalogue seed is that ticket, so the sentence now renders (a) `verticalM` as
> a **Step Quantity** — without it a vertical repeat drew _no quantity at all_
> and read as unbounded; (b) every non-`time` **Rest Spec** form in its own
> words — `jog back`, `200 m recovery`, `until HR < 120 bpm` — where all four
> previously collapsed to the bare word `rest`; and (c) the block's
> **Send-Off**, `on CSS + 10 s`, which is the _whole_ of what a swim set says
> about recovery and drew nothing. Each reuses an existing token type, so the
> Score stanza component is untouched.
>
> **`gradePct`, cadence and the outer series repeat stay undrawn**, and for
> different reasons. Grade: the corpus cannot state it at all — every hill row
> in the research gives a _band_ (`6–10 %`, `4–7 %`, a controlled `3–6 %`
> descent) and the column is a scalar, so there is nothing to draw until grade
> gets a min/max pair the way cadence has. Cadence and the outer series both
> need a new token type or a second block-level token, which is a change to the
> stanza component and its own verifiable slice — where these three were
> corrections to text the component already renders.
>
> **Amended (#466): all three are drawn now.** Grade first got its band
> (`gradePctMin`/`gradePctMax`, ADR 0002's amendment) and the hill rows store
> it. The token model then grew three arms, each because no existing one could
> say it:
>
> - **`series`**, a second block-level token beside `repeat`, for the outer
>   **Series Repeat**. Both are present at once, so one arm could not say which
>   is which (#615 had folded the series into the repeat token's text, `3 × 13`,
>   which edited as the reps and read as one number). The sentence writes the
>   series around the reps, `3 × (13 × 30 s (15 s pause))`, and the rest between
>   series after them, `(10 min seriepause)`, as a block-level `rest` token. A
>   block repeated only in series draws the series and no `1 ×`. The stanza
>   badges the series in the gutter, stacked above the reps so the gutter keeps
>   its width, outlined where the reps are filled, and reads it aloud as
>   `3 serier`.
> - **`grade`** and **`cadence`**, the two **Step Parameters**, after the
>   intensity with a facet dot: `90 s @ 92–95% HRmax · 4–7 % motbakke`,
>   `2 min @ 65% FTP · 70 rpm`. A grade on one side of level ground names its
>   direction (`motbakke`, `utforbakke`, a descent read by its magnitude); a
>   band across level ground or a single bound is written signed, because a
>   direction there would be one nobody stated. Each token carries its figure
>   and its word apart, so the stanza weighs the figure and quiets the word
>   without parsing text.
>
> None of the three has a control on the editor's form yet — the draft carries
> none of them — so like `vertical` they are drawn for reading and bind to no
> popover.

Status: accepted · Feature issue: #219 · Slug: text-first-authoring

> **Amended (#505 S11): a reader now exists, for the writing line.** I dag's
> writing line takes a session typed as a sentence (`10 km rolig`,
> `3x10 min terskel p 1 min`) and `parseWorkoutSentence`
> (`app/utils/workout-sentence.ts`) reads it into the ADR 0007 structure. §1's
> _render, never parse_ survives in the form that mattered: the parser's only
> output is structure, checked by `WorkoutStructureSchema`; what the athlete
> sees is the Token Sentence rendered from that structure, never the typed text;
> and every character of the sentence is read by a rule or the sentence produces
> no structure at all — an unknown word, a stray character, a number with no
> unit, a clock that could be two durations, a lap time that could be a pace,
> `10.000`, a second repeat, two intensities or two sports, a dangling `p`, a
> number past any sane bound — with a suggestion instead of a guess. What is
> saved is exactly what was typed, or nothing is. The rejected alternative's
> cost, invalid intermediate states, is paid only inside the line: nothing
> invalid can be saved, and the server reads the sentence again rather than
> trusting the client. The grammar is small on purpose and its vocabulary
> (`rolig`, `terskel`, `langtur`) is content per A3. See ADR 0082's "As built
> (#505 S11)".

Structured authoring today is a long vertical form: ~540 lines of Block/Step
editor JSX duplicated across the create and edit routes, an intensity picker
whose state lives in ad-hoc `useState` serialized to a hidden JSON field outside
Conform, and cramped fixed-width set inputs. Reading a workout (the Workout
Detail View's structure lines) and editing it (the form) are entirely different
surfaces. We decided to make the athlete's own notation the primary authoring
surface: each Block/Step renders as one dense **Token Sentence** (e.g.
`2 km warm-up → 4 × 6 min @ 4:40/km · Z3 (170–178 bpm) (1 min rest) → cool-down`)
where every value is a tappable **Token** opening a small stepper/picker
popover. The sentence is always **rendered from** the Workout → Block → Step
structure — never parsed from free text — so it cannot be invalid.

## Decisions

1. **Render, never parse.** The **Workout Notation** is a deterministic pure
   rendering of `Workout → Block → Step` (the ADR 0007 discriminated union) into
   an ordered token model, implemented as a UI-free module (`workout-notation`)
   beside the existing pure display layer (`intensity-target`, ADR 0023's
   `format`). Editing mutates structure, and the sentence re-renders. A future
   free-text parser could target the same token model, but no grammar or parser
   ships now.
   - _Alternative rejected:_ free-text input with live parsing (TrainingPeaks /
     intervals.icu style). Parsing invites invalid intermediate states and an
     error-correction UX; rendering from structure is invalid-by- construction
     and keeps the ADR 0007 union the single source of truth.

2. **Conform stays the state backbone.** Tokens are controlled inputs bound to
   the existing Conform field tree (`FormSchema` → `buildBlocksInput` →
   `WorkoutAuthoringSchema`) via `useInputControl`; insert/remove/reorder use
   Conform's field-list intents already in use. This dissolves the known pain
   point of intensity state living outside Conform: the intensity token popover
   writes the `IntensityTarget` JSON through `useInputControl` instead of a
   parallel `useState` mirror. Submission path, server validation, and
   `updateWorkoutSession`'s replace-the-subtree mutation (ADR 0003) are
   unchanged. **No schema migration.**
   - _Alternative rejected:_ a client-side reducer holding a draft
     `WorkoutAuthoringInput` serialized to one hidden JSON field. Cleaner
     in-memory model, but it forfeits Conform's per-field server error mapping
     and diverges from every other form in the repo.

3. **One shared structure editor, extracted.** The duplicated Block/Step editor
   JSX in the create and edit routes is replaced by one shared Token Sentence
   editor component (route-scoped shared module, like
   `__workout-step-fields.tsx` today). The create/edit routes keep only their
   loader/action framing.

4. **The read view and the edit view are the same rendering.** The Workout
   Detail View's structure card renders the same Token Sentence (read-only
   tokens) for the prescription. For a _scheduled_ session the tokens are live
   and edits save through the existing update path; completed / missed / skipped
   sessions render the sentence inert — recorded history is immutable (same
   principle as Recording immutability, ADR 0012).

5. **The live diagram is the Workout Shape, not a new concept.** GLOSSARY.md
   already defines the **Workout Shape** (and explicitly avoids the word
   "timeline"). The in-editor segment chart reuses the just-landed prescription
   diagram pieces — `expandWorkoutSteps` / `deriveSessionProfile`
   (`session-profile`) and the shared `ProfileBars` component — fed from the
   _draft_ form state instead of a persisted workout, and extended (additive
   props, no fork) with bracketed repeat-group annotation. One diagram
   everywhere: editor preview, detail card, ledger cells.
   - _Alternative rejected:_ a new bespoke editor chart. Two diagrams would
     drift, and eaa7966 just made the shape part of the prescription surface.

6. **Simple mode folds into the sentence.** A "simple" session is exactly a
   one-step sentence (`45 min easy run`), so the simple/structured toggle
   disappears from the UI; the form always submits structured blocks (the schema
   keeps accepting `simple` for compatibility). This preserves #176's humane
   default — the empty state is a single-token line, not a wall of fieldsets.

7. **Derived facets are display-only and honest.** Editing a pace token
   re-renders the zone chip and bpm facet through the existing resolver
   (`resolveIntensity` / `describeStepTarget`) against the athlete's Discipline
   Profile. Facets that cannot be truthfully resolved (missing threshold) are
   simply omitted or shown as the captioned Training Zone — never fabricated
   (the Unavailable Metric principle). Resolved numeric ranges are still baked
   server-side on save, as today.

8. **Exercise picking becomes a searchable combobox.** The flat `Select` over
   the exercise catalog is replaced by a shadcn `command`-in-`popover` combobox:
   type-ahead, filter chips for primary muscle and equipment, a "Recent" group
   derived from the athlete's recent strength steps (a query, not stored state),
   and an inline create-custom row replacing the separate toggle form. New
   shadcn components follow the icon-workflow skill (Tabler sprite icons, no
   `lucide-react` imports left behind).

## Assumptions (headless grill — no operator available)

- **A1 — Read surfaces in v1:** the Token Sentence ships on the create route,
  the edit route, and the Workout Detail View. The Dashboard week timeline and
  Session Ledger keep their current compact rendering (they already show the
  Workout Shape); extending the sentence there is a follow-up.
- **A2 — Race-pace equivalent token (`= HM-fart`) is reserved, not shipped.**
  _Amended (#449)._ The original wording said "no truthful race-pace **model**
  exists", which reads as a claim about the science and would be wrong: Riegel
  (1981), the Daniels–Gilbert curves and the Critical Speed model are three
  independently derived equivalence models that agree within 32 s on a 3:11
  marathon. A2's own parenthetical scoped it correctly, and it should read "no
  race-pace **reference** exists on the athlete". The reference now exists: a
  **`PerformanceResult`** table, and a `racePace` **Intensity Target** that
  resolves against it (ADR 0007, #449).
  - **The race-_authored_ direction ships.** `@ 105 % MP` renders its portable
    name as the token text with the resolved pace as its `≈` facet, which needs
    no `equivalent` slot at all, and degrades to the bare authored form when no
    result is on record — exactly what `powerPct` does without an FTP.
  - **The slot stays reserved for the _inverse_** — a metric-authored pace
    annotated with the race it is equivalent to. That direction needs the **Race
    Equivalence** conversion ladder and its distance-ratio confidence rule, and
    annotating a pace with a race name the app cannot convert to would be
    exactly the fabrication A2 declined. So: same slot, same `null`, correct
    reason.
- **A3 — Notation language is English** (`warm-up`, `rest`), matching the ADR
  0023 house format (en-GB), even though the operator's example is Norwegian.
  Localization is out of scope. _Amended (#449): the rule governs the notation's
  **glue words** and not its **names**._ A session's name is **content, not
  chrome**. _Langtur_, _terskeløkt_, _dobbel terskel_, _bakkedrag_,
  _stigningsløp_ and _rolig_ are the terms this app's Norwegian users train and
  search in, and they are **not translations** of the English — _bakkedrag_ and
  "hill reps" carry different default assumptions about length, and the spoken
  I1–I5 ladder is already shipped as `olt-hr-5-run` / `olt-hr-5-bike`. A
  **Catalogue** entry may therefore carry a Norwegian name beside an English one
  without localising `warm-up` / `rest`, and a translated name is a worse name,
  not a more consistent one. The same rule reaches the `norwegian-threshold-run`
  recipe's `sub-T` band, whose whole point is the distinction the English word
  "threshold" flattens.
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
  `equivalent` facet activates — where does that reference live? (Out of scope
  here; noted for a future ADR.)
- The known timezone bug (date+time concatenated as UTC in both authoring
  actions) is **not** fixed by this feature; the extraction keeps behavior
  identical and the bug tracked separately.
