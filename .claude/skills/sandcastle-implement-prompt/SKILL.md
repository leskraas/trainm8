---
name: sandcastle-implement-prompt
description: Implements a single issue using the Sandcastle execution style with focused scope, TDD loop, validation commands, and structured completion signaling. Use when starting issue implementation from a sandcastle/issue-* branch.
---

# sandcastle implement prompt

Use this prompt style in Cursor chat to mimic `.sandcastle/implement-prompt.md`.

## Required placeholders

- `{{ISSUE_NUMBER}}`
- `{{ISSUE_TITLE}}`
- `{{BRANCH}}`

## Non-negotiables

- Only one issue per run.
- Pull issue details with comments (`gh issue view`).
- If linked PRD exists, load it too.
- Use RED -> GREEN -> REFACTOR loop.
- Run `npm run typecheck` and `npm run test` before finishing.
- If not complete, leave a status comment on the issue.
- Do not close the issue in this phase.
- End with `<promise>COMPLETE</promise>` when done.
- For UI work, use shadcn components/composition first; avoid custom inline components unless no shadcn option fits.

## Prompt template

```markdown
# TASK

Fix issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

Pull issue details and comments with `gh issue view`. If there is a parent PRD, include it for context.
Only work on this issue.
Work on branch {{BRANCH}}.

# CONTEXT

<recent-commits>
!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`
</recent-commits>

# EXECUTION

Use focused exploration. Pay attention to related tests.
Use RGR if applicable:
1. RED: write one failing test
2. GREEN: implement minimal fix
3. REPEAT until done
4. REFACTOR safely

For UI changes:
- Prefer existing shadcn components and variants
- Avoid ad-hoc inline UI components/custom wrappers unless necessary
- If custom UI is unavoidable, keep it minimal and note why

# FEEDBACK LOOPS

Run:
- `npm run typecheck`
- `npm run test`

# COMMIT

Create a concise commit message starting with `RALPH:` and include:
- task completed + PRD reference if relevant
- key decisions
- files changed
- blockers/notes for next iteration

# ISSUE UPDATE

If incomplete, leave a progress comment.
Do not close the issue.
When complete, output `<promise>COMPLETE</promise>`.
```
