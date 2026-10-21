# 610 — Short reps need a full-resolution stream: the Analysis Stream

Analysis for [#610](https://github.com/leskraas/trainm8/issues/610) on map #600.
Code references are to `main` at `a052d9a` (2026-10-21). Measurements were taken
on the #625 corpus: 174 of the owner's FIT files (Intervals.icu bulk export, runs
only, one athlete, one watch family), read from the private
`leskraas/trainm8-private`. Nothing from those files is copied here. It builds on
#603 (Activity Interval), #608 (Plan Mapping), #609 (detection v3), #624 (athlete
edits) and #625 (the 1 s corpus).

## Answer

- **Yes: an Activity Import keeps a 1 s Analysis Stream beside the ADR 0020
  display stream.** It is written once at ingest, from the raw stream the ingest
  already holds. Every analysis reads it: detection, Activity Interval figures,
  athlete edits and the mean-maximal curve. The display stream stays as it is
  (≤1000 samples, ≥5 s) and is drawn by the overlay. ADR 0020 is superseded by
  one new ADR (§7).
- **1 s, not 2 s.** 2 s recovers 75 % of the edge gain on short reps but only 3
  of the 7 extra exact rep counts. The difference in storage is about 6 kB per
  hour, which is not worth the loss.
- **Keep, never re-fetch.** Strava allows 1,000 reads a day for the whole app,
  and a connection can die. Kept bytes are the only durable source.
- **Strava imports get it too (owner, 2026-10-21):** *"Vi kjører full analyse,
  dette er et hobby prosjekt."* Strava's seven-day cache term (§6.2) was put to
  the owner and accepted as a hobby-project risk. No separate issue is filed.
- **Channels:** time-implicit, plus power, heart rate, speed, cadence, distance
  and altitude. No GPS, respiration, temperature or running dynamics: nothing
  reads them. Pace is always derived from mean speed and is never averaged in
  s/km.
