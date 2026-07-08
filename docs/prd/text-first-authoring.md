# PRD: Text-first workout authoring (Token Sentence)

Slug: text-first-authoring
Feature issue: #219
Design record: ADR 0027 (`docs/adr/0027-text-first-workout-authoring.md`)

## Problem Statement

Authoring a structured workout today means fighting a long vertical form: every
step is a stack of dropdowns and inputs, an interval session becomes screens of
fieldsets, the intensity picker is a two-level select maze, and strength sets
are cramped fixed-width boxes. Reading a workout (the Workout Detail View's
structure lines) and editing it (the form) are unrelated surfaces, so the
athlete constantly translates between "what the plan says" and "which form
field that was". Self-coaching athletes already think and write in a dense
training notation (`2 km warm-up → 4 × 6 min @ 4:40/km · Z3 → cool-down`); the
app should speak it.

## Solution

Each Block/Step of a workout renders as one dense **Token Sentence** in the
app's **Workout Notation**. Every value — distance, repeat count, duration,
pace, zone, rest — is a tappable **Token** that opens a small stepper/picker
popover. The sentence is *rendered from* the Workout → Block → Step structure,
never parsed from free text, so it cannot be invalid. Editing a pace token
instantly re-resolves the zone and heart-rate facets from the athlete's
Discipline Profile. Beneath the editor, the **Workout Shape** renders live from
the draft — width tracks Step Duration, color/height tracks training zone,
repeat blocks read as bracketed groups. The same sentence is the read view on
the Workout Detail View, editable in place for scheduled sessions. Strength
steps get a searchable exercise combobox with muscle/equipment filter chips, a
Recent group, and inline custom-exercise creation.

## User Stories

1. As a Self-Coaching Athlete, I want my workout to read as one dense notation
   line, so that I can grasp the whole session at a glance instead of scrolling
   fieldsets.
2. As a Self-Coaching Athlete, I want to tap the duration token and adjust it
   with a stepper, so that editing one value doesn't mean hunting for a form
   field.
3. As a Self-Coaching Athlete, I want to tap the pace token and pick a pace,
   so that I can prescribe intensity in the metric I think in.
4. As a Self-Coaching Athlete, I want the zone and bpm facets to update the
   moment I change the pace, so that I see what the prescription means for my
   body without doing zone math.
5. As a Self-Coaching Athlete, I want the repeat count (`4 ×`) to be a token,
   so that turning 4 reps into 6 is one tap.
6. As a Self-Coaching Athlete, I want rest between reps to read inline as
   `(1 min rest)`, so that recovery is part of the sentence, not a separate
   step form.
7. As a Self-Coaching Athlete, I want to add a step or block from the end of
   the sentence, so that building a session flows left-to-right like writing.
8. As a Self-Coaching Athlete, I want to remove or reorder steps from the
   sentence, so that restructuring doesn't require re-entering values.
9. As a Self-Coaching Athlete, I want a new session to start as a single
   simple line (duration/distance + intensity), so that an easy run stays a
   five-second task.
10. As a Self-Coaching Athlete, I want the Workout Detail View to show the
    prescription in the same notation, so that reading and editing are the same
    mental model.
11. As a Self-Coaching Athlete, I want to edit a scheduled session's tokens
    directly on the detail view, so that a quick tweak doesn't need a separate
    edit page round-trip.
12. As a Self-Coaching Athlete, I want completed and missed sessions to render
    the sentence read-only, so that my training history stays immutable and
    trustworthy.
13. As a Self-Coaching Athlete, I want a live Workout Shape under the editor,
    so that I see the session's structure and intensity distribution take form
    as I type.
14. As a Self-Coaching Athlete, I want repeat blocks bracketed in the Workout
    Shape, so that interval structure is visible in the diagram, not just the
    text.
15. As a Self-Coaching Athlete, I want the editor's Workout Shape to be the
    same diagram I see on the detail view and ledger, so that the plan looks
    identical everywhere.
16. As a Self-Coaching Athlete, I want intensity facets that can't be resolved
    (missing threshold) to be omitted or shown as the zone label, so that the
    app never shows me an invented number.
17. As a Self-Coaching Athlete, I want to search exercises by typing, so that
    picking "Bulgarian split squat" doesn't mean scrolling a flat list.
18. As a Self-Coaching Athlete, I want to filter exercises by primary muscle
    and equipment, so that I can browse what fits today's gym.
19. As a Self-Coaching Athlete, I want my recently used exercises grouped at
    the top, so that my staple lifts are one tap away.
20. As a Self-Coaching Athlete, I want to create a custom exercise inline from
    the search box when nothing matches, so that an unknown movement doesn't
    break my flow.
21. As a Self-Coaching Athlete, I want strength steps to read as compact set
    notation (`Squat 5 × 5 @ 80 kg`), so that gym sessions get the same dense
    readability as intervals.
