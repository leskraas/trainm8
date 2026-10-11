# AI in trainm8: the coaching landscape, privacy and regulation, and what an agent costs

What the AI-coaching products and the new MCP servers actually do, the gap
trainm8 can own, what GDPR, the EU AI Act and Norwegian law require before an
agent touches an athlete's training record, and what that agent would cost per
athlete. Ends with a launch checklist, a recommendation and the ADRs it reopens.

> **Research note · 2026-10-11.** Written from **primary sources**: vendor
> product, support and docs pages; the GDPR, the AI Act and its 2026 amendment
> on EUR-Lex; CJEU judgments; Datatilsynet, Nkom, EDPB and WP29 texts;
> Anthropic, AWS, Google, OpenAI and Mistral pricing and data pages; and the
> EU-US Data Privacy Framework list, queried through the list's own API. The
> trainm8 side is **this repository at commit `33c10f5`**. A verification pass
> the same day re-read every legal quote against the downloaded text, re-fetched
> the vendor and pricing pages, re-ran the cost model and grepped the schema: 90
> checks, 64 held, 19 were corrected or softened in place, and 7 stay unverified
> (§6.2). Not legal advice.
>
> **Sibling documents.** [`agent-native.md`](agent-native.md) (Builder.io's
> framework: adopt it or build our own);
> [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) (the MCP protocol,
> OAuth, the client matrix and the **Strava API Policy gate**, §6.1);
> [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) (libraries
> and the zod plan);
> [`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) (write
> paths, safety rails, the missing audit log);
> [`watch-data-sources.md`](watch-data-sources.md) (device APIs and each
> vendor's terms on AI and onward sharing); and
> [`stack-migration.md`](stack-migration.md) (Better Auth, MCP OAuth, Postgres).
> This note does not repeat them.

**Markers.** _inference_ is my reasoning, not a source statement. _unverified_
means no primary page confirmed it; treat it as provisional. Prices are USD list
prices fetched on 2026-10-11. Code paths in §2 are relative to `app/utils/`.

## TL;DR

1. **Explaining is commoditised; plan editing over MCP is new and blunt.**
   Garmin, Strava, Oura and WHOOP use LLMs to narrate yesterday's data. Plan
   adaptation runs on engines that are not LLMs (Garmin Coach, TriDot, AI
   Endurance, Runna). In 2026 the platforms shipped MCP servers: Strava
   (read-only, Claude-only, subscribers, since 1 June), COROS (reads since 5
   May, plan and workout writes since 21 Sept), Suunto (read-only), AI Endurance
   and Tredict (read and write). Intervals.icu's official server is "at the spec
   stage" (§1).
2. **The gap is an honest plan editor.** None of these servers gives the
   assistant the plan, the actual and a typed "not enough data" together, and
   none puts a write through a preview and the athlete's yes. trainm8 already
   has every piece: the Adherence Band, Week Replan proposals, Sesong edits with
   a digest, and the Unavailable Metric. Twelve agent jobs are ranked in §2.
   _inference_
3. **Treat the training record as health data.** Heart rate over time, with
   birthdate, sex and weight on file, and any conclusion an LLM draws from it,
   meet WP29's test and the CJEU's "indirectly reveal" line. That means explicit
   consent per purpose (Art. 9(2)(a)), a DPIA before launch (Datatilsynet's list
   covers services that "forutsi … helse, … adferd, lokasjon eller
   bevegelsesmønster"), and an Art. 28 processor for an in-app agent (§3).
4. **Anthropic's own API cannot keep inference in the EEA, and Anthropic is not
   on the DPF list.** `inference_geo` is `global` or `us`, and workspace geo is
   `us` only. Transfers would rest on the DPA's SCCs plus a transfer impact
   assessment. Claude on **Bedrock `eu-north-1`** (in-region, Stockholm, the
   same city as Fly `arn`) or **Vertex `eu`** keeps inference in Europe at +10%.
   The cost is losing Batch and the MCP connector, and on Bedrock structured
   outputs too (§3.4–3.5).
5. **No Strava data may reach any model, in-app or over MCP.** Strava's API
   Policy §5.3 bans "ingestion into a context window" of Strava Data and of
   anything derived from it, and §5.10 says consent does not cure that. The gate
   binds an in-app agent exactly as it binds MCP
   ([`mcp-server-for-trainm8.md` §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric)).
6. **The AI Act asks for transparency, not high-risk compliance.** No Annex III
   area fits, and fitness apps are not medical-device software. Art. 50(1) ("you
   are talking to an AI") has applied since 2 Aug 2026, and Art. 50(2) requires
   machine-readable marking of generated text. The 2 Dec 2026 grace period in
   Regulation (EU) 2026/1744 covers only systems already on the market before 2
   Aug 2026, so it does not cover trainm8. Norway's KI-lov goes to a new
   consultation this autumn _(secondary sources)_.
7. **The cost is small, and MCP is close to zero.** With caching and 2k thinking
   tokens, an in-app interaction on Sonnet 5.5 costs **≈$0.05–0.07**. That is
   **$1.50–2.00 per athlete-month** at 30 interactions, +10% in an EU region.
   Haiku 5.5 is about 19× cheaper. MCP-only costs trainm8 only the tool calls
   (§4).
8. **Recommendation:** first fix the two privacy defects the repo already has: a
   placeholder privacy page, and a "download all your data" export that leaves
   out the training record. Then ship MCP. Put an in-app agent on Bedrock
   `eu-north-1` behind a paid tier later, after the DPIA (§5).

## 1. The AI-coaching landscape

### 1.1 Product by product

Re-fetched in the verification pass: Garmin Connect+, both Strava rows, Runna,
AI Endurance, Oura, Claude health. The TrainingPeaks, TriDot, Humango, Suunto
Coach, Polar and Apple rows are from the first pass.

| Product                         | What the AI does                                                                                                                                                                    | Model (stated?)                                                                       | Price                                              | Assistant / MCP surface         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------- |
| **Garmin Connect+**             | "Personalized insights and suggestions throughout the day based on health and activity data, powered by AI", "releasing in beta" (27 Mar 2025). Explains; no chat found [garmin-pr] | Not named                                                                             | $6.99/mo or $69.99/yr; existing features stay free | No first-party MCP _unverified_ |
| **Garmin Coach**                | Free adaptive run, bike and tri plans; adapts to training status, load, VO2max and recovery. No LLM named [garmin-coach]                                                            | n/a                                                                                   | Free                                               | —                               |
| **Strava Athlete Intelligence** | Generative-AI summary per activity; "Say More" goes deeper on pace, HR and zones. Uses "health and location data", e.g. the previous 30 days. Mobile only [strava-ai]               | Not named                                                                             | Subscribers and trial                              | Strava MCP (§1.2)               |
| **Runna** (Strava-owned)        | "Personalized plans … Adapts to your performance" [runna]                                                                                                                           | Not stated                                                                            | $19.99/mo or $119.99/yr                            | —                               |
| **TrainingPeaks**               | No first-party AI or LLM feature found; partner API is approval-gated [tp-api]                                                                                                      | —                                                                                     | —                                                  | Community MCPs only             |
| **AI Endurance**                | Neural-net "Digital Twin" re-plans as you train; built-in chat on the same tools as its MCP [aie-mcp]                                                                               | Not named                                                                             | $20/mo or $200/yr; 14-day trial [aie-pricing]      | MCP, read and write (§1.2)      |
| **TriDot / Humango**            | "FitLogic" auto-adapting engine with an in-app assistant; "Hugo, the AI coach" [tridot][humango]                                                                                    | Not stated                                                                            | TriDot $14.99–99/mo; Humango not published         | —                               |
| **WHOOP Coach**                 | Conversational coach for training, recovery and sleep _unverified: support page will not render_                                                                                    | OpenAI per a 2023 press release _unverified_                                          | Membership                                         | —                               |
| **Suunto Coach / Polar**        | Suunto: AI-generated plans in beta (Aug 2025) [suunto]. Polar Fitness Program: 4-week plans adjusted by HR, recovery and sleep, not branded as an LLM [polar-fp]                    | Not named                                                                             | In app; Polar's is paid in some countries          | Suunto MCP (§1.2)               |
| **Oura Advisor**                | Advice on sleep, resilience and activity from "a state-of-the-art large language model"; memories you can delete; women's-health questions go to Oura's own model [oura-advisor]    | LLM not named; the women's-health model is "deployed by Oura within our secure cloud" | $5.99/mo or $69.99/yr (US) [oura]                  | —                               |
| **Apple Workout Buddy**         | Spoken motivation during workouts (watchOS 26); works without the iPhone in 2026 [apple-2026]                                                                                       | Apple Intelligence                                                                    | Free with device                                   | —                               |
| **Claude health integrations**  | Apple Health, Health Connect, HealthEx and Function, all in beta (11 Jan 2026). Explicit opt-in; "We do not use users' health data to train models" [ant-health]                    | Anthropic                                                                             | US Pro and Max                                     | First-party in Claude           |
| **ChatGPT Health**              | A separate Health space linking Apple Health and others _unverified: page 403_                                                                                                      | OpenAI                                                                                | US _unverified_                                    | First-party in ChatGPT          |

### 1.2 The MCP servers that exist

| Server                        | Reads                                                                                                                          | Writes                                                                                                                        | Clients                                                                             | Rails and limits                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Strava** (since 2026-06-01) | Activity history, fitness trends, readiness, goal planning, cross-sport, gear                                                  | None: "The MCP is read-only"                                                                                                  | **Claude only** (claude.ai, Cowork, Claude Code); "other AI clients in the future"  | Subscribers only, trials excluded; per-minute and per-day limits; `mcp.strava.com/mcp` [strava-mcp]                                   |
| **COROS** (since 2026-05-05)  | Workouts, VO2max, threshold pace, race predictions, load, recovery, sleep, HRV; from 22 June splits, health data and FIT files | **From 2026-09-21:** create and edit plans and workouts (road run, trail, bike); plans of 4–16 weeks starting within 14 days  | ChatGPT, Claude, Cursor                                                             | "not able to delete a plan or workout with AI"; FIT capped at 50 a day; `mcp.coros.com/mcp` [coros-mcp]                               |
| **Suunto**                    | The athlete's Suunto data                                                                                                      | None: "currently read-only. It does not modify your account, workouts, or training plans"                                     | ChatGPT, Claude and others                                                          | OAuth; `mcp.sports-tracker.com/open/mcp`; undated [suunto-mcp]                                                                        |
| **AI Endurance**              | Workouts, activities, recovery, nutrition, race predictions, zones                                                             | Create and modify structured workouts, move and skip sessions, update zones; syncs to Garmin, TrainingPeaks and Intervals.icu | ChatGPT (plugin directory), Claude.ai custom connector, any MCP client; in-app chat | No approval step described: the examples change, then confirm [aie-mcp]                                                               |
| **Tredict** (EU platform)     | History, thresholds, zones, HRV, sleep                                                                                         | Structured workouts and "complete training plans … spanning weeks and months", loadable to the watch                          | Claude, ChatGPT, Codex, Grok, Perplexity, Mistral                                   | Data "will, depending on the permission settings in Tredict, be transmitted to these providers" [tredict-mcp]                         |
| **Intervals.icu** (planned)   | —                                                                                                                              | —                                                                                                                             | —                                                                                   | Founder, 2026-09-09: "We are working on an official MCP server. It is at the spec stage currently." Community servers exist [icu-mcp] |

### 1.3 What the pattern says _inference_

- **Narration is everywhere, plans are not.** No narrator ties its words to a
  forward plan, so none can say "you were 12% under plan, and this is what
  changes".
- **Plan writes over MCP arrived in 2026 and are blunt.** COROS, AI Endurance
  and Tredict create, move or edit with no proposal, no approval step and no
  stated evidence. COROS's no-delete rule is the only guard rail found.
- **Watch-maker MCPs hand raw data to a general LLM**, which then coaches with
  no plan context and no load-trust gate. That is where an LLM invents numbers:
  a CTL from three weeks of data, or a "threshold" from one race.
- **Distribution moved into the assistant.** Strava ships Claude-first; COROS,
  Suunto, Tredict and AI Endurance also target ChatGPT; Anthropic and OpenAI
  read Apple Health directly in the US.

## 2. The gap and the agent's jobs

### 2.1 The gap trainm8 can own _inference_

- **The honest loop as a tool contract.** Every read returns plan, actual and
  the Adherence Band together, and a typed Unavailable Metric when data is thin
  (the 42-day Form gate, `GLOSSARY.md:1763-1767`). The model receives refusals
  as data, so GOAL.md's building principle survives a general-purpose LLM.
- **Proposals, not mutations.** Writes reuse the existing seams: a second
  `ProposalAuthor` (`load/propose-week-change.ts:114`; ADR 0080 §6 already says
  "AI later writes the same proposals"), Sesong preview → apply with a digest
  (ADR 0084) and undo tokens (ADR 0088). No competitor shows "preview, then the
  athlete says yes".
- **Life-aware planning.** "I'm travelling", "only 5 h this week": Training
  Availability and Weekly Capacity already exist (`GLOSSARY.md:2622`, `:2632`).
- **Multi-sport with real strength actuals** (ADR 0056). No MCP above exposes
  set-by-set strength.
- **Self-coached and Norwegian.** No coach roster (a GOAL non-goal), and plain
  Norwegian (ADR 0081).

### 2.2 What the agent should do, ranked

Ranked by pillar weight, then expected frequency, then safety (reads before
writes). The seams are inventoried in
[`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md). For an
athlete who imports from Strava, every job that reads actuals returns them as an
Unavailable Metric with reason `source-terms`.

