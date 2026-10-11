# trainm8's agent surface: what an agent could call, read and undo today

An inventory of trainm8's write paths, read paths and safety rails, made to
judge how ready the app is to grow an agent layer: typed actions shared by the
UI and an agent, one shared database, an agent that knows what is on screen, and
agent writes the athlete can see and take back.

> **Research note · 2026-10-11.** Written from **this repository at commit
> `6638406`** (main, 2026-10-11), read-only. No external sources: every claim is
> a `file:line` in the repo or an ADR. A verification pass the same day re-read
> 333 `file:line` citations against that commit by script, recounted the action
> modules with `grep`, and checked the claims attached to them. Seven claims
> were corrected and six citations tightened in place; the rest held.
>
> **Sibling documents.** [`agent-native.md`](agent-native.md) analyses
> Builder.io's agent-native framework and asks whether to adopt it or carry its
> principles into this codebase.
> [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) is the MCP deep-dive
> and proposes a trainm8 tool surface.
> [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) surveys the
> libraries an agent layer could be built from. This note is the repo side that
> all three lean on.

**How citations read.**

- Route modules are relative to `app/routes/` (`_home/index.tsx:291`).
- Services and schemas are relative to `app/utils/` (`day-stamp.server.ts:75`,
  `load/week-change-schema.ts:48`). The one exception is `integrations/…`, which
  is relative to `app/`.
- Everything else is relative to the repo root (`prisma/schema.prisma`,
  `server/index.ts`, `docs/adr/…`).
- A bare `:N` points into the file named last in the same cell or sentence.

**Seam key**, used in every table:

- **C**, clean: the route only parses, calls one owner-scoped service and maps
  the result, so the service can be wrapped as a tool as it is.
- **P**, partial: the service exists, but some ordering, a check or a follow-up
  step lives in the route.
- **I**, inlined: Prisma or business rules sit in the route itself.

## 1. Write paths

`app/routes` has **70 route modules that export `action`**. The count is a
`grep` for `export … function action` / `export const action` /
`export { action }`, minus the files the route config ignores (`app/routes.ts`:
`*.server.*`, `__*`, tests). `admin/cache/sqlite.tsx` counts through its
`export { action }` re-export; its `sqlite.server.ts` does not count.

They share these conventions:

- **Auth first.** Every trainm8-domain action starts by resolving the user. 48
  call `requireUserId` (`auth.server.ts:49`) directly. Seven go through wrappers
  over it: `requireUserWithRole` for `/admin` (2) and `requireFirstRunAthlete`
  for `/start` (5). The 15 that don't are Epic Stack's auth routes (10), the
  catch-all `$.tsx`, the theme and dev-athlete switches, the Strava webhook (it
  checks the payload's subscription id) and LiteFS cache replication (bearer
  token).
- **Intent.** It is a string form field, dispatched by `if`/`switch`.
- **Validation.** Either Conform `parseWithZod`, or
  `Schema.safeParse(Object.fromEntries(formData))`.
- **Service results.** Services return
  `{ ok: true, … } | { ok: false, reason }`. The route maps `reason` to a
  Norwegian sentence from `app/utils/labels.ts` (the twelve `*_REFUSAL_LABELS`
  maps) and to a status: 404 for not-yours or gone, 409 for refused.
- **Owner-scoping.** Done inside the services (`where: { id, userId }`).

### 1a. I dag: the composer and row actions (Workout Session)

| Route (action line)                | URL                          | intents                                | Entity                                 | Validation                                                                                                                          | Server work                                                                                      | Seam |
| ---------------------------------- | ---------------------------- | -------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| `_home/index.tsx:291`              | `/`                          | `dismiss-load-recompute-notice` (:296) | Load Recompute Notice                  | manual `invariantResponse`                                                                                                          | `dismissLoadRecomputeNotice` `load/recompute-notice.server.ts:69`                                | C    |
| same                               | `/`                          | `stamp-day` (:325)                     | Workout Session (Day Stamp)            | `ComposerExtrasSchema` `writing-line-schema.ts:26` + manual date/discipline                                                         | `stampSessionOnDay` `day-stamp.server.ts:75` + `finishComposerWrite` (`day-stamp.server.ts:225`) | P    |
| same                               | `/`                          | `write-session` (:378)                 | Workout Session (Writing Line)         | `WriteSessionSchema` `writing-line-schema.ts:44`; sentence re-read server-side by `parseWorkoutSentence` `workout-sentence.ts:1409` | `writeSessionOnDay` `day-stamp.server.ts:112`                                                    | P    |
| same                               | `/`                          | `place-session` (:441)                 | Workout Session from a Catalogue Entry | `PlaceSessionSchema` `writing-line-schema.ts:60`                                                                                    | `readRetrievableEntry` `catalogue.server.ts:404` + `placeCatalogueSession` :459                  | P    |
| same                               | `/`                          | `copy-session` (:478)                  | Workout Session copy                   | `CopySessionSchema` `writing-line-schema.ts:67`                                                                                     | inline `prisma.workoutSession.findFirst` + `copySessionToDay` `day-stamp.server.ts:173`          | P    |
| same                               | `/`                          | `undo-stamp` (:518)                    | Workout Session delete (ADR 0076/0088) | manual                                                                                                                              | `undoDayStamp` `day-stamp.server.ts:155` (wraps `deleteWorkoutSession` `workout.server.ts:431`)  | P    |
| `resources/session-done.tsx:30`    | `/resources/session-done`    | (none) = _Gjort_; `undo` (:33)         | Session Status (completed)             | `SessionDoneSchema` / `SessionDoneUndoSchema` `import-link-schema.ts:74,84`                                                         | `markSessionDone` `workout.server.ts:550`, `undoMarkSessionDone` :646                            | C    |
| `resources/session-annet.tsx:19`   | `/resources/session-annet`   | (none)                                 | Annet (`countsInNoTrack`)              | `SessionAnnetSchema` `session-annet-schema.ts:13`                                                                                   | `setCountsInNoTrack` `workout.server.ts:711`                                                     | C    |
| `resources/session-release.tsx:14` | `/resources/session-release` | (none) = _Lås opp_                     | Session Release                        | `SessionReleaseSchema` `load/week-change-schema.ts:65`                                                                              | `releaseSession` `load/week-replan-answers.server.ts:323`                                        | C    |

