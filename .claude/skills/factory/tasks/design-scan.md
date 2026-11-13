# Design scan

Looks at the product as a user meets it, across screens rather than one
change at a time: whether the main flows still read clearly, the hierarchy
and contrast hold, and the parts still look like one product. It proposes; a
human chooses. The queue starts it every `scan-every` merges.

Read-only on the repo: your writes are evidence and proposals.

0. **Earlier proposals.** List this scan's open proposals: the open issues
   whose body holds `<!-- agent:proposal-from design-scan -->`
   (`python3 <base>/scripts/conductor.py list 'repos/<o>/<r>/issues?state=open&labels=agent:proposal'`).
   For each, check whether it still holds at the default branch's head. One
   that merged work made true, or that no longer holds, goes in `resolved`
   with the reason, and the conductor closes it. One that still holds you
   don't propose again; name it in your comment, with how long it has waited.
   Done when every open proposal of this scan is resolved or named.
1. **Scope.** List what merged since the brief's `since`
   (`git log --since=<since> --merges --stat origin/<default>`), and the
   features those merges touched in `docs/agents/verify/features/`. The scan
   covers the flows they belong to, plus the product's main flow when the
   verify guide names one. Done when you have the list of flows.
2. **Audit.** Start the app as `docs/agents/verify/README.md` says, and follow
   `bredvid-design-engineering:design-audit` on those flows: its `SKILL.md`
   (the plugin, or `.claude/skills/design-audit/` in the repo). Done when its
   report and screenshots are in the evidence folder.
3. **Choose.** Keep at most three findings, the ones that cost users the most
   across the flows, by the phase's bar (`questions.md`, "The bar"), and
   only those the audit backs with a screenshot or a
   measurement. Write each as a proposal:

   ```markdown
   ## Problem
   <what a user meets, where, with the screenshot or the measurement>

   ## Proposal
   <the change, in the product's own tokens and components>

   ## Principle
   <the principle it breaks, in one line>

   **Severity:** high | medium · **Size:** S | M | L
   ```

   Give each proposal, beside its title and body, its `door` (`one-way` or
   `two-way`), its `size` (`S`, `M` or `L`) and the `paths` it would change.
   Under `doors` or `full` autonomy, a two-way door of size S or M that
   touches no guarded path goes straight to `agent:spec` and gets built, so
   make the three honest: they decide whether a human sees it first.

   **A finding that keeps coming back becomes a check.** When closed issues
   or earlier proposals fixed the same kind of finding before (a touch target
   under 44 px, contrast, a missing state), propose the fix and, beside it,
   the test that would have caught every case: the spec in the verify guide's
   e2e suite, or the lint rule, that runs in CI. A fix alone brings the
   finding back.

## Result

- **outcome**: `done`, or `blocked` when the app won't start.
- **proposals**: at most three, `{title, body, door, size, paths}`.
- **resolved**: from step 0, `{number, reason}`.
- **evidence**: the evidence folder.
- **comment**: the flows you audited, the audit's summary table, and which
  findings you proposed.
