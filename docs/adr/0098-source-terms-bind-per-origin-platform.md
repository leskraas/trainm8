# Source terms bind per origin platform, and `source-terms` is why a number is withheld

Status: Accepted · Ticket #545 (map #541) · Backed by
[`watch-data-sources.md` §1.3, §1.4, §2.2, §4.2, §6](../research/watch-data-sources.md#6-ai-and-mcp-terms-per-source)
and
[`mcp-server-for-trainm8.md` §6.1](../research/mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric).
Not legal advice: each rule below records a reading of the vendor's text, and
the readings marked _owner/legal_ need a person's sign-off before an athlete
other than the owner connects an assistant.

Numbering: 0092–0095 and 0097 are reserved by the agent-strategy roadmap
([`agent-strategy.md`, "The ADR roadmap"](../research/agent-strategy.md#the-adr-roadmap)).

**Defines the `source-terms` reason.**
[ADR 0092](./0092-every-athlete-operation-is-one-typed-action-and-the-routes-the-mcp-server-and-an-agent-are-its-readers.md)
(the action registry, #550) cites this ADR for the reason, makes it one value of
the one `UnavailableReason` a **Reading** carries (§6 there), and puts every
model-facing number through `sourceTerms` (§7 there). **Builds on
[ADR 0096](./0096-every-import-records-its-origin-platform-and-one-activity-is-one-row.md)**,
which records the Origin Platform this ADR keys on. **Carries the per-vendor
retention rule** [ADR 0012](./0012-disconnect-preserves-recordings.md) needs,
and **takes over**
[ADR 0026](./0026-integration-hub-and-key-based-providers.md)'s rejection of
Intervals.icu OAuth (§5).

## Context

Each vendor whose data trainm8 may hold has its own rules for where that data
may go: Garmin wants written approval before an API serves its data to a
third-party platform (§5.2(o)) and attribution on anything derived from it,
including AI output; Polar wants explicit member permission before data reaches
an external source, and credit as the source; Apple and Google want explicit
permission naming the AI; Strava forbids any AI use, consent or not. These rules
follow the **data**, not the pipe: a Garmin run that arrives through
Intervals.icu still carries Garmin's attribution duty, through Intervals.icu's
own §1.1.

trainm8's building principle already has the shape for this: a number that
cannot be shown truthfully is an **Unavailable Metric** with a reason, never a
zero. "This platform's terms do not let trainm8 send it to an assistant" is such
a reason.

## Decision

### 1. The gate keys on Origin Platform, never on the transport

Every rule below is looked up by `originPlatform` (ADR 0096). The transport
(`externalProvider`) is never the key. A value's **binding set** is every Origin
Platform behind it:

- for an import's own values: its `originPlatform` plus each alias's (ADR 0096
  §3);
- for a derived value (TSS, CTL/ATL/TSB, Weekly Plan Adherence, a detection, a
  Week Replan reason, a Coach line): the union of the binding sets of every
  import the computation read. For CTL/ATL/TSB that is every import in the load
  model's input window, not only the day shown;
- plan-side values the athlete wrote, or trainm8 placed from stock rows, and
  athlete-entered values (Session Log, RPE, Exercise Set Logs, _Gjort_ by hand)
  have an empty binding set.

A value may go to a surface only if **every** platform in its binding set allows
that surface; the attributions it must carry are the union of what each platform
requires.

### 2. Three surfaces

- **`screen`** — trainm8's own deterministic UI, shown to the athlete whose data
  it is.
- **`model`** — anything that puts the value in front of a language model: an
  MCP tool result, an in-app agent's context, a prompt trainm8 builds.
- **`export`** — the athlete's own data export (GDPR Art. 15 and 20). Always
  allowed: it is the athlete's right, and Strava's §6.6 says so of its own data.

### 3. The rule per Origin Platform

| Origin Platform                  | `screen`                                                                                                                                                                                                                                                                                   | `model`                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `garmin`                         | Allowed, with **"Garmin [device model]"** (`deviceName`; plain "Garmin" when unknown) beside the title, above the fold, never in a tooltip, footnote or collapsed section. Derived values (load, charts, Coach text) carry **"Insights derived in part from Garmin device-sourced data."** | **Allowed with attribution** for Garmin data that arrives through Intervals.icu or an uploaded file: every result carrying the value, or anything derived from it, carries the Garmin credit. The owner decided this on 2026-10-14, ahead of the vendors' answers (#542). A Garmin direct integration needs Garmin's written §5.2(o) approval naming the assistant platforms before it ships. _owner/legal_ |
| `polar`                          | Allowed, crediting **Polar** as the source on the data and on anything derived from it (§3.1.5).                                                                                                                                                                                           | Only with the athlete's **separate Polar opt-in** for sending Polar data to an assistant (§3.1.1), distinct from any general AI consent; closed without it. Carries the Polar credit.                                                                                                                                                                                                                       |
| `strava`                         | Allowed, within Strava's seven-day cache rule (#543 decides retention).                                                                                                                                                                                                                    | **Closed, always.** Strava's Policy §5.3, §5.10 and §5.16 bar AI use of Strava Data and anything derived from it, with no consent exception.                                                                                                                                                                                                                                                                |
| `apple-health`, `health-connect` | Allowed.                                                                                                                                                                                                                                                                                   | Only with explicit permission naming the AI (App Review 5.1.2(i); Google Play health data policy); MCP re-exposure stays closed until a store review has seen it. _owner/legal_                                                                                                                                                                                                                             |
| `upload`, `intervalsicu`         | Allowed.                                                                                                                                                                                                                                                                                   | Allowed. The athlete's own file is not vendor API data; Intervals.icu's terms have no AI clause.                                                                                                                                                                                                                                                                                                            |
| any other, and `unknown`         | Allowed.                                                                                                                                                                                                                                                                                   | **Closed until this ADR gains a row for it.** No rule, no model.                                                                                                                                                                                                                                                                                                                                            |

A new direct source (Polar, COROS, Suunto, Wahoo, Garmin direct) ships only with
its row here, written from that vendor's agreement and its answer to the
outreach (#542). Today COROS, Suunto, Wahoo and Zwift fall under "any other".

### 4. `source-terms`

When a value's binding set closes the surface, the value is not sent at all. In
its place goes a Reading that is `unavailable` with reason **`source-terms`**,
naming the platforms that closed it, so the athlete's assistant can say
"Strava's terms don't let trainm8 share this" instead of guessing or reading a
zero. The words come from `labels.ts`, like every other reason. `source-terms`
never stands in for "no data": a value that does not exist is unavailable for
its own reason, whatever its platform.

### 5. Transport terms and retention

The transport has terms of its own about **how we connect**, which do not change
what the data may do:

- **Intervals.icu** asks that "apps intended to be used by more than one person
  should use OAuth", pools OAuth limits rather than capping each user at 100 a
  day, and gives webhooks only to OAuth apps. ADR 0026's reasons for rejecting
  OAuth no longer hold. The personal key stays while it works; whether trainm8
  registers an Intervals.icu OAuth app is decided with workout export (ADR 0097,
  W2), which needs `CALENDAR:WRITE` anyway, and must be settled before a second
  athlete connects Intervals.icu.

Retention after disconnect is a source term too, and it varies by platform. ADR
0012 keeps an athlete's training history; that is right for Garmin (data kept
while the athlete keeps an account) and for Polar (tokens deleted when the
relationship ends; all Polar data deleted only if trainm8's agreement with Polar
ends). **Wahoo** wants a user's personal data deleted on revocation unless an
agreement with the user says otherwise, so Wahoo does not ship before its row
here settles that. **Strava**'s seven-day cache is #543's decision.

## Considered options

- **Gate on `externalProvider`.** Rejected: it gates the pipe. Garmin data
  through Intervals.icu would be ungated, and leaving the bridge would silently
  change old rows' rules.
- **Strip or round the restricted values and send the rest.** Rejected: a
  partial number presented as whole is the fabricated metric the building
  principle forbids.
- **Ask the athlete to consent and send everything.** Rejected: Strava's terms
  bar it even with consent, and Garmin's approval is Garmin's to give, not the
  athlete's.
- **Keep Garmin closed to models until the vendors answer.** This was the first
  draft of this ADR. The owner chose on 2026-10-14 to open
  Garmin-via-Intervals.icu with attribution instead, as the research reads
  Intervals.icu's terms (medium-high confidence). The risks the first draft
  weighed still stand, and a vendor answer that says otherwise closes the row
  again: Garmin's October 2026 terms are unseen, its guidelines require
  "receiving systems" to preserve attribution and trainm8 cannot bind Claude or
  ChatGPT to that, and the question is open with both vendors (#542). Closing it
  again is a one-line edit to the table and to `app/utils/source-terms.ts`.
- **Wait for ADR 0092 to define the reason.** Rejected: attribution (#546) needs
  the rules now, and the reason belongs with the rules.

## Consequences

- One module answers
  `(binding set, surface) → allowed with attributions | closed with platforms`,
  and every model-facing reader and every attribution site calls it. No reader
  decides terms on its own.
- Garmin attribution is owed on screens today (#546): on the Recording card and
  on load numbers and Coach output drawn from Garmin-origin imports.
- A derived value goes `source-terms` while any closed platform's input is in
  its window. A recompute that leaves those inputs out is possible but not
  built.
- Consent records for the Polar and phone-store opt-ins belong with the
  health-data consent work (#549); until they exist, those rows are closed on
  the model surface.
