# Detected segments are classified on the discipline's anchor channel; the zone label is display-derived, not stored

Map #326 (Workout auto-analysis) detects segment *edges* from the cleanest
channel — power for bike, median-filtered pace for run, never HR (#327/#330).
What was left open (#333): once a segment is bounded, how is its intensity turned
into a **zone label**, and what does a detected step actually store. Detection
here runs the *opposite* direction from prescription authoring: authoring bakes a
`zoneLabel → range` because there is no measured number, whereas detection *has*
the measured value.

## Decision

Classification is the **labelling** stage that rides on the edges the engine
already found (HR never sets edges).

### 1. Classification channel (per discipline)

Classify on the channel the athlete's recipe is **anchored** to — mirroring the
per-discipline default in `deriveMetricTarget`:

- **bike → power** (Coggan / %FTP),
- **run → pace** (Daniels / threshold pace),
- **HR only as a fallback** when the primary channel is absent.

### 2. Recipe & thresholds

Invert the athlete's `DisciplineProfile.zoneSystem` recipe (ADR 0006): the anchor
threshold plus per-zone overrides define the bands, and the segment's
representative value is placed in the band that contains it. This is the
read-time inverse of `resolveIntensity` (band → range); the same recipe and
overrides drive both directions.

### 3. Missing-threshold degradation — ladder, then `null`

1. Try the anchored channel's threshold (FTP / threshold pace).
2. Else fall back to **HR classification** — LTHR, or maxHR via the Tanaka
   age-fallback (ADR 0005; never materialized).
3. Else `analyze()` returns **`null`** — honest no-detection (ADR 0008). **Never**
   a guessed zone, **never** a global or population-default threshold.

The **band-separation honesty gate** (#330's single most important knob — a real
interval crosses a zone boundary; GPS/pace wobble stays inside one) is *defined*
against a real threshold, so without one there is nothing honest to classify.
Detection quality is bounded by the athlete's thresholds, by design.

### 4. HR lag (when HR is the classifying channel) — combine with structure

HR only **labels** within boundaries already set by the cleaner channel; it never
sets edges, so it always rides on the power/pace structure.

- Trim a **~30 s lead-in** (one HR-lag constant) and classify on the **settled
  interior** mean; never interpolate across a `null` pause.
- **Borrow across the detected set:** reps clustered as the same
  `(duration, value)` motif share a steady state, so for a rep too short to leave
  a stable interior on its own, **pool the sibling reps' interiors** (e.g. median
  of the pooled interiors) and use the set's common rep length to place the
  steady window. This rescues short reps that per-segment trimming alone would
  drop.
- A rep with **no sibling support and no stable interior** stays
  HR-unclassifiable → no confident detection (short reps lean on provider laps,
  #328).

### 5. Representative per-segment value

The **robust median / trimmed mean** of the denoised classifying channel over the
same interior, skipping `null`-pause samples — rejecting GPS/power spikes the way
#330's median/MAD normalization did. **Not** Normalized Power per segment (NP is a
whole-activity variable-intensity construct; a constant-intensity segment ≈ its
average anyway). This one number both classifies the segment and becomes the
stored metric in (6).

### 6. Output semantics — inverted `deriveMetricTarget`

A materialized detected step carries its **Intensity Target = the concrete
measured metric** — an absolute `pace` / `power` / `hrBpm` from the
representative value (what the athlete actually did). The classified **zone label
is a display-time derivation** from that concrete value through the athlete's
*current* recipe (the same path `formatIntensityTarget` / `describeStepTarget`
already walk to caption a concrete target) — it is **not** separately persisted.

Re-baking a recipe-band range from the zone (calling `deriveMetricTarget` on the
detected label) is explicitly rejected: it would discard the real measurement and
reintroduce threshold-dependent drift at display time.

## Alternatives considered

- **Classify on HR by default** (it is the most universally present channel):
  rejected. HR lag and cardiac drift make edges and labels shaky; power/pace is
  the honest anchor, HR only a fallback (consistent with ADR 0024).
- **Guess a zone / use a population-default threshold when the athlete's is
  missing:** rejected — a fabricated zone, exactly what ADR 0008 forbids. Return
  `null` instead.
- **Store the resolved zone band alongside the raw value** (the #330 prototype
  note): rejected once #329 landed. The raw measured value is stored and
  immutable, so the band is fully re-derivable; persisting it would only add
  staleness when thresholds change. Storing the measurement alone is
  strictly more honest and needs no schema slot beyond #329's `IntensityTarget`.

## Consequences

- Reconciled with #329: a detected step's intensity is expressed purely as an
  `IntensityTarget` (the concrete measured metric); there is no separate
  zone-band slot in `WorkoutStructureSchema`. This fills the concrete-metric vs
  zone-label variant #329 explicitly deferred here.
- Resolves the **Detection Confidence** channel→cap forward reference (ADR 0033,
  CONTEXT.md): HR-classified intensity caps Detection Confidence at `medium`
  (ADR 0024) exactly when HR is the classifying channel — i.e. when the anchored
  power/pace threshold is missing and the ladder fell to HR. This ADR fixes
  *which* channel classifies per discipline and therefore *when* that cap applies.
- The classifier, the HR lead-in trim, the sibling-pooling, and the
  display-time zone derivation are implementation, left to the hand-off. No new
  fog graduates and nothing moves out of scope.
