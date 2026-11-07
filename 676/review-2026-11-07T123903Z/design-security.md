# PR #676 (closes #377): design and security review

Reviewed cold: the issue #377 spec (conductor fetch, `--for review`) and
`git diff origin/main...origin/agent/377-derived-never-authored-adr`
(origin/main 6ec5b58, branch 7211421). The diff touches three files: `GLOSSARY.md`,
ADR 0040 (one line), and the new
`docs/adr/0112-derived-never-authored-a-value-is-computed-unless-it-was-decided-observed-or-frozen-at-an-act.md`.
I did not read the PR body or earlier factory comments, and I did not change the clone.

**Skills**: `codebase-design` loaded. Every skill I needed loaded.

Line numbers below are in the branch's version of each file. ADR 0112 is the new
file, so its line N is diff line N+5 (the file's line 1 is the `# Derived, never
authored…` heading).

## Verdict

No blockers, and no security finding blocks the merge. The principle puts the
seam in the right place. The derivation is the deep module and the stored value
is a cache behind it, so "keeps its relation and states its triggers" is the
right interface for a materialization. There is one major finding: the absolute
"stored only when the athlete acts" sentence contradicts the ADR's own §1.1 and
§3, and the glossary copies the contradiction. There are three minor design
findings where the ADR's description of today's code is wrong or incomplete, one
minor security wording finding, and one nit.

## Design (codebase-design)

### D1. major: §6 and the glossary say a derived value is stored *only* when the athlete acts, which contradicts §1.1 and §3

- ADR 0112 line 132: "A derived value is stored only when the athlete acts on it,
  and from then on it is an authored decision".
- GLOSSARY.md, the **Derived, never authored** entry, lines 1110–1111 (diff lines
  45–46): "A derived value is stored only when the athlete acts on it, and is
  authored from then on". It comes directly after the sentence saying a derived
  value "stored for consistency or a measured cost is materialized".
- Read literally, this forbids what the same ADR allows. §3 (line 77) stores
  materialized derived values with no athlete act: Load Snapshot and
  `plannedTssValue`. §1.1/§2 (lines 37–41, 63–71) store the Week Replan, an
  app-derived adjustment written with no yes under the Autopilot.
- Failing scenario: someone writes a new data-model ADR that materializes a
  derived value, for example a per-week planned-hours cache, and cites the
  glossary invariant. A reviewer quoting "stored only when the athlete acts on
  it" rejects it, or the author concludes the cache needs an athlete
  confirmation step. The test is meant to settle these calls, and here it gives
  both answers. An AI agent reading only the glossary sees the contradiction in
  two consecutive sentences.
- Fix: limit the sentence to values the athlete owns, as §2 line 73 already does.
  For example: "A derived value the athlete owns (a Weekly Capacity, a
  threshold, an archetype) becomes a stored decision only when the athlete acts
  on it…". Use the same wording in the glossary.

### D2. minor: §3 says the materializing ADR "names every event", but its own examples leave out triggers the code runs

- ADR 0112 line 82 requires "names every event that recomputes it". Line 90
  gives `plannedTssValue` as "recomputed on a prescription edit and on a
  threshold change".
- In the code, a typed Performance Result is a third trigger.
  `app/utils/load/planned-tss.server.ts:18-21` says so ("and on a typed
  Performance Result (a `racePace` step's anchor moved)"), and
  `app/utils/performance-result-writer.server.ts:122,162` call
  `recomputeScheduledPlannedTss`. Plan writers also recompute: stamp, copy-week,
  generate, the Week Replan applier, juster and nudge.
- Load Snapshot (line 86) lists "session log, import promotion, threshold change,
  missed/skipped". `recomputeLoadFrom` also runs from provider sync and backfill
  (`app/integrations/*/sync|backfill|reconcile.server.ts`) and from
  formula-correction jobs (`app/utils/load/np-tss-backfill.server.ts`,
  `strength-tss-backfill.server.ts`, `swim-pace-backfill.server.ts`). The
  formula-correction jobs are the main case §4 exists for.
- Failing scenario: a reader checks a new materialization against §3, holds
  §3's examples up as complete trigger lists, and accepts an incomplete list.
- Fix: give the triggers as examples ("recomputed on, among others, …"), or add
  the Performance Result trigger and the formula-correction backfills, which are
  the §4 cases.

### D3. minor: `plannedTssValue` is the clean-materialization example, but the code recomputes it with two different scopes, the same derive-or-freeze question the ADR claims to settle

- On a threshold change, `recomputePlannedTssForUser`
  (`app/utils/load/planned-tss.server.ts:237-252`, called from
  `app/utils/athlete.server.ts:319`) rewrites `plannedTssValue` on **every**
  session, done ones included, using the *current* threshold.
- On a Performance Result, `recomputeScheduledPlannedTss` (lines 254–272)
  recomputes only `status: 'scheduled'`, because "a session already done or
  skipped keeps the stress it was planned with". That is a freeze at completion,
  the same rule as the glossary's frozen **Target Resolution**, which the ADR
  cites as bake case 3 (lines 50–55).
- So the ADR's cited example is materialized for scheduled sessions, but for
  done sessions it is either derived from the current threshold or frozen,
  depending on which trigger fired. The ADR presents it as clean, and line 90
  does not say which sessions a recompute touches.
- Failing scenario: an athlete reviews last week's sessions and sees an Adherence
  Band. They then raise their FTP. Every completed session's Planned TSS and
  Adherence Band change. The athlete's own input changed, so §4 owes no notice.
  But under §1.3 and the Target Resolution rule, what they were told to do should
  stay frozen. A future author who follows ADR 0112 cannot tell which half of the
  code is right.
- Fix (docs only, in scope): in §3, say that a materialization also states
  *which rows* a trigger recomputes. Note the current split for
  `plannedTssValue` as an open question for a follow-up issue, without deciding
  it. Do not present `plannedTssValue` as an uncontroversial instance.

### D4. minor: §4's "the app offers rather than switches" describes ADR 0008's plan as if it were built, and the threshold path does not offer

- ADR 0112 lines 101–103: "Where the athlete's own data did change (a new power
  meter, ADR 0008), the choice between two honest readings is theirs, and the app
  offers rather than switches."
- In the code, a threshold change recomputes all historical Load Snapshots
  immediately, with no offer (`app/utils/athlete.server.ts:291-309`,
  `void recomputeLoadFrom(userId, fromDateStr)`). I found no offer-to-recompute
  path for a newly added power meter. A grep for an offer path finds only the
  comment in `strength-tss-backfill.server.ts:23`, which quotes ADR 0008.
- Failing scenario: a later ADR cites ADR 0112 §4 for "the app offers", builds
  on an offer mechanism that does not exist, or reviews the threshold path as
  breaching the principle.
- Fix: say the threshold change is the athlete's own input and recomputes
  directly. Mark the power-meter offer as ADR 0008's stated intent, not yet
  built. Or drop the sentence: the explain-never-silent duty stands without it.

### D5. nit: ADR 0102 §4 is listed as derived-then-authored, but what the athlete acts on is an option, not the stored number

- ADR 0112 lines 233–235. In the code, the stored capacity is
  `max(answers.hours, ceil(peak))` (`app/utils/first-run/plan.server.ts:192-198`),
  written when the athlete picks a start option. The athlete typed `hours`. The
  heaviest-week figure is derived and never shown to them as the value they
  accept.
- This fits the spec's own reading, so it is not wrong. It does stretch "the
  athlete acts on it" to "the athlete acts on something that implies it". A
  stricter future ADR could misclassify it as seeding.
- Fix (optional): add "the athlete acts on the option that contains it" on that
  line.

### Seam placement, overall

Positive findings:
- Making materialization a clause instead of an exception keeps a single
  interface for every stored-derived value: relation, triggers, explanation.
  `recomputeLoadFrom` and `recomputePlannedTss*` already follow this as deep
  modules. Each is one entry point that every writer calls, which gives locality.
- Keeping cost out of the test (§5) stops slow derivations from turning into
  shallow stored copies.
- The cited quotations match their sources: ADR 0025:29–31 ("first evaluation
  wins"), ADR 0019 §2 ("wasteful and inconsistent across views"), ADR 0056:159
  ("derived-never-stored rule"), ADR 0008:64–66, and the glossary's Target
  Resolution "freezes at completion" (GLOSSARY.md:424).
- The Load Recompute Notice exists as described (`app/utils/load/recompute-notice.server.ts`).
- `effectiveKg` and `bodyweightKg` sit side by side in the schema
  (`prisma/schema.prisma:919,922`).

The glossary entry is under Planning metrics, directly after **Unavailable
Metric**, as spec point 6 asks, and names no field. The invariant comes directly
before the Training Week "derived, never stored" bullet. ADR 0040 changes by one
line only.

## Security (by hand; docs-only diff)

### S1. none found: no private material copied

I read the whole diff. It contains nothing from `leskraas/trainm8-private` and
does not mention security findings, credentials, hosts or personal data. It cites
only public ADRs and glossary terms. It has no links into private research.

### S2. minor: §2 "the app, where an ADR gives the app that decision" does not exclude an assistant, and §6's "never supplies that act" does not match ADR 0093 §1

- ADR 0112 lines 63–64 and 69–71. "Authored by the athlete, or by the app where
  an ADR gives the app that decision", and authorship is "`system` or
  `athlete`". ADR 0093 §2 makes `assistant` a separate **Proposal Author**, and
  §3 keeps the autopilot's "app" powers to `author = 'rules'`. ADR 0112 says
  nothing to stop a future ADR from counting an in-app `agent` caller as "the
  app". That would let an assistant author a §1.1 decision with no yes, and §2
  would be its citation.
- Failing scenario: a later ADR gives "the app's agent" the weekly replan
  decision, citing ADR 0112 §2. Reviewers judge it by ADR 0112 and accept it,
  which quietly reverses ADR 0093 §3's rule that only the rules author gets the
  autopilot's no-yes path.
- Separately, §6 (lines 132–135) says "an Assistant never supplies that act". ADR
  0093 §1 lets a model write the athlete's own acts (`write_session`,
  `mark_session_done`, `log_strength_session`) on the athlete's say-so, with no
  tap. Logging sets is the act that bakes `effectiveKg` (§1.3). The ADR is
  stricter here, not looser, so nothing is weakened today. But the two ADRs read
  as contradicting each other at exactly the line ADR 0093 draws.
- Fix: add one sentence to §2: "An **Assistant** is never the app for this
  purpose: it authors only proposals, applied on the athlete's tap, and the
  athlete's own acts on their say-so (ADR 0093 §1, §3)." In §6, scope "never
  supplies that act" to accepting or confirming a derived value the athlete owns
  (Weekly Capacity, Threshold Estimate, adoption).
- Today, every action open to `mcp` or `agent` callers is a read (`app/actions/*`
  `callers: ['web','mcp','agent']` are all `get-*` and `list-*`), so nothing is
  exposed now.

### S3. none found: ownership and authorization rules are unchanged

The ADR keeps "acceptance re-derives server-side rather than trusting a posted
value" (line 141, ADR 0054). It prescribes no new write path, and it states that
no code, schema or migration changes.