The P rows are P because of `isPostableDay` (`_home/index.tsx:212`) and
`landComposerWrite` (:238), which hold the window rule, the ordering of write
then extras, and the week-sum toast. Both are private functions in the route.
`withWeekSumToast` (`writing-line.server.ts:75`) returns toast headers, which
ties it to the UI.

### 1b. Workout Session detail, authoring and Session Log

| Route                                  | URL                      | intents                                       | Entity                    | Validation                                                                                           | Server work                                                                                                  | Seam |
| -------------------------------------- | ------------------------ | --------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---- |
| `training/sessions.new.tsx:113`        | `/training/sessions/new` | (none)                                        | Workout + Workout Session | Conform `FormSchema` `workout-authoring.ts:76` then `WorkoutAuthoringSchema` `workout-schema.ts:640` | `createWorkoutSession` `workout.server.ts:1407`                                                              | P    |
| `training/sessions.$sessionId.tsx:439` | `/training/sessions/:id` | `delete` (:446)                               | Workout Session           | manual                                                                                               | inline read + `withWeekSumToast` + `deleteWorkoutSession` `workout.server.ts:431`                            | P    |
| same                                   |                          | `mark-missed` (:475)                          | Session Status (missed)   | none                                                                                                 | `markSessionMissed` `workout.server.ts:464`                                                                  | C    |
| same                                   |                          | `relink` / `detach` (:490)                    | Recording link            | manual                                                                                               | `relinkRecordingToSession` `activity-import.server.ts:509`, `undoImportLink` `import-link.server.ts:315`     | P    |
| same                                   |                          | `redetect` (:527)                             | Structure Detection       | gate inline (:536)                                                                                   | `runStructureDetection` `structure-detection/detect-job.server.ts:132`                                       | P    |
| same                                   |                          | `saveWorkout` field (:559), inline token edit | Workout prescription      | `FormSchema` then `WorkoutAuthoringSchema`                                                           | `updateWorkoutSession` `workout.server.ts:1293` (refuses `logged-sets`)                                      | P    |
| same                                   |                          | (fallthrough) Session Log                     | Session Log + RPE         | `SessionLogSchema` (route :183)                                                                      | `upsertSessionLog` `session-log.server.ts:81`. **Not owner-scoped**: the route checks ownership first (:684) | I/P  |

The full editor's input is form-shaped (`buildBlocksInput`), while the service
takes a typed `WorkoutAuthoringInput`. The Writing Line (`write-session`) gives
an agent a far easier way to author a session.

### 1c. Week Replan and Ukeskiftet (ADR 0080)

| Route                          | URL                      | intents                          | Entity               | Validation                                                                     | Server work                                                                                                                                                                      | Seam                   |
| ------------------------------ | ------------------------ | -------------------------------- | -------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `resources/week-change.tsx:29` | `/resources/week-change` | `answer`, `accept-round`, `ease` | Week Replan Proposal | `WeekChangeActionSchema` (discriminated union) `load/week-change-schema.ts:48` | `answerProposal` `load/week-replan-answers.server.ts:61`, `acceptRoundWithFactor` :78, `easeWeek` :200; reply also carries `readWeekChange` `load/week-change-card.server.ts:68` | **C, the model route** |

The machine writes with no route at all: `runWeekChangeForUser`
(`load/week-change.server.ts:79`, hourly job `week-change`) leads to
`recordProposals` (`load/week-replan-proposals.server.ts:73`), then
`applyDueProposals` (:114, silence), then the horizon fill through
`stampWeekPattern` (`plan-outline/stamp.server.ts:234`).

### 1d. Imports and Recording linking

| Route                          | URL                      | intents                                                  | Entity                                               | Validation                                                                                              | Server work                                                                                                               | Seam               |
| ------------------------------ | ------------------------ | -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `resources/import-link.tsx:30` | `/resources/import-link` | `link`, `keep`, `annet`, `undo`, `relink`, `undo-answer` | Activity Import ↔ Workout Session ("hva var dette?") | `ImportLinkActionSchema` `import-link-schema.ts:55`                                                     | `answerImportQuestion` `import-link.server.ts:149`, `undoImportAnswer` :238, `undoImportLink` :315, `redoImportLink` :339 | C                  |
| `imports.upload.tsx:42`        | `/imports/upload`        | (none)                                                   | Activity Import (file)                               | multipart + `DisciplineOverrideSchema` (:38)                                                            | `ingestActivityFile` `activity-file-ingest.server.ts:161` / `ingestUploadedFiles` :265                                    | C                  |
| `imports.share-target.tsx:25`  | `/imports/share-target`  | (none)                                                   | Activity Import (PWA share)                          | multipart                                                                                               | `ingestUploadedFiles`                                                                                                     | C                  |
| `webhook.strava.tsx:42`        | `/webhook/strava`        | (none)                                                   | Job                                                  | subscription-id check (`parseStravaWebhookEvent`); the verify token guards only the GET handshake (:19) | `enqueueJob` `jobs/queue.server.ts:17`                                                                                    | C (not for agents) |

### 1e. Strength (ADR 0056–0064)

| Route                                                  | URL                            | intents                                                          | Entity                                | Validation                                                                         | Server work                                                                                                                  | Seam |
| ------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| `resources/strength-log.tsx:50`                        | `/resources/strength-log`      | `as-planned`, `edited`, `undo`                                   | Exercise Set Log (Quick Strength Log) | `StrengthLogActionSchema` `strength-quick-log.ts:117`                              | `logStrengthSession` `strength-quick-log.server.ts:138`, `undoQuickLog` :253                                                 | C    |
| `training/sessions.$sessionId_.log.tsx:258`            | `/training/sessions/:id/log`   | `finish-session` (:267), `clear-set` (:308), (default) log a set | Exercise Set Log                      | `LogSetSchema` (route :207), then form-to-`LoadValue` conversion inline (:230–330) | `finishStrengthSession` `strength-runner.server.ts:80`, `clearLoggedSet` `strength-log.server.ts:1066`, `saveLoggedSet` :768 | P    |
| `training/programs.$programId.start.tsx:63`            | `/training/programs/:id/start` | `start-program`                                                  | Program Instance                      | `StartProgramSchema` (route :50)                                                   | `startProgram` `strength-program.server.ts:502`                                                                              | C    |
| `training/programs.run.$instanceId.tsx:128`            | `/training/programs/run/:id`   | `open-session`, `set-working-weight`, `end-program`              | Program Instance, working weight      | `OverviewSchema` (route :64)                                                       | `openNextProgramSession` :1199, `setWorkingWeight` :2309, `endProgram` :2337 (`strength-program.server.ts`)                  | C    |
| `settings/training/lifts.$exerciseId.tsx:163`          | `/settings/training/lifts/:id` | `add-anchor`                                                     | Exercise Threshold (stated anchor)    | `AddAnchorSchema` (route :143)                                                     | `recordStatedAnchor` `strength-anchors.server.ts:236`                                                                        | C    |
| `settings/training/lifts.$exerciseId_.propose.tsx:144` | `…/propose`                    | `accept-estimate`                                                | Exercise Threshold (proposed 1RM)     | `AcceptSchema` (route :122)                                                        | `acceptProposedExerciseOneRm` `strength-anchors.server.ts:470`                                                               | C    |
| `settings/training/gym.tsx:88`                         | `/settings/training/gym`       | (none)                                                           | Plate Inventory                       | `GymSchema` (route :76)                                                            | `saveGymProfile` `plate-inventory.server.ts:106`                                                                             | C    |
| `training/exercises.ts:17`                             | `/training/exercises`          | (none)                                                           | custom Exercise                       | `CreateExerciseSchema` (route :8)                                                  | `createCustomExercise` `workout.server.ts:1713`                                                                              | C    |

