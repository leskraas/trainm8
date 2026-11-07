# PR #695 — Security (by hand; security-review not run as a skill)
- Ownership: `computeEdit` reads the outline by `id` + `athleteId` inside the transaction; the track is looked up in that outline's rows, and the write's `trackId` comes from the computed preview, never from the form directly. `readSeasonAnchorChoices` filters by `athleteId`. `removeSeasonAnchorSegment` keeps `outline: { athleteId }`. No IDOR found.
- Stale confirm: digest covers summary, weeks, warnings, held, heldWeeks and write, recomputed in the same `$transaction` before the write; a week that began moves `firstUnbegunWeekKey`, which refuses (`week-lived`/`changes-lived-weeks`/`segment-lived`) or changes the digest. Mismatch writes nothing (server test pins it).
- `fromOffer`/offer hidden fields are re-validated and recomputed server-side; no trust in the client offer.
- Integrity: S1 (non-Monday week key accepted) — data integrity of the athlete's own plan, not cross-user. Medium.
- No new secrets, unauthenticated surface, injection, SSRF.
