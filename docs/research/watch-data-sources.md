# Watch data sources: Garmin, Suunto, Polar, COROS, Wahoo, aggregators and the phone

Where trainm8 can get training data straight from athletes' watches, without
Strava and with Intervals.icu only as a bridge: each vendor's program, what its
terms let an AI or MCP layer do, the aggregators and phone health stores that
could stand in, and the order to build in.

> **Research note · 2026-10-11.** Written from **primary sources**: vendor
> portals, API references and published agreements (Garmin's two agreement PDFs
> and its API Brand Guidelines read in full), vendor help centres, the
> Intervals.icu developer's own forum posts, and Apple's and Google's policy
> pages. The repo side was read at commit `33c10f5`. A verification pass the
> same day re-fetched the source behind 56 load-bearing claims: 50 held, 6 were
> corrected in place (§10), and 5 more sit behind a login, a form or a bot wall.
> Not legal advice.
>
> **Sibling documents.**
> [`watch-data-trainm8-ingest.md`](watch-data-trainm8-ingest.md) is the repo
> side: today's integrations, the FIT pipeline, dedupe, leaving Intervals.icu
> and workout export. [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md)
> holds the Strava gate (§6.1) this note extends to watch vendors.
> [`agent-native.md`](agent-native.md),
> [`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) and
> [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) cover the
> agent layer that would consume this data.

**Marks.** `[KEY]` is a source in the table at the end. _(inference)_ is this
note's reasoning; _(secondary)_ is not the vendor's own source; **not read**
means behind a login, a form or a block. "Allowed" means no prohibiting clause
was found in the public text.

---

## TL;DR

1. **Garmin direct is closed, and its terms just moved.** Every program page
   says "Stay tuned for more updates on the program"; the request form's page
   embeds a "System Maintenance" block dated 2026-03-25 [FORM]. When open, the
   program is business-only and free [FAQ]. On 2026-10-09 new terms "popped up
   in the Garmin developer portal", and Intervals.icu expects to "block access
   to Garmin data via the API soon" [ICU-752]. The new text is not public.
2. **Garmin's published terms have no AI ban but two gates.** §5.2(o) forbids a
   licensee API that serves End User Data to platforms "not approved by Garmin
   in writing": an MCP server [AGR]. The brand guidelines require attribution on
   output of "machine learning models, artificial intelligence" and on data
   passed through "APIs or webhooks" [BRAND].
3. **COROS and Suunto run their own MCP servers.** COROS invites "AI coaching
   apps that analyze training and prescribe workouts", with "No application or
   approval required", and its MCP writes plans [CO2]. Suunto's partner API
   (free, companies only, ≤ 2 weeks' review) adds FIT, webhooks and Guides whose
   `externalId` returns in the recorded FIT [SU1][SU8].
4. **Polar is self-serve; Wahoo needs a lawyer.** Polar is free with no AI
   clause, but needs "explicit Member permission" before data reaches "external
   sources" and serves only 30 days of history [PO2][PO3]. Wahoo bars storing
   "user information" and any app that "supports in any way" a competitor [WA4].
5. **FIT is the common read format; write-back has none.** Aggregators do not
   remove Garmin's approval: Terra, the one close fit, requires your own Garmin
   keys and costs $399–499/month plus $99 for workout push
   [TR-INT][TR-PRICE][TR-PW].
6. **The phone stores bind AI use directly.** HealthKit is the only Apple Watch
   path; Apple 5.1.2(i) requires "explicit permission" before sharing "with
   third-party AI" [AP3]. Garmin, Suunto and COROS reach the stores without
   power or laps. A Capacitor wrapper of the SSR app is the wrong shell [CAP].
7. **Order:** FIT upload as the floor, Intervals.icu as the bridge while it
   lasts; then Polar, COROS (the first plan→watch proof), Suunto; Garmin when it
   reopens, with MCP only after written §5.2(o) approval; Wahoo after legal
   review; native companions when Apple Watch users matter.

## 1. Garmin

### 1.1 Access: closed, business-only, free

- **Status.** The overview, FAQ and API pages all show "Stay tuned for more
  updates on the program" [OV][FAQ][ACT][HLT][TRN][CRS]. The FAQ still says
  "please request the Garmin Connect Developer Program and we'll quickly review
  your application", but no page links the form. The only form links are the
  developer contact form [OV] and, on the Activity and Health pages, a Garmin
  Health corporate-wellness "CONTACT US" [ACT][HLT].
- **The form.** Its page still resolves as "Garmin Connect Developer Program
  Access Request Form" (JavaScript-only). Its embedded content holds a block
  "System Maintenance - Garmin Connect Developer Program", created 2026-03-25,
  updated 2026-05-08, reading "Stay tuned for more updates on the program."
  [FORM]. Submissions were not tested. An integrator: "currently on hold … you
  cannot create a new developer account" [OW]; Terra's blog (2026-09-07) and
  the5krunner (2026-09-14) agree _(secondary)_ [TR-BLOG][5KR].
- **Eligibility and cost.** "There are no licensing or maintenance fees for
  access to the Garmin Connect Developer Program, but it is only for business
  use. Access to some metrics may require a license fee payment or minimum
  device order quantity for commercial use" [FAQ]. The Japanese FAQ demands an
  annual fee or a minimum device purchase [FAQ-JA]. The agreement: "no license
  fees" (§10.1), but fees for excess volume (§10.2) [AGR]. No hobby tier.
- **Process.** A decision "within two business days"; "A typical integration
  takes between 1 and 4 weeks" [FAQ]. Garmin decides "in its sole discretion"
  and may rescind a key at any time (§4.2), terminate on 30 days' notice (§9.2)
  and amend the agreement, "continued use … signifies Licensee's agreement"
  (§16.6) [AGR]: how the October text binds existing partners _(inference)_.
  Activity and Health get "an evaluation environment"; Training tests "against
  the production environment with throttled access" [ACT][TRN]. Launch needs a
  privacy notice with easy withdrawal (§15.4), 24-hour breach reports (§5.1),
  and badges only for "a commercially available integration" [AGR][BR-GC].

### 1.2 The APIs trainm8 would use

- **Activity API.** "Activity data files (.FIT, GPX, .TCX formats)", "Ping/Pull
  or Push Architecture", data only after athletes "sync their device with Garmin
  Connect" [ACT]. Specs, rate and backfill limits are portal-only and
  confidential (§8.1) [AGR]; an integrator reports about a month of backfill,
  once per type _(secondary)_ [OW]. Garmin filters the FIT it serves: it "is not
  the same as what you can download manually", and stripping workout steps was
  "intended behaviour" [ICU-FIT].
- **Training API.** "publish workouts and training plans to the Garmin Connect
  calendar … available for users to sync with their compatible Garmin devices"
  [TRN], permission `WORKOUT_IMPORT` [OAUTH]. Pushing needs notice, Garmin's
  privacy link and "express consent" (§4.5); Garmin may use pushed "Licensee
  Data … for any and all purposes, commercial or otherwise" (§4.6) [AGR]. Garmin
  has owned TrainingPeaks since 2026-07-22 [TP].
- **Health and Courses APIs** are out of scope (GOAL.md: no wellness)
  [HLT][CRS]. Ask only for `ACTIVITY_EXPORT` and `WORKOUT_IMPORT` _(inference)_.
- **OAuth 2.0 PKCE**, server-side ("CORS pre-flight requests (OPTIONS) are not
  supported"). Scopes are fixed; "Users control permissions granted during the
  authorization step" (`/user/permissions`, User_Permission webhook). Token life
  contradicts itself (`"expires_in": 86400` vs "three months"); "a new refresh
  token every time"; `DELETE …/user/registration` on any "Disconnect" [OAUTH].
  ADR 0026's "OAuth 1.0a→2.0 hybrid" is stale. No official Garmin MCP found.

### 1.3 Terms that bind an AI or MCP layer

The global agreement (FRM-0952 Rev. B, PDF created 2023-10-04, Last-Modified
2025-01-07) never mentions AI or machine learning [AGR]. Annex A names Garmin
Würzburg GmbH for EEA data, so this edition applies to trainm8 _(inference)_.

| Clause            | Text (verbatim)                                                                                                                                                                                                                                                                                                                                                                                                                                                    | What it means for trainm8                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §5.2(o)           | shall not "rent, lease, lend, sell, sublicense, assign, distribute, publish, transfer, or otherwise make available, directly or indirectly, the API or any features or functionality of the API to any third party for any reason, including … developing a Licensee application programming interface to provide End User Data to third-party websites, software applications, platforms, services, or products that have not been approved by Garmin in writing" | An MCP server is a "Licensee application programming interface"; Claude and ChatGPT are third-party platforms. Written approval naming them (high confidence). Identical in the 2026-03 China edition, so October is new text or new enforcement |
| §5.2(q)           | shall not "combine or integrate the API with any software, technology, services, or materials, unless authorized (i) herein or (ii) by Garmin in writing"                                                                                                                                                                                                                                                                                                          | Literally reaches an LLM vendor used as in-app processor. Ask (medium)                                                                                                                                                                           |
| §5.2(e)           | shall not "… derive income from the use or provision of the API, whether for direct commercial or monetary gain or otherwise, without Garmin's prior written permission"                                                                                                                                                                                                                                                                                           | A paid tier needs permission _(inference)_                                                                                                                                                                                                       |
| §5.2(t)           | shall not "use the API or any Garmin Brand Feature to compete with Garmin, including displaying any advertising of products or applications that compete with Garmin's products or applications on any part of Licensee Applications"                                                                                                                                                                                                                              | The only example is advertising, but Garmin sells "personalized Active Intelligence insights powered by AI" [CP] and bought TrainingPeaks for "customizable coaching experiences" [TP]. An adaptive planner is an approval risk _(inference)_    |
| §4.1(b)           | use data "(i) solely for internal business purposes, (ii) only to the extent necessary to format and display such data …"                                                                                                                                                                                                                                                                                                                                          | Literally questions even TSS; the brand rules for analytics and AI show Garmin expects derived use _(inference)_                                                                                                                                 |
| §5.1(b), §5.2(a)  | "ensure that the fundamental meaning of the API content is not changed or distorted"; do not "modify or edit any content … when presenting it"                                                                                                                                                                                                                                                                                                                     | Garmin numbers reach the athlete verbatim as structured tool output, not paraphrased                                                                                                                                                             |
| Annex A 1(f)(vii) | retained "For duration of the End User maintaining an account with data importer or until End User exercises rights to delete Personal Data"                                                                                                                                                                                                                                                                                                                       | No cache limit (Strava's is seven days); fits ADR 0012                                                                                                                                                                                           |

### 1.4 Attribution, including AI output

API Brand Guidelines "V 6.30.2025", Last-Modified 2025-08-22 [BRAND]:

- **Combined or derived:** "All uses of Garmin device-sourced data as an input
  to analytics, algorithms, machine learning models, artificial intelligence or
  combined, aggregated or blended with other sources … must include a Garmin
  attribution. This includes any use where the output is influenced materially
  by Garmin device-sourced data." Acceptable: "Insights derived in part from
  Garmin device-sourced data." Not acceptable: "Garmin speed model."
- **Screens:** dashboards, feeds and cards "must include a 'Garmin [device
  model]' attribution … If the device model is not provided or unknown via the
  API, list Garmin as the data source", by the title, above the fold, never "in
  tooltips, footnotes or expandable containers".
- **Downstream:** shared or transmitted data, including via "APIs or webhooks",
  "must include a Garmin attribution"; "In APIs or webhook transfers, receiving
  systems must preserve attribution, and this should be outlined in a partner
  sublicense." Noncompliance "MAY RESULT IN SUSPENSION OR TERMINATION".

For MCP _(inference)_: every tool result carrying a Garmin-sourced or derived
value carries the attribution, per entry or once in a header ("you can apply the
attribution globally"), and narrative output carries the derived line. trainm8
cannot make Claude "preserve attribution" or sign a "partner sublicense" with an
MCP client: ask Garmin (§8). **This binds trainm8 today:** Intervals.icu §1.1
passes the guidelines down [ICU-TERMS], and trainm8 shows none (sibling §6.1).

### 1.5 The China edition (2026-03)

FRM-0952 Rev. B, PDF created 2026-03-03, PRC law [AGR-CN]. Its additions may
preview October's text _(inference)_:

- **§15.10:** a "conspicuous artificial intelligence transparency statement … if
  End User Data will be used for training with, or processing by, artificial
  intelligence systems", with "mechanisms for (i) obtaining explicit consent
  from each End User before initiating any processing of End User Data; (ii)
  allowing End Users to withdraw such consent easily at any time". AI use, even
  training, is **permitted with disclosure and consent**.
- **§6.6:** "no less than thirty (30) calendar days' prior written notice of any
  planned introduction of new content formats, user interfaces, or display
  mechanisms", with mockups, to connect-support@developer.garmin.com. An MCP
  surface is such a mechanism. **§4.1:** sublicensing only "to subcontractors
  approved by Garmin", so an LLM processor needs approval.

### 1.6 The undisclosed September–October 2026 change

- **What was said**, by the Intervals.icu developer in "API access to
  Intervals.icu" [ICU-752]. #752, 2026-10-09 09:05 UTC: "Unfortunately Garmin
  terms and conditions have been updated and It is likely that we will have to
  block access to Garmin data via the API soon. We didn't receive any
  announcement or notification, the new T&C's popped up in the Garmin developer
  portal." The guide's first post repeats it as "Update 9th October 2026"
  [ICU-API]. #759, on FIT files recorded on a Garmin and uploaded by hand:
  "These are likely ok"; on the rest, "mostly we do not have answers for yet".
  #762: new terms only "in the portal popup". #788 (20:36 UTC): "a good call
  with Garmin today … We are continuing to discuss what this means for all
  athletes including those using the API for their own personal analysis".
- **What Garmin shows: nothing new.** Last-Modified: global PDF 2025-01-07,
  China 2026-03-06, brand 2025-08-22, OAuth 2025-06-11; the developer blog's
  newest post (2026-08-25) is about fēnix 9 configs [NEWS].
- **What it restricts.** Redistribution through intermediaries is the one
  evidenced target. Forum users found the published wording unchanged "word for
  word", so "there must be another version we cannot see today" (#785, not
  first-party). AI, MCP, caching and planned-workout pushes (asked in #757) are
  **unknown**; one user reads it as "you won't be able to use any MCPs" (#807).
- **For trainm8.** Intervals.icu is its only Garmin source, so Garmin activities
  may stop with no date given, and the hub copy "Til da har intervals.icu
  allerede Garmin-dataene dine" (`app/utils/labels.ts:4947`) may turn false. An
  athlete's own FIT upload is outside Garmin's developer terms _(inference)_.

## 2. Suunto, Polar, COROS and Wahoo

None of these vendors' public terms has a Strava-style AI or MCP ban; Polar's
and Wahoo's agreements have no AI, ML or MCP clause at all [PO3][WA4].

### 2.1 Suunto (APIZone)

- **Access.** "The API will be provided to companies, organizations who are
  providing tools / apps / services for public audience. We currently don't
  offer the API access for personal use." "We do not charge". Applications are
  "reviewed on weekly bases … maximum two week waiting period" [SU1][SU2]. The
  agreement "will be given on the form": **not read**. Sandbox: 10 calls/minute,
  200/week [SU5]; production limits not read; suunto.com/welcomepartners 403
  [SU11].
- **Data.** Workout API v3 lists by `since`/`until` and exports FIT with HR,
  R-R, power, altitude, GPS and laps per watch [SU1][SU2][SU3][SU4]. Webhooks
  are HMAC-signed, answered "within 2 seconds", retried, with no update or
  delete events [SU7]. OAuth2 with a 24 h JWT plus a subscription-key header
  [SU4][SU6].
- **Write-back: SuuntoPlus Guides.** Steps and repeats with HR, speed, pace,
  power or cadence targets; "nested repeats are not allowed"; an optional
  `localDate`; synced to the watch. "If a workout was recorded using the guide,
  the FIT file exported from the workout will contain this externalId": match
  your client id in the session's `suuntoplus_plugin_owner_id` array, then read
  that index of `suuntoplus_plugin_external_id` [SU8]. Named watches: Suunto 3,
  5 and 9 families; newer ones unverified.
- **AI signal.** Suunto MCP lets "ChatGPT, Claude … read your Suunto data after
  you authorize access" and "is currently read-only" [SU9]; dynamic
  registration, scope `mcp:tools` [SU10]. That says nothing about the partner
  agreement.

### 2.2 Polar (AccessLink v3)

- **Access.** "Any registered Polar Flow user can create API client", no
  approval [PO1]; free "At the moment" (§6) [PO3]; one scope; tokens "will not
  expire unless explicitly revoked"; register users with `POST /v3/users` [PO1].
- **Data.** Exercises with samples, plus FIT, TCX and GPX [PO2]. "Only Exercises
  uploaded to Flow in the last 30 days are returned. Only exercises that have
  been uploaded to Flow after the user is registered with your client will be
  returned." [PO2] HMAC webhooks, one per client, dropped after 7 days of
  failures [PO1]. **No write-back** [PO2]; Polar's TrainingPeaks sync is a
  bespoke partnership [PO4].
- **Terms** ("Latest update: 22 August 2025") [PO3]. §3.1.1: use Data "only
  pursuant to the Member's explicit authorization … ensuring that no Data is
  distributed to external sources without the explicit Member permission".
  §3.1.5: "credit Polar Ecosystem as the source of Data when displaying any
  Data, or any data derived from Data". §2.2: nothing "similar to or competing
  with Polar Ecosystem". §3.3 deletes tokens when the relationship ends; §8.4
  deletes all Data on termination.

### 2.3 COROS

- **Developer MCP.** "No application or approval required"; endpoint
  `https://mcp.coros.com/mcp`, OAuth 2.0, "scoped to the authorizing user only
  (single-user)"; "What you can build: AI coaching apps that analyze training
  and prescribe workouts … Personalized training plan generators". Limits: "No
  webhook push notifications (your app polls the MCP)", "No two-way activity
  sync" [CO2]. Dynamic registration, S256, `openid mcp.tools offline_access`
  [CO7]. COROS frames open access around the EU Data Act [CO4].
- **Data.** "Lap and segment data", ".FIT files, including GPS tracks (capped at
  50 file requests per day)"; "Power data is not part of the standard query
  set", so power comes from the FIT [CO5]. Older history: bulk export [CO9].
