# PR #676 review (closes #377): Standards and Spec

Diff: `git diff origin/main...origin/agent/377-derived-never-authored-adr`
Commits: 94e68a6 (docs: name "Derived, never authored" in its own ADR), 55e4a49 (assistant never supplies the act).
Files: GLOSSARY.md (+term, +invariant, Session Archetype reword), docs/adr/0040 (+1 line), new docs/adr/0112-derived-never-authored-a-value-is-computed-unless-it-was-decided-observed-or-frozen-at-an-act.md.
Line numbers below are in the branch's version of each file.

**Skills**: `bredvid-code-review` loaded (it redirects to /home/user/skills/skills/code-review/SKILL.md). That skill asks for two parallel sub-agents; no sub-agent tool was available in this run, so both axes were done in this one context, kept separate below.

## Standards

Sources checked: CLAUDE.md (guard files, no --no-verify), docs/agents/domain.md, neighbouring ADRs 0105/0110/0111 (header and section layout), GLOSSARY.md entry format, Prettier (repo config `@epic-web/config/prettier`).

- **Prettier**: all three files come out of `prettier --stdin-filepath` unchanged. Pass.
- **ADR format**: H1 title, `Status: Accepted · Resolves #377` (same form as 0111), then `## Context`, `## Decision` with `### n.` subsections, `## Considered options` (as in 0105/0110), `## Consequences`. Pass. 0112 is the next free number (0111 is the highest on main). There is no ADR index to update.
- **Glossary format**: bold term, colon, definition, `_Avoid_:` tail, placed under `## Language` › `### Planning metrics and filters` directly after **Unavailable Metric** (GLOSSARY.md:1101). It names no field or table. The invariant sits under `## Relationships`, directly before the Training Week "derived, never stored" bullet (GLOSSARY.md:3222). Pass. The `_Avoid_` list uses `;` as the separator because the first phrase contains a comma. This is acceptable.
- **Guard files**: none touched. No code, schema or dependency changes.
- **Glossary vocabulary**: every bolded term the ADR uses (Assistant, Autopilot, Week Change, Load Recompute Notice, Target Resolution, Session Status, Activity Import, authorship) exists in GLOSSARY.md. The ADR avoids "baked range". Pass.
- **Smell baseline**: nothing applies to prose. The overlap between the glossary term and the invariant is required by the spec, so it is not Duplicated Code.

No Standards findings.

## Spec

Every acceptance criterion is met. Every ADR section the ADR cites was opened and checked against what it is cited for. All citations hold except the ones listed below. Checked and correct:
- 0025 ("first evaluation **wins**", l.29)
- 0100 §1, §2, §4, §5
- 0056 §3 ("resolve-and-bake", l.162)
- 0008 (triggers l.39-42; the power-meter offer l.64-66)
- 0019 §2 (quote and triggers)
- 0024 (l.67-70, cited as the issue's Architecture item 3 corrected it)
- 0046 §2 (notice, not offer, l.348)
- 0050 §2 ("nothing re-reads history")
- 0054 §4 (re-derives server-side) and §8
- 0055 §1, §2 (l.94 quote), §3
- 0044 §4 (null means convention)
- 0048 §1 (l.64-66)
- 0057 §6 (display artefact)
- 0051 §3
- 0042 §5
- 0018, 0021, 0058, 0110 §2
- ADR 0040 §1 has 13 numbered decisions ("one decision among thirteen" is correct). The new citation line sits at the end of item 1 with the exact wording the spec gives.
- The glossary's Target Resolution entry says "freezes at completion" (l.424).

### S1. minor: "stored only when the athlete acts on it" contradicts the materialization clause as written
- 0112 l.130-131 (§6): "A derived value is stored only when the athlete acts on it". GLOSSARY.md term (l.1111-1112) says the same. Both sit right after §3, which says a derived value may be stored as a materialization with no act.
- Failing scenario: a reviewer of a later ADR that adds a materialized total (the shape of `plannedTssValue`) cites §6, or the one-paragraph glossary term, and rejects the cache because no athlete acted. Or a reader of the glossary concludes that Load Snapshot breaks the rule. The AC uses this phrase, but within its own clause; once it sits next to §3, the unqualified "stored only" reads as a universal rule.
- Fix: in both places, say "A derived value becomes a stored value of the athlete's own only when the athlete acts on it…" (or "is stored as authored state only when…"). Leave the rest of the clause as it is.

### S2. minor: ADR 0078 is cited as "declined because invalidation costs more", but it says "Deferred"
- 0112 l.118 ("ADR 0078 §5 … declined to cache") and l.235-236 ("a cache is declined because its invalidation paths cost more than the tail it closes").
- ADR 0078 §5 (l.159-168) says "identified and deliberately not done". Its Alternatives (l.181-183) say "**Deferred** — §5. A real saving with three new invalidation paths, and the tail it would close is not the tail that hurts." It does not decline the cache, and it does not say invalidation costs more than the saving.
- The §5 bullet body (l.119-122) paraphrases 0078 faithfully. Only the verb "declined" and the summary line at l.235 overstate it. The issue's Architecture item 3 suggested this framing, but its own Decisions say not to misquote an accepted record. The same thing happened with ADR 0024, and the spec corrected it there.
- Failing scenario: someone later picks up 0078's deferred `resync` cache. A reader of 0112 believes it was ruled out, or ruled out on cost, and cites 0112 to block it.
- Fix: l.118: "ADR 0078 §5 (and its "Alternatives considered") deferred caching…". l.235: "**ADR 0078 §5**: a cache is deferred: a real saving, but three new invalidation paths for a tail that is not the one that hurts (§5)."

### S3. nit: "(ADR 0093, §2)" is ambiguous
- 0112 l.133. It reads as ADR 0093 §2, which is "A proposal records its author". The rule it states, that only the athlete's yes applies an assistant's proposal, is ADR 0093 §3. The "§2" is meant to point at this ADR's own §2.
- Fix: "(ADR 0093 §3; §2 above)". Optionally make l.73 "(ADR 0093 §3)" as well.

### S4. nit: ADR 0102 §4 does not say when the capacity is written
- 0112 l.237-239: "written when the athlete picks a start option". ADR 0102 §4 (l.81) says only "The **Weekly Capacity** stored is still the plan's heaviest week". The storage at the first run's act is in ADR 0091 (l.94, "the first run stores…"). The issue's Architecture item 5 used this phrasing.
- Failing scenario: a reader opens 0102 §4 to verify "at the athlete's act" and finds no act, which weakens the "not seeding" claim the line exists to make.
- Fix: "**ADR 0102 §4** (with ADR 0091): the stored **Weekly Capacity** is the first-run plan's heaviest week, written as the first run is accepted. …"

### Scope
Nothing beyond the spec. Two changes go past the bare AC, and both are in the issue's Architecture: the Session Archetype glossary reword (item 7) and §2 "Who authors a decision" (item 2 and the Decisions). Out-of-scope items are respected: ADR 0008 is untouched, no other ADR gets a citation, and no code is changed.

## Summary
Standards: 0 findings. Spec: 4 findings (2 minor, 2 nit), no blocker and no major. Worst Spec issue: S1. The unqualified "a derived value is stored only when the athlete acts on it" (ADR l.130, glossary term) reads against the materialization clause.
