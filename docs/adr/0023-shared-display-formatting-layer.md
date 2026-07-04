# Shared display-formatting layer: fixed locale, Athlete Timezone

Athlete-facing values were formatted ad hoc across ~15 files: raw TSS floats
(`120.6488888888889 TSS`) reached the Dashboard week timeline and
planned-vs-actual rows, dates mixed `en-US`/`en-GB`/runtime-default locales and
12h/24h clocks, and the Event detail page hydrated differently from its SSR
markup because `toLocaleDateString()` depends on the runtime's ICU locale and
timezone — which differ between the server and the browser (#172).

## Decision

One module — `app/utils/format.ts` — owns every athlete-facing number, date,
time, pace, duration, and distance string.

1. **Locale is fixed** to `en-GB` (`DISPLAY_LOCALE`): 24h clock times
   (`14:05`) and European-style dates (`4 Jul 2026`). Display formatting must
   be a pure function of the value; any viewer- or runtime-dependent input
   (`Accept-Language`, `navigator.language`, the server's ICU default) makes
   SSR and hydration diverge. The operator is Norwegian; English-language,
   European-style is the chosen house format.

2. **Timezone is explicit, and it is the Athlete Timezone.** Every date/time
   formatter takes an IANA `timeZone`; components read it via
   `useAthleteTimezone()` (Athlete Profile, loaded in the root loader,
   defaulting to UTC). The browser-hint timezone is no longer used for
   training-data display — the athlete's calendar day, not the viewing
   device's, is the domain truth (consistent with the Athlete Calendar,
   ADR/#122). Dashboard week bucketing moved onto the Athlete Calendar for the
   same reason.

3. **Day-anchored values format in UTC.** Event dates and Load Snapshot day
   strings are stored as UTC-midnight day anchors; formatting them in a
   viewer/athlete zone west of UTC would shift the named day. Callers pass
   `'UTC'` for these — the day *is* the value.

4. **Composed layout, ICU token values.** Date strings are assembled from
   `formatToParts` values (month/weekday names, digits) with our own
   punctuation. Combined ICU patterns have changed punctuation between
   releases (commas, no-break spaces), and any server/browser ICU skew is a
   hydration mismatch.

5. **Load numbers are integers.** TSS/CTL/ATL/TSB render through
   `formatLoad`/`formatTss`/`formatSigned` (rounded); the Cockpit presenter
   rounds all TSS it emits, and an e2e assertion keeps `\d+\.\d{4,}` out of
   the rendered Dashboard.

6. **Parsers live beside formatters.** `parsePace` (`m:ss`, optional `/km` /
   `/100m` suffix) and `parseDuration` (`1 h 30 min`, `90 min`, `1:30`, bare
   minutes) are the inverses consumed at form boundaries by later slices
   (#176, #177). They return `null` for anything unparseable — never a guessed
   number.

## Consequences

- `app/utils/workout-formatting.ts` is absorbed into `app/utils/format.ts`.
- Server-side *bucketing* timezone math stays in `athlete-calendar.ts`
  (canonical); `format.ts` is display-only.
- New surfaces must not call `toLocale*`/`Intl.DateTimeFormat` directly for
  athlete-facing values; import from `#app/utils/format.ts`.
