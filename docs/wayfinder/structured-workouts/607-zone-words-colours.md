# #607 One word and one colour per zone

Deep analysis for [#607](https://github.com/leskraas/trainm8/issues/607) on
the map [#600](https://github.com/leskraas/trainm8/issues/600). All
`file:line` references are to `origin/main` at `ea40a47` (2026-10-19).

It builds on two settled decisions:
- **#601 · A · Profil.** Height and hue are the zone. Hatched means the zone
  can't be resolved.
- **#602 · the Workout Reading.** `zone` is the recipe band's declared
  Training Zone and `canonicalZone` is `pctToZone`. Zones are read at the
  midpoint. `summary.effort` is "authored Effort Word first, else from zone".

The parts marked **Owner** are the only ones left open. Everything else is
decided below from the code.

## 1. Inventory: every word and colour a zone gets today

### 1.1 Words that turn into a zone (parsing)

| Where | `easy` | `recovery`/`restitusjon` | `rolig` | `moderat`/`tempo` | `terskel`/`threshold` | `hard`/`hardt` | other |
|---|---|---|---|---|---|---|---|
| `zoneLabelToZone`, `session-profile.ts:77-100` (Profil, Effort Word, title, notation facet) | **1** | 1 | – (null) | 3 | 4 | – / – | `zone2`/`endurance` 2, `vo2max`/`anaerobic`/`max` 5, `z1…z7` clamped to 1–5. **`interval`, `sub-threshold`, `steady`, `aerobic`, `warm-up` give null, so they draw hatched.** |
| `ZONE_WORDS`, writing line, `workout-sentence.ts:156-174` | **2** | 1 | 2 | 3 | 4 | 5 / 5 | `oppvarming`/`oppv`/`nedjogg`/`nedkjøling` 1, `langtur`/`langkjøring` 2, `maks` 5. **Stored as the code `Z1…Z5`** (`:627`), not as the word. |
| Composer round trip, `composer-sentence.ts:28-34` | – | `Z1` → restitusjon | `Z2` → rolig | `Z3` → moderat | `Z4` → terskel | `Z5` → hardt | – |
| Day stamp, `day-stamp.ts:45` | – | – | `'Z2'` stored for an easy share day | – | – | – | – |

So `easy` is zone 1 in one reader and zone 2 in the other. The Daniels recipe
calls its `E` band "easy" and declares it zone 2 (`zones/recipes.ts:179-184`),
so zone 2 is right.

### 1.2 Words a zone is shown as (display)

| Where | Z1 | Z2 | Z3 | Z4 | Z5 | Notes |
|---|---|---|---|---|---|---|
| `zoneLabelWord`, `labels.ts:5913-5943` (notation chip, `intensityChipText` `zone-equivalent.ts:294`, `intensity-target.ts:328,468`, `step-kind-reconciliation.ts:275`) | restitusjon | rolig (`easy`, `endurance`, `aerobic`) | moderat (`steady`, `moderate`) **and tempo** (`tempo`) | terskel; `sub-threshold` → "under terskel" | hardt (`vo2max`, `hard`), **maks** (`max`), **intervall** (`interval`) | Codes (`Z2`, `E`, `I-4`) pass through. So a typed `terskel`, stored as `Z4`, reads **"Z4"**, while a seeded `threshold` reads **"Terskel"**. |
| Session title, `session-title.ts:49-52` | `Z1` | `Z2` | `Z3` | `Z4` / **`Threshold`** | `Z5` | `capitalize(target.label)` keeps the English. |
| Notation facet, `workout-notation.ts:1277-1278` | ` · Z1` | ` · Z2` | ` · Z3` | ` · Z4` | ` · Z5` | On metric targets. |
| Effort Word, `effort-word.ts:22,36-38`; labels `labels.ts:1575-1579, 2443-2447, 4005-4009` | Rolig | Rolig | Middels | **Hard** | Hard | I dag pill (`__calm-today.ts:169`, `__calm-today-view.tsx:298-303`), start cards, week sketch, `day-rule.ts:66`. This is why a threshold session reads "Hard" on I dag. |
| Quality mix, `labels.ts:326-330` (EN), `:4334-4338` (NB), `:2829-2833` (plain) | – | – | tempo | threshold / terskel | VO₂ max / **VO₂maks** / **veldig hard** | `formatNbEmphasisLabel` `format.ts:969-976`, `__season-chart.tsx:1323,1358`, `plan.tsx:4050,4496`. |
| Free text with a number | – | "rolig i sone 2" `labels.ts:1721,6916-6919` | – | – | – | Also `sone ${zone}` at `labels.ts:4739,5280,7265,8346`. |
| Recipe band description | `zones/recipes.ts` `description` (English: "easy/endurance", "threshold"…), captioned in the popover (`__intensity-popover.tsx:124-127`). | | | | | |

Counted up: Z2 has 3 words (rolig, Z2, Rolig/E), Z3 has 5 (moderat, tempo,
Middels, Z3, M), Z4 has 6 (terskel, Terskel, Threshold, Z4, Hard, T), and Z5
has 7 (hardt, maks, intervall, VO₂maks, veldig hard, Hard, Z5).

### 1.3 Colours

| Where | What | Notes |
|---|---|---|
| `tailwind.css:183-187` | `--zone-1…5` as hex `#5f9fe0 #3fae7d #d9b13b #e08a3c #d95757` | **`:root` only, with no `.dark` values.** Mapped to `bg-zone-*` at `:316-320`. |
| `design-system.md:78` | "Older app tokens: only `zone-1…5` remains" | No contrast table. Not a role. |
| `shape-strip.tsx:10-16` | `bg-zone-N`, hatched = muted-foreground 45 % stripes (`:22-23`), muted = `muted-foreground/30` | Heights 30/47.5/65/82.5/100 %, rest 16 %, unknown 55 % (`utils/shape-strip.ts:34-49`). |
| `profile-bars.tsx:15-45` | `bg-zone-N` | Heights `h-2…h-6` full and `h-1…h-3.5` row: a third height ladder. |
| `score-stanza.tsx:261-267` | Chip tint `color-mix(in srgb, zone 22–26 %, card)` | Also used by `__intensity-popover.tsx:343`. |
| `__season-chart.tsx:214-218` | Zone dots for 3/4/5 | Quality mix legend. |
| `__prototype-variant-g.tsx:354-355,839-844` | `text-zone-5/4` on share rings | A prototype route that reuses zone colours for another meaning. |
| `__start-option-card.tsx:181-185`, `__week-sketch.tsx:34-38` | Effort as `primary` at 30/65/100 % and opacity 45/75/100 | Not zone hues. This is right for a scale that isn't a zone. |
| `recording-profile.ts:56` | HR % LTHR bucketed on Coggan power cut points | Wrong reader. #602 moves it to the placement function. |

### 1.4 Units (ADR 0023's layer)

| Form | Where |
|---|---|
| `4:40 /km`, `4:40–4:50 /km` | `format.ts:399,413` (the layer) |
| `4:40/km` (space removed) | `zone-equivalent.ts:299-303` |
| `4:30-4:40/km` (hyphen, no space) | `composer-sentence.ts:62-63` |
| `/100m` vs `/100 m` | `format.ts:404`, `row-content.ts:391,529` vs `labels.ts:6516`, `plan.prototype.tsx:203` |
| `km/h` vs `km/t` | `format.ts:931` vs `:987`, plus an ad hoc `nbSpeed` at `sessions.$sessionId.tsx:1676-1678` |
| `238–263 W`, `170 bpm`, `168+ bpm`, `≤ 138 W` | Built inline at `zone-equivalent.ts:306-391`, `row-content.ts:547`, `sessions.$sessionId.tsx:1947` |

## 2. Decisions

### D1 · Five words, one per Training Zone

| Training Zone | Word (NB, as a chip and in a row) | Mid-sentence | Height (#601) |
|---|---|---|---|
| 1 recovery | **Lett** *(Owner: or Restitusjon)* | lett | 28 % |
| 2 endurance | **Rolig** | rolig | 44 % |
| 3 moderate/tempo | **Moderat** *(Owner: or Tempo)* | moderat | 60 % |
| 4 threshold | **Terskel** | terskel | 80 % |
| 5 VO₂max/anaerobic | **Hardt** | hardt | 100 % |
| rest | — (the step's own word: *pause*) | | 12 % |
| unresolved | no word; the reason is said once (#602 `notices`) | | neutral, hatched |

- **The words live in `labels.ts`** as `ZONE_WORDS: Record<TrainingZone, string>`. One reader, `zoneWord(zone)`, serves every surface.
- **Word and colour come from `zone`**, the recipe band's declared Training Zone. They never come from `canonicalZone`, which is only for comparing (#602).
- **The canvas set (Lett · Rolig · Moderat · Terskel · Hardt) is recommended.** It is short. `15 min lett` reads well on a warm-up or a cool-down. It is also what the owner saw on the chosen A · Profil board.
- **The code's own set differs only at Z1.** The composer already round-trips `Z1 → restitusjon` (`composer-sentence.ts:29`). Either choice keeps the other word as a synonym.
- **Why not `VO₂maks` for Z5:** Coggan Z6 (anaerobic) and Z7 (sprint) also declare zone 5, and "VO₂maks" would be wrong for them.
- **Why not `Hard` for Z5:** it is the Effort Word's spelling (D4).

### D2 · Recipe band labels vs canonical words

- **The word is primary on every derived surface.** That covers I dag rows, the Profil legend, titles, the notation facet, Planned vs Done sentences and the Effort pill.
- **The band code is a secondary caption.** It appears only where the athlete's own recipe is the subject: the intensity popover, the training settings table, and a chip whose stored label is a code.
- **On a Daniels E band the athlete sees "Rolig", captioned "E" in the popover.** Codes differ by recipe (`E` / `Z2` / `I-2`), so they can't be the shared vocabulary. #180 already forbids a bare single letter.
- **A chip keeps what was authored when it is a code.** `Z4`, `T` and `I-4` are the athlete's own writing (ADR 0089). It shows the word when the stored label is a word in any language. So `threshold` and `terskel` both read **Terskel**.
- **The notation facet becomes the word:** `4 × 6 min @ 4:40 /km · Terskel`. Today it reads `· Z4`.
- **The session title uses the word:** `Terskel 6 × 1000 m`. This retires `Threshold` (`session-title.ts:49`).

### D3 · 7-zone and 3-zone recipes

Each band's declared zone (`ZoneBand.zone`) gives its word and colour.

| Recipe | Band → zone → word |
|---|---|
| `coggan-power-7` | Z1→1 Lett, Z2→2 Rolig, Z3→3 Moderat, Z4→4 Terskel, Z5/**Z6/Z7→5 Hardt** (`recipes.ts:47-66`) |
| `daniels-pace-5` (run default) | E→2 Rolig, M→3 Moderat, T→4 Terskel, I→5 Hardt, **R→ none** |
| `norwegian-threshold-run` | E 2, M 3, sub-T **and** T 4 Terskel, I 5, R none |
| `stryd-run-power-5` | **Z1→2, Z2→3, Z3→4, Z4→5**, Z5 none (`recipes.ts:319-342`) |
| `css-3` | Z1→1, Z2→2, **Z3→4 Terskel** (`recipes.ts:353-375`) |
| `css-5`, `friel-hr-5-*`, `olt-hr-5-*` | 1:1 |

- **There are no Z6 or Z7 words or colours.** The ladder has five steps (#601: 28/44/60/80/100 %). A 7-zone band reads as its declared zone, and its code (`Z6`) survives only as the caption (D2).
- **Off-axis bands** (Daniels R, Stryd Z5) have no declared zone, because ADR 0042 §7 keeps neuromuscular work off the metabolic axis.
  - **For drawing and words** they read as zone 5, Hardt, with provenance `convention`. This is what `bandStep` already does (`zone-equivalent.ts:77-79`, clamping index + 1).
  - The reason: R is not *unresolvable*, so it must not draw hatched.
  - **`canonicalZone` and load still follow ADR 0042 §7.** The drawing is not the load axis.
- **A 3-zone recipe needs no special case.** `css-3`'s top band draws and reads as Terskel. The named substitution (ADR 0045 §3) stays in pricing copy only.

### D4 · Effort Word: its own three-step scale, derived from zone through one table

- **#602 settled the shape.** `summary.effort` is the authored Effort Word first, else derived from `summary.zone`.
- **What this ticket decides is where each scale is shown.**

| Surface | Shows |
|---|---|
| A session with a resolved `summary.zone` (I dag pill, week rows, drawer) | **the zone word** (Terskel) |
| A Simple Activity (no zone, ADR 0015) | its stored Effort Word |
| A lift given *For sliten i dag* (#575) | its stored Effort Word (rolig) |
| Aggregates: the start card effort bar, the week sketch, `day-rule` hardest | Effort Word buckets |
| Unresolved zone, no stored word | nothing (as today) |

- **The one table stays `effortWordOfZone`:** 1–2 rolig, 3 middels, 4–5 hard. It moves to `zones/words.ts` next to `ZONE_WORDS`, and no other table exists.
- **The stored values `rolig | middels | hard` don't change.** No migration is needed.
- **Effort Words never take zone colours.** They keep `primary` at opacity steps (`__start-option-card.tsx:181`), because they are not a zone.
- **Effect:** "Terskel reads Hard on I dag" goes away, and the I dag pill only says *Hard* for a Simple Activity.
- **Owner (D4b):** whether the Effort Word's *display* reuses zone spellings (Rolig · Moderat · Hardt) or keeps Rolig · Middels · Hard. See §6.

### D5 · Notation vocabulary and how a legacy word is read

**One synonym table.** It is `zones/words.ts` `ZONE_SYNONYMS: Record<string, TrainingZone>`, matched lowercased and trimmed. It replaces `session-profile.ts:77-100` and `workout-sentence.ts:156-174`, and `labels.ts:5913-5937` keeps only display words.

| Zone | Synonyms (NB + EN, stored or typed) |
|---|---|
| 1 | lett, restitusjon, recovery, oppvarming, oppv, warm-up, warmup, nedjogg, nedkjøling, cool-down, cooldown |
| 2 | rolig, langtur, langkjøring, easy, endurance, aerobic, zone2 |
| 3 | moderat, tempo, moderate, steady |
| 4 | terskel, under terskel, threshold, sub-threshold, subthreshold |
| 5 | hardt, hard, maks, max, maximal, intervall, interval, intervals, vo2max, vo2 max, vo₂ max, anaerobic |

**Reading a stored `zoneLabel`**, in order:
1. **An exact band label in the athlete's recipe** (`Z4` on Coggan, `T` on Daniels) gives that band. Provenance is `authored`.
2. **A synonym** gives its Training Zone, then `bandForZone` gives the band. Provenance is `convention` (#602 invariant 6). This fixes `Z2` and `threshold` on `daniels-pace-5` (#614).
3. **`z1…z7`** gives the zone, clamped to 5, then `bandForZone`. Provenance is `convention`.
4. **Anything else** is `unreadable-target`, drawn hatched.

**Writing changes:**
- **The writing line stores the canonical word, not a code.** `terskel` is stored as `{kind:'zoneLabel', label:'terskel'}`, and so is the day stamp's `rolig`.
- **Why:** a code collides with recipe band labels. Stored `Z4` on a Stryd athlete is the band Z4, which is **zone 5**. Stored `Z2` from the day stamp on Stryd is **zone 3**. On `css-3`, a typed `moderat` → `Z3` resolves to the CSS band, which is **zone 4**.
- **No recipe uses a Norwegian word as a band label, so a word never collides.**
- **Stored labels never change** (GLOSSARY *Intensity Target*). Legacy `Z1…Z5` rows from the writing line keep rule 1, which is right for every 1:1 recipe. The collision cases are a new ticket (§7).

### D6 · Colour tokens

**Rules**
1. **Five mark tokens, `--zone-1…5`, in OKLCH, with `.dark` values.**
   - One tint per zone, `--zone-N-tint: color-mix(in oklab, var(--zone-N) 30%, var(--card))`.
   - Plus `--zone-rest` and `--zone-unresolved`.
2. **Colour is the third channel, after the word and the height.**
   - **Text never takes a zone colour**; there are no zone ink tokens. This is the same rule as track marks (`design-system.md:55-57`).
   - So marks follow the design system's mark rule (`track-bike` is 2.52:1) and not text AA.
   - The floor chosen here is **≥ 2.0:1 against `card` in light mode** and **≥ 4.4:1 in dark mode**.
3. **Salience rises with the zone in both themes.**
   - Light mode: Z5 is the darkest ink.
   - Dark mode: Z1 is the dimmest, so an easy session doesn't shout.
   - Yellow peaks at Z3 in both, because yellow is light by nature.
4. **Hue stays cool → warm** (blue, green, yellow, orange, red), as on every watch and platform athletes know (Apple *Familiarity*).
5. **Zone colours are only for zones.** The share rings on `__prototype-variant-g.tsx:354` move to `primary`/`phase-*`.

**Values** (computed with a script in the scratch dir: OKLCH → sRGB with gamut clipping, WCAG 2 luminance, OKLab ΔE, Machado 2009 CVD at full severity)

| Token | Light | hex | on `card` | on `bg` | Dark | hex | on `card` | on `bg` |
|---|---|---|---|---|---|---|---|---|
| `zone-1` | `oklch(0.72 0.10 245)` | `#6dabdf` | 2.46 | 2.29 | `oklch(0.62 0.10 245)` | `#4e8cbe` | 4.96 | 5.47 |
| `zone-2` | `oklch(0.76 0.13 165)` | `#4fcb9c` | 2.03 | 1.89 | `oklch(0.80 0.13 165)` | `#5ed8a9` | 10.11 | 11.14 |
| `zone-3` | `oklch(0.78 0.155 85)` | `#e4ae1a` | 2.02 | 1.88 | `oklch(0.89 0.14 88)` | `#ffd66f` | 12.82 | 14.13 |
| `zone-4` | `oklch(0.64 0.17 50)` | `#d96604` | 3.57 | 3.33 | `oklch(0.74 0.16 50)` | `#f98942` | 7.37 | 8.12 |
| `zone-5` | `oklch(0.52 0.19 25)` | `#be222a` | 6.08 | 5.66 | `oklch(0.62 0.19 25)` | `#e24947` | 4.48 | 4.94 |
| `zone-rest` | `oklch(0.86 0.006 214)` | `#cdd2d3` | 1.53 | – | `oklch(0.36 0.01 217)` | `#373e41` | 1.65 | – |
| `zone-unresolved` | stripes of `muted-foreground` 45 % (as `shape-strip.tsx:22`) | | | | same | | | |

- **The dark `zone-3` is clipped to C 0.13 by the sRGB gamut.**
- **On `bg`, light Z2 and Z3 sit at 1.88–1.89.** The Profil sits on `card` everywhere it is drawn. The I dag row sits on `card` too.

**Tints** (`foreground` text on `--zone-N-tint`, 30 % in oklab)

| | Z1 | Z2 | Z3 | Z4 | Z5 |
|---|---|---|---|---|---|
| Light tint | `#d3e6f6` 15.4 | `#d0f0e1` 16.2 | `#f8e8c7` 16.2 | `#f8d3be` 14.1 | `#f3c2bd` 12.5 |
| Dark tint | `#253846` 11.7 | `#2b4b40` 9.3 | `#514a34` 8.5 | `#51382a` 10.4 | `#4d2a28` 12.1 |

Every chip passes AAA. The tint moves from `srgb` at 22–26 % (`score-stanza.tsx:262-266`) to `oklab` at 30 %, so the five tints differ more (minimum ΔE 0.043, was ≈ 0.03).

**Separability.** Minimum OKLab ΔE over **all ten pairs**, since any two zones can sit side by side:

| Ramp | normal | protan | deutan | tritan | Min vs `card` (light) |
|---|---|---|---|---|---|
| today (hex, light) | 0.097 | 0.079 | **0.057** (Z3–Z4) | 0.032 (Z1–Z2) | 2.04 |
| canvas (#601) light | 0.135 | 0.099 | 0.106 | 0.089 | **1.75** |
| **proposed light** | **0.144** | **0.118** | **0.126** | 0.056 (Z1–Z2) | **2.02** |
| **proposed dark** | **0.145** | 0.089 (Z2–Z3) | **0.116** | **0.117** | 4.48 |

- **Today's Z1 and Z2 have the same lightness.** Their contrast with each other is 1.01, which is why a Z1 cool-down and a Z2 warm-up read as one colour in grey.
- **The proposed ramp keeps Z2–Z4 and Z4–Z5 apart under deuteranopia** (0.153 and 0.126), the warm-up-vs-reps and threshold-vs-VO₂ pairs. Today's Z3–Z4 is 0.065.
- **The weakest pair is Z1–Z2 under tritanopia** (0.056, about 0.01 % of people). Height (28 vs 44 %) separates them.

**Mini 12 px (#601 `mini`).** The steps are 1.4 / 3.4 / 5.3 / 7.2 / 9.6 / 12 px (rest, Z1…Z5); at `row` 24 px they are 2.9 / 6.7 / 10.6 / 14.4 / 19.2 / 24.
- **At mini, height steps are about 2 px, so hue does most of the work.**
- A rendered check at DPR 2 (390 px wide, six sessions × full/row/mini, light/dark × normal/deutan/protan/greyscale) shows the proposed ramp keeps threshold reps, VO₂ reps and warm-ups apart in all four views. Today's ramp merges Z3/Z4 under deutan and Z1/Z2 in grey.
- A real phone is still needed (§6).

**Neighbouring tokens** (nearest by ΔE):
- `zone-5` ≈ `status-missed` (0.045). Planned vs done draws a missed rep as an empty dashed frame, never in `status-missed`, so they don't meet in the drawing.
- `zone-4` ≈ `track-run` (0.053). The I dag track dot sits beside a run's bars. This is accepted, because the dot is a 8 px circle and the bars are rectangles. Recorded here so no one "fixes" it by recolouring a track.
- `track-strength` (purple) is ≥ 0.12 from every zone, so the Profil's strength bar never reads as a zone.

### D7 · Units through ADR 0023's layer

The forms in `format.ts`, used everywhere:
- **Pace:** `4:40 /km`, `4:40–4:50 /km`, `1:45 /100 m` (en dash; a no-break space before the unit, `NO_BREAK_SPACE`, `format.ts:661`).
- **Power and heart rate:** `238–263 W`, `170 bpm`, open ends `168+ bpm` / `≤ 138 W`.
- **Speed:** `31,2 km/t`.

New formatters are `formatSwimPaceRange`, `formatPowerRange`, `formatHrRange` and `formatNbSpeed` (absorbing `nbSpeed`).

Call sites removed from ad hoc formatting: `zone-equivalent.ts:299-303,306-307,336-337,385-391`, `composer-sentence.ts:62-63` (the composer *reads* its own output, so its parser must accept `–`/`-` and both spacings, as `format.ts:418` already does), `row-content.ts:391,529-530,547-548`, `sessions.$sessionId.tsx:1676,1947`, `plan.prototype.tsx:203`, `labels.ts:6516`.

`/100m` becomes `/100 m`, matching `labels.ts:6516` and the space before `/km`.

## 3. Migration of call sites

All of this lands in #602's one release, beside the reader.

| Today | Becomes |
|---|---|
| `session-profile.ts:77-100` `zoneLabelToZone` | `zones/words.ts` `zoneOfLabel` over `ZONE_SYNONYMS`. `easy` becomes 2, and `interval`/`sub-threshold`/`steady`/`aerobic`/warm-up words gain a zone. |
| `workout-sentence.ts:156-174,625-628` | Reads `ZONE_SYNONYMS` and stores the canonical **word**. |
| `day-stamp.ts:45` `'Z2'` | `'rolig'`. #606 re-stamps future days anyway. |
| `composer-sentence.ts:28-34` | `zoneWord(zoneOfLabel(label))`. |
| `labels.ts:5913-5943` `zoneLabelWord` | Synonym → `ZONE_WORDS[zone]`; a code passes through. `tempo`, `maks`, `intervall`, `under terskel` and `oppvarming` stop being display words. |
| `session-title.ts:49-52` | `zoneWord(step.zone)` from the reading. |
| `workout-notation.ts:1277-1278` facet `Z${n}` | `zoneWord`. |
| `effort-word.ts` | `effortWordOfZone` moves to `zones/words.ts`; `readEffortWord` → `summary.effort` (#602). |
| `__calm-today.ts:169` and the week rows | `summary.zone` available → `zoneWord`; else `summary.effort` → `L.effort`. |
| `labels.ts:326-330, 2829-2833, 4334-4338` quality mix | Stay **session-kind** words (tempo · terskel · VO₂maks). They name a Quality Session, not a zone, and the mix admits only 3–5. `QUALITY_ZONE_PLAIN_LABELS[5]` "veldig hard" becomes "VO₂maks", so there are two lists, not three. |
| `labels.ts:1721,6916-6919` "rolig i sone 2" | Keep. It is prose, and it uses the Z2 word. |
| `tailwind.css:183-187, 316-320` | New `:root` and `.dark` values, plus `-tint`, `zone-rest` and `zone-unresolved`, all mapped in `@theme inline`. |
| `shape-strip.tsx`, `profile-bars.tsx` | Both retire into the one Profil component (#601), which reads `bg-zone-N`, `bg-zone-rest` and the hatch. |
| `score-stanza.tsx:261-267` | `bg-zone-N-tint`. |
| `__season-chart.tsx:214-218` | Unchanged class names; new values. |
| `__prototype-variant-g.tsx:354-355,839-844` | Off the zone tokens. |
| `__intensity-popover.tsx:124-127,343` | Chip shows the band code captioned with `zoneWord(band.zone)`; the tint is `-tint`. |

**Tests that pin the old words.** These need updating in the same PR: `labels.test.ts`, `labels.token-sentence.test.ts`, `labels.workout-detail.test.ts`, `workout-notation.test.ts`, `score-stanza.test.tsx`, the composer tests, and the effort-word tests.

## 4. GLOSSARY changes

- **Training Zone.** Add: "Each zone has one word, used everywhere: *Lett, Rolig, Moderat, Terskel, Hardt*. A recipe band reads as the word of the zone it declares; its code is a caption." Add: "Off-axis bands (Daniels R, Stryd Z5) draw and read as 5 by convention; ADR 0042 §7 still keeps them off the load axis."
- **Effort Word.** Replace "How hard a Simple Activity is meant to be or was". The new text: "A three-step scale (_rolig_, _middels_, _hard_), authored on a Simple Activity or a lift, else derived from the session's zone by `effortWordOfZone` (1–2, 3, 4–5). Shown only where no zone is (a Simple Activity) or as a bucket in a total. Never shown beside a zone word, and never coloured as a zone." Keep: "nothing converts it into a zone".
- **Intensity Target.** Add: "The writing line stores a zone as its canonical Norwegian word, never as a code, because codes are recipe band labels."
- **Workout Notation.** Replace the example "a stored `easy` read as _Rolig_" with the synonym rule (D5).

## 5. ADR changes

- **ADR 0085 / `design-system.md`.**
  - Add a **"Zone"** row to the app-only roles: `zone-1…5`, `zone-N-tint`, `zone-rest` and `zone-unresolved`, with rules 1–5 of D6 and the contrast table.
  - Delete the "Older app tokens" sentence (`design-system.md:78`).
- **ADR 0089** (the token sentence speaks Norwegian). Amend: zone words come from `ZONE_WORDS`, and the writing line stores the word (D5).
- **ADR 0045 §3.** Note that display, like pricing, reads a band's declared zone.
- **ADR 0023.** Add the D7 formatters. Its "not swim-aware" revisit is partly closed by `formatSwimPaceRange`.
- **ADR 0101 §3** (I dag shows an Effort Word). Amend: I dag shows the zone word when there is a zone (D4).

## 6. Owner choices

1. **Z1's and Z3's words.**
   - **Recommended: Lett · Rolig · Moderat · Terskel · Hardt** (the canvas set).
   - Option B: *Restitusjon* for Z1. The code already round-trips it and it can't be misread as "about as easy as rolig", but it is long and odd on a warm-up chip.
   - Option C: *Tempo* for Z3, which matches the plan's quality words. "Moderat" fits HR users (OLT I-3, "comfortably hard") better than "tempo".
2. **The Effort Word's display.**
   - **Recommended: keep Rolig · Middels · Hard.** It is a different scale, it is shown only where no zone is shown (D4), and "a hard climb is not Hardt" stays honest.
   - The alternative shows it with zone spellings (Rolig · Moderat · Hardt). That means fewer words, but a Z4 session counts into a bucket called "Hardt".
3. **Needs a real phone (390×844), not a choice but owed:**
   - the mini Profil at 12 px in daylight;
   - light Z2/Z3 at 2.0:1 on `card`;
   - dark Z3 next to the hatch;
   - the 41-bar row.

## 7. New tickets and fog

- **New ticket (bug, ready-for-agent once D5 lands).** Writing-line and day-stamp codes collide with recipe band labels.
  - `terskel` → `Z4` resolves to zone 5 on `stryd-run-power-5`.
  - The stamped `Z2` resolves to zone 3 on Stryd.
  - `moderat` → `Z3` resolves to zone 4 on `css-3`.
  - It needs a production count of `zoneLabel` `Z1…Z5` rows whose athlete is on Stryd or `css-3`. Then decide whether a migration rewrites them to words (they were never typed as codes, so the original intent is the word).
- **Fog: Coggan Z7 declares zone 5** (`recipes.ts:61-66`, "neuromuscular power"), **while Daniels R and Stryd Z5 declare none.** This is inconsistent with ADR 0042 §7. It doesn't change the drawing (D3), but it does change load and mix pricing. It belongs to the load side, not here.
- **Fog: OLT I-3/I-4 vs the word "Terskel".** Many Norwegian athletes call I-3 *terskel*. On `olt-hr-5-*`, I-3 reads "Moderat". Ask one OLT-trained athlete before shipping; if it bites, the fix is the band's declared zone, not the word.
- **Folds into #614:** D5 rule 2 is the fix for `Z2`/`threshold` on Daniels. Do it there, so it isn't fixed twice.
- **Folds into #602's release:** `recording-profile.ts:56` HR-on-power cut points (the placement function replaces it).
