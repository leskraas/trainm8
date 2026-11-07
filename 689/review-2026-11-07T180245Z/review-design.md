# PR #689 — codebase-design review, head f2d1a14

- **Read seam is deep.** `getLoadRecomputeNotice` (recompute-notice.server.ts) hides the two nullable columns behind one `ctl: CtlMovement | null`; presenter, timeline and tests consume `LoadRecomputeNoticeRecord` from the pure module, and the presenter's own duplicate type is gone. Good: one place knows the storage shape.
- **The rule "a prescription kind records no pair" sits at the writer's interface** (`recordLoadRecomputeNotice<K>` with `ctl: CtlForKind<K>`), derived from the single kinds table, so a new kind cannot be added without choosing `moved` and the type follows. Leverage high, interface small.
- **Invariant in two places by necessity**: both-or-neither is in the DB CHECK (not expressible in schema.prisma) and in the type (one optional value). The schema comment and ADR 0112 name the CHECK; the constraints test is the seam that catches a later rebuild dropping it. Acceptable; no deeper option available with Prisma/SQLite.
- `movementLine` extracted in presenter.ts: small, private, removes the nested ternary. Fine.
- No findings.