### 1f. Sesong: Plan Outline authoring (`training/plan.tsx:904`, one action with 31 intents)

Validation is mostly per-field parsers defined in the route (`IdField`,
`NameField`, `WeeksField`, …, plan.tsx:365–470 and :790–870). The services then
**re-parse their own domain schemas** from `plan-outline/authoring-schema.ts`
(for example `addPhase` runs `PhaseAddSchema.parse`,
`authoring.server.ts:1435`). Unless noted, every service below is in
`app/utils/plan-outline/authoring.server.ts`.

| intent (plan.tsx line)                                           | Entity                                      | Server fn                                                                                                                                                                                     | Seam |
| ---------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `add-phase` (914), `move-phase` (938), `remove-phase` (947)      | Plan Outline phase                          | `addPhase` :1431, `movePhase` :1549, `removePhase` :1585                                                                                                                                      | C    |
| `add-track` (955), `remove-track` (977)                          | Training Track                              | `addTrack` :762, `removeTrack` :852                                                                                                                                                           | C    |
| `add-/rename-/move-/remove-week-pattern` (988, 1023, 1034, 1043) | Week Pattern                                | `addWeekPattern` :2470, `renameWeekPattern` :2626, `moveWeekPattern` :2642, `removeWeekPattern` :2675                                                                                         | C    |
| `start-week-pattern` (999)                                       | Week Pattern, then the weeks are laid       | `createStarterWeekPattern` :2524, then route-private `fillToHorizon` (plan.tsx:1453)                                                                                                          | P    |
| `add-/move-/remove-week-pattern-day` (1049, 1093, 1102)          | Week Pattern day                            | `addWeekPatternDay` :2724 (+ `fillAfterDay` plan.tsx:1463), `moveWeekPatternDay` :2782, `removeWeekPatternDay` :2816                                                                          | P/C  |
| `copy-week` (1113)                                               | Workout Sessions (week copy)                | `copyWeekOnto` (plan.tsx:1722) → `copyWeek` `copy-week.server.ts:112`; `WeekCopySchema.replace` must be true to overwrite (`copy-week.ts:155`, field at :164)                                 | C    |
| `add-/set-/remove-season-anchor` (1119–1123)                     | Season Anchor                               | `setSeasonAnchorValue` :951, `removeSeasonAnchorSegment` :1001                                                                                                                                | C    |
| `set-segment-rates` (1137), `set-quality-mix` (1139)             | Training Track segment, Quality Session Mix | `setEnduranceSegment` :1876, `setQualitySessionMix` :1932                                                                                                                                     | C    |
| `add-/set-/remove-strength-segment` (1142–1146)                  | strength segment                            | `addStrengthSegment` :2163, `setStrengthSegment` :2237, `removeStrengthSegment` :2312                                                                                                         | C    |
| `apply-preset` (1153)                                            | Periodization Preset applied                | `applyPreset` :1664                                                                                                                                                                           | C    |
| `fit-to-event` (1185)                                            | Season Fit                                  | `fitPlanToEvent` :1794 (recomputes the proposal server-side)                                                                                                                                  | C    |
| `attach-event` (1203)                                            | Target Event on an open-ended plan          | `AttachEventFormSchema` `attach-event-schema.ts`; `attachEventToOutline` `open-ended.server.ts:216`, `addRaceToOpenEndedPlan` :238                                                            | C    |
| `preview-philosophy` / `switch-philosophy` (1236)                | Plan philosophy (family)                    | `PhilosophySwitchFormSchema` `philosophy-schema.ts`; `readPhilosophySwitch` `philosophy.server.ts:80`, `switchPhilosophy` :102 (digest)                                                       | C    |
| `preview-season-edit` / `apply-season-edit` (1309)               | Week Target / phase / easy week             | `SEASON_EDIT_FORM_SCHEMAS` `season-edit-schema.ts:123`; `seasonEditAction` `routes/training/__season-edits.server.ts:60` → `readSeasonEdit` `season-edit.server.ts:68`, `applySeasonEdit` :87 | C    |
| `add-strength-track` (1312)                                      | strength Training Track                     | `addProposedStrengthTrack` `strength-offer.server.ts:58`                                                                                                                                      | C    |
| `delete-plan` (1349)                                             | Plan Outline                                | `deletePlanOutline` :1843                                                                                                                                                                     | C    |

### 1g. Plan creation, generation and First Run

