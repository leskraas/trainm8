# Review

Reads the PR **cold**, fixes everything that is not a decision, and sends it
on to QA or back to implement. It is `review-pr`'s review for one PR, so a
factory PR is reviewed once, here; the routine skips PRs labelled `agent`.
`review-pr`'s `SKILL.md` (the `bredvid-engineering` plugin, or
`.claude/skills/review-pr/` in the repo) defines the cold read, the reviews
and the fix rules; this file says how the factory runs them.

## Parts

A task can't start subagents, so the orchestrator runs `review-pr`'s reviews:

1. **Reviews**: one read-only subagent per review in `review-pr`'s step 1
   ("Collect findings"), for this PR, all in one message, each given the
   issue the PR closes as the spec and writing its own report file, plus
   one **qualities** review that reads the diff against every quality in
   `references/qualities.md`, named in the issue or not. Each takes the
   model and effort in the queue entry's `parts.review-read`.
2. **Fix and route**: one subagent with every report, running steps 1–4,
   with the model and effort in `parts.review-fix`.

## Steps

1. **Merge the reports** into one list, duplicates merged, each finding
   tagged with the review that found it. Verify each at the PR's head with a
   failing test, a command and its output, or a line the diff made wrong. A
   finding you can't show becomes a follow-up in your comment. Done when
   every finding is verified or a follow-up.
2. **Fix everything a person doesn't have to decide**, on the PR's branch,
   however large: a deeper module, a missing test, a duplicated rule, a
   security hole. Where behaviour changes, write the failing test first.
   Commit each fix on its own, and run the project's `check` after the last
   one. A fix that keeps a check red is reverted and becomes a finding left.
   Done when every fixable finding has its commit and the checks pass.
3. **Leave the rest**: product behaviour the spec leaves open, or a trade-off
   between two documented rules. A finding that the build contradicts an
   acceptance criterion by a decision someone already made (in `## Decisions`,
   an ADR, a merged PR) is not left for QA to fail: settle it as a decision
   with the criterion's number in `criterion` and its proposed new text in
   `answer`, and the conductor sends the issue to spec before QA. A change that loosens a guard file the repo
   docs name (a check removed, a path exempted, a limit raised) is never
   yours to settle: revert it when the PR works without it, else return
   `blocked` naming it. A guard made stricter needs nothing. Settle each as a decision (`po` when it
   changes behaviour for users), and put each finding left in `inline`, on the
   first line of the diff it concerns.
4. **Route.** `back` to `implement` when a finding left is high or critical
   and shown at the head, or medium and costlier to fix once code builds on
   it (a wrong abstraction, a duplicated rule, a missing test for new
   behaviour). Otherwise `forward` to QA. A problem the base branch already
   has counts only when the PR copies it or newly reaches it. Under `poc` and
   `maintain`, the phase's bar changes this route (`questions.md`, "The
   bar").

## Result

- **outcome**: `forward`, `back` (next `implement`, or `spec` with a
  decision on a criterion), or `blocked`.
- **branch**, **head**: the PR's branch and its head after your fixes.
- **inline**: the findings left, on their lines.
- **decisions**: from step 3.
- **comment**: the verdict in this shape, then the findings that decided the
  route, each with the command or line that shows it:

  ```markdown
  <!-- bredvid-review head=<head> by=factory -->
  ## Standards: PASS | CHANGES REQUESTED
  One line of reasoning, then each fix: its commit, the rule it answers.

  ## Spec: PASS | CHANGES REQUESTED
  One line of reasoning, then each fix.

  ## Left for a decision
  Each finding left, its severity, and the decision it needs.

  ## Rules this review wanted and could not find
  Anything you wanted to fail the change for that no standard covers.
  The retro reads this list.

  ## Checks
  Each command and its result.
  ```
