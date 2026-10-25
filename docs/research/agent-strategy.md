# The agent strategy: what trainm8 builds, in what order, and why

The capstone of the agent research. One document to decide the path: whether to
adopt Builder.io's agent-native, fork it or build our own; the stack and its
order; MCP; watch data without Strava; and what the law asks first.

> **Decision note · 2026-10-11.** A synthesis over ten research notes written
> from primary sources the same day: [agent-native](agent-native.md) (**AN**),
> [agent-native-open-stack](agent-native-open-stack.md) (**OS**),
> [agent-platforms](agent-platforms.md) (**PF**),
> [stack-migration](stack-migration.md) (**SM**),
> [mcp-server-for-trainm8](mcp-server-for-trainm8.md) (**MCP**),
> [agent-layer-building-blocks](agent-layer-building-blocks.md) (**BB**),
> [agent-layer-trainm8-surface](agent-layer-trainm8-surface.md) (**SF**),
> [watch-data-sources](watch-data-sources.md) (**WS**),
> [watch-data-trainm8-ingest](watch-data-trainm8-ingest.md) (**WI**) and
> [ai-product-privacy-cost](ai-product-privacy-cost.md) (**AI**). Every claim
> links to the section that backs it; the primary sources are cited there.
> Effort is the notes' estimate for one developer working with coding agents.
> Not legal advice.
>
> **It answers:** Adopt agent-native, fork it, or build our own on its
> principles? Which stack, in what order? MCP server, in-app agent, or both?
> Where does training data come from without Strava? What must be true legally
> before an agent touches the training record? What happens this week?

---

## The answer in one screen

