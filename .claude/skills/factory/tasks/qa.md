# QA

Checks every acceptance criterion against the running app, on a head that
contains the default branch, and publishes the evidence. The verdict covers
that head and no other: the factory merges only the commit QA verified.

Read-only on the repo: your writes are evidence.

1. **Check out the head.** Fetch the PR, make your worktree on its branch,
   and note `git rev-parse HEAD`.
2. **Number the acceptance criteria** in the issue body in order, from 1.
3. **Start the app** and drive it as `docs/agents/verify/README.md` says, with
   the feature file in `docs/agents/verify/features/` for each feature a
   criterion touches. Without a guide, use the `start` setting or the README,
   and say in your comment that the repo has none (`/factory-setup`). Done
   when the app answers.
4. **Check each criterion** the way a user would: run the repo's end-to-end
   flows that cover it, then drive the app along the real user path. Capture
   the action, the state after it, and the side effects (rows written,
   requests sent, messages delivered), not only the screen. Each criterion
   gets a screenshot in the evidence folder as `<k>-<what>.png`, or, when
   nothing on screen shows it, the command and its output. Green CI is not
   evidence: a criterion without evidence has failed. Done when every
   criterion has a verdict and its evidence.
5. **Measure the budgets** in the guide's `## Budgets`, each with its
   command, on the flows the PR touches and the main flow
   (`references/qualities.md`, "Budgets"). Measure **Quality:** criteria
   the same way: the number, not the impression. Without a `## Budgets`
   section, say so in your comment (`/factory-setup`). Done when every
   budget has its number against its limit.
6. **Check it runs as deployed.** When `deploy-check` is set and the PR
   touches what it covers, run it. A failure fails the PR, with its output as
   the evidence.
7. **Check the head again**: `gh api repos/<o>/<r>/pulls/<pr> --jq .head.sha`.
   A head that moved holds commits nobody reviewed or verified.

## Result

- **outcome**: `forward` when every criterion passes on an unmoved head;
  `back` with `next` `implement` when a criterion, a budget or the deploy
  check fails;
  `back` with `next` `review` when the head moved; `blocked` when the app
  can't run here.
- **head**: the commit you verified.
- **failed**: the numbers of the criteria that failed.
- **evidence**: the evidence folder.
- **comment**: the line "Verified at `<head>`. A push after this needs QA
  again.", then a table of the criteria (number, criterion, verdict,
  `evidence:` link), a table of the budgets (budget, limit, measured,
  verdict), and for each failure what you saw against what the criterion
  or budget asks. Name any criterion you drove without a feature file.
