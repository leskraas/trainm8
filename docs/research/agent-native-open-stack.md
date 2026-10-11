# agent-native with an open stack: adopt it, fork it, or build our own?

The owner now accepts Postgres (Neon or another EU host), Drizzle and Better
Auth, so the stack conflicts that settled [`agent-native.md`](agent-native.md)
are gone. This note asks what is left once they are, and answers the owner's
direct question about going fully onto agent-native or forking it.

> **Research note · 2026-10-11.** Written from **primary sources**: the
> agent-native repository at `1284000325bfd1f9f79c75eb4ea143d36fce6017`
> (`@agent-native/core` 0.206.0), cloned read-only and never installed, built or
> run; its full commit history; the published npm tarballs of core and Toolkit
> 0.206.0; the npm registry and `api.npmjs.org` (2026-10-11); and the Better
> Auth docs. The trainm8 side was read at `33c10f5`. Every figure below was
> re-checked while promoting this note from a scratch draft; the corrections are
> listed in §10.
>
> **Sibling documents.** [`agent-native.md`](agent-native.md) is the framework
> read from source and the original verdict (cited **AN-note §n**).
> [`stack-migration.md`](stack-migration.md) sequences trainm8's move to Better
> Auth, Postgres and Drizzle and owns those effort figures.
> [`agent-platforms.md`](agent-platforms.md) compares the other foundations
> (Convex, Cloudflare, Mastra, Supabase, sync engines).
> [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) is the MCP spec,
> OAuth and the provenance gate, including Strava's API Policy should Strava
> return (cited **MCP note**).
> [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) covers AI
> SDK 7, MCP SDK v2 and the registry sketch, and
> [`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) inventories
> trainm8's write paths and safety rails.

### How claims are cited

- **`AN path:L–L`**: agent-native at the commit above. Docs pages are served at
  `https://www.agent-native.com/docs/<slug>/` from
  `AN packages/core/docs/content/<slug>.mdx` (AN-note, "How claims are cited").
- **`TM path:L–L`**: this repository at `33c10f5`.
- **npm** means `npm view` on 2026-10-11; **git** means the full-history clone;
  **tarball** means the published `.tgz`.
- **(inference)** marks my reasoning. All effort figures are inference, for one
  developer working with coding agents.
- Code excerpts are verbatim; this repo's formatter restyles them (tabs, quotes,
  semicolons) without changing what they mean.

---

## TL;DR

- **The open stack removes the blockers, not the main costs.** Postgres,
  Drizzle, Better Auth, zod 4 and React Router 8 become ordinary work. React
  Router 8 has been stable since 8.0.0 on 2026-06-17; `latest` is 8.4.0 (npm).
  Five things still decide the question:
  1. **The SSR rule is enforced in code.** agent-native deletes the `cookie` and
     `authorization` headers from every React Router request, on every HTTP
     method, before the router sees it
     (`AN packages/core/src/server/ssr-handler.ts:171–185,528–531`). None of
     trainm8's 87 loader modules or 70 action modules could read the session, so
     every per-user page moves to client-side fetching. That rewrite is the
     largest single cost.
  2. **The server runtime is a beta.** `nitro`'s npm `latest` dist-tag is
     `3.0.260903-beta`, published 2026-09-03, and core pins it exactly.
  3. **Churn lands where trainm8 would use it.** About 11 changes broke app code
     between 0.167.0 (2026-08-20) and 0.206.0 (2026-10-09), in chat, settings,
     auth and MCP config. One author made 69 % of the commits since 2026-09-11
     (git).
  4. **It is built for team tools.** Ownership is keyed on email plus org
     (`AN packages/core/src/sharing/schema.ts:3–13`), and the docs pitch it for
     "a CRM, project tracker, support inbox, or any team tool"
     (`AN multi-tenancy.mdx:24`). trainm8 has one athlete per account. Its chat
     and settings UI ship in English only: about 4,000 framework strings and no
     Norwegian locale.
  5. **The part trainm8 wants first has a cheaper source.** The MCP
     authorization server comes from Better Auth's `@better-auth/mcp` +
     `@better-auth/cimd`, which run on trainm8's current Prisma and SQLite
     ([stack-migration.md §4.3](stack-migration.md)).
- **Full adoption (A) would take about 6–10 months.** About 30–45 upstream minor
  releases would ship during it (§5).
- **A fork is worse than adoption.** Core plus Toolkit is about 887 k lines of
  non-test TypeScript, about 5× trainm8's 178 k. Transplanting modules (F3)
  works only for small leaves (§7).
- **Verdict: build our own layer on agent-native's stack minus the framework (C+
  with E).** Better Auth on today's Prisma + SQLite first, then the MCP server,
  then Postgres when a trigger fires, then Drizzle after its 1.0 GA. Revisit
  agent-native at its 1.0 (§9).

## Verdict table

