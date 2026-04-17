---
name: sandcastle-review-prompt
description: Reviews a completed issue branch using Sandcastle standards, adds edge-case tests, applies safe refinements, and preserves behavior. Use after implementation on a sandcastle/issue-* branch.
---

# sandcastle review prompt

Use this prompt style in Cursor chat to mimic `.sandcastle/review-prompt.md`.

## Required placeholders

- `{{ISSUE_NUMBER}}`
- `{{ISSUE_TITLE}}`
- `{{BRANCH}}`

## Review priorities

1. Find behavioral risks first (fragile logic, missing guards, regressions).
2. Stress edge cases and add tests where needed.
3. Improve readability/maintainability without changing behavior.
4. Enforce shadcn-first UI composition (prefer shadcn components, minimize custom inline UI).
5. Apply coding standards from `.sandcastle/CODING_STANDARDS.md`.
6. Re-run `npm run typecheck` and `npm run test`.

## Prompt template

```markdown
# TASK

Review branch {{BRANCH}} for issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}.
Preserve exact behavior while improving reliability and clarity.

# CONTEXT

<recent-commits>
!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`
</recent-commits>

<issue>
!`gh issue view {{ISSUE_NUMBER}}`
</issue>

<diff-to-main>
!`git diff main..HEAD`
</diff-to-main>

# PROCESS

1. Run `npm run typecheck` and `npm run test` to baseline.
2. Inspect suspicious paths and try to break them with tests.
3. Add edge-case coverage for changed code paths.
4. For UI changes, replace unnecessary custom inline components with shadcn composition where feasible.
5. Apply maintainability refinements without behavior changes.
6. Run `npm run typecheck` and `npm run test` again.
7. Commit with `RALPH: Review - ...`.

If the branch is already clean and covered, do nothing.
When complete, output `<promise>COMPLETE</promise>`.
```
