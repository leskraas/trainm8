---
name: sandcastle-cursor-flow
description: Runs a Sandcastle-style issue workflow in Cursor chat without worktree orchestration. Use when the user wants the .sandcastle process (plan, implement, review, merge), asks for "same flow in Cursor", or wants prompt-driven issue execution.
---

# sandcastle cursor flow

Use this skill to run the full `.sandcastle` workflow with Cursor prompts, not automation.

## Phases

1. Plan with `sandcastle-plan-prompt`
2. Implement each selected issue with `sandcastle-implement-prompt`
3. Review each completed issue with `sandcastle-review-prompt`
4. Merge with `sandcastle-merge-prompt`

## Operating rules

- Keep one issue per implementation/review loop.
- Reuse branch naming: `sandcastle/issue-{number}-{slug}`.
- Prefer the prompt files in `.sandcastle/` as canonical behavior.
- For UI implementation, enforce shadcn-first composition and avoid custom inline components unless no shadcn option fits.
- If a phase needs placeholders, ask for missing values once, then proceed.
- After plan, apply deterministic issue selection:
  - If there is exactly one unblocked issue, auto-select it and continue without asking.
  - If there are multiple unblocked issues, provide a recommendation first, then ask the user to confirm.
  - If there are zero unblocked issues, report blockers and stop.
- Do not ask "which issue?" when plan returns a single candidate.

## Recommendation rule (when multiple issues are unblocked)

Before asking the user to choose, recommend exactly one issue using this priority:

1. Fewest dependencies / weakest blockers
2. Lowest merge-conflict risk (least overlap with other active branches)
3. Highest impact-to-effort ratio (small, shippable vertical slice first)
4. Lowest issue number as tie-breaker

Use this response shape:

```text
Recommended next issue: #<number> - <title>
Why: <one sentence rationale based on the rules above>.
Alternatives: #<n>, #<n>, ...
Please confirm: proceed with #<number>, or pick another.
```

## Handoff format between phases

When a phase completes, output a compact handoff block:

```text
<handoff>
phase: plan|implement|review|merge
issues:
  - number: 123
    title: Example
    branch: sandcastle/issue-123-example
</handoff>
```

This keeps each next prompt deterministic without extra orchestration code.
