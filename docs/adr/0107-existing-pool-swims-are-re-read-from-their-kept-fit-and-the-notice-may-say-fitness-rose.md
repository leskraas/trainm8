# Existing pool swims are re-read from their kept FIT, and the notice may say fitness rose

Status: Accepted · Issue #628 (found on map #600, analysis in #623) · Stacked on
PR #638, which fixed the parser and the load

**Applies
[ADR 0046](./0046-no-load-number-spans-incommensurable-training-tracks.md) §2's
Load Recompute Notice to a second correction**, and extends it in two ways: a
correction may **raise** CTL (§3), and a notice may be owed when CTL did not
visibly move (§2). **Confirms
[ADR 0012](./0012-disconnect-preserves-recordings.md) and
[ADR 0049](./0049-every-import-auto-saves-there-is-no-inbox.md)**: their
immutability is against source-side changes, and this is not one (§1). **Follows
[ADR 0036](./0036-tcx-trackpoint-stream.md)'s shape**: re-derive from bytes
already kept, on the Job Queue (ADR 0013), with no request to any provider.

## Context

Before #628, `parseFit` read a pool swim's pace over its timer time. The timer
counts the rest at the wall (FIT writes it as `idle` lengths), so an interval
swim read slow: the #628 fixture read 1:53.5 /100 m against 1:41.5 swum. sTSS
priced that pace. PR #638 made the parser read pace over active lengths and made
sTSS price the hours swum at that pace. New swims are right. Swims already
stored still carry the old pace, the old sTSS and the CTL built on it.

The issue's last acceptance criterion is "existing swims are recomputed with a
Load Recompute Notice". PR #638 left it open on four calls: which imports, the
copy, a CTL **rise**, and the UI checks. The owner asked for the calls to be
made from the ADRs and recorded here.

## Decision

### 1. Which swims: a stored pace that is the old parser's reading of the kept FIT

A swim is corrected when **all** of these hold:

- its discipline is `swim` and it has a kept original file (`ActivityFile`,
  format `fit`);
- one leg of that file starts within 60 s of the import, and is a swim with
  distance;
- the import's stored pace equals that leg's **timer pace** (rounded timer
  seconds over distance, what the old parser wrote), to 10⁻⁶ s/km;
- the leg's pace over active lengths differs from it (the file has lengths and
  rest).

The rule is a check on the number, not a guess at where it came from. It catches
every swim the old parser filed: an upload (`fetchedVia = 'upload'`), a mirror a
FIT refreshed (ADR 0096 §6), any later vendor FIT. It leaves alone a swim whose
pace is a provider's own reading:

| Import                                    | Kept FIT? | Stored pace                       | Corrected?                                                                   |
| ----------------------------------------- | --------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Upload, before #638                       | yes       | timer pace from `parseFit`        | **yes**                                                                      |
| Mirror refreshed from a FIT (ADR 0096 §6) | yes       | timer pace from `parseFit`        | **yes**                                                                      |
| Strava                                    | no        | Strava's `moving_time` / distance | no: no file, and Strava API gives no original                                |
| Intervals.icu, not yet harvested          | no        | Intervals.icu's `moving_time`     | no; the harvest (#547) keeps files but never changes metrics                 |
| Intervals.icu, harvested                  | yes       | Intervals.icu's `moving_time`     | only if that equals the FIT's timer time, i.e. the provider counted rest too |

