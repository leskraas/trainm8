# Implement

Builds the issue on its branch, or does what sent its PR back. The first run
returns the branch and the PR to open; later runs add commits to the same
branch.

1. **Read why you are here.** Fetch the issue: its acceptance criteria and
   its `Design`, `Architecture` and `Decisions` sections. Then the item you
   were started on:
   - **The issue** (the first run): build the whole issue, on the branch
     `agent/<n>-...` when architecture already committed to it.
   - **The PR** (a later run): what changed since your last run, at its
     cause: the findings the latest review left (its run comment and inline
     comments), the criteria QA failed, the check that failed at merge, the
     changes a human asked for since the last wait, or what a spec, design or
     architecture run changed in the issue (build the difference). A return
     fixed at the symptom comes back. When a human's comment at the merge wait
     asks for no change, return `blocked` with the question "Merge the PR, or
     say what to change?", and build nothing.

   Done when you can list every reason you are here.
2. **Build.** Follow `bredvid-engineering:implement`, or
   `bredvid-engineering:implement-spec` when the issue has sub-issues: read
   the skill's `SKILL.md` (the `bredvid-engineering` plugin, or
   `.claude/skills/<name>/` in the repo), since both are user-invoked only.
   You have no Agent tool: where a skill starts subagents, do their work
   yourself, one after another, all of it. Build to the phase's **bar**
   (`questions.md`, "The bar"), and make the restructuring the `Architecture`
   section names. Done when every acceptance criterion, or every reason from
   step 1, has a commit and the test the bar asks for.
3. **Prove it.** Run the project's `check` (or what CI runs) with every test
   the change touches. When `deploy-check` is set and the change touches what
   it covers (migrations, the image, startup scripts), run it too. Every
   user-facing feature the PR adds or changes has its file in
   `docs/agents/verify/features/` (`factory-setup`'s `references/verify.md`).
   A change that shows in the UI gets a before and an after screenshot in the
   evidence folder. Done when every check passes and the working tree is
   clean.
4. **Describe it.** The first run writes a PR title and a body in the voice of
   `bredvid-engineering:pr`: what the issue asked for, what you built, what
   you left out on purpose, the evidence, and a **Decisions** line linking the
   issue's section. A later run describes its work in its comment.

## Result

- **outcome**: `forward` (next `review`); `back` with `next` `spec`, `design`
  or `architecture` when a human's answer overturns what that task decided,
  saying what it must redo; or `blocked`.
- **branch**, **head**: the branch and its last commit.
- **pr_title**, **pr_body**: the PR to open, on the first run. On a later
  run, **pr_body** again when what you built leaves the PR body wrong: the
  whole body, as it should read now.
- **decisions**: any you made while building; a one-way door here waits like
  any other. A decision that narrows an acceptance criterion, moves part of it
  to another issue, or accepts behaviour that contradicts it names the
  criterion's number in `criterion` and puts its proposed new text in
  `answer`: the conductor then sends the issue to spec, which rewrites the
  criterion before QA judges the old text.
- **evidence**: the evidence folder, when you put screenshots there.
- **comment**: what this run built or fixed, each reason from step 1 with the
  commit that answers it, and the checks with their results.