22. As a Self-Coaching Athlete, I want token popovers to work with keyboard and
    touch, so that authoring works on my phone at the track and my laptop at
    home.
23. As a Self-Coaching Athlete, I want validation to be impossible to trip over
    in the sentence (pickers only produce valid values), so that I never see a
    red form error for a value the UI itself offered me.

## Implementation Decisions

All recorded with alternatives in ADR 0027; the load-bearing ones:

- **Render, never parse.** A UI-free `workout-notation` module maps the
  Workout → Block → Step structure (the ADR 0007 discriminated union) to an
  ordered token model; the sentence component renders that model. The token
  model is designed so a future free-text parser could target it, but no
  grammar or parser ships in this feature.
- **Conform remains the form-state backbone.** Tokens are controlled inputs
  bound to the existing field tree via `useInputControl`; add/remove/reorder
  use Conform's field-list intents. The existing submission path — form schema
  → block-input mapper → authoring schema → create/update mutation — is
  unchanged. **No schema migration.**
- **The intensity popover moves intensity state inside Conform**, replacing
  the current ad-hoc `useState`-mirrored-to-hidden-JSON pattern. It writes the
  `IntensityTarget` discriminated-union JSON as the field value; derived
  facets (zone chip, resolved bpm/pace range) are computed per keystroke
  through the existing pure resolver (`describeStepTarget` /
  `resolveIntensity`) against the athlete's Discipline Profile and are
  display-only. Resolved ranges are still baked server-side on save.
- **One shared Token Sentence editor component** replaces the ~540 duplicated
  editor lines in the create and edit routes; the routes keep only
  loader/action framing. Behavior of the actions is unchanged (including the
  known, separately-tracked timezone concatenation bug — do not fix it here,
  do not regress it).
- **Read = write surface.** The Workout Detail View's structure card renders
  the same sentence. Scheduled sessions: tokens live, saving through the
  existing edit action (fetcher). Completed/missed/skipped sessions: inert
  sentence (history is immutable). Editing a Generated Session through tokens
  adopts it (`authored`), exactly as the current edit form does.
- **The live diagram is the existing Workout Shape, extended — not a new
  component.** Reuse `expandWorkoutSteps` / `deriveSessionProfile` and the
  shared `ProfileBars` component (just made part of the prescription surface
  by the "Workout Shape with the prescription" change), fed from draft form
  state mapped to a draft workout structure. Extend additively with repeat-
  group bracket annotation so grouping renders in editor, detail, and ledger
  alike. Zone derivation stays the current honest mapping (unresolvable kinds
  render null-zone bars).
- **Simple mode folds into the sentence**: the default new-session state is a
  one-step sentence; the simple/structured UI toggle disappears while the
  schema keeps accepting the simple shape for compatibility.
- **Exercise combobox** is a shadcn `command` inside a `popover` (net-new UI
  components, added per the icon-workflow skill: Tabler sprite icons, no
  stray `lucide-react`/`@tabler/icons-react` imports). Type-ahead over the
  exercise catalog, filter chips for primary muscle and equipment, a "Recent"
  group derived at load time from the athlete's recent strength steps (a
  query, no new stored state), and an inline "Create '<query>'…" row that
  posts to the existing custom-exercise action and selects the result.
- **Reserved, not shipped:** the race-pace equivalent facet (`= HM pace`).
  No truthful race-pace model exists; the token model reserves the slot
  (ADR 0027 A2).
- **Notation language is English**, per the fixed en-GB house format
  (ADR 0023).

## Requirements

Sized for parallel implementation issues; R1 is the seam most others build on.

- **R1 — Workout Notation module.** A pure, UI-free module that maps a
  Workout → Block → Step structure (both persisted rows and draft form values)
  to an ordered token model: per step a sequence of typed tokens (quantity,
  intensity with derived facets, rest, exercise/sets summary, notes marker),
  per block a repeat-group wrapper, with the separators (`→`, `×`, `@`, `·`)
  defined by the model, not by components. Derived intensity facets come from
  the existing resolver and are omitted when unresolvable. Exhaustively
  unit-tested (round-trip: structure → tokens → expected sentence strings).
- **R2 — Token Sentence component (read-only rendering).** Renders R1's token
  model as the dense sentence; used read-only on the Workout Detail View's
  structure card for completed/missed/skipped sessions (replacing the current
  per-step structure lines). Accessible: tokens are real elements with labels,
  sentence reads sensibly to screen readers.
- **R3 — Token editing.** In editable mode each token opens a popover
  stepper/picker bound to the Conform field tree via `useInputControl`:
  duration/distance (humane strings through the shared format layer), repeat
  count, rest, notes, step add/remove/reorder and block add/remove via
  Conform intents from sentence affordances. Pickers only produce valid
  values; server-side Zod validation is unchanged as the safety net.