The last row follows from the rule, and it is right: if the stored number is
exactly the rest-counting reading, it is wrong wherever it came from. A provider
pace that differs is that provider's reading, and replacing it with ours is a
choice of source (#623, ADR 0096), not this bug.

**No request goes out.** Everything is read from bytes already stored. Strava's
read budget (#637) and Intervals.icu's key budget are not touched, so nothing
needs to defer.

**A Recording the athlete has built on is corrected too.** ADR 0012 and 0049
protect history from the _source_ rewriting it. Here the bytes are the same; the
number was trainm8's misreading of them. Only `paceAvgSecPerKm` changes.
`durationSec` stays the timer time, as for every provider. Laps are not
re-written: stored lap edges stay as filed (rounded), and detection keeps them.

### 2. Who gets a notice: everyone with a corrected swim

The notice is owed when a swim's pace was corrected, even if CTL did not move
enough to show. The pace is a number the athlete read on the session (1:53 →
1:41 /100 m in the fixture). ADR 0008 forbids changing such a number silently.
This is the case for a swimmer with no CSS (no sTSS, so no CTL change) and for
one corrected swim (one swim moves a 42-day CTL by well under a point).

When the rounded CTL did not move, the notice leaves its movement line out. It
never prints "steg med opptil 0 — 3 → 3". The stored pair is then today's CTL on
both sides.

The strength notice (ADR 0046 §2) keeps its own rule: it is written only when
CTL moved.

### 3. A correction may raise CTL; the notice says which way

The notice was written for one correction, which only lowered CTL. This one only
raises it: moving pace is never slower than timer pace, and sTSS is
`hours swum × (CSS / pace)²`, which grows as pace gets faster (the fixture:
14.87 → 16.63 at CSS 1:30).

- **Direction is the correction's, declared.**
  `widestCtlMovement(before, after, 'rise' | 'fall')` finds the day CTL moved
  furthest **that way**. The recompute runs `recomputeLoadFrom` over the whole
  range, so other drift can move other days the other way; that is never
  reported as this correction's doing.
- **The line reads the sign.** "Kondisjonen **steg** med opptil 3 — 21 → 24 på
  det meste" for a rise, "**falt**" for a fall.
- **The size is the gap between the rounded figures it prints.** Before this,
  62.4 → 47.8 printed "falt med opptil 15 — 62 → 48": the size was rounded from
  the raw gap, so the sentence disagreed with itself. It now prints 14.

### 4. The copy

| Part        | Text                                                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kicker      | _Svømmeøktene er regnet ut på nytt_                                                                                                                                                                                                                                 |
| Explanation | _Når vi leste en bassengøkt fra klokkens egen fil, talte pausene ved kanten som svømming. Da ble tempoet lest for sakte og belastningen for lav. Nå teller bare lengdene du svømte. Treningen din er den samme; det som er endret, er at tallene måler den riktig._ |
| Movement    | _Kondisjonen steg med opptil {n} — {før} → {etter} på det meste_, or nothing (§2)                                                                                                                                                                                   |

Why these words:

- **"fra klokkens egen fil"** scopes it truthfully. A Strava swim did not move;
  copy that said "your swims" would claim it did.
- **"pausene ved kanten"** names the cause in the athlete's terms. Not "idle
  lengths", not "moving time".
- **"Treningen din er den samme"** is the strength notice's reassurance, and the
  point of a Load Recompute Notice: the app corrected itself, the athlete did
  nothing different.
- Its own kicker, not the strength one's: two notices can stand one after the
  other (the newest shows first), and each must say what it is about.
- No number in the explanation. The movement line carries the number, so the
  explanation stays true when there is none.

### 5. Where it shows, and the UI checks

**Where:** unchanged. The bar above the **Home Timeline**, now _Se hele
sesongen_. The calm _I dag_ (ADR 0101 §3) lists what it holds and shows no load
number; the notice explains a load number, so it belongs where that number is.
Adding it to _I dag_ would amend ADR 0101 for a one-time bar.

**What changed in the bar:** the movement line is optional (§2), and _Skjønner_
gets an invisible `after:` hit area to 44px (design system, ADR 0028). It was a
~26px pill.

**Checks run:** `break-ui` on the line: a rise, a fall, a huge rise (0 → 1235),
no movement, and the long explanation on 390 px. `mobile-native`: no new hover,
no new input, the button keeps `pressable` and gets `touch-manipulation` and
`select-none`. No motion was added, so `review-animations` has nothing to
review. **Needs a real phone:** the 44px target and the wrapped explanation in
both themes.

### 6. Mechanism

`app/utils/load/swim-pace-backfill.server.ts`, the `swim-pace-backfill` job.
Server boot enqueues it once; the job row is the "already ran" marker (as for
the NP and strength corrections). Per athlete: read CTL by date, write the
corrected paces in one transaction, `recomputeLoadFrom` the earliest corrected
swim's day, read CTL again, and record the notice (create-only on
`(athlete, kind)`).

It is retry-safe. A swim whose stored pace is already the pace swum still counts
as corrected, so a crash between the write and the recompute is healed by the
retry. The notice is create-only, so the first run's `ctlBefore` stands.

**The job keeps its own record of what it changed.** In the same transaction as
each athlete's paces, it writes `payload.corrected` on its own `Job` row:
`{ count, swims: [{ importId, athleteId, paceBefore, paceAfter }] }`, with paces
in s/km. When it finishes it logs the same count. A retry adds to the record and
never rewrites an entry, so the first run's old pace stands. The notice rows
alone could not answer "which imports, from what to what": they hold one CTL
pair per athlete.

No schema change and no migration. Nothing is seeded
(`production-seed-data.md`).

## Considered options

- **A migration that rewrites the paces.** Rejected: SQL cannot decode FIT, and
  a migration that parses would run the parser inside `prisma migrate deploy`.
- **Re-fetch the original from the provider.** Rejected: Strava's API gives no
  original file. Intervals.icu's harvest already keeps the originals it can get,
  and their metrics are the provider's, not ours (§1).
- **Correct every swim with a kept FIT, whatever its stored pace.** Rejected: it
  would overwrite Intervals.icu's own moving pace with ours, a change of source
  this bug does not ask for.
- **Notice only when CTL visibly moved** (the strength rule). Rejected for this
  correction: the pace on the session moved visibly even when CTL did not (§2).
- **Report the widest movement either way.** Rejected: unrelated drift in the
  recompute could then be explained as a swim correction (§3).
- **Show the notice on the calm _I dag_.** Rejected (§5).

## Consequences

- Every athlete who uploaded a pool swim with rest before #638 sees their swim
  pace get faster and their sTSS rise, and one notice on _Se hele sesongen_.
- **The before-count was replaced by the job's own record.** This ADR first
  asked for a read-only count of candidate swims in production before the
  deploy. The owner merged without it; instead the job records which imports it
  changed, with their old and new pace (§6). After the deploy, check the job row
  and the notice rows (read-only):

  ```sql
  SELECT status, attempts, lastError, payload FROM Job
  WHERE kind = 'swim-pace-backfill';

  SELECT kind, COUNT(*), AVG(ctlAfter - ctlBefore) FROM LoadRecomputeNotice
  WHERE kind = 'swim-rest-left-the-pace' GROUP BY kind;
  ```

  `payload.corrected.count` is the number of swims corrected, and each entry
  names the import and its pace before and after.

- Stored lap edges on old FIT imports stay rounded to whole seconds. Only new
  imports get unrounded edges. Re-writing old laps would re-run detection on
  history the athlete may have built on; it is not part of #628.
