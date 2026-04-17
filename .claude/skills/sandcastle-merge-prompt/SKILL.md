---
name: sandcastle-merge-prompt
description: Merges completed Sandcastle issue branches with conflict resolution, validation, and issue closing instructions. Use when consolidating multiple sandcastle/issue-* branches into the active branch.
---

# sandcastle merge prompt

Use this prompt style in Cursor chat to mimic `.sandcastle/merge-prompt.md`.

## Required placeholders

- `{{BRANCHES}}` (markdown list)
- `{{ISSUES}}` (markdown list)

## Merge policy

- Merge each branch with `git merge <branch> --no-edit`.
- Resolve conflicts by reading both sides; keep correct behavior.
- After each merge/conflict resolution, run:
  - `npm run typecheck`
  - `npm run test`
- Fix failures before merging the next branch.
- After all merges, create one summary commit.
- Close merged branch issues and any parent issue now satisfied.
- End with `<promise>COMPLETE</promise>`.

## Prompt template

```markdown
# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:
1. `git merge <branch> --no-edit`
2. Resolve conflicts intelligently if present
3. Run `npm run typecheck` and `npm run test`
4. Fix failures before continuing

After all branches are merged, make a single summary commit.

# CLOSE ISSUES

For each merged branch, close its issue. If any parent issue is now complete, close it too.

All relevant issues:
{{ISSUES}}

When done, output `<promise>COMPLETE</promise>`.
```