- **Write-back, the best of the four.** `createTrainingPlan`,
  `createSingleWorkout`, `scheduleWorkout` and more [CO6]. Plans 4–16 weeks,
  starting within 14 days [CO5]; workouts dated up to 90 days out; new
  structured workouts only for running, cycling and trail running, strength and
  swim only schedulable from the library [CO6]; deletes only in the app [CO5].
- **Partner API.** "Established platform with demonstrated user base",
  "Registered company", "Agreement to COROS API Terms of Use" (unpublished);
  webhooks in ~5 min, FIT, "30-day max, 3-month lookback", `tp/list/push`,
  "1,000 calls/minute"; "Not at scale yet?" points to the MCP [CO3][CO4].
- **Terms tension.** "Use of COROS MCP is subject to the COROS Terms of Service"
  [CO6], which bar "(a) use the Service or any Content for any commercial
  purpose … (c) download or copy account information for the benefit of a third
  party" (April 23, 2023) [CO8]. After a query, retention "is governed by the AI
  platform's own policies" [CO1][CO5].

### 2.4 Wahoo

- **Access.** "currently limiting use of the API to those who request it";
  sandbox apps "cannot later be converted" [WA1]; production review [WA2]; "at
  no charge" for now [WA4]. 5,000 calls/day; 2 h tokens, rotating refresh [WA2].
