# AI plan generation: native, typed, Event-anchored, preview-first

trainm8 will gain an AI **Training Plan** generator, ported from the separate
`trainllm` wizard prototype. `trainllm` produces a `GeneratedProgram` — a fixed
8-week block of loosely-typed, prose-heavy sessions (`duration: "8x400m"`,
`target: "HR 130-150bpm"`, free-text `intent`, day-of-week only) across many
sports (climbing, combat, racket, endurance), rendered on screen and never
persisted. It runs against a **local Ollama** model.

trainm8's domain is the opposite: a tight `run | bike | swim | strength`
**Discipline** vocabulary, a 7-variant `IntensityTarget` discriminated union,
`durationSec` XOR `distanceM`, a controlled `WORKOUT_INTENTS` set, strength steps
that reference an `Exercise` catalog, and zone resolution that is a pure function
of recipe + threshold (ADR 0006). It deploys to Fly with no AI dependency today.

"Integrate the trainllm output" is therefore a translation-from-loose-to-strict
problem. This ADR records how we resolved it.

## Decision

**Port the wizard into trainm8** as a native feature; trainm8 owns the model's
output schema rather than consuming `trainllm`'s. The concrete shape:

1. **Scope (V1): cardio only** — generate `run`/`swim`/`bike` plans. The broad
   multi-sport library and strength generation are deferred. ADR 0015
   (`'other'` is import-only) is left untouched: no authored non-canonical
   sessions. Strength is deferred because the `Exercise` catalog is effectively
   empty and the sets/reps/1RM/find-or-create apparatus is a slice of its own.

2. **Typed output contract** — the model is forced (tool-use / structured
   output) to emit trainm8-typed JSON matching the authoring schema:
   discriminated `cardio`/`rest` steps, `durationSec` XOR `distanceM`, a
   `WORKOUT_INTENTS` value, and **zone-label** intensity keyed to the athlete's
   recipe. Output is Zod-validated with a repair retry. No parsing of prose
   strings. Concrete HR/power/pace ranges are filled by the existing resolver
   from `DisciplineProfile` thresholds (ADR 0006); absent thresholds leave
   ranges null (Unavailable Metric), consistent with the existing fallback.

3. **Event is the grouping** — no `TrainingPlan` table is introduced. A
   generation anchors to exactly one **Event** (the **Target Event**), reusing
   ADR 0009. `WorkoutSession` gains a `targetEventId` anchor FK, distinct from
   the existing `Event.resultSessionId` (the **Event Result**). If the athlete
   has no Event, a `fitness-goal` Event is auto-created from the goal text and
   horizon so grouping always holds.

4. **Outline whole, detail near-term** — the model produces a periodized
   **Plan Outline** (phases + weekly load) spanning the full now→Event horizon,
   stored as JSON on the Event. Only near-term sessions are materialized; later
   phases are detailed on demand via a manual "extend" from the stored Outline.

5. **Preview → approve → persist** — generation returns a transient **Plan
   Preview** to the client; nothing is written until the athlete approves.
   Execution is a **synchronous, SSE-streamed** request (live thinking/progress,
   like `trainllm`), not the background Job Queue — because the result must come
   back for review, not be written out of band.

6. **Provenance & lifecycle** — on approve, each session is written with
   `source` (`authored` | `generated` | `recorded`), a shared `generationId`,
   the model id, and a timestamp. Regenerating for an Event replaces only future,
   still-scheduled `generated` sessions anchored to it; completed/skipped/missed
   and `authored` sessions are untouched. **Editing a generated session adopts
   it** — `source` flips to `authored`, protecting manual work from regeneration.

7. **Scheduling** — sessions are placed into concrete `scheduledAt` (UTC) from a
   new **Training Availability** on `AthleteProfile` (trainable weekdays +
   default time), reused across generations.

8. **Provider** — a hosted Claude model via the Anthropic SDK (forced tool-use).
   Local Ollama cannot ship on Fly; this adds the first LLM dependency and key.

## Considered options

- **Ingest `trainllm`'s `GeneratedProgram` JSON instead of porting**: Rejected —
  keeps a loose, prose-heavy contract as the integration boundary and forces a
  brittle string-parsing translation layer (`"8x400m"` → block/step), the exact
  free-text our structured-data principle rejects. Porting lets us make the
  model emit typed output directly.
- **Loose intermediate + translate, or a hybrid typed+raw-fallback tier**:
  Rejected for the same reason; the hybrid reintroduces an untyped tier.
- **Keep the wizard broad, map non-canonical sports to `'other'`**: Rejected —
  contradicts ADR 0015 (authored `'other'` is invalid), leaves climbing/combat
  steps with no typed home (the step union is cardio/strength/rest only), and
  produces sessions the load math (and the Coach card, ADRs 0008/0010) can't
  reason about. Narrowing to four disciplines keeps the domain honest.
- **A `TrainingPlan` entity (or a thin `PlanGeneration` record) as the grouping**:
  Rejected for V1 — the Event already models the plan anchor (ADR 0009) and the
  open, Event-driven horizon makes a fixed plan block the wrong unit. Provenance
  lives on the session batch; the Outline lives on the Event. Revisit if a plan
  needs to span multiple Events or carry plan-level state of its own.
- **Full detailed plan up front**: Rejected — a months-long plan is a huge,
  quickly-stale LLM output that ignores how the athlete actually progresses.
- **Background Job Queue generation (ADR 0013)**: Rejected for the generate step
  — the queue exists to write imports out of band, but here the result must
  return for preview before any DB write. (The manual "extend" and any future
  auto-roll-forward could still use the queue.)
- **Auto-persist on generation (no preview)**: Rejected — writing 20+ sessions
  onto the calendar unreviewed makes "discard this plan" a bulk delete. A
  `draft` SessionStatus was also rejected to avoid adding a lifecycle state.
- **Concrete intensity numbers from the model**: Rejected — zone labels keyed to
  the recipe keep generation threshold-agnostic and let the audited resolver
  (ADR 0006) own the math; this also means no-threshold athletes still get a
  usable plan.

## Consequences

- Schema deltas: `WorkoutSession` gains `targetEventId`, `source`,
  `generationId`, `generatedByModel`, `generatedAt`; `Event` gains `planOutline`
  (JSON); `AthleteProfile` gains trainable-weekdays + default-training-time.
- A new domain split mirrors ADR 0015's input/import split: authoring validation
  already enforces typed values, and generation reuses that same schema as its
  output contract.
- `source` becomes the discriminator for regeneration safety and for telling
  generated, hand-authored, and recording-only sessions apart on the Tape.
- Editing-adopts means a generated session that the athlete touches is
  permanently excluded from future regeneration — intended, but worth surfacing
  in the UI so the effect isn't surprising.
- A new env var / secret (Anthropic key) and a hard dependency on model
  availability and latency enter the request path. The synchronous SSE design
  must tolerate slow generations without hitting platform request timeouts.
- The `Plan Outline` on the Event is generation output that must be persisted on
  approve alongside the near-term sessions; "extend" reads it to detail the next
  chunk. Regeneration updates both the Outline and the future sessions.
- Strength generation, broad multi-sport, and any auto-roll-forward of the
  detail window are explicitly out of scope here and each warrant their own
  slice (and, where they reverse a decision above, their own ADR).
