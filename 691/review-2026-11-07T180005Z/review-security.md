# Security review (by hand), PR #691 at 4ea4dcf

Checked: authorization/ownership, injection, secrets, unauthenticated surface, CSRF, SSRF, data exposure.
- `previewSeason` gets `athleteId` from `requireUserId` in the loader (unchanged). New read `getLedgerWeeks` filters `userId` (training.server.ts:1875). No IDOR.
- `readStockWorkouts` reads by ids from `season.sessions`, produced server-side from the athlete's corpus context; nothing from the request picks an id. Only numbers reach the client.
- No raw SQL, no new action, no write before POST; approval still regenerates server-side (ADR 0053 §8).
- No secrets, no outbound calls.

No security finding.