| #   | Athlete says                                      | Sits on                                                                                                                                                  | Write? / rail                                                  |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | "Hvordan gikk uka mot planen?"                    | Adherence Band (`GLOSSARY.md:1131`); `getSessionLedger` (`training.server.ts:1560`), `getCurrentLoad`, `getTsbTrust` (`load/snapshot.server.ts:393-440`) | Read, through the Unavailable Metric                           |
| 2   | "Hvorfor var dagens økt tung?"                    | `buildReviewComparison` (`session-review.ts:43`), `buildVsLastComparison` (`session-comparison.ts:45`), Session Log RPE, Form that day                   | Read. "Not enough data" rather than a guessed cause            |
| 3   | "Jeg er på reise 12.–16. nov, planlegg rundt det" | `updateAthleteProfile` (`athlete.server.ts:119`), then a Week Replan proposal or a Sesong edit preview (`readSeasonEdit`)                                | Proposal → athlete's "ja" (ADR 0080, 0084)                     |
| 4   | "Flytt langturen til lørdag"                      | Composer `copy-session` and `undo-stamp` (`day-stamp.server.ts`)                                                                                         | Write with undo (ADR 0088); never touch athlete-owned sessions |
| 5   | "Ta Ukeskiftet-forslagene"                        | Answer, accept-round and ease (`load/week-replan-answers.server.ts`)                                                                                     | Write, per-proposal yes or no                                  |
| 6   | "Skal jeg kjøre hardt i dag?"                     | `buildSessionNudge` (`routes/_home/presenter.ts:288`), the 42-day Form gate                                                                              | Read. Reuse the verdict, never re-derive it                    |
| 7   | "Legg inn 4×8 min terskel torsdag"                | `parseWorkoutSentence` (`workout-sentence.ts:1409`), `placeCatalogueSession` (`catalogue.server.ts:459`)                                                 | Write + undo                                                   |
| 8   | "Hva var denne importen?"                         | `answerImportQuestion` / `undoImportAnswer` (`import-link.server.ts:149`, `:238`)                                                                        | Write + undo; out for Strava imports                           |
| 9   | "Jeg meldte meg på Birken, tilpass sesongen"      | `createEvent`, `fitPlanToEvent`, `previewSeason` → `approveSeason` (`plan-generation/generate.server.ts:402`, `:482`)                                    | Preview → approve                                              |
| 10  | "Er terskelen min utdatert?"                      | `analyseProfile` (`profile-analysis/analyze.server.ts:149`, ADR 0054)                                                                                    | Proposal → accept                                              |
| 11  | "Logg styrkeøkta som planlagt"                    | `logStrengthSession` / `undoQuickLog` (`strength-quick-log.server.ts:138`, `:253`)                                                                       | Write + undo                                                   |
| 12  | "Vis volum per gren siste 8 uker"                 | `getLoadSnapshots`, `getWeekVolumes` (`plan-outline/week-volumes.server.ts:22`); ADR 0046                                                                | Read. Refuse cross-track sums                                  |