- **Build our own small agent layer on agent-native's principles. Don't adopt it
  and don't fork it.** Adoption is about 6–10 months and moves every logged-in
  page to client-side fetching; a fork means owning about 887 k lines, 5×
  trainm8
  ([OS §1](agent-native-open-stack.md#1-the-owners-question-answered-head-on),
  [OS verdict](agent-native-open-stack.md#verdict-table)).
- **Converge on its stack minus the framework, in this order:** Better Auth on
  today's Prisma + SQLite → MCP OAuth through `@better-auth/mcp` + `cimd` →
  Postgres when a trigger fires → Drizzle after its 1.0 GA. That keeps adopting
  agent-native at its 1.0 cheap
  ([SM §1.2](stack-migration.md#12-the-order-and-why),
  [PF §9](agent-platforms.md#9-recommendation-ranked)).
- **MCP first, the in-app agent last and optional.** The athlete's own Claude or
  ChatGPT pays for inference, so trainm8's running cost is close to zero
  ([AI §4.3](ai-product-privacy-cost.md#43-cost-model-b-mcp-only),
  [MCP §9](mcp-server-for-trainm8.md#9-phased-plan)).
- **One registry, three readers.** `defineAction` in `app/actions/` feeds the
  routes, the MCP server and a later in-app agent; every number is a `Reading`
  that can be Unavailable with a reason (ADR 0092;
  [MCP §8](mcp-server-for-trainm8.md#8-one-registry-three-consumers)).
- **The model proposes; the athlete says yes inside trainm8.** A host's
  tool-approval click is not that yes, and every write returns a server-held
  undo handle (ADR 0093;
  [MCP §6.2](mcp-server-for-trainm8.md#62-adr-0080-the-model-is-a-proposal-author-never-the-yes)).
- **Own the data path, not the vendor.** FIT is the one read format and every
  import records its origin platform. Polar → COROS → Suunto → Garmin when it
  reopens → Wahoo after legal review; Intervals.icu is a bridge whose Garmin
  supply may stop any day
  ([WS §7](watch-data-sources.md#7-recommended-sourcing-strategy-and-integration-order)).
- **The binding external constraints are Garmin's closed program and its §5.2(o)
  approval, per-vendor consent and attribution, and GDPR Art. 9 with EU
  residency** ([WS §6](watch-data-sources.md#6-ai-and-mcp-terms-per-source),
  [AI §3.1](ai-product-privacy-cost.md#31-is-training-data-data-concerning-health)).
  Strava's AI and MCP bans bind only if Strava data is in the database or Strava
  returns; it is wired but hidden today
  ([MCP §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric),
  [WI §6.3](watch-data-trainm8-ingest.md#63-strava-is-still-wired-but-hidden-verified)).
- **Compliance is a gate, not a phase:** an Art. 13 notice, per-purpose consent
  and a DPIA before either AI feature reaches athletes; an in-app agent runs on
  Claude via Bedrock `eu-north-1` behind a paid tier
  ([AI §5](ai-product-privacy-cost.md#5-recommendation-inference)).
- **Nine things are wrong today with or without AI**, from missing Garmin
  attribution to an export without the training record. Each is days of work
  ([below](#do-now-independent-of-ai)).
- **First milestone:** Claude reads an athlete's trainm8 over OAuth in about 4–7
  weeks; proposals and logs with undo 1–2 weeks later
  ([SM §1.3](stack-migration.md#13-what-the-owners-intuitive-order-costs)).

## Decision map

| Axis                          | Options considered                                                                                                                                                                                          | Recommendation                                                                                                                                                                                                                                                                           | Confidence                                                                           | What would change it                                                                                                                                                                                                       | Backing                                                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**                 | Adopt agent-native (A); fresh rebuild on its scaffold (A′); hard fork (F1); pin + patch (F2); transplant MIT leaves (F3); own layer (C, C+); companion app; Convex; Cloudflare Agents SDK; Mastra; Supabase | **Own layer on agent-native's stack minus the framework (C+)**, with F3 leaves copied in. Mastra only as a loop library inside it; Supabase only as a Postgres host                                                                                                                      | High                                                                                 | agent-native 1.0 with a deprecation window and under ~4 app-facing breaks a month for a quarter; Nitro 3 stable; per-user SSR; in-app chat made core (companion app moves up); real-time multi-user collaboration (Convex) | [OS §9](agent-native-open-stack.md#9-revised-ranking-and-the-consolidated-plan), [PF §9](agent-platforms.md#9-recommendation-ranked), [AN §6](agent-native.md#6-options)                                             |
| **Stack**                     | Auth: Epic Stack, Better Auth, node-oidc-provider beside Epic. DB: SQLite/LiteFS, Postgres. ORM: Prisma, Drizzle. Region: `arn`, `fra`. Host: Fly, Neon, Fly MPG, Supabase, Workers                         | **Better Auth now** on Prisma + SQLite; **Postgres on Prisma on a trigger**, by default Neon Frankfurt with the app in `fra`, Supabase Stockholm if `fra` measures worse; **Drizzle after 1.0 GA**; Fly stays. If Postgres never triggers: plain SQLite without LiteFS, Prisma 7         | High on the order; medium on host and region                                         | `@better-auth/mcp` failing against Claude (node-oidc-provider first); measured Oslo latency; Drizzle's GA date; a second machine needed sooner                                                                             | [SM §2](stack-migration.md#2-component-decisions), [SM §5.1](stack-migration.md#51-region-decision), [SM §7](stack-migration.md#7-phased-plan)                                                                       |
| **Agent surface**             | MCP server only; in-app agent only; both; an MCP Apps widget                                                                                                                                                | **MCP first**: reads, then OAuth, then proposals and logs with undo. In-app agent last, only if wanted. The widget is optional, for the athlete's own tap                                                                                                                                | High                                                                                 | The owner making in-app chat a core goal; Claude and ChatGPT documenting elicitation; low connector uptake                                                                                                                 | [MCP §9](mcp-server-for-trainm8.md#9-phased-plan), [AI §5](ai-product-privacy-cost.md#5-recommendation-inference), [AN §7](agent-native.md#7-recommendation)                                                         |
| **Agent loop and libraries**  | Anthropic SDK tool runner; Claude Agent SDK; Vercel AI SDK 7; CopilotKit; assistant-ui; Mastra; AgentKit; the Messages API MCP connector                                                                    | **MCP TS SDK v2** `createMcpHandler` at `/mcp`. Registry schemas in `zod/v4` now, zod ≥ 4.2 before MCP ships. In-app loop: **AI SDK 7** with an explicit provider, the Anthropic SDK's manual loop as fallback; own chat UI on `useChat`. Not CopilotKit, the Agent SDK or the connector | Medium: the libraries churn, and the Bedrock packages are verified on paper, not run | AI SDK lagging Claude features; assistant-ui reaching 1.0 if threads and branching become needed                                                                                                                           | [BB §9.2](agent-layer-building-blocks.md#92-the-pieces), [BB §9.3](agent-layer-building-blocks.md#93-zod-3-or-zod-4-what-each-piece-needs), [MCP §8.2](mcp-server-for-trainm8.md#82-the-three-consumers)             |
| **Data sources**              | Direct per vendor; aggregators (Terra, Junction, ROOK, Spike, Thryve, Open Wearables); Intervals.icu; a native HealthKit / Health Connect companion; FIT upload                                             | **FIT upload as the floor, Intervals.icu as the bridge**, then direct through one FIT-first path: **Polar → COROS → Suunto → Garmin** when it reopens → **Wahoo** after legal review → a native companion when Apple Watch users matter. Terra only if Garmin stalls                     | Medium-high on the order; low on Garmin's timing                                     | Garmin reopening or publishing its October terms; COROS refusing commercial use; Suunto's agreement; Apple Watch demand                                                                                                    | [WS §5](watch-data-sources.md#5-cross-option-comparison), [WS §7](watch-data-sources.md#7-recommended-sourcing-strategy-and-integration-order), [WI §7](watch-data-trainm8-ingest.md#7-phased-plan)                  |
| **AI provider and residency** | MCP only (the athlete's assistant); Anthropic first-party; Claude on Bedrock `eu-north-1`; Claude on Vertex `eu`; OpenAI EU endpoints; Mistral; bring your own key                                          | **MCP only to start.** For an in-app agent: **Claude on Bedrock `eu-north-1`** on its EU profile (+10 %), Sonnet 5.5 to reason, Haiku 5.5 for reads. Anthropic first-party only with SCCs, a TIA and ZDR. Bring-your-own-key at most a power-user switch                                 | Medium                                                                               | Anthropic first-party gaining EU inference; the eval's results; the DPF appeal (C-703/25 P); the app moving to `fra`, which weakens the same-city argument (inference)                                                     | [AI §3.4](ai-product-privacy-cost.md#34-processor-terms-and-where-the-data-goes-flow-a), [AI §4.5](ai-product-privacy-cost.md#45-providers-compared), [AI §5](ai-product-privacy-cost.md#5-recommendation-inference) |
| **Compliance**                | Ship under today's notices; or treat the training record as Art. 9 health data with explicit per-purpose consent, a DPIA, AI disclosure and vendor gates first                                              | **The second.** Art. 13 notice and a working export now; per-purpose consent, DPIA, processor DPA, retention periods, an audit log and encrypted credentials before AI reaches athletes; Garmin approval, Polar opt-in and attribution per vendor                                        | High that the checklist applies; medium on the details                               | Datatilsynet guidance; Norway's KI-lov; Garmin's October terms                                                                                                                                                             | [AI §3.6](ai-product-privacy-cost.md#36-the-dpia), [AI §3.9](ai-product-privacy-cost.md#39-compliance-checklist-for-launch), [WS §6](watch-data-sources.md#6-ai-and-mcp-terms-per-source)                            |
| **Product**                   | Twelve ranked agent jobs: narration, session debriefs, the daily call, proposals, composer writes, Sesong edits, events, thresholds, strength logs                                                          | **MCP v1 reads:** week vs plan, why today was hard, go hard today?, volume per discipline. **v2:** composer writes and strength logs with undo, and proposals (travel, event, threshold) the athlete answers in trainm8. The registry's first slice, with no model, is Ukeskiftet        | Medium                                                                               | The owner's priorities; usage from v1                                                                                                                                                                                      | [AI §2.2](ai-product-privacy-cost.md#22-what-the-agent-should-do-ranked), [SF §7](agent-layer-trainm8-surface.md#7-readiness-verdict), [MCP §7](mcp-server-for-trainm8.md#7-a-concrete-trainm8-mcp-surface)          |

## Why not agent-native (and why not a fork)

agent-native is a good idea, built well in places: one `defineAction` per
capability, served to the UI, the agent, MCP and A2A, with its MCP server the
most mature part ([AN §2.9.1](agent-native.md#291-each-app-is-an-mcp-server)).
The open stack removed the blockers, not the main costs:

- **It strips the login from every server render.** The cookie and
  `authorization` headers are deleted before React Router sees a request, so all
  87 loader modules would move to client-side fetching, a step back for a phone
  PWA ([OS §2.2](agent-native-open-stack.md#22-the-ssr-rule-enforced-in-code)).
- **It is not finished.** Nitro 3 is a beta; about 6–7 app-facing breaks a month
  land in chat, settings, auth and MCP config; one author wrote 69 % of recent
  commits ([OS §3](agent-native-open-stack.md#3-maturity-and-churn),
  [OS §6](agent-native-open-stack.md#6-if-adopted-anyway-upgrades-and-the-tax)).
- **It is shaped for team tools:** orgs, roles, email-keyed ownership, about
  4,000 English strings and no Norwegian locale
  ([OS §2.3](agent-native-open-stack.md#23-other-structural-constraints)).
- **Its price is 6–10 months**, with 30–45 upstream minors shipping meanwhile,
  and the part trainm8 wants first, the MCP authorization server, comes cheaper
  from Better Auth
  ([OS §5](agent-native-open-stack.md#5-what-full-adoption-a-would-cost),
  [OS §4](agent-native-open-stack.md#4-what-trainm8-would-get-for-free)).
- **A fork is worse.** About 887 k lines against upstream's ~58 commits a day;
  the pinned Better Auth, MCP SDK and Nitro upgrades become ours; a pinned copy
  with patches blocks its own upgrade tool; and the server side is one hub that
  reaches 1,137 files from every entry point
  ([OS §7](agent-native-open-stack.md#7-forks-priced),
  [OS §7.1](agent-native-open-stack.md#71-f3-what-each-module-drags-in)).
- **Open source and obscurity help less than they seem.** We can read and copy
  it, but the licence paperwork is untidy, athletes never see the framework, and
  the real risks are churn and one author, not obscurity
  ([OS §1](agent-native-open-stack.md#1-the-owners-question-answered-head-on)).

**What we take.** The principles: one definition per capability, refusals as
typed errors, no UI calling an LLM, a parity test, evals that run the real loop
([AN §7.1](agent-native.md#71-what-to-borrow)). From its MCP server: scopes
derived from the action's kind, `readOnlyHint` / `destructiveHint` derived the
same way, a compact catalog, a deep link on every write, membership re-checked
per request, and one-time approvals bound to the caller and an argument hash
([AN §5.5](agent-native.md#55-trainm8-as-an-mcp-server),
[AN §2.9.5](agent-native.md#295-how-approval-works-on-each-surface)). MIT leaf
modules: copy `mcp/tool-input-schema.ts`, port `approval-store.ts`'s ~90 lines
onto Prisma, read and adapt `action.ts`; each with the "Copyright (c)
Builder.io" MIT notice and a provenance line
([OS §7.1](agent-native-open-stack.md#71-f3-what-each-module-drags-in),
[OS §7.2](agent-native-open-stack.md#72-licensing-for-a-fork-or-a-transplant)).
**What we leave:** the `application_state` table, the public-shell SSR rule,
A2A, `ask-agent`, WebMCP and agent-editable code.

**When we revisit:** at its 1.0, if it ships a written deprecation window and
stays under about four app-facing breaks a month for a quarter, Nitro 3 is
stable, core supports per-user SSR, and the top author's share falls below about
40 % or a second maintaining organisation appears
([OS §9](agent-native-open-stack.md#9-revised-ranking-and-the-consolidated-plan)).
By then trainm8 runs the same layers, so a switch would be small
([PF §8D](agent-platforms.md#8d-agent-native)).

## The path

| Phase                                         | What ships                                                                                                                                                                                                                                                                                                                               | Effort                                           | Gate to leave it                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0. Decide and fix** (now)                   | ADRs 0092, 0093, 0096 and 0098; the [do-now fixes](#do-now-independent-of-ai); the [outreach](#vendor-outreach-to-start-this-week); registry schemas in `zod/v4`, then zod ≥ 4.2; the registry's first slice on Ukeskiftet behind its own route, no model; six MCP reads on a dev token with the `Reading` union and the provenance gate | Fixes: days. Registry: S–M. MCP reads: 1–2 weeks | Every Ukeskiftet intent maps to an action (parity test); reads return `unavailable` with a reason, never a zero; no model in the request path ([AN §7.2](agent-native.md#72-phased-plan), [MCP §9](mcp-server-for-trainm8.md#9-phased-plan))                                                                                                                                               |
| **1. Better Auth on Prisma + SQLite**         | `username`, `emailOTP`, `twoFactor`, `passkey`, `admin`, GitHub; the 39 auth files rewritten behind unchanged `getUserId` / `requireUserId`; one login cutover; ADR 0094                                                                                                                                                                 | 3–5 weeks                                        | 2FA hooks on passkey and GitHub sign-in, e2e on all three paths; 2FA users told to re-enrol; exact pins ([SM §8](stack-migration.md#8-migration-risk-register))                                                                                                                                                                                                                            |
| **2. MCP OAuth, read-only, Claude connector** | `jwt()` + `mcp()` + `cimd()` and both DCR flags; consent and connected-assistants pages; `/mcp` limited per token subject, not per IP; `McpAuditEvent`; both protocol eras; four more reads, the vocabulary resource, three prompts                                                                                                      | 1–2 weeks                                        | Passes Claude's stricter client ([MCP §3.2](mcp-server-for-trainm8.md#32-where-claudes-client-is-stricter), [SM §7](stack-migration.md#7-phased-plan)); the per-subject limit holds ([MCP §6.8](mcp-server-for-trainm8.md#68-rate-limiting)). **Before any athlete but the owner connects:** DPIA, Art. 13 notice, a consent screen per client, attribution in output from W0's provenance |
| **3. MCP writes with undo**                   | `propose_week_change`, `write_session`, `mark_session_done`, `log_strength_session`, `undo`; ADR 0093 in code: `author` on proposals, silence never applies an assistant's proposal, opaque server-held undo handles, step-up scopes; `answer_proposal` app-only                                                                         | 1–2 weeks                                        | A proposal made in chat is answerable in trainm8 the same day, and the model can never give the yes ([MCP §10.2](mcp-server-for-trainm8.md#102-product))                                                                                                                                                                                                                                   |
| **W. Watch data** (parallel from now)         | W0: the stub filter, `athleteId` in the key, provenance columns backfilled from `rawJson`, attribution. W1: FIT-first ingest, the alias table, original FITs harvested from Intervals.icu. W2: FIT workout export through the Intervals.icu calendar (ADR 0097). W3: Polar, COROS, Suunto. W4 (gated): Garmin, Wahoo, a native companion | W0 days; W1, W2 1–2 weeks each; W3 ~1 week each  | Per vendor: written answers to the outreach and an ADR 0098 rule for that origin ([WI §7](watch-data-trainm8-ingest.md#7-phased-plan))                                                                                                                                                                                                                                                     |
| **4. Postgres on Prisma** (on a trigger)      | Region; Prisma 7; a baseline with the 63 CHECKs; ADR 0079's partial unique index first; the 59 transactions audited; Docker Postgres tests; LiteFS removed; `NOTIFY`-backed SSE; ADR 0099                                                                                                                                                | 3–5 weeks                                        | A trigger fired (second machine, PITR, preview databases, off LiteFS) and Oslo latency measured to `fra` and `arn` ([SM §5](stack-migration.md#5-postgres))                                                                                                                                                                                                                                |
| **5. Drizzle** (optional)                     | `drizzle-kit pull --init`, then module by module; Better Auth on the Drizzle adapter; Prisma dropped                                                                                                                                                                                                                                     | 6–10 weeks                                       | Drizzle 1.0 GA on npm `latest` ([SM §6](stack-migration.md#6-drizzle))                                                                                                                                                                                                                                                                                                                     |
| **6. In-app agent** (optional)                | ADR 0095: the registry as in-process tools; Claude on Bedrock `eu-north-1`; trainm8's own chat UI; the AI disclosure; a paid tier                                                                                                                                                                                                        | 2–4 weeks                                        | The owner wants it; the DPIA covers flow A; a 30–50-case eval passes on right tool, no invented metric and Norwegian ([AI §4.5](ai-product-privacy-cost.md#45-providers-compared))                                                                                                                                                                                                         |

**What runs in parallel.** Phase 0's strands, the W track and the compliance
work (notice, export, credential encryption, DPIA) run side by side from today.
Phases 1 → 2 → 3 are sequential; MCP Phase 0 needs no Better Auth
([SM §7](stack-migration.md#7-phased-plan)). Phase 4 waits for a trigger, 5 for
Drizzle, 6 for the owner. Doing Postgres and Drizzle first would push MCP OAuth
from weeks 4–7 to weeks 13–22
([SM §1.3](stack-migration.md#13-what-the-owners-intuitive-order-costs)).

**Fallbacks.** If Phase 1 slips or `@better-auth/mcp` fails against Claude, the
authorization server is node-oidc-provider on today's session, about 2–4 weeks
([MCP §3.3](mcp-server-for-trainm8.md#33-what-trainm8-would-build)). The #552
spike found no failing check short of the connector click, and showed that an
Epic session can issue a Better Auth session, so a slipping Phase 1 need not
hold MCP OAuth back
([spike §7, §9](better-auth-mcp-spike.md#9-fallback-verdict-node-oidc-provider)).
React Router 8 moves on its own schedule
([SM §1.2](stack-migration.md#12-the-order-and-why)).

## Do now, independent of AI

All re-checked against HEAD `58c57c9` while writing this note.

| #   | Finding                                                                                                                                                                                     | Status                                                                   | Fix                                                                                                        | Source                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No Garmin attribution anywhere.** Intervals.icu's terms pass Garmin's brand rules down; the Recording card shows "Intervals.icu" where "Garmin [device]" belongs                          | Verified                                                                 | Provenance columns; "Garmin [device]" by the title; the derived-data line on load numbers and Coach output | [WI §6.1](watch-data-trainm8-ingest.md#61-the-garmin-attribution-gap-verified), [WS §1.4](watch-data-sources.md#14-attribution-including-ai-output)                                   |
| 2   | **Strava stubs through Intervals.icu** likely become 0-second "other" sessions                                                                                                              | Inferred from forum posts; the code path is verified                     | Skip `source === 'STRAVA'`, a `_note`, or no duration; add a fixture                                       | [WI §6.2](watch-data-trainm8-ingest.md#62-strava-stubs-become-sessions-inferred-from-forum-posts)                                                                                     |
| 3   | **The dedupe key ignores the athlete:** `(externalProvider, externalId)`, and an upload hash without `athleteId`                                                                            | Verified; impact inferred                                                | Add `athleteId` to the key and the hash                                                                    | [WI §6.5](watch-data-trainm8-ingest.md#65-the-dedupe-key-ignores-the-athlete-verified-impact-inferred)                                                                                |
| 4   | **The privacy page is a placeholder** (`<div>Privacy</div>`)                                                                                                                                | Verified                                                                 | An Art. 13 notice                                                                                          | [AI §3.8](ai-product-privacy-cost.md#38-what-the-repository-shows-today)                                                                                                              |
| 5   | **The data export omits the training record:** user row, image, sessions and roles only                                                                                                     | Verified                                                                 | Add profile, workouts, imports, streams and logs (Art. 15, 20)                                             | [AI §3.8](ai-product-privacy-cost.md#38-what-the-repository-shows-today)                                                                                                              |
| 6   | **Provider tokens and keys stored unencrypted** in `AccountConnection.accessToken`                                                                                                          | Verified (no application-level encryption found)                         | Encrypt at rest before any new secret is stored                                                            | [AI §3.8](ai-product-privacy-cost.md#38-what-the-repository-shows-today), [AI ADRs](ai-product-privacy-cost.md#adrs-this-research-challenges)                                         |
| 7   | **Intervals.icu likely losing Garmin data.** Its developer expects to block Garmin data "soon"; the hub still says Intervals.icu already has the athlete's Garmin data (`labels.ts:4947`)   | Verified that its developer said so (2026-10-09); scope and date unknown | Harvest original FITs per activity now; change the hub copy; FIT upload stays the floor                    | [WS §1.6](watch-data-sources.md#16-the-undisclosed-septemberoctober-2026-change), [WI §4](watch-data-trainm8-ingest.md#4-migrating-off-intervalsicu-without-losing-recordings)        |
| 8   | **Strava wired but hidden.** If any Strava data exists, Policy §6.2's seven-day cache binds `rawJson`, which is kept with no limit                                                          | Wiring verified; whether production holds Strava rows was not checked    | Decide: unset the secrets and delete the code and rows, or keep Strava deliberately and enforce the cache  | [WI §6.3](watch-data-trainm8-ingest.md#63-strava-is-still-wired-but-hidden-verified), [MCP §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric) |
| 9   | **Stale ADR text:** 0012 (no `accountConnectionId`), 0013 (Strava does not sign webhooks), 0014 (file names; per-provider switches), 0026 (OAuth reasons, Garmin's flow, "already mirrors") | Verified                                                                 | Amend the four ADRs                                                                                        | [WI §6.4](watch-data-trainm8-ingest.md#64-stale-adr-text-verified), [WS ADRs](watch-data-sources.md#adrs-this-research-challenges)                                                    |

## Vendor outreach to start this week

Send from the company and keep every reply; portal terms stay out of this
repository ([WS §8](watch-data-sources.md#8-vendor-outreach)).

| Vendor     | This week                                                                                                                                                      | Ask                                                                                                                                                                                                                                                                                      | Source                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Suunto** | Apply through APIZone (companies only, review within two weeks)                                                                                                | The agreement before we accept it; FIT retention while the athlete has an account; an LLM processor and our MCP with consent; attribution; production limits; which watches run Guides                                                                                                   | [WS §2.1](watch-data-sources.md#21-suunto-apizone), [WS §8](watch-data-sources.md#8-vendor-outreach)                              |
| **COROS**  | Email api@coros.com                                                                                                                                            | May a commercial, multi-user app use the developer MCP, given the ToS bars "any commercial purpose"? May we store FIT and derived metrics and re-expose them over our MCP? A higher 50-file cap for a backfill? Partner API criteria                                                     | [WS §2.3](watch-data-sources.md#23-coros), [WS §8](watch-data-sources.md#8-vendor-outreach)                                       |
| **Garmin** | Register interest through the developer contact form (the program is closed, the access form under maintenance); write to connect-support@developer.garmin.com | When applications open; the October terms before we apply; §5.2(o) written approval naming Claude.ai, Claude Desktop and ChatGPT; §5.2(q) an LLM processor; whether per-value attribution suffices in MCP output; §5.2(t) and (e) for a planner and a paid tier; §4.6 on pushed workouts | [WS §1.1](watch-data-sources.md#11-access-closed-business-only-free), [WS §8](watch-data-sources.md#8-vendor-outreach)            |
| **Polar**  | Self-serve: register an AccessLink client, no approval                                                                                                         | Nothing blocks; design the separate AI opt-in (§3.1.1) and the "Polar" credit on derived values                                                                                                                                                                                          | [WS §2.2](watch-data-sources.md#22-polar-accesslink-v3), [AI §3.9](ai-product-privacy-cost.md#39-compliance-checklist-for-launch) |
| **Wahoo**  | Legal review of restriction (iii) and the competitor clause before writing                                                                                     | Storing FIT and GPS as history; whether a multi-vendor hub "supports in any way" a competitor; retention after revocation; LLM summaries as "modifying"                                                                                                                                  | [WS §2.4](watch-data-sources.md#24-wahoo), [WS §8](watch-data-sources.md#8-vendor-outreach)                                       |
| **Terra**  | Nothing: a fallback if Garmin stalls                                                                                                                           | Then: does "solely in such Customer Application" allow an LLM processor and an MCP client; whose licence covers data on our own Garmin keys; EU-only processing                                                                                                                          | [WS §3.2](watch-data-sources.md#32-terra), [WS §7](watch-data-sources.md#7-recommended-sourcing-strategy-and-integration-order)   |

## The ADR roadmap

0091 is the newest ADR in `docs/adr/`. The research proposes these:

| ADR      | Subject                                                    | Decides                                                                                                                                                                                                                                      | Amends or supersedes                                                                                                    | Phase | Backing                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0092** | The action registry                                        | `defineAction` in `app/actions/`; kinds read / propose / write; `userId` from context only; refusals as typed tool errors in `labels.ts` words; one `Reading` vocabulary with `source-terms`; a provenance gate on every model-facing reader | —                                                                                                                       | 0     | [MCP §8.4](mcp-server-for-trainm8.md#84-what-an-adr-would-decide), [BB §9.1](agent-layer-building-blocks.md#91-the-registry-owned-by-trainm8-with-no-framework)                                                 |
| **0093** | An agent is a proposal author, never the athlete's yes     | An `author` on proposals; silence never applies an assistant's; `needs-athlete-yes`; undo handles in results, opaque and server-held; a model as a caller of `SeasonGenerator`                                                               | Amends 0080 §3, §6; 0053 §1 (and §2 when a model generates); 0088                                                       | 0     | [AN §7.2](agent-native.md#72-phased-plan), [MCP §6.4](mcp-server-for-trainm8.md#64-adr-0088-every-direct-write-returns-an-undo-handle), [SF ADRs](agent-layer-trainm8-surface.md#adrs-this-research-challenges) |
| **0094** | Better Auth owns login and is the MCP authorization server | `@better-auth/mcp` + `cimd` + `jwt()`; DCR enabled for Claude's fallback; both protocol eras; scopes `training:read`, `:propose`, `:log`; node-oidc-provider is the fallback if auth stays                                                   | Supersedes Epic decisions 007 (implementation), 014, 028, 029, 030; amends 013, 039                                     | 1     | [SM §4.4](stack-migration.md#44-the-mcp-notes-3-checklist), [SM ADRs](stack-migration.md#adrs-this-research-challenges), [MCP §3.4](mcp-server-for-trainm8.md#34-scopes-and-per-user-isolation)                 |
| **0095** | The in-app agent                                           | Claude on Bedrock `eu-north-1`; models; a paid tier; only after the DPIA; consent, disclosure and transcript retention; an async `ProposalAuthor`                                                                                            | Keeps 0016 §8 out of force; amends 0081's scope                                                                         | 6     | [AI §5](ai-product-privacy-cost.md#5-recommendation-inference), [AI ADRs](ai-product-privacy-cost.md#adrs-this-research-challenges), [BB ADRs](agent-layer-building-blocks.md#adrs-this-research-challenges)    |
| **0096** | Activity provenance and cross-provider identity            | `originPlatform`, device and FIT key on every import; `athleteId` in the key; the FIT `file_id` as canonical key; a fuzzy fallback; aliases, not rows                                                                                        | Amends 0012, 0014; confirms 0049; supersedes 0026's dedupe consequence                                                  | 0, W1 | [WI §3](watch-data-trainm8-ingest.md#3-cross-provider-identity-and-dedupe), [WI ADRs](watch-data-trainm8-ingest.md#adrs-this-research-challenges)                                                               |
| **0097** | Workout export to the watch                                | One canonical export model, a serializer per target, FIT first through the Intervals.icu calendar, vendor workout ids kept for plan→actual                                                                                                   | Settles 0051's question about Garmin's §4.6 licence before the Training API                                             | W2    | [WI §5](watch-data-trainm8-ingest.md#5-workout-export-fit-workout-files-now-then-vendor-apis), [WS ADRs](watch-data-sources.md#adrs-this-research-challenges)                                                   |
| **0098** | Source terms per origin platform                           | Attribution and the model-facing gate key on `originPlatform`, not the transport: Garmin approval and attribution, Polar opt-in and credit, phone-store consent, Strava if it returns                                                        | Widens 0092's gate beyond Strava                                                                                        | 0     | [WI ADRs](watch-data-trainm8-ingest.md#adrs-this-research-challenges), [WS §6](watch-data-sources.md#6-ai-and-mcp-terms-per-source)                                                                             |
| **0099** | Move to Postgres                                           | Host and region; the baseline and CHECKs; the Read Committed audit; `NOTIFY`-backed SSE                                                                                                                                                      | Supersedes decision 003; amends decisions 009 and 042, ADR 0044 §8, 0061, 0079 (before the move), 0049's stream trigger | 4     | [SM ADRs](stack-migration.md#adrs-this-research-challenges), [PF ADRs](agent-platforms.md#adrs-this-research-challenges)                                                                                        |

There is **no separate MCP-server ADR**: the MCP note puts the server inside
0092 as one of the registry's three readers and its authorization in 0094, and
the transport choice is recorded in 0094
([MCP §8.4](mcp-server-for-trainm8.md#84-what-an-adr-would-decide),
[SM §8](stack-migration.md#8-migration-risk-register)). Drizzle gets an ADR only
when 1.0 ships.

## Risks, open questions and the owner's decisions

**Decisions only the owner can make.**

1. **Region when Postgres arrives:** Neon Frankfurt with the app moved `arn` →
   `fra` (the default, cheapest for preview databases), or Supabase Stockholm,
   which keeps `arn` but adds a provider. Measure Oslo latency first
   ([SM §5.1](stack-migration.md#51-region-decision),
   [PF §8A.1](agent-platforms.md#8a1-where-the-database-can-live)).
2. **Is in-app chat a core goal?** It decides Phase 6 and would move the
   companion-app option up ([OS §8](agent-native-open-stack.md#8-middle-paths)).
3. **A paid tier** for the in-app agent: a typical athlete costs about
   $1.65–2.19 a month on Bedrock EU, against $7–20 competitor tiers; with Garmin
   data, a paid tier may need Garmin's permission
   ([AI §4.2](ai-product-privacy-cost.md#42-cost-model-a-an-in-app-agent-inference-token-counts-are-estimates),
   [WS §1.3](watch-data-sources.md#13-terms-that-bind-an-ai-or-mcp-layer)).
4. **Strava's fate:** delete it, or keep it and enforce the cache (do-now 8).
5. **Retention** for transcripts, `rawJson` and streams; the DPIA needs it
   ([AI §6.1](ai-product-privacy-cost.md#61-for-the-owner)).
6. **Is an agent's write on the athlete's say-so the athlete's or the
   machine's,** and how long does undo last in a conversation
   ([AN §8](agent-native.md#8-open-questions))?
7. **Garmin's timeline is unknown.** Plan as if Garmin direct does not arrive
   this year; FIT upload carries Garmin athletes if the bridge closes
   ([WS §1.1](watch-data-sources.md#11-access-closed-business-only-free)).

**Risks.** Garmin cuts the Intervals.icu feed with no date
([WS §1.6](watch-data-sources.md#16-the-undisclosed-septemberoctober-2026-change)).
Better Auth breaks APIs in minors
([SM §8](stack-migration.md#8-migration-risk-register)). Its MCP advice
(`legacy: "reject"`) is safe to ignore: the spike served both eras behind
`requireMcpAuth` on `legacy: 'stateless'` ([spike](better-auth-mcp-spike.md),
#552; the connector click is pending). Postgres's Read Committed can let two
claims pass ([SM §8](stack-migration.md#8-migration-risk-register)). trainm8
cannot control the host model's prose
([AN §5.5](agent-native.md#55-trainm8-as-an-mcp-server)), and athlete-written
text reaches the model
([MCP §6.7](mcp-server-for-trainm8.md#67-prompt-injection-whose-text-reaches-the-model)).
COROS, AI Endurance and Tredict already write plans over MCP, without a preview
or a yes; that is the gap trainm8 owns
([AI §1.3](ai-product-privacy-cost.md#13-what-the-pattern-says-inference)).

**Open questions.**

- Do Claude and ChatGPT support elicitation
  ([MCP §10.4](mcp-server-for-trainm8.md#104-claims-this-note-could-not-verify))?
- Which Anthropic retention statement governs
  ([AI §3.4](ai-product-privacy-cost.md#34-processor-terms-and-where-the-data-goes-flow-a))?
- Do Garmin's new terms hit personal Intervals.icu keys, and do blocked
  activities return as stubs
  ([WI §8](watch-data-trainm8-ingest.md#8-open-questions))?
- May Garmin-sourced data that arrives through Intervals.icu still go out over
  MCP with attribution, as it may today
  ([WS §6](watch-data-sources.md#6-ai-and-mcp-terms-per-source))?
- Does the in-app loop work on Bedrock in practice? The packages are verified on
  npm and in the docs (`@ai-sdk/amazon-bedrock/anthropic`, or
  `@anthropic-ai/bedrock-sdk`), but nobody has run them
  ([BB §9.2](agent-layer-building-blocks.md#92-the-pieces)).

## Document map

| Document                                                         | One line                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [agent-native.md](agent-native.md)                               | The framework read from source, its fit with trainm8, options A–E and the original "build our own" verdict |
| [agent-native-open-stack.md](agent-native-open-stack.md)         | With Postgres, Drizzle and Better Auth accepted: adoption, forks and transplants priced; C+ wins           |
| [agent-platforms.md](agent-platforms.md)                         | Convex, Cloudflare, Mastra, Supabase and sync engines; the own layer ranks first                           |
| [stack-migration.md](stack-migration.md)                         | Better Auth → MCP OAuth → Postgres → Drizzle: order, effort, region, risks                                 |
| [mcp-server-for-trainm8.md](mcp-server-for-trainm8.md)           | MCP 2026-07-28, OAuth, the clients, MCP Apps, the safety design and the tool surface                       |
| [agent-layer-building-blocks.md](agent-layer-building-blocks.md) | Agent libraries compared, the minimal stack and the zod plan                                               |
| [agent-layer-trainm8-surface.md](agent-layer-trainm8-surface.md) | The repo's write paths, read paths, safety rails and first-slice candidates                                |
| [watch-data-sources.md](watch-data-sources.md)                   | Garmin, Suunto, Polar, COROS, Wahoo, aggregators and phone stores: access, terms, order, outreach          |
| [watch-data-trainm8-ingest.md](watch-data-trainm8-ingest.md)     | Today's integrations, the FIT path, dedupe, leaving Intervals.icu, workout export, defects                 |
| [ai-product-privacy-cost.md](ai-product-privacy-cost.md)         | The AI-coaching landscape, GDPR and the AI Act in Norway, the launch checklist, and the cost per athlete   |