- **Data.** Summaries plus a FIT `file.url`, no streams; "Wahoo does not share
  completed workout data that originates from third-party applications";
  token-authenticated webhooks with "duplicate webhooks" possible [WA2].
- **Write-back: Plans API**, targets in rpm, watts, HR, speed or relative to FTP
  [WA3], shown only when attached to a workout "scheduled for the current day
  through six days from the current day" [WA2].
- **Terms** [WA4]. Restriction (iii): do not "aggregate, cache, or store
  geographic location information or other user information accessible via the
  Wahoo API", yet "you are encouraged to cache Wahoo Data … (within the limits
  outlined in this Agreement)". Competition: no use "competitive to Wahoo …
  including … in connection with any application … that also includes, features,
  endorses, or otherwise supports in any way a third party that provides
  services competitive to Wahoo's products and services, as determined in our
  sole discretion." Delete "within forty-eight (48) hours" of a request; delete
  a user's Personal Data when they revoke access, unless law or an "agreement
  with the applicable user" requires otherwise; on termination delete all "and
  so certify in writing". "You cannot modify or edit any content, links or
  metadata when displaying Wahoo Data."

### 2.5 Side by side

|                  | Suunto                               | Polar                             | COROS                                   | Wahoo                       |
| ---------------- | ------------------------------------ | --------------------------------- | --------------------------------------- | --------------------------- |
| Who can join     | Companies, public product [SU1]      | Any Flow user, same day [PO1]     | MCP: anyone; Partner: established [CO3] | On request, reviewed [WA1]  |
| FIT per activity | Yes [SU4]                            | Yes, plus TCX, GPX [PO2]          | MCP 50 a day; Partner yes [CO6][CO3]    | Yes [WA2]                   |
| Push to trainm8  | Webhook, HMAC [SU7]                  | Webhook, HMAC [PO1]               | MCP: poll; Partner: webhook [CO2][CO3]  | Webhook, token [WA2]        |
| History          | `since`/`until`, no cap stated [SU4] | 30 days, after registration [PO2] | Partner: 3 months [CO3]                 | Paged, no cap stated [WA2]  |
| Workout to watch | Guides [SU8]                         | No [PO2]                          | Run, trail, bike [CO5]                  | Plans, 0–6 days ahead [WA2] |
| Plan→actual link | `externalId` in the FIT [SU8]        | n/a                               | Not stated                              | `plan_id` [WA2]             |
| Public terms     | **Not read**                         | Yes [PO3]                         | Partner no; consumer ToS yes [CO8]      | Yes [WA4]                   |
| Attribution      | Unknown                              | "credit Polar Ecosystem" [PO3]    | Not stated                              | Media Kit logos [WA4]       |

**Skip Huawei and Zepp.** Huawei Health Kit serves JSON sample sets from
`health-api.cloud.huawei.com`, no FIT, no write-back found, terms not read
[HU1]; Zepp publishes only an on-device SDK [ZE1]. **Reach:** no primary data on
Nordic brand share. ADR 0026 says athletes "actually record with (Garmin,
Suunto, Polar)"; Polar Electro Oy is registered in Kempele, Finland [PO3].

## 3. Aggregators

### 3.1 At a glance