Jobs 1, 2, 6 and 12 are read-only and could ship as MCP v1 _inference_. Jobs 3–5
are the north star, "your plan adapts". The sibling inventory lists what an
agent writer still lacks: an `agent` actor and an audit log on writes, a
per-user rate limit, and push beyond imports.

## 3. Privacy and regulation (Norway and the EEA)

### 3.1 Is training data "data concerning health"?

- **Definition.** Art. 4(15): "personal data related to the physical or mental
  health of a natural person … which reveal information about his or her health
  status". Recital 35 covers "past, current or future" health status [gdpr].
- **The regulator's test.** The WP29 2015 annex on apps and devices (written
  under Directive 95/46) counts as health data "raw sensor data that can be used
  in itself or in combination with other data to draw a conclusion about the
  actual health status or health risk". A single pulse reading is not, but "that
  aspect measured over time, especially in combination with age and sex" can be.
  Conclusions are health data "regardless of their reliability" [wp29-health].
- **The CJEU.** _OT_ (C-184/20, Grand Chamber, 1 Aug 2022): Art. 9 covers data
  revealing sensitive information "indirectly, following an intellectual
  operation involving deduction or cross-referencing" (para 123), and data
  "liable indirectly to reveal sensitive information" is not excluded (para
  127). _Lindenapotheke_ (C-21/23, Grand Chamber, 4 Oct 2024, para 90): health
  data "even where it is only with a certain degree of probability". _Meta_
  (C-252/21, 4 Jul 2023, para 73) applies Art. 9 to visits to sensitive sites
  and apps [cjeu-184-20][cjeu-21-23][cjeu-252-21].
- **What trainm8 stores.** `birthdate`, `weightKg`, `heightCm` and `sex`
  (`prisma/schema.prisma:1111-1114`); `maxHr` and `lthr` (`:1186-1187`) with a
  history of threshold and weight events (`:1228`); bodyweight on set rows
  (`:906`); heart-rate streams (`:1689`), downsampled to a ≥ 5 s grid of at most
  1000 samples (`app/utils/activity-stream.ts:45-46`); GPS polylines (`:1642`);
  the verbatim provider payload (`:1645`); and Session Log RPE and free text
  (`:1612-1613`).
- **Conclusion** _inference_: treat the training record as Art. 9 health data in
  every flow below. An LLM sentence such as "your HR drift suggests fatigue or
  illness" is itself a health conclusion under WP29.

### 3.2 Lawful basis

Art. 9(1) prohibits the processing. For a consumer app the realistic exception
is **explicit consent "for one or more specified purposes"** (Art. 9(2)(a)). The
EDPB requires "an express statement of consent", which online can be given "by
filling in an electronic form" (Guidelines 05/2020, paras 93–94) [edpb-consent].
_Inference:_ take a separate, specific consent for each purpose (the core app,
the in-app assistant, each external assistant), each withdrawable without
degrading the core app.

### 3.3 Controller or processor, per flow _inference, grounded in the cited texts_

| Flow                                                  | trainm8                                                                                              | LLM provider                                                                                                                                                                                                                                    | Basis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. In-app agent** (trainm8 calls Claude)            | Controller: it sets the purposes, prompts and tools                                                  | **Processor** under an Art. 28 DPA: Anthropic ("Customer is the controller and Anthropic is Customer's processor"), or AWS / Google, which the Claude docs name as processor on Bedrock and Vertex                                              | [ant-dpa]; [ant-retention]; the Commercial Terms incorporate the DPA and say "Anthropic may not train models on Customer Content" [ant-terms]                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **B. The athlete's own assistant over trainm8's MCP** | Controller of its database and of the disclosure it makes on the athlete's authenticated instruction | **Independent controller** of the chat: for Claude users in the "European Region", Anthropic Ireland, Limited [ant-privacy]. Recital 18: the GDPR still "applies to controllers or processors which provide the means" for household use [gdpr] | By analogy with the portability guidance: the sender "is not responsible for compliance of the receiving data controller … considering that it is not the sending data controller that chooses the recipient", but "should set safeguards to ensure they genuinely act on the data subject's behalf" [wp242]. Contrast _Fashion ID_ (C-40/17): a site that embeds the transmitter is joint controller for "the collection and disclosure by transmission" [cjeu-40-17]. COROS defers to "the policies, permissions, and settings of the AI platform you choose" [coros-mcp] |
| **C. Bring your own API key**                         | Probably still controller: it runs the loop and the prompts                                          | Processor to the key holder, the athlete, under terms written for businesses                                                                                                                                                                    | A murky chain. A power-user option at most                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Flow B in practice _inference_: say at connect time that tool results land in
the assistant provider's account. On consumer Claude a chat may be kept "in a
de-identified format for up to 5 years" if the athlete allows model training,
and a deleted chat goes "within 30 days" [ant-consumer-retention]. Anthropic's
no-training pledge is stated for its health integrations [ant-health]; no
equivalent statement for connector data was found. Stay out of _Fashion ID_
territory: never auto-push to an assistant; expose scoped tools only after the
athlete's OAuth grant; give each grant a revoke button.

### 3.4 Processor terms and where the data goes (flow A)

