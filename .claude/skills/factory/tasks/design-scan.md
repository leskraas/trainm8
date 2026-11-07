# Design scan

Looks at the product as a user meets it, across screens rather than one
change at a time: whether the main flows still read clearly, the hierarchy
and contrast hold, and the parts still look like one product. It proposes; a
human chooses. The queue starts it every `scan-every` merges.

Read-only on the repo: your writes are evidence and proposals.

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
   across the flows, and only those the audit backs with a screenshot or a
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

## Result

- **outcome**: `done`, or `blocked` when the app won't start.
- **proposals**: at most three, `{title, body}`.
- **evidence**: the evidence folder.
- **comment**: the flows you audited, the audit's summary table, and which
  findings you proposed.
