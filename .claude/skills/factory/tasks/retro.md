# Retro

Turns what the factory keeps getting wrong into rules that catch it next
time. A mistake a human or a reviewer had to catch twice should become a
check, a standard or a change to the factory. The queue starts it every
`scan-every` merges.

Read-only on the repo: guard files and agent rules belong to a human, so
everything you find becomes a proposal.

0. **Earlier proposals.** List this scan's open proposals: the open issues
   whose body holds `<!-- agent:proposal-from retro -->`
   (`python3 <base>/scripts/conductor.py list 'repos/<o>/<r>/issues?state=open&labels=agent:proposal'`).
   For each, check whether it still holds at the default branch's head. One
   that merged work made true, or that no longer holds, goes in `resolved`
   with the reason, and the conductor closes it. One that still holds you
   don't propose again; name it in your comment, with how long it has waited.
   Done when every open proposal of this scan is resolved or named.

1. **Gather.** For each PR labelled `agent` that merged since the brief's
   `since`, read its run comments and its issue's:
   - the review's **Rules this review wanted and could not find**;
   - the findings that sent it back to implement, and the criteria QA failed;
   - what a human asked for or changed at a wait, and every decision a human
     overrode;
   - commits a human pushed to the PR.

   Done when every merged PR since `since` has been read.
2. **Cluster.** Group what you gathered by cause, not by symptom. A cause
   seen once is noise; keep the causes seen at least twice. Done when each
   kept cause lists its occurrences.
3. **Choose the rule** for each cause, the most mechanical that would have
   caught it:
   - **A check**: a lint rule, a type, a test, a hook. Deterministic, so the
     agent can't argue past it.
   - **A standard**: a line in the project's coding standards, which the
     review applies. For a judgement call a check can't make.
   - **A factory change**: a task file, a setting, a limit, when the cause is
     the process itself.

   Keep at most three, each written as a proposal:

   ```markdown
   ## What keeps happening
   <the cause, with each occurrence linked>

   ## The rule
   <the check, standard or factory change, concretely: where it goes and what
   it says>

   ## What it would have caught
   <each occurrence, one line>
   ```

## Result

- **outcome**: `done`.
- **proposals**: at most three, `{title, body, door, size, paths}`. A rule
  for the factory itself names the task files and `conductor.py` it changes
  in `paths`, so it waits for a human like every guard file.
- **resolved**: from step 0, `{number, reason}`.
- **comment**: the PRs read, every cause with its count, and which you
  proposed.
