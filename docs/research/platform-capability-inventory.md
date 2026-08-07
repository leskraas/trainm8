# Platform Capability Inventory — Endurance Training Analysis

_Breadth survey, 2026-08. What a best-in-class endurance training-analysis
platform **does**, enumerated by surface, so the team can decide what to build.
Vendor-neutral throughout: capabilities are described generically and no product
is named, including the ones read to compile this. Depth on load models,
activity metrics, zones, intensity distribution, planning theory and interval
detection is covered by sibling research and deliberately left thin here._

## TL;DR

- The category has converged on **nine surfaces**: activity detail, activity
  library, calendar, fitness/progression, reporting, planning, integrations,
  social, and the health/gear/nutrition satellites. Roughly **70 discrete
  capabilities** across them; no single product ships all of them, and the
  serious ones differentiate on two or three.
- The single highest-density surface is **activity detail** — a synced
  multi-channel chart stack plus a lap/segment table plus distribution curves is
  the table stakes trio that athletes judge a platform on first.
- The cheapest large wins are **derivations of data already ingested**: laps,
  time-in-zone, mean-maximal curves, route geometry and weather are all read off
  a stream or a start coordinate the platform already stores. Value-per-effort
  here is far higher than on new surfaces.
- **Wellness logging (weight / RHR / HRV / sleep / soreness) is the
  highest-value missing primitive** for a self-coaching athlete: it is a
  trivially simple data model that immediately unlocks trend charts, calendar
  rows, readiness context and correlation reporting on five other surfaces.
- **Coach↔athlete, social, and nutrition are large, low-leverage** for a small
  team building for a self-coaching athlete. They are whole product lines, not
  features, and the market already has entrenched incumbents in each.

Confidence note: effort ratings are engineering judgement calibrated against
this repo's existing primitives, not measurements. Where a capability's cost
hinges on a data question this repo has not answered (per-sample GPS, stream
resolution), that is flagged inline.

---

## Legend

