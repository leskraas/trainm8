# Architecture scan

Looks at how the codebase has grown since the last scan, and asks whether it
still has a good shape: deep modules, seams in the right places, the code
still doing what its ADRs say. It proposes; a human chooses. The queue starts
it every `scan-every` merges.

Read-only on the repo: your writes are evidence and proposals.

1. **Scope.** List what merged since the brief's `since`:
   `git log --since=<since> --merges --stat origin/<default>`. The files and
   areas that keep coming up are where to look first; a deep module pays off
   where the code still changes. Done when you have the areas to walk, most
   changed first.
2. **Explore.** Follow step 1 ("Explore") of
   `bredvid-engineering:improve-codebase-architecture` on that scope: read its
   `SKILL.md` (the `bredvid-engineering` plugin, or `.claude/skills/` in the
   repo), use `bredvid-engineering:codebase-design`'s vocabulary, and apply the
   deletion test. You have no Agent tool: walk the code yourself. Done when
   every area from step 1 has its candidates, or a line saying it holds.
3. **Check the ADRs.** For each ADR in the area you walked, does the code
   still do what it decided? Name each place it doesn't, with file and line,
   and each glossary term the new code uses differently.
4. **Choose.** Rank the deepening opportunities and the drift by how much
   friction they cause the next changes, against their size. Keep at most
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
5. **Report.** Optionally write the full report as HTML in the evidence
   folder, as `improve-codebase-architecture`'s step 2 describes.

## Result

- **outcome**: `done`, or `blocked`.
- **proposals**: at most three, `{title, body}`, the title the change in a
  few words.
- **evidence**: the evidence folder, when you wrote the report.
- **comment**: the scope (merges, areas), every candidate you weighed in one
  line each with its strength, the ADR drift, and which you proposed.
