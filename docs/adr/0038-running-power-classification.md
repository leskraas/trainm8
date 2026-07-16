# Running power is a first-class classifying channel for run detection, preferred over pace, uncapped

PR #354 (#333, multi-metric fusion part 1) made Structure Detection _cut_ run
segments on fused power+pace edges. But detected run segments are still
**classified** on pace only — ADR 0035 fixed the run anchor channel as pace,
with HR as the sole fallback. Modern running is increasingly power-based (Stryd
et al.); the seeded corpus shows **all 50 runs carry a power channel**, and for
athletes who train and threshold by power, GPS pace lags and wobbles while power
is the truer, more direct intensity signal. This ADR adds running power as a
first-class classifying channel for runs, extending ADR 0035's classifier ladder
and ADR 0024's power-trust rule.

## Decision

### 1. Running power joins the run classifier ladder, preferred over pace

The ADR 0035 ladder for `run` classification gains a running-power rung at the
top, so `resolveClassifier` for a run walks:

1. **Running power** — when a running-power threshold (critical power) is set
   _and_ the stream carries a power channel. Classify on power against the
   athlete's %CP recipe.
2. **Pace** — when a threshold pace is set and the stream carries pace (the ADR
   0035 anchor).
3. **HR fallback** — LTHR, or maxHR via the Tanaka age-fallback (ADR 0005),
   capping the grade at `medium`.
4. Else **`null`** — an honest no-detection (ADR 0008).

Bike is unchanged (power → HR → null). Edge detection is untouched: a run still
fuses power+pace for _edges_ (PR #354) and this decision only governs _which
channel labels the bounded segments_.

### 2. Precedence: power first, matching bike

When a run carries **both** a running-power threshold and a threshold pace,
power wins — the same precedence bike already applies (power over HR), and
consistent with `deriveMetricTarget`'s per-discipline default intent: an athlete
who has entered a critical-power threshold has told us power is their trusted
currency. Pace remains the fallback the moment the power threshold or the power
channel is absent, so nothing regresses for pace-only runners.

### 3. No HR-style trust cap for running power

Running power is a **direct mechanical measurement**, like cycling power — not a
lagging, drifting proxy. ADR 0024's `medium` ceiling exists for two specific
reasons, neither of which applies here:

- The average-power-as-NP substitution (a variability blindness) — a
  constant-intensity _segment_ ≈ its average anyway (ADR 0035 §5), so there is
  no NP-vs-average gap to punish at the segment level.
- HR lag and cardiac drift — a cardiovascular-response artefact absent from a
  per-stride power meter.

So running-power classification is **uncapped** (`hrCapped: false`), exactly
like cycling power. The `medium` cap continues to apply only when the ladder
falls all the way to HR. (Stryd's footpod power has a documented accuracy band,
but it is a direct estimate of mechanical output, not a physiological proxy —
the honest place to reflect any per-device uncertainty is the athlete's
threshold, not a blanket grade cap.)

### 4. Zones model: a `runPower` anchor and a %CP recipe

- A new `ZoneAnchor` value **`runPower`** (critical power), distinct from bike's
  `ftp` so a run recipe and a bike recipe never collide on one anchor.
- A built-in running-power recipe **`stryd-run-power-5`** — a %CP band model
  analogous to `COGGAN_POWER_7` (non-inverted: more watts = harder), registered
  in `BUILT_IN_RECIPES`. It is the classifier's default run-power recipe when
  the athlete's own `zoneSystem` is anchored elsewhere (e.g. `daniels-pace-5`),
  so the athlete's _threshold_ always drives the bands — the same rule ADR 0035
  set for the pace/HR rungs.

### 5. Schema: `runPowerThresholdW` on DisciplineProfile

- `DisciplineProfile.runPowerThresholdW Int?` (run only, nullable for others) —
  the athlete's critical running power in watts. A matching
  `ThresholdEvent.kind` value **`runPower`** records changes for the threshold
  history, exactly like `ftp` / `thresholdPace`.
- `DisciplineProfileForResolver` (the pure resolver/classifier input) carries
  the field, and `loadResolverProfile` (`detect-job.server.ts`) selects it, so
  the engine reads it honestly. A missing value collapses to `null` and the
  ladder falls through to pace — never a guessed threshold (ADR 0035 §3).

### 6. Output semantics unchanged (ADR 0035 §6)

A run classified on power stores its **Intensity Target as the concrete measured
watts** (`{ kind: 'power', minW }`) — exactly what the athlete did. The zone
label stays a **display-time derivation** through the athlete's current recipe,
never persisted. The measured value is stored and immutable; the band is
re-derivable.

## Alternatives considered

- **Pace first, power as the fallback.** Rejected — it contradicts bike's
  power-first precedence and the intent of a manually entered critical-power
  threshold. An athlete who thresholds by power expects power labels.
- **Cap running power at `medium` like HR.** Rejected — running power is a
  direct measurement, not a lagging proxy; ADR 0024's two reasons for the cap
  (NP-vs-avg variability, HR lag) do not apply at the segment level. Capping it
  would under-report the confidence of the truest signal these athletes own.
- **Reuse the `ftp` anchor / `COGGAN_POWER_7` for runs.** Rejected — running CP
  and cycling FTP are different physiological thresholds with different band
  shapes; sharing an anchor would force a bike recipe onto a run and let a bike
  FTP leak into run classification.
- **Persist the resolved zone band alongside the watts.** Rejected for the same
  reason as ADR 0035 — the raw value is stored and immutable, so the band is
  fully re-derivable; persisting it only adds staleness when the threshold
  moves.

## Consequences

- `resolveClassifier` gains the run-power rung; `classify.test.ts` and
  `analyze.test.ts` cover a run classified on power (concrete `power` targets,
  uncapped confidence) and power-first precedence when both thresholds exist.
- `zones/types.ts`, `recipes.ts`, `index.ts`, and `resolve.ts` gain the
  `runPower` anchor and `stryd-run-power-5` recipe; the display resolver
  (`resolveIntensity`, `zone-equivalent`) derives run-power zone labels for an
  athlete whose run `zoneSystem` is the %CP recipe — the same display-time path
  ADR 0035 walks.
- `DisciplineProfile` gains `runPowerThresholdW` (a migration) and Training
  Settings gains a run-power input beside threshold pace; `ThresholdEvent.kind`
  gains `runPower`.
- Detection stays decoupled: a run may fuse power+pace for _edges_ (PR #354) yet
  classify on power _or_ pace depending on which threshold is set. Re-running
  `scripts/detection-calibration.ts` confirms no over-detection shift —
  detected/ null holds at **8/50**, the PR #354 baseline (the corpus profile
  sets no run-power threshold, so the pace rung still drives every corpus run).