| Option                                                                                   | Verdict                         | Why, in one line                                                                                                                    | Effort (inference)                                                                                                        |
| ---------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **A**: migrate trainm8 onto agent-native                                                 | **No**                          | Forced client rendering on every logged-in page, a beta server runtime, about 6–7 app-facing breaks a month, a team-tool data model | About 6–10 months (§5)                                                                                                    |
| **A′**: new trainm8 on a fresh scaffold, port the domain                                 | **No**                          | Not cheaper than A: data and auth migrations remain, and it throws away the 65 k lines of route UI that encode ADRs 0080–0091       | About as long as A, with more UX regressions                                                                              |
| **F1**: hard fork                                                                        | **No, the worst**               | You own about 887 k lines and every Better Auth, MCP SDK, Nitro and Drizzle upgrade and security fix                                | Unbounded: plausibly 20–40 % of one developer, indefinitely                                                               |
| **F2**: pin plus patches                                                                 | **No**                          | A's costs plus rebasing patches; the upgrade CLI refuses to run while patches exist                                                 | A, plus friction on every upgrade                                                                                         |
| **F3**: transplant leaf modules (MIT)                                                    | **Yes, as an ingredient of C+** | A few leaves are self-contained; each server entry point scanned reaches 1,137 files once dynamic imports count                     | Days per module                                                                                                           |
| **C**: own layer on today's stack, MCP via `node-oidc-provider`                          | **Good; the fallback**          | Lowest risk; the MCP authorization server stays L                                                                                   | MCP OAuth about 2–4 weeks (MCP note §9)                                                                                   |
| **C+ (with E)**: own layer on agent-native's stack minus the framework, MCP server first | **Best**                        | Better Auth carries the MCP authorization server; the stack converges, so adopting at 1.0 stays possible                            | Better Auth 3–5 weeks, then MCP OAuth 1–2 weeks; Postgres and Drizzle later ([stack-migration.md §7](stack-migration.md)) |

E is "trainm8 as an MCP server" (AN-note §6). F1–F3 are priced in §7.

---

## 1. The owner's question, answered head-on

> _"Is it dumb to go fully onto agent-native, or to make a fork / our own
> version of it, since it's open source and not very well known?"_

**Going fully onto agent-native: not dumb to ask, but a mistake right now.**

- It would rewrite how every logged-in page gets its data. agent-native removes
  the login cookie before a page renders, so pages arrive empty and fetch in the
  browser. trainm8 renders its pages on the server with the athlete's data
  already in them, and its forms work before JavaScript loads. On a phone PWA
  that is a step backwards, and it touches all 87 data-loading pages.
- It is not finished. The server layer under it is a beta, and the framework
  changes app-facing APIs about six or seven times a month in exactly the parts
  trainm8 would use: chat, settings, auth and MCP.
- It is shaped for teams: organisations, roles and email-keyed ownership, with
  its chat and settings in English. trainm8 is one athlete per account, in
  Norwegian.
- It would take about 6–10 months, and 30–45 framework releases would land while
  we did it.

**Making a fork: worse than adopting.** A fork means owning about 887,000 lines
of someone else's code, five times trainm8, plus every security fix in its
dependencies, while upstream lands about 58 commits a day. A pinned copy with
patches is no better: its own upgrade tool refuses to run while patches exist.

**"Our own version": yes, if it means our own small layer, not a copy of the
framework.** The recommendation is to build on the same building blocks
agent-native uses (React Router 8, Postgres, Drizzle, Better Auth, AI SDK 7, MCP
SDK v2) without the framework itself: a small registry of typed operations
(sketched in AN-note §5.4a), an MCP server, and a few small MIT files copied in
with their copyright notice. That is C+ in the table above.

**Open source helps, but less than it seems.** We can read it, learn from it and
copy parts under MIT, and Builder "cannot revoke it on code you already have"
(AN-note §4). But the licence paperwork is untidy (§7.2): the npm packages ship
without a LICENSE file, the repository root says ISC and the README says MIT.

**"Not very well known" cuts both ways.**

- _Against it:_ about 30 k weekly downloads against Drizzle's 27.8 M (§3). There
  are few answers outside the repository, and coding agents trained before a
  given week write stale imports for an API that has moved 107 module paths
  since 0.110.0.
- _For it:_ the scaffold ships version-matched docs inside `node_modules` and 24
  agent skills, which is better agent tooling than most frameworks have.
- _Neutral:_ athletes never see the framework, so obscurity buys no
  differentiation. The real risks are the churn and one author writing most of
  the code, not obscurity as such.

**When to look again:** at agent-native's 1.0 (its target is the end of 2026),
if Nitro 3 is stable by then and breaks stay under about four a month for a
quarter (§9).

---

## 2. What the open stack removes, and what it doesn't

### 2.1 Former conflicts that become ordinary work

| AN-note §5.2 conflict | With an open stack                                                                                                                                                                                   | Residual cost                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL only       | Accepted. Core depends on `postgres` and `@neondatabase/serverless` (`AN packages/core/package.json`); non-Postgres support was removed on 2026-09-04 (git `cc2a915a`)                               | SQLite → Postgres, LiteFS removed ([stack-migration.md §5](stack-migration.md))                                                                                                                                     |
| Drizzle               | Accepted. Core depends on `drizzle-orm ^0.45.2`                                                                                                                                                      | **Drizzle 1.0 is not GA.** npm `latest` is 0.45.4 (2026-10-08); the `rc` dist-tag is `1.0.0-rc.4` and the newest RC build `1.0.0-rc.5-5935859` (2026-09-09). Every adopter faces another ORM major soon (inference) |
| Better Auth           | Accepted. Core wires magic link, email and password, Google, GitHub, `twoFactor`, `bearer` and `jwt`, plus `config.plugins` (`AN packages/core/src/server/better-auth-instance.ts`)                  | **Passkeys are not in the default set** (no `passkey` in that file); add `@better-auth/passkey` 1.7.7. Core pins `better-auth` **exactly** at 1.7.6; npm `latest` is 1.7.7                                          |
| zod 3.25 vs 4         | Needed anyway: MCP SDK v2 needs zod ≥ 4.2 ([building blocks §9.3](agent-layer-building-blocks.md))                                                                                                   | —                                                                                                                                                                                                                   |
| React Router 7 vs 8   | **RR8 is stable**: 8.0.0 on 2026-06-17, 8.4.0 on 2026-09-15; 7.x is still patched (7.18.4, same day). RR8 needs Node ≥ 22.22.0 and React ≥ 19.2.7 (npm). AN pins 8.1.0 (`AN pnpm-workspace.yaml:76`) | A normal major trainm8 faces anyway. trainm8 is on `^7.13.0` (`TM package.json:109`), five minors behind 7.x                                                                                                        |
| Vite 7.3 vs 8.1, Node | Small (`AN pnpm-workspace.yaml:85`; `TM package.json:172,177`)                                                                                                                                       | —                                                                                                                                                                                                                   |

