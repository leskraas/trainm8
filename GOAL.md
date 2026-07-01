# trainm8 — Product Goal

> The anchor for the autonomous **Feature Loop** (see ADR 0022 and the
> `/feature-loop` skill). The loop reasons from this file first, then from ADRs,
> `CONTEXT.md`, and the code. Keep it current; keep it high-altitude. **Do not**
> list completed work here — "done so far" is derived from closed issues,
> commits, and ADRs.

## Vision

trainm8 is the smart, honest training partner for self-coaching endurance
athletes. It plans your training forward and adapts it to you, then closes the
loop by comparing every recorded session against the plan — never with a
fabricated number. It meets you at your level and works across whatever sports
you do, so the plan you follow and the progress you see are things you can
actually trust.

## Pillars

_In priority order — the loop weights feature discovery toward higher pillars._

1. **The honest plan↔actual loop** — recorded sessions are coupled to the plan
   and compared plainly, then feed back into what to do next. The **Telemetry
   Overlay**, **Adherence Band**, **Training Load** triad, and
   import→**Recording** promotion all serve one job: showing truthfully how the
   actual met the intended. This is the wedge Strava can't reach and
   TrainingPeaks turns into a chore.
2. **Smart, adaptive planning** — the app plans training forward toward an
   **Event**, adapts as data and life change, and explains its reasoning in
   plain language. **Plan Generation**, the **Plan Outline**, and the **Coach
   card**'s daily "go hard or recover?" call are the engine that feeds the loop.
3. **Meets you at your level** — one clear interface that scales its depth to
   the athlete: enough for a beginner, everything for an expert, plain language
   over jargon. Structured training should fit the person using it, not the
   other way around.
4. **Multi-sport breadth** — genuinely works across run, bike, swim, and
   strength, with per-**Discipline** correctness rather than a run app with
   bolt-ons.

> **Building principle (cross-cutting, above all pillars):** every metric is
> earned from real data or shown as an **Unavailable Metric** — never
> fabricated. This constrains _how_ every feature is built, in any pillar.

## Non-goals

_Explicitly out of scope, so the loop stops suggesting them._

- **No social feed, followers, kudos, or comments** — the Strava-style vanity
  layer pulls the product away from its wedge. Permanent no. (Forward-looking
  coordination is a different thing — see **Shared Training** under Horizon.)
- **No coach- or team-managed workflows** — trainm8 is for the **Self-Coaching
  Athlete**. No coach dashboards, athlete rosters, or shared/assigned plans.
  This is an identity boundary, not a phase.
- **No general-wellness tracking** — no nutrition, sleep, HRV, weight, or mood
  logging. Stay on endurance training and its load.
- **No in-app activity recorder** — trainm8 is not a GPS/live-recording device.
  Executed data arrives via **Activity Import** (Strava/Garmin/Polar/upload),
  never from trainm8 capturing it live.
- **No first-class sports beyond run/bike/swim/strength** — other activities
  stay import-only via the `other` **Discipline** and get no planning,
  generation, or load treatment.

## Horizon (not now)

_Named directions we intend to pursue, but explicitly out of current scope. The
loop must **not** generate candidates for these — they are recorded so nothing
built now contradicts them._

- **Shared Training** — inviting a training partner to a planned **Workout
  Session**. Forward-looking coordination around the plan, never a feed.
- **The Tape** — the single scrubbable past↔future timeline of **Workout
  Sessions** as the primary navigation model (today a long-term idea in
  `CONTEXT.md`, not the current surface).

## North-star / Current focus

**The loop closes: your plan adapts to what you actually did.**

The display-side loop already works end-to-end — plan, train, import, and see
honest planned-vs-actual. The frontier is making it _act_: after real sessions
land, the athlete's forward plan and the **Coach card**'s guidance adjust,
automatically and persistently, to their recorded training state (**Adherence
Band**, **Training Load**, missed sessions) — reading real actuals instead of
replaying the original inputs.

- **Honest by construction** — when there isn't enough trustworthy data to
  justify a change, it says so rather than inventing an adjustment.
- **Demoable end-to-end** — an athlete who drifts under, or overreaches, sees
  their upcoming **Workout Sessions** visibly change in response.

---

### How the loop uses this file

- A feature candidate must move a **Pillar** toward the **North-star**, respect
  the **Non-goals**, and be a **single demoable tracer-bullet slice** (no
  epics).
- Edits here steer what gets built next — this file is the steering wheel.
