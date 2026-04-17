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
- If a phase needs placeholders, ask for missing values once, then proceed.

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
