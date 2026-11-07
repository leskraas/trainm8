# Standards review: PR #694 at 730085b (git diff origin/main...HEAD)

Skill: bredvid-code-review (Standards axis), run in the main thread, not a subagent.
Sources: CLAUDE.md (rules for agents), docs/agents/*.md, GLOSSARY.md, ADR 0094, ADR 0113, docs/agents/production-seed-data.md, smell baseline.

## Hard rules
- Exact-version pins (CLAUDE.md "New dependencies get an exact version"): PASS. better-auth, @better-auth/{core,passkey,prisma-adapter} and `auth` 1.7.12, better-call 1.4.4, @better-fetch/fetch 1.3.2, @better-auth/utils 0.5.0, none with ^ or ~ (package.json:45-49, 87-88, 168).
- Guard files (.github, .claude, CLAUDE.md, fly.toml, other/): not touched. PASS.
- Production seed data: migration is schema only, no INSERTs, nothing seeded. PASS.
- Glossary: Sign-in Method / Sign-in Session added and used in comments and export notes. PASS.

## Judgement calls (smell baseline)
- Missing test for new behaviour (medium): `mustReenrolTwoFactor` `input: false` (options.server.ts:60) is a security-relevant rule with no test; a later edit dropping `input: false` passes CI. Fix: a test that update-user cannot clear it.
- Missing test for new behaviour (medium): sign-up closed is tested only for `/sign-up/email` (api.auth.$.test.ts:153). Email-code sign-in and GitHub have no test. Fix: one test per path.
- Duplicated Code (low): `sendCode` and `sendResetPassword` both wrap text as `<p>${text}</p>` (options.server.ts:37, 73). Placeholder copy until #554 ticket 2; leave.
- Comment drift (low): options.server.ts says "Importing this file constructs nothing", but it calls `getAppOrigin()` at load and throws when APP_ORIGIN is unset. Only better-auth.server.ts (after the gate) and tests import it, so no production impact; leave.

Lockfile: 55 version bumps in package-lock.json; every one is forced by a range in a newly added package (checked with semver against the new lock), e.g. set-cookie-parser 3.0.1 -> 3.2.2 by better-call ^3.1.2, @simplewebauthn/server 13.2.2 -> 13.3.3 by @better-auth/passkey ^13.3.1, jose 6.2.15 by better-auth ^6.2.3, Babel 7.29 by `auth`. The set-cookie-parser 3.2 typing (`parseString` may return undefined) is handled in tests/utils.ts, tests/playwright-utils.ts, tests/setup/custom-matchers.ts, tests/e2e/mobile-overflow.test.ts. No unforced drift.