| Route                                                               | URL                                | intents                                      | Entity                                         | Validation                                                                                           | Server work                                                                                                                               | Seam                            |
| ------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `training/plan.new.tsx:97`                                          | `/training/plan/new`               | `open-ended` (:101) or goal                  | Plan Outline (open-ended) / fitness-goal Event | `OpenEndedFormSchema` (:74), `GoalFormSchema` (:63)                                                  | `createKeepMeActivePlan` `authoring.server.ts:703`, `createFitnessGoalEvent` :251                                                         | C                               |
| `training/plan.new.$eventId.tsx:255`                                | `/training/plan/new/:eventId`      | (none)                                       | Plan Outline                                   | `PlanFormSchema` (:196), then `PlanOutlineCreateSchema` `authoring-schema.ts:146`                    | `createPlanOutline` `authoring.server.ts:305`                                                                                             | P (form→input mapping :259–316) |
| `training/plan.generate.$eventId.tsx:183`                           | `/training/plan/generate/:eventId` | (none); answers come from the URL            | Plan Generation → Generated Sessions           | `readAnswers(url)`                                                                                   | loader `previewSeason` `plan-generation/generate.server.ts:402`; action `approveSeason` :482 (regenerates, never trusts a posted payload) | C                               |
| `start/index.tsx:51`                                                | `/start`                           | (none)                                       | Account Connection (Intervals.icu key)         | `ConnectSchema` (:31)                                                                                | `linkIntervalsIcu` `integrations/intervalsicu/link.server.ts:31`                                                                          | C                               |
| `start/sporsmal.tsx:80`, `start/funn.tsx:106`, `start/plan.tsx:168` | `/start/*`                         | (none)                                       | none: the answers stay in the URL (preview)    | `questionsSchema`, `FindingCorrectionSchema`, `FamilySwitchSchema` (`first-run/first-run-schema.ts`) | `readFirstRunPlan` `first-run/plan.server.ts:66` (read only)                                                                              | C                               |
| `start/uker.tsx:112`                                                | `/start/uker`                      | `create`, `self` (`first-run-schema.ts:129`) | Plan Outline + Week Pattern + sessions         | `FirstRunCreateSchema`                                                                               | `createFirstRunPlan` `first-run/plan.server.ts:189`                                                                                       | C                               |

### 1h. Events

| Route                                  | URL                         | intents                                                                 | Entity              | Validation                                                                                                                                        | Server work                                                                                                | Seam |
| -------------------------------------- | --------------------------- | ----------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| `training/events.new.tsx:20`           | `/training/events/new`      | (none)                                                                  | Event               | `readEventForm` → `EventEntrySchema` in **route file** `training/__event-form.tsx:178,211`, mapped to `EventAuthoringSchema` `event-schema.ts:45` | `createEvent` `event.server.ts:44`                                                                         | C    |
| `training/events.$eventId.edit.tsx:34` | `/training/events/:id/edit` | (none)                                                                  | Event               | same                                                                                                                                              | `updateEvent` :54                                                                                          | C    |
| `training/events.$eventId.tsx:81`      | `/training/events/:id`      | `delete` (88), `cancel` (94), `set-result` (100), `unlink-result` (108) | Event, Event Result | manual                                                                                                                                            | `deleteEvent` :72, `cancelEvent` :188, `setEventResult` :153, `unlinkEventResult` :171 (`event.server.ts`) | C    |

### 1i. Catalogue and community

| Route                                           | URL                             | intents                      | Entity                                 | Validation                            | Server work                                                                     | Seam |
| ----------------------------------------------- | ------------------------------- | ---------------------------- | -------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- | ---- |
| `training/catalogue.tsx:316`                    | `/training/catalogue`           | `save`, `unsave`             | Catalogue saved list                   | none                                  | `saveToCatalogueList` `catalogue.server.ts:259`, `removeFromCatalogueList` :269 | C    |
| `training/catalogue.place.$workoutId.tsx:75`    | `/training/catalogue/place/:id` | (none)                       | Workout Session from a Catalogue Entry | service validates the date            | `placeCatalogueSession` `catalogue.server.ts:459`                               | C    |
| `training/catalogue.publish.$workoutId.tsx:106` | `…/publish/:id`                 | `withdraw` (:110) or publish | Shared Workout                         | `PublishSchema` (route :70)           | `publishWorkout` `community.server.ts:130`, `unpublishWorkout` :209             | C    |
| `training/catalogue.report.$workoutId.tsx:109`  | `…/report/:id`                  | (none)                       | Content Report                         | `ReportSchema` (route :56)            | `reportWorkout` `community.server.ts:253`                                       | C    |
| `admin/moderation.tsx:77`                       | `/admin/moderation`             | `dismiss`, `take-down`       | Content Report                         | none (`requireUserWithRole('admin')`) | `dismissReport` :390, `takeDownWorkout` :343                                    | C    |

### 1j. Thresholds and the athlete profile (Meg)

| Route                              | URL                          | intents                                                                                                                              | Entity                         | Validation                                                                                 | Server work                                                                                                                       | Seam                                             |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `settings/training/index.tsx:151`  | `/settings/training`         | (none)                                                                                                                               | Threshold                      | `TrainingSubmitSchema` (:130), built on `DisciplineThresholdSchema` `athlete-schema.ts:31` | `setDisciplineThresholds` `athlete.server.ts:157`                                                                                 | C                                                |
| `settings/training/analyze.tsx:74` | `/settings/training/analyze` | (discipline + construct)                                                                                                             | Threshold Estimate → Threshold | manual enum guards                                                                         | `analyseProfile` `profile-analysis/analyze.server.ts:149` (re-derived, never trusts the posted value) + `setDisciplineThresholds` | P (`findEstimate`/`acceptancePlan` in the route) |
| `settings/profile/index.tsx:153`   | `/settings/profile`          | `update-athlete-profile` (Training Availability, Weekly Capacity, timezone), `update-profile`, `sign-out-of-sessions`, `delete-data` | AthleteProfile / User          | `AthleteProfileUpdateSchema` `athlete-schema.ts:103`                                       | `updateAthleteProfile` `athlete.server.ts:119`; the other three are inline Prisma (:330, :665, :723)                              | C / I                                            |

### 1k. Integrations (Account Connection)

`integrations.sync.tsx:42` covers every active provider and calls
`syncStravaActivities` (`integrations/strava/sync.server.ts:42`) and
`syncIntervalsIcuActivities` (`integrations/intervalsicu/sync.server.ts:39`).
The per-provider routes are `integrations.strava.sync.tsx:30`,
`integrations.intervalsicu.sync.tsx:30`,
`integrations.intervalsicu.connect.tsx:35` and
`integrations.strava.connect.tsx:12` (OAuth redirect).
`settings/integrations.tsx:92` handles `disconnect-strava` and
`disconnect-intervalsicu`, both through `disconnectAccountConnection`
(`account-connection.server.ts:160`). All are C.

### 1l. Platform (Epic Stack boilerplate, out of scope for an agent)

