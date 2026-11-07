# Weather on I dag comes from MET Norway for a Home Place, fetched and cached on the server

Status: Accepted · decided by the factory (autonomy `full`) · Issue #433 ·
**Amends**
[ADR 0092](./0092-every-athlete-operation-is-one-typed-action-and-the-routes-the-mcp-server-and-an-agent-are-its-readers.md)
§5 and §6 (a credit that is not an Origin Platform's; a Reading of one forecast
step),
[ADR 0101](./0101-three-tabs-and-a-calm-i-dag-that-shows-today-and-this-week.md)
§3 (what the default view holds) and
[ADR 0105](./0105-strava-is-removed-and-every-data-class-has-a-retention-period.md)
§3 (a retention row). **Confirms**
[ADR 0014](./0014-integrations-per-folder-no-interface.md): these two sources
are not integrations.

## Context

#433 puts a **Day Forecast** on I dag's today card and on this week's rows, for
the athlete's **Home Place**, and in `get_today`. That brings trainm8's first
two outside services that are not training-data providers (MET Norway's
Locationforecast 2.0 and Kartverket's Stedsnavn API), a new class of personal
data (where someone lives, roughly), and the first Reading whose value is more
than one number. Each is costly to walk back once athletes and assistants build
on it.

## Decision

### 1. Two lookups on the server, outside `app/integrations/`

MET Norway's Locationforecast 2.0 (`compact`) gives the forecast; Kartverket's
Stedsnavn API (`ws.geonorge.no/stedsnavn/v1`) turns a typed name into places.
Both are called only from the server, with an identifying `User-Agent` that
names trainm8 and a contact URL, so the browser's CSP (`connect-src 'self'`) is
unchanged and no athlete's IP address or account reaches either. Each is
credited where its data shows: _Værvarsel fra MET Norway_ (met.no) on I dag,
_Stedsnavn fra Kartverket_ under the search.

They live in `app/utils/weather/` and `app/utils/place-search/`, not in
`app/integrations/`. ADR 0014's folders are for training-data providers whose
data becomes **Activity Imports**, with accounts, sync and dedupe; these are
stateless lookups with no account. Each folder is one deep module with a
one-function interface and one adapter behind it, and no provider interface: one
adapter is a hypothetical seam (ADR 0014's rule, kept). Swapping the source
means rewriting the inside of one folder.

### 2. The Home Place is its own row, rounded on the server

A `HomePlace` model, one-to-one with `AthleteProfile` (`onDelete: Cascade`),
holds the place's name, its kind, municipality and county (as Kartverket gives
them, for the _Hjemsted_ card), and a latitude and longitude rounded to 2
decimals. Choosing a place upserts the row; _Fjern_ deletes it. The server
rounds on every write, whatever precision the form sends, and refuses a point
outside the area Kartverket's register covers. The search text is never stored
and never logged.

The row's existence is the invariant "a place is set": every field is present or
none is, which six nullable columns on `AthleteProfile` could not enforce.

### 3. One rule for the hour, one module for the forecast

The **Forecast Hour** is one pure function, used by I dag and by `get_today`
alike, over the day's sessions, the athlete's default training time and `now`,
working in UTC instants from the Athlete Timezone. Its fallback,
`profile?.defaultTrainingTime ?? DEFAULT_TRAINING_TIME`, is written out five
times today (`day-stamp.server.ts`, `plan-outline/stamp.server.ts`,
`catalogue.server.ts`, `plan-generation/generate.server.ts`,
`training/sessions.new.tsx`); it becomes one `trainingTimeOf(profile)` in
`athlete-schema.ts`, and all six readers call it.

The weather module's interface takes the Home Place and the Forecast Hours and
returns, per day, a Day Forecast or the reason there is none (`beyond-forecast`,
`forecast-unavailable`). A Day Forecast is taken from the one forecast step that
covers its hour (hourly for about 60 hours, then 6-hourly), so its symbol,
temperature and precipitation never come from different steps.

The forecast is cached with cachified, keyed by the rounded point alone (no
user), fresh until MET's `Expires`, refreshed with `If-Modified-Since`, and
served stale while it refreshes. A stale forecast is served for at most 24
hours; a fetch with nothing cached is cut at 2 seconds. When MET errors or is
slow, I dag gets the stale forecast or none, never an error and never a wait.
Only the `/` loader reads the weather; `readHomeTimeline`, shared with the full
view, does not, so _Se hele sesongen_ never waits on MET.

### 4. On the screen, a missing forecast is an absence

A Day Forecast is not a **Training Metric**. On I dag a day without one (past,
beyond the forecast's reach, no Home Place, MET silent with nothing cached)
shows nothing: no _ikke målt_, no dash, no zero. The **Unavailable Metric** rule
is for numbers the training model cannot calculate; it does not reach the
weather.

### 5. To a model, one Reading of the whole forecast step

`get_today` gains

```ts
weather: Reading<{
	at: string // ISO instant, UTC: the Forecast Hour
	symbol: WeatherSymbol // trainm8's closed English enum, not MET's symbol_code
	label: string // labels.ts: the Norwegian word the card shows
	temperatureC: number
	precipitationMm: number
}>
```

unavailable with `no-home-place`, `beyond-forecast` or `forecast-unavailable`,
three new members of the one `UnavailableReason` list, each worded in
`labels.ts`. This amends ADR 0092 §6, which said a Reading is one number: a
Reading may hold one observation whose figures stand or fall together, because
three Readings sharing one reason could say "temperature available, symbol not",
a state that cannot happen. The values are the ones the today card shows, from
the same module and the same cache.

The symbol crosses as trainm8's own family enum, the same mapping the glyph and
the word read, so MET's vocabulary never becomes part of trainm8's interface.
The field is additive, so `get_today` keeps revision 1 (ADR 0092 §1 bumps it
only for a change that is not additive); the `tools/list` snapshot is updated.

A result carrying an available Day Forecast credits MET Norway in its `credits`.
A credit's `platform` widens from the Origin Platforms with a credit (`garmin`,
`polar`) to those plus `met-norway`: the field keeps its name, because renaming
it would break every client, and the enum only widens. The provenance gate is
unchanged: a Day Forecast's binding set is empty, and the MET credit is added by
the weather mapping, not by `sourceTerms`.

### 6. What I dag holds (amends ADR 0101 §3)

With a Home Place set, the today card carries one weather line under its
sentence, each of this week's rows from tomorrow on carries the day's weather in
its own column, and the MET credit sits once under the week (under the card when
the week is not shown). Without one, the default view is exactly ADR 0101 §3's.

### 7. Retention (amends ADR 0105 §3)

The Home Place is kept while the account exists or until the athlete removes it
in _Meg_, and is deleted with the account. The forecast cache holds rounded
points and forecasts, with no user, and expires as §3 says. ADR 0105 §3's table
carries the row; the privacy notice names the Home Place, what goes to MET
Norway (the rounded point) and to Kartverket (the search text), and that neither
gets the athlete's name, account or IP address.

## Considered options

- **Browser geolocation, or a place inferred from recordings' start points.**
  Rejected in #433: a permission prompt the server and an assistant cannot use,
  or a home inferred without being asked.
- **Six nullable columns on `AthleteProfile`.** Rejected: nothing would keep
  them all-or-none, and _Fjern_ would be six writes instead of one delete.
- **Fetching the forecast from the browser.** Rejected: a CSP change, and the
  athlete's IP address and position sent to a third party.
- **The weather inside `readHomeTimeline`.** Rejected: the full view would wait
  on MET for weather it never shows.
- **Three Readings, one per figure, or MET's `symbol_code` as the symbol.**
  Rejected: the first allows a state that cannot exist; the second ties
  trainm8's interface to MET's vocabulary.
- **`get_today` at revision 2.** Rejected: nothing a client relies on changes,
  and a bump tells clients it did.
- **The forecast and place search under `app/integrations/`.** Rejected: it
  would put stateless lookups beside account-holding providers and invite the
  provider registries (sync, reconcile, jobs) to grow cases they do not need.