### 2.2 The SSR rule, enforced in code

The request every React Router render receives is built here
(`AN packages/core/src/server/ssr-handler.ts:171–185`):

```ts
function requestForAnonymousSsr(request: Request): Request {
	const headers = new Headers(request.headers)
	headers.delete('cookie')
	headers.delete('authorization')
	const init: RequestInit & { duplex?: 'half' } = {
		method: request.method,
		headers,
		signal: request.signal,
	}
	if (request.body && !['GET', 'HEAD'].includes(request.method.toUpperCase())) {
		init.body = request.body
		init.duplex = 'half'
	}
	return new Request(request.url, init)
}
```

- The handler calls it for every request and renders with
  `{ userEmail: undefined, orgId: undefined }` (`:528–531`). The method is
  passed through, so **POSTs reach route actions without the cookie too**.
- Every SSR HTML and `.data` response gets one public, CDN-cached policy;
  `Set-Cookie` is deleted and `Vary: Cookie` / `Vary: Authorization` are
  stripped (`:293–323`, `:350–368`). The repository rule says: "Never add
  `private`, `no-store`, `Vary: Cookie`, session/cookie reads, or auth branches
  to the SSR path", enforced by `guard:ssr-cache-shell` and
  `ssr-handler.spec.ts` (`AN AGENTS.md:328–333`).
- **For trainm8.** 133 route modules (per the `autoRoutes` ignore rules in
  `TM app/routes.ts`): 87 export a `loader`, 69 export an `action` (70 action
  modules with `admin/cache/sqlite.server.ts`), about 50 read loader data, about
  56 use `<Form>` or `useFetcher`, and 37 use Conform (`grep`). I dag's loader
  opens with `getUserId(request)` (`TM app/routes/_home/index.tsx:86–90`). The
  PWA share target is a multipart POST (`TM public/site.webmanifest:17–23`).
- **What changes.** Each page becomes a public shell, a client session check,
  then `useActionQuery` calls behind skeletons (`AN AGENTS.md:337–338`). Every
  mutation becomes an action endpoint or a Nitro server route. Conform's
  progressive enhancement goes. ADR 0029 chose hand-rolled charts because they
  paint "on the first byte" in SSR; behind a public shell they paint after a
  client fetch (inference).
- **How agent-native's own templates look.** About 376 route files across 16
  templates; none exports an `action`; about 48 export a `loader`, 21 of them
  redirects, and the rest that I opened are public share, booking or guard
  pages. 264 template files use `useActionQuery` (`grep` in `AN templates`).

### 2.3 Other structural constraints

- **Nitro 3 beta host.** "Agent-Native apps run on Nitro"
  (`AN deployment.mdx:9`); the embedded plugin is a Nitro plugin
  (`AN packages/core/src/server/embedded.ts:221`). Nitro 2 lives on as
  `nitropack` 2.13.4; `nitro` 3 has never had a non-beta `latest` (npm).
- **UI kit.** A design-system adapter "does not require Tailwind, shadcn, Radix"
  (`AN custom-design-system.mdx:21`), so app pages can stay on Base UI (ADR
  0085). But the sign-in shell sits outside it and "the main Chat canvas remains
  tokens-only because the assistant-ui renderer is a documented v1 non-goal"
  (`:191–195`). Toolkit depends on 27 `@radix-ui/*` packages, `assistant-ui` and
  tiptap, so both primitive libraries would ship.
- **Agent rules that compete.** The scaffold's `AGENTS.md` mandates its own
  `frontend-design` and `shadcn-ui` skills and a "hard default" surface density
  (`AN AGENTS.md:340–356`), next to trainm8's 36 skills and Emil Kowalski's
  craft rules (inference).
- **i18n.** Eleven built-in locales, none Norwegian
  (`AN packages/core/src/localization/shared.ts:1–13`). Custom locales work, and
  "Framework strings that are not included in `coreMessageOverrides` fall back
  to English" (`AN internationalization.mdx:95–97`). Toolkit's catalog has 2,424
  keys (`AN packages/toolkit/src/app/i18n/catalogs/en-US.ts`) and core about
  1,500 more, depending on how nested entries are counted. trainm8's planning
  surfaces speak Norwegian through `labels.ts` (ADR 0081).
- **Mobile and PWA.** No service worker or `share_target` in core or the
  templates (`grep`). trainm8 keeps its own `sw.js` (`TM app/root.tsx:241`).