- **Anthropic DPA** (effective 2025-02-24): EU SCCs Modules 2 and 3; a 15-day
  window to object to subprocessors; deletion within 30 days of termination;
  breach notice within 48 hours; AES-256 at rest and TLS 1.2+. It names the UK
  and Swiss addenda, not Norway or the EEA, and does not mention the DPF
  [ant-dpa].
- **Retention: two Anthropic pages disagree.** The API docs: conversation
  content "is not retained by default; the exception is Covered Models, which
  require 30-day retention" [ant-retention]. The privacy centre (dated
  2026-07-01): "we automatically delete inputs and outputs on our backend within
  30 days" [ant-commercial-retention]. Plan the DPIA on 30 days and ask
  Anthropic which governs. Both say flagged content may be kept for up to 2
  years.
- **ZDR** is "enabled per organization" by contacting sales. It excludes the MCP
  connector, code execution, the Console and the Covered Models (Fable 5 and
  5.1, Mythos 5 and 5.1) [ant-retention].
- **No EU residency on Anthropic first-party.** "Inference geo: Only `"us"` and
  `"global"` are available. Workspace geo: Only `"us"` is currently available"
  [ant-residency]. Claude Platform on AWS has the same two values.
- **Claude on Bedrock.** `eu-north-1` (Stockholm) is listed as "Global, EU,
  In-region only"; the EU inference profile spans Frankfurt, Zurich, Stockholm,
  Milan, Spain, Ireland, London and Paris (Zurich and London are outside the
  EU). Regional endpoints carry "a 10% pricing premium". Not supported:
  structured outputs, Message Batches, the MCP connector, server-side fallback,
  the Files API. Anthropic personnel have "no access to the inference
  infrastructure" [bedrock], and model providers "don't have access to Amazon
  Bedrock logs or to customer prompts and completions" [aws-dp]. Per-model
  regional availability and EU prices are in the AWS console _unverified_.
- **Claude on Vertex.** The `eu` multi-region
  (`aiplatform.eu.rep.googleapis.com`) is +10%; single regions serve only Sonnet
  4.6 and older. Structured outputs are supported; Batch and the MCP connector
  are not [vertex].

### 3.5 Transfers to the US: the DPF, status 2026-10

- The General Court dismissed _Latombe_ (T-553/23) on 3 Sept 2025. The appeal,
  **C-703/25 P**, was brought on 31 Oct 2025 and asks the Court to annul
  Decision 2023/1795 [oj-latombe]. No judgment was found; secondary sources call
  it pending as of June 2026 _unverified: curia is JS-only_.
- Datatilsynet: the US decision "gjelder imidlertid fortsatt" and covers
  companies on the DPF list; "Dersom en adekvansbeslutning oppheves, vil det
  mest sannsynlig ikke være en overgangsperiode", so have a plan [dt-usa]. After
  the ruling: keep "en strategi for alternative løsninger" [dt-latombe].
- **Anthropic is not on the DPF list.** A query to the list's API on 2026-10-11
  found no active or inactive entry for "Anthropic", while Amazon.com, Inc.,
  Google LLC, Garmin International and Fly.io were found [dpf]. Anthropic's DPA
  and privacy policy rely on SCCs and adequacy, not the DPF
  [ant-dpa][ant-privacy]. So for flow A on Anthropic first-party: SCCs plus a
  transfer impact assessment. Bedrock in-region keeps inference in the EEA;
  AWS's US parent still belongs in the DPIA. trainm8's own host, Fly.io, is a US
  company on the list too.

### 3.6 The DPIA

Datatilsynet's Art. 35(4) list names processing that "alltid krever" a DPIA
(page last changed 2019-07-17) [dt-dpia]. Three items are relevant:

- "Behandling av personopplysninger der formålet er å tilby en tjeneste eller
  utvikle produkter for kommersiell bruk som involverer å forutsi
  jobbprestasjoner, økonomi, helse, … adferd, lokasjon eller bevegelsesmønster";
- "Innsamling av personopplysninger i stor skala gjennom «tingenes internett»
  eller velferdsteknologi" (it depends on scale);
- "Behandling av personopplysninger med innovativ teknologi i følge med minst
  ett annet kriterium".

_Inference:_ an agent that predicts readiness from wearable HR and GPS meets the
first item outright, so **a DPIA is mandatory before launch**. Add the
LLM-specific risks: hallucinated advice, prompt injection through imported
activity titles and notes, over-broad tool scopes, transcript retention, and the
US transfer.

### 3.7 The EU AI Act and Norway

- **Not high-risk** _inference_. Annex III's areas are biometrics, critical
  infrastructure, education, employment, essential services, law enforcement,
  migration and justice. Health appears only as access to healthcare services,
  life and health insurance pricing, and emergency triage [aiact-annex3]. The
  Annex I route through the MDR fails because "wellness or fitness apps, do not
  qualify as MDSW" [mdcg]. Keep it that way: no diagnosis, no injury or illness
  treatment.
- **Art. 50.** Systems "intended to interact directly with natural persons" must
  inform people "that they are interacting with an AI system" unless that is
  obvious (50(1)), "at the latest at the time of the first interaction" (50(5)).
  Generated text must be "marked in a machine-readable format and detectable as
  artificially generated" (50(2)) [aiact-50]. Article 50 falls under the general
  application date, 2 Aug 2026 [aiact-113]. _Inference:_ an in-app agent makes
  trainm8 the provider of an AI system; in flow B the duty sits with the
  assistant's vendor.
- **The 2026 amendment.** Regulation (EU) 2026/1744 ("Digital Omnibus on AI"),
  of 8 July 2026, was published on 24 July 2026 and entered into force on the
  third day, 27 July [eu-omnibus]. The Council adopted it on 29 June 2026 (ST
  11301/26) [council-vote]. New Art. 111(4): generative systems "placed on the
  market before 2 August 2026" must meet 50(2) "by 2 December 2026". Annex III
  high-risk moves to 2 Dec 2027 and Annex I to 2 Aug 2028
  [aiact-111][aiact-113]. Art. 4 now asks providers and deployers to "take
  measures to support the development of AI literacy" of their staff, and "does
  not require … any specific level" [aiact-4].
- **Norway.** Nkom was named coordinating supervisor, and the government planned
  for the rules to apply "fra sommeren 2026" [nkom]. On 4 Aug 2026 the
  government postponed: a revised draft goes to consultation this autumn, with
  the Storting targeted for spring 2027, depending on the AI Act's EEA
  incorporation _unverified: regjeringen.no returns 403; reported by NTB_
  [regj-ki-2026]. _Inference:_ build to the EU timeline now. It is cheap here,
  and some athletes live in the EU.
- **Anthropic's Usage Policy** (effective 12 Nov 2026): consumer chatbots must
  "disclose to users that they are interacting with AI rather than a human … at
  a minimum at the beginning of each chat session or in the product interface".
  "Medical" is a high-risk area that includes "create a treatment plan". The
  exclusion for "Wellness content, such as education on sleep, stress,
  nutrition, or exercise" covers education, not advice applied to one athlete.
  Personalised training advice fits no high-risk area on the text, but injury
  and rehab advice could fall under Medical [ant-aup].

### 3.8 What the repository shows today

- **The privacy page is a placeholder.** `app/routes/_marketing/privacy.tsx:1-3`
  renders `<div>Privacy</div>`. There is no Art. 13 notice yet.
