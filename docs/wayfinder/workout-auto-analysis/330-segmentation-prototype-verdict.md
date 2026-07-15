# Segmentation prototype — verdict (wayfinder #330, map #326)

**Question:** does the #327-recommended segmentation pipeline actually find
warmup / repeated intervals / cooldown in our real stored Activity Streams?

**Verdict: yes for the majority archetype, and — just as important — it fails
_honestly_.** PELT (L2) segmentation is the right primitive; the hard, tunable
part is the candidate scoring / repeat-mining on top of it, not the
segmentation. Every failure mode degrades to "steady / no confident detection"
rather than fabricating structure, which is exactly the ADR 0008 behaviour we
want.

The prototype (`prototypes/structure-detection/`, throwaway) ran the full
pipeline over **51 activities**: 1 synthetic ground-truth ride + kody's 50
seeded real runs (`prisma/seed-data/kody-strava-history.json`), rendering
detected segments against the raw channels in `report.html`.

## What the pipeline is

Per #327, hand-rolled and dependency-free:

1. **Split at `null` pauses** — never interpolate across a pause (ADR 0020).
2. **Edge channel:** power (bike) / pace (run). HR never sets edges.
3. **Robust denoise + normalize:** rolling median (5) then **median/MAD**
   normalization, with a pace clamp at 120–900 s/km.
4. **PELT, L2 cost** — exact changepoint detection. Penalty `8·log n`, min
   dwell 25 s.
5. **Zone-band labelling** from the athlete's recipe + Discipline Profile
   threshold (Daniels/T-pace for run, Coggan/FTP for bike).
6. **Repeat-mining:** 2-means (work vs easy) → cluster reps by duration &
   value → detect k×(work+recovery) motif → ranked candidates + a
   confidence-ish score. Always emits a "steady" fallback.

## The knobs that matter (priority order)

1. **Zone-band separation gate — the single most important knob.** A candidate
   is only "structured" if the hard level sits **≥1 zone above** the easy
   level. This is the honesty discriminator: GPS pace wobble on an easy run
   clears any value-margin threshold but stays _inside one zone_, while a
   genuine interval crosses a zone boundary. Without this gate, ~40 easy runs
   produced convincing-looking phantom `N × … @ E` sets. With it, they
   correctly read "steady." It is deliberately threshold-dependent (see below).
2. **Robust normalization + pace clamp.** Plain z-normalization is wrecked by
   GPS pace spikes (a single 20 s/km sample inflates SD and deflates the
   effective penalty). Median/MAD + clamp fixed it; this was the difference
   between garbage and clean run segmentation.
3. **PELT penalty (`8·log n`) and min-dwell (25 s).** Control segment
   granularity / anti-flicker. `6·log n` over-segmented easy runs; `8` was the
   sweet spot across the corpus. Should be tunable per discipline.
4. **2-means work/easy split + value-margin gate** (pace ≥8 %, power ≥15 %).
   More robust than any fixed percentile because real recoveries are often
   short walks far easier than the warmup, which drags quantiles onto the work
   level.
5. **Pause-stitch, k≥3 confidence factor, recovery-sanity guard.** Second-order
   corrections; each earns its place on a specific failure (see below).

## What works

- **Classic zone-crossing interval session** — `i3 10x3 min, p:60` →
  **`warm-up 6:25 → 6 × (3:04 @ T + 3:20 E)`, score 0.95.** (Detected 6 clean
  reps; the athlete's first few reps blended into the warmup segment, a minor
  boundary effect.) This is the target archetype and it nails it.
- **Easy / steady runs** — all ~40 correctly fall back to "steady," no phantom
  structure.
- **Synthetic ground-truth ride** (warm-up ramp → 4×8′ Z4 fading 252→232 W,
  rep 2 paused mid-rep → cool-down) → `warm-up → 2 × (8 min @ Z4 + 3 min Z1) →
  cool-down`. Plausible but **incomplete — 2 of 4 reps** (see failure modes).

## Honest failure modes (none fabricate)

1. **Reps run inside one zone are not detected.** `i3 5x6min` → "steady @ E":
   the athlete ran these 6-min efforts at ~5:20/km, which is **E pace against
   their 4:00/km threshold**. The band-separation gate refuses to call it
   structure. This is _correct_ per ADR 0008 — better "no detection" than a
   fabricated set — but it means detection quality is only as good as the
   athlete's thresholds.
2. **Very short reps (30/30, 45/15) are invisible.** `20x45/15`, `i3 15x45/15`
   etc. all read steady. At the 5 s stream floor a 15 s recovery is ~3 samples;
   the min-dwell (25 s) and bucket-mean smearing erase them. **This is direct
   corroboration of the #328 lap-data research** — these are exactly the
   sessions where provider lap markers are the only viable signal.
3. **Gradual warmup ramps merge into the first rep.** PELT L2 fits
   piecewise-_constant_ segments; a smooth 130→190 W ramp has no sharp
   changepoint, so its tail merges into rep 1. Cosmetic for warmup detection
   but it can eat a rep.
4. **Fading intensity + mid-rep pause** (the synthetic torture case) → 2 of 4
   reps. The pause split rep 2, and its post-pause fragment fell outside the
   duration cluster; the fade (252→232 W) stayed within one cluster so that
   part held. The pause-stitch heuristic helped but didn't fully recover it.

## Decisions this unblocks / informs

- **#329 (Detected Structure domain model):** a candidate is
  `{ blocks: [{ repeat, steps:[{role, durationSec, band/value}] }],
  score, scoreParts }` — it reuses Workout→Block→Step vocabulary cleanly.
  Detected intensities are best stored as **both** the resolved zone band _and_
  the measured value (the band is threshold-derived and will shift if
  thresholds change; the raw value is immutable). Confidence must include an
  honest **"no confident detection"** state, not just a low number.
- **#331 (confidence & auto-accept):** the score decomposes into `regularity`,
  `intensityTightness`, `alternation`, `coverage`, gated by band-separation and
  multiplied by a k-factor (k=2 is weak) and a recovery-sanity guard. The
  band-separation gate is the natural home of the honesty rule. Auto-accept
  should require both a high score _and_ a clear margin over the runner-up; the
  0.95 vs 0.15 gap on the 10×3 case shows that separation is achievable.
- **Threshold dependence is a first-class constraint:** detection needs the
  athlete's Discipline Profile thresholds. Missing them → `analyze()` returns
  `null` (honest no-detection), never a guess.
- **Lap data (#328) is not optional for short-rep sessions** — the stream-only
  detector is structurally blind to them.

## Reproduce

```
npx tsx prototypes/structure-detection/run.ts   # writes report.html
```

Throwaway — delete `prototypes/structure-detection/` once #329/#331 absorb the
validated pieces (PELT, robust-normalize, band-gate, 2-means miner).
