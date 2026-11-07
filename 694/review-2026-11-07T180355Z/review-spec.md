# Spec review: PR #694 against issue #680 at 730085b

Skill: bredvid-code-review (Spec axis), main thread.

## Missing or partial
- **Sign-up closed on every path (ADR 0113 §4, issue Decisions "Sign-up is closed in the configuration from the start") — HIGH.** GitHub is configured with `disableImplicitSignUp: true` only (options.server.ts:89). In better-auth 1.7.12 that flag is overridden by the client: `sign-in.mjs:196` and `callback.mjs:140` compute `disableSignUp: provider.disableImplicitSignUp && !requestSignUp || provider.options?.disableSignUp`, and `requestSignUp` is a body field of `POST /sign-in/social`. Scenario: outside production, `POST /api/auth/sign-in/social {provider:'github', requestSignUp:true}` from the app's origin, then the GitHub callback creates a new User. Fix: `disableSignUp: true` on the provider, with a test through the callback (MSW GitHub mocks).
- **Tests for the closed email-code path and for `input: false`** — medium; see Standards.

## Implemented, possibly wrong
- `role` (low): issue Architecture says new User columns get "Better Auth's defaults (emailVerified false, role 'user' per the admin plugin)"; schema has `role String?` with no default and the migration header says existing users read `role = NULL`. The issue also says ticket 3 sets `role` for existing users, and the generate-diff AC forces the CLI's output (which has no DB default). Contradiction inside the spec; needs a decision only if ticket 3 should not own it.

## Met
Pins; migration (5 tables, 9 columns, cascades); generate-diff test with the two normalisations (plus @@map on all five models, recorded as a decision); 404 in production / 200 at /ok in dev and test; 403 on foreign Origin; erasure incl. AuthVerification with a test per flow; export schema-derived test adds getAuthTables; export lists methods without secrets; bcryptjs cost 10 shared with Epic.

## Scope creep
None. GLOSSARY entries and the test-util null checks follow from the work.