- **Team-tool tenancy.** Every app has orgs, roles and org switching
  (`AN multi-tenancy.mdx:8–21`). `ownableColumns()` adds `owner_email` and
  `org_id` (`AN sharing/schema.ts:3–13`), and MCP refresh grants carry
  `ownerEmail` + `orgId` (`AN packages/core/src/mcp/oauth-route.ts:1215–1240`).
  trainm8 keys ownership by `userId`. The org chrome would be hidden or bent
  into a personal org per athlete (inference).

---

## 3. Maturity and churn

| Measure                                    | Value                                                                                                                                                              | Source                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Stable `@agent-native/core` releases       | 1,014 in total. May 237, Jun 233, Jul 255, Aug 216, **Sep 34, Oct (to 10/11) 10**                                                                                  | npm `time`                                 |
| Distinct minors per month                  | Jun 53, Jul 49, Aug 40, Sep 23, Oct 8                                                                                                                              | npm                                        |
| Commits per ISO week, W38–W41              | About 410, 462, 477, **565**: change volume rises while stable releases thin out                                                                                   | git                                        |
| Commits in the last 60 days                | 3,474 (about 58 a day), from 87 authors over the repository's life                                                                                                 | git                                        |
| Top author since 2026-09-11                | 1,375 of 1,994 commits (69 %)                                                                                                                                      | git                                        |
| Migration manifest since 0.110.0           | 107 moved module paths, 1,973 moved symbols, 65 removed symbols in 5 modules                                                                                       | `AN packages/core/migration-manifest.json` |
| Beta / 1.0                                 | Target "beta by mid-October 2026 and 1.0 by the end of 2026" (`AN versioning-and-stability.mdx:56–58`). The `beta` tag still points at `0.0.0-beta-20260821182008` | npm dist-tags                              |
| Weekly downloads, 2026-10-04 to 2026-10-10 | `@agent-native/core` 29,848; `drizzle-orm` 27.8 M; `better-auth` 11.7 M; `react-router` 57.1 M                                                                     | `api.npmjs.org`                            |

**Vendor coupling.** `builder` is the first built-in engine
(`AN packages/core/src/agent/engine/builtin.ts:70–89`), and Builder credits,
managed embeddings and "Continue with Agent-Native" sign-in recur in the
changelog (`AN packages/core/CHANGELOG.md`, 0.188–0.203). The coupling is
optional (AN-note §4), but an adopter carries and upgrades those code paths
(inference).

---

## 4. What trainm8 would get for free

| Capability                | What you get                                                                          | Code                                                                     | Still missing for trainm8                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One action per capability | `defineAction` with guards, validation, audit, `readOnly`                             | `AN packages/core/src/action.ts:610` (1,646 lines)                       | Its failure contract is "throw"; trainm8 returns `{ ok: false }` unions (AN-note §2.3)                                                                                                                                                                                                         |
| Agent loop                | Durable runs, sub-agents, retry breakers; argument-bound approvals                    | `AN agent/production-agent.ts` (13,386 lines; approvals at `:7584–7615`) | A model key. An approval is not the athlete's yes (ADR 0080)                                                                                                                                                                                                                                   |
| Chat UI                   | AgentSidebar, composer, reasoning cards                                               | `AN packages/toolkit/src/app/chat/`                                      | Norwegian; Radix and assistant-ui inside a Base UI app                                                                                                                                                                                                                                         |
| MCP server                | `/mcp` on Streamable HTTP, scopes from `readOnly`, annotations, MCP Apps              | `AN mcp/build-server.ts` (4,615 lines)                                   | Prompts; the per-origin provenance gate (ADRs 0096, 0098); trainm8's tools                                                                                                                                                                                                                     |
| MCP OAuth 2.1             | AS metadata, DCR, S256, CIMD with `none` auth, consent, revocation, connected-apps UI | `AN mcp/oauth-route.ts`, `mcp/oauth-client-metadata.ts`                  | **Refresh tokens are not rotated**: the grant returns the same `refresh_token` (`oauth-route.ts:1246`), although the MCP spec requires rotation for public clients (MCP note §3.1). DCR is rate-capped globally (`mcp/oauth-store.ts:332–339`), but I found no per-subject limit on tool calls |
| Evals                     | `defineEval`, trace → eval, scorer                                                    | `AN packages/core/src/eval/`                                             | App tests stay yours                                                                                                                                                                                                                                                                           |

**How much of MCP Phase 1 (L, about 2–4 weeks; MCP note §9) disappears?**

