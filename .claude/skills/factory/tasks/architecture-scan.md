# Architecture scan

Looks at how the codebase has grown since the last scan, and asks whether it
still has a good shape: deep modules, seams in the right places, the
qualities held in one place each, the code still doing what its ADRs say.
It proposes; a human chooses. The queue starts
it every `scan-every` merges.

Read-only on the repo: your writes are evidence and proposals.

0. **Earlier proposals.** List this scan's open proposals: the open issues
   whose body holds `<!-- agent:proposal-from architecture-scan -->`
   (`python3 <base>/scripts/conductor.py list 'repos/<o>/<r>/issues?state=open&labels=agent:proposal'`).
   For each, check whether it still holds at the default branch's head. One
   that merged work made true, or that no longer holds, goes in `resolved`
   with the reason, and the conductor closes it. One that still holds you
   don't propose again; name it in your comment, with how long it has waited.
   Done when every open proposal of this scan is resolved or named.
1. **Scope.** List what merged since the brief's `since`:
   `git log --since=<since> --merges --stat origin/<default>`. The files and
   areas that keep coming up are where to look first; a deep module pays off
   where the code still changes. After a move from `poc` to `build`, the
   `Debt:` lines in the PoC's run comments come first. Done when you
   have the areas to walk, most changed first.
2. **Explore.** Follow step 1 ("Explore") of
   `bredvid-engineering:improve-codebase-architecture` on that scope: read its
   `SKILL.md` (the `bredvid-engineering` plugin, or `.claude/skills/` in the
   repo), use `bredvid-engineering:codebase-design`'s vocabulary, and apply the
   deletion test. You have no Agent tool: walk the code yourself. Done when
   every area from step 1 has its candidates, or a line saying it holds.
3. **Walk the qualities across the whole.** One change at a time never sees
   a quality the whole product lacks: the hook every screen reads data
   through, the client every outbound call goes through, the place errors
   are logged. Those seams change rarely, so they fall outside step 1's
   scope: walk them whatever merged. For each quality in
   `references/qualities.md`, find the one place the product handles it
   (data loading and its cache, outbound calls and their timeouts, error
   display, authorization, logging, migrations), and ask whether it has one
   home, whether it does what the quality asks, and whether new code goes
   through it. Measure where the verify guide lets you: start your own
   instance as its isolation section says (its own port and data
   directory, never the defaults QA uses, since QA may run beside you),
   walk the main flow there and back, and count the data requests and the
   queries. Without a way to isolate the instance, read the code and skip
   the measurement. Done when every quality has its home named, or a line saying
   it has none, with the measurement where you took one.
4. **Check the ADRs.** For each ADR in the area you walked, does the code
   still do what it decided? Name each place it doesn't, with file and line,
   and each glossary term the new code uses differently.
5. **Choose.** Rank the deepening opportunities, the missing qualities and
   the drift by how much
   friction they cause the next changes, against their size, by the phase's
   bar (`questions.md`, "The bar"). Keep at most
   three, only those you would rate `Strong`. Write each as a proposal:

   ```markdown
   ## Problem
   <the friction, and where it bites, with files>

   ## Proposal
   <what would change, in plain words; no interface yet>

   ## Why now
   <what it makes easier or safer, in terms of locality and leverage, and
   what the tests gain>

   **Strength:** Strong · **Size:** S | M | L · **Door:** one-way | two-way
   ```

   A finding that contradicts an ADR says so, and why the ADR is worth
   reopening.

   Give each proposal, beside its title and body, its `door` (`one-way` or
   `two-way`), its `size` (`S`, `M` or `L`) and the `paths` it would change.
   Under `doors` or `full` autonomy, a two-way door of size S or M that
   touches no guarded path goes straight to `agent:spec` and gets built, so
   make the three honest: they decide whether a human sees it first.

   **Drift is always proposed**, outside the three: a place where the code
   no longer does what an ADR decided, a promise an ADR makes ("comes in its
   own issue") that no open issue tracks, and a glossary term the code uses
   differently. One proposal per ADR or term, size and door as the fix needs.
   Drift left only in a comment is forgotten.
6. **Report.** Optionally write the full report as HTML in the evidence
   folder, as `improve-codebase-architecture`'s step 2 describes.

## Result

- **outcome**: `done`, or `blocked`.
- **proposals**: at most three deepening opportunities or missing
  qualities, plus one per drift,
  each `{title, body, door, size, paths}`, the title the change in a few
  words.
- **resolved**: from step 0, `{number, reason}`.
- **evidence**: the evidence folder, when you wrote the report.
- **comment**: the earlier proposals still open, the scope (merges, areas),
  each quality's home with its measurement, every candidate you weighed in
  one line each with its strength, the ADR drift, and which you proposed.
