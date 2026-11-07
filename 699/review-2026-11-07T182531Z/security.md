# Security review (by hand): PR #699

Ownership of the plan
- `readEditContext` takes the season from `getActiveSeason(userId, now)`; `computeActivitiesEdit` re-reads the outline with `where: { id, athleteId: userId }`. Every id the writes use (phases.remove/resize, track ids, strength segment ids) comes from that owned read; deletes are also scoped by `outlineId`. No client-supplied ids reach the writes (form posts only sports, activities, strength, digest). No IDOR found.
- Kept-session reads are scoped by `userId`.

Stale-confirm digest
- MEDIUM (same as Spec finding): `digest` is optional at the route and in `applyActivitiesEdit`; a confirm posted without it skips the stale check and writes. Not cross-user (own plan only) but defeats the made = shown guard. Fix at the route.
- Digest coverage (activities-edit.ts previewActivitiesEdit): boundary, family, choice, phases, tracks, strength, pinned, overrides, laid week, kept ids/weekday/discipline, keptFromBoundary. Matches the Architecture rule.

Other: inputs validated with zod enums; no injection, secrets or new unauthenticated surface. Re-authentication is out of scope (#639).