- **The export promises more than it delivers.** The row reads "Alt vi har
  lagret om deg, som én JSON-fil" (`app/utils/labels.ts:5176`), but the loader
  includes only the `User` row, its image, login `sessions` and `roles`
  (`app/routes/resources/download-user-data.tsx:15-27`). No athlete profile,
  workouts, imports, streams or logs, which Art. 15 and Art. 20 need.
- **Erasure works.** `deleteDataAction` deletes the `User`
  (`app/routes/settings/profile/index.tsx:722-723`), and the user-owned
  relations cascade (61 `onDelete: Cascade` in the schema). ADR 0012 already
  calls full deletion "a separate, explicit athlete operation".
- **Provider credentials sit in a plain column.**
  `AccountConnection.accessToken` holds the Strava OAuth token or the
  Intervals.icu API key (`prisma/schema.prisma:1896`); no application-level
  encryption was found.
- **Hosting.** Fly `primary_region = "arn"` (`fly.toml:2`); the unused
  `@anthropic-ai/sdk ^0.102.0` (`package.json:41`) is a leftover of ADR 0016.

### 3.9 Compliance checklist for launch

The vendor rows summarise
[`watch-data-sources.md` §6](watch-data-sources.md#6-ai-and-mcp-terms-per-source),
which carries each vendor's terms in full.

| #   | Item                                        | What to ship                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Basis                                                                                                           |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1   | **Consent screens, one per purpose**        | (a) Core app: an explicit health-data consent at sign-up, not bundled with the terms. (b) In-app assistant: a separate opt-in naming the processor, the region, what is sent and how long it is kept. (c) Each MCP client: the OAuth screen names the client, the scopes, that data lands in that provider's account under its terms, and that it may leave the EEA. Store the version and time of each consent; withdrawal stops the purpose without degrading the rest | Art. 7(1), 9(2)(a); EDPB 05/2020 §93–94                                                                         |
| 2   | **DPIA**                                    | Before either AI feature ships: flows A and B, the transfer, the LLM risks in §3.6. Consult Datatilsynet if high residual risk remains. Redo it when the provider, region or tool scopes change                                                                                                                                                                                                                                                                          | Art. 35, 36; [dt-dpia]                                                                                          |
| 3   | **AI disclosure**                           | A visible "KI" notice at the start of each assistant session and in the UI. Mark model output machine-readably where it is delivered (metadata on the response or a markup attribute _inference_), and store `author: model` with provenance on every proposal reason or reply it writes                                                                                                                                                                                 | AI Act Art. 50(1), (2), (5); AUP                                                                                |
| 4   | **Processor DPA**                           | Sign the DPA of whichever runs inference (AWS, Google or Anthropic). Review subprocessors; wire the processor's 48-hour breach notice into trainm8's own 72-hour duty                                                                                                                                                                                                                                                                                                    | Art. 28, 33; [ant-dpa]                                                                                          |
| 5   | **Residency choice**                        | Bedrock `eu-north-1` in-region (recommended), or Vertex `eu`. If Anthropic first-party: SCCs, a TIA, request ZDR, and avoid Covered Models                                                                                                                                                                                                                                                                                                                               | Ch. V; §3.4–3.5                                                                                                 |
| 6   | **Retention**                               | A fixed period for agent transcripts and tool payloads, treated as health data and kept out of error trackers. Set one for `rawJson` and streams too: they are kept with no limit today (Strava's §6.2 caps its cache at 7 days)                                                                                                                                                                                                                                         | Art. 5(1)(e)                                                                                                    |
| 7   | **Audit log**                               | An `agent` actor on every write: who (athlete, in-app agent, MCP client id), which tool, the preview digest, the approval and the undo. Visible to the athlete                                                                                                                                                                                                                                                                                                           | Art. 5(2); [`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md)                                   |
| 8   | **Data-subject rights flow**                | Fix the export (§3.8) to include the training record, consent records, audit log and transcripts. Extend erasure to transcripts and to the processor's copies. A "Tilkoblede assistenter" page to revoke each MCP grant. Tell the athlete trainm8 cannot recall what their own assistant already holds                                                                                                                                                                   | Art. 15, 17, 20, 7(3)                                                                                           |
| 9   | **Privacy notice**                          | Replace the placeholder with an Art. 13 notice: the purposes, the consent basis, processors and regions, retention, transfers, the AI features                                                                                                                                                                                                                                                                                                                           | Art. 13                                                                                                         |
| 10  | **Strava**                                  | No Strava-sourced value, or anything computed from one, reaches any model or MCP client. It leaves as an Unavailable Metric (`source-terms`). Consent does not cure it                                                                                                                                                                                                                                                                                                   | API Policy §5.3, §5.10, §5.16(b)                                                                                |
| 11  | **Polar**                                   | A separate opt-in before Polar data reaches an LLM or an MCP client ("no Data is distributed to external sources without the explicit Member permission"), and "Source: Polar" on derived values                                                                                                                                                                                                                                                                         | AccessLink agreement §3.1.1, §3.1.5 [polar-api]                                                                 |
| 12  | **Apple (if a native app reads HealthKit)** | "clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so"                                                                                                                                                                                                                                                                                                                  | App Review Guideline 5.1.2(i) [apple-review]                                                                    |
| 13  | **Garmin**                                  | Written approval before exposing Garmin data over MCP (§5.2(o), per the sibling). Attribution on AI-derived output: uses "as an input to … machine learning models, artificial intelligence … must include a Garmin attribution", and "receiving systems must preserve attribution"                                                                                                                                                                                      | [garmin-brand]; [`watch-data-sources.md` §1.3–1.4](watch-data-sources.md#13-terms-that-bind-an-ai-or-mcp-layer) |
| 14  | **Medical boundary and security**           | The system prompt and tool contract refuse diagnosis; injury or illness → "snakk med lege eller fysio". OAuth 2.1 scopes, a rate limit per token (today per IP), encryption of stored credentials, prompt-injection hygiene on imported text. Staff AI-literacy measures                                                                                                                                                                                                 | AUP; Art. 32; AI Act Art. 4                                                                                     |

## 4. LLM economics

### 4.1 Claude list prices (first-party, per MTok)

| Model                     | Input | 5-min write | 1-h write | Cache read    | Output | Batch in / out |
| ------------------------- | ----- | ----------- | --------- | ------------- | ------ | -------------- |
| Haiku 5.5 (≤ 100k prompt) | $0.10 | $0.125      | $0.20     | $0.01 (0.1×)  | $0.50  | $0.05 / $0.25  |
| Sonnet 5.5                | $2    | $2.50       | $4        | $0.10 (0.05×) | $10    | $1 / $5        |
| Opus 5.5                  | $4    | $5          | $8        | $0.20 (0.05×) | $20    | $2 / $10       |

From the pricing page and claude.com/pricing, which agree [ant-pricing]:

- **Sonnet 5.5's cache read was halved recently.** AWS notes: "Starting October
  7, Sonnet 5.5 cache read pricing is reduced by 50% from the prior rate"
  [bedrock-pricing]. Anthropic's page shows $0.10 today; copies made before then
  show $0.20.
- Haiku 5.5 above 100k tokens: $0.50 / $2.50. US-only inference
  (`inference_geo: "us"`): ×1.1. Bedrock regional and Vertex multi-region
  endpoints: +10% over their global price, which AWS and Google set themselves.
- Tool use adds a 286-token system prompt on all three. The minimum cacheable
  prefix is 512 tokens. Caches are isolated per workspace first-party and per
  organisation on Bedrock and Vertex [ant-caching], so one stable system prompt
  and tool list is shared by every athlete.
- Claude 4.7 and later use a tokenizer that "produces approximately 30% more
  tokens for the same text" than older models.

### 4.2 Cost model (a): an in-app agent _inference: token counts are estimates_

A typical interaction ("hvorfor var dagens økt tung?") is three model calls: two
tool rounds and an answer.

- **Static prefix ≈ 6.8k tokens:** system prompt ≈ 2.5k, about 20 tool schemas ≈
  4k, and the 286-token tool-use prompt.
- **Athlete context and question ≈ 1.65k; tool results of 3k and 2k.**
- **Visible output 200 + 250 + 500 tokens**, plus 2k adaptive-thinking tokens as
  a sensitivity, billed as output.
- **Automatic caching.** Each call writes its new tokens, including the previous
  call's output, and reads everything before them. A **cold** prefix is about
  13.9k written and 20.1k read. A **warm** prefix, already cached by another
  athlete within 5 minutes, is about 7.1k written and 26.9k read.

| Model      | Cold prefix | Warm prefix | Warm + 2k thinking | Cold + 2k thinking | No caching |
| ---------- | ----------- | ----------- | ------------------ | ------------------ | ---------- |
| Haiku 5.5  | $0.0024     | $0.0016     | $0.0026            | $0.0034            | $0.0039    |
| Sonnet 5.5 | $0.0463     | $0.0299     | $0.0499            | $0.0663            | $0.0775    |
| Opus 5.5   | $0.0925     | $0.0599     | $0.0999            | $0.1325            | $0.1550    |

**Per active athlete per month** (USD, +2k thinking, warm–cold prefix):

| Usage                 | Haiku 5.5 | Sonnet 5.5 | Sonnet 5.5, EU region (+10%) | Opus 5.5    |
| --------------------- | --------- | ---------- | ---------------------------- | ----------- |
| Light, 8 interactions | 0.02–0.03 | 0.40–0.53  | 0.44–0.58                    | 0.80–1.06   |
| Typical, 30           | 0.08–0.10 | 1.50–1.99  | 1.65–2.19                    | 3.00–3.98   |
| Heavy, 120            | 0.32–0.41 | 5.99–7.95  | 6.59–8.75                    | 11.99–15.90 |

Sensitivities:

- **Thinking.** Each extra 1k output tokens adds $0.01 per interaction on Sonnet
  5.5 and $0.0005 on Haiku 5.5. Sonnet 5.5 defaults to effort `high`, Haiku and
  Opus 5.5 to `medium`, so measure the real thinking spend.
- **Norwegian.** If Norwegian costs ×1.5 tokens on everything, a typical Sonnet
  athlete costs $2.25–2.98 a month _inference_.
- **The old cache price.** At $0.20 a cache read, the warm Sonnet figure rises
  from $0.0499 to $0.0526.
- **A proactive weekly digest** (15k in, 800 out, Sonnet) adds $0.08 a month via
  Batch (first-party only), or $0.18 on a Bedrock regional endpoint, which has
  no Batch.
- **Routing.** Sending the read jobs (1, 6, 12) to Haiku 5.5 cuts their cost
  about 19×. Caching is the cheapest lever.

Reference prices for a paid tier: Garmin Connect+ $6.99/mo [garmin-pr], Runna
$19.99/mo [runna], AI Endurance $20/mo [aie-pricing].

### 4.3 Cost model (b): MCP only

- **Inference is paid by the athlete's assistant plan.** Custom remote MCP
  connectors work on Claude Free, Pro, Max, Team and Enterprise; "Free users are
  limited to one custom connector" [claude-connectors]. ChatGPT's coverage
  depends on plan and developer mode _unverified: help page 403_.
- **trainm8's marginal cost is serving the tool calls.** 30 interactions × about
  4 calls × about 10 KB is about 1.2 MB a month: under $0.0001 at Fly's $0.02/GB
  European egress [fly-pricing]. The machine is already paid for: a
  shared-cpu-1x with 1 GB costs about $6.95 a month in `arn` (derived from Fly's
  regional formula). The real costs are engineering (the OAuth server, scopes,
  the audit log) and support.

### 4.4 Cost model (c): bring your own API key

Inference costs trainm8 nothing, but: trainm8 stores one more secret per user,
next to credentials already in a plain column (§3.8); onboarding needs an API
account under terms written for businesses; the roles blur (§3.3); and behaviour
varies by key. A power-user switch at most.

### 4.5 Providers compared

| Option                              | EU residency                                                                                 | Transfer and data terms                                                                                                                                | Features lost                                                                        | Price                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Anthropic first-party**           | **No**: `global` or `us`; workspace geo `us` [ant-residency]                                 | SCCs + TIA (not on the DPF list); no training on Customer Content; 30-day retention question open; ZDR by contract [ant-dpa][ant-terms][ant-retention] | None: Batch, structured outputs, the MCP connector and server-side fallback all work | List price; Batch −50%                                                                                   |
| **Claude on Bedrock, `eu-north-1`** | **Yes**, in-region Stockholm, or the EU profile [bedrock]                                    | Inference stays in the EEA; AWS (DPF-listed) is processor; the model provider has no access to prompts [aws-dp]                                        | Batch, structured outputs, the MCP connector, server-side fallback, the Files API    | +10% over global [bedrock]; per-model EU prices _unverified_                                             |
| **Claude on Vertex, `eu`**          | **Yes**, EU multi-region [vertex]                                                            | Google (DPF-listed) is processor; retention "governed by Google Cloud"                                                                                 | Batch, the MCP connector, server-side fallback                                       | +10% [vertex]                                                                                            |
| **OpenAI API**                      | EU regional endpoints at +10% [oai-pricing]; approval terms from the first pass _unverified_ | No DPF-list hit for OpenAI [dpf]; DPA page 403 _unverified_                                                                                            | Tool-use quality on trainm8's tools needs an eval                                    | gpt-6.1-sol $2 / $0.10 cached / $10; gpt-6-luna $0.10 / $0.01 / $0.50: Sonnet's and Haiku's price points |
| **Mistral** (EU company)            | EU by default (first pass)                                                                   | No transfer outside the EU                                                                                                                             | Large 4 is a preview (6 Oct 2026); weights "by the end of the month"                 | Large 4 $1.36 / $4.18, no cache price listed [mistral-large4]: ≈ $0.05 per interaction uncached          |

No neutral benchmark of trainm8-style planning tools was found. Build a 30–50
case eval from the §2.2 jobs, scoring the right tool, no invented metric and
Norwegian quality, before choosing a model. That eval matters more than vendor
claims _inference_.

## 5. Recommendation _inference_

1. **Now, with or without AI: fix the two defects.** Make the export include the
   training record, and replace the placeholder privacy page (§3.8). Both are
   GDPR duties today, and both are prerequisites for the consent screens.
2. **MCP first.** Read-only v1 covers jobs 1, 2, 6 and 12. v2 adds proposal
   tools (3, 5, 9, 10) that return a preview and need the athlete's "ja" in
   trainm8 or a second confirming call. It costs almost nothing to run, the
   athlete picks the assistant, and privacy-wise it is a disclosure the athlete
   directs (flow B). Claude first fits where Strava went and where one custom
   connector works on the Free plan.
3. **An in-app agent later, behind a paid tier.** Sonnet 5.5 for reasoning and
   Haiku 5.5 for reads, on **Bedrock `eu-north-1` in-region**: the same city as
   Fly `arn`, no inference transfer to the US, +10%. A typical athlete costs ≈
   $1.65–2.19 a month there, so a tier priced like the competitors ($7–20)
   leaves a wide margin. Bedrock has no Batch and no structured outputs, so the
   registry's zod schemas must validate every tool input server-side. Choose
   Anthropic first-party only if those features outweigh residency, and then
   with SCCs, a TIA and ZDR.
4. **One tool registry for both** (proposed ADR 0092), so MCP and the in-app
   agent share one safety layer: preview and digest, undo, the Unavailable
   Metric including `source-terms`.
5. **Before either AI feature launches:** the §3.9 checklist. Re-check the DPF
   appeal, Norway's KI-lov and Anthropic's retention wording each quarter.

## 6. Open questions

### 6.1 For the owner

- **Which Anthropic retention statement governs** API inputs: "not retained by
  default" or "within 30 days"? Ask Anthropic before the DPIA.
- **Does Anthropic apply its health no-training pledge to connector data?** Not
  stated anywhere found.
- **Is a Week Replan proposal that a model wrote from Strava-derived load
  "derived" data under §5.3?** Ask Strava (the MCP note raises the same
  question).
- **Garmin's written approval:** request it before any MCP or LLM use of Garmin
  data ([`watch-data-sources.md`](watch-data-sources.md)).
- **What retention period for transcripts, `rawJson` and streams?** A product
  decision the DPIA needs.

### 6.2 Claims this note could not verify

- WHOOP Coach (the support page will not render; the OpenAI link is from a 2023
  press release), ChatGPT Health (403), and the ChatGPT MCP plan matrix (403).
- The status of C-703/25 P (curia is JS-only; secondary sources say pending).
- Norway's August 2026 KI-lov notice (regjeringen.no 403; reported by NTB).
- Bedrock and Vertex per-region availability and EU prices for the 5.5 models
  (AWS renders its table client-side; Google says availability "varies by
  region").
- Mistral Large 4's function-calling quality (the post claims agents and "use
  tools", not function calling).
- All token counts and usage tiers in §4.2–4.3 are estimates; re-baseline with
  `count_tokens` and real usage logs.

## Sources

In-text keys in square brackets resolve here. All pages were read on 2026-10-11.

| Key                        | Source                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `garmin-pr`                | [Garmin: Connect+ press release, 27 Mar 2025](https://www.garmin.com/en-US/newsroom/press-release/wearables-health/elevate-your-health-and-fitness-goals-with-garmin-connect/)                         |
| `garmin-coach`             | [Garmin: five ways to use Garmin Coach](https://www.garmin.com/en-US/blog/fitness/five-ways-to-use-garmin-coach-on-your-watch/)                                                                        |
| `strava-ai`                | [Strava support: Athlete Intelligence](https://support.strava.com/en-us/articles/15401629-athlete-intelligence-on-strava)                                                                              |
| `strava-mcp`               | [Strava support: Strava MCP Connector](https://support.strava.com/en-us/articles/15401531-strava-mcp-connector)                                                                                        |
| `runna`                    | [Runna: pricing](https://www.runna.com/pricing)                                                                                                                                                        |
| `tp-api`                   | [TrainingPeaks: partner API update](https://www.trainingpeaks.com/blog/an-update-on-trainingpeaks-partner-api/)                                                                                        |
| `aie-mcp`                  | [AI Endurance: MCP docs](https://aiendurance.com/docs/mcp)                                                                                                                                             |
| `aie-pricing`              | [AI Endurance: pricing](https://aiendurance.com/pricing)                                                                                                                                               |
| `tridot`                   | [TriDot: home page](https://www.tridot.com/)                                                                                                                                                           |
| `humango`                  | [Humango: home page](https://humango.ai/)                                                                                                                                                              |
| `suunto`                   | [Suunto: Suunto Coach, now smarter with AI](https://us.suunto.com/blogs/news/level-up-your-training-with-suunto-coach-now-smarter-with-ai)                                                             |
| `suunto-mcp`               | [Suunto MCP user guide](https://mcp.suunto.com/mcpguide)                                                                                                                                               |
| `polar-fp`                 | [Polar: Fitness Program](https://www.polar.com/en/fitness-program)                                                                                                                                     |
| `polar-api`                | [Polar API Limited License Agreement (22 Aug 2025)](https://www.polar.com/en/legal/polar-api-agreement)                                                                                                |
| `oura-advisor`             | [Oura support: Oura Advisor](https://support.ouraring.com/hc/en-us/articles/39512345699219-Oura-Advisor)                                                                                               |
| `oura`                     | [Oura: membership](https://ouraring.com/membership)                                                                                                                                                    |
| `apple-2026`               | [Apple Newsroom, Sept 2026: health and fitness with Apple Intelligence](https://www.apple.com/newsroom/2026/09/apple-advances-health-and-fitness-capabilities-using-apple-intelligence/)               |
| `apple-review`             | [Apple: App Review Guidelines, 5.1.2(i)](https://developer.apple.com/app-store/review/guidelines/)                                                                                                     |
| `coros-mcp`                | [COROS: MCP testing and update log](https://www.coros.com/stories/coros-metrics/c/mcp-testing)                                                                                                         |
| `tredict-mcp`              | [Tredict: AI assistants and the Tredict MCP server](https://www.tredict.com/blog/use_ai_assistants_and_llms_with_the_tredict_mcp_server_and_interactive_mcp_apps/)                                     |
| `icu-mcp`                  | [Intervals.icu forum: official MCP support thread](https://forum.intervals.icu/t/request-for-official-mcp-support-for-ai-tools-chatgpt-claude/126164)                                                  |
| `ant-health`               | [Anthropic: Claude for healthcare and life sciences, 11 Jan 2026](https://www.anthropic.com/news/healthcare-life-sciences)                                                                             |
| `garmin-brand`             | [Garmin Developer API Brand Guidelines (PDF)](https://developer.garmin.com/downloads/brand/Garmin-Developer-API-Brand-Guidelines.pdf)                                                                  |
| `gdpr`                     | [GDPR, Regulation (EU) 2016/679](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)                                                                                            |
| `wp29-health`              | [WP29, 2015 annex: health data in apps and devices](https://ec.europa.eu/justice/article-29/documentation/other-document/files/2015/20150205_letter_art29wp_ec_health_data_after_plenary_annex_en.pdf) |
| `cjeu-184-20`              | [CJEU C-184/20, OT, 1 Aug 2022](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62020CJ0184)                                                                                            |
| `cjeu-21-23`               | [CJEU C-21/23, Lindenapotheke, 4 Oct 2024](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62023CJ0021)                                                                                 |
| `cjeu-252-21`              | [CJEU C-252/21, Meta Platforms, 4 Jul 2023](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62021CJ0252)                                                                                |
| `cjeu-40-17`               | [CJEU C-40/17, Fashion ID, 29 Jul 2019](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62017CJ0040)                                                                                    |
| `edpb-consent`             | [EDPB Guidelines 05/2020 on consent](https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf)                                                              |
| `wp242`                    | [WP29 Guidelines on the right to data portability (WP242)](https://ec.europa.eu/newsroom/article29/redirection/document/44099)                                                                         |
| `ant-dpa`                  | [Anthropic Data Processing Addendum](https://www.anthropic.com/legal/data-processing-addendum)                                                                                                         |
| `ant-terms`                | [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms)                                                                                                                         |
| `ant-privacy`              | [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)                                                                                                                                    |
| `ant-aup`                  | [Anthropic Usage Policy (effective 12 Nov 2026)](https://www.anthropic.com/legal/aup)                                                                                                                  |
| `ant-retention`            | [Claude docs: API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)                                                                                        |
| `ant-commercial-retention` | [Anthropic privacy centre: organisation data retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)                                                   |
| `ant-consumer-retention`   | [Anthropic privacy centre: consumer data retention](https://privacy.claude.com/en/articles/10023548-how-long-do-you-store-my-data)                                                                     |
| `ant-residency`            | [Claude docs: data residency](https://platform.claude.com/docs/en/manage-claude/data-residency)                                                                                                        |
| `ant-pricing`              | [Claude docs: pricing](https://platform.claude.com/docs/en/about-claude/pricing)                                                                                                                       |
| `ant-caching`              | [Claude docs: prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)                                                                                                    |
| `bedrock`                  | [Claude docs: Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)                                                                                |
| `bedrock-pricing`          | [AWS: Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)                                                                                                                                 |
| `vertex`                   | [Claude docs: Claude on Google Cloud](https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai)                                                                                       |
| `aws-dp`                   | [AWS: data protection in Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)                                                                                    |
| `dpf`                      | [Data Privacy Framework list (queried via its API)](https://www.dataprivacyframework.gov/list)                                                                                                         |
| `claude-connectors`        | [Claude support: custom connectors with remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)                                               |
| `oai-pricing`              | [OpenAI: API pricing](https://developers.openai.com/api/docs/pricing)                                                                                                                                  |
| `mistral-large4`           | [Mistral: Mistral Large 4, 6 Oct 2026](https://mistral.ai/news/mistral-large-4/)                                                                                                                       |
| `oj-latombe`               | [OJ C/2025/6610: appeal C-703/25 P, Latombe v Commission](https://eur-lex.europa.eu/eli/C/2025/6610/oj)                                                                                                |
| `dt-usa`                   | [Datatilsynet: informasjon om overføringer til USA](https://www.datatilsynet.no/aktuelt/aktuelle-nyheter-2025/informasjon-om-overforinger-til-usa/)                                                    |
| `dt-latombe`               | [Datatilsynet: EU-domstolen opprettholder adekvansbeslutningen](https://www.datatilsynet.no/aktuelt/aktuelle-nyheter-2025/eu-domstolen-opprettholder-adekvansbeslutningen-for-usa/)                    |
| `dt-dpia`                  | [Datatilsynet: vurdering av personvernkonsekvenser](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/vurdering-av-personvernkonsekvenser/)                                    |
| `aiact-annex3`             | [AI Act Service Desk: Annex III](https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-3)                                                                                                           |
| `aiact-4`                  | [AI Act Service Desk: Article 4](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-4)                                                                                                         |
| `aiact-50`                 | [AI Act Service Desk: Article 50](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50)                                                                                                       |
| `aiact-111`                | [AI Act Service Desk: Article 111](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-111)                                                                                                     |
| `aiact-113`                | [AI Act Service Desk: Article 113](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113)                                                                                                     |
| `eu-omnibus`               | [Regulation (EU) 2026/1744, Digital Omnibus on AI](https://eur-lex.europa.eu/eli/reg/2026/1744/oj)                                                                                                     |
| `council-vote`             | [Council ST 11301/26: voting result, 29 Jun 2026](https://data.consilium.europa.eu/doc/document/ST-11301-2026-INIT/en/pdf)                                                                             |
| `mdcg`                     | [MDCG 2019-11: qualification of medical device software](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en?filename=mdcg_2019_11_guidance_en.pdf)                  |
| `nkom`                     | [Nkom: hovedansvar for nye lover om digitale tjenester og KI](https://nkom.no/aktuelt/nkom-far-hovedansvar-for-nye-lover-om-digitale-tjenester-og-ki)                                                  |
| `regj-ki-2026`             | [Regjeringen: Tung vil sende KI-loven med endringer på høring](https://www.regjeringen.no/no/aktuelt/tung-vil-sende-ki-loven-med-endringer-pa-horing/id3169693/)                                       |
| `fly-pricing`              | [Fly.io: pricing](https://docs.fly.io/about/pricing)                                                                                                                                                   |

## ADRs this research challenges

| ADR                                                                       | What it decided                                                              | What the evidence says                                                                                                                                                                                                                                                           | Verdict                                                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **0016** AI plan generation (§8 not in force)                             | §8: "a hosted Claude model via the Anthropic SDK"                            | For health data the provider is a residency and transfer decision, not an SDK choice: first-party has no EU geo and Anthropic is not DPF-listed, while Bedrock `eu-north-1` keeps inference in Stockholm. The leftover `@anthropic-ai/sdk` would be the wrong client for Bedrock | **Confirm** §8 stays out of force; ADR 0095 must name processor and region |
| **0080** Week Replan proposes; the athlete's sessions need a yes          | §6: "AI later writes the same proposals … Only the author of step 1 changes" | Art. 50(2) wants model-written text machine-readably marked, and accountability wants to know who proposed what. The `author` column the siblings ask for is also the marking and the audit key                                                                                  | **Amend** §6                                                               |
| **0081** Norwegian; `labels.ts` owns every word                           | Every shown word comes from `labels.ts`                                      | The AI disclosure ("KI") and the consent copy belong in `labels.ts`; model prose cannot, and must be shown as the model's                                                                                                                                                        | **Amend** (scope)                                                          |
| **0012** Disconnect preserves Recordings                                  | Full deletion is "a separate, explicit athlete operation"                    | Erasure exists and cascades. Its counterpart does not: the export leaves out the training record. Both must grow to cover transcripts, consent records and the audit log                                                                                                         | **Confirm**, and extend to the export                                      |
| **0020** Downsampled activity stream (already marked Revisit → Supersede) | Store a ≥ 5 s display grid                                                   | The proposed full-resolution analysis tier makes the health data finer-grained. Pair it with a retention period and minimised tool output (aggregates before raw streams)                                                                                                        | **Amend** the replacement                                                  |
| **0026** Key-based providers                                              | The Intervals.icu API key is stored as the connection's credential           | Credentials share a plain `accessToken` column with OAuth tokens. Encrypt them at rest before adding any BYO LLM key                                                                                                                                                             | **Amend**                                                                  |
| **0008** / GOAL.md building principle: the Unavailable Metric             | Never fabricate; degrade to an honest gap                                    | It is also the medical boundary and the vendor-terms gate: "not enough data", "ask a doctor" and `source-terms` are the same typed refusal                                                                                                                                       | **Confirm** (extend)                                                       |
| **GOAL.md** non-goal: no general-wellness tracking                        | No nutrition, sleep, HRV, weight or mood logging                             | It keeps the health-data surface and the DPIA small, unlike Oura, WHOOP and COROS, which pass sleep, HRV and cycle data to assistants. Weight still exists as a threshold kind and on set rows                                                                                   | **Confirm**                                                                |