| Path                           | What disappears                                                                                                                                                                                                                                                                                                                                                                                            | What remains                                                                                 | Phase 1 becomes                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Under A**                    | PRM and AS metadata, CIMD and DCR, PKCE, audience-bound JWT, consent, revocation, connected apps                                                                                                                                                                                                                                                                                                           | Refresh rotation, a per-subject rate limit, prompts, the provenance gate, the tools          | About S, but only after the 6–10 month migration (inference)                                                                                             |
| **Under C+, with Better Auth** | `mcp()` **is** the OAuth provider ("Do not also register a separate `oauthProvider()` plugin") and needs `jwt()`; `cimd()` with `metadataProfile: "mcp-2026-07-28"` adds CIMD; tokens carry the `resource` as `aud`; refresh tokens rotate ([mcp](https://www.better-auth.com/docs/plugins/mcp), [cimd](https://www.better-auth.com/docs/plugins/cimd); [stack-migration.md §4.3–4.4](stack-migration.md)) | The consent page, the connected-assistants page, audit, a rate limit, testing against Claude | About 1–2 weeks **after** the 3–5 week Better Auth move. From today that is 4–7 weeks, against 2–4 for C ([stack-migration.md §1.3](stack-migration.md)) |

Better Auth costs more up front than `node-oidc-provider`, but it also retires
trainm8's bespoke auth (39 files; stack-migration.md §2), which is why the
consolidated plan takes it first.

---

## 5. What full adoption (A) would cost

The stack moves use [`stack-migration.md`](stack-migration.md)'s phase
estimates, so the two notes agree; the rest is framework-specific.

| trainm8 piece (TM `33c10f5`)  | Count                                                                                         | Maps to                                                                                                     | Effort (inference)                     |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Route modules                 | 133 modules, 87 loaders, 70 action modules, 37 on Conform; 65.3 k lines of route `.tsx`       | Client pages over about 100–150 actions (Sesong's single action has 31 intents; surface note §1f)           | **8–14 weeks**                         |
| Domain modules without Prisma | About 190 of 262 `app/utils` files                                                            | Copied as they are; zod 4                                                                                   | 1–2 weeks                              |
| Better Auth                   | About 39 auth files; passkeys, TOTP, GitHub, email codes                                      | stack-migration Phase 1. 2FA users re-enrol (stack-migration §4.5)                                          | 3–5 weeks                              |
| Postgres                      | 56 models, 58 migrations, LiteFS, SQLite-only SQL and tests                                   | stack-migration Phase 3                                                                                     | 3–5 weeks                              |
| Drizzle                       | 114 files, about 665 model calls, 59 `$transaction` sites                                     | stack-migration Phase 4. Prisma on Postgres is neither documented nor forbidden by agent-native (inference) | 6–10 weeks (about 1 if Prisma is kept) |
| Server, deploy, jobs          | Express 5, Fly, in-process job queue (ADR 0013)                                               | Nitro node preset on Fly; a "Long-running server" keeps its in-process timer (`AN recurring-jobs.mdx:163`)  | About 1 week                           |
| End-to-end tests              | 25 Playwright specs; 305 Vitest files (106 touch the database, counted in the Postgres phase) | Rewritten for client rendering and skeletons                                                                | 2–4 weeks                              |
| Design system and i18n        | 36 `components/ui` files; `labels.ts` 7,253 lines                                             | Adapter for app pages; an nb-NO catalog for about 4,000 framework strings                                   | 2–4 weeks                              |
| PWA share target              | `TM app/routes/imports.share-target.tsx`                                                      | A Nitro server route that reads the session                                                                 | Days                                   |

**Total: about 27–45 weeks, or 6–10 months.** At September–October's pace of
15–25 minors a month, 30–45 upstream minors ship meanwhile (§3).
`@agent-native/migrate` (0.0.7 in the repository, **not published on npm**) has
source adapters for Next.js and AEM only
(`AN packages/migrate/src/source-nextjs.ts`, `aem.ts`), so nothing automates an
Epic Stack migration.

**Riskiest parts:** the move to client-side data (every page, and a mobile
regression); the auth cutover (everyone signs in again); semantic drift in the
transactions behind the ownership gate and ADR 0088's undo; and upgrading while
migrating.

---

## 6. If adopted anyway: upgrades and the tax

- **Builder's own apps never pay an upgrade step.** Its templates depend on
  `"@agent-native/core": "workspace:*"` (`AN templates/forms/package.json:20`).
- **Scaffolded apps get an exact pin** to "the exact version that supplied the
  template" (`AN versioning-and-stability.mdx:49–52`).
- **`upgrade`** moves the pin and runs codemods from the manifest
  (`upgrade --codemods`, then `doctor`). "There is no fixed tombstone retention
  period" (`:43–45`). Minors "may change behavior or APIs" before 1.0
  (`:27–31`). A nightly ships every three hours on the `nightly` tag (today
  `0.207.0-nightly-20261011124220`) and never moves `latest`.
- **Practice (inference):** pin exactly; upgrade monthly on a branch; run the
  codemods and `doctor`; run CI weekly against `nightly` as a warning only.

**The upgrade tax over 50 days** (0.167.0 to 0.206.0): 126 minor-change entries,
about 11 of which change app code. Examples, all in
`AN packages/core/CHANGELOG.md`:

- 0.174.0: the `mcpConnect*` options collapse into `mcp`; `server/app-name.ts`
  is removed; observability moves into `defineAppConfig()`.
- 0.180.0: "This intentional breaking 0.x release requires removing existing
  `codexCliAuth` configuration".
- 0.192.0: the split auth marketing UI is removed.
- 0.194.0: chat surfaces move to AgentKit, removing the assistant-ui transcript.
- 0.197.0: `getAllSettings()` is removed.
- 0.198.0: React surfaces move to Toolkit "in a breaking AgentKit release"
  (0.198.0 and 0.199.0 appear in the changelog but were never published to npm).
- 0.206.0: `createProductionAgentHandler` "now requires the `assertAiSetupReady`
  callback".

That is **about 6–7 app-facing breaks a month**, in the surfaces trainm8 would
adopt the framework for. Estimate: 1–3 developer-days a month, plus about a week
for each Toolkit-scale relocation; two came in 50 days (inference).

---

## 7. Forks, priced

| Variant                      | What it is                                      | Cost and risk                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1: hard fork**            | trainm8 owns the code from a chosen commit      | **About 887 k lines** of non-test TS/TSX: core `src` 587,585 plus Toolkit `src` 299,451 (`wc`), about 5× trainm8's 178 k in about 560 files. Upstream lands about 58 commits a day, so cherry-picking security fixes becomes guesswork. Core pins `better-auth` 1.7.6, `@modelcontextprotocol/server` 2.0.0 (npm `latest` is 2.3.1) and the Nitro beta exactly, so those upgrades, Drizzle 1.0 and Nitro going stable all become yours |
| **F2: pin plus patches**     | An exact version with `patch-package` on `dist` | Every upgrade rebases the patches. `upgrade` stops: "Blocked: framework overrides/patches for @agent-native/\* are present … (or pass --force to continue unsafely)" (`AN packages/core/src/cli/upgrade.ts:1066–1070`). `eject` covers Toolkit units, but "Protected Core runtime behavior is never copied" (`AN package-lifecycle.mdx:49–52`)                                                                                         |
| **F3: selective transplant** | Copy MIT leaf modules into trainm8 and own them | Viable only for small leaves (§7.1)                                                                                                                                                                                                                                                                                                                                                                                                    |

### 7.1 F3: what each module drags in

Closures from a static scan of relative imports (`stackopen/closure.py`, re-run
while promoting): "static" skips type-only and dynamic imports.

| Module                                        | Own lines | Static closure (files / non-blank lines) | Verdict                                                              |
| --------------------------------------------- | --------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `mcp/tool-input-schema.ts`                    | 68        | 1 / 64                                   | **Copy**                                                             |
| `mcp/oauth-client-metadata.ts` (CIMD fetcher) | 442       | 2 / 866                                  | Not needed: `@better-auth/cimd` does this                            |
| `action.ts` (`defineAction`)                  | 1,646     | 9 / 2,518                                | **Read and adapt** into the registry sketched in AN-note §5.4a       |
| `mcp/approval-store.ts`                       | 90        | 45 / 6,490 (its database client)         | **Copy the logic** (about 90 lines) onto Prisma                      |
| `client/use-action.ts`                        | 1,271     | 58 / 14,838                              | Only with a client-fetching UI                                       |
| `application-state/store.ts`                  | 344       | 50 / 7,563                               | Not needed (AN-note §5.4b)                                           |
| `mcp/build-server.ts`                         | 4,615     | 220 / 59,640                             | **Entangled.** Copy the patterns (scopes, annotations), not the code |
| `agent/production-agent.ts`                   | 13,386    | not separable                            | No                                                                   |

Counting dynamic `import()` as well, `action.ts`, `approval-store.ts`,
`build-server.ts` and `application-state/store.ts` each reach the same **1,137
files and 379,441 lines**: core's server side is one hub, not a library of
parts. Only client and schema leaves stay small.

### 7.2 Licensing for a fork or a transplant

- **Package fields.** 17 packages declare `"license": "MIT"`; 16 are publishable
  and `frame` is private. The npm registry reports MIT for core and Toolkit.
- **Licence text.** The only LICENSE file outside fonts is
  `packages/vscode-extension/LICENSE.md` ("MIT License / Copyright (c)
  Builder.io"). The published core and Toolkit 0.206.0 tarballs contain no
  LICENSE text, only the font licences `LICENSE_GEIST`, `LICENSE_LIBERATION` and
  `LICENSE_NOTO_NASKH_ARABIC` (tarball listing). By contrast,
  `@better-auth/oauth-provider` 1.7.7 ships a `LICENSE.md`.
- **The root disagrees with itself.** No root LICENSE; the root `package.json`
  is private with `"license": "ISC"`; the README says "MIT"
  (`AN README.md:285–287`). Templates carry no licence field or file.
- **What a transplant should do (inference, not legal advice):** copy from
  `packages/`, not templates; keep the MIT notice with "Copyright (c)
  Builder.io" on every copied file; add a provenance line (package, version,
  commit `1284000325bf`); leave fonts behind or keep their own licences.

---

## 8. Middle paths

- **A companion app on agent-native, sharing trainm8's Postgres.** Needs
  Postgres, framework tables in their own schema ("dedicated Agent-Native
  database/schema", `AN embedding-sdk.mdx:171–183`), a shared identity (Better
  Auth in both, or a custom `getSession`), and actions that import trainm8's
  domain from a workspace package. It gives `/mcp`, chat and evals and keeps the
  churn and the Nitro beta inside the companion. But every operation is defined
  twice, which breaks proposed ADR 0092's one registry (inference). About 4–8
  weeks after C+, plus the monthly tax. Worth it only if in-app chat becomes a
  product goal (AN-note §8, question 1).
- **A Nitro sidecar (AN-note option B).** With Postgres it no longer needs a
  second database engine, but it still needs a Nitro host next to Express, so it
  collapses into the companion app.

---

## 9. Revised ranking and the consolidated plan

1. **C+ with E.** The own layer, MCP first, on the stack below.
2. **C with E.** The same layer on today's auth; MCP OAuth through
   `node-oidc-provider` (MCP note §3.3).
3. **Companion app** over a shared Postgres, only if in-app chat becomes a goal.
4. **Nitro sidecar** (collapses into 3).
5. **A′.**
6. **A.**
7. **F2.**
8. **F1.**

**The target end state is agent-native's stack minus the framework:** React
Router 8, an EU Postgres, Drizzle, Better Auth with `@better-auth/mcp` and
`@better-auth/cimd`, trainm8's own action registry, AI SDK 7, MCP SDK v2, and
the per-athlete SSE stream fed by Postgres `NOTIFY`
([agent-platforms.md §8A](agent-platforms.md)).

**The order** ([stack-migration.md §1.2, §7](stack-migration.md)):

1. Better Auth on today's Prisma + SQLite (3–5 weeks).
2. The MCP server, with OAuth through `@better-auth/mcp` + `cimd` (1–2 weeks for
   the OAuth part), on the registry of proposed ADR 0092. zod ≥ 4.2 first.
3. Postgres, still on Prisma, **when a trigger fires**: a second machine,
   point-in-time recovery, preview databases, or wanting off LiteFS.
   `NOTIFY`-backed SSE comes with it.
4. Drizzle **after its 1.0 GA**, not before: 1.0 is still an RC (§2.1).
5. React Router 8 on trainm8's own schedule.

F3 leaves are copied in where they help. agent-native is revisited at its 1.0.

**I would change this answer if:**

- agent-native ships 1.0 with a written deprecation window and stays under about
  four app-facing breaks a month for a quarter;
- Nitro 3 goes stable;
- core gains a supported per-user SSR mode, or trainm8 decides on its own to
  render client-side;
- the owner makes in-app chat a core feature (the companion app moves to 2);
- the top author's share drops below about 40 % for a quarter, or a second
  maintaining organisation appears;
- `@better-auth/mcp` fails against Claude's client (MCP note §3.2), which moves
  C ahead of C+ for the MCP step.

**The origin platforms' terms bind every option equally**: Garmin's closed
program, §5.2(o) approval and attribution, Polar's permission, Wahoo's clauses,
Apple 5.1.2(i), and GDPR Art. 9 with EU residency; Strava's only if it returns
(AN-note §7;
[`watch-data-sources.md` §6](watch-data-sources.md#6-ai-and-mcp-terms-per-source)).

---

## 10. Verification log

57 claims were checked against the clone, the tarballs, npm, git and the
vendors' docs while promoting the scratch note: 37 held and 15 were corrected.
Five could not be verified here: one is aligned with a sibling note (last row
below) and four are listed under Sources, Not verified.

| Draft said                                                     | Now says                                                                                                               | Evidence                                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Better Auth's `oauth-provider` is the MCP authorization server | `@better-auth/mcp` (which _is_ the provider and excludes a separate `oauthProvider()`) + `@better-auth/cimd` + `jwt()` | Better Auth docs; the provider tarball has the CIMD flag only in its `.d.mts` types |
| A takes 5–9 months                                             | 6–10 months, re-based on stack-migration.md's phase estimates                                                          | §5                                                                                  |
| Drizzle 1.0 is at `rc.5` (dist-tags)                           | `rc` tag is `1.0.0-rc.4`; newest RC build `1.0.0-rc.5-5935859`; `latest` 0.45.4                                        | `npm view drizzle-orm dist-tags`                                                    |
| "Move to Postgres and Drizzle only on a trigger"               | Postgres on a trigger; Drizzle after its 1.0 GA                                                                        | Consolidated plan (§9)                                                              |
| 17 public packages declare MIT                                 | 17 declare MIT; 16 publishable, `frame` private                                                                        | `packages/*/package.json`                                                           |
| Toolkit 299,171 lines                                          | 299,451 (`src`, non-test); the 887 k total stands                                                                      | `wc`                                                                                |
| 54 routes read loader data; 76 use Form/fetcher                | About 50 and about 56                                                                                                  | `grep` over the 133 route modules                                                   |
| 72 `$transaction`                                              | 59                                                                                                                     | `grep`; stack-migration.md §3.1                                                     |
| Core's only rate limiter guards the Builder waitlist           | DCR registrations are capped globally; no per-subject limit on tool calls found                                        | `AN mcp/oauth-store.ts:332–339`                                                     |
| About 3.8 k framework strings (core about 1,380)               | About 4 k: Toolkit 2,424, core about 1,500 depending on counting                                                       | catalog files                                                                       |
| `@agent-native/migrate` 0.0.7                                  | 0.0.7 in the repository, not published on npm                                                                          | `npm view` 404                                                                      |
| Templates: 385 route files, 31 loaders, 20 redirects           | About 376 route files, about 48 loaders, 21 redirects                                                                  | `grep` in `AN templates`                                                            |
| 1,137 files from "almost every core entry point"               | From every server-side entry point scanned; `client/use-action.ts` reaches 62                                          | `closure.py`, `MODE=value`                                                          |
| trainm8's registry sketch is about 100 lines (AN-note §5.4a)   | The sketch there is about 16 lines of types; no size is claimed                                                        | `agent-native.md` §5.4a                                                             |
| W38 commits 412                                                | About 410 (407 by committer date)                                                                                      | git                                                                                 |
| TOTP secrets are re-stored                                     | 2FA users re-enrol (not re-checked here)                                                                               | stack-migration.md §4.5                                                             |

---

## Open questions

1. **Does the owner want in-app chat at all?** It is the one thing that would
   move the companion app up (AN-note §8, question 1).
2. **Will `@better-auth/mcp` pass against Claude's client?** It is checked here
   by docs and published types only; MCP note §3.2 lists where Claude is
   stricter.
3. **Should trainm8 render client-side anyway?** If a later product decision
   moves trainm8 to client rendering for its own reasons, the largest cost of A
   disappears and this note should be redone.
4. **Which trigger moves the database?** A second machine, point-in-time
   recovery or preview databases (stack-migration.md §1.2). Neon and Fly MPG
   mean leaving `arn`; Supabase keeps Stockholm (agent-platforms.md §8A.1).
5. **Can agent-native's Drizzle tables coexist with Prisma on one Postgres** for
   the companion path? No docs page mentions Prisma.

## Sources

**agent-native repository** (`github.com/BuilderIO/agent-native` at
`1284000325bfd1f9f79c75eb4ea143d36fce6017`): `README.md`, `AGENTS.md`,
`package.json`, `pnpm-workspace.yaml`; `packages/*/package.json`;
`packages/core/CHANGELOG.md`, `packages/core/migration-manifest.json`;
`packages/core/src/server/ssr-handler.ts`, `server/embedded.ts`,
`server/better-auth-instance.ts`, `server/core-routes-plugin.ts`;
`packages/core/src/mcp/oauth-route.ts`, `mcp/oauth-store.ts`,
`mcp/build-server.ts`, `mcp/approval-store.ts`, `mcp/tool-input-schema.ts`,
`mcp/oauth-client-metadata.ts`; `packages/core/src/action.ts`,
`agent/production-agent.ts`, `agent/engine/builtin.ts`,
`application-state/store.ts`, `client/use-action.ts`, `sharing/schema.ts`,
`localization/shared.ts`, `localization/default-messages.ts`, `cli/upgrade.ts`,
`cli/create.ts`; `packages/toolkit/package.json`,
`packages/toolkit/src/app/i18n/catalogs/en-US.ts`; `packages/migrate/`;
`packages/vscode-extension/LICENSE.md`; `templates/*/app/routes/`,
`templates/forms/package.json`; `packages/core/src/templates/default/`.

**agent-native docs** (`packages/core/docs/content/*.mdx`): `multi-tenancy`,
`deployment`, `custom-design-system`, `internationalization`, `embedding-sdk`,
`recurring-jobs`, `versioning-and-stability`, `package-lifecycle`.

**git.** Full-history clone: `cc2a915a` "Remove non-Postgres database support"
(2026-09-04); author and weekly counts from `git log`.

**npm and tarballs** (2026-10-11): `npm view @agent-native/core` (versions,
time, dist-tags, license), `@agent-native/toolkit`, `@agent-native/migrate`
(404); `nitro`, `nitropack`, `react-router` (time, dist-tags, engines),
`drizzle-orm` (dist-tags, time), `better-auth` and `@better-auth/*`,
`@modelcontextprotocol/server`; the core, Toolkit and
`@better-auth/oauth-provider` tarballs; `api.npmjs.org/downloads/point`.

**Better Auth docs:** [mcp](https://www.better-auth.com/docs/plugins/mcp),
[cimd](https://www.better-auth.com/docs/plugins/cimd),
[oauth-provider](https://www.better-auth.com/docs/plugins/oauth-provider).

**trainm8** (`33c10f5`): `package.json`, `app/routes.ts`, `app/routes/**`,
`app/routes/_home/index.tsx`, `app/root.tsx`, `public/site.webmanifest`,
`app/utils/**`, `app/components/ui/`, `prisma/schema.prisma`, `.claude/skills/`;
`docs/adr/0013`, `0028`, `0029`, `0080`, `0081`, `0085`, `0088`;
`docs/decisions/003`, `007`, `039`; `docs/guiding-principles.md`.

### Not verified

- The effort figures and the upgrade-tax estimate (all inference).
- `@better-auth/mcp` end to end against Claude's client.
- GitHub stars and issue counts (the GitHub API was not used).
- Whether Prisma on Postgres coexists with agent-native's Drizzle tables.

## ADRs this research challenges

Each ADR and decision below was read before being cited.

| ADR / decision                                                               | What it decided                                          | What the evidence says                                                                                                                      | Verdict                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **0029** Charts are hand-rolled SVG, SSR-native                              | Charts paint "on the first byte" in server-rendered HTML | agent-native's public shell would turn every per-user chart into a client-rendered one after a fetch (§2.2). One more reason against A      | **Confirm**                                    |
| **0028** Mobile-first UI standard                                            | The phone is the primary target                          | Forced client rendering and lost progressive enhancement are a phone regression (§2.2)                                                      | **Confirm**                                    |
| **0081** The planning redesign speaks Norwegian; `labels.ts` owns every word | Norwegian athlete-facing wording through `labels.ts`     | agent-native has no Norwegian locale and about 4 k English framework strings that fall back to English (§2.3)                               | **Confirm** (against A)                        |
| **0085** shadcn `base-luma` on Base UI                                       | One primitive library                                    | App pages could keep Base UI through the adapter, but the chat canvas and sign-in shell stay Radix (§2.3)                                   | **Confirm**                                    |
| **0080** Week Replan proposes; the athlete's sessions need a yes             | Proposals; AI writes the same proposals later            | agent-native's approvals bind a tool call, not the athlete's yes (§4). The proposal path stays the landing place for agent and MCP writes   | **Confirm**                                    |
| **0088** Every write on I dag is undone                                      | Toast and landed row carry _Angre_                       | No option supplies this; it stays trainm8 code (AN-note, MCP note §6.4)                                                                     | **Confirm**                                    |
| **Decision 003** SQLite                                                      | SQLite on LiteFS, for zero latency                       | Nothing in the agent layer needs Postgres before MCP ships. Postgres arrives only on a trigger (§9), and leaving `arn` is part of that cost | **Confirm, with exit triggers**                |
| **Decisions 029, 039, 014** Own login code, passkeys, TOTP                   | Epic Stack's bespoke auth                                | Better Auth first replaces them and carries the MCP authorization server (§4; stack-migration.md §4)                                        | **Supersede when the Better Auth phase ships** |