These are `_auth/*`,
`settings/profile/{change-email,connections,passkeys,password,password_.create,photo,two-factor/*}`,
`admin/cache`, `resources/theme-switch` and `resources/dev-switch-athlete`. They
are mostly inline Prisma with Conform schemas in the route. An agent should
never call them.

## 2. Is business logic separated from the route?

| Area                                                        | Verdict                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Week Replan / Ukeskiftet                                    | **Clean.** Pure author, separate apply engine and answer module, a union schema shared by client and server.                                                                                                                                                                                                                            |
| Plan Outline (Sesong)                                       | **Clean services, messy dispatcher.** `authoring.server.ts` exports 35 owner-scoped functions (and two transaction helpers), each parsing a domain Zod schema and returning typed refusals. The route's 31-case switch and its per-field form parsers would be thrown away; `fillToHorizon`/`fillAfterDay` must move into the services. |
| Sesong edits / philosophy                                   | **Clean.** Read (preview) and apply (digest) pairs.                                                                                                                                                                                                                                                                                     |
| Import linking, _Gjort_, Annet, release, quick strength log | **Clean.** The resource routes are short (35–132 lines, mostly doc comments and status mapping; Annet and release are about 30 lines of code), and the services return undo tokens.                                                                                                                                                     |
| Composer (stamp / write / place / copy / undo)              | **Partial.** Services are clean, but `isPostableDay` and `landComposerWrite` (`_home/index.tsx:212–289`) must be extracted, and `withWeekSumToast` split into a pure "week sum before → after" and a toast adapter.                                                                                                                     |
| Workout Session full editor / delete / Session Log          | **Partial.** Form-shaped input, toast coupling, and `upsertSessionLog` is not owner-scoped.                                                                                                                                                                                                                                             |
| Strength set log                                            | **Partial.** Form-to-`LoadValue` conversion sits in the route.                                                                                                                                                                                                                                                                          |
| Events, Catalogue, Programs, Thresholds, Integrations       | **Clean**, apart from schemas defined in route files (`__event-form.tsx`, `PublishSchema`, `OverviewSchema`, `AddAnchorSchema`, …), which would move to `app/utils`.                                                                                                                                                                    |
| Account / auth                                              | Inline (Epic Stack). Not relevant.                                                                                                                                                                                                                                                                                                      |

**Best existing seams to copy:**

- `routes/resources/week-change.tsx` with `load/week-change-schema.ts` and
  `load/week-replan-answers.server.ts`: a union schema, one call per branch, a
  typed refusal, and the post-state returned.
- `routes/resources/import-link.tsx` with `import-link-schema.ts`, which also
  carries the undo token.
- `plan-outline/season-edit.server.ts` (preview, then apply with a digest,
  inside one transaction).
- `plan-generation/generator.ts` (a pure generator behind a named seam).

Many services also have direct `*.server.test.ts` coverage, which shows they are
already callable without the route.

## 3. Read paths: what the athlete sees

| Surface                       | Loader                                 | Key reads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I dag** (`/`)               | `_home/index.tsx:86`                   | `getSessionLedger` `training.server.ts:1560`; `getActivePlan` :220; `getCurrentLoad` `load/snapshot.server.ts:440`; `getTsbTrust` :393; `getRecentWeeklyBuild` `training.server.ts:1683` (gives `sustainedAdherence`, `load/coach.ts`); `getDisciplineThresholds` :1861; `readWeekChange` `load/week-change-card.server.ts:68` (Ukeskiftet); `getLoadRecomputeNotice`; `readMostTrainedDiscipline`; `buildSessionNudge` (`_home/presenter.ts`, Coach card); timeline window `readTimelineWindow` `writing-line.server.ts:22`. View models: `_home/timeline/presenter.ts`, `week-change.ts`, `row-content.ts` |
| Composer sources              | `resources/composer-sources.tsx:205`   | `listCatalogue` + the athlete's own workouts (Bibliotek/Kopier pickers); `resources/week-sum.tsx:24` (week sum for a day); `resources/strength-log.tsx:29` (`readQuickLog`); `resources/sentence-exercises.tsx:15`                                                                                                                                                                                                                                                                                                                                                                                           |
| **Sesong** (`/training/plan`) | `training/plan.tsx:477`                | `getActiveSeason` / `getSeasonForEvent` / `getSeasonForOutline` `training.server.ts:785/803/820`; `getAuthoredWorkouts` :1246; `readSeasonPicture` `routes/training/__season-picture.server.ts:52`; `readSeasonChartInputs` `plan-outline/season-chart.server.ts:21`; `readStampedMixWarnings`; `readFirstUnbegunWeekKey`; `getEventsForUser` `event.server.ts:98`. View state is in the URL (`?event`, `?outline`, `?tab`, `?week`; plan.tsx:334–352, 488)                                                                                                                                                  |
| **Bibliotek** (`/library`)    | `library.tsx:32`                       | `getRecentExerciseIds` (`workout.server.ts`) + `prisma.exercise`; Catalogue `training/catalogue.tsx:193` (`listCatalogue`); exercises `library_.exercises.tsx:46`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Meg** (`/me`)               | `me.tsx:61`                            | `getCurrentLoad`, `getLoadSnapshots` `load/snapshot.server.ts:343`, `getTsbTrust`, `getPersonalRecords` `personal-records.server.ts:26`, Account Connection status                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Session detail**            | `training/sessions.$sessionId.tsx:245` | `getSessionByIdForUser` `training.server.ts:1833`; thresholds; last similar session (`session-comparison.ts:45`); review (`session-review.ts:43`); archetype reading; load contexts                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Load / fitness                | (shared)                               | `load/compute.ts`, `load/ewma.ts`, `load/adherence.ts`, `load/readiness.ts`, `load/coach.ts`, `load/fitness-projection.ts:61`, `plan-outline/week-volumes.server.ts:22` (`getWeekVolumes`)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Events                        | `training/events.tsx:35`               | `getEventsForUser`, `getEventById` :88, `getCandidateSessionsForEvent` :125                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 4. Safety primitives an agent layer must reuse

**Preview first and proposals**