**Effort** — S = days, M = a week or two, L = a month or more (or a whole
product line). **trainm8** — Have / Partial / Missing against the current
codebase (see [Implications](#implications-for-trainm8) for the reasoning).

---

## 1. Activity detail

The single-activity deep-dive. The densest surface in the category, and the one
athletes open most often.

| #    | Capability                                            | What it is                                                                                            | Why an athlete cares                                                       | Effort | trainm8 |
| ---- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------ | ------- |
| 1.1  | Multi-channel synced chart stack                      | Power, HR, pace, cadence, elevation, temperature plotted on one shared time axis, channels toggleable | The whole story of the session in one read: did HR drift while power held? | M      | Partial |
| 1.2  | Scrub / inspect readout                               | One cursor reads every channel at one instant into a fixed panel                                      | Answers "what was I doing at minute 34?" without arithmetic                | S      | Have    |
| 1.3  | Zoom / brush selection                                | Drag a window on the chart; all stats recompute for the selection only                                | Ad-hoc analysis of an effort the lap button missed                         | M      | Missing |
| 1.4  | Smoothing / channel scaling controls                  | Rolling-average window and per-channel y-axis scaling                                                 | Raw power is unreadable; 30 s smoothing makes shape visible                | S      | Missing |
| 1.5  | Map with route                                        | Rendered GPS track on tiles, pannable/zoomable                                                        | Where did I go; recognising the route recontextualises the numbers         | M      | Partial |
| 1.6  | Map↔chart linked hover                                | Hovering the chart moves a marker on the map and vice versa                                           | Ties "the power spike" to "the climb"                                      | M      | Missing |
| 1.7  | Lap table                                             | Provider/auto laps as rows with per-lap duration, distance, avg/max per channel                       | The primary way interval sessions are actually read                        | S      | Missing |
| 1.8  | Custom / manual splits                                | Athlete-defined segments over an arbitrary time or distance range, saved on the activity              | Provider laps rarely match how the session was actually structured         | M      | Missing |
| 1.9  | Configurable table columns                            | Choose which of many metrics appear as lap/segment columns, sort by any                               | Different sports and sessions need different readouts                      | M      | Missing |
| 1.10 | Distribution curves / histograms                      | Time-in-zone and value histograms for HR, pace, power, cadence                                        | Was this actually the easy ride it was supposed to be?                     | S      | Partial |
| 1.11 | Mean-maximal (best-effort) curve for the activity     | Best average value for every duration within this activity                                            | Did I set a 5 min or 20 min best today?                                    | M      | Missing |
| 1.12 | Comparison against previous efforts on the same route | Auto-match this activity to prior activities on the same course; overlay                              | The cleanest like-for-like fitness signal an athlete gets                  | L      | Missing |
| 1.13 | Segment matching                                      | Named sub-sections of a route matched across all activities, with leaderboards or personal history    | Competitive and progression hook; deeply habit-forming                     | L      | Missing |
| 1.14 | Photos                                                | Attach or sync images to an activity                                                                  | Memory and narrative; drives revisiting old activities                     | S      | Missing |
| 1.15 | Comments / kudos on an activity                       | Others (or a coach) leave text on the activity                                                        | Feedback loop, accountability                                              | M      | Missing |
| 1.16 | RPE / feel entry                                      | Post-session subjective effort and a free-text reflection                                             | The only honest input when telemetry is absent; also a load fallback       | S      | Have    |
| 1.17 | Structured post-session survey                        | Sleep, fuelling, soreness, motivation captured with the session                                       | Explains outlier sessions months later                                     | S      | Missing |
| 1.18 | Gear assignment                                       | Attach a bike/shoe/wetsuit to the activity, auto-defaulted per sport                                  | Mileage tracking, equipment-vs-performance analysis                        | S      | Missing |
| 1.19 | Weather at time of activity                           | Temperature, wind, humidity backfilled from start coordinate + timestamp                              | 34 °C explains the HR; without it the session reads as a fitness loss      | S      | Missing |
| 1.20 | Data repair                                           | Trim, crop, splice, drop a bad channel, fix a spiking sensor                                          | One dropout otherwise poisons load, records and curves                     | M      | Missing |
| 1.21 | Manual activity entry                                 | Log a session with no device at all                                                                   | Swims, gym, hikes, borrowed bikes                                          | S      | Have    |
| 1.22 | Planned-vs-actual on the detail view                  | The prescription rendered against the recording                                                       | Did I execute the session I was given?                                     | M      | Have    |

## 2. Activity list / library

The searchable archive. Cheap to build, and it is where power users live.

| #    | Capability                                | What it is                                                                              | Why an athlete cares                                       | Effort | trainm8 |
| ---- | ----------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------ | ------- |
| 2.1  | Chronological list with core columns      | Date, sport, title, duration, distance, load, key metric                                | The default way to find anything                           | S      | Have    |
| 2.2  | Configurable columns                      | Choose and reorder which metrics appear                                                 | A swimmer and a cyclist need different tables              | M      | Missing |
| 2.3  | Faceted filters                           | Sport, date range, duration/distance bands, has-power, has-plan                         | Narrowing 2000 activities to the 12 that matter            | S      | Partial |
| 2.4  | Free-text search                          | Match on title and notes                                                                | "That hilly ride in March"                                 | S      | Missing |
| 2.5  | Expression / query language               | A typed filter expression over any field (`sport=run AND distance>20km AND hr_avg<150`) | Power users answer questions no fixed UI anticipated       | M      | Missing |
| 2.6  | Saved views                               | Name and pin a filter set; shareable via URL                                            | Recurring questions become one click                       | S      | Missing |
| 2.7  | Tags                                      | Athlete-defined labels on activities and planned sessions, filterable everywhere        | Group by block, by race build, by "commute", by "felt bad" | M      | Missing |
| 2.8  | Bulk edit                                 | Multi-select then set sport, tag, gear, visibility, or delete                           | Fixing 200 mis-typed imports is otherwise unbearable       | M      | Missing |
| 2.9  | Totals and averages on the current filter | Sum/avg row that respects the active filter                                             | "How much did I actually run in the base phase?"           | S      | Partial |
| 2.10 | Grouping by period or sport               | Collapse into week/month/sport groups with subtotals                                    | Reading volume rhythm at a glance                          | S      | Partial |
| 2.11 | Export the current view                   | CSV of exactly what is on screen                                                        | Every athlete eventually wants a spreadsheet               | S      | Missing |

## 3. Calendar

The planning and reflection surface. Where planned and completed meet.

| #    | Capability                            | What it is                                                                    | Why an athlete cares                            | Effort | trainm8 |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | ------ | ------- |
| 3.1  | Week view                             | Seven day columns with all sessions                                           | The unit athletes actually plan in              | M      | Partial |
| 3.2  | Month view                            | Compact month grid with load intensity shading                                | Seeing the block's rhythm and gaps              | M      | Missing |
| 3.3  | Year / season view                    | Full season at low resolution, colour = load                                  | Periodization sanity check at a glance          | M      | Missing |
| 3.4  | Planned vs completed side by side     | Both objects on the same day cell, visually distinguished, auto-matched       | The core accountability read                    | M      | Partial |
| 3.5  | Drag to move / copy a planned session | Reschedule by dragging; option-drag copies                                    | Life happens; re-planning must cost one gesture | M      | Missing |
| 3.6  | Weekly summary column                 | Per-week totals for duration, distance, load, time-in-zone, planned-vs-actual | The week is the real unit of training           | S      | Partial |
| 3.7  | Wellness rows                         | Weight, RHR, HRV, sleep, fatigue, soreness as thin rows under the days        | Correlating how you feel with what you did      | M      | Missing |
| 3.8  | Weather forecast on future days       | Forecast icon/temp/wind on upcoming cells                                     | Moving the long ride off the storm day          | S      | Missing |
| 3.9  | Notes / annotation days               | Non-training entries: travel, illness, altitude camp, life events             | Explains the hole in the data a year later      | S      | Missing |
| 3.10 | Event / race markers                  | Target events pinned on their date with countdown                             | The anchor everything is built toward           | S      | Have    |
| 3.11 | Multi-athlete calendar                | One coach view across several athletes                                        | Coach product only                              | L      | Missing |
| 3.12 | Calendar feed subscription (iCal)     | Planned sessions as a subscribable calendar                                   | Training shows up beside meetings               | S      | Missing |

## 4. Fitness / progression

The long-arc view. The strongest retention surface once there is a year of data.

| #    | Capability                                      | What it is                                                                 | Why an athlete cares                                             | Effort | trainm8 |
| ---- | ----------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------ | ------- |
| 4.1  | Fitness–fatigue chart                           | Chronic load, acute load and their difference over time                    | The single most-looked-at chart in the category                  | M      | Have    |
| 4.2  | Form/freshness zone bands                       | Named bands on the form axis (fresh / neutral / grey / high risk)          | Turns a number into a decision                                   | S      | Have    |
| 4.3  | Ramp rate                                       | Rate of chronic-load increase per week, with a caution threshold           | Early warning on the classic build-too-fast injury               | S      | Missing |
| 4.4  | Forward projection of fitness                   | Extend the fitness curve through the planned block                         | "Will I be fit enough by race day?"                              | L      | Have    |
| 4.5  | Mean-maximal power/pace curve over a date range | Best average for every duration across a whole period                      | The definitive "what am I capable of" chart                      | M      | Missing |
| 4.6  | Season-over-season curve comparison             | Overlay this year's curve against last year's / a chosen range             | Am I better than I was? The question that keeps athletes logging | M      | Missing |
| 4.7  | Best-efforts progression                        | Time series of the best 1/5/20 min (or 1 k/5 k/10 k) effort per month      | Progress in the units athletes talk in                           | M      | Partial |
| 4.8  | Auto-estimated threshold progression            | Threshold/critical power estimated from maximal efforts, tracked over time | Zones stay current without a dreaded test                        | M      | Missing |
| 4.9  | Manual threshold history                        | Dated threshold values with the test that set them                         | Auditability of what zones applied when                          | S      | Have    |
| 4.10 | Weight / body-composition trend                 | Time series with a smoothing line                                          | Power-to-weight; body-comp goals                                 | S      | Missing |
| 4.11 | HRV / RHR / sleep trends                        | Time series with rolling baselines and deviation flags                     | The readiness signal most athletes now expect                    | M      | Missing |
| 4.12 | Time-in-zone over time                          | Weekly/monthly stacked bars of minutes per intensity zone                  | Am I actually polarized, or accidentally grey-zone?              | M      | Partial |
| 4.13 | Sport / discipline allocation over time         | Share of load or hours by sport across a window                            | Triathlete balance; "am I neglecting the swim?"                  | S      | Have    |
| 4.14 | Efficiency trends                               | Aerobic decoupling, efficiency factor, pace-per-heartbeat over time        | Aerobic-base progress that raw pace hides                        | M      | Missing |
| 4.15 | Personal records board                          | Derived bests per sport and benchmark, with the achieving session          | Proof; also the most shareable artefact                          | S      | Partial |

## 5. Reporting & totals

Generic aggregation. Low glamour, disproportionately loved by serious users.

| #   | Capability                         | What it is                                                        | Why an athlete cares                                        | Effort | trainm8 |
| --- | ---------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- | ------ | ------- |
| 5.1 | Arbitrary date-range rollup        | Pick any two dates; get totals for the span                       | "What did the 12-week build actually contain?"              | S      | Missing |
| 5.2 | Per-sport breakdown within a range | The same totals split by discipline                               | Balance and honesty about the mix                           | S      | Partial |
| 5.3 | Fixed-period rollups               | This week / month / quarter / year cards                          | The habitual check-in                                       | S      | Partial |
| 5.4 | Custom pivot / totals table        | Choose rows (period, sport, tag), columns (metrics), aggregation  | One surface answers questions the roadmap never planned for | L      | Missing |
| 5.5 | Year-over-year comparison          | Same period, prior years, side by side or overlaid                | The most motivating comparison there is                     | M      | Missing |
| 5.6 | Streaks and consistency            | Consecutive days/weeks trained, days-active ratio, longest streak | Behavioural hook; consistency beats heroics                 | S      | Missing |
| 5.7 | Compliance / adherence report      | Planned vs completed sessions and load over a period              | Did I do the plan?                                          | M      | Have    |
| 5.8 | Correlation / relational analysis  | Scatter any metric against any other over a range                 | Advanced users hunting their own causes                     | L      | Missing |
| 5.9 | Scheduled digest                   | Weekly/monthly email or in-app summary of the period              | Passive re-engagement; reflection prompt                    | M      | Missing |

## 6. Planning

| #    | Capability                                       | What it is                                                             | Why an athlete cares                                          | Effort | trainm8 |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ------ | ------- |
| 6.1  | Structured workout authoring                     | Build a session from typed steps with intensity targets and quantities | The prescription must be machine-readable to be analysable    | L      | Have    |
| 6.2  | Workout library                                  | Saved reusable workouts, searchable                                    | Nobody re-authors "4×8 min threshold" every week              | M      | Partial |
| 6.3  | Library folders / collections                    | Hierarchical organisation and tagging of the library                   | A library of 200 workouts is useless unstructured             | S      | Missing |
| 6.4  | Season plan / periodization authoring            | Phases, volume progression, intensity mix across a season              | Structure beyond next week                                    | L      | Have    |
| 6.5  | Plan templates                                   | Athlete-agnostic, relative-week plan definitions stamped onto a date   | Reuse a season; distribute a methodology                      | L      | Missing |
| 6.6  | Plan marketplace / import-export                 | Browse, buy, publish, or import a plan file                            | Onboarding shortcut for athletes with no plan                 | L      | Missing |
| 6.7  | Week patterns / microcycle stamping              | A weekday pattern applied across many weeks                            | Building 20 weeks by hand is the reason people quit planning  | M      | Have    |
| 6.8  | Auto-adjust / replan                             | Modify future sessions from recent adherence and form                  | Plans that survive contact with real life                     | L      | Have    |
| 6.9  | Push structured workouts to device               | Send the prescription to a watch or head unit                          | Executing an interval session off a phone screen is miserable | M      | Missing |
| 6.10 | Coach↔athlete relationship                       | Roles, athlete roster, permissions, coach-authored sessions            | Whole second product; not the self-coaching athlete           | L      | Missing |
| 6.11 | Coach comments / two-way messaging               | Threaded discussion per session or per week                            | The coaching relationship's actual medium                     | L      | Missing |
| 6.12 | Plan compliance reporting for a coach            | Roster-wide adherence dashboard                                        | Coach product only                                            | L      | Missing |
| 6.13 | Goal / event definition with priority and target | A/B/C race priority and a typed goal                                   | Everything periodizes toward it                               | S      | Have    |

## 7. Integrations & data

The category's true moat. Athletes will not migrate to a platform that cannot
absorb their history.

| #    | Capability                                   | What it is                                                           | Why an athlete cares                                                  | Effort | trainm8 |
| ---- | -------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- | ------ | ------- |
| 7.1  | OAuth sync with major activity platforms     | Authorized pull of activities from aggregators                       | Zero-friction ingest; the onboarding gate                             | M      | Have    |
| 7.2  | Direct device-vendor sync                    | Per-vendor APIs (several behind partner approval programs)           | Avoids a lossy intermediate hop                                       | L      | Partial |
| 7.3  | Webhook ingest                               | Push notification on new/updated/deleted activity                    | Activities appear in seconds, not on a poll                           | M      | Have    |
| 7.4  | Historical backfill on connect               | Pull enough history to seed load and records                         | An empty fitness chart on day one kills activation                    | M      | Have    |
| 7.5  | File upload (FIT / GPX / TCX)                | Manual upload including drag-drop and mobile share-target            | The universal fallback when no API exists                             | S      | Have    |
| 7.6  | Wellness/health source sync                  | HRV, sleep, RHR, weight from wearables and scales                    | Feeds readiness and trends without manual entry                       | M      | Missing |
| 7.7  | Weather enrichment                           | Historical weather joined to each activity; forecast on planned days | Context for both analysis and scheduling                              | S      | Missing |
| 7.8  | Open developer REST API                      | Documented, key-authed API over the athlete's own data               | Third-party ecosystem; the strongest lock-in a small platform can buy | M      | Missing |
| 7.9  | Outbound webhooks                            | Notify third parties on new activity/wellness                        | Lets others build without polling                                     | S      | Missing |
| 7.10 | Bulk export                                  | Full archive: original files plus structured CSV/JSON                | Trust. Athletes commit history only to platforms they can leave       | S      | Partial |
| 7.11 | Push structured workouts outbound            | Sync planned sessions to a device or a trainer app                   | Closes the plan→execute loop                                          | M      | Missing |
| 7.12 | Duplicate detection across providers         | Same session arriving twice from two sources                         | Double-counted load destroys every downstream number                  | M      | Partial |
| 7.13 | Account deletion / data ownership guarantees | One-click delete, no data sale, clear residency                      | Increasingly a purchase criterion                                     | S      | Partial |

## 8. Social & community

| #   | Capability                               | What it is                                                         | Why an athlete cares                              | Effort | trainm8 |
| --- | ---------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- | ------ | ------- |
| 8.1 | Following / activity feed                | See others' activities chronologically                             | The engagement engine of the mass-market products | L      | Missing |
| 8.2 | Kudos and comments                       | Lightweight reactions and threaded text                            | Cheap social reinforcement                        | M      | Missing |
| 8.3 | Clubs / groups                           | Membership, group feeds, group leaderboards                        | Belonging; the retention multiplier               | L      | Missing |
| 8.4 | Challenges                               | Time-boxed distance/elevation/consistency goals with progress bars | Short-term extrinsic motivation                   | M      | Missing |
| 8.5 | Shared workouts                          | Publish a workout for others to import                             | Community library grows without you writing it    | M      | Missing |
| 8.6 | Shared plans                             | Publish a plan under a licence                                     | Same, at season scale                             | L      | Missing |
| 8.7 | Public profile / shareable activity link | A read-only URL for one activity or a season summary               | Sharing without forcing signup                    | S      | Missing |
| 8.8 | Visibility controls                      | Per-object private/followers/public                                | Prerequisite for anything above                   | S      | Partial |

## 9. Gear, health and nutrition satellites

| #    | Capability                               | What it is                                                       | Why an athlete cares                                            | Effort | trainm8 |
| ---- | ---------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | ------ | ------- |
| 9.1  | Gear registry                            | Bikes, shoes, wetsuits with purchase date and retire flag        | Basic inventory                                                 | S      | Missing |
| 9.2  | Auto-accumulated gear mileage            | Distance/time accrued per item from assigned activities          | "Are these shoes done?" — the #1 reason gear tracking exists    | S      | Missing |
| 9.3  | Component tracking and service reminders | Chains, cassettes, brake pads with wear thresholds and alerts    | Preventive maintenance; avoids a mid-ride failure               | M      | Missing |
| 9.4  | Gear-vs-performance analysis             | Compare pace/power/efficiency across gear                        | Was the aero bike worth it?                                     | M      | Missing |
| 9.5  | Injury / illness log                     | Dated entries with body area, severity, status, calendar markers | Explains gaps; reveals recurrence patterns                      | S      | Missing |
| 9.6  | Injury-aware load context                | Overlay injury periods on the fitness chart and load reports     | Connecting a ramp spike to what it caused                       | M      | Missing |
| 9.7  | Daily wellness entry                     | Weight, RHR, HRV, sleep, fatigue, soreness, mood, stress         | Small model, enormous downstream leverage                       | S      | Missing |
| 9.8  | Readiness synthesis                      | A single readiness read combining wellness with form             | The "should I go hard today?" answer, better informed           | M      | Partial |
| 9.9  | Nutrition logging                        | Food/macro diary                                                 | Real demand, but a whole product with entrenched incumbents     | L      | Missing |
| 9.10 | Fuelling plan per session                | Carbs/fluid/sodium targets attached to a workout or race         | Genuinely differentiating for long-course athletes; small model | M      | Missing |
| 9.11 | Energy balance                           | Calories in vs estimated expenditure                             | Requires nutrition logging to mean anything                     | L      | Missing |

---

## Prioritised shortlist — 15 highest value-per-effort for a small team

Ranked. The ordering weights (a) how often the capability is used, (b) how much
it unlocks elsewhere, and (c) whether the underlying data is **already
ingested** — the dominant cost factor in this category.

**Ranked on the evidence, not on the decision record.** Two items below sit high
_because_ an existing ADR currently rules them out, and the ADR is wrong: the
calendar grid (ADR 0017) and the full-resolution stream tier (ADR 0020). A
shipped decision is a cost input to a ranking, never a reason to suppress a
capability from it. See
[ADRs this research challenges](#adrs-this-research-challenges).

| Rank | Capability                                                                   | Effort | Why it wins                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Lap / interval table on activity detail** (1.7)                            | S      | Provider lap markers are usually already stored and unread. It is the way interval sessions are actually reviewed, and it makes structured prescription legible against what happened. Highest ratio on the board.                                                                                                                                                                                        |
| 2    | **A real calendar grid — week and month, drag-to-move** (3.1, 3.2, 3.5, 3.9) | M      | The grid is the right shape for a planning surface, and this is the largest capability gap in the product. Planning without drag-to-reschedule is planning people abandon in week three, and the grid is the only surface on which load rhythm, wellness rows, notes days and forecast cells can land at all. It ranks second on the evidence; it ranked tenth only because ADR 0017 deleted the surface. |
| 3    | **Daily wellness entry** (9.7)                                               | S      | A four-field model that unlocks calendar rows (3.7), four trend charts (4.10, 4.11), correlation reporting (5.8) and a better readiness read (9.8). Nothing else on this list has that fan-out per line of code.                                                                                                                                                                                          |
| 4    | **Time-in-zone, per activity and over time** (1.10, 4.12)                    | S→M    | Distribution derives from a stream already stored. Per-activity is nearly free; the weekly stacked view is the honest answer to "am I training the way I think I am", which is the question intensity-distribution discourse has made every athlete ask.                                                                                                                                                  |
| 5    | **Full-resolution analysis stream tier** (enabler for 1.11, 4.5–4.8, 4.15)   | M      | Not a surface — the storage change that unblocks four ranked items plus interval detection. The current stored stream is a chart grid (≥5 s, ≤1000 samples); at ~19 s on a long ride, short-duration bests and short-rep detection are not merely degraded but impossible. Every capability below that reads a stream inherits this ceiling.                                                              |
| 6    | **Weather enrichment at time of activity** (1.19, 3.8)                       | S      | One API call joined on start coordinate + timestamp. Removes a whole class of false "I'm losing fitness" panic, and the forecast side makes the calendar actionable. Cheap because no new user input exists.                                                                                                                                                                                              |
| 7    | **Arbitrary date-range rollup with per-sport split** (5.1, 5.2)              | S      | The most-requested reporting primitive and a pure query. Also the substrate a pivot table would later sit on, so it is not throwaway.                                                                                                                                                                                                                                                                     |
| 8    | **Mean-maximal power/pace curve with season comparison** (4.5, 4.6)          | M      | The definitive capability chart, and the one athletes use to answer "am I better than last year". Land item 5 first; then this is a real curve rather than a curve with its short end amputated. Pre-migration history stays honestly capped at the coarse grid.                                                                                                                                          |
| 9    | **Gear registry with auto-accumulated mileage** (9.1, 9.2)                   | S      | Small model, obvious daily utility, and it converts activity distance the platform already has into a number athletes check weekly. Assignment defaults per sport keep the input cost near zero.                                                                                                                                                                                                          |
| 10   | **Injury / illness log with calendar markers** (9.5, 9.6)                    | S      | Trivial model. It is the only thing that makes a three-week hole in the history interpretable a year later, and overlaying it on the fitness chart is a few lines once the entries exist. Rises with item 2, since the markers need a grid to live on.                                                                                                                                                    |
| 11   | **Bulk export of the full archive** (7.10)                                   | S      | A trust purchase, not a feature. Athletes commit a decade of history only to platforms they believe they can leave. Cheap, and it removes the loudest objection in every migration thread.                                                                                                                                                                                                                |
| 12   | **Tags plus saved views on the activity library** (2.6, 2.7)                 | M      | Turns a list into a workspace. Tags are the generic escape hatch for every categorisation the roadmap did not anticipate (blocks, races, commutes, felt-bad days) and they compose with filters, reports and the calendar.                                                                                                                                                                                |
| 13   | **Route map from stored geometry, chart-linked** (1.5, 1.6)                  | M      | Route geometry is generally already stored. Upgrading a static sketch to a real pannable map with a linked cursor is a contained job with very high perceived-quality return — this is the surface people screenshot.                                                                                                                                                                                     |
| 14   | **Workout library with folders and search** (6.3)                            | S→M    | If structured authoring already exists, the library is mostly organisation over it. It is what converts one-off authoring into a repeatable weekly habit.                                                                                                                                                                                                                                                 |
| 15   | **Open developer REST API over the athlete's own data** (7.8)                | M      | The asymmetric bet. A documented key-authed API lets a community build the long tail — exporters, dashboards, niche analyses — that a small team can never staff. Also the strongest lock-in available to a small platform, and it is largely re-exposing existing queries.                                                                                                                               |

**Just below the line:** streaks and consistency metrics (5.6) — still a pure
derivation over dates and still cheap, but a behavioural hook rather than an
unlock, so it loses its slot to the storage tier.

**Deliberately excluded, and why:** segment matching and same-route comparison
(1.12–1.13) are geospatial-indexing projects and the incumbents own the network
effect; coach↔athlete and roster reporting (6.10–6.12) are a second product for
a different buyer; nutrition logging (9.9, 9.11) is an entrenched category;
social feed and clubs (8.1, 8.3) need a population before they pay back. Custom
pivot tables (5.4) are genuinely loved but should follow the simple range
rollup, not precede it.

---

## Implications for trainm8

Read against `CONTEXT.md`, `docs/adr/0001`–`0047`, and the current route tree
(`app/routes/_home`, `app/routes/training`, `app/routes/settings`,
`app/routes/imports.*`, `app/routes/integrations.*`).

### Where trainm8 is already strong

- **Load and form.** The chronic/acute/balance triad, form bands, adherence
  bands, weekly adherence, the week replan decision and the forward fitness
  projection (4.1, 4.2, 4.4, 5.7, 6.8) are Have, and several are more rigorous
  than the category norm — the honesty discipline around unavailable metrics
  (ADR 0008) is a genuine differentiator, not a limitation.
- **Planning depth.** Plan Outline with phases, Training Tracks, Season Anchor,
  Volume Ramp, Quality Session Mix and Week Patterns (6.1, 6.4, 6.7) is Have and
  is deeper than most of the category, which stops at a workout library plus a
  calendar.
- **Ingest.** OAuth sync, key-based sync, webhook ingest, count-based backfill,
  FIT/GPX/TCX upload, mobile share-target and the Integration Hub (7.1, 7.3,
  7.4, 7.5) are Have. This is the expensive part of the category and it is done.
- **Activity detail foundations.** The Chart Primitive, Chart Inspect scrubbing,
  the Telemetry Overlay and the planned-vs-actual summary (1.2, 1.22) are Have,
  and Structure Detection (ADR 0032–0035) does something most platforms do not.

### The Partials — where a small delta buys a lot

| Capability                               | Status now   | The gap                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-channel chart stack (1.1)          | Partial      | Power / HR / pace exist in `ActivityStream`; cadence, elevation and temperature are not stored, and channels are not individually toggleable.                                                                              |
| Map with route (1.5)                     | Partial      | `ActivityImport.polyline` is stored and `RouteSketch` renders a static SVG on the Workout Detail View. No tiles, no pan/zoom, no chart linkage.                                                                            |
| Distribution / time-in-zone (1.10, 4.12) | Partial      | `phaseBarsJson` holds derived zone phases per recording; there is no distribution chart, and no time-in-zone aggregation over weeks.                                                                                       |
| Activity library (2.1, 2.3, 2.9, 2.10)   | Partial      | The Session Ledger is chronological with the right core columns and a Discipline Filter, but has no date-range filter, free-text search, saved views, totals row or period grouping.                                       |
| Week view / weekly summary (3.1, 3.6)    | Partial      | `week-timeline.tsx` and the This Week strip exist on the Dashboard; there is no calendar grid, no month view, no drag.                                                                                                     |
| Best efforts / PRs (4.7, 4.15)           | Partial      | Personal Records are derived but v1 has a single benchmark kind (`farthest`, ADR 0021). No per-duration bests, no progression over time — explicitly gated on per-sample stream benchmarks, which the stream now supplies. |
| Discipline allocation (4.13, 5.2)        | Have/Partial | Trailing-window load mix exists (ADR 0031); an arbitrary-range split does not.                                                                                                                                             |
| Workout library (6.2)                    | Partial      | `Workout` is modelled as a reusable template with a visibility axis, but there is no library surface, no folders, no search.                                                                                               |
| Bulk export (7.10)                       | Partial      | `resources/download-user-data` dumps user JSON; no original-file archive, no per-view CSV.                                                                                                                                 |
| Duplicate detection (7.12)               | Partial      | The model permits cross-provider duplicates and resolution is athlete-driven by design; no assistive detection.                                                                                                            |
| Visibility controls (8.8)                | Partial      | `Workout.visibility` exists but is inert groundwork (ADR 0037); real vocabulary and semantics are deferred to #337.                                                                                                        |
| Readiness synthesis (9.8)                | Partial      | The Coach card answers go-hard-or-recover from form alone; no wellness inputs feed it.                                                                                                                                     |

### The Missing that matter most

There is **no wellness, gear, injury or nutrition model at all** — no such
entities exist in `prisma/schema.prisma`. That is the single largest structural
gap relative to the category, and shortlist items 3, 9 and 10 all land there.
There is also **no calendar surface at all**, **no lap table** despite
`lapsJson` being stored, and **no public API**.

### Two decisions that should change

**1. ADR 0017 should be superseded for the planning surface: build the calendar
grid.**

ADR 0017 deleted `/training/upcoming` and `/training/load` and made the
Dashboard the single training surface. Its reasoning was about **reading** — one
mental model, fewer near-empty destinations, no duplicate chronological lists —
and on that reasoning it was right and remains right. Planning is a **writing**
surface, and the evidence in this survey says the grid is what a writing surface
needs: drag-to-reschedule (3.5), month load rhythm (3.2), season shape (3.3),
wellness rows (3.7), notes/annotation days (3.9) and forecast cells (3.8) are
six distinct capabilities and every one of them requires a two-dimensional grid.
A vertical Session Ledger plus a one-week strip cannot carry any of them. ADR
0017 itself left the door open — dropped affordances "return as progressive
disclosure on the home ledger, not as a separate page" — but that framing is the
part to reverse: the calendar is not a re-display of the ledger, it is a
different interaction model.

Supersede the surface decision; keep everything else. The Coach card stays the
single plain-language daily signal, the Training Load Section stays folded into
home (ADR 0011 stays superseded), and the Plan card (ADR 0018) stays an
arc-level summary — it is not a calendar and should not grow into one.

_Cost:_ a new route and a new interaction model, plus the mobile-first
constraint of ADR 0028, which a month grid genuinely strains at 390 px. No
stored athlete number moves.

**2. ADR 0020 should be superseded: the display grid must stop being the only
stored telemetry.**

ADR 0020 stores telemetry downsampled to a ≥5 s floor and a ≤1000-sample cap,
chosen explicitly because "the overlay does not need 1 Hz fidelity". That is a
chart decision, and every analysis consumer has since inherited it as if it were
a limit of the data: the mean-maximal curve (4.5), season comparison (4.6),
best-efforts progression (4.7), auto-estimated thresholds (4.8), the
per-activity best-effort curve (1.11) and short-rep structure detection are all
capped or impossible at ~19 s resolution on a long ride. Store a full-resolution
analysis tier and derive the display grid from it.

_Cost, stated plainly:_ recomputing Normalized Power from a fine grid will move
stored TSS — and therefore CTL/ATL/TSB — on historical rides, because ADR 0024
records that bucket-mean smoothing makes today's numbers conservative. That is a
one-time migration with a notice, not an athlete-facing offer, and it is not a
reason to keep the coarse grid. Activities whose originals were not retained
keep the coarse grid and their short-duration bests stay an honest Unavailable
Metric (ADR 0008) rather than being interpolated.

### Decisions this survey confirms

- **Honesty discipline (ADR 0008) and the no-cross-currency rule (ADR 0046).**
  Wellness must land as its own trends and calendar rows and feed readiness as
  an explicit second signal beside form — never as a modifier folded into the
  triad. This is the correct constraint and the wellness work should be scoped
  inside it, not around it.
- **Hand-rolled charting (ADR 0029) and the Chart Inspect contract (ADR 0030).**
  New charts reuse a real primitive. The consequence is a cost, not a flaw:
  brush-zoom (1.3) and map↔chart linking (1.6) must be hand-built against ADR
  0028's mobile-first standard, so rate 1.3 nearer M than S here.
- **Deferred sharing semantics (ADR 0037).** `Workout.visibility` as inert
  groundwork with the real vocabulary deferred to #337 is right; treat 6.5, 6.6
  and all of §8 as owned by that effort and by the documented Plan Template
  constraints in `CONTEXT.md`.
- **Tags still need a home in the ubiquitous language.** Shortlist item 12 needs
  a `CONTEXT.md` entry first — the repo's standing rule against free text makes
  an unconstrained tag vocabulary a live design question, not an obvious win.
  That is a design step, not a reason to demote the item.

### ADRs this research challenges

| ADR                                           | What it decided                                                                | What the evidence says                                                                                                                               | Verdict       |
| --------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **0017** consolidate surfaces onto home       | Delete the separate training surfaces; home is the single training destination | Correct for reading, wrong for planning: six calendar capabilities each require a grid that a vertical ledger cannot provide                         | **Supersede** |
| **0020** downsampled telemetry                | One stored stream, ≥5 s floor and ≤1000-sample cap, sized for the chart        | Six progression/best-effort capabilities plus short-rep detection inherit a chart constraint as a data limit. Store full resolution, derive the grid | **Supersede** |
| **0021** Personal Records                     | `farthest` only; pace/power benchmarks deferred until streams land             | Streams have landed; the remaining blocker is resolution, not ingestion, so the deferral should end with the ADR 0020 change                         | **Amend**     |
| **0031** Discipline Allocation                | Share of actual load by discipline over a trailing 6-week window               | The window is the right default but the wrong constraint — 5.1/5.2 need the same split over an arbitrary range                                       | **Amend**     |
| **0018** Plan card on home                    | An arc-level derived summary of the active plan, no new plan-detail page       | Confirmed, and confirmed as _not_ a calendar: the card and the grid answer different questions and both should exist                                 | **Confirm**   |
| **0008** Unavailable Metric / Load Confidence | Never fabricate; degrade to an honest gap with a confidence label              | The category's most common failure is a confident wrong number; this is a differentiator and constrains the wellness and curve work correctly        | **Confirm**   |
| **0046** no cross-currency load number        | No single number spans incommensurable Training Tracks                         | Applies directly to wellness: HRV/RHR/sleep must not enter CTL/ATL/TSB                                                                               | **Confirm**   |
| **0029/0030** hand-rolled SVG + Chart Inspect | No charting library; one primitive owns scales, inspect and the honest marker  | The prototype evidence still holds; the cost lands on brush-zoom and map↔chart linking, which is a scoping input, not a reason to revisit            | **Confirm**   |
| **0028** mobile-first UI standard             | Design at 390 px first                                                         | Confirmed, and it is the real design difficulty in the calendar grid — the month view must be earned at phone width, not scaled down                 | **Confirm**   |
| **0037** Workout visibility                   | Private-by-default inert field; sharing semantics deferred to #337             | Confirmed — sharing is a product line, and the survey ranks all of §8 below the line for a small team                                                | **Confirm**   |

### Suggested sequencing for this codebase

1. **Derivations off data already ingested** — lap table (`lapsJson`),
   per-activity distribution (`phaseBarsJson`), route map (`polyline`), weather
   enrichment. Four shortlist items, no new user input, no new surfaces.
2. **The calendar grid** — week then month, drag-to-move, notes days. It is the
   biggest single gap and it is the surface items 3, 6 and 10 all need to land
   on, so it should come before them rather than after.
3. **The wellness primitive** — daily entry, then trends, then injury/illness
   markers, then a wellness-aware readiness read. One model, four payoffs, and
   its calendar rows now have somewhere to go.
4. **The storage tier** — full-resolution analysis stream plus the load
   recompute and its notice. Unblocks the curve, the best-effort ladder and
   short-rep detection in one move.
5. **Library ergonomics** — date-range filter and totals on the Session Ledger,
   then tags and saved views, then the workout library surface.
6. **Open API and export** — cheapest durable moat available, and mostly a
   re-exposure of queries that already exist.
