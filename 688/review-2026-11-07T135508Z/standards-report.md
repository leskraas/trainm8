# PR #688 (closes #433): Standards review

Reviewed cold at head d1ba05f (`git diff origin/main...HEAD`, 9 commits, 62 files). I did not read the PR body or any factory comments. Paths below are relative to the worktree.

**Clean checks:**
- No guard file is touched: `.github/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `fly.toml` and `other/**` are all unchanged.
- No dependency changes: `package.json` and the lockfile are untouched.
- The migration (`prisma/migrations/20261107121046_a_home_place`) is schema only. It has no seed data, so `docs/agents/production-seed-data.md` holds, and it sorts last.
- `trainingTimeOf` replaces all five call sites named in ADR 0112 §3.
- The retention rows in ADR 0105, the amendment banners on ADR 0092 and 0101, the GLOSSARY entries (Forecast Hour, Day Forecast, Home Place, Reading widened), the privacy notice, the data export and the reason labels are all present.
- `get_today` keeps revision 1 and its snapshot is updated.
- Outbound URLs are fixed constants, with parameters set via `searchParams`, so there is no SSRF.
- The forecast cache key is the rounded point only, with no user.
- The Hjemsted loader and action both call `requireUserId`. Write and remove are scoped to the caller's own profile.
- Search POSTs fall under the global `strongRateLimit` (100/min/IP, `server/index.ts:121`).

The findings are grouped as hard violations (a documented standard broken), bugs, and judgement calls or smells. Tooling-enforced items (lint, types, formatting, hook deps) are skipped.

---

## A. Hard violations of documented standards

### A1. Search text and the user's location reach Sentry, despite "never logged". Severity: medium-high
- **Where:**
  - `app/utils/place-search/search.server.ts:47-63`: `fetch(url)` puts the text in the query string (`?sok=<text>`).
  - `app/utils/weather/forecast.server.ts:91-100` / `:121-126`: `?lat=..&lon=..`.
- **What it breaks:** ADR 0112 §2 says "The search text is never stored and never logged." The module docstring (`search.server.ts:7-9`) says the same. The privacy notice (`labels/privacy.ts`, the new retention line) promises "Det du søker på … lagrer og logger vi ikke."
- **Why it happens:** `server/utils/monitoring.ts` runs Sentry with `httpIntegration()`, the default native-fetch instrumentation, and `tracesSampler` at 1 in production. There is no `beforeSendSpan` or `beforeBreadcrumb` scrubbing. Outgoing fetch spans and breadcrumbs carry the full URL and query (`url.full` / `http.query`). So every place search sends the typed text to Sentry. Every I dag load also sends the athlete's rounded Home Place inside a transaction tied to that user's request.
- **Second consequence:** the privacy notice lists Sentry as receiving error and performance data. It does not say Sentry gets location or search text, so the notice is now inaccurate.
- **Why it matters:** this is the one privacy property the ADR states outright.
- **Fix:** scrub `sok`, `lat` and `lon` (or the two hosts) in `beforeSendSpan`/`beforeBreadcrumb`, or turn off fetch instrumentation for these hosts. Add a test.
- **Verify:** run with `SENTRY_DSN` set in production mode and inspect the transaction's `http.client` span. Or read `@sentry/node`'s `nativeNodeFetchIntegration` defaults, which record `url.full` including the query.

### A2. Weather glyphs are hand-drawn inline SVG, not the sprite `Icon`, and they duplicate sprite icons. Severity: medium
- **Where:** `app/components/weather-glyph.tsx:1-79` (the new component). It is also used by:
  - `app/routes/me.tsx:317-327`: `MeLink` `icon` widened to `IconName | React.ReactElement`.
  - `app/routes/settings/hjemsted.tsx:160-163` (map pin).
  - `app/routes/_home/__calm-today-view.tsx` (several places).
- **What it breaks:**
  - `.claude/skills/icon-workflow` ("Render via `Icon` component in app code"; raw SVGs live in `other/svg-icons`, added with Sly).
  - `docs/design/design-system.md:231` ("Icons … are the Tabler sprite `Icon`").
- **The author's reason:** the header comment says `other/**` is a guard file. That is true, but the guard rule says a human makes or approves such changes. It does not license a second icon system.
- **The duplication:** `other/svg-icons/sun.svg` and `moon.svg` already exist, are Tabler, and are used in `app/routes/resources/theme-switch.tsx:60-65`. `WeatherGlyph` redraws both inline (`weather-glyph.tsx:16-22`). That is duplicated code against an existing standard path.
- **Fix:**
  - Use `<Icon name="sun"|"moon">` now.
  - Ask a human to add the other six Tabler glyphs (plus Hugeicons `sun-cloud-01` and Tabler `map-pin`) via Sly.
  - Until they land, keep the inline set explicitly temporary, with a tracked follow-up issue.
- **Verify:** `ls other/svg-icons | grep -E 'sun|moon'`; `grep -n "name=\"sun\"" app/routes/resources/theme-switch.tsx`.

### A3. A new athlete write operation is outside the typed-action registry, and ADR 0112 does not record the exception. Severity: medium (judgement-adjacent)
- **Where:** `app/routes/settings/hjemsted.tsx:60-96`. The route's own intents `set` and `remove` call `setHomePlace` / `removeHomePlace` directly.
- **The standard:**
  - ADR 0092's title and §1: "Every athlete operation is one typed action … in `app/actions/`".
  - §9: "the registry grows slice by slice".
- **The gap:** the route comment (`hjemsted.tsx:7-9`) cites §9 to keep it web-only. But ADR 0112, which amends 0092 elsewhere, never states that the Home Place write is deliberately outside the registry.
- **What domain.md asks:** `docs/agents/domain.md` ("Flag ADR conflicts") asks for this kind of departure to be surfaced in the decision record, not only in a code comment.
- **Fix:** either define `set_home_place` / `remove_home_place` as web-only `write` actions (the cheap path, which also gets parity-test coverage), or add a line to ADR 0112 recording the exception.
- **Verify:** `grep -n "set_home_place\|home_place" app/actions/registry.server.ts` returns nothing.

### A4. MET credit tap target is about 16px. Severity: low
- **Where:**
  - `__calm-today-view.tsx` `MetCredit`: the `<a>` is `text-caption` with no `min-h-11`.
  - `hjemsted.tsx:265-272` (Kartverket credit): same.
- **What it breaks:** `docs/design/design-system.md:243` ("44px touch targets on phones (ADR 0028)") and the `mobile-native` skill.
- **Verify:** inspect the link box at 375px; its height equals the caption line height (16px).

### A5. CLAUDE.md's UI-craft process (review-animations table, mobile-native checklist, break-ui, "what still needs a real phone"). Not verifiable from the code
This is a process requirement for the PR description, which I was told not to read. The orchestrator should check it.

---

## B. Bugs

### B1. No negative caching: a MET outage costs every I dag load (and every `get_today`) the full 2s timeout. Severity: medium
- **Where:** `forecast.server.ts:63` (`readForecast(...).catch(() => null)`) and `:101-134`. Nothing is cached on failure.
- **What happens:** while MET is down, slow, or answering 403/429 (MET's terms ask clients to back off on 429), each request with no cached value waits for `AbortSignal.timeout(2000)` and then retries on the next request.
- **Conflict with the stated contract:** this contradicts the module's "Never a wait" and ADR 0112 §3 ("never an error and never a wait"). In practice it is "at most 2s, on every load". It also keeps hammering MET while throttled, against MET's terms of service.
- **Fix:** cache a short-lived "unavailable" marker per point (for example 1–5 minutes), and honour `Retry-After` on 429.
- **Verify:** add a test in `forecast.server.test.ts` where the MSW handler delays 3s. Call `readDayForecasts` twice and assert that the second call does not hit the handler.

### B2. Week rows mix 1-hour and 6-hour precipitation with no unit of time. Severity: medium (correctness of what is shown)
- **Where:**
  - `forecast.server.ts:190-215` and `:237-245`: `precipitationMm` is the step's own period, 1h for about 60h and then 6h.
  - `__calm-today.ts` `calmWeather` and `labels/i-dag.ts` `WEATHER_LABELS.precipitation` / `spoken`: they render "0,6 mm" / "0,6 millimeter nedbør" with no period.
- **What the athlete sees:** on a Monday, Tuesday and Wednesday show hourly totals and Thursday to Sunday show 6-hour totals in the same column. A 6h figure reads as about 6 times wetter than an equal hourly rate.
- **Partial documentation:** the schema doc in `day-forecast.ts` and `day-forecast.server.ts` notes the period, but the screen and the spoken sentence do not. The MCP description (`get-today.server.ts`) says only "precipitation in mm". `get_today` only ever returns today, which is usually hourly, so the MCP exposure is low.
- **Fix:** either carry `periodHours` and label it ("per 6 t"), or normalise.
- **Verify:** add a `forecast.server.test.ts` case with a day-4 hour, then check the rendered row text.

### B3. `setHomePlace` creates an AthleteProfile without the cardio discipline profiles every other creation path ensures. Severity: low-medium
- **Where:** `app/utils/home-place.server.ts:64-69` re-implements the `athleteProfile.upsert({create:{userId}})` from `getOrCreateAthleteProfile` (`athlete.server.ts:150-162`). It skips `ensureCardioDisciplineProfiles`, which `updateAthleteProfile` (`:190-196`) also calls.
- **When it matters:** only for a user with no profile yet who goes to Hjemsted first. That leaves a profile in a state no other path produces.
- **Also:** the two writes are not in a transaction.
- **Smell:** Duplicated Code.
- **Fix:** call `getOrCreateAthleteProfile(userId)` (or a slim variant that ensures the profiles).
- **Verify:** add a test calling `setHomePlace` for a fresh user, then `prisma.disciplineProfile.count({where:{athleteProfile:{userId}}})`.

### B4. Live regions hidden while empty may not announce. Severity: low (accessibility)
- **Where:**
  - `hjemsted.tsx:186-188`: `<p role="status" className="… empty:hidden">`.
  - `:254-262`: `aria-live="polite" … empty:hidden`.
- **The problem:** an element that is `display:none` is not in the accessibility tree. When it gains content and becomes visible, many screen-reader and browser pairs (VoiceOver on iOS in particular) do not announce it. So "Lagret …", "Søker …" and "Fant ingen steder …" can go unspoken.
- **Fix:** keep the region rendered. Use `sr-only`/min-height instead of `empty:hidden`, or put only the inner text behind the condition while the region stays visible.
- **Verify:** check manually with VoiceOver; this needs a real phone.

### B5. Skipped sessions still set the Forecast Hour. Severity: low (judgement on spec)
- **Where:** `app/utils/weather/forecast-hour.ts:44`. Only `'completed'` is passed over. `WorkoutSession.status` is also `skipped` | `missed` (`prisma/schema.prisma:1020`).
- **What happens:** a skipped 06:00 session tomorrow makes the day's forecast 06:00, even with a 17:00 session still planned.
- **Glossary:** it says "first session not yet done". It is ambiguous whether skipped counts as done, but showing weather for a session the athlete has already declined is likely wrong.
- **Smell:** `status: string` is Primitive Obsession (no union type).
- **Verify:** add a `forecast-hour.test.ts` case with `[skipped 06:00, scheduled 17:00]`.

### B6. The `readAthleteForecast` contract is inconsistent. Severity: low
- **Where:** `athlete-forecast.server.ts:32-34`.
- **What happens:** with empty `dayKeys` it returns `new Map()` before checking the Home Place. The docstring says "No Home Place: null".
- **Impact:** unreachable today, because both callers pass today. A future caller would read "has a place, no forecast".
- **Verify:** read the code at those lines.

### B7. The Home Place area check is a coarse bounding box, and the error text says "utenfor Norge". Severity: low
- **Where:**
  - `app/utils/home-place.ts:28-44`: `HOME_PLACE_AREA` (lat 57.5–81.5, lon −9.5–35) contains most of Sweden and Finland, including Stockholm and Helsinki.
  - `home-place.server.ts:23-31`: `name`, `kind`, `municipality` and `county` are accepted as free text from the client.
- **What it allows:** a forged POST stores "Oslo" with Helsinki's point.
- **Conflict:** ADR 0112 §2 says the server "refuses a point outside the area Kartverket's register covers". `labels/meg.ts` `outsideArea` tells the user "ligger utenfor Norge".
- **Impact:** the athlete's own data only, so no security impact. But the check does not do what the ADR says.
- **Fix:** either reword the ADR and the label, or re-resolve the match server-side by `stedsnummer`.
- **Verify:** `isInHomePlaceArea({latitude:59.33, longitude:18.07})` returns true.

### B8. Hour label is wrong for timezones with a non-whole-hour offset. Severity: low
- **Where:** `forecast-hour.ts:63-70` floors to the UTC hour, and `__calm-today.ts` `calmWeather` prints the local hour of that instant.
- **Example:** for Asia/Kolkata, a 22:00 session reads "kl. 21".
- **Impact:** rare for a Norway-only Home Place, but the Athlete Timezone is independent of it.
- **Verify:** add a `forecast-hour.test.ts` case with `timezone: 'Asia/Kolkata'`.

---

## C. Judgement calls and smells (baseline)

| # | Where | Smell | Severity | Note |
|---|---|---|---|---|
| C1 | `app/components/weather-glyph.tsx:48-51,65`; used in `me.tsx`, `hjemsted.tsx` | Mysterious Name | low | `WeatherGlyph` also serves `'map-pin'`, a non-weather icon, in Meg and Hjemsted. This follows from A2. |
| C2 | `__calm-today-view.tsx` `DayGutter`, `WeekSession` padding, `mainCell`, `ROW` vs `ROW_WITH_WEATHER` | Repeated Switches / Shotgun Surgery | low | `withWeather ? '@max-[20rem]…' : '@max-[17rem]…'` is repeated in 4 places, with a nested ternary in `DayGutter`'s `show` class. One `layout = withWeather ? WIDE : NARROW` object holding `{row, stackAt, padStacked, hiddenStacked}` would remove it. |
| C3 | `__calm-today-view.tsx` `withWeather` + `weather` threaded through `FreeDay`/`WeekSession`/`DayGutter` | Data Clumps | low | The two always travel together. |
| C4 | `app/actions/run.server.ts:101-104` | Repeated Switches | low | `c.platform !== 'met-norway' &&` special-cases one source inside a generic sort. A `derived` lookup that is total over `CreditSource` would avoid the next special case. |
| C5 | `app/utils/labels/i-dag.ts:681-690` and `WEATHER_LABELS.spoken` | Duplicated Code | low | `spoken` re-implements `nbSigned`'s rounding and sign logic ("minus N"). The repo already has an ad-hoc decimal-comma formatter (`labels/vocabulary.ts:453`, `labels/sesong.ts:701`), so a third copy is added rather than one shared `nbDecimal`. |
| C6 | `app/routes/_home/week-weather.server.ts:17` + `athlete-forecast.server.ts` + `readHomeTimeline` | Duplicated reads | low | `/` now reads the timezone and the profile again, beside `readHomeTimeline`'s own read. That is 2–3 extra queries per I dag load. It is acceptable given ADR 0112 §3's separation, so this is a note only. |
| C7 | `app/utils/home-place.server.ts:1` (zod/v3) vs the new weather and place-search modules (zod/v4) | Inconsistency | low | ADR 0092 §1 uses v4 for actions and v3 for Conform forms. This schema is neither a Conform form nor an action. Pick one. |
| C8 | `forecast.server.ts:136-140` `cachedForecast` | Middle Man / reaching into cachified internals | low | It reads the raw `CacheEntry` beside cachified to recover `lastModified`. This works, but it couples to cachified's entry shape. An alternative is keeping `lastModified` in the value, which is already done, and using `context.background`/the previous value if cachified exposes it. |
| C9 | `app/utils/weather/forecast.server.ts` docstring "Never a wait" | Doc vs behaviour | low | See B1. |
| C10 | `labels/i-dag.ts` `WEATHER_LABELS.hour` via `localTimeOfDay().slice(0,2)` | Primitive Obsession | low | The hour is passed as a 2-character string sliced from `HH:MM`. That is fragile if the format ever changes. |

No issues found with: Feature Envy, Speculative Generality (one adapter and no provider interface, as ADR 0014 asks), Message Chains, Refused Bequest, or Divergent Change.

---

## Summary by severity
- **Medium-high:** A1 (Sentry gets search text and the user's location, despite "never logged" in the ADR and the privacy notice).
- **Medium:**
  - A2: inline icon system instead of the sprite; sun and moon duplicate existing sprite icons.
  - A3: Home Place write is outside the action registry, with the exception not recorded in ADR 0112.
  - B1: no negative cache, so a 2s wait on every load during a MET outage and retries while MET throttles.
  - B2: 1h and 6h precipitation are mixed in one column with no period label.
- **Low-medium:** B3 (profile created without cardio discipline profiles).
- **Low:**
  - A4: 16px credit links.
  - B4: hidden live regions.
  - B5: skipped sessions set the Forecast Hour.
  - B6: inconsistent null contract.
  - B7: the area check accepts Sweden and Finland.
  - B8: hour label for non-whole-hour offsets.
  - C1–C10: smells.
- **Not checked:** A5 (UI-craft checklist in the PR body; out of scope by instruction).