- **One pure `intervalStats(stream, startSec, endSec)`** computes every
  interval figure that does not come from the device: device gap rows at
  ingest, engine rows in the detect job, and athlete rows at edit time. It reads
  the Analysis Stream, or the display stream where there is none, and then max
  values are `unavailable` (#602).
- **No "about 20 short reps" fallback.** Where only a coarse stream exists, v3
  runs as #609 decided. An estimated rep count was measured and does not clear
  the honesty bar (§5).
- **Gate before detection reads it:** v3's constants move from samples to
  seconds, and the scoreboard's 1 s variant must show 0 false claims at `high`
  with recall no lower than on the grid. Today it is 1/76 at 1 s against 0/76 on
  the grid.

Choices taken on the evidence and open to reopening: 1 s over 2 s, the channel
list, the binary encoding, no estimated-count fallback, and the release gate.

## 1. What the stream costs today (measured)

The ADR 0020 grid is `max(5, ceil(span/999))` (`app/utils/activity-stream.ts:45-46,81`).
Each bucket is the arithmetic mean (`:96-113`). Only power, HR and pace exist
(`:24`).

**Short reps: 29 sessions with work ≤60 s, 1,024 truth edges from real laps (v3\*, #609 prototype)**

| Stream | Found | At `high` | Reps exact | Edges ≤10 s | Boundary median / P90 |
|---|---|---|---|---|---|
| 1 s | 28/29 | 20/29 [51–83 %] | 9 | 630 (62 %) | 4 / 8 s |
| 2 s | 28/29 | 20/29 | 5 | 560 (55 %) | 4 / 10 s |
| 3 s | 28/29 | 19/29 | 3 | 445 (43 %) | 4 / 9 s |
| 5 s, no cap | 28/29 | 15/29 | 2 | 354 (35 %) | 4 / 16 s |
| grid (production) | 28/29 | 15/29 [34–69 %] | 2 | 354 (35 %) | 4 / 16 s |
| 15 s | 17/29 | 4/29 | 1 | 114 (11 %) | 3 / 17 s |

**Whole corpus: 97 structured, 76 unstructured**

| v3\* | At `high` | Reps exact | Edges ≤10 s | False claims, any grade | False claims at `high` |
|---|---|---|---|---|---|
| 1 s | 68/97 | 41 | 64 % | 52/76 | 1/76 [0–7 %] |
| 2 s | 69/97 | 36 | 61 % | 49/76 | 2/76 |
| grid | 67/97 | 33 | 50 % | 35/76 | 0/76 [0–5 %] |
| file's own laps | 93/97 | — | per-rep F1 88 % | — | 0/76 |

- **The claim ("this session has structure") barely needs 1 s.** Recall at
  `high` is 68 against 67. **The per-rep intervals do:** reps exact go from 2 to
  9 on short reps, and edges within 10 s from 35 % to 62 %. Those per-rep rows
  are what #603's engine layer, #608's mapping and #624's edits are built on.
- **The 5 s floor is the problem, not the 1,000-sample cap**, on this corpus.
  152 of 173 sessions sit at 5 s; the longest (185 min) sits at 12 s. On a 5 h
  ride the cap gives 19 s, worse than the 15 s row (inferred: no bike in the
  corpus).
- **v2 gains nothing from resolution.** All the gain belongs to v3.
- **Finer streams raise false claims at lower grades** (35 → 52 of 76). Lower
  grades ship empty (#609 §6.1), so only `high` matters, and that is the gate
  in §6.

## 2. Keep, or re-fetch at analysis time

| Source | Raw today | Can it be re-read later? |
|---|---|---|
| Strava | full-rate streams; only `time, heartrate, watts, velocity_smooth` requested (`app/integrations/strava/ingest.server.ts:294`) | Re-fetch only, at 100/15 min and 1,000/day for reads per app (Strava's rate-limit page, 2026-10-21). No original files exist. Dies with the connection. |
| intervals.icu | 1 s streams, same four channels (`app/integrations/intervalsicu/types.ts:76-79`) | Re-fetch at 5,000/day per key (`pacer.ts:5`), or decode the harvested FIT in `ActivityFile`. Garmin may block the harvest (`docs/agents/intervalsicu-fit-harvest.md`). |
| FIT upload | record rate (`app/utils/fit-parser.server.ts:269-296`) | Kept in `ActivityFile` since 2026-10-14 only. Earlier uploads kept nothing. |
| TCX / GPX | trackpoint rate | The whole XML is in `rawJson` (`activity-file-ingest.server.ts:137,153`). GPX gives HR only today. |

So re-fetching is not a durable analysis source, and decoding kept files covers
only some imports. The research doc's claim that Strava data sits in full in
`rawJson` (`docs/research/interval-detection-and-data-platform.md:1100-1103`) is
wrong for Strava: there `rawJson` is the activity summary
(`app/integrations/strava/ingest.server.ts:85-89`). It is true for TCX.

**Decision:** write the Analysis Stream at ingest for every source, from the
raw stream every ingest path already holds in memory. Every ingest goes through
`persistActivityStream` (`app/utils/activity-telemetry.server.ts:57-74`). Strava
create and sync call it directly (`strava/ingest.server.ts:468`) rather than
through `enrichImportTelemetry`, so the Analysis Stream is written in
`persistActivityStream`, and both tiers come from one raw stream in one place.
`ActivityFile` stays the kept original. It is not read for analysis, so how long
originals are kept, or where, can change later without touching analysis.

## 3. Resolution, format and storage (measured, 174 files, 161 h)

| Encoding | Per hour, median | 10,000 sessions |
|---|---|---|
| FIT file (kept in `ActivityFile`) | 97.7 kB | 914 MB |
| today's display-stream JSON | 11.6 kB | 96 MB |
| 1 s JSON, 6 channels | 105.8 kB | 917 MB |
| 1 s JSON, gzipped | 26.3 kB | 230 MB |
| **1 s, zigzag-varint deltas + deflate, 6 channels** | **12.1 kB** | **108 MB** |
| the same, power + HR + speed only | 5.6 kB | 48 MB |

- **Format:** one `ActivityAnalysisStream` row per Activity Import, 1:1 and
  cascade-deleted, mirroring `ActivityStream` (ADR 0012 and ADR 0096 apply the
  same way). It holds `resolutionSec = 1`, `sampleCount`, `channels`, `encoding`
  and one `Bytes` blob. It is a separate table, so overlay reads never load it.
  It is a fixed 1 s grid from session start: a gap of ≤3 s is filled from its
  neighbours (measured: the fill does not drive the results); a longer gap is
  `null`, as on the display stream. Smart recording (one record every few
  seconds) fills the same way; it is not in the corpus, so the spec checks it on
  one file.
- **Scales per channel:** speed 0.001 m/s, distance 0.01 m, altitude 0.1 m; power,
  HR and cadence as integers.
- **Cost:** about 12 kB per hour, the same as today's display stream. The volume
  size isn't in the repo (`fly.toml:12-14` sets none; `docs/deployment.md:87`
  makes 1 GB). At about 400 sessions per athlete-year, the Analysis Stream adds
  about 6–8 MB a year. The kept FIT files add about 40 MB, and they are what
  fills a volume first. That belongs to `ActivityFile`, not to this decision.
- **2 s was considered** (§1): it saves about half of 12 kB/h and loses 4 of the
  7 extra exact rep counts, and it would cap ADR 0054's mean-maximal windows at
  16 s instead of 8 s.

## 4. Channels

Present in the 174 files: cadence, HR, distance and speed in all of them;
altitude in 164; power in 144; respiration in 121; temperature in 106; running
dynamics in 7.

| Channel | Add? | Reader |
|---|---|---|
| power, heart rate | kept | detection, figures, NP, MMP |
| **speed** (replaces averaged pace) | yes | v3 reads pace even with power: dropping it cuts recall at `high` from 67 to 48 of 97. Figures: speed-averaged buckets halve the P90 speed error on short reps (2.3 → 1.3 %). |
| **cadence** | yes | checking prescribed cadence (the ticket's own reason) |
| **distance** | yes | interval distance from a real channel (#624 integrates 1000/pace today); distance-based records |
| **altitude** | yes | GAP/NGP, ascent per interval |
| GPS position | no | no reader; the most sensitive data in the file. Similarity is out of scope here (map fog). |
| respiration, temperature, running dynamics | no | no reader |

**Display stream fix in the same change:** each bucket's pace becomes 1000 ÷
the bucket's mean moving speed, not the mean of s/km
(`app/utils/activity-stream.ts:96-113`; the adapters at
`strava/ingest.server.ts:308`, `intervalsicu/ingest.server.ts:272` and
`fit-parser.server.ts:286-287`). Detection doesn't notice (±1 session), but rep
and recovery edges stop reading slow, by up to 5.5 % at P95 on a 19 s grid. The
engine's own pace means (`segments.ts:145`, `mine.ts:334`) move to speed in the
same change.

## 5. Interval figures, and the coarse fallback

**Measured on the truth lap windows, grid against 1 s:**

| Windows | Power P90 | Speed P90 | HR P90 |
|---|---|---|---|
| work ≤60 s | 1.1 % | 2.3 % | 0.1 % |
| work >60 s | 0.2 % | 0.9 % | 0.1 % |
| recoveries ≤60 s | 6.2 % | 5.5 % | 0.2 % |

- With the right window, the grid's power and HR are fine, but short recoveries
  and speed are not. Max values can't come from bucket means at all (#624 :270).
  On detected windows the edge dominates: P90 is about 13–14 % at every
  resolution. The grid's real cost is matching fewer reps: 158 against 287 at
  1 s.
- **Decision:** `intervalStats(stream, startSec, endSec)` is one pure function
  beside `activity-stream.ts`. It returns avg/max power, avg/max HR, speed as
  Σdistance ÷ moving time (or mean moving speed where there is no distance),
  cadence, ascent, and NP for windows of ≥10 min (#603 §3.4). It reads the
  Analysis Stream when there is one, else the display stream. On the display
  stream, max values are `unavailable` with a `coarse-stream` code and the other
  figures carry the stream's resolution (#602's no-zero rule). Device laps keep
  their own figures (#603); `intervalStats` fills only what the device didn't
  give.
- **Callers:** ingest (device-layer gaps), the detect job (engine rows;
  `detect-job.server.ts:134-165` loads the Analysis Stream instead of the display
  stream) and the edit action (athlete rows). Figures are computed once when a
  row is written, because the stream they come from never changes.

**Coarse-only fallback (measured, grid):**

| Rep count from | Exact | Within ±1 | Median error |
|---|---|---|---|
| v3\*'s own reps | 2/29 | 6/29 | 57 % |
| a blind periodicity block, untuned | 7/29 | 12/29 | 17 % |
| v3\* at 1 s, for reference | 8/29 | 10/29 | 29 % |

The grid holds the period: given the true block, the count is exact in 33 of 37
sets. Finding the block is what fails. "About N short reps" would be wrong by 3
or more in about half the sessions. That fails the bar #609 set (the claim is
the `high` grade; lower grades ship empty) and #602's no-zero rule, which asks
for a value or `unavailable`, not a guess. **Decision: no estimated-count
fallback.** Sessions with only a coarse stream run v3 as #609 decided, using
lap edges where the stream is coarser than 5 s (609 §2). After the backfill
(§6), the population that only has a coarse stream is small: FIT uploads from
before 2026-10-14 and imports whose connection is gone.

## 6. Detection, edits, profile, and rollout

- **Detection reads the Analysis Stream when there is one.** Before that
  switch, v3's sample-counted constants move to seconds:
  - `medianWindow: 5` samples (`structure-detection/constants.ts:29-30`);
  - `minSize = max(2, round(minSegSec/res))` (`segments.ts:257`);
  - `RESPONSIVE_EDGE_MIN_SEG_SEC`, which assumes 5 s (`constants.ts:81-89`).

  **Release gate:** `npm run detection:eval`'s 1 s variant shows 0 false claims
  at `high` on the 76 negatives, recall at `high` ≥ the grid's, and reps exact ≥
  the frozen 1 s row (41/97). The engine version bumps, and #609's backfill
  re-runs on the new input.
- **#624 edits** snap to 1 s. The split floor drops from 38 s on a 19 s grid to
  2 s, the steppers move by ±1 s, rows carry max values, and distance comes from
  the channel. Lap and length snapping (priorities 1–2) are unchanged. Where
  there is no Analysis Stream, the display grid applies as #624 wrote. This
  closes #624's open question 9 and the map's fog line *"Edits limited by the
  stream grid"*.
- **ADR 0054 §6 gains readable rungs from 8 s** at 1 s (≥8 samples). Its
  constant stays, as the ADR asked ("raise the fidelity, not this constant").
  Measured on running power, the grid's best 5 s reads −0.7 % low at the median
  and −20 % on the longest session. Moving profile analysis onto the Analysis
  Stream belongs to the profile effort, not to this map.
- **NP/TSS stay on the display stream.** NP on the grid matches 1 s (median
  0.0 %, −0.4 % at 19 s), so this gives no Load Recompute Notice.
- **Backfill.** It is one job, run from the oldest import first, and stops at
  the first source that answers:
  1. `ActivityFile` FIT (0 API calls);
  2. TCX/GPX `rawJson` (0 calls);
  3. intervals.icu streams (within the pacer's budget);
  4. Strava streams (≤1,000/day, after the rate-limit fix filed as a Do-now
     issue).

  An import that none of them can serve keeps its display stream only. A
  promoted Recording's Analysis Stream is written like its display stream (ADR
  0049's mirror rules; #603 §7: a source read, never an edit).
- **Order:** this ships before detection v3's switch to 1 s and before the
  athlete layer's 1 s snap. It needs nothing from the reader (#602).
- **Data export** (`user-data-export.server.ts:192`) includes the Analysis
  Stream, decoded to arrays.

## 7. ADR: supersede ADR 0020

Draft for the spec (number assigned when written):

> **Activity Stream in two tiers: a 1 s Analysis Stream beside the display
> grid.** Supersedes ADR 0020. Every Activity Import with telemetry keeps two
> streams, both written once at ingest from the same raw stream:
> - the **Activity Stream**, the bounded display grid (≤1000 samples, ≥5 s),
>   drawn by the overlay and read by NP/TSS;
> - the **Analysis Stream**, a fixed 1 s grid of power, heart rate, speed,
>   cadence, distance and altitude, stored as varint-delta + deflate bytes in its
>   own row (about 12 kB per hour).
>
> Detection, interval figures, athlete edits and the mean-maximal curve read the
> Analysis Stream. Pace is derived from speed in both tiers and is never
> averaged. A source that cannot give a fine stream leaves only the display
> stream, and readers say so rather than guessing.
>
> *Considered:* keeping one grid (it caps detection: reps exact 2/29 against 9/29
> at 1 s); re-fetching at analysis time (Strava allows 1,000 reads a day, and
> connections die); decoding kept files (only some sources have them); 2 s
> (loses 4 of 7 exact rep counts and saves 6 kB/h); gzip-JSON (2× the binary).
>
> *Consequences:* ADR 0054 §6 reads rungs from 8 s; ADR 0020's revisit note is
> closed; the display stream's pace is fixed to mean speed.

## 8. Vocabulary (for `GLOSSARY.md`, not yet on `main`)

**Analysis Stream**:
The full-resolution telemetry of an Activity Import: one sample per second of
power, heart rate, speed, cadence, distance and altitude, kept for analysis and
never drawn. Many imports have none. _Avoid_: raw stream, full-res blob, cold
tier

**Activity Stream** (amended): …the *display* telemetry… "Feeds the Telemetry
Overlay; analysis reads the **Analysis Stream** where one exists."

## 9. Out of this decision

- **Strava's rate limit** is wrong in code today: 600/15 min is assumed
  (`app/integrations/strava/rate-limit.ts:58-62`, ADR 0013), with no daily cap and
  no 429 handling. Strava's limit is 100/15 min and 1,000/day for reads. Filed as
  a Do-now issue; the Strava backfill waits on it.
- **Where `ActivityFile` bytes live** (SQLite now, Tigris per
  `docs/decisions/040-tigris-image-storage.md`) and how long they are kept: not
  this map's question.
- **Bike sessions:** none are labelled in the corpus. Bias in short power on
  bikes and v3's 1 s tuning on rides are unmeasured; this stays in the map's fog.