|                             | Terra                                                          | Junction                                         | ROOK                                       | Spike                   | Thryve                        | Open Wearables                |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ----------------------- | ----------------------------- | ----------------------------- |
| Garmin                      | Your own keys ("Required") [TR-INT]                            | Junction's default app [JX-PROV]                 | ROOK's keys [RK-DS]                        | Yes [SP-MX]             | Shared client [TH-DS]         | Your own approval [OW]        |
| Suunto, Polar, COROS, Wahoo | All four; Suunto "Applications no longer open" [TR-INT]        | Suunto "Planned"; Polar, Wahoo; no COROS         | Polar; the rest via phone stores [RK-DS]   | Suunto, Polar, COROS    | Suunto, Polar [TH-DS]         | Suunto, Polar; COROS "Coming" |
| Per-sample workout data     | HR, power, GPS, cadence, **laps**; FIT option [TR-DM][TR-HELP] | HR, power, cadence, GPS; raw [JX-STREAM][JX-RAW] | Granular as a paid add-on [RK-G]           | No Garmin power [SP-MX] | Epochs, no laps [TH-DM]       | Garmin power [OW-COV]         |
| Workout to watch            | **Garmin, COROS, Wahoo, Suunto, Apple** [TR-PWC]               | None found                                       | None found                                 | None found              | None found                    | None found                    |
| Entry price                 | $399–499/mo [TR-PRICE]                                         | $300/mo, 1–500 users [JX-PRICE]                  | $399/mo, ≤ 750 users, 12 months [RK-PRICE] | From $450/mo [SP-PRICE] | €499/mo, 500 users [TH-PRICE] | Hosting only, MIT [OW-LLMS]   |
| EU residency                | UK, NL; US transfer possible [TR-DPA]                          | **Belgium** [JX-REG]                             | Not stated [RK-COMP]                       | Not stated              | **Germany** [TH-PRICE]        | Your host                     |
| MCP                         | Yes [TR-AI]                                                    | None found [JX-LLMS]                             | "coming soon"                              | Enterprise [SP-MCP]     | None found                    | Yes [OW-MCP]                  |

### 3.2 Terra

- **Keys and latency.** Garmin is "Required": "the provider **requires** it in
  there terms that you use dedicated access keys"; Polar, COROS, Wahoo and
  Suunto run on Terra's keys [TR-INT][TR-KEYS]. COROS is "polled by Terra every
  5-10 minutes"; the others are event-driven [TR-INT].
- **Fidelity.** `hr_samples`, `power_samples`, `position_samples` and
  `lap_data.laps` [TR-DM]; Garmin laps "arrive when samples are enabled", swim
  laps come from pool lengths, Garmin "does not publish an activity-deletion
  event", Terra "applies no smoothing", and payloads can arrive "as FIT files"
  [TR-HELP]. Delivery to webhooks, Postgres, S3 or SQS [TR-LLMS].
- **Planned Workouts.** Garmin, COROS, Wahoo, Suunto and more; "Garmin only
  returns workouts that were created by your application's API credentials";
  "Intervals.icu is read only"; no Polar; for Apple the SDK "schedules it in
  Apple WorkoutKit" [TR-PWC]. "$99/month", "20,000 credits per month", a push
  "10 credits ($0.05)" [TR-PW].
- **Pricing.** "$399 per month billed annually, or $499 per month billed
  monthly", 100,000 credits; an active authentication ("one connected data
  source for one end user") costs 200 credits a month with 400 events free; then
  "$0.005 / credit" [TR-PRICE]: about $1 per user and source a month
  _(inference)_.
- **Mobile.** Apple Health, Samsung and Health Connect need a "**mobile app**"
  with Terra's SDK, no Capacitor [TR-SRC][TR-LLMS]; an iOS-only companion app
  exists [TR-HELP]; Samsung needs a partnership [TR-KEYS].
- **Terms** (May 1st, 2026) [TR-TOS]: Output used "solely in such Customer
  Application" (§1.1); Terra keeps Output "except for raw End User data, which
  belongs to the End User" (§1.3); it disclaims a provider's decision to
  "restrict, block, suspend" access (§6); liability is six months of fees (§7).
  DPA: UK and Netherlands, US transfer "may be necessary", deletion within 90
  days [TR-DPA]. MCP per user at `access.tryterra.co/api/v2/mcp/<user_id>`
  [TR-AI].

### 3.3 Junction (formerly Vital)

Garmin, Polar and Wahoo on "Junction default app"; Suunto "Planned"; no COROS
[JX-PROV]. Your own Garmin app needs a Garmin application and, per the docs, a
Grow or Scale plan [JX-BYOO], which the pricing page does not list (Launch $300,
Enterprise) [JX-PRICE]. Streams carry power, cadence and GPS but no laps; a raw
endpoint returns workouts "as received" [JX-STREAM][JX-RAW]. Garmin is push,
Wahoo polled "every 15 minutes or so" [JX-FREQ]. "EU: Data stored in Belgium
(Subject to GDPR)" [JX-REG]. A no-code iOS app syncs HealthKit [JX-APP]. No AI
clause, no MCP [JX-TERMS][JX-LLMS].

### 3.4 ROOK, Spike, Thryve, Sahha and Open Wearables

- **ROOK:** Garmin on its keys; COROS, Suunto and Wahoo only via phone stores
  [RK-DS]; granular Garmin data, no laps, "within minutes" [RK-G]; summaries
  held 15 minutes [RK-PROC]; Capacitor SDK and white-label app [RK-CAP][RK-APP];
  "Core $399/month, up to 750 active users", 12 months [RK-PRICE]. §7.3: "We may
  use Derived Data for internal analytics, benchmarking, and product improvement
  without further consent from You"; §4.4: outputs "may be generated using …
  artificial intelligence"; §4.3(a): the customer warrants all "consents, and
  permissions necessary" [RK-TERMS]; no region stated [RK-COMP].
- **Spike:** no Garmin power; Garmin backfill "Up to 90 days" [SP-MX]; webhooks
  per update [SP-WH]; MCP on Enterprise [SP-MCP]; from $450/month [SP-PRICE].
  ToS §3.10: "You should agree and comply with the API policies & compliance
  agreements of these third-party systems" [SP-TOS].
- **Thryve:** shared clients "without the need to go through tedious approval
  processes" for Garmin, Polar, Suunto; no COROS or Wahoo [TH-DS][TH-OAUTH];
  epoch model [TH-DM]; Garmin Companion needs a licence [TH-GC]; Germany, €499
  for 500 users [TH-PRICE].
- **Sahha** scores wellbeing from phone stores [SA]: a non-goal.
- **Open Wearables:** MIT, self-hosted, your own Garmin approval [OW]; Polar and
  Suunto as summaries [OW-COV]; MCP and a no-code app [OW-MCP][OW-APP].

### 3.5 Terms pass through; lock-in

Garmin's §5.2(o) follows the data [AGR]. Terra makes trainm8 the licensee, so
Garmin's approval is still needed. Junction, ROOK and Thryve hold the licence;
whether it covers trainm8 forwarding data to an LLM or MCP client is for Garmin
and the aggregator to confirm in writing _(inference)_. Spike passes vendor
terms through [SP-TOS]; Terra disclaims them [TR-TOS]; Terra's blog reads the
brand guidelines as covering "analytics and AI results" [TR-BLOG]. Lock-in:
shared-key aggregators own the OAuth relationship, so leaving means every
athlete re-authorises; Terra's Output licence is "limited, revocable" (§1.3);
FIT delivery and raw endpoints reduce schema lock-in.

## 4. Phone health stores and a native app

### 4.1 What the stores hold

- **On the device only.** "iPhone, Apple Watch, and visionOS each have their own
  HealthKit store" [AP1]; Health Connect data "is stored on-device and
  encrypted" [GO1]; neither offers "any sort of web API" [TR-SRC].
- **Apple Watch is full fidelity:** heart rate, route, lap and segment events,
  multisport legs, running power, cycling power and cadence, background delivery
  [AP-HK]; WorkoutKit schedules structured workouts (iOS 17, watchOS 10) [AP4];
  watchOS 10 pairs power meters [AP-NEWS].
- **Health Connect:** `ExerciseSessionRecord` with laps, segments, route and a
  planned-session link, plus power and cadence series [GO-ESR][GO2]; more than
  30 days back needs `READ_HEALTH_DATA_HISTORY` [GO-READ]; planned exercises
  behind `FEATURE_PLANNED_EXERCISE` [GO4]; "Google Fit APIs will be supported
  until the end of 2026" [GO5].
