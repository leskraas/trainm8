# PR #689 — security review by hand, head f2d1a14

- **Authz / ownership (IDOR):** no new route, action or loader. Read (`getLoadRecomputeNotice(athleteId)`) and dismiss (`dismissLoadRecomputeNotice(athleteId, kind)`) keep their athleteId-scoped `where`; callers in `_home/home-timeline.server.ts` unchanged. No finding.
- **Injection:** production code uses Prisma's typed client only. The migration is static SQL. The new migration test uses `$executeRawUnsafe` on the repo's own migration files (test-only, no input) and the tagged `$executeRaw` for values. No finding.
- **Data exposure:** the export (`user-data-export.server.ts:213`) already includes the athlete's own notices; the change removes a fabricated figure from it (`null` instead of `0`). No new field leaves the server.
- **Migration:** table rebuild copies every column via `INSERT … SELECT`, restores the unique `(athleteId, kind)` index and `ON DELETE CASCADE` FK, adds a CHECK; the UPDATE is bounded to `kind = 'swim-rest-left-the-pace' AND ctlBefore = ctlAfter`. Pinned by the migration and constraints tests. No data loss path found.
- Secrets, CSRF, SSRF, unauthenticated surface: not touched.
- No findings.
