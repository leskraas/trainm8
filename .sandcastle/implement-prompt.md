# TASK

Fix issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view`, with comments. If it has a parent PRD,
pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits, run tests, and close the issue when
done.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that
will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

## UI COMPONENT POLICY (SHADCN-FIRST)

For any UI work in this issue:

1. Prefer existing shadcn components/composition over custom inline components.
2. Before building custom UI markup, check available/installed shadcn components
   and use them if they fit.
3. Use component variants and composition patterns first; avoid creating ad-hoc
   local wrapper components unless truly necessary.
4. If no shadcn component can satisfy the requirement, document why in the
   commit notes and keep custom UI minimal.
5. Follow the `/shadcn` guidance and project shadcn conventions when composing
   forms, dialogs, tables, alerts, empty states, loading states, and actions.

# FEEDBACK LOOPS

Before committing, run `npm run typecheck` and `npm run test` to ensure the
tests pass.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the GitHub issue with what was
done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