- **Other watches lose power and laps.** Polar → Health Connect: laps, route,
  HR, speed, no power [PO-HC]; Polar → Apple Health: no laps listed [PO-AH];
  Garmin → stores: summaries per press reports _(secondary)_ [TG]; COROS page
  403 [CO-AH]; Suunto → Apple Health: no GPS per users _(secondary)_ [SU-F].
  Samsung needs a partnership [SAMSUNG].

### 4.2 Apple's and Google's rules for AI

- **App Review Guidelines** (Last Updated June 8, 2026) [AP3]. 5.1.2(i): "You
  must clearly disclose where personal data will be shared with third parties,
  including with third-party AI, and obtain explicit permission before doing
  so." 5.1.3(ii): no health data in iCloud; 4.2: "elevate it beyond a repackaged
  website".
- **DPLA §3.3.3(H)** [DPLA]: no disclosure "to a third party without prior
  express end user consent, and then only for purposes of enabling the third
  party to provide health, motion, fitness … services"; the privacy guide limits
  sharing to parties that "also provide a health or fitness service" [AP2].
- **Google Play** [GO3]: prohibited "Sharing health data with third parties
  without explicit, informed user consent"; "Apps (especially AI Agents and
  multi-purpose tools) … should use the Matchmaking API"; no "headless apps".
- _(Inference)_ An in-app LLM gets store data only after an opt-in naming the
  AI; MCP re-exposure is the riskiest case under Apple's fitness-service test. A
  Garmin run read via HealthKit carries Apple's rules, not Garmin's, so each
  Recording must record its path.

### 4.3 The native shell

- **Capacitor around the SSR app is a poor fit.** `server.url`: "This is
  intended for use with live-reload servers. **This is not intended for use in
  production.**" [CAP]; trainm8 is `ssr: true` (`react-router.config.ts:8`), so
  bundling means a separate SPA build _(inference)_. The Capacitor health
  plugins lack power, cadence and laps (`@capgo/capacitor-health` 8.11.8,
  `capacitor-health` 8.4.0, a stale `@perfood/capacitor-healthkit`) [NPM].
- **A thin sync companion** is the realistic shape _(inference)_: device-link
  sign-in, a consent screen that names third-party AI, background workout sync
  to a trainm8 endpoint, later WorkoutKit write-back. React Native libraries
  exist (`@kingstinct/react-native-healthkit` 16.1.0, not in Expo Go;
  `react-native-health-connect` 4.1.3) [RN]. About 5–6 engineer-weeks plus 1–3
  weeks of review; $99 a year and $25 once [APPLE-ENROLL][PLAY-FEE]. The no-code
  alternative is an aggregator's companion app at $300–500 a month.

## 5. Cross-option comparison

| Option                                       | Coverage                                                                       | Fidelity                        | Workout to watch                                                                 | Cost                                  | AI/MCP terms risk                                                                         | Effort                                           | Lock-in                               |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| FIT, TCX, GPX upload (live)                  | Any device that exports a file                                                 | Full file                       | None yet; a FIT workout download is cheap                                        | ~0                                    | Lowest: an athlete's own file is not vendor API data _(inference)_                        | Done                                             | None                                  |
| Intervals.icu bridge (live)                  | Whatever the athlete links; 14 `source` values [ICU-OAS]                       | High: streams, intervals        | Indirect, via its calendar, to Garmin, Suunto, COROS, Wahoo [ICU-UPWO][ICU-PUSH] | Free                                  | Low (no AI clause; Garmin attribution) but **Garmin supply at risk** [ICU-TERMS][ICU-752] | Done                                             | Medium: an extra account per athlete  |
| Garmin direct                                | Garmin, once approved; **closed now**                                          | Highest; FIT filtered [ICU-FIT] | Training API                                                                     | Free; a legal entity                  | **High**: §5.2(o) approval for MCP; attribution on AI output; §5.2(t)                     | High: OAuth, webhooks, approval package          | Low                                   |
| Suunto, Polar, COROS, Wahoo                  | One vendor each                                                                | FIT                             | Suunto Guides, COROS MCP, Wahoo Plans; Polar none                                | Free; all may charge later            | Polar consent; COROS invites AI; Suunto unknown; Wahoo storage and competitor clauses     | ~1.5–2k source lines each; less after a FIT path | Low                                   |
| Terra                                        | Broadest                                                                       | Laps, power, FIT                | Garmin, COROS, Wahoo, Suunto, Apple (+$99/mo)                                    | $399–499/mo + ~$1 per user and source | Two layers; Garmin still needs your own keys                                              | Medium-low                                       | Medium-high                           |
| Junction                                     | No COROS; Suunto planned                                                       | Power streams, no laps          | None                                                                             | $300/mo                               | Shared Garmin licence: ask Junction and Garmin                                            | Medium-low                                       | High: its OAuth app owns the athletes |
| Native companion (HealthKit, Health Connect) | Apple Watch in full; Wear OS; Polar partly; Garmin, Suunto, COROS as summaries | Apple high; rest low            | WorkoutKit; planned exercise                                                     | $99/yr + $25 + 5–6 engineer-weeks     | Explicit consent (Apple 5.1.2(i), DPLA, Play): clear, manageable                          | High: two apps, store review                     | Low                                   |

## 6. AI and MCP terms per source

| Source                       | MCP exposure                                       | In-app LLM                        | Deterministic use                         | Attribution                                                         | Consent                                                       | Clause                                                          | Confidence                                        |
| ---------------------------- | -------------------------------------------------- | --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Garmin direct                | Only with written approval naming the platforms    | Not banned; ask                   | Yes, once approved                        | "Garmin [device model]"; derived line on AI output; kept downstream | Privacy notice, push consent; AI consent in the China edition | [AGR] §5.2(o), (q), (e), (t), §4.1(b); [BRAND]; [AGR-CN] §15.10 | High that approval is needed; October text unseen |
| Garmin via Intervals.icu     | Yes with attribution, while served                 | Yes with attribution              | Yes                                       | Required via Intervals.icu §1.1                                     | None stated                                                   | [ICU-TERMS] §1.1; [ICU-752]                                     | Medium-high on terms; supply at risk              |
| Intervals.icu, other sources | Allowed                                            | Allowed                           | Allowed, commercially too                 | None                                                                | None stated                                                   | [ICU-TERMS] §1                                                  | High                                              |
| Suunto                       | Unknown                                            | Unknown                           | Probably fine                             | Unknown                                                             | Unknown                                                       | Agreement **not read**; own MCP [SU9]                           | Low                                               |
| Polar                        | With explicit Member permission                    | Same; a separate opt-in           | Allowed; disclose storage                 | "credit Polar Ecosystem", derived data too                          | Explicit (§3.1.1)                                             | [PO3] §3.1.1, §3.1.5, §3.1.6, §2.2                              | Medium                                            |
| COROS (developer MCP)        | Allowed in spirit; ToS tension                     | Explicitly invited                | Allowed; 50 FIT a day                     | Not stated                                                          | The athlete's OAuth grant                                     | [CO2]; [CO6]; [CO8]                                             | Medium                                            |
| Wahoo                        | With "prior express consent"                       | With consent and a privacy policy | Ambiguous: (iii) vs "encouraged to cache" | Media Kit logos                                                     | Prior express consent                                         | [WA4]                                                           | Low to medium                                     |
| Terra                        | "solely in such Customer Application": ask         | Same                              | Allowed                                   | The vendor's                                                        | The vendor's                                                  | [TR-TOS] §1.1, §1.3, §6                                         | Medium                                            |
| HealthKit                    | Riskiest: recipient must provide a fitness service | Explicit permission naming the AI | Native app only                           | None                                                                | "prior express end user consent"                              | [AP3] 5.1.2(i); [DPLA]; [AP2]                                   | High                                              |
| Health Connect               | Explicit, informed consent                         | Same                              | Native app only                           | None                                                                | Explicit; Play review                                         | [GO3]                                                           | High                                              |
| The athlete's own FIT upload | Not governed by vendor developer terms             | Same                              | Yes                                       | None required _(inference)_                                         | trainm8's privacy policy                                      | _(inference)_; [ICU-752] #759                                   | High                                              |

