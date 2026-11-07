# Update branch

Brings a PR up to date with the default branch: merges it in, reconciles the
conflicts, and renumbers what parallel work numbered twice. This is
**reconciliation**: every line you write keeps what one side or both already
meant.

The queue starts it when a PR waiting for QA or merge is behind the default
branch; a human can start it with `agent:update-branch`.

1. **Merge.** Make your worktree on the PR's branch, then
   `git fetch origin <default>` and `git merge --no-edit origin/<default>`.
2. **Reconcile each conflict**, keeping what both sides meant: the default
   branch's changes and the PR's. When both can't hold (one side deleted what
   the other changed, two rules contradict), return `blocked` with what
   conflicts and your recommendation. Done when no conflict marker is left.
3. **Renumber.** A numbered file the default branch now also has (an ADR, a
   migration, a decision ID) moves to the next free number, with every
   reference to it. Then run the `regenerate` setting when it is set, so
   generated files such as migrations are rebuilt on top of the default
   branch's.
4. **Prove it.** Run the project's `check`. A failure the merge caused is
   yours to fix; one the default branch already has goes in your comment.
   Done when the checks pass and the working tree is clean.

## Result

- **outcome**: `forward`, or `blocked`.
- **next**: leave it out after a clean merge, and the run goes on to the task
  it interrupted (QA or merge). Set `review` when you reconciled code by
  judgement, so someone reads what you chose.
- **clean**: true when the merge had no conflict, or only conflicts in
  numbered files, lockfiles and import lists, and `regenerate` changed nothing
  else.
- **branch**, **head**: the PR's branch and the merge commit.
- **pr_body**: the whole PR body, when what you reconciled leaves it wrong.
- **comment**: what came in from the default branch, each conflict and how
  you reconciled it, each renumbering, and the checks.
