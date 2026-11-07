# PR #688 Spec review (issue #433), head d1ba05f

**Verdict:** the PR matches the spec closely. All 12 ACs are implemented, with the Architecture overrides applied: `get_today` stays at revision 1 (the snapshot diff has no revision change), and the reasons are `no-home-place`/`beyond-forecast`/`forecast-unavailable`. All nine Architecture rules and all five critic build changes are in, except one. No critical or high findings.

## (a) Missing or partial
None found. Spot checks:
- `trainingTimeOf` replaces all five copies; `grep -rn "?? DEFAULT_TRAINING_TIME" app` hits only `athlete-schema.ts:96`.
- `HomePlace` is 1:1 with cascade (`prisma/schema.prisma`).
- The point is rounded and checked against the allowed area on write (`app/utils/home-place.server.ts:105-106`).
- Search goes by POST and requires sign-in (`app/routes/settings/hjemsted.tsx:60-68`).
- `readHomeTimeline` stays weather-free (`season.test.ts`).
- The card and `get_today` agree in a test (`app/routes/_home/index.weather.test.ts:83`).
- Stale data is served for up to 24 h, and fetches are cut at 2 s (`forecast.server.test.ts:120,154,167`).
- ADR 0105 has both rows. The privacy notice has the stored-data, recipient and retention lines.

## (b) Not asked for (scope creep)
1. **low**: `app/utils/user-data-export.server.ts:111-113` adds `HomePlace` to the data export. No spec line asks for this. It is benign and arguably required by GDPR Art. 20, so keep it but mention it in the PR. Verify: read the line.
2. **low**: `app/actions/session-summary.server.ts:18` reorders an import. It has nothing to do with #433. Verify: `git diff origin/main...HEAD -- app/actions/session-summary.server.ts`.
3. **low**: copy the spec doesn't ask for:
   - `app/utils/labels/privacy.ts:39` adds a lawful-basis line (Art. 6(1)(b)). The spec's privacy AC names stored data, recipients and retention, not a basis.
   - `app/utils/labels/meg.ts` adds `removed` and `outsideArea` status texts, and `labels/i-dag.ts` speaks "ingen nedbør" when it's dry. The spec's example is "0,6 millimeter nedbør", and Design §6 says "`0 mm` when dry".
   
   All of this is reasonable, but a human should approve the privacy-notice wording.

## (c) Implemented, but looks wrong
1. **low**: the spec says: "The last column is one fixed 2rem wide, so the weather keeps one right edge on session rows and free days alike (build change 3)". The code at `app/routes/_home/__calm-today-view.tsx:761` uses `minmax(2rem,auto)`, so it is not fixed. A wider mark (the text mark "Ikke gjort", `labels/i-dag.ts:671`) would widen that row's last column and move its weather edge. Today it is harmless: weather only shows from tomorrow on, where the marks are 24 px (planned) or 32 px (free). But it isn't the fixed column that was asked for. Verify: read line 761, and render a row with a missed mark under the weather layout.
2. **low**: the spec says: "the hour of today's first session not yet done". `app/utils/weather/forecast-hour.ts:105` skips only `completed` sessions. A `skipped` or `missed` session (`prisma/schema.prisma:1020`) still sets the day's Forecast Hour. Example: if the athlete skips today's 17:00 session in the morning, the card still shows 17:00 weather instead of falling back to _Vanlig treningstid_. Whether a skipped session counts as "not yet done" is a judgment call; it needs a decision or a test. Verify: add a `forecast-hour.test.ts` case with `status: 'skipped'`.
3. **info, not a defect**: two Design items are built differently, and each change is backed by a recorded Implement decision in the issue:
   - Design §5 says "added through the icon workflow" (the sprite). The glyphs are inline SVG in `app/components/weather-glyph.tsx`, because `other/**` is a guard file.
   - Design §9 says `type=search`. cmdk forces `type=text`, so the field uses `inputMode`/`enterKeyHint` instead.
   
   Neither is a finding, but a human should know about the deferred sprite change.

## Checked and correct
The row grid and narrow stacking, the card's hidden text, credit placement, the "Kommune · Troms" match line, field and option sizes, the widened `Credit.platform`, and the mocks all match the spec.