## 7. Recommended sourcing strategy and integration order

**Strategy** _(inference)_: own the data path, not the vendor. Make FIT the one
read format; record the **origin platform** and device on every import, since
attribution and the MCP gate hang on it; keep each vendor adapter to OAuth, a
trigger and a FIT URL; give write-back one canonical workout model with a
serializer per target.

**Now, without any approval:** keep FIT upload as the universal floor; harvest
original FITs and `file_id` keys from Intervals.icu while it serves Garmin
(sibling §4); show Garmin attribution, owed today; push planned workouts through
the Intervals.icu calendar to Garmin, Suunto, COROS and Wahoo (sibling §5); send
the §8 outreach (the Suunto application takes up to two weeks).

**Build order:**

1. **Polar AccessLink:** self-serve, public terms, webhooks, FIT; cover the
   30-day gap with upload or the bridge [PO1][PO2].
2. **COROS developer MCP,** once COROS confirms commercial use in writing: FIT
   and laps in, plans out, the first end-to-end plan→watch proof. Polling and 50
   files a day suit trainm8's scale; the Partner API brings webhooks later
   [CO2][CO3][CO6].
3. **Suunto** once accepted: FIT, webhooks, Guides with a deterministic
   `externalId` [SU7][SU8].
4. **Garmin** when it reopens: Activity and Training only, attribution first,
   MCP only after written §5.2(o) approval.
5. **Wahoo** after legal review of restriction (iii) and the competitor clause
   [WA4].
6. **A HealthKit and Health Connect companion** when Apple Watch users matter,
   AI consent in v1.
7. **Terra** only if Garmin stalls or long-tail demand appears; Junction (EU) as
   a Garmin stopgap only with written confirmation from Junction and Garmin.

## 8. Vendor outreach

Send from the company and keep every reply. Portal terms stay out of this
repository: it is private, but §8.1 makes them confidential [AGR].

- **Garmin:** connect-support@developer.garmin.com, the FAQ contact and China
  §6.6 address [FAQ][AGR-CN]; before access, the developer contact form [OV];
  formal notices to Garmin International, Inc., Attn: Legal Department, 1200
  East 151st Street, Olathe, Kansas 66062 (§16.9) [AGR].
- **Suunto:** the APIZone application form, where the agreement is shown [SU1];
  partners@suunto.com, the FAQ's partner-onboarding address [SU2].
- **COROS:** api@coros.com [CO3][CO4].
- **Wahoo:** partnerships@wahoofitness.com; developer questions through API
  Support at `wahooapi.zendesk.com` [WA1].
- **Terra:** sales through tryterra.co (no public sales address found);
  privacy@tryterra.co for the DPA and subprocessors [TR-DPA].

| To     | Question                                                                                                                                                                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Garmin | When will the program accept applications, and will you tell trainm8, a Norwegian company? May we read the October 2026 portal terms first, and do they adopt the China edition's §6.4–6.6 and §15.10 globally?                                                                         |
| Garmin | §5.2(o): may trainm8's own MCP server give an athlete's Garmin-sourced and Garmin-derived data (TSS, CTL/ATL/TSB, adherence) to that athlete's Claude.ai, Claude Desktop and ChatGPT after they authorise it? Please approve these platforms in writing, or say what approval requires. |
| Garmin | §5.2(q): may Garmin data go to an LLM provider acting as our processor (Anthropic, OpenAI) under no-training, no-retention terms?                                                                                                                                                       |
| Garmin | Is a per-value `source: "Garmin Forerunner 965"` plus "Insights derived in part from Garmin device-sourced data" enough in MCP output, given that we cannot bind an MCP client to "preserve attribution"?                                                                               |
| Garmin | §5.2(t) and §5.2(e): is an adaptive planner that pushes workouts "competing with Garmin", and does a paid tier need written permission?                                                                                                                                                 |
| Garmin | §4.6: does your licence to pushed workouts cover cited Catalogue sessions and workouts athletes author and share? What are the Activity API's backfill limits?                                                                                                                          |
| Suunto | Please send the API agreement before we accept it. May we keep FIT files and streams for as long as the athlete has an account?                                                                                                                                                         |
| Suunto | With the athlete's consent, may Suunto data go to an LLM processor, and out through trainm8's MCP server to the athlete's own assistant?                                                                                                                                                |
| Suunto | What attribution applies (welcomepartners returns 403 to us)? What are the production limits, which current watches run Guides, and does every model write the external id?                                                                                                             |
| COROS  | May a commercial, multi-user app use the developer MCP for each athlete's own data, given that the Terms of Service bar "any commercial purpose"?                                                                                                                                       |
| COROS  | May trainm8 store COROS FIT files and derived metrics, and re-expose them through its own MCP server? Can the 50-file daily cap rise for a first backfill?                                                                                                                              |
| COROS  | What user base qualifies for the Partner API, and may we read its API Terms of Use?                                                                                                                                                                                                     |
| Wahoo  | Restriction (iii) forbids storing "user information" while Data Retention encourages caching: may trainm8 keep FIT and GPS as training history?                                                                                                                                         |
| Wahoo  | Does a hub that also supports Garmin, COROS and Suunto "support in any way" a competitor?                                                                                                                                                                                               |
| Wahoo  | When an athlete revokes access, may Recordings stay under an "agreement with the applicable user"? Are LLM summaries "modifying" Wahoo Data, and may data reach an LLM processor or MCP client with consent?                                                                            |
| Terra  | Does "solely in such Customer Application" allow an LLM sub-processor and an athlete-authorised MCP client?                                                                                                                                                                             |
| Terra  | With our own Garmin keys, whose licence covers the data? Can processing stay in the EU, with no US transfer?                                                                                                                                                                            |
| Terra  | Which Garmin targets and repeat structures survive a Planned Workouts push?                                                                                                                                                                                                             |

## 9. Open questions

- Garmin's October terms; whether personal Intervals.icu keys are affected;
  whether blocked activities return as stubs or vanish; when; whether Garmin's
  form accepts submissions; Activity API backfill and ping timing.
- Suunto's agreement and limits; COROS's Partner terms; Polar's brand
  guidelines; Wahoo's Media Kit.
- Which watches read Health Connect planned exercises; what Garmin and COROS
  write to the health stores; Nordic brand share.

## 10. Corrections made during verification

| Claim as drafted                                                          | As corrected                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The pause is dated only by secondary reports                              | Garmin's own form page embeds "System Maintenance - Garmin Connect Developer Program" from 2026-03-25; the Activity/Health form link is a Garmin Health sales contact [FORM] |
| §5.2(t) quoted as "compete with Garmin"                                   | It continues "including displaying any advertising of products or applications that compete with Garmin's products"; the planner reading stays an inference [AGR]            |
| Connect+ sells "personalized insights and suggestions … powered by AI"    | "personalized Active Intelligence insights powered by AI" [CP]                                                                                                               |
| COROS strength and swim limits quoted from its AI page                    | A paraphrase of the MCP README [CO6]                                                                                                                                         |
| Terra: "200 credits per connected source, per end user, per month" quoted | Paraphrase; the page says an active authentication is "one connected data source for one end user", 200 credits a month, 400 events free [TR-PRICE]                          |
| Suunto's external id sits in one FIT field                                | Two session arrays: the owner id gives the index of the external id [SU8]                                                                                                    |

## ADRs this research challenges

