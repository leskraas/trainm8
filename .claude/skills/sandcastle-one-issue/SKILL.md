---
name: sandcastle-one-issue
description: Runs the full Sandcastle prompt sequence for a single GitHub issue (plan, implement, review, merge) by chaining the four step skills. Use when the user wants one issue end-to-end, says sandcastle-one-issue, or wants plan+implement+review+merge without multi-issue orchestration.
---

# sandcastle one issue

Run **exactly one** Sandcastle issue through all four prompt skills, in order, without parallel worktrees.

## Inputs (ask once if missing)

- Issue number (required)
- Optional: issue title and branch `sandcastle/issue-{number}-{slug}` if already known
- Integration branch to merge into (default: `main`)

## Step skills (read and follow each in full)

1. `.claude/skills/sandcastle-plan-prompt/SKILL.md`
2. `.claude/skills/sandcastle-implement-prompt/SKILL.md`
3. `.claude/skills/sandcastle-review-prompt/SKILL.md`
4. `.claude/skills/sandcastle-merge-prompt/SKILL.md`

Canonical prompt text also lives under `.sandcastle/*.md` and standards in `.sandcastle/CODING_STANDARDS.md`.

## Operating rules

- **One issue only** for this run. Do not pick extra issues in plan output.
- Branch naming: `sandcastle/issue-{number}-{slug}` (slug from title).
- If planning shows the issue is **blocked** by another open issue, **stop** after plan and report the blocker; do not implement.
- After implement+review, merge happens on the **integration branch** (e.g. `main`): checkout/pull `main`, merge the issue branch, resolve conflicts, run checks, then close the issue per merge skill.

## Phase 1 — Plan (narrowed)

Follow `sandcastle-plan-prompt`, but restrict analysis to the single target issue:

- Build the issue list context (e.g. `gh issue view <n> --json ...` plus any linked PRD references the plan skill expects).
- Output `<plan>` JSON containing **only** that issue if it is unblocked; if blocked, output `<plan>{"issues":[]}</plan>` and explain why.

## Phase 2 — Implement

Follow `sandcastle-implement-prompt` with placeholders filled from the plan:

- `{{ISSUE_NUMBER}}`, `{{ISSUE_TITLE}}`, `{{BRANCH}}`
- Ensure you are on branch `{{BRANCH}}` before coding (create from integration branch if needed).
- Complete only when the implement skill’s completion rule is satisfied (including `<promise>COMPLETE</promise>` if that skill requires it).

## Phase 3 — Review

Follow `sandcastle-review-prompt` on the **same** branch `{{BRANCH}}` with the same placeholders.

## Phase 4 — Merge

Follow `sandcastle-merge-prompt` for **this one** branch:

- `{{BRANCHES}}`: markdown list with a single `- {{BRANCH}}` line
- `{{ISSUES}}`: markdown list with a single `- #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}` line
- Execute on the integration branch (checkout `main`, merge `{{BRANCH}}`, validate, close issue) per that skill.

## Handoff between phases

After each phase, emit:

```text
<handoff>
phase: plan|implement|review|merge
issue:
  number: <n>
  title: <title>
  branch: <branch>
</handoff>
```

Then immediately continue to the next phase in the same conversation unless the user stops you.
