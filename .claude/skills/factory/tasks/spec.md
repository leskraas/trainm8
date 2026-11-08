# Spec

Turns an idea, a bug report, a proposal or an explored issue into one
**standard issue**: the problem, acceptance criteria someone else can check,
the scope, and the tasks it needs next. Under `supervised` autonomy a human
approves it before anything is built.

Read-only on the repo: everything you write goes in the result.

1. **Read where it stands.** Fetch the issue with its comments, an explore
   run's findings among them. On a resumed run, the human's answer since the
   last wait (an approval, or changes to apply) is settled: build on it.
   Done when you know what the issue asks and what has been answered.
2. **Triage.** Follow `bredvid-engineering:triage`, steps 1 and 3 ("Gather
   context", "Verify the claim"): the glossary and the ADRs, any existing
   implementation, `.out-of-scope/`, and a reproduction of a bug the explore
   run didn't reproduce. Done when you can name the user, the problem, and
   what the codebase already does about it.
3. **Settle the open questions**, where a wrong guess changes what gets
   built, in the spirit of `bredvid-engineering:grill-with-docs`: one decision
   per question, the most important first, each sharpened against the
   glossary and answered from the codebase where it can be. Done when each
   is a decision with its door and owner.
4. **Write the standard issue**, in the glossary's terms:

   ```markdown
   ## Problem

   <who has the problem and what it costs them, from the user's side>

   ## Acceptance criteria

   - [ ] <observable behaviour QA can check, one per line>

   ## Scope

   <what is in; then **Out of scope:** what is deliberately out>

   <details><summary>Original input</summary>

   <the body as it was before the first spec run>

   </details>
   ```

   Carry over `## Decisions` and every other `##` section the body already
   has. Each criterion describes the product behaviour that solves the
   problem, checkable by someone who didn't write it; the process ("merges
   cleanly", "CI is green") belongs to other tasks. **Ambition** is what the
   phase's bar asks of spec (`questions.md`, "The bar"). Done when every
   criterion passes that test.
5. **A criterion sent back.** When implement, review or architecture sent
   the issue here with a decision on a criterion (its line under
   `## Decisions` says "changes acceptance criterion <n>", and its answer is
   the proposed text), rewrite that criterion to what was decided, and keep
   the old text under «Original input». Settle it as a
   `po` decision: a change to what the user gets is the PO's call, so under
   `doors` it waits for them. When the issue has an open PR, go forward with
   `next` `qa` when the build already does what the new text asks, `review`
   when it needs another read, and `implement` when it must change. The
   conductor turns `qa` into `review` when review hasn't passed the PR's
   current head: review always runs before QA. Skip the
   steps below.
6. **Plan** the tasks before `implement`: `design` when a user sees or touches
   something new, `architecture` when it touches a seam, the schema, an ADR or
   a dependency, narrowed by the phase's bar. Review and QA always run.
7. **Size.** One issue is one PR a reviewer can read: about twelve acceptance
   criteria at most. A bigger one becomes `tickets`, following
   `bredvid-engineering:to-tickets` steps 1–3: vertical slices in the standard
   shape, each with its own criteria and, in `depends_on`, the earlier slices
   it waits for, counted from 0. Each ticket becomes its own issue and PR. The
   parent's body stays the overview, and the factory closes it when its
   last ticket merges.

## Result

- **outcome**: `forward`, or `blocked`.
- **body**: the standard issue.
- **next**: after step 5 only, `qa`, `review` or `implement`.
- **plan**: the tasks from step 6, possibly empty.
- **tickets**: from step 7, when the issue is too big for one PR.
- **decisions**: from step 3.
- **comment**: what changed in the issue, the decisions you made, and, with
  tickets, the slices in order.