| ADR                                           | What it decided                                                                                                          | What this research shows                                                                                                                                                                                                                       | Verdict                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **0026** Integration Hub, key-based providers | Intervals.icu first; Garmin and Suunto "coming soon" behind partner programs; Intervals.icu "already mirrors their data" | The bridge's Garmin supply is at risk [ICU-752]. Suunto takes companies within two weeks [SU1]; Polar and COROS need no approval [PO1][CO2]. Garmin uses OAuth 2.0 PKCE, not "OAuth 1.0a→2.0 hybrid" [OAUTH]. Repo-side staleness: sibling doc | **Amend**: Intervals.icu is a replaceable bridge; Polar and COROS come before Garmin; the hub stops promising Garmin via Intervals.icu |
| **0014** Per-provider folders, no interface   | One folder per provider; "Garmin and Polar planned"; rule of three                                                       | Every vendor serves FIT, so the shared piece is a FIT ingest path, not an interface; write-back has no common format, so serializers stay per folder                                                                                           | **Confirm** the folders; **Amend**: extract FIT-first ingest with the third provider                                                   |
| **0013** Webhook + sync + reconciliation      | Three trigger layers per provider                                                                                        | Fits Suunto, Polar, Wahoo and Garmin. The COROS developer MCP is poll-only; Polar drops a webhook after 7 days of failures [PO1][CO2]                                                                                                          | **Confirm**, noting poll-only providers                                                                                                |
| **0012** Disconnect preserves Recordings      | Disconnect and source deletes keep promoted Recordings                                                                   | Fits Garmin (retention while the athlete keeps an account) and Polar (delete tokens). Wahoo wants a user's personal data deleted on revocation unless an "agreement with the applicable user" says otherwise [AGR][PO3][WA4]                   | **Amend** before Wahoo ships: a per-vendor rule or an explicit athlete agreement                                                       |
| **0051** The Catalogue has four axes          | A cited Catalogue of stock and shared workouts; authorship is asserted                                                   | A session pushed through Garmin's Training API becomes "Licensee Data" Garmin may use "for any and all purposes, commercial or otherwise" (§4.6) [AGR]                                                                                         | **Note**: decide what may be pushed before the Training API ships                                                                      |

## Sources

All fetched or downloaded 2026-10-11. Keys group related pages.

