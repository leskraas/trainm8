# Worktree, numbered files and evidence

Several runs share one clone. These rules keep each run in its own lane.

## Your worktree

You work only in the worktree the brief names; the clone the orchestrator
runs from stays on its default branch, with the factory's own files in it.

- **A new branch** (architecture or implement on an issue with no branch
  yet): `git fetch origin <default>`, then
  `git worktree add -b agent/<n>-<slug> <worktree> origin/<default>`, with
  `<slug>` three or four words of the issue title in kebab case.
- **A branch that exists** (`agent/<n>-...` on origin, or the PR's branch):
  `git fetch origin <branch>`, then
  `git worktree add -B <branch> <worktree> origin/<branch>`.

Then install dependencies with the lockfile frozen, as the README or CI does.
Commit with `git commit`, and let every hook run: when a hook rejects a
commit, fix the work and commit again. History is append-only: new commits
and merge commits, never a rebase, amend or force. Return the branch as
`branch`; `apply` pushes it.

## Numbered files

Some files take the next free number: ADRs (`docs/adr/0012-...`), migrations,
decision IDs inside a document. Parallel runs take the same number, and that
is expected.

- Write a new ADR as a file of its own, with the next free number on your
  branch, rather than as an addendum to an existing one.
- Generate a migration with the project's own command.
- `update-branch` settles collisions when it brings a branch up to date with
  the default branch: it renumbers the newer file and runs the project's
  `regenerate` command.

## Evidence

Put screenshots, reports and transcripts in the evidence folder, named
`<what>.png` or `<criterion>-<what>.png`, and link each in your comment as
`evidence:<file name>`. `apply` commits the folder to the `agent-evidence`
branch and fills in the links, in an unattended run too. An interactive run
may also publish an artifact and link it.
