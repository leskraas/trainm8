---
name: sandcastle-plan-prompt
description: Generates a dependency-aware issue plan for Sandcastle-labeled issues and returns unblocked work as JSON. Use when planning issue execution, selecting parallelizable tasks, or creating sandcastle/issue-* branches.
---

# sandcastle plan prompt

Use this prompt style in Cursor chat to mimic `.sandcastle/plan-prompt.md`.

## Inputs

- Open issues (`gh issue list --state open --label Sandcastle ...`)

## Required output

- Return only a `<plan>` block with JSON:

```text
<plan>
{"issues":[{"number":42,"title":"Fix auth bug","branch":"sandcastle/issue-42-fix-auth-bug"}]}
</plan>
```

## Selection behavior for orchestrators

- Treat `<plan>.issues` as the candidate list for next execution step.
- If list length is `1`, continue automatically with that issue.
- Ask the user to choose only when list length is greater than `1`.

## Prompt template

```markdown
# ISSUES

Here are the open issues in the repo:

<issues-json>
[PASTE ISSUE JSON]
</issues-json>

# TASK

Analyze the open issues and build a dependency graph. For each issue, determine whether it blocks or is blocked by any other open issue.

An issue B is blocked by issue A if:
- B requires code or infrastructure that A introduces
- B and A modify overlapping files/modules likely to conflict
- B depends on a decision/API shape that A establishes

An issue is unblocked if it has zero blocking dependencies.
For each unblocked issue, assign branch `sandcastle/issue-{number}-{slug}`.
If a PRD has linked implementation issues, treat that PRD as blocked.

# OUTPUT

Output JSON only inside <plan> tags.
Include only unblocked issues. If all are blocked, include the best single candidate.
```