- **Week Replan Proposal, ADR 0080.** The author seam is
  `ProposalAuthor = (facts) => WeekChange` (`load/propose-week-change.ts:114`),
  and the deterministic author is `proposeWeekChange` (:234). It is pure: no
  clock, no DB. The author is already **injectable**:
  `runWeekChangeForUser(…, author = proposeWeekChange)`
  (`load/week-change.server.ts:82`) and `applyWeekReplanForUser`
  (`load/week-replan.server.ts:80`). ADR 0080 §6 says "AI later writes the same
  proposals on the same surface".
  - **Storage.** `WeekReplanProposal` (`prisma/schema.prisma:1846`), with the
    payload union `ProposalPayloadSchema` (`load/week-replan-proposal.ts:118`).
  - **Load direction.** Derived by `loadDirectionOf` (:147). Silence
    (`applyDueProposals` `load/week-replan-proposals.server.ts:114`) never
    applies an `adds` proposal, and never touches an athlete-owned or
    since-edited session.
  - **Gap: authorship.** No column records who wrote a proposal (rules or AI).
- **Sesong edits, ADR 0084.** `readSeasonEdit` writes nothing. `applySeasonEdit`
  recomputes inside its transaction and refuses with `preview-stale` when the
  digest differs (`season-edit.server.ts:68–140`). The schema refuses an apply
  that has no digest (`season-edit-schema.ts:62`).
- **Philosophy switch.** Same digest pattern (`philosophy.server.ts:102–116`),
  **but the digest is optional**: an apply without one skips the stale check.
- **Server recompute, never trust a posted payload.** Used by `fitPlanToEvent`
  (`authoring.server.ts:1794`), `approveSeason` (`generate.server.ts:482`), the
  threshold accept (`settings/training/analyze.tsx:84`) and the First Run
  (answers in the URL, `readFirstRunPlan`, then `createFirstRunPlan`).
- **Confirm to overwrite.** `WeekCopySchema.replace` defaults to `false`
  (`copy-week.ts:143–165`).

**Undo, ADR 0088**

There is one undo per write, offered from the toast and from the landed row for
10 s (`LANDED_MS`, `_home/timeline/composer-context.tsx:136`). The client wiring
is the composer provider's single landing, `announce`
(`composer-context.tsx:283`), which ADR 0088 calls `ComposerActions.land`; rows
receive it as their `land` prop (:176, :429), and the composer's undo post is at
:328. It works three ways:

- **Created session.** `undo-stamp` is an owner-scoped hard delete
  (`day-stamp.server.ts:155`). It is idempotent: a second tap is a no-op.
- **Restore by token.** _Gjort_ returns
  `{ sessionId, markedAt, status, markedDoneAt }`. `undoMarkSessionDone`
  compare-and-sets on the `markedAt` stamp (`workout.server.ts:646–707`), so a
  stale or forged token moves nothing. A link answer returns `linkedAt`,
  consumed by `undoImportAnswer` (`import-link.server.ts:238`). The quick log
  returns `setLogIds`, consumed by `undoQuickLog`
  (`strength-quick-log.server.ts:253`).
- **No undo offered** when the load recompute rewrote another session:
  `recomputeRewroteSince` (`workout.server.ts:516`).

