# #635 probe (throwaway)

The scripts behind `635-device-fit-originals.md`. They read the device originals
in the private `leskraas/trainm8-private` under `detection/fit/originals/`, and
never copy anything out of them. They are kept here for the v3 build and the
Plan Mapping build to read; they are never merged.

- `census.mjs <files…>`: one row per file: device, firmware, created,
  `workout` / `workout_step` counts, laps with `wkt_step_index`, lap
  `intensity` values.
- `program.mjs <files…>`: runs each file's `workout_step` program and lines it
  up with the laps' `wkt_step_index`. Its repeat model has no "skip last
  recovery", so the two FR965 files with field 18 = 1 read `DIFF` (§2.3).
- `lapseq.mjs <files…>`: steps, laps (`index/intensity:timer:distance:trigger`)
  and non-alert events per file.
- `stats.mjs <files…>`: lap counts across files (short manual laps, same-index
  runs, laps after the program).
- `rawmsgs.mjs <file>`: every global message number in a file, read from the
  record headers, independent of the SDK's named messages.
- `laps.py`, `swim.py <decoded.json>` and `dump.mjs <file> <out.json>`: one
  file decoded and printed. The JSON `dump.mjs` writes holds coordinates; keep
  it out of any repository.
- `rerun635.ts` and `all635.ts`: the scoreboard re-run (§5). Copy them to
  `scripts/probe635/` on a `main` checkout and run
  `npx tsx scripts/probe635/all635.ts ../trainm8-private/detection/fit/originals ../trainm8-private/detection/fit`.
