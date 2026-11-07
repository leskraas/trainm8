# PR #689 — merged findings (review.md step 1)

1. **Flaky migration test** (medium; found running the checks, Standards axis: a test that fails at random is no pin). `app/utils/load/recompute-notice.migration.test.ts` ran the rebuild DDL statement by statement through Prisma's pooled SQLite connections; the RENAME saw a stale schema: `there is already another table or index with this name: LoadRecomputeNotice`. Shown: alone, 1 of 3 runs passed at f2d1a14. **Fixed** in 549b5b3 (statements run in one interactive transaction, one connection); 6 of 6 runs pass.

Not findings: Standards, Spec, Design and Security reports found nothing else (see review-standards-spec.md, review-design.md, review-security.md). ADR number 0112 collides with main's 0112 added after the merge base; workspace.md assigns renumbering to update-branch, which the queue runs because the PR is behind main.