The 10 s is a **UI bound only**. None of the four undo functions checks the
time; a token stays good for as long as its stamp (or its set logs) does. An
agent could therefore offer the same undo later in a conversation. Where the
result passes through a model, the token should sit server-side behind an
opaque, user-bound handle, because it carries prior state a model could alter
([`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) §6.4).

Sesong writes (copy week, stamp pattern, full editor) have **no undo yet** (ADR
0088, Consequences).

**Generation seam, ADR 0053**

`SeasonGenerator { id, generate(request, corpus) }` and
`generateSeason(…, generator = DETERMINISTIC_SEASON_GENERATOR)` live in
`plan-generation/generator.ts:43–72`. The implementation is
`generateDeterministicSeason` (`plan-generation/deterministic.ts:220`, id
`deterministic-v1` :96). The seam has three properties:

- **Synchronous by decision.** A model needs the return type widened to a
  Promise (§1).
- **Pure.** It cannot query, so approval regenerates (§2).
- **Nothing unapproved.** Nothing reaches the calendar without approval (§8).

**Unavailable Metric** (GLOSSARY.md:1033, GOAL.md building principle)

There are typed absences rather than numbers. The main shapes are:

- `TsbTrust` (`load/trustworthiness.ts:12`, 42-day gate).
- `UnavailableReading` (`plan-outline/unavailable-readings.ts`).
- `{ available: false, reason }` (`plan-outline/volume-conversion.ts:240–260`).
- strength `{ kind: 'unavailable', reason }` (`strength/anchors.ts:78,122`;
  `strength/program-engine.ts:1012`).
- `GeneratedUnavailable` (`plan-generation/season.ts:222–233`).
- the Week Replan `insufficient-data` outcome.

An agent's tool results must pass these through, not paper over them.

**Ownership**

`sessionOwner()` and the `MACHINE_OWNED_SESSION` where-fragment
(`session-ownership.ts:28,45`) are the gate for every machine write: a session
is the athlete's when it is `authored` or adopted, **and** not released. Session
Source values are `authored`, `generated`, `recorded` and `detected`
(schema.prisma:1036). There is **no `agent` actor and no audit log.**

**Auth and permissions**

- `requireUserId` (`auth.server.ts:49`) and `getUserId` (:29) read only the
  cookie session.
- `requireUserWithPermission` and `requireUserWithRole` live in
  `permissions.server.ts:6,43`; First Run uses `requireFirstRunAthlete`
  (`first-run/plan.server.ts:319`).
- There is no bearer or API-token user auth. The only inbound bearer check is
  `INTERNAL_COMMAND_TOKEN`, used for LiteFS cache replication
  (`routes/admin/cache/sqlite.server.ts:24`).

**Rate limiting**

`express-rate-limit` keys on IP (`fly-client-ip`), in `server/index.ts:101–154`.
In production that is 1000/min for GET and HEAD and 100/min for other methods. A
non-GET to the auth paths, `/admin` or `/settings/profile` (and a GET to
`/verify`) gets 10/min; `/settings/training` is not on that list. Nothing is
per-user or per-action. Strava's outbound limiter is
`integrations/strava/rate-limit.ts`.

**Shared-state push**

A per-athlete SSE emitter (`imports-events.server.ts:32,41`;
`/resources/imports-events`; `useRevalidateOnImportEvent`
`imports-events.ts:29`) carries only `import-created`. Writes made by an agent
would not refresh open tabs until something broader exists.

## 5. Existing AI/LLM code and config

The grep covered
`anthropic|openai|ollama|llm|ANTHROPIC_API_KEY|claude-|prompt|model` over
`app/`, `server/`, `prisma/`, `scripts/`, `other/`, `.sandcastle/`,
`package.json` and `.env.example`.

**Nothing calls a model at runtime.** What exists:

- `package.json:41` has `"@anthropic-ai/sdk": "^0.102.0"`, but nothing in the
  source imports it (only `package.json` and the lockfile mention it). On a 0.x
  version, `^0.102.0` admits only 0.102.x.
- `app/utils/env.server.ts:16–27` declares optional `ANTHROPIC_API_KEY` and
  `CLAUDE_CODE_OAUTH_TOKEN`. Its comment refers to an `anthropic-client.ts` that
  **no longer exists**, and `.env.example:12–20` has the same leftovers.
- **ADR 0016** (AI plan generation; the earlier `trainllm` prototype ran on
  local Ollama) is superseded. Its "§8 Anthropic provider" is marked **not in
  force** (`docs/adr/0016-ai-plan-generation.md:14–23`). The client was deleted
  when ADR 0044 removed the feature (§10); ADR 0044:93 still quotes it. It is
  not in this shallow clone's history.
- ADR 0053 keeps the **model-client seam**, with deterministic rules as the
  shipped implementation. ADR 0080 §6 names AI as a future second
  `ProposalAuthor`.
- `.sandcastle/main.ts:89,136,150,221` names `claude-opus-4-8` and
  `claude-opus-4-7`, but only as dev-time Claude Code agents
  (`.sandcastle/.env.example:3`).
- The `prompt` and `model` hits in `app/` are false positives (Strava "reconnect
  prompt", view models).

## 6. Dev-time agent tooling (the team already builds agent-first)

**The Feature Loop.** ADR 0022 (`docs/adr/0022-autonomous-feature-loop.md`)
defines an autonomous Feature Loop driven by the `/feature-loop` skill
(`.claude/skills/feature-loop/SKILL.md`):

- Each heartbeat (`ralph/feature-loop.sh`, cron plus `claude`) advances one
  stage. It generates three feature candidates from `GOAL.md`; after a single
  human gate (an `approved` label) it designs, slices, builds in parallel,
  reviews and **auto-merges**.
- `.claude/settings.json` authorizes unattended `gh pr merge` for this.
- `ralph/once.sh` is the older single-issue loop (open issues, implement,
  commit).

**Sandcastle.** `.sandcastle/main.ts` (`@ai-hero/sandcastle`) is a
Docker-sandboxed plan → parallel implement → review → merge orchestrator:

- The plan step emits a Zod-validated `<plan>` JSON.
- Prompts live in `.sandcastle/*-prompt.md`, with `CODING_STANDARDS.md`
  alongside.

**Skills.** `.claude/skills/` holds 36 skills:

- process skills: `tdd`, `code-review`, `to-spec`, `to-tickets`, `triage`,
  `wayfinder`, `domain-modeling`;
- `verify`, which boots the app with mocks and a seeded login and drives it with
  Playwright;
- the UI-craft skills.

**Agent docs.** `docs/agents/*.md` give agent-facing conventions (issue tracker,
labels, domain docs, production seed data).

In short, the team treats agents as first-class developers, but nothing yet
treats an agent as a first-class _user_ of the running app.

## 7. Readiness verdict

**Already agent-friendly**

- **Owner-scoped services with typed results.** Most writes are an owner-scoped
  service function that returns `{ok} | {ok:false, reason}`, with Norwegian
  refusal text in `labels.ts`. That is close to the shape of a tool result
  already. The plan-outline services even parse their own domain Zod schemas
  (`authoring-schema.ts` exports 40), so most tool input schemas exist. They are
  zod 3 schemas; see
  [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) §9.3 for
  what that means for each tool library.
- **Safety rails exist and are tested.** These are exactly the ones an agent
  needs:
  - preview, then apply with a digest (Sesong edits, philosophy);
  - server-side recompute (season, fit, thresholds);
  - proposals that need a yes for the athlete's own sessions or for added load
    (ADR 0080);
  - undo tokens with compare-and-set (ADR 0088);
  - the ownership gate (`session-ownership.ts`);
  - Unavailable Metric as typed absences.
- **Two named "AI later" seams with working deterministic implementations.**
  `ProposalAuthor` is already an injectable parameter
  (`load/week-change.server.ts:82`), and `SeasonGenerator` sits in
  `generator.ts:43`. A model is a second implementation, not a rewrite.
- **The Writing Line is already a natural-language action.**
  `parseWorkoutSentence` is strict: it saves exactly what was typed, or nothing.
  An agent can author sessions in plain Norwegian with the same guarantees as
  the athlete.

**Missing**

- **No central action registry.** There are 70 action modules with intents as
  string literals, dispatched by `if`/`switch`. Only some have a union schema
  (`WeekChangeActionSchema`, `ImportLinkActionSchema`,
  `StrengthLogActionSchema`, `SEASON_EDIT_FORM_SCHEMAS`, `OverviewSchema`).
  Sesong's 31 intents use ad-hoc field parsers. Nothing lists the available
  operations or their descriptions, so there is nothing to generate tool or MCP
  definitions from. The sibling notes propose one: `defineAction` in
  `app/actions/` (proposed ADR 0092, MCP note §8).
- **Schemas are form-shaped, not tool-shaped.** They take strings, `'on'`, comma
  decimals and `FormData`. Replies are UI-shaped too: redirects, toast headers,
  `submission.reply()`. A domain-input and plain-result layer is needed under
  each route.
- **Orchestration is stuck in routes.** `landComposerWrite` and `isPostableDay`
  (`_home/index.tsx:212–289`), `fillToHorizon` (`plan.tsx:1453`), the threshold
  acceptance plan, set-load conversion, and inline Prisma in session delete and
  copy.
- **No actor or provenance for agent writes.** Session Source,
  `WeekReplanProposal` and the undo tokens have no "who did this" field, and
  there is no audit log. Before any agent write ships, decide whether an agent
  acting on the athlete's say-so is the athlete (`authored`) or the machine
  (silence rules apply).
- **No screen context.** I dag's selected day is client `useState` plus a DOM
  attribute (`_home/timeline/use-day-selection.ts:53`). Sesong is URL state
  (good). There is no serialisable "what is on screen" object. Presenters
  (`timeline/presenter.ts`, `week-change.ts`) are the natural source for one.
- **Non-browser access and push are missing.** Auth is cookie-only (no token for
  an external/MCP agent), rate limits are per IP rather than per user or tool,
  and the SSE push covers imports only. A shared registry should feed both an
  in-app agent and a future MCP server through the same auth and limits.
- **Leftover config.** The generation seam is synchronous by ADR, and the unused
  `@anthropic-ai/sdk` dependency and env vars are leftovers, not a foundation.

**Three candidate operations for a first agent-operable vertical slice**

1. **Week Replan proposals: agent as a second `ProposalAuthor`, plus the answer
   tools** (`answerProposal`, `easeWeek`, `releaseSession`).
   - **Pillar fit.** This is Pillars 1 and 2 and the exact North-star ("your
     plan adapts to what you actually did … explains its reasoning in plain
     language").
   - **Why it is safe.** ADR 0080 §6 already reserves the slot. Proposals carry
     a `reason` (the only prose field), silence can never add load, the
     athlete's own sessions need a yes, and the card UI already renders any
     proposal of the payload union.
   - **Work needed.** An `author` column, and an async author type.
2. **The I dag composer: `write-session` (sentence), `undo-stamp`, and _Gjort_
   with its undo token.**
   - **Pillar fit.** This is Pillar 3 ("meets you at your level", plain language
     over forms) feeding Pillar 1.
   - **Why it is safe.** Every write already returns an undo, the sentence
     parser refuses anything ambiguous, and the reply carries the week's sum
     before → after for the agent to say back.
   - **Work needed.** Extract `landComposerWrite` and `isPostableDay` into a
     service first.
3. **Sesong edits: preview, then apply with a digest** (week target, phase, easy
   week; plus `fit-to-event`).
   - **Pillar fit.** This is Pillar 2, smart adaptive planning that explains
     itself.
   - **Why it is safe.** The preview is a typed model (`SeasonEditPreview`, with
     warnings and held numbers). The digest makes "the agent proposes, the
     athlete confirms exactly what was shown" structural rather than a
     convention.
   - **Work needed.** These have no undo yet (ADR 0088 Consequences), so the
     preview must be the guard.

Runner-up: the import answer "hva var dette?" (`ImportLinkActionSchema`, with an
undo token). It is Pillar 1's plan↔actual coupling, and a strong candidate for
an agent that suggests the link while the athlete taps Ok.

**Under Strava's API Policy the order changes.** Nothing Strava-sourced, and
nothing computed from it, may reach an MCP client or a model (§5.16(b), §5.3;
[`mcp-server-for-trainm8.md` §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric)).

- **Candidate 1 is the grey zone.** `decideWeekReplan` reads Weekly Plan
  Adherence and TSB (`load/week-replan.ts:250`), which are Strava-derived for an
  athlete who imports from Strava, and the reason prints the TSB. Reasons and
  inputs must go out as `source-terms`; whether the proposals themselves count
  as "generated using Strava Data" is unsettled.
- **Candidate 2 is the cleanest.** `write-session`, `undo-stamp` and _Gjort_ act
  on plan data the athlete authors. The one catch is the week sum in the reply:
  `getWeekVolumes` (`plan-outline/week-volumes.server.ts:22`) also carries the
  week's Actual Volume, which passes the gate like any actual.
- **Candidate 3 is clean where the athlete authored the plan**, not where the
  First Run seeded it from imported history (`readAnchorContext`,
  `plan-outline/history.server.ts:59`).
- **The runner-up is out for Strava imports.** "Hva var dette?" is a question
  about an Activity Import, which is Strava Data.

The gate needs provenance on every value it returns. The source is already
stored as `ActivityImport.externalProvider` (`prisma/schema.prisma:1625`).

## ADRs this research challenges

| ADR                                                                       | What it decided                                                                                                                                                               | What the repo shows                                                                                                                                                                                                                                                                                                                                                                                                                          | Verdict                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0016** AI plan generation                                               | A hosted Claude model via the Anthropic SDK (§8), preview → approve → persist. Superseded by ADR 0044; revived by ADR 0053 with §8 marked not in force                        | Nothing calls a model. The leftovers still cite 0016 as if it were live: the unused `@anthropic-ai/sdk ^0.102.0`, `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN` in `env.server.ts` and `.env.example`, and a comment pointing at the deleted `anthropic-client.ts`. An in-app agent is a different consumer (multi-turn, tools, approvals) and should get its own ADR (proposed 0095) rather than revive §8                                  | **Confirm** the supersession; §8 stays not in force, and the stale env comments are the thing to fix                                                                                                                                  |
| **0053** Season generation is deterministic behind the seam               | `SeasonGenerator` is synchronous (§1) and pure (§2); approval **regenerates** server-side rather than trusting a posted payload; nothing unapproved reaches the calendar (§8) | The seam is a clean slot for a model author, and §1 already names the Promise widening. But §2's regenerate-on-approve only works because the generator is deterministic. A model author is not, so approving by regenerating would land a season the athlete was never shown. The fix is to bind approval to the previewed payload, for example with ADR 0084's digest, which 0053's considered options rejected for the deterministic case | **Amend** when a model implementation is added: §1 widens to a Promise, and §2's approval rule must bind to the stored preview rather than regenerate                                                                                 |
| **0080** Week Replan proposes, the athlete's sessions need a yes          | §6: "AI later writes the same proposals on the same surface … Only the author of step 1 changes"                                                                              | Holds structurally: `ProposalAuthor` is injectable (`load/week-change.server.ts:82`), silence never adds load, and the card renders any payload of the union. But "only the author changes" understates it. `ProposalAuthor` is synchronous, and `WeekReplanProposal` has no column saying who wrote it, so a model's proposal and a rule's are indistinguishable after the fact                                                             | **Amend** §6: an async author type and an authorship column are part of "AI later", and the owner should decide whether silence may apply a model-written proposal (the MCP note proposes never, in ADR 0093)                         |
| **0088** Every write on I dag is undone from its toast and its landed row | One undo per write, for 10 s, through an owner-scoped delete or a compare-and-set token                                                                                       | The mechanism is exactly what an agent needs, and the server has no clock: the 10 s is UI-only, so an agent could offer the same undo later. But the ADR is scoped to the composer, Sesong writes still owe their undo, and nothing records that a write was the agent's                                                                                                                                                                     | **Amend**: extend §1's rule to agent writes (the agent's reply says what changed and carries _Angre_ with the same token (behind an opaque handle where a model sees it)), and decide the bound for an undo offered in a conversation |