| Key                                                   | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OV]                                                  | https://developer.garmin.com/gc-developer-program/overview/ ; contact form https://www.garmin.com/en-US/forms/developercontactus/                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [FAQ] [FAQ-JA] [FORM]                                 | https://developer.garmin.com/gc-developer-program/program-faq/ ; https://developer.garmin.com/gc-developer-program/program-faq-japanese/ · Access Request Form page (JavaScript shell; embedded content read): https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [ACT] [HLT] [TRN] [CRS]                               | https://developer.garmin.com/gc-developer-program/activity-api/ · https://developer.garmin.com/gc-developer-program/health-api/ · https://developer.garmin.com/gc-developer-program/training-api/ · https://developer.garmin.com/gc-developer-program/courses-api/                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [AGR]                                                 | Agreement, global, FRM-0952 Rev. B (created 2023-10-04; Last-Modified 2025-01-07): https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [AGR-CN]                                              | Agreement, Garmin China edition (created 2026-03-03; Last-Modified 2026-03-06): https://www8.garmin.com/en-US/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT_EN.pdf                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [BRAND] [BR-GC]                                       | API Brand Guidelines V 6.30.2025: https://developer.garmin.com/downloads/brand/Garmin-Developer-API-Brand-Guidelines.pdf (from https://developer.garmin.com/brand-guidelines/api-brand-guidelines/) ; https://developer.garmin.com/brand-guidelines/connect/                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [OAUTH]                                               | OAuth2.0 PKCE Specification (2025-06-11): https://developerportal.garmin.com/sites/default/files/OAuth2PKCE.pdf ; endpoints in it: https://connect.garmin.com/oauth2Confirm , https://connectapi.garmin.com/di-oauth2-service/oauth/token , https://apis.garmin.com/wellness-api/rest/user/permissions , https://apis.garmin.com/wellness-api/rest/user/registration ; §4.5 privacy link https://www.garmin.com/privacy/connect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [NEWS] [TP] [CP]                                      | https://forums.garmin.com/developer/connect-iq/b/news-announcements ; 2026-07-22: https://www.garmin.com/en-US/newsroom/press-release/corporate/garmin-acquires-trainingpeaks-and-trainheroic-leading-endurance-and-strength-training-platforms-for-athletes-and-coaches/ ; 2025-03-27: https://www.garmin.com/en-US/newsroom/?p=5556                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [5KR] [OW]                                            | _(secondary)_ https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/ (403 on re-fetch) ; https://openwearables.io/docs/providers/garmin-api-integration.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [ICU-TERMS] [ICU-API]                                 | API Terms (effective 2025-10-23): https://forum.intervals.icu/t/intervals-icu-api-terms-and-conditions/114087 ; "API access to Intervals.icu", first post rev. 15: https://forum.intervals.icu/t/api-access-to-intervals-icu/609                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [ICU-752]                                             | #752 https://forum.intervals.icu/t/api-access-to-intervals-icu/609/752 (also https://forum.intervals.icu/t/609/752) · #759 https://forum.intervals.icu/t/api-access-to-intervals-icu/609/759 · #762 https://forum.intervals.icu/t/api-access-to-intervals-icu/609/762 · #780–785 https://forum.intervals.icu/t/api-access-to-intervals-icu/609/780 · #788 https://forum.intervals.icu/t/api-access-to-intervals-icu/609/788 · #807 https://forum.intervals.icu/t/api-access-to-intervals-icu/609/807                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [ICU-UPWO] [ICU-PUSH] [ICU-FIT] [ICU-OAS]             | https://forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624 ; Garmin https://forum.intervals.icu/t/1521 , Suunto https://forum.intervals.icu/t/9560 , COROS https://forum.intervals.icu/t/coros-support-added/37006 , Wahoo https://forum.intervals.icu/t/65949 · https://forum.intervals.icu/t/124287/7 ; https://intervals.icu/api/v1/docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [SU1]–[SU6]                                           | https://apizone.suunto.com/ · https://apizone.suunto.com/faq · https://apizone.suunto.com/developer/apis?api-version=2022-04-01-preview · `https://apizone.suunto.com/developer/apis/{suunto-workout-api,suunto-guides-api,oauth2-api,new-247-api}/operations?api-version=2022-04-01-preview` · https://apizone.suunto.com/developer/products?api-version=2022-04-01-preview · https://apizone.suunto.com/how-to-start                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [SU7]–[SU11]                                          | https://apizone.suunto.com/webhooks · https://apizone.suunto.com/suuntoplus-guide-description · https://mcp.suunto.com/mcpguide · https://mcp.sports-tracker.com/.well-known/oauth-authorization-server · https://www.suunto.com/welcomepartners (403)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [PO1]–[PO4]                                           | https://www.polar.com/accesslink-api/ (admin https://admin.polaraccesslink.com) · https://www.polar.com/accesslink-api/swagger.yaml · https://www.polar.com/en/legal/polar-api-agreement · https://support.polar.com/en/updates/trainingpeaks-integration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [CO1]–[CO5]                                           | https://support.coros.com/hc/en-us/articles/53181260265492-Connect-Your-Data · https://support.coros.com/hc/en-us/articles/53181619102996-Build-on-COROS-MCP · https://support.coros.com/hc/en-us/articles/53181766856724-Partner-API-Access · https://support.coros.com/hc/en-us/articles/17085887816340-Submit-an-API-Application · https://support.coros.com/hc/en-us/articles/50841795180948-Connect-Your-COROS-to-AI (read via `https://support.coros.com/api/v2/help_center/en-us/articles/{id}.json`)                                                                                                                                                                                                                                                                                                                                                                                                              |
| [CO6]–[CO9]                                           | https://github.com/coroslab/COROS-MCP · https://mcp.coros.com/.well-known/oauth-authorization-server and https://mcp.coros.com/.well-known/oauth-protected-resource/mcp (endpoint https://mcp.coros.com/mcp) · https://coros.com/terms · https://support.coros.com/hc/en-us/articles/33125636125204-Bulk-Export-Historical-Activity-Data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [WA1]–[WA4]                                           | https://developers.wahooligan.com/cloud · https://cloud-api.wahooligan.com/ · https://cloud-api.wahooligan.com/docs/plan-json-format.pdf · https://www.wahoofitness.com/wahoo-api-agreement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [HU1] [ZE1] [CAP] [NPM] [RN]                          | https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/overview-0000001177423513 (endpoint https://health-api.cloud.huawei.com/healthkit/v2/dataCollectors) · https://docs.zepp.com/ · https://capacitorjs.com/docs/config · `https://registry.npmjs.org/<pkg>`, https://github.com/Cap-go/capacitor-health , https://github.com/mley/capacitor-health · https://github.com/kingstinct/react-native-healthkit , https://github.com/matinzd/react-native-health-connect                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [TR-INT] [TR-KEYS] [TR-SRC] [TR-DM] [TR-LLMS] [TR-AI] | https://docs.tryterra.co/reference/health-and-fitness-api/supported-integrations.md · https://docs.tryterra.co/unified-api/integration-setup/dedicated-data-source-api-keys.md · https://docs.tryterra.co/unified-api/integration-setup/setting-up-data-sources.md · https://docs.tryterra.co/reference/health-and-fitness-api/data-models.md · https://docs.tryterra.co/llms.txt · https://docs.tryterra.co/ai-interface/ai-interface.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [TR-HELP]                                             | https://docs.tryterra.co/help-center/help-topics/data-api-sdk/provider-coverage-and-per-provider-data-availability/garmin-activity-gps-laps-location.md · https://docs.tryterra.co/help-center/help-topics/data-api-sdk/provider-coverage-and-per-provider-data-availability/garmin-swim-laps-vs-lengths.md · https://docs.tryterra.co/help-center/help-topics/data-api-sdk/webhooks-dedup-and-sync-reliability/garmin-deleted-activities-persist.md · https://docs.tryterra.co/help-center/help-topics/data-api-sdk/data-model-fields-and-units/no-smoothing-sample-array-length-mismatch.md · https://docs.tryterra.co/help-center/help-topics/data-api-sdk/account-config-environments-and-going-live/payload-simulator-fit.md · https://docs.tryterra.co/help-center/help-topics/connecting/apple-health-health-connect-and-mobile-sdk/use-terra-avengers-companion-app.md                                            |
| [TR-PWC] [TR-PW]                                      | https://docs.tryterra.co/planned-workouts-api/provider-compatibility.md · https://docs.tryterra.co/planned-workouts-api/pricing.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [TR-PRICE] [TR-TOS] [TR-DPA] [TR-BLOG]                | https://tryterra.co/pricing · https://tryterra.co/terms-of-service · https://tryterra.co/dpa (subprocessors https://www.tryterra.co/privacy/subprocessors) · 2026-09-07 https://tryterra.co/blog/garmin-connect-developer-program-pause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [JX-…]                                                | PROV https://docs.junction.com/wearables/providers/introduction.md · BYOO https://docs.junction.com/wearables/connecting-providers/bring-your-own-oauth/overview.md · STREAM https://docs.junction.com/api-reference/data/workouts/get-stream.md · RAW https://docs.junction.com/api-reference/data/workouts/get-raw.md · FREQ https://docs.junction.com/wearables/providers/update-frequency.md · REG https://docs.junction.com/api-details/regions.md · PRICE https://www.junction.com/pricing · APP https://docs.junction.com/wearables/vital-app/introduction.md · TERMS https://www.junction.com/terms · LLMS https://docs.junction.com/llms.txt                                                                                                                                                                                                                                                                     |
| [RK-…]                                                | DS https://docs.tryrook.io/data-sources/ · G https://docs.tryrook.io/data-sources/garmin/ · PROC https://docs.tryrook.io/docs/rookconnect/data_processing/ · CAP https://docs.tryrook.io/docs/rookconnect/sdk/capacitor/fundamentals/manualsync/ · APP https://docs.tryrook.io/docs/ROOKExtractionApp/introduction/ · PRICE https://www.tryrook.io/pricing · TERMS https://www.tryrook.io/terms-rook-connect/ · COMP https://www.tryrook.io/compliance/                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [SP-…] [SA]                                           | MX https://docs.spikeapi.com/technical-references/provider_matrix.md · WH https://docs.spikeapi.com/api-docs/webhooks.md · MCP https://docs.spikeapi.com/mcp-docs/overview.md · PRICE https://www.spikeapi.com/pricing · TOS https://www.spikeapi.com/terms-of-service · Sahha https://docs.sahha.ai/llms.txt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [TH-…]                                                | DS https://docs.thryve.health/thryve-data-sources/overview.md · OAUTH https://docs.thryve.health/thryve-data-sources/overview/shared-and-custom-oauth-clients.md · DM https://docs.thryve.health/thryve-product-overview/access/data-model.md · GC https://docs.thryve.health/thryve-data-sources/garmin-health-companion.md · PRICE https://www.thryve.health/pricing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [OW-…]                                                | LLMS https://openwearables.io/llms.txt · COV https://openwearables.io/docs/providers/coverage.md · MCP https://openwearables.io/docs/mcp-server/index.md · APP https://openwearables.io/docs/app/introduction.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [AP1]–[AP4] [DPLA] [APPLE-ENROLL] [PLAY-FEE]          | https://developer.apple.com/documentation/healthkit/about-the-healthkit-framework · https://developer.apple.com/documentation/healthkit/protecting-user-privacy · https://developer.apple.com/app-store/review/guidelines/ · https://developer.apple.com/documentation/workoutkit and https://developer.apple.com/documentation/workoutkit/workoutscheduler · https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ · https://developer.apple.com/programs/enroll/ · https://support.google.com/googleplay/android-developer/answer/6112435                                                                                                                                                                                                                                                                                                                                                |
| [AP-HK] [AP-NEWS]                                     | https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartrate · https://developer.apple.com/documentation/healthkit/hkworkoutroute · https://developer.apple.com/documentation/healthkit/hkworkouteventtype/lap · https://developer.apple.com/documentation/healthkit/hkworkouteventtype/segment · https://developer.apple.com/documentation/healthkit/hkworkoutactivity · https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/runningpower · https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/cyclingpower · https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/cyclingcadence · `https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)` · https://www.apple.com/newsroom/2023/06/introducing-watchos-10-a-milestone-update-for-apple-watch/ |
| [GO1]–[GO5] [GO-ESR] [GO-READ]                        | https://developer.android.com/codelabs/health-connect · https://developer.android.com/health-and-fitness/guides/health-connect/plan/data-types · https://support.google.com/googleplay/android-developer/answer/12991134 · https://developer.android.com/health-and-fitness/health-connect/features/training-plans and https://developer.android.com/health-and-fitness/guides/health-connect/develop/training-plans · https://developer.android.com/health-and-fitness/health-connect · https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseSessionRecord · https://developer.android.com/health-and-fitness/health-connect/read-data                                                                                                                                                                                                                                          |
| [PO-HC] [PO-AH] [CO-AH] [SU-F] [TG] [SAMSUNG]         | https://support.polar.com/en/flow-app-health-connect · https://support.polar.com/us-en/support/connecting_polar_flow_with_apple_health · https://support.coros.com/hc/en-us/articles/360041549551-Connecting-Apple-Health-with-COROS-App (403) · _(secondary)_ https://forum.suunto.com/topic/2599/suunto-app-is-not-pushing-data-to-apple-health · _(secondary)_ https://www.tomsguide.com/wellness/fitness-trackers/garmin-clarifies-what-data-its-sharing-with-google-health-connect-heres-the-full-list · https://developer.samsung.com/health/data/overview.html                                                                                                                                                                                                                                                                                                                                                     |
| Repo                                                  | GOAL.md; ADRs 0012, 0013, 0014, 0026, 0051; `app/utils/labels.ts`; `react-router.config.ts`; [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) §6.1; [`watch-data-trainm8-ingest.md`](watch-data-trainm8-ingest.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