- **R4 — Intensity token popover.** Replaces the current intensity picker UI
  and its out-of-Conform state: kind picker + per-kind inputs writing the
  IntensityTarget JSON through `useInputControl`; live derived facets (zone
  chip, resolved range) rendered from the resolver; honest degradation when
  thresholds are missing.
- **R5 — Shared editor extraction.** Both the create route and the edit route
  render the one shared Token Sentence editor; the duplicated block/step JSX
  is deleted; the simple/structured toggle is removed in favor of the
  one-step default sentence; loaders/actions keep identical behavior.
- **R6 — Live Workout Shape in the editor.** The editor renders the Workout
  Shape from draft form state via the existing expansion/derivation, updating
  live with token edits; `ProfileBars` is extended additively with repeat-
  group brackets used by editor, detail, and ledger renderings.
- **R7 — Inline edit on the Workout Detail View.** For scheduled sessions the
  detail view's sentence is editable in place, saving through the existing
  edit action; non-scheduled sessions stay read-only; Generated Session
  adoption semantics preserved.
- **R8 — Exercise combobox.** The strength step's exercise picker becomes the
  searchable combobox described above (type-ahead, muscle/equipment chips,
  Recent group, inline create), replacing the flat Select and the separate
  create-toggle form; loader supplies recent-exercise IDs.
- **R9 — Strength step tokens.** Strength steps render in the sentence as
  exercise + compact set notation with rest facet; tapping the sets token
  opens a popover editing the set list (kind, reps/secs, kg, %1RM) bound to
  Conform, replacing the cramped fixed-width row inputs.

## Testing Decisions

- Test external behavior only: the sentence text produced for a given
  structure, the structure submitted for a given sequence of token edits, what
  the athlete sees — never internal component state.
- **R1 is the main test seam** (highest, pure, no DOM): exhaustive unit tests
  over notation rendering, mirroring the style of the existing pure-module
  tests for the display layer (`intensity-target.test.ts`,
  `workout-authoring.test.ts`, `session-profile.test.ts`).
- Route-level tests for create/edit/detail follow the existing route-test
  pattern (`sessions.$sessionId.route.test.tsx`): render, interact with
  tokens, assert the submitted form data / rendered prescription. One
  regression test pins that a legacy plain-string zone label still renders.
- Combobox behavior (filter, recent group, inline create) tested at the
  component/route level with the existing testing-library setup.
- Merge bar: `npm run test` green, `npm run typecheck` clean, lint and build
  green, `/review` Spec axis clean.

## Out of Scope

- Free-text notation input or any parser/grammar (the token model is merely
  parser-targetable).
- Week-as-document grid editor; templates/duplication; coach-chat, sketch,
  deck, dose, or gym-floor authoring modes.
- Schema or data migrations of any kind.
- The race-pace equivalent facet (reserved slot only — no truthful model).
- Fixing the known timezone bug in the authoring actions (date+time
  concatenated as UTC); tracked separately, behavior must not change here.
- Extending the sentence to the Session Ledger / Dashboard week timeline rows.
- Localization of the notation (English house format only).

## Demo Script

1. Dashboard → "+ New" → New Workout Session. The form opens with one sentence
   line: `45 min` `easy` `run` as tokens.
2. Tap the duration token → stepper popover → set `2 km` as distance instead;
   the sentence and the Workout Shape update live.
3. Add a step, make it a repeat block: set repeat to `4 ×`, duration `6 min`,
   tap the intensity token, pick pace `4:40/km` — the zone chip (`Z3`) and bpm
   facet (`170–178 bpm`) appear instantly from the discipline profile.
4. Add `(1 min rest)` inside the block and a cool-down step. The Workout Shape
   below shows the bracketed 4× group between warm-up and cool-down bars.
5. Save. The Workout Detail View shows the *same* sentence and shape; tap the
   pace token right there (session is scheduled), nudge to `4:35/km`, watch
   the bpm facet re-resolve, save inline.
6. Create a strength session: tap the exercise token → combobox → type "spl",
   filter chip "quads" → pick Bulgarian Split Squat from Recent; type a name
   that doesn't exist → inline "Create…" row adds it and selects it. Sets
   token shows `5 × 5 @ 80 kg`.
7. Open a completed session: same sentence, inert tokens — history immutable.

## Further Notes

- Assumptions A1–A5 and the open questions live in ADR 0027; the notable ones:
  read surfaces limited to create/edit/detail in v1, race-equivalent facet
  reserved, English notation, inline detail-edit reuses the existing edit
  action, zone mapping in the live shape unchanged.
- CONTEXT.md gains **Token Sentence**, **Token**, and **Workout Notation**;
  the live diagram deliberately keeps the existing **Workout Shape** name
  (whose glossary entry explicitly avoids "timeline").
- New shadcn components (`command`, `popover`) must go through the
  icon-workflow skill's post-generation cleanup.
