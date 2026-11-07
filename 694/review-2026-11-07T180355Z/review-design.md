# Design review (codebase-design): PR #694 at 730085b

Main thread. Vocabulary: module depth, seams, interface vs implementation.

- `handler.server.ts` is a deep module: one function (`handleAuthRequest(request)`) hides the production gate, the Origin rule and the lazy construction of Better Auth. The route file is a two-line adapter; that thin layer is the React Router convention, not a Middle Man worth removing. Good seam: the production test mocks `better-auth.server.ts` at the import boundary.
- `options.server.ts` / `better-auth.server.ts` split lets the export test and the CLI read config without constructing `auth`. Sound, and ADR'd.
- `erase.server.ts` holds all knowledge of Better Auth's verification identifier formats in one place, with flow tests pinning the formats. Good locality. Minor: it loads every `2fa-*` row of every user as candidates (erase.server.ts:39); fine at this scale (rows expire within minutes).
- `password-hash.server.ts`: one owner of cost 10 for both logins; tests/db-utils.ts reuses the constant. Good.
- `app-origin.server.ts`: one source of the app origin. Good.
- No wrong abstraction or duplicated rule found that should send the PR back.
