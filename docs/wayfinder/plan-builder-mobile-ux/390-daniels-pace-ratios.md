# Research behind #390 — what `daniels-pace-5`'s ratios should be

Supporting document for [#390](https://github.com/leskraas/trainm8/issues/390),
a ticket on the map [#434](https://github.com/leskraas/trainm8/issues/434). The
ticket asked one thing before any number is changed: _"Are the ratios wrong, or
is the repo encoding a different edition's table? Establish what is citable
before changing numbers."_

They are wrong, and not by an edition. This document establishes the citable
ratios, identifies the arithmetic that produced the wrong ones, and settles the
`E`/`L` question the triage comment flagged as the blocking design call.

## 1. The citable ratios

Daniels publishes a table, not a formula, so the ratios have to be read off the
table. Four independent reproductions were consulted, and the T-relative pace
ratios agree to within about ±0.01 across the whole VDOT range:

| Source                                                                                                  | Form                      | Covers                |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------- |
| [sport-calculator, Daniels running table](https://sport-calculator.com/blog/jack-daniels-running-table) | min/km, E as a range      | E M T I R, VDOT 40–60 |
| [brenoamelo, printable VDOT chart](https://www.brenoamelo.com/blog/vdot-pace-chart-printable)           | min/mile, E as one column | E T I, VDOT 40–60     |
| [runningtimecalculator, training paces](https://runningtimecalculator.com/en/training-paces.html)       | min/mile                  | E M T I R, VDOT ≈ 44  |
| #390's own calibration table                                                                            | min/km                    | E T, VDOT 40/45/50/60 |

Ratios to T pace, computed from each source (`docs/` has no VDOT table of its
own;
[`portable-intensity-anchors.md`](../../research/portable-intensity-anchors.md)
§2.2 carries the curves but explicitly warns they do not reproduce the published
`E`/`M`):

| VDOT | E fast | E slow | M     | T     | I     | R     |
| ---- | ------ | ------ | ----- | ----- | ----- | ----- |
| 40   | 1.156  | 1.291  | 1.086 | 1.000 | 0.917 | 0.848 |
| 45   | 1.162  | 1.298  | 1.091 | 1.000 | 0.921 | 0.849 |
| 50   | 1.166  | 1.302  | 1.102 | 1.000 | 0.923 | 0.851 |
| 55   | 1.166  | 1.303  | 1.109 | 1.000 | 0.924 | 0.848 |
| 60   | 1.174  | 1.305  | 1.121 | 1.000 | 0.921 | 0.847 |

_(sport-calculator, min/km.)_ The single-value `E` columns of the other three
sources put `E` at **1.199–1.212** across VDOT 40–60 — the middle of that range,
as expected of a table that publishes one number where another publishes a band.

**The ratio is essentially ability-invariant.** That is the property the fix
depends on: a recipe stores ratios, not paces, so it is only correct at all if
the ratio holds across the VDOT range. It does, to ±1 %.

Converged citable values:

| Band | Ratio to T                 | Spread across sources |
| ---- | -------------------------- | --------------------- |
| `E`  | **1.20** (range 1.16–1.30) | 1.156–1.305           |
| `M`  | **1.08**                   | 1.070–1.121           |
| `T`  | **1.00**                   | anchor                |
| `I`  | **0.92**                   | 0.913–0.924           |
| `R`  | **0.85**                   | 0.829–0.851           |

## 2. What the repo actually has, and how wrong each band is

`app/utils/zones/recipes.ts:147-194`:

| Band | Repo        | Citable   | Verdict                                                                         |
| ---- | ----------- | --------- | ------------------------------------------------------------------------------- |
| `E`  | `1.29–1.74` | 1.16–1.30 | **Wrong.** Daniels' `E` sits almost entirely inside the repo's `M`.             |
| `M`  | `1.15–1.28` | ~1.08     | **Wrong.** Daniels' `M` sits inside the repo's `T`.                             |
| `T`  | `1.00–1.14` | ~1.00     | **Wrong band, right edge.** `T` lands on its fast boundary; the band runs slow. |
| `I`  | `0.88–0.99` | ~0.92     | **Correct.** Lands mid-band.                                                    |
| `R`  | `0.75–0.87` | ~0.85     | **Correct.** Lands near the slow edge.                                          |

### Two corrections to #390 as filed

**The defect is narrower than reported.** #390 and ADR 0045's Accepted costs
both say _"his E, M and I land in the repo's M, T and R bands respectively"_.
`E` and `M` hold. **`I` does not** — Daniels' `I` at 0.92 lands inside the
repo's `I` band (`0.88–0.99`), and `R` at 0.85 lands inside the repo's `R`
(`0.75–0.87`). The three aerobic bands are one step slow; the two hard bands are
approximately right.

The error came from the `I` pace used: #390 gives `I 3:52/km`, which is roughly
\_v_VO₂max — the pace the curve inversion produces at `f = 1.00`, and which
[`portable-intensity-anchors.md`](../../research/portable-intensity-anchors.md)
§2.2 computes as `3:51/km` in its worked example. Daniels' **table** puts `I` at
`1:40/400 m` = `4:10/km` on that row. Using the table value gives 0.896–0.92,
not 0.832.

**#390's "VDOT 50" column is Daniels' VDOT 45 row.** `E 8:59/mi`, `M 7:58/mi`,
`T 7:29/mi` are the VDOT 45 paces (brenoamelo's VDOT 45 row: `E 8:57`,
`T 7:27`); at VDOT 50 the table gives `E 8:14/mi` = 5:07/km and `T 6:51/mi` =
4:15/km. The mislabelling changes nothing, because ratios are what the recipe
stores and they are invariant — and #390's own E/T calibration table
(1.193–1.212) is correct as computed.

## 3. Where the wrong numbers came from — not an edition

The repo's bands are the **reciprocals of the `%VO₂max` fractions**, tiled to
make `T` start at 1.00.

Daniels' documented fractions, per
[`zones-and-thresholds.md`](../../research/zones-and-thresholds.md) §2.4: `E`
59–74 %, `M` 75–84 %, `T` 83–88 %, `I` 95–100 %, `R` ~105–120 %.

| Band | `1/f`       | Repo band | Width `1/f` | Width repo |
| ---- | ----------- | --------- | ----------- | ---------- |
| `E`  | 1.351–1.695 | 1.29–1.74 | 0.344       | 0.45       |
| `M`  | 1.190–1.333 | 1.15–1.28 | 0.143       | 0.13       |
| `T`  | 1.136–1.205 | 1.00–1.14 | 0.069       | 0.14       |
| `I`  | 1.000–1.053 | 0.88–0.99 | 0.053       | 0.11       |
| `R`  | 0.833–0.952 | 0.75–0.87 | 0.119       | 0.12       |

Same ordering, same rough widths, shifted down so the ladder tiles contiguously
from `T = 1.00`.

**That reciprocal is the bug.** Pace does not scale as `1/(%VO₂max)`, because
the oxygen-cost curve is a quadratic with a negative intercept:

```
VO2(v) = -4.60 + 0.182258·v + 0.000104·v²
```

The `−4.60` alone means halving the metabolic rate does not halve the velocity.
Inverting the curve properly at the _same_ documented fractions gives:

| Band | Curve-inverted ratio to T | Published table |
| ---- | ------------------------- | --------------- |
| `E`  | 1.12–1.35                 | 1.16–1.30       |
| `M`  | 1.01–1.11                 | ~1.08           |
| `T`  | 0.98–1.02                 | 1.00            |
| `I`  | 0.88–0.92                 | ~0.92           |
| `R`  | 0.76–0.85                 | ~0.85           |

The curve inversion and the published table agree. The reciprocal does not agree
with either. So: **the ratios are an arithmetic error, not a different edition's
table.** The first of #390's open questions is closed — there is no edition to
go looking for.

## 4. `E` does not split — Daniels' own column is `E/L`

#390 asks: _"Daniels' later editions split `E` from a separate long-run/`L`
pace, which would narrow the band rather than only move it — worth checking
whether the fix is new bounds or an extra band."_ The triage comment escalated
this to the blocking design call, since ADR 0045 §3 makes a sixth band a
modelling choice.

It is not a split. Daniels' one-sheet pace table heads that column **`E/L`** —
one column, one pace band, serving both Easy and Long
([`DanielsOneSheet.pdf`](https://sdtrackmag.com/DanielsOneSheet.pdf), header row
`E/L  Vdot  5k  Mile …`), and the printable reproductions list Easy and Long as
a single column. `L` is a session **type** — a duration and a
share-of-weekly-volume cap — run at `E` pace. It is not a distinct intensity, so
there is nothing for a sixth band to declare.

**The fix is new bounds, not an extra band.** `E` stays one band declaring
`zone: 2`, and ADR 0045 §3's recipe table is untouched.

## 5. Recommended bands

Boundaries placed midway between adjacent citable centres, contiguous at the
0.01 step the file already uses:

```ts
{ label: 'E', minRatio: 1.15, maxRatio: 1.31, zone: 2 }   // midpoint 1.230
{ label: 'M', minRatio: 1.05, maxRatio: 1.14, zone: 3 }   // midpoint 1.095
{ label: 'T', minRatio: 0.97, maxRatio: 1.04, zone: 4 }   // midpoint 1.005
{ label: 'I', minRatio: 0.90, maxRatio: 0.96, zone: 5 }   // midpoint 0.930
{ label: 'R', minRatio: 0.80, maxRatio: 0.89 }            // midpoint 0.845
```

Every midpoint lands within 0.03 of its citable centre, against 0.32 for `E`
today.

One trade-off worth naming rather than burying. `E` could be centred exactly
(`1.14–1.26`, midpoint 1.20), but that excludes genuine easy running out at
1.30, which the range-publishing sources include. The recommendation keeps the
full published `E` range and accepts a midpoint 2.5 % slow — for a 4:15/km
threshold runner, 5:14/km against a published 5:06/km. Leaving `E` open-ended
slow (`maxRatio` absent) is the third option: `representativeRatio`
(`app/utils/plan-outline/volume-conversion.ts:446-448`) then returns `minRatio`,
pricing easy running at 1.15 — the fast edge — which is wrong in the opposite
direction and by more.

## 6. What this unblocks, and what it does not

**ADR 0045 §5 loses its stated reason.** The ADR declines to read `r_easy` from
the recipe, and gives exactly one reason: _"The easy band is too wide to have a
representative midpoint: `daniels-pace-5`'s `E` spans `1.29–1.74`, whose
midpoint prices a 4:39/km threshold runner's easy running at 7:03/km where
Daniels' own table says 5:35/km."_ With `E` at `1.15–1.31` that midpoint prices
the same runner's easy running at 5:42/km against a published 5:35/km. The
carve-out was a workaround for this defect and should be re-examined once the
ratios land — a separate decision, since the ADR's other recipes were not the
problem.

**The Accepted cost in ADR 0045 needs amending, not just discharging** — its `E`
midpoint arithmetic (0.660 against 0.833) is right, but its claim about `I`
landing in `R` is not (§2 above).

**`stryd-run-power-5`'s `Z1` is not the same defect and needs no fix.** #390
flags `Z1` spanning `0–0.8` as having the same "no representative midpoint"
shape. Checked: `representativeRatio` special-cases an open floor —
`if (band.minRatio === 0) return band.maxRatio` — so `Z1` prices at 0.8, not at
the absurd 0.4 midpoint. The open-floor convention already handles it.

**What is still blocked is not a number.** ADR 0006 requires a changed recipe to
take a new id, which means a `daniels-pace-5-v2` fixes the bug for nobody
already on `daniels-pace-5`. That is a product policy call, and it is a live one
because ADR 0006's own **Revisit — Amend** note records that the guarantee the
new-id rule protects is _already unkeepable_: `DisciplineProfile.zoneSystem`
carries no effective-dated history, so historical zones cannot be reconstructed
either way. The rule is therefore buying less than it appears to. That decision
is its own ticket.

## 7. Consumers a change touches

- `app/utils/zones/resolve.ts:71-95` — `applyBand` multiplies the anchor by the
  ratios; the pace ranges on the Intensity Target preview move.
- `app/utils/intensity-target.ts:19,90-94` — imports `DANIELS_PACE_5` directly
  for its letter captions. A v2 id needs this pointer reviewed.
- `app/utils/plan-outline/volume-conversion.ts:446-448` — `representativeRatio`,
  the Volume Conversion pricing (ADR 0045).
- `app/utils/structure-detection/classify.ts:83-109` and
  `app/utils/zone-equivalent.ts:74-85` — bucket measured ratios into bands; the
  editor's chip tint follows.
- `prisma/seed.ts:46` — the run editor's fallback is `stryd-run-power-5`, not
  Daniels, so defaults are untouched unless changed on purpose.

## Sources

- [sport-calculator — Jack Daniels running table](https://sport-calculator.com/blog/jack-daniels-running-table)
- [brenoamelo — VDOT pace chart, printable](https://www.brenoamelo.com/blog/vdot-pace-chart-printable)
- [runningtimecalculator — training paces (Jack Daniels method)](https://runningtimecalculator.com/en/training-paces.html)
- [Daniels one-sheet pace table (PDF)](https://sdtrackmag.com/DanielsOneSheet.pdf)
  — column header `E/L`
- [sport-calculator — Daniels–Gilbert equations as reproduced by VDOT implementations](https://sport-calculator.com/calculators/running/jack-daniels-running-calculator)
- In-repo:
  [`docs/research/zones-and-thresholds.md`](../../research/zones-and-thresholds.md)
  §2.4,
  [`docs/research/portable-intensity-anchors.md`](../../research/portable-intensity-anchors.md)
  §2.2

**Confidence.** High on `E`, `M`, `T`, `I` — four sources, two derivations
(published table and curve inversion) that agree. Medium on `R`: only two
sources carry an `R` column, and Daniels' `R` is genuinely a point pace with a
wide practical tolerance. All four web sources are secondary reproductions of a
copyrighted printed table; none is Daniels' book. Their mutual agreement to ±1 %
is the evidence, not any one of them.
