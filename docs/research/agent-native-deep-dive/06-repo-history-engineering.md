# Appendix 06 — The repository as a whole: structure, engineering practice and the last nine days

> **Appendix to [agent-native-deep-dive.md](../agent-native-deep-dive.md).**
> What is in the repository and why, the exact stack, how the authors and their
> coding agents build it, what changed between `1284000325bf` (0.206.0) and
> `a03f638` (2026-10-20, `@agent-native/core` 0.210.0), and how the website's
> claims hold up. Compiled 2026-10-20. Citations as in the main document.

**How to read the citations.** `AN path:L–L` is a file in the clone at HEAD `a03f638`. `git <sha>` is a commit. `docs <slug> L–L` is a line range in `packages/core/docs/content/<slug>.mdx`. Live pages outside `/docs` are given as full URLs. "npm" means `npm view @agent-native/core ...` run on 2026-10-20. My own reasoning is marked **(inference)**.

**Method notes.** Line and file counts come from `git ls-files` plus `wc -l` over tracked files, so they include generated files. Test-case counts use a line-start regex for `it(` and `test(`, so they are approximate. Commit classification was done by a small script over `git log` output, run outside the clone.

---

## 0. Summary: the findings that matter most

1. **The repository is mostly produced by coding agents, under rules written for agents, and the rules are measured against the user's own agent transcripts.** The lead maintainer "runs many Claude Code and Codex sessions against this one checkout on purpose, often on the same branch or file" (`AN .agents/skills/concurrent-agents/SKILL.md:15–19`). A Claude Code hook leases files between concurrent sessions (`AN scripts/hooks/file-lease.mjs`). A 4,363-line script mines `~/.claude/projects` and `~/.codex/sessions` transcripts to count how often the user had to repeat each correction (`AN scripts/agent-friction-report.mjs:4170–4175`). The repo forbids agent attribution in commits (`AN AGENTS.md:42`), so co-author trailers undercount agent work. Since 0.206.0, only 33 of the 396 non-release commits by human authors carry an AI trailer, and none of them belong to the top author.
2. **"Mechanism over guidance" is the operating principle for the engineering process.** There are 92 registered guards, 3 more than at 0.206.0 (`AN scripts/run-guards.ts:6–98`). Many are diff-scoped, so a bad habit stops spreading without forcing a backlog cleanup. Guards exit with three outcomes, so a check that inspected nothing cannot pass. Documents have word budgets (`AN scripts/guard-doc-budgets.mjs:4–15`), and a template `AGENTS.md` is capped at 6,000 characters because that is where the runtime prompt truncates it. The Design template's `AGENTS.md` sits at 5,999 characters.
3. **The nine days since 0.206.0 brought very heavy change.** (The week just before them, W41, was the busiest week by commit count, at 623.) 406 commits by 29 authors produced +921,568/−143,862 lines across 5,817 files. 47% of the added lines are tests. Core went 0.206.0 → 0.210.0 through seven stable releases. There is one explicitly breaking API change: `recordActionAudit` and `recordOrgAdminAuditEvent` now require an `attribution` (git `108b9d95e`). Several behaviour changes also force re-approval or re-verification. The new concepts include the `defineStore()` schema ledger with fresh-DB snapshot installs, execution fences for durable runs, approvals bound to an argument hash, MCP output contracts, a Fetch-native MCP adapter, BM25 tool search, and the recorder with "Report a problem". The architecture rule on A2A was **reversed**: it moved from "prefer many focused mini-apps that call each other over A2A" to "default to local actions. Use A2A only on request…" (git `7c4669b17`).
4. **The licence gap the earlier notes flagged is closed.** A root `LICENSE` (MIT, "Copyright (c) 2026 Builder.io, Inc."), per-package `LICENSE` files and a root `"license": "MIT"` landed on 2026-10-19 (git `0cfbd4dde`). The published `@agent-native/core@0.210.0` tarball now contains `LICENSE` and `third-party-licenses/TABLER-ICONS.txt`.
5. **The stability promise is partly out of date.** The docs promise "beta by mid-October 2026" (`docs versioning-and-stability 56–58`), but on 2026-10-20 the site still labels every app "alpha" and the npm `beta` tag still points at `0.0.0-beta-20260821182008`. The docs say scheduled releases run "Monday through Thursday", but the workflow has also run on Friday since 2026-09-25, and 0.209.2 shipped on a Friday. The pricing page says the Builder.io "easy button" covers databases, while the docs mark the Builder-managed database "Planned (not yet available)" (`docs server-database 119–121`).

What surprised me: the CHANGELOG is written by agents at an extreme level of detail. Entries for 0.207–0.210 total 13,122 words, and the largest single entry is 6,048 characters. The `1.0.0` section from the accidental August publish still opens the file. And the prototypes for the templates are published as Claude artifacts (`AN prototypes/README.md:3–12`).

---

## 1. Repo map

### 1.1 Top level

28,324 tracked files at HEAD (26,225 at 0.206.0). Files per top-level entry, from `git ls-files`:

| Entry                                                                             |  Files | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templates/`                                                                      | 17,521 | 17 first-party apps (16 real plus the empty `videos`). Each is a pnpm workspace member with its own `package.json`, actions, Drizzle schema, UI, `AGENTS.md` and `.agents/skills/` (470 template `SKILL.md` files in total). About 2.03 M lines of non-test TS/TSX, inflated by generated files (for example Design's `.generated/bridge/native-shader-runtime.generated.ts`, 37,963 lines, added in git `1b84641e9`).                                                                         |
| `packages/`                                                                       |  8,651 | 23 workspace packages; see §1.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `community-templates/`                                                            |  1,291 | Nine near-identical GTM apps of 143 files each (account-expert, account-tiering, churn-early-warning, win-loss-memo, …). Each is a Chat-template clone plus a small workflow layer (`get-workflow.ts`, `run.ts`, `set-workflow-selection.ts`). They deploy together as a "community app workspace" (`AN .github/workflows/deploy-community-app-workspace.yml`). The root holds `agent-native.config.ts`, `netlify.toml` and `package.json`.                                                    |
| `scripts/`                                                                        |    334 | 251 `.ts` and 60 `.js`/`.mjs` files: guards (83 non-test `guard-*` files), CI planners (`ci-change-scope.ts`, `ci-test-lanes.ts`), release helpers, QA smokes, ops (Neon budgets), the file-lease hook, the agent-friction report, `ship-push.mjs`, `community-prs.ts`, the trusted-acceptance lane and fixtures.                                                                                                                                                                              |
| `.agents/`                                                                        |    222 | Canonical agent guidance: `skills/` (97 skills; 8 are symlinks into `skills/` or `templates/content`), `commands/` (3), `plugins/` (4 app-backed plugin bundles plus `marketplace.json`).                                                                                                                                                                                                                                                                                                      |
| `e2e/`                                                                            |     87 | Two Playwright suites that run against _deployed_ sites. `beta/` is the beta-fleet browser check (`AN e2e/beta/README.md:3–4`: "would a user hitting the beta fleet right now be able to sign in, load the app, and get a working agent turn?"). `signup/` drives real magic-link sign-up through Mailosaur, plus an agent-reviewed variant (`AN e2e/signup/README.md:3–17`).                                                                                                                  |
| `.github/`                                                                        |     65 | 46 workflows, 6 composite actions, `dependabot.yml`, a Copilot hook (`hooks/impeccable.json`), QA evidence screenshots.                                                                                                                                                                                                                                                                                                                                                                        |
| `prototypes/`                                                                     |     56 | **New since 0.206.0** (git `8ff15a557`, 2026-10-12). Clickable single-page HTML prototypes of six templates. Each is "published as a Claude artifact, so a designer or PM can open the link to look, or open the folder in their own Claude to change it" (`AN prototypes/README.md:3`). Design tokens are read from the code at build time (`:44–46`). CI treats the folder as docs-only (`:16`).                                                                                             |
| `skills/`                                                                         |     30 | Public, installable skills: `an`, `assets`, `content`, `context-xray`, `design-exploration`, `turn-into-app` (11 files), `visual-edit`, `visual-plans`, `visual-recap`, `visualize-repo`. Pushes trigger a dispatch that syncs them to `BuilderIO/skills` (`AN .github/workflows/sync-public-skills.yml`).                                                                                                                                                                                     |
| `.changeset/`                                                                     |     18 | Changesets config plus 16 pending changesets for the next release (all `patch`).                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/`                                                                           |     12 | Internal engineering documents, not the website. Includes `environment-variables.md` (629 lines; `guard:env-documentation` checks it), `agent-run-stop-conditions.md` (504 lines: "map, archaeology, and cleanup plan"), `search-architecture.md`, `trusted-acceptance-lane.md`, `command-menu-architecture.md`, the ChatGPT plugin directory notes, and three `plans/`, among them `2026-09-28-store-registry-schema-ownership.md` (1,123 lines), the design document behind `defineStore()`. |
| `registry/` + `registry.json`                                                     |  2 + 1 | A **shadcn registry** (`"$schema": "https://ui.shadcn.com/schema/registry.json"`) that ships _agent guidance_ rather than components. Five items (`conventions`, `actions`, `data`, `ui`, `extensions`) bundle `registry/agent-native-app/AGENTS.md` and selected `.agents/skills/*/SKILL.md` files (`AN registry.json`). This lets a non-agent-native app pull in the conventions with the shadcn CLI **(inference about intent)**.                                                           |
| `mcp-registry/`                                                                   |      2 | README and JSON schema for generating one `server.json` per public app for the Official MCP Registry, under the `io.github.builderio/agent-native-*` namespace (`AN mcp-registry/README.md:1–21`). Publishing is a manual workflow that uses OIDC.                                                                                                                                                                                                                                             |
| `.claude/`, `.codex/`, `.gemini/`, `.claude-plugin/`, `.vscode/`, `.builderrules` |      — | Per-agent configuration; see §3.1.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Root files                                                                        |      — | `AGENTS.md` (`CLAUDE.md` is a symlink to it), `DEVELOPMENT.md`, `PRODUCT.md`, `README.md`, `SECURITY.md`, `LICENSE` (new), `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` (1.7 MB, lockfile v9, 53 importers), `agent-native.json`, `amplify.yml`, `app.json`, `eas.json`, `vitest.shared.ts`, `.nvmrc` (`v24.14.0`), `.oxlintrc.json`, `.oxfmtrc.json`, `.prettierignore`, `.gitattributes`, `.editorconfig`.                                                                        |

### 1.2 Root configuration, file by file

- **`package.json`** (`AN package.json`). Name `agentnative`, `private: true`, `"license": "MIT"` (changed from `"ISC"` in git `0cfbd4dde`). `packageManager: pnpm@10.29.1`, `engines.node >=22.22.0`. It defines **210 scripts**: 91 `guard:*`, 36 `test:*`, 14 `dev:*`, 13 `qa:*`, plus `ship:push`, `community-prs`, `feedback:inventory-check`, `ops:neon-*`, `changeset:*`, `release-dev`, `prep` and `guards`. Key ones:
  - `postinstall` runs `node scripts/prebuild-workspace-packages.ts postinstall`, so Node runs a `.ts` file directly through type stripping (`:23`).
  - `fmt` is `oxfmt --write .` (`:29`).
  - `test` first self-tests the agent-friction report's regexes, then runs every workspace's tests and two layering checks (`:32`).
  - `prep` is fmt plus parallel typecheck, `test:fast` and guards (`:208`).
  - devDependencies: `@changesets/cli 2.31.0`, `oxlint 1.71.0`, `oxlint-tsgolint 0.24.0`, `oxfmt 0.56.0`, `prettier ^3.6.2` (still listed), `wrangler ^4.80.0`, `@cloudflare/vite-plugin`, `@shadcn/lint 0.1.0`.
  - `pnpm.overrides` (`:262–285`) pins React and TanStack Query, and sets security floors (`rollup >=4.59.0`, `multer >=2.1.1`, `minimatch >=9.0.7`, `lodash >=4.18.0`, `node-forge >=1.4.0`, `path-to-regexp >=8.4.0`, `picomatch >=4.0.4`, `glob >=10.5.0`, `hono >=4.12.4`, `shell-quote 1.9.0`, …) plus `@anthropic-ai/sdk >=0.90.0` and `@electric-sql/pglite 0.5.9`.
- **`pnpm-workspace.yaml`**. Workspaces are `packages/*`, `templates/*`, `templates/*/desktop`, `templates/*/chrome-extension`, `community-templates` and `community-templates/*` (`:1–7`).
  - **`minimumReleaseAge: 1440`** (`:9`): pnpm refuses npm versions younger than 24 hours. That is a supply-chain quarantine. It exempts the project's own `@agent-native/*`, the MCP SDK v2 packages, `typescript`/`@typescript/*`, `dom-to-pptx`, `fast-xml-parser` and `@bacons/apple-targets` (`:10–21`).
  - A `catalog:` of shared versions (`:23–89`).
  - `onlyBuiltDependencies`/`allowBuilds` limit install scripts to 15 named native packages (`:91–127`).
  - One `packageExtensions` entry, which adds `node-gyp` to `node-pty`.
- **`agent-native.json`**. Declares that the Content template runs in **local-files mode** over `packages/core/docs/content`, with profile `docs/no-bookkeeping` and `packages/docs/app/components` as the MDX component source (`AN agent-native.json:1–19`). The framework's own docs are therefore edited through the framework's own Content app, which is "Local File Mode" dogfooding **(inference)**.
- **`amplify.yml`**. One application, `templates/calendar`, built with `NITRO_PRESET=aws_amplify` on Node 24 (`AN amplify.yml:1–20`). It is the only checked-in Amplify target.
- **`app.json`** (`{"expo": {}}`) and **`eas.json`** (development, preview and production profiles; `appVersionSource: remote`). These are EAS build scaffolding for `packages/mobile-app`.
- **`vitest.shared.ts`**. One line re-exporting `packages/core/src/vitest-config`, so `packages/*` can share the base config without depending on core (`AN DEVELOPMENT.md:133–143`).
- **`.builderrules`**: "Always verify if a changeset is required". This is the rules file for Builder.io's own coding agent **(inference from the filename)**.
- **`.prettierignore`** lists `**/AGENTS.md` and `**/SKILL.md`. Prettier pads markdown tables, and the padding counts against the 6,000-character prompt cap (`AN .agents/skills/writing-agent-instructions/SKILL.md:40–62`).
- **`.oxlintrc.json`**: react, react-hooks and typescript plugins, with `correctness: warn` and 12 rule overrides. **`.oxfmtrc.json`**: print width 80, trailing commas, `sortImports: true`.

### 1.3 Packages (`packages/*`), one paragraph each

Sizes are tracked files, non-test JS/TS lines ("src LOC") and test files with their lines. Versions come from each `package.json`. "Published" means on the npm allow-list `AN scripts/public-package-names.ts:1–13` (11 packages).

**`@agent-native/core`** 0.210.0, MIT, published. 5,323 files; 628 k src LOC (626 k in `src/` alone, 1,854 files); 1,320 test files / 683 k test LOC, so there are more lines of tests than of code. This is the framework: actions, the DB layer and stores, auth, the agent loop and engines, the MCP/A2A servers and clients, client hooks, the CLI (`bin/agent-native.js`), scaffolding templates (`src/templates/{default,headless,chat,builder-code-starter,workspace-core,workspace-root,factory}`) and the docs content (216 English `.mdx` pages plus 10 locales). Its `package.json` has 50 runtime dependencies (44 at 0.206.0), 43 peers (42 optional) and **520 subpath exports** (510 at 0.206.0). The runtime-dependency budget is 65 (`AN scripts/guard-core-package-reachability.ts:10`). Notable dependencies: `nitro 3.0.260903-beta`, `h3 ^2.0.1`, `better-auth 1.7.6`, `drizzle-orm ^0.45.2`, `postgres ^3.4.9`, `@neondatabase/serverless ^1.1.0`, `@anthropic-ai/sdk ^0.90.0`, MCP SDK v2 (`@modelcontextprotocol/server 2.0.0`, `client 2.0.0`, `core ^2.2.0`, `ext-apps 2.0.3`), `@mcp-b/webmcp-polyfill ^5.1.0`, `yjs`, `zod` (catalog), `ink`, `@clack/prompts`, `esbuild`, `jiti`, `jose`, `i18next` (`AN packages/core/package.json:675–726`). Peers include the Vercel AI SDK (`ai >=6`, `@ai-sdk/* >=3`), PGlite, Sentry, LaunchDarkly, OpenTelemetry, `react >=19.2.7`, `react-router >=8`, `vite >=7`, `node-pty` and `sharp`. Its only workspace dependencies are `agentkit` and `recap-cli`. **Every template and most packages depend on it.** The exceptions are agentkit, recap-cli, core-corpus, shared-app-config, migrate, browser-control-extension-core, agent-chrome-extension and the VS Code extension. The npm tarball for 0.210.0 unpacks to 35.0 MB in 4,582 files (0.206.0: 32.6 MB, 4,354 files).

**`@agent-native/toolkit`** 0.210.0, MIT, published. 1,117 files, 305 k src LOC, 352 test files. Holds the reusable UI and product kits: chat sidebar and composer stack, editors (tiptap 3.31.4), settings, sharing, history, Radix/shadcn primitives, assistant-ui, CodeMirror, recharts, Excalidraw/mermaid/xterm as optional peers. It depends on `agentkit`. `core` is only an optional peer, and `guard:toolkit-must-not-import-core` forbids any static or dynamic import of `@agent-native/core*` from Toolkit source (`AN scripts/guard-toolkit-must-not-import-core.test.ts`). In the code, Toolkit is a sibling of core, not a layer on top of it. Every template and most UI packages depend on it. npm unpacked size is 34.5 MB.

**`@agent-native/agentkit`** 0.210.0, MIT, published. 33 files, 16.8 k src LOC, 17.5 k test LOC. "Provider-neutral AgentKit protocol, headless client, and transports." It depends only on `@ag-ui/core 0.0.59` (the AG-UI protocol types) and `@noble/hashes` (`AN packages/agentkit/package.json:61–62`). Core, toolkit, code-agents-ui, mobile-app and the chat template depend on it. npm unpacked size is 1.08 MB. It is the smallest and most self-contained published package.

**`@agent-native/core-corpus`** 0.210.0, MIT, published. Five tracked files and no source. Its `build` runs `../core/scripts/materialize-source-corpus.mjs --output corpus` at `prepack`. It is the "Optional, version-matched source corpus for `@agent-native/core` source-search" (`AN packages/core-corpus/README.md:1–12`), the data behind the in-app agent's `source-search` tool. It is an optional peer of core and unpacks to **74.6 MB** on npm.

**`@agent-native/dispatch`** 0.40.26, MIT, published. 421 files, 57 k src LOC. "Workspace control plane … Vault, integrations, destinations, scheduled jobs, and cross-app delegation, shipped as a single drop-in package." It depends on toolkit plus a full shadcn/Radix set, with core and react-router as peers. Used by `templates/dispatch` and `templates/factory`.

**`@agent-native/scheduling`** 0.2.31, MIT, published. 167 files, 10 k src LOC. Event types, availability, bookings, team scheduling, workflows and routing forms (`date-fns`, `rrule`). Depends on toolkit, with core and drizzle as peers. Used by `templates/calendar`. It ships an `agent-native.package.json` manifest for `agent-native package add/eject` (`docs package-lifecycle 121–127`).

**`@agent-native/creative-context`** 0.8.44, MIT, published. 218 files, 37 k src LOC. "Creative context ingestion, versioning, search, brand DNA, and context-pack primitives." Depends only on zod, with core and drizzle as peers and toolkit optional. Used by analytics, assets, content, design and slides. It also ships a package manifest for whole-package ejection.

**`@agent-native/pinpoint`** 0.1.87, MIT, published. 81 files, 7 k src LOC. A visual feedback and annotation overlay with a `pinpoint` CLI binary. It is built with **Solid** (`solid-js`), `bippy` (React fiber inspection) and `element-source`. No workspace package depends on it; it is consumed by apps from npm.

**`@agent-native/otel`** 0.1.11, MIT, published. Eight files and 175 src LOC: OpenTelemetry SDK wiring that exports core's metrics and traces over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Every first-party template depends on it.

**`@agent-native/recap-cli`** 0.5.75, MIT, published. 21 files, 6 k src LOC. A "Dependency-light PR visual recap CLI" (binary `agent-native-recap`), with optional peer `playwright`. Core depends on it, and it powers the `pr-visual-recap*.yml` workflows.

**`@agent-native/skills`** 0.3.37, MIT, published. 22 files, 4 k src LOC. "Install BuilderIO skills for coding agents" (binary `skills`). Depends on core and `@clack/prompts`. Core's own CLI also has `agent-native skills add` (`AN packages/core/src/cli/skills.ts`, more than 4,000 lines).

**`@agent-native/code-agents-ui`** 0.1.75, MIT, **not published** (workspace-only; changesets-ignored, npm 404). 25 files, 8.5 k src LOC. React UI for "Agent-Native Code" surfaces. Its peers are core, toolkit, agentkit and shared-app-config, and `desktop-app` uses it.

**`@agent-native/shared-app-config`** 0.1.2, MIT, **not published**. Six files, 507 src LOC. `templates.ts` is the app catalogue (`TemplateMeta`: name, label, hint, icon, colour, `devPort`, `prodUrl`, `hidden`, `defaultAgent`, `core`) and the public template allow-list (`AN AGENTS.md:363–366`). Used by code-agents-ui, desktop-app, frame and mobile-app, and mirrored into the CLI and docs. It feeds `guard:template-list` and the MCP-registry generator.

**`@agent-native/embedding`** 0.2.0, MIT, **not published**. 14 files, 50 src LOC. "Embed Agent-Native apps, pickers, and agents inside other apps." Core is a peer and React optional. It is a thin facade **(inference from size)**.

**`@agent-native/migrate`** 0.0.7, MIT, **not published**. 35 files, 3 k src LOC. "Migration Workbench engine for moving existing apps to agent-native with verifiable, resumable migration runs" (`ts-morph`, `fast-glob`, `nanoid`). Fixtures include a Next.js pages app. No dependents.

**`@agent-native/frame`** 0.1.154, private (MIT field). 13 files, 1.4 k src LOC. The "Local dev frame — agent chat + CLI sidebar with app iframe" (h3, listhen). Peers are core and shared-app-config.

**`@agent-native/desktop-app`** 0.1.150, private. 258 files, 63 k src LOC, 93 test files. An **Electron 43** "chat-first workbench" in which each app runs as its own server inside a `<webview>` (`AN packages/desktop-app/README.md:1–20`). It is built with electron-vite and electron-builder (`appId com.agentnative.desktop`; dmg+zip, nsis, tar.xz+AppImage+deb for x64/arm64) and published to GitHub Releases of `BuilderIO/agent-native` (`AN packages/desktop-app/electron-builder.yml:1–2,55–105`). Auto-updates come from `https://www.agent-native.com/api/desktop-updates` (`AN packages/desktop-app/desktop-update-config.yml`). Depends on core, toolkit, code-agents-ui, shared-app-config, the MCP SDK v2 node transport and `node-pty`. Builds run in `desktop-release.yml` (mac, windows and linux jobs) and `desktop-canary.yml`. Desktop is versioned outside changesets (`AN .github/workflows/auto-publish.yml:17–19`).

**`@agent-native/mobile-app`** private, version 0.1.179. 196 files, 27 k src LOC. Built on Expo 57.0.6 / React Native 0.86.0, with React Navigation, Reanimated, `react-native-webview`, `@bacons/apple-targets` (iOS widgets), uniwind and Tailwind. Depends on core, agentkit and shared-app-config. `mobile-build-check.yml` builds Android and iOS on PRs and pushes. The website does not market a mobile app (§5).

**`@agent-native/docs`** private, no version. 606 files, 72 k src LOC, 82 test files. The website at `agent-native.com`: the React Router app that renders `/docs` from core's `.mdx`, plus the marketing pages (`app/routes/pricing.tsx`, `download.tsx`, the `$locale.articles.*` routes, campaign components) and the server routes `api/desktop-latest`, `api/desktop-updates` and others. Uses shiki, unified/remark and PGlite. It is deployed to production by `deploy-docs-production.yml` on matching `main` changes (`AN AGENTS.md:52–54`).

**`@agent-native/agent-browser-extension`** private, version 0.1.330. 46 files, 2.7 k src LOC. The "Public Agent-Native browser context and chat extension"; depends on core and browser-control-extension-core.

**`@agent-native/browser-control-extension-core`** private, version 0.1.0. 12 files, 2.6 k src LOC. The "Shared reviewed Chrome debugger control engine for Agent-Native browser extensions". It has no dependencies.

**`@agent-native/agent-chrome-extension`** private, version 0.1.0. Nine files, 164 src LOC. The "First-party Chrome control bridge for the Agent-Native desktop agent"; depends on browser-control-extension-core.

**`agent-native` (VS Code extension)** 0.0.2, MIT (`LICENSE.md`), `engines.vscode ^1.120.0`. 15 files, 528 src LOC. "Open Agent-Native Plans, Design, and MCP handoff links inside VS Code." Changesets ignore it.

### 1.4 Templates and community templates

| Template  | Files | Actions (flat `actions/`, non-test) 0.206 → HEAD | Public in catalogue                      | Notes                                                                                             |
| --------- | ----: | ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| analytics | 2,165 | 188 → **210**                                    | yes                                      | Largest growth since 0.206.0: dashboards, first-party events, BigQuery/Sigma/dbt (+116,828 lines) |
| design    | 4,261 | 184 → **202**                                    | yes                                      | +391,005/−92,375 lines since 0.206.0: Motion editing, GPU shaders, canvas                         |
| clips     | 2,402 | 147 → 154                                        | yes                                      | Also `clips/desktop` (Tauri 2, Rust `src-tauri`) and `clips/chrome-extension`                     |
| content   | 1,829 | 243 → 245                                        | yes                                      | Parity matrix; edits the framework docs (§1.2)                                                    |
| slides    | 1,710 | 87 → 88                                          | yes                                      |                                                                                                   |
| mail      |   884 | 85                                               | yes                                      |                                                                                                   |
| calendar  |   774 | 60                                               | yes                                      | Only Amplify-configured app                                                                       |
| plan      |   629 | 51                                               | yes                                      |                                                                                                   |
| assets    |   480 | 85                                               | yes                                      |                                                                                                   |
| factory   |   470 | 48 → 49                                          | hidden                                   |                                                                                                   |
| crm       |   386 | 73                                               | hidden                                   |                                                                                                   |
| tasks     |   377 | 29                                               | hidden                                   |                                                                                                   |
| brain     |   366 | 60                                               | yes (`core: true`, `defaultAgent: true`) | Not shown on the `/apps/` page (§5)                                                               |
| forms     |   329 | 20                                               | yes                                      | Reference for UI density (`AN AGENTS.md:349–350`)                                                 |
| dispatch  |   307 | 19                                               | yes                                      |                                                                                                   |
| chat      |   149 | 5                                                | yes                                      | The base layer for the `builder-code-starter` patch set and for community templates               |
| videos    |     3 | 0                                                | —                                        | Empty placeholder; "retired Videos host" now resolves to Clips (git `bf66cdc7d`)                  |

The catalogue is `AN packages/shared-app-config/templates.ts` (246 lines). `hidden: true` applies to tasks, crm and factory (`:196,208,221`).

### 1.5 Package dependency graph

Runtime dependencies are solid lines (`──>`); peer dependencies are marked `(peer)`. Arrows point from dependent to dependency.

```
                          @ag-ui/core, @noble/hashes
                                    ^
                                    |
                     +------- @agent-native/agentkit --------+
                     |              ^                         |
   @agent-native/recap-cli          |                         |
            ^                       |                         |
            |                       |                         |
   @agent-native/core ──────────────+        @agent-native/toolkit  (MUST NOT import core;
     ^   (peer, optional: core-corpus)            ^               core is an optional peer)
     |                                            |
     |<── dispatch ───────────────────────────────┤ (dispatch: dep toolkit, peer core)
     |<── scheduling ─────────────────────────────┤ (dep toolkit, peer core)
     |<── creative-context (peer core; peer toolkit optional)
     |<── pinpoint (peer)   embedding (peer)   otel (peer)   skills (dep)
     |<── code-agents-ui (peer core, toolkit, agentkit, shared-app-config)
     |<── frame (peer core, shared-app-config)
     |<── docs (dep core, toolkit)
     |<── desktop-app (dep core, toolkit, code-agents-ui, shared-app-config)
     |<── mobile-app (dep core, agentkit, shared-app-config)
     |<── agent-browser-extension ──> browser-control-extension-core <── agent-chrome-extension
     |
     |<── templates/* (all: core, toolkit, otel)
            calendar ──> scheduling
            dispatch, factory ──> dispatch
            analytics, assets, content, design, slides ──> creative-context
            chat ──> agentkit (direct)
     |<── community-templates/* (core, toolkit, agentkit)

  shared-app-config: no deps; consumed by code-agents-ui, desktop-app, frame, mobile-app (+ CLI/docs mirrors)
  migrate, vscode-extension: standalone
```

Release coupling differs from the import graph. `core`, `toolkit`, `agentkit` and `core-corpus` form one changesets **fixed** group and always carry the same version (`AN .changeset/config.json:5–12`). The other published packages version independently.

---

## 2. The stack, exact versions

Resolved versions are from `pnpm-lock.yaml`; declared ranges are from the cited `package.json`.

| Layer              | Declared                                                                                                                           | Resolved                                                                                                  | Notes                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node               | `>=22.22.0` (`AN package.json:257–259`; core `:973`)                                                                               | `.nvmrc` `v24.14.0`; Amplify uses `nvm use 24`                                                            | `postinstall` runs `.ts` with plain `node`                                                                                                                                             |
| Package manager    | `pnpm@10.29.1`                                                                                                                     | —                                                                                                         | `minimumReleaseAge` 24 h quarantine                                                                                                                                                    |
| Server             | `nitro 3.0.260903-beta` (core `:713`)                                                                                              | `nitro@3.0.260903-beta`                                                                                   | **Date-stamped pre-release pin** of Nitro 3                                                                                                                                            |
| HTTP               | `h3 ^2.0.1`                                                                                                                        | `h3@2.0.1` (h3 1.15.11 also present, transitively)                                                        |                                                                                                                                                                                        |
| UI framework       | `react-router` catalog `8.1.0`; core peer `>=8`                                                                                    | `8.1.0`; `8.3.0` only in desktop-app                                                                      | Framework mode                                                                                                                                                                         |
| React              | override `19.2.7`                                                                                                                  | `19.2.7`                                                                                                  | Pinned by root override                                                                                                                                                                |
| Build              | `vite` catalog `8.1.0`                                                                                                             | `8.1.0` (`8.1.5` in agent-browser-extension)                                                              | Rolldown "lazy barrel loading" enabled in app builds (CHANGELOG 0.207.0, `c2ea6bf`)                                                                                                    |
| CSS                | `tailwindcss ^4.2.4`                                                                                                               | `4.3.0`/`4.3.1`                                                                                           |                                                                                                                                                                                        |
| DB                 | Postgres only                                                                                                                      | `postgres@3.4.9` (postgres.js), `@neondatabase/serverless@1.1.0`, `@electric-sql/pglite@0.5.9` (override) | PGlite for local dev                                                                                                                                                                   |
| ORM                | `drizzle-orm ^0.45.2`; `drizzle-kit ^0.31.10`                                                                                      | `0.45.2`/`0.45.3`; `0.31.10`                                                                              | Not the Drizzle 1.0 RC                                                                                                                                                                 |
| Auth               | `better-auth 1.7.6`, `@better-auth/core 1.7.6` (new direct dependency since 0.206.0)                                               | `1.7.6`                                                                                                   | SSO/SCIM 1.7.6 as optional peers                                                                                                                                                       |
| Anthropic SDK      | `^0.90.0` (direct) + override `>=0.90.0`                                                                                           | `0.90.0`                                                                                                  |                                                                                                                                                                                        |
| OpenAI SDK         | —                                                                                                                                  | not used directly                                                                                         |                                                                                                                                                                                        |
| Vercel AI SDK      | peer `ai >=6`; templates pin `ai 6.0.258` (chat, dispatch, community) or `^7.0.84`/`7.0.106` (content, slides, analytics, mail)    | `ai@6.0.209/6.0.258/7.0.84/7.0.106`; `@ai-sdk/openai@3.0.74/4.0.51/4.0.70`; `@ai-sdk/anthropic@3.0.86`    | **Two AI SDK majors side by side** across templates                                                                                                                                    |
| Other LLM adapters | peers `@openrouter/ai-sdk-provider >=2`, `ai-sdk-ollama >=3`, `@typesafe-ai/sdk ^0.6.0`, `@builder.io/ai-utils ^0.84.0`            | —                                                                                                         |                                                                                                                                                                                        |
| MCP                | `@modelcontextprotocol/server 2.0.0`, `client 2.0.0`, `core ^2.2.0`, `ext-apps 2.0.3`, `node 2.0.0` (desktop)                      | `server/client/node@2.0.0`, `core@2.0.0`+`2.2.0`                                                          | **MCP SDK v2 split packages**. The v1 `@modelcontextprotocol/sdk@1.30.0` appears only as an optional dependency of `@google/genai`                                                     |
| WebMCP             | `@mcp-b/webmcp-polyfill ^5.1.0`                                                                                                    | `5.1.0`                                                                                                   |                                                                                                                                                                                        |
| Agent protocol     | `@ag-ui/core 0.0.59` (agentkit)                                                                                                    | `0.0.59`                                                                                                  |                                                                                                                                                                                        |
| Validation         | `zod` catalog `^4.3.6`                                                                                                             | `4.4.3`, `4.6.5` (and `3.25.76` transitively)                                                             | Any Standard Schema accepted (`@standard-schema/spec`)                                                                                                                                 |
| Data fetching      | `@tanstack/react-query` override `5.101.2`                                                                                         | `5.101.2`                                                                                                 | Plus `query-persist-client-core 5.101.2` (IndexedDB cache restore)                                                                                                                     |
| Collaboration      | `yjs ^13.6.33`, `y-protocols`                                                                                                      | —                                                                                                         |                                                                                                                                                                                        |
| Editor             | tiptap `3.31.4`                                                                                                                    | —                                                                                                         |                                                                                                                                                                                        |
| Chat UI            | `@assistant-ui/react ^0.12.19`                                                                                                     | `0.12.28`                                                                                                 |                                                                                                                                                                                        |
| Desktop            | `electron ^43.4.0`                                                                                                                 | `43.4.0`                                                                                                  | Clips desktop is **Tauri 2**                                                                                                                                                           |
| Mobile             | `expo 57.0.6`, `react-native 0.86.0`                                                                                               | same                                                                                                      |                                                                                                                                                                                        |
| TypeScript         | catalog `typescript: npm:@typescript/typescript6@^6.0.2`, `"typescript-7": npm:typescript@^7.0.2` (`AN pnpm-workspace.yaml:83–84`) | `@typescript/typescript6@6.0.2`, `typescript@6.0.3`, `typescript@7.0.2`                                   | **TS 6 under an alias plus TS 7 (native)**. Scaffolded apps ship only `typescript-7` (`AN packages/core/src/templates/default/package.json`; `AN packages/core/src/cli/create.ts:112`) |
| Tests              | `vitest ^4.1.5`, `@vitest/coverage-v8 4.1.5`, `@playwright/test`/`playwright 1.63.0`                                               | `vitest@4.1.9/4.1.10`, Playwright `1.63.0`                                                                | 638 spec files opt into `happy-dom`, 23 into `jsdom`; `@testing-library/react 16.3.x`; root scripts use `node:test`                                                                    |
| Lint/format        | `oxlint 1.71.0`, `oxlint-tsgolint 0.24.0`, `oxfmt 0.56.0`                                                                          | —                                                                                                         | `prettier` still a devDependency                                                                                                                                                       |
| Release            | `@changesets/cli 2.31.0`                                                                                                           | —                                                                                                         |                                                                                                                                                                                        |
| Observability      | peers `@sentry/* ^10.60.0 \|\| ^11.0.0`, `@opentelemetry/api ^1.9.1`                                                               | —                                                                                                         | `@agent-native/otel` wires OTLP export                                                                                                                                                 |

**Unusual choices:**

- A beta Nitro pinned to a date build (`3.0.260903-beta`).
- TypeScript 6 consumed through the `@typescript/typescript6` alias, with TypeScript 7 installed alongside as `typescript-7`.
- Two `ai` SDK majors in one monorepo.
- MCP SDK v2 (split packages) adopted while the v1 SDK is still in the tree through Google's SDK.
- `pnpm.overrides` used mostly as security floors.
- The **ban on dependency patches** (`AN AGENTS.md:83–85`), enforced by `guard:no-pnpm-patches`. The lockfile has no `patchedDependencies`.
- `minimumReleaseAge` exempting the project's own packages, MCP and TypeScript.
- Every GitHub Action pinned to a commit SHA with a version comment (for example `actions/checkout@34e1148… # v4.3.1` in `AN .github/workflows/ci.yml:1941`).

---

## 3. How the authors work

### 3.1 The agent-instruction architecture

**What it is.** One canonical instruction file, `AGENTS.md`, plus 97 skills in `.agents/skills/`. Every coding agent is pointed at the same text.

**How it works.**

- `CLAUDE.md -> AGENTS.md` and `.claude/skills -> ../.agents/skills` are symlinks. `.gemini/settings.json` sets `context.fileName: ["AGENTS.md", "CONTEXT.md", "GEMINI.md"]`. The writing-agent-instructions skill states the rule: "Keep one canonical instructions file: `AGENTS.md`. If a client expects `CLAUDE.md`, make it a symlink … Two hand-maintained files drift" (`AN .agents/skills/writing-agent-instructions/SKILL.md:92–97`).
- `AGENTS.md` has 3,394 words against a 3,430-word budget (`AN scripts/guard-doc-budgets.mjs:4–6`). It says "Keep this file small: the rules below are the invariants, and `.agents/skills/*` carries the workflow" (`AN AGENTS.md:5–7`). The skills total 17,134 lines; the largest are `babysit-pr` (572), `review-prs` (551), `external-agents` (549), `a2a-protocol` (538), `extensions` (533), `observability` (503), `tracking` (486) and `ship` (460).
- Skills carry `scope: dev` and `metadata.internal: true` (for example `AN .agents/skills/concurrent-agents/SKILL.md:8–10`), which separates internal workflow skills from shipped ones.
- Template and app-runtime guidance follows the same pattern one level down. Each template has an `AGENTS.md`, which **is injected into the in-app agent's system prompt** and "hard-sliced at `COMPACT_PROMPT_RESOURCE_MAX_CHARS` (6,000)" (`AN .agents/skills/writing-agent-instructions/SKILL.md:40–50`; constant at `AN packages/core/src/server/agent-chat/prompt-resources.ts:51`; guard limit `AN scripts/guard-agent-chat-context.ts:7`). The Design template's `AGENTS.md` is 5,999 characters and Clips' is 5,984. Shared skills are copied byte-for-byte into `packages/core/src/templates/workspace-core/.agents/skills/` (89 scaffold skills) and kept in sync by `pnpm sync:workspace-skills` plus `guard:workspace-skills` (`:99–106`).
- Per-agent configuration:
  - `.claude/settings.json` registers the file-lease hook (§3.3).
  - `.claude/commands/sidecar.md` spawns a read-only investigator "via the Agent tool (`general-purpose`, model `sonnet`) … do not run this on a stronger/pricier model" and carries a long verbatim read-only and shared-checkout contract, because "they get retyped by hand dozens of times a day and dropping a clause once is what causes a real collision" (`AN .claude/commands/sidecar.md:1–20`).
  - `.claude/launch.json` defines dev-server launch profiles (docs on 3000, plan on 3100, …).
  - `.codex/hooks.json` runs a design-review hook ("impeccable") from an **absolute path in the lead maintainer's home directory**, guarded by `[ ! -f … ] ||` so it no-ops elsewhere. `.github/hooks/impeccable.json` does the same for Copilot through `.github/skills/impeccable/`, which is not in the repo. `PRODUCT.md` is that tool's output (`<!-- impeccable:product-schema 1 -->`, `AN PRODUCT.md:3`).
  - `.builderrules` is for Builder.io's own agent.
  - `.claude-plugin/marketplace.json` and `.agents/plugins/*` publish four "app-backed skills" plugins (agent-native, visual-plans, design, turn-into-app) with homepages on `*.agent-native.com`.
- Runtime agents get the same repository knowledge. Generated apps get `docs-search` (the version-matched docs bundled in core) and `source-search` (core and template source, from `core-corpus`). A community template's `AGENTS.md` says: "Prefer both over memory when package APIs, actions, or agent surfaces are involved" (`AN community-templates/account-tiering/AGENTS.md:13–16`).

**Principle.** "Write each one for fast retrieval, not for prose" (`AN .agents/skills/writing-agent-instructions/SKILL.md:16–19`). "If a section is growing past a screen, it belongs in a skill" (`:36–38`).

**Changes since 0.206.0.** `AGENTS.md` was compressed: +26/−26 lines, with the skills paragraph and entry-point list shortened (git `de17c2ffe`, `ebf0bdf3c` and others). Three bullets were added: review-thread reply authority, `no-new-legacy-mcp-hints` has no opt-out, and framework tables belong to `defineStore()`. The A2A bullet was rewritten (§4.3). Three skills were added: `community-prs` (git `d3e5a8c1a`), `framework-stores` and `prototypes`.

### 3.2 What the rules tell the agents (selected, verbatim)

- **Autonomy.** "Do the work instead of asking whether to do it. If a step is inside the task you were given and is not destructive, irreversible, or a spend/send/publish action, run it and report the result — deploys, database reads and writes, scripts, and browser checks included" (`AN AGENTS.md:71–77`). "Use sub-agents liberally for complex independent work when Agent Teams are available" (`:78–79`).
- **Scaling effort.** "for small changes, read briefly, edit, and run existing checks; skip surveys, unrequested tests, and browser automation" (`:32–34`).
- **No attribution.** "Never add `Co-Authored-By` or other agent attribution to commits" (`:42`). "Never use `[codex]`, `codex`, or similar agent labels in user-visible GitHub metadata" (`:68–69`). The ship skill repeats this for branch names, PR titles and PR bodies (`AN .agents/skills/ship/SKILL.md:162–163`).
- **The flagship rule.** "A `catch`, default, or coercion that returns a value callers cannot distinguish from success is a bug, not a guard … Prefer a loud, typed failure over a plausible-looking normal state" (`AN AGENTS.md:86–92`).
- **Fix the boundary.** "Before adding a condition to a function that already stacks several special cases, stop … Fix the boundary that made the special case necessary" (`:93–95`), expanded in the `fix-at-the-boundary` skill: "one defect, 9 files, fixed one report at a time instead of once" (`AN .agents/skills/fix-at-the-boundary/SKILL.md:86–100`).
- **Comments.** "comment a constraint the code cannot show … not what the next line does, why your change is correct, or where it came from" (`AN AGENTS.md:96–99`). A sweep removed non-essential comments repo-wide (git `ed3801ea5`, 2026-09-26) **(inference: deliberate de-noising for agent context windows)**.
- **Dependencies.** "verify the current latest version first with `npm view` … Do not rely on remembered versions" (`:80–82`).
- **A final status block** on every response, ending in `🟢`, `🟡` or `🔴` plus one status sentence (`:114–131`).
- **Verification.** "Do NOT report done in these situations: The change is 'obviously correct' or one line — obvious fixes are the ones that ship broken most often … Silence from the user means keep working" (`AN .agents/skills/verifying-changes/SKILL.md:42–58`). The skill quotes the user corrections it replaces verbatim, for example "this is the third time you said you fixed it when you didn't" (`:98–110`).
- **Progress.** "A turn ends in exactly one of two shapes: Done, with the artifact that proves it … Blocked, on one line." The checklist before writing BLOCKED includes "Read production directly — the DB URLs are in the template `.env` files" (`AN .agents/skills/reporting-progress/SKILL.md:20–45`). That gives agents production database access by default **(inference: a sharp edge)**.
- **Concurrency.** "Default assumption on every task: the working tree is shared branch state … never reset, clean, stash, or overwrite local work without explicit authorization" (`AN .agents/skills/concurrent-agents/SKILL.md:15–19`). "Relaying between agents by hand is the user's most tedious job … Read its transcript yourself: `ls ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`" (`:104–113`).
- **Product defaults expressed as hard rules.** Density: no page title that repeats the nav item, no subtitle under any title, no eyebrows; "This is the repo's most-repeated correction (`text-heavy-ui`)", enforced by `guard:no-default-chrome` (`AN AGENTS.md:341–353`). The SSR shell must be impersonal and CDN-cached (`:329–333`). "UI feedback: target 100 ms, never exceed 400 ms" (`:336`).

### 3.3 Mechanism over guidance: guards, the file-lease hook and the friction report

**What it is.** A small set of executable checks that encode rules agents demonstrably fail to follow from prose, plus a measurement loop that decides which rules deserve a mechanism.

**How it works.**

1. **Guards.** `scripts/run-guards.ts` holds a fixed list of **92** checks (`AN scripts/run-guards.ts:6–98`; 89 at 0.206.0). The three added since are `guard:no-new-legacy-mcp-hints`, `guard:mcp-unredacted-call-boundary` and `guard:design-e2e-regression-pins`. They cover tenancy and credentials (`no-unscoped-queries`, `no-env-credentials`, `no-unscoped-credentials`, `no-secret-literals`), schema safety (`no-drizzle-push`, `additive-migrations`, `no-empty-migrations`, `release-schema-complete`), architecture (`no-action-twin-routes`, `toolkit-must-not-import-core`, `core-package-dependency-budget`, `ssr-cache-shell`, `no-boot-data-work`), agent context (`agent-chat-context`, `doc-budgets`, `workspace-skills`, `hooks-registered`), i18n (`i18n-catalogs`, `i18n-changed-copy`), release (`no-major-changeset`, `public-packages`, `migration-manifest`) and code hygiene (`no-silent-coercion`, `no-source-reading-tests`, `no-raw-colors`, `no-default-chrome`).
   - **Diff scoping.** Eight guards check "only lines this branch added, so the pre-existing backlog stays a separate cleanup" (`AN AGENTS.md:138–145`). Example: `no-silent-coercion` exists because "The repo already has ~459 empty catch blocks and thousands of `?? []` sites, so a whole-repo scan is unshippable noise" (`AN scripts/guard-no-silent-coercion.mjs:1–25`). `no-source-reading-tests` forbids tests that `readFileSync` a module and assert on its text; "An audit found 186 of them in 42 files" (`AN scripts/guard-no-source-reading-tests.mjs:1–22`).
   - **Three outcomes.** "exit 0 passed, exit 1 failed, exit 2 could not run … in CI it fails the run. Never reintroduce an `exit(0)` for a check that inspected nothing; that is the flagship rule above, violated inside the thing that enforces it" (`AN AGENTS.md:149–154`). `strictSkips = Boolean(process.env.CI) && !process.env.GUARD_ALLOW_SKIPS` (`AN scripts/run-guards.ts:131`).
   - **Opt-outs.** Each guard has a documented opt-out pragma that "a reviewer should see". `no-new-legacy-mcp-hints` has none: "the MCP `destructiveHint` baseline only shrinks" (`AN AGENTS.md:145–148`). `guard:e2e-quarantine` keeps a count of parked `fixme` tests that "only goes down" (`AN scripts/guard-e2e-quarantine.mjs`, header).
   - **Where they run.** Locally inside `pnpm run prep`, and in CI as the `Security guards` job on every PR (`AN DEVELOPMENT.md:162–169`; `AN .github/workflows/ci.yml:1934–1960`). "There is intentionally **no pre-commit hook**" (`AN DEVELOPMENT.md:168`).
2. **The one hook.** `scripts/hooks/file-lease.mjs` is registered as both `PreToolUse` and `PostToolUse` for `Edit|Write|MultiEdit|NotebookEdit` in `.claude/settings.json`.
   - PostToolUse writes a lease file at `.claude/leases/<sha1(abs path)>.json` holding `{session, at, mtime}`.
   - PreToolUse **denies** the edit in two cases. If another session holds a lease younger than `LEASE_TTL_MS = 15 min`, the message is "Do not overwrite it … re-read the file first … and say in your response that you are taking over". If the file's mtime advanced since this session last wrote it, the message is "changed on disk since you last wrote it — another agent edited or deleted it". Lease creation uses an exclusive write to break races (`AN scripts/hooks/file-lease.mjs:14–90`).
   - The rationale: "the only rule you cannot follow by reading instructions — no amount of guidance tells you that a peer session is mid-edit in the same file right now … It is a Claude Code mechanism only: it gives Codex sessions and plain human edits nothing, so it is a backstop, not a guarantee" (`AN AGENTS.md:160–168`). `guard:hooks-registered` keeps the AGENTS.md text and the settings file aligned.
3. **The friction report.** `node scripts/agent-friction-report.mjs --weeks 2` reads the local Claude Code and Codex transcript stores (`AN scripts/agent-friction-report.mjs:4170–4175`) and counts user messages that match **58 named patterns** (`PATTERNS`, from `:3746`). Examples are `false-done`, `stopped-early`, `collision`, `unpushed-work`, `no-failing-test-first`, `missed-localization`, `cheap-model`, `slow-editor-runtime` and `community-pr-handling`. Each pattern records its regex and the mechanism `fixedBy` with a date. Each regex has positive and negative self-test cases, and `pnpm test` runs `--self-test` first (`AN package.json:32`). The rule for authors is: "Before adding a rule to this file or to a skill, run that report … Name the pattern key the rule is supposed to move. No key, no rule … If the pattern is climbing and already has owning guidance, do not restate the guidance … Replace it with a mechanism … Delete the prose the mechanism replaces, in the same change" (`AN AGENTS.md:176–191`). It records its own measured failure: "The earlier version of this section claimed unasked branch creation 'went to zero' … Measured on 2026-08-12 it was 16 in two weeks" (`:193–196`). `reporting-progress` cites the same measurement: "had to chase status on a long-running run … 86 in two weeks" (`AN .agents/skills/reporting-progress/SKILL.md:15–18`).

**Principle.** "Rules here are carried by skills, not by blocking your tools. Two exceptions exist, and both are narrow on purpose" (`AN AGENTS.md:135–136`). "Everything else is guidance — but guidance nobody measures is guidance nobody can tell is working" (`:176–177`).

**Gaps.**

- The no-attribution rule has no guard. 33 commits since 0.206.0 carry AI co-author trailers (§3.9).
- The file-lease hook only protects Claude Code sessions, as its own docs admit.
- The friction report reads transcripts from one developer's machine, so it measures one person's experience of their agents **(inference)**.
- `docs-false-claims.guard.spec.ts`'s `walk()` swallows `readdirSync` errors into an empty list. The "collected documentation files" test, which requires a count above zero, catches only total failure (`AN packages/core/src/docs-false-claims.guard.spec.ts:65–93,282–297`) **(inference)**.
- The file-lease hook **fails open**. Unreadable hook input exits 0 (allow), and a lease that cannot be written logs "could not record lease" and proceeds (`AN scripts/hooks/file-lease.mjs:93–106,147–154`). That is the right choice for a backstop, but it means a broken `.claude/leases/` directory silently disables the protection **(inference)**.

**Key code, to rebuild the mechanisms.**

Diff scoping and "could not run" (`AN scripts/lib/changed-lines.mjs:4–6,17–64`). The base is `GUARD_DIFF_BASE` or `GITHUB_BASE_REF`, otherwise `origin/main` or `main`. Added lines come from `git diff --unified=0 --diff-filter=ACMR <merge-base>` and are parsed from the `@@ -a,b +c,d @@` hunks. Binary-diffing files are treated as unscopeable, and `prototypes/` is skipped (`:70–105`).

```js
export const GUARD_EXIT_COULD_NOT_RUN = 2;
export function addedLines(cwd, { includeWorkingTree = true } = {}) {
  const base = resolveDiffBase(cwd);
  if (!base) return null;
  const mergeBase = git(["merge-base", base, "HEAD"], cwd);
  if (mergeBase === null) return null;
  const args = ["diff", "--unified=0", "--no-color", "--diff-filter=ACMR"];
  if (!includeWorkingTree) args.push(mergeBase.trim(), "HEAD");
  else args.push(mergeBase.trim());
  const diff = git(args, cwd);
  if (diff === null) return null;
  return parseUnifiedDiff(diff, cwd);
}
// "The caller gets a Map or it gets nothing."
export function requireAddedLines(cwd, guardName, options) {
  const added = addedLines(cwd, options);
  if (added !== null) return added;
  console.error(
    `${guardName}: could not determine which lines this branch added …`,
  );
  process.exit(GUARD_EXIT_COULD_NOT_RUN);
}
```

Summarising a run (`AN scripts/lib/guard-run-summary.ts:1–60`). The file header gives the history: "The runner used to have two states for three outcomes … a guard that could not scope itself … exited 0 and `pnpm guards` printed 'All checks passed' over checks that had inspected zero lines." `resultStatus()` maps a signal to FAIL, exit 0 to PASS, exit 2 to SKIPPED and anything else to FAIL. `summarizeGuardRun()` returns exit 1 on any FAIL. With `strictSkips` (CI), any SKIPPED also returns exit 1 with "Refusing to report a pass … Set GUARD_ALLOW_SKIPS=1 to downgrade to a warning."

The lease decision (`AN scripts/hooks/file-lease.mjs:14–15,34–88`), condensed:

```js
const LEASE_TTL_MS = 15 * 60 * 1000; // lease lifetime
const SWEEP_AFTER_MS = 60 * 60 * 1000; // stale lease files deleted
// key: .claude/leases/<sha1(path.resolve(file))>.json  value: {session, at, mtime, file}
if (input.hook_event_name === "PostToolUse") {
  writeLease();
  allow();
}
const previous = readLease(leasePath);
if (
  previous &&
  previous.session !== session &&
  now - previous.at < LEASE_TTL_MS
)
  deny("Another agent session … claimed <file> …s ago … Do not overwrite it …");
if (
  previous &&
  previous.session === session &&
  previous.mtime !== null &&
  (diskMtime === null || diskMtime > previous.mtime)
) {
  writeLease();
  deny(
    "<file> changed on disk since you last wrote it — another agent edited or deleted it …",
  );
}
if (!previous || previous.session === session) {
  writeLease();
  allow();
}
if (!writeLease(/* exclusive: flag "wx" */ true)) {
  /* lost the race → deny if winner is live */
}
```

The deny is returned to Claude Code as `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":…}}` (`:156–166`).

### 3.4 `docs-false-claims.guard.spec.ts`: what it enforces

**What it is.** A Vitest spec in core (it runs with core's tests, not in `pnpm guards`). It locks in a past documentation audit by failing when a known-false sentence reappears in any documentation surface.

**How it works.** `collectDocFiles()` walks four surfaces: `packages/core/docs/content/**/*.md(x)` (preferring `.mdx` when both exist, and including locales), `.agents/skills/**/SKILL.md`, template-embedded `packages/core/src/templates/**/.agents/skills/**/SKILL.md`, and every `AGENTS.md` under `templates/` and `packages/core/src/templates/`. It excludes `node_modules`, `dist`, `build`, `.output` and `.claude/worktrees` (`AN packages/core/src/docs-false-claims.guard.spec.ts:28–34,95–135`). It applies nine regex rules line by line (`:174–239`):

| Rule id                                                                           | Scope                  | False claim it blocks                                                                                                                                                |
| --------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `org-plugin-built-in`                                                             | all                    | That Better Auth's organization plugin is used or built in. "Better Auth's org plugin is intentionally NOT registered … Orgs are the framework's own org/ module."   |
| `phantom-getDb-import`                                                            | all                    | `import { getDb } from "@agent-native/core/db"`. `getDb` comes from the app's `server/db/index.js` (`createGetDb(schema)`).                                          |
| `nested-auth-session-shape`                                                       | all                    | `session.user.email`. "AuthSession is flat — use session.email." It skips lines near external Builder session adapters (`isExternalSessionAdapterLine`, `:158–172`). |
| `force-fire-recurring-jobs`                                                       | all                    | That a job can be force-fired. "There is no force-fire/run-now job tool (manage-jobs is create/list/update/delete only)."                                            |
| `slides-fake-eight-layouts`, `slides-fake-full-bleed`, `slides-fake-blank-layout` | `template-slides.mdx`  | Slides has 7 real layouts.                                                                                                                                           |
| `wisprflow-typo`                                                                  | all                    | Spelling of "Wispr Flow".                                                                                                                                            |
| `content-db-push`                                                                 | `template-content.mdx` | A `db:push` script that does not exist. Content "uses additive startup migrations."                                                                                  |

A scope-check test asserts that every scoped file is actually collected, so a renamed page fails loudly (`:282–297`).

**Principle.** "each denylist pattern is written to match the FALSE phrasing only … do NOT edit docs to satisfy the test" (`:15–21`). The docs are treated as a codebase with regression tests. This matters doubly here: docs and skills are also _agent context_, so a false sentence becomes false agent behaviour **(inference)**.

**Gap.** It is a denylist of past mistakes. It cannot catch new false claims, such as the ones in §5 and "Docs vs code".

### 3.5 CI workflows

46 workflow files (`AN .github/workflows/`). By role:

- **PR gate: `ci.yml`.** 2,069 lines, triggered on every `pull_request` with no branch filter, "a stacked PR targets its parent PR's branch" (`:1–6`), with `cancel-in-progress`. A `change-scope` job runs `scripts/ci-change-scope.ts`, which "is the one place that decides what a change runs" (`AN .agents/skills/adding-tests-and-ci/SKILL.md:26–31`). It emits about 40 boolean outputs that gate 31 jobs: `lint`, `typecheck`, `test-targeted`/`test-rest`/`fast-tests` (vitest lanes planned by `scripts/ci-test-lanes.ts`), several Design canvas regression suites, Content DB/convergence/parity, `core-integration-tests`, `plan-e2e`, four Slides suites (including a macOS caret QA job), `brain-evals`, `build`/`build-gate`, `neon-query-budget` and `neon-connection-budget` (database cost budgets), `trusted-acceptance`, `scaffold-e2e`, `ssr-boot-smoke`, `guards`, `standalone-chat` and `deploy-paths`.
- **Release.** `auto-publish.yml` (796 lines; nightly every 3 h at `17 */3 * * *`; stable on a verified marker merge), `auto-merge-version-packages.yml`, `release-everything.yml` (958 lines; a coordinator that releases packages, then desktop apps and production sites; crons Mon–Thu 12:00 and Fri 10:00 America/Los_Angeles), `desktop-release.yml`, `desktop-canary.yml`, `clips-desktop-release.yml` (Tauri), `clips-chrome-extension-release.yml`, `push-starter-template.yml`, `publish-mcp-registry.yml` and `sync-public-skills.yml`.
- **Deploy.** `deploy-beta-sites-prebuilt.yml` (the sole beta publisher), `deploy-production-sites-prebuilt.yml`/`promote-netlify-deploy.yml`/`manage-production-sites.yml` (manual promotion), `deploy-docs-production.yml`, `deploy-netlify-prebuilt.yml` (**3,793 lines**), `deploy-netlify-pr-previews.yml`, and `deploy-paths.yml`/`deploy-hosts.yml`/`deploy-canary.yml`/`deploy-paths-reaper.yml`. That last group is new since 0.206.0: "Add deploy-path checks, a release gate, a nightly canary and a reaper" (git `96cacf91d`).
- **Production monitoring.** `beta-e2e*.yml` (every 6 h), `signup-e2e-scheduled.yml` (daily), `signup-agent-scheduled.yml` (an agent reviews sign-up), `keep-neon-warm.yml` ("Audit hosted app health", every 15 min), `neon-transfer-alert.yml`, `email-workflow-failures.yml`, `nightly-full-tests.yml` (4× a day), `design-e2e.yml` (daily, post-merge), `evals.yml` (daily gated evals), `trusted-acceptance*.yml` (pilot disabled: `AN docs/trusted-acceptance-lane.md:14–29`) and `slides-authoring-fuzz-soak.yml`.
- **Review aids.** Three `pr-visual-recap*.yml` workflows (about 1,330 lines each) render a visual recap of every PR, and `test-title-production.yml`.

`AN .agents/skills/adding-tests-and-ci/SKILL.md:16–26` treats CI as a **cost question**. On the GitHub Team plan the shared pool held 60 concurrent jobs, and "on 2026-09-29 the `Fast tests` gate waited a median 445 s just for a slot. BuilderIO moved to Enterprise Cloud in October 2026, which raises the pool to 500 jobs." The resulting rules: "A new test joins an existing lane or job. It never gets a job of its own." "Never skip, disable, or quarantine a test to get green" (`:33–53`).

### 3.6 Test strategy and counts

- **Unit and integration tests.** 6,400 `*.spec|test.{ts,tsx,mts,js,mjs}` files repo-wide at HEAD, 7 of them `*.e2e.*` (5,741 at 0.206.0) and about 72,400 `it(`/`test(` cases. Core has 1,314 spec files in `packages/core/src` (1,209 at 0.206.0) and about 21,100 cases. By area: templates/design 1,390, core 1,321, clips 517, content 480, analytics 426, slides 375, toolkit 352. Tests are co-located beside sources. `.db.test.ts` files are DB-backed, typically on PGlite.
- **Vitest base config** (`AN packages/core/src/vitest-config.ts:1–51`). `maxWorkers` defaults to `"25%"` and can be overridden through `VITEST_CONCURRENCY`/`AGENT_NATIVE_VITEST_CONCURRENCY`. It throws if `VITEST_MAX_WORKERS` contains `%`, because "vitest applies it as `Number.parseInt`, so `25%` becomes 25 workers" (`AN DEVELOPMENT.md:145–148`). `testTimeout: 30_000`, because "Vitest's 5 s default only holds while a worker has a core to itself" (`:43–47`). Core's own config adds a `template-path-aliases` plugin so core specs can load template action registries, plus global setup and setup files (`AN packages/core/vitest.config.ts`). The concurrency defaults exist because "several agent sessions or checkouts run checks at once" (`AN DEVELOPMENT.md:121–131`).
- **E2E (Playwright).** Seven Playwright configs: `e2e/beta`, `e2e/signup` (×2), `templates/content/e2e`, `templates/design` (203 specs), `templates/plan` (26) and `templates/tasks` (5). The browser-E2E guidance is strict: "A fired message, `toContain`, a file over N bytes, or a loose `closeTo` passes over the bug … An edit that never saved must fail" (`AN .agents/skills/adding-tests-and-ci/SKILL.md:55–70`). The Design suite was rewritten to "assert exact saved end state" during the window (git `ab1aeaafa`) and re-enabled (git `7028ea51f`).
- **Evals.** Three `*.eval.ts` files (`templates/analytics/evals/dbt-semantic-layer/…`, `templates/analytics/evals/production-source-cases.eval.ts`, `templates/content/parity/parity-evals.eval.ts`), plus a `brain-evals` CI job and the daily `evals.yml`.
- **Other suites.** Neon query and connection budgets (`scripts/neon-query-budgets.json`), an SSR boot smoke test, scaffold E2E, fuzz soaks, and the PR visual recap as a human review aid.

### 3.7 Release process

- **Changesets** (`AN .changeset/config.json`). `fixed: [core, toolkit, agentkit, core-corpus]`; `ignore: agent-native (vscode), desktop-app, code-agents-ui, shared-app-config, embedding, migrate`; `access: public`; `snapshot.useCalculatedVersion: true`. Publishable package changes need a `.changeset/*.md` (`AN AGENTS.md:360–362`). `guard:no-major-changeset` exists because "a stray major-type changeset promoted 0.176.1 to 1.0.0 on 2026-08-28" (npm deprecation message on `1.0.0`).
- **Two npm trains** (`AN .github/workflows/auto-publish.yml:3–21`):
  1. "Every three hours, a scheduled run publishes a `nightly` snapshot of `main` when a publishable path … changed … It never changes the repository or moves npm's `latest` dist-tag. Ordinary merges publish nothing."
  2. A dispatched or scheduled patch/minor/major run "creates the normal all-package Version Packages PR. Its marked merge is the only path that publishes a stable release."

  The `verify-stable-merge` job only lets a push publish when the head commit message contains `[stable-release]`, the actor is `builder-io-integration[bot]`, and the GitHub API confirms that the commit is the merge of a bot-authored PR from `changeset-release/main` whose title contains `[stable-release]` (`:82–125`):

  ```sh
  gh api --paginate --slurp "repos/$REPOSITORY/commits/$SHA/pulls" > "$release_prs"
  jq -e '... any(.[][];
      .base.ref == "main" and .head.ref == "changeset-release/main" and
      .head.repo.full_name == $repository and
      .user.login == "builder-io-integration[bot]" and
      .merged_at != null and .merge_commit_sha == $sha and
      (.title | contains("[stable-release]")))' "$release_prs" && verified=true
  ```

  A `deploy-gate` job then runs the documented deploy paths on the exact tree about to be published. Its stated reason: "The Version Packages PR is merged by a bot with admin bypass, so no CI result stands between that merge and this run … a failure here uploads nothing" (`:130–135`). Publishing uses OIDC (`id-token: write`, `:228,343,415`), and "npm trusted publishers are registered against this workflow file" (`:19–21`). `auto-merge-version-packages.yml` force-merges the release PR after verifying it is release-only (`:16–44`).

- **Scheduling.** `release-everything.yml` runs Mon–Thu 12:00 PT and Fri 10:00 PT (`:3–8`). The Friday slot was added in git `567797bad` on 2026-09-25. Since 0.206.0, every release commit title reads `chore: release packages (patch) [stable-release]`, but the version can still bump a minor when any pending changeset is `minor` (for example 0.208.0 from release commit `6ca27d0a8`).
- **Changelogs.** `changeset:release-version` runs `changelog:compact`. `CHANGELOG.md` keeps the newest 100 sections (back to 0.168.0) and moves older ones to `changelog/archive/CHANGELOG.md`. Template apps keep user-facing changelogs through `agent-native changelog add "<one sentence>" --type <added|improved|fixed>` (`AN AGENTS.md:367–370`).
- **Stable cadence since 0.206.0** (npm `time`; release commits):

| Version | Published (UTC)  | Day              | Release commit |
| ------- | ---------------- | ---------------- | -------------- |
| 0.206.0 | 2026-10-09 17:20 | Fri              | (before base)  |
| 0.207.0 | 2026-10-11 18:33 | **Sun** (manual) | `d619aba3d`    |
| 0.207.1 | 2026-10-12 19:18 | Mon              | `c54f5eefc`    |
| 0.208.0 | 2026-10-13 19:18 | Tue              | `6ca27d0a8`    |
| 0.209.0 | 2026-10-14 19:16 | Wed              | `6ac757a5e`    |
| 0.209.1 | 2026-10-15 19:16 | Thu              | `a7a7aebf7`    |
| 0.209.2 | 2026-10-16 17:23 | **Fri**          | `ec6fbc39a`    |
| 0.210.0 | 2026-10-19 19:21 | Mon              | `f5ad8fa2e`    |

Nightlies: 52 between 10-11 and 10-20, 3–8 a day. The latest is `0.210.1-nightly-20261020124228`. dist-tags: `latest 0.210.0`, `nightly 0.210.1-nightly-…`, `beta 0.0.0-beta-20260821182008` (stale), `dev 0.5.0-dev.b51eaae` (stale).

### 3.8 Commit and PR conventions

- History is linear: no merge commits since 0.206.0 (406 first-parent = 406 total). Every PR is squash-merged, and 395 of 396 non-release subjects end in `(#PR)`. Squash bodies keep the PR's sub-commits as `* fix: …` bullets. 177 of the 406 commits have five or more, and the largest has 245 (`41f86eb15`, "Make durable agent execution survive worker restarts", 30+ "fix: fence … / close … races" bullets). That shape is typical of agent iterate-review-fix loops **(inference)**.
- Subjects are mostly plain imperative sentences. Since 0.206.0: 256 plain sentences, then `fix` 83, `feat` 24, `test` 10, `docs` 8, `brain` 7, `perf` 4, `ci` 3, `refactor` 1. All-time, 3,602 of 6,500 non-release subjects are plain sentences and 1,708 are `fix:`. The one written rule: "Docs-only commits start with `docs: ` in the present tense" (`AN AGENTS.md:111–112`).
- Between 2026-08-12 and 2026-09-25, 226 PR titles were machine-generated by `ship:push`, in the form "chore: publish branch work in <paths> (N files)". None have appeared since 2026-09-25, and titles are now descriptive sentences.
- PR policy for agents: never push to someone else's PR without explicit authorization for that exact PR, and replies to every review thread on your own PRs are "always authorized and expected" (added since 0.206.0; `AN AGENTS.md:60–66`). The `review-prs` skill (an agent reviewing teammates' PRs) ignores bot PRs **and every PR by the lead maintainer's own login** (`AN .agents/skills/review-prs/SKILL.md:41–44`). The `community-prs` skill (new) makes outside PRs owned by assigned staff, with credit kept through `Co-authored-by` trailers that have real addresses (`AN .agents/skills/community-prs/SKILL.md:13–21,119–124`).

### 3.9 How many commits are agent-authored

**Hard markers** (trailers, bot authors), from the classification script:

| Window                                      | Non-release commits | With any AI marker | Breakdown                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------------------: | -----------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All time (7,707 commits; 1,207 release-bot) |               6,500 |    **756 (11.6%)** | author is the Builder.io bot identity 255; Builder.io bot co-author 233; Claude trailers 177 (`Claude Opus 5.5` 30 + 9 with 1M, `Opus 4.7 (1M)` 28, `Opus 4.6 (1M)` 26, `Claude` 25, `Sonnet 4.6` 10, `Opus 5` 10+3, `Opus 4.8` 10+10, `Sonnet 5` 5, `Fable 5` 5, …); Cursor 85; the agent-native in-app agent 16; Codex/OpenAI 2; Copilot 1 |
| Since 0.206.0                               |                 396 |      **33 (8.3%)** | Claude 23, Builder.io bot co-author 14. By author: Alice Alexandra Moore 12, Liam DeBeasi 8, Joe CJ 3, Sami Jaber 3, Kyle Fowler 2, others 1 each. **Steve Sewell: 0 of 214**                                                                                                                                                                |

The release bot `builder-io-integration[bot]` authored 1,206 commits all-time. 1,083 are release mechanics: 508 + 484 "chore: version packages", 69 + 17 "chore: release packages … [stable-release]", and 5 "consume stable release changesets". The other **123 are ordinary feature and fix PRs merged under the bot's GitHub App identity**, for example git `3f47617d2` "Add click-to-drill-down on Analytics dashboard charts" (with 14 `fix(analytics): …` sub-commits), `b34feb89a`, `d04dfdc1a` and `63938a192`. The classifier above counted every bot-authored commit as release work and excluded them. Counting these 123 as agent PRs, which is likely given the same squash shape **(inference)**, raises the all-time floor to **879 of 6,623 non-release commits (13.3%)**, and since 0.206.0 to 35 of 398. The author named "Builder.io" (255 commits, Mar–Jul 2026, branches `ai_main_*`) is Builder.io's own coding agent **(inference from branch names and messages)**.

**Why these numbers are a floor.** The rules forbid attribution (§3.2). The maintainer runs many Claude Code and Codex sessions on one checkout (`AN .agents/skills/concurrent-agents/SKILL.md:15–19`). The friction report and skills quote his corrections to agents verbatim. The Final Status Block format appears throughout the rules. Squash bodies show long agent-style fix loops. So the large majority of the top author's 4,149 commits were agent-written under human direction **(inference, strongly supported)**.

### 3.10 The feedback-to-fix loop

The `review-latest-feedback` skill (459 lines, `user-invocable`) sweeps Slack (`#product-agent-native-feedback`, `#qa-agent-native`, `#dev-agent-native-feedback`), GitHub, CI, Sentry, Analytics and release lanes. Its phases are: claim with 👀, answer people who answered, fix "what the evidence actually proves, at the owning boundary", then reply and recap with ✅/🎫 reactions (`AN .agents/skills/review-latest-feedback/SKILL.md:1–35`). Commits titled "Fix recent framework feedback" (`de17c2ffe`), "Fix feedback sweep issues in Analytics, Clips, and Design" (`d23c03ff1`) and "Fix feedback defects across Design, connections, and run recovery" (`0fb4de3ed`) are the output. `scripts/feedback-inventory-check.ts`, a 14,717-line script added since 0.206.0, supports the sweeps.

### 3.11 Supply-chain and security hygiene

- 24-hour `minimumReleaseAge` (§1.2).
- Install scripts limited to an allowlist.
- SHA-pinned Actions and `permissions: {}` defaults in publish workflows.
- OIDC trusted publishing to npm.
- Dependabot: npm weekly, minor/patch grouped, 10-PR limit; GitHub Actions weekly (`AN .github/dependabot.yml`).
- Override floors for known CVE ranges.
- No dependency patches allowed.
- `SECURITY.md`: GitHub private vulnerability reporting; acknowledgement "within five business days"; fixes prioritised for `main` and the latest release (`AN SECURITY.md:5–28`).

---

## 4. What changed since the previous analysis (`1284000325bf..a03f638`)

### 4.1 Volume

- **406 commits** between 2026-10-11 and 2026-10-20. Per day (committer date): Sun 10-11 58, Mon 22, Tue 34, Wed 55, Thu 59, Fri 62, Sat 25, Sun 10-18 8, Mon 10-19 70, Tue 10-20 13 (until 17:01 +0200).
- **29 authors.** Steve Sewell 214 (52.7%), Alice Alexandra Moore 85 (20.9%), Liam DeBeasi 12, Sidharth Mohanty 11, shomix 11, Sanyam Kamat 10, builder-io-integration[bot] 10, Enzo Ames 9, Kyle Fowler 9, Shawn McClelland 7, then a tail. Seven authors are new: DevPro, Geoff, Joe CJ, Omar Shalaby, Vijay Z, agencyclaw and jbendotnet. Several community PRs with old numbers were merged (#3639, #4739, #5777, #5886, #6240, #6692, #6700).
- **Diff:** 5,817 files, +921,568/−143,862 lines. 437 k of the added lines are in test, snapshot, fixture or e2e files (47%). Core: +166,885/−19,873 (tests +94,185, docs +18,824, source +53,876/−9,848). By area: Design +391 k, core +167 k, analytics +117 k, clips +71 k, slides +50 k, scripts +39 k, toolkit +15 k, prototypes +13 k.
- **Commits touching each area:** core 159, `.changeset` 156, design 96, analytics 89, slides 74, clips 74, toolkit 70, scripts 59, `.github` 40, `.agents` 36.
- **Changesets added:** 208, of which 168 were core `patch` and 10 core `minor`. Toolkit had 45 patch and 1 minor; agentkit 7 patch and 1 minor; dispatch 6 patch; creative-context 5 patch. There were no `major` changesets.

**Caveat for readers of the earlier notes.** The earlier notes were read at `1284000325bf`, whose `package.json` said 0.206.0. The 0.207.0 release (published 10-11 18:33 UTC) consists mostly of changesets committed on 10-09 and 10-10, **before** that commit; for example `d7da131`, `19cd58b`, `aa34418`, `e818cf9`, `eb2ca66` and `4ff59ad` are ancestors of the base. So the 0.207.0 CHANGELOG mostly describes code that was already in the tree the earlier notes read. Of its 70 distinct changeset hashes, 62 are ancestors of the base. Only 8 are later: `19092a7` (beta MCP server names), `2e167cf`, `3451273` (sign-in attribution), `3daa76a`, `6f1fa56`, `75a4b65`, `7f11f95` (the Chat "Get started" page and self-hosted provider-key fallbacks) and `cbca71a`.

### 4.2 Releases and their headlines (from `AN packages/core/CHANGELOG.md`)

- **0.207.0** (`:304–505`). Mostly pre-base work: MCP install links and per-environment server names, recovery of interrupted scheduled automations (a 30-paragraph entry, `eb2ca66`), IndexedDB persistence of action-query results (`d7da131`), resource-tagged invalidation for `useActionQuery`/`useActionMutation`, removal of `AGENT_NATIVE_HTTP_TELEMETRY_SAMPLE_RATE` (`b3653e1`), and image bytes kept out of SQL (`aa34418`).
- **0.207.1** (`:282–302`). Durable-snapshot de-duplication, action-cache restore safety, `agent_connected` tracking.
- **0.208.0** (`:247–280`). File-scoped Google Sheets connection (minor); localhost source-operation capabilities; Motion source editing; bounded backoff for provider rate limits.
- **0.209.0** (`:214–245`). BigQuery via managed Google OAuth (minor); `resolveAdditionalActions` (request-scoped app actions); batched run-event writes; tokenizer reuse; replay of an approved tool call when its paused result is missing.
- **0.209.1** (`:187–212`). **`defineStore()`** framework stores with the `_an_store_migrations` ledger and `SchemaNotMigratedError` (`4e49b3a`); `retrySafe` actions; staged-dataset eviction; tool revisions bound into approvals (`ce01559`); 503 cause codes for workspace-app access.
- **0.209.2** (`:152–185`). **The recorder and "Report a problem"** (`f99e655`; then hidden by `fefd6205c` "until it works end to end"); `runAppReleaseMigrations()`; a compare-and-swap for job edits; refusal to write secrets under a non-preferred key when a dev server shares a remote database (`d094432`); automatic upgrade of outdated model ids (`38a66a8`).
- **0.210.0** (`:54–150`). Durable fenced execution (`41f86eb`, minor, also an agentkit minor); MCP audit attribution (`108b9d9`, minor, **breaking**); audit columns for MCP client and approval (`d0f6950`); **MCP output contracts and `runPreparedActionCall`**, with approvals bound to an `arguments_hash` (`fab1c27`); the Fetch MCP adapter at `@agent-native/core/mcp/fetch` (`38ccdb4`, two minors); Builder-managed web search in the first tool set (`937af16`); Gong for Brain (`6c7c90e`); BM25 tool search and every loadable tool named in the cached prompt prefix (`aecef0c`); `fail()` details shown to agents (`578c558`); read-only provider POSTs (`461d53c`); MCP schema flattening to pinned provider rules (`ca67d21`); embed-ticket redaction in MCP results (`c19512c`); a fresh-DB schema snapshot cutting "about 2,500 SQL statements to about 680" (`bf54dc3`); the MIT licence text (`0cfbd4d`); and A2A demoted to opt-in (`7c4669b`).
- **Unreleased** (16 pending changesets, all patch): Fusion run completion (`sendFusionBranchMessage` reports `completed` only after the run ends), turn-abort fencing, HubSpot OAuth readiness, Windows tar, and Zod 4 literal serialization.

### 4.3 Themes

1. **Durable agent execution (core).** Execution fences (`ExecutionFence {threadId, turnId, runId, generation}`, `StaleExecutionFenceError`; new `AN packages/core/src/agent/execution-fence.ts`, 162 lines), lease claims serialized with turn cancellation, submission inbox receipts, recovery of queued submissions, and abort acknowledgements that reflect durable writes. Commits: `41f86eb15`, `1f181604c`, `69b873f06`, `79f48bcdf`, `b738cb8ef`, `64bf791ac`, `3be2c8200`, `9bb5cda0a`, `d7d852c80`, `f1324b11f`, `9b463c8e0`, `5619bf520`.
2. **Action-call preparation and approvals.** One preparation step that validates, snapshots and hashes arguments (`actionCallIntent` → `runPreparedActionCall`, `AN packages/core/src/action.ts:2260,2360`). Approvals and replays key on the hash. Tool `revision` is bound into approvals. Commits: `fab1c27c7`, `ce015590d`, `3be2c8200`.
3. **MCP surface hardening.** Annotation audit with the `destructiveHint` baseline that can only shrink, and `mcp:write` required for write-capable tools (`9c277b79c`). Output schemas only for audited actions (`fab1c27c7`). Schemas checked against Anthropic, OpenAI and Gemini rules (`ca67d217b`). A shared execution core plus a direct adapter (`3d6a9d385`). Truncation notices (`774af36d2`). Embed-ticket redaction (`c19512cf6`). Authorization of connected MCP tool calls (`459b1eb7d`). Curated catalogs gain organization-member tools (`c3e3063db`, `a9e3e2158`). A Fetch adapter for non-H3 runtimes (`38ccdb403`, community PR).
4. **Audit and attribution.** `auditAttribution(ctx)`/`routeAuditAttribution(event)` (new `AN packages/core/src/audit/attribution.ts:95`); MCP client, OAuth client and approval columns; CSV formula-injection escaping (`d0f6950a8`, `108b9d95e`).
5. **Schema ownership: release-time migrations, no DDL at request time.** `defineStore()` and `_an_store_migrations` (new `AN packages/core/src/db/store-registry.ts:1–13,36–49,797–822`). The stores' ledger is recorded outside hosted runtimes too, boot-time and release-only lists are folded into stores, Better Auth migrations moved into the ledger, a generated schema snapshot is used for fresh databases, and starter apps' own migrations run in `migrate:production`. Commits: `4e49b3ac3`, `deb1f926a`, `429e5fecc`, `dd55f834c`, `e19fce10c`, `bf54dc335`, `579d66ca4`. All by one author, against the design document `AN docs/plans/2026-09-28-store-registry-schema-ownership.md`. The new skill `framework-stores` and the AGENTS.md rule "append, never edit" (`AN AGENTS.md:282–283`) go with them.
6. **Agent tool discovery.** Every loadable tool is named in the cached prompt prefix, and `tool-search` ranks with BM25 (`aecef0c62`; `AN packages/core/src/agent/tool-search.ts`).
7. **Provider API substrate.** Read-only POST allow-list (GA4, Search Console, BigQuery dry runs, HubSpot search, Gong, Notion, PostHog, Jira, Prometheus, Calendar free/busy, Sheets), docs-fetch redirects with an SSRF check per hop, byte-capped bodies, and provider-side search as the default (`461d53c02`, `4bed5e7e3`, `b95626f26`). New connections: BigQuery (personal and managed), Sigma OAuth, dbt Semantic Layer, Gong and Google Sheets.
8. **Organization and admin capabilities for agents, with limits.** `list-organization-members` and `invite-organization-member` (approval-gated, cannot grant admin; `e48e8b512`). Agents and MCP **cannot** mint organization service tokens or change service-principal policy (`9156c9d24`). The legacy scoped agent-access token format was dropped (`3215556c9`).
9. **Cross-app architecture rule reversed (A2A demoted).** Old (`AN AGENTS.md` at `1284000325bf`): "prefer many focused headless or small-UI mini-apps that discover and call each other over A2A instead of one oversized app." New: "Keep apps focused, but default to local actions. Use A2A only on request or for required peer-owned data, credentials, or capabilities. Availability or enrichment alone doesn't qualify; artifacts stay in their owning app" (`AN AGENTS.md:251–255`; git `7c4669b17`, changeset "Keep app work local by default and reserve A2A for peer-exclusive needs"). The friction report gained an `A2A_OVERDELEGATION` regex set. The reason was agents over-delegating, for example Slides image generation delegating to Assets **(inference from the commit's 14 sub-commits about local Slides image generation)**.
10. **Observability and diagnostics.** The recorder: a redacted in-memory event log with Sentry breadcrumbs (`f99e65543`; new `AN packages/core/src/client/recorder.ts`), "Report a problem" (hidden again in `fefd6205c`), and `read-problem-report`.
11. **Builder.io commercial path.** A/B test of a "free credits" first-run page with experiment ids in analytics (`8e8419361`, which in its sub-commits also "drop[s] the free and open source line from the credits offer"). Rework of the credits offer (`2d994c1a9`). Builder-managed web search on by default (`937af16e9`). Three free hosted Clips recordings behind a rollout flag, after which "Connect storage to finish saving" (`61089ee30`; `AN templates/clips/server/lib/video-storage.ts:282–316`). "Enable online building from docs" (`3526667ba`). "Design: edit Builder apps from Design, with Builder as the platform (spike)" (`d3024911d`). Builder connect sent to the declared origin (`8fbccb327`).
12. **Template product work (most of the line volume).** Design: source-backed Motion editing, text motion, native shaders with a shared GPU canvas renderer, a canvas editor overhaul and chrome redesign. Analytics: dashboards (view mode, filters, annotations, key-date markers, drill-down, history), first-party event queries without BigQuery, a cost estimator. Slides: editor top bar, layers panel, floating toolbar, spoken presenter navigation. Clips: bundled ffmpeg, transcript import (VTT/SRT), frame stepping, YouTube embeds, a free hosted tier. Content: Blocks fields as tabs, property comments. Brain: Zoom admin-only sources, Gong.
13. **Process and infrastructure.** LICENSE (`0cfbd4dde`). Prototypes library (`8ff15a557`). `community-prs` skill. Deploy-path checks, release gate, canary and reaper (`96cacf91d`, `9ba938390`). Chat docs restructured into five pages (`dd132f705`). "Use cases" and "articles" campaign pages on the site (`e845f856b`). Netlify keep-warm made opt-in (`cd60213c8`).

### 4.4 Breaking or behaviour-changing items for app authors

1. **`recordActionAudit` / `recordOrgAdminAuditEvent` signatures changed.** Both now require `attribution` from `auditAttribution(ctx)` or `routeAuditAttribution(event)`; a call without one throws `AuditAttributionError`. Migration: move `caller`, `threadId`, `turnId` and `runId` out of `ctx` (CHANGELOG 0.210.0, `:60–64`; git `108b9d95e`). It is the only changeset marked "Breaking". **The migration manifest did not change** (still 107 moves; `AN packages/core/migration-manifest.json` is identical to the base version), because signature changes have no codemod.
2. **Pending tool approvals are asked again.** Approvals now bind to `arguments_hash`, a new nullable column on `agent_tool_approvals` and `agent_tool_ledger`. "one recorded before this release is asked for again" (0.210.0, `fab1c27`).
3. **Scoped agent-access tokens in the older format stop verifying** (links and approval emails up to 7 days old) (`3215556`, shipped as a patch-level entry inside 0.210.0).
4. **MCP hints and scopes.** `run-code` and `web-request` now advertise `destructiveHint: true` and need `mcp:write`. Dev-discovered tools advertise new default hints (`9c277b7`).
5. **MCP tool lists.** Actions whose input schema fails the pinned provider rules are **left out** of MCP and in-app tool lists, with a logged error. A remote MCP tool that fails the rules is held back (`ca67d21`).
6. **Hosted deploys can fail with `SchemaNotMigratedError`** when the store ledger does not cover the shipped code. `getDbExec()` always returns the schema-guarded client (`4e49b3a`, released as a patch in 0.209.1).
7. **Starter apps.** `migrate:production` now runs the app's own `server/plugins/db.ts` migrations through `runAppReleaseMigrations()`; "before this the app's tables were never created in production" (`579d66c`, 0.209.2).
8. **`useActionQuery` batching.** First fetches are no longer batched, and GETs through `callAction` are no longer batched (`d2587cf`, 0.209.2).
9. **Agents can no longer create organization service tokens** (`9156c9d`).

### 4.5 New concepts and names (first appearing after the base)

`defineStore()`, `_an_store_migrations`, `SchemaNotMigratedError`, `runAppReleaseMigrations()`, the schema snapshot (`schema-snapshot.generated.ts`), `ExecutionFence`/`StaleExecutionFenceError`, `actionCallIntent`/`runPreparedActionCall`, `arguments_hash`, `ActionOutputContractError` (`output_contract_violation`), `outputErrorStrategy: "strict"` + `mcpOutputSchema: true`, `effect: "committed" | "none"` on failures, `retrySafe`, the action-entry `revision`, `auditAttribution`/`routeAuditAttribution`/`AuditAttributionError`, `reportedClientName`/`oauthClientId`/`approval` audit columns, `resolveAdditionalActions`/`additionalActionSurfaces`, `@agent-native/core/mcp/fetch`, the `recorder` with `configureRecorder` and `read-problem-report`, `checkWorkspaceAppAccess`, `resolveWorkspaceConnectionsForApp`, `mcpAnnotationDefaults`, `x-agent-native-thread-absence: typed`, `estimate-query-cost`, `list-organization-members`/`invite-organization-member`. Ten new export subpaths in core: `client/auth/resend-verification-email`, `client/motion-text(.css)`, `client/problem-report`, `client/recorder`, `connections/sigma-api`, `mcp/fetch`, `shared/motion-easing`, `shared/motion-source-node-id`, `visual-edit-bridge-capability`. Six new runtime dependencies: `@babel/parser 8.0.7`, `@better-auth/core 1.7.6`, `ajv-formats`, `entities`, `magic-string`, `parse5`.

Docs pages added: `create-with-an-agent`, `recorder`, `template-chat-agent`, `template-chat-features`, `template-chat-integrations`. Removed: `template-chat-first-edits`. 39 English pages modified; 216 English pages in total.

### 4.6 npm publish cadence over the last 60 days (since 2026-08-21)

`@agent-native/core` has **1,868 versions** in total: 1,021 stable, 790 nightly, 55 beta and 2 dev. The package was created on 2026-03-12.

| ISO week       | Stable releases | Range                                                      |
| -------------- | --------------: | ---------------------------------------------------------- |
| W34            |              15 | 0.168.0 → 0.169.1                                          |
| W35            |              25 | 0.170.0 → **1.0.0** (published in error 08-28, deprecated) |
| W36            |               3 | 0.176.3 → 0.176.5                                          |
| W37            |               4 | 0.177.0 → 0.178.1                                          |
| W38            |               5 | 0.179.0 → 0.182.1                                          |
| W39            |              13 | 0.183.0 → 0.195.0                                          |
| W40            |              11 | 0.196.0 → 0.200.0                                          |
| W41            |               9 | 0.201.0 → 0.207.0                                          |
| W42            |               5 | 0.207.1 → 0.209.2                                          |
| W43 (to 10-20) |               1 | 0.210.0                                                    |

Stable releases per month: May 237, Jun 233, Jul 255, Aug 216, **Sep 34, Oct (to 10-20) 17**. Distinct minor versions per month: Jun 53, Jul 49, Aug 40, Sep 23, Oct 12. Nightlies began in August (193), Sep 480, Oct 117. The shape is unchanged from the earlier notes: one stable release per working day, nightlies every three hours, and a minor bump almost daily (0.206 → 0.210 in six working days). The accidental `1.0.0` produced `1.0.x-nightly` and `1.1.0-nightly` snapshots for three days (2026-08-28 to 08-31) before the 0.x line resumed.

### 4.7 Overall history

- **First commit:** `9a2cf431f`, 2026-03-12 07:31 -0700, "initial commit", by Steve Sewell. The npm package was created the same day.
- **Commits:** 7,707 at HEAD (7,301 at the base).

| Month (2026)   | Commits | Top authors that month                                       |
| -------------- | ------: | ------------------------------------------------------------ |
| Mar            |     437 | Steve Sewell 68%, Vishwas 20%, Builder.io (agent) 9%         |
| Apr            |     416 | Steve Sewell 79%                                             |
| May            |     670 | Steve Sewell 54%, release bot 29%                            |
| Jun            |     880 | Steve Sewell 32%, release bot 31%, Builder.io (agent) 11%    |
| Jul            |   1,202 | Alice Alexandra Moore 27%, release bot 25%, Steve Sewell 24% |
| Aug            |   1,258 | Steve Sewell 54%, release bot 22%                            |
| Sep            |   1,742 | Steve Sewell 71%                                             |
| Oct (to 10-20) |   1,102 | Steve Sewell 61%, Alice Alexandra Moore 18%                  |

ISO weeks W34–W43: 423, 422, 323, 254, 412, 463, 477, **623** (W41, the busiest week so far), 265, 83 (partial).

- **Top 10 by commits** (`git shortlog -sn`, names as in git): Steve Sewell 4,149; builder-io-integration[bot] 1,206; Alice Alexandra Moore 726; Builder.io 255; shomix 213; Sidharth Mohanty 123; Nicholas Koech 116; Vishwas 112; Liam DeBeasi 67; Enzo Ames 63. There are **94** distinct author names (87 at the base).

---

## 5. Docs and marketing versus reality

Pages crawled on 2026-10-20: `/`, `/about/`, `/apps/`, `/pricing/`, `/download/`, `/skills/`, `/use-cases/`, `/legal/ai-terms/`, `/articles/`, `/terms/`, `/privacy/`, `/legal/`, `/apps/clips/`, `/apps/design/`, `/apps/dispatch/`. All are served by `packages/docs` (for example `AN packages/docs/app/routes/pricing.tsx`, `download.tsx`, `$locale.articles.*`).

### 5.1 What the site claims and sells

- **Home** (https://www.agent-native.com/). "The agentic application framework. Build autonomous agents with intuitive UIs. Bring your own LLM. Deploy anywhere." Eight featured apps, each tagged **alpha**. "Build from scratch … build online with Builder.io" links to `builder.io/signup?useFusion=true&initialPrompt=Create+a+new+Agent-Native+app.` The header GitHub badge reads **7.5k** (7.1k on 10-11).
- **About** (https://www.agent-native.com/about/). "The framework source is available under the MIT license … Hosted Agent-Native services are operated separately from forks and self-hosted deployments." "**Builder.io operates the hosted Agent-Native applications and documentation at agent-native.com.**"
- **Pricing** (https://www.agent-native.com/pricing/). "Zero … Every feature, every template, unlimited seats, no credit meter." Free: all current and future templates; every surface (UI, agent tools, HTTP, MCP, A2A, CLI); unlimited users, apps and environments; self-host; fork and sell. Costs money: your AI tokens, your hosting, and the "easy button": "'all in one' back-ends that cover agent tokens, storage, databases, deploys, and auth … turn on Builder.io or configure another all-in-one provider within your app settings." FAQ: "We make money if you choose our backend. That's the whole business model." "We could change [the license] for future versions. We cannot revoke it on code you already have."
- **Apps** (https://www.agent-native.com/apps/). Eleven apps, all alpha: Design, Slides, Analytics, Calendar, Clips, Mail, Assets, Content, Dispatch, Forms, Plans. Chat appears only in the footer; Brain does not appear.
- **Download** (https://www.agent-native.com/download/). An "all in one desktop app" with **Stable** and **Nightly** channels: macOS (Apple Silicon/Intel dmg), Windows (x64/Arm64 exe), Linux (x86_64 "tar.gz", AppImage, deb). Plus "Build your own: `npx @agent-native/core@latest create my-platform`".
- **Skills** (https://www.agent-native.com/skills/). App-backed skills (`/visual-plan`, `/visual-recap`, `/visual-edit`) installed with `npx @agent-native/core@latest skills add`. "Works with Claude Code, Codex, Cursor, Pi, OpenCode, GitHub Copilot / VS Code."
- **Use cases** (https://www.agent-native.com/use-cases/) and **Articles** (https://www.agent-native.com/articles/). SEO campaign pages added 2026-10-16 (git `e845f856b`): 17 use cases grouped by app and 11 articles in 6 topics ("What is an agent-native app?", "How do you add skills to Claude Code and Codex?", …).
- **AI Terms** (https://www.agent-native.com/legal/ai-terms/, updated 2026-09-02). These apply "only to hosted Agent-Native services … The MIT-licensed framework, forks, and self-hosted deployments are outside its scope." You own Input and Output. "We may process and retain Input, Output, and related Customer Data to provide, secure, debug, support, analyze, and **improve AI features** in the hosted service … Third-party AI providers may process that information on our behalf. **Agent-Native has no paid plans or enterprise plan distinctions.** We will not sell hosted application content, use it for third-party advertising, or make Customer Data available to other customers through AI features." The terms forbid using the AI to train a competing model.
- **Hosted Services Terms** (https://www.agent-native.com/terms/, effective 2026-09-03). They govern hosted apps, examples, demos and browser extensions. "Agent-Native currently has no paid plans or paid hosted subscriptions"; the service is "as is", with no SLA, support or **storage** commitment (§3.2). Prohibited data: HIPAA PHI, children's data, full card numbers, government IDs, biometrics (§4.2). Licence to Customer Data "to provide, secure, debug, analyze, and improve the Service, including its AI features" (§5.3). California law, San Francisco courts (§12.1–12.2). **The operator is never named**; it is "we".
- **Privacy** (https://www.agent-native.com/privacy/, effective 2026-09-03). It collects hosted application content (recordings, transcripts, prompts, agent responses, …) and uses it to "improve the Sites and Services, including AI features". It does not sell personal information. It has a Clips Chrome extension section (developer logs are optional and redacted; "not designed to collect request bodies, response bodies, cookies, or authorization headers"). The operator is again not named.
- **Legal index** (https://www.agent-native.com/legal/). "Agent-Native has no paid plans or enterprise contract. Commercial materials such as enterprise SLAs, support terms, DPAs … are not included."

### 5.2 Claims checked against the repository

| Claim (page)                                                                                    | Supported?                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| MIT licence (about, pricing, README)                                                            | **Yes, since 2026-10-19**                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Root `LICENSE` and 15 package `LICENSE` files (git `0cfbd4dde`); `@agent-native/core@0.210.0` tarball contains `package/LICENSE` |
| "Every action surface: UI, agent tools, HTTP, MCP, A2A, CLI" (pricing)                          | Yes in code, but A2A is now **discouraged by default**                                                                                                                                                                                                                                                                                                                                                                                                                     | `AN AGENTS.md:251–255` (§4.3 item 9)                                                                                             |
| "Bring your own LLM" (home)                                                                     | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Core peers for six `@ai-sdk/*` providers, OpenRouter, Ollama, Builder (`AN packages/core/package.json:794–838`)                  |
| "Deploy anywhere" / "Self-host anywhere"                                                        | Qualified: any Nitro preset, but **a persistent PostgreSQL is required** and serverless releases must run migrations at release (`SchemaNotMigratedError`)                                                                                                                                                                                                                                                                                                                 | `AN AGENTS.md:200–207`; §4.4 item 6                                                                                              |
| "All current and future app templates" free (pricing)                                           | Templates are MIT in the repo, but three are **hidden** (tasks, crm, factory) and one is empty (videos)                                                                                                                                                                                                                                                                                                                                                                    | `AN packages/shared-app-config/templates.ts:196–221`                                                                             |
| "Unlimited users … no credit meter" (pricing)                                                   | True for the framework. The hosted Clips app now meters a **free hosted allowance** (three clips by rollout flag, then "Connect storage")                                                                                                                                                                                                                                                                                                                                  | git `61089ee30`; `AN templates/clips/server/lib/video-storage.ts:282–316`                                                        |
| Builder.io "easy button" covers "agent tokens, storage, databases, deploys, and auth" (pricing) | Tokens: yes (Builder gateway engine and credits). Storage: yes ("Builder.io Hosting" for uploads, `docs file-uploads 129–131`). **Databases: no.** "Builder.io managed database … _Planned (not yet available)_" (`docs server-database 119–121`). Deploys: partial ("Builder Cloud-hosted apps", changeset `8fbccb3`; "Build online" goes to Fusion). Auth: not verified                                                                                                  | —                                                                                                                                |
| "or configure another all-in-one provider within your app settings" (pricing)                   | **Not found.** A search for "all-in-one" finds only the pricing page itself (`AN packages/docs/app/routes/pricing.tsx:163`), and I found no generic "all-in-one backend provider" abstraction; the managed services named in the docs are all Builder.io **(inference, limited search)**                                                                                                                                                                                   | —                                                                                                                                |
| "There's a free forever" / "no paid plans" (pricing, terms)                                     | Consistent: the repo has no billing code for hosted apps that I found. The "free credits" are Builder.io's (`8e8419361`, `2d994c1a9`)                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                |
| Desktop app with Stable and Nightly for mac/win/linux (download)                                | Yes. electron-builder targets and GitHub-release publishing; `desktop-release.yml` and `desktop-canary.yml`; update feed `api/desktop-updates`. **Minor mismatch:** the page labels the Linux archive `tar.gz` (`AN packages/docs/app/routes/download.tsx:117`), while electron-builder builds `tar.xz` (`AN packages/desktop-app/electron-builder.yml:86–88`) and the server classifies `.tar.xz` assets (`AN packages/docs/server/routes/api/desktop-latest.spec.ts:24`) | —                                                                                                                                |
| Skills "Works with Claude Code, Codex, Cursor, Pi, OpenCode, GitHub Copilot" (skills)           | Plausible. `skills/` + `.agents/plugins/*` + `.claude-plugin/marketplace.json`; `skills add` CLI in `AN packages/core/src/cli/skills.ts`. Per-client installation not verified                                                                                                                                                                                                                                                                                             | —                                                                                                                                |
| "Builder.io operates the hosted … applications" (about)                                         | Consistent with the repo (Builder Netlify deploy workflows, `*.agent-native.com` hosts), but **the Terms, Privacy and AI Terms never name the operator**                                                                                                                                                                                                                                                                                                                   | Legal pages                                                                                                                      |
| Apps are "alpha" (site) vs "beta by mid-October" (docs)                                         | Docs target missed (§5.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                |
| Brain is public in the catalogue (`core: true`, `defaultAgent: true`)                           | Yes in code, but **absent from `/apps/`**                                                                                                                                                                                                                                                                                                                                                                                                                                  | `AN packages/shared-app-config/templates.ts:84–97`                                                                               |

### 5.3 The stability promise compared with actual churn

The promise (`docs versioning-and-stability`, which matches the live page exactly):

1. "Every three hours, a scheduled run publishes a nightly snapshot" (`:14–17`). **Holds**: cron `17 */3 * * *`, 52 nightlies in 9.5 days.
2. "Scheduled runs prepare patch releases Monday through Thursday at noon Pacific time" (`:19–23`). **Outdated**: a Friday 10:00 PT schedule has existed since 2026-09-25 (`AN .github/workflows/release-everything.yml:7–8`; git `567797bad`). 0.209.2 shipped on Friday 10-16, and 0.207.0 on Sunday 10-11 by manual dispatch.
3. "Before 1.0, patch releases are intended for bug fixes and compatible improvements. Minor releases may add capabilities and may change behavior or APIs" (`:27–31`). **Mostly held at release level.** The one explicit API break shipped in a minor (0.210.0). But 0.209.1, a patch release, introduced `defineStore()` with a deploy-failing `SchemaNotMigratedError` and made `getDbExec()` always schema-guarded, which is a behaviour change in a patch **(inference)**. Four minors shipped in six working days.
4. "When a framework package moves an import or renames an export, its `migration-manifest.json` records the supported migration" (`:33–41`). **True but narrow**: the manifest is unchanged since 0.206.0 even though a public signature broke. Codemods cover moves and renames, not signature or behaviour changes.
5. "The create CLI pins the scaffolded `@agent-native/core` dependency to the exact version that supplied the template" (`:47–52`). **True for core, toolkit, agentkit and otel** (`AN packages/core/src/cli/create.ts:2224–2231`). Other `workspace:` dependencies become `"latest"` (`:2232–2233`). `getCoreDependencyVersion()` falls back to `"latest"` if it cannot read its own version (`:4040–4047`), which is the silent-coercion pattern the repo bans (`AN AGENTS.md:86–92`) **(inference)**.
6. "The current targets are beta by mid-October 2026 and 1.0 by the end of 2026" (`:56–58`). **Missed or overdue as of 2026-10-20**: the site labels every app alpha, the npm `beta` dist-tag is two months stale, and no commit or changeset in the window declares beta.
7. `package-lifecycle` (`docs package-lifecycle 90–117`): "When a path is removed, its tombstone module remains in the package long enough to throw an actionable error"; `doctor --only migration-manifest` "has no opt-out". These match the manifest mechanism. `versioning-and-stability` adds: "There is no fixed tombstone retention period" (`:43–45`).

Churn in numbers for the window: 7 stable releases (4 minor); 243 CHANGELOG entries for 0.207–0.210 (13,122 words); about 6–9 behaviour-changing items an app author must read (§4.4); +10 export subpaths and +6 runtime dependencies in core.

---

## 6. Licence and third-party material

**What it is.** MIT for all first-party code, plus a small set of bundled third-party assets under their own licences.

**How it works.**

- **Root `LICENSE`**: the standard MIT text, "Copyright (c) 2026 Builder.io, Inc." (`AN LICENSE:1–21`). Added 2026-10-19 by Alice Alexandra Moore in git `0cfbd4dde`. The commit message: "The README and 17 package manifests say MIT, but no license text existed outside the VS Code extension, and the root package.json said ISC. Add the standard MIT LICENSE … at the root and in each package that declares MIT so npm tarballs carry it." The changeset ships it with the next release ("Include the MIT license text in the published package", CHANGELOG 0.210.0 `0cfbd4d`).
- **Per-package `LICENSE`** (15 packages) in agentkit, code-agents-ui, core-corpus, core, creative-context, dispatch, embedding, migrate, otel, pinpoint, recap-cli, scheduling, shared-app-config, skills and toolkit. `packages/vscode-extension/LICENSE.md` ("Copyright (c) Builder.io") predates it. `frame` declares MIT but is private and has no `LICENSE` file. The browser extensions, desktop app, mobile app and docs have no `license` field. Templates and community templates have no licence field or file; the root `LICENSE` covers them as repository content **(inference)**.
- **Third-party material shipped in core.**
  - `packages/core/third-party-licenses/TABLER-ICONS.txt`: MIT, "Copyright (c) 2020-2026 Paweł Kuna". Added 2026-10-15 in git `69ad14185` when Tabler SVG paths were inlined into the workspace-deploy directory page (`workspace-deploy.ts` gained `WORKSPACE_DIRECTORY_ICON_PATHS` and `workspaceDirectoryIconSvg()`). Shipped through `"files": [… "third-party-licenses" …]` (`AN packages/core/package.json:28`).
  - Fonts under the **SIL Open Font License 1.1**: Geist (`LICENSE_GEIST`), Liberation (`LICENSE_LIBERATION`, Red Hat / Google), Noto Naskh Arabic (`LICENSE_NOTO_NASKH_ARABIC`) in `packages/core/src/assets/fonts/`, shipped through `"src/assets/fonts/LICENSE_*"`. `templates/calendar/assets/fonts/LICENSE_LIBERATION` duplicates one of them.
  - The 0.210.0 tarball contains `package/LICENSE`, `package/third-party-licenses/TABLER-ICONS.txt` and the three font licences.
- **Third-party components with other or no licence, called out in the rules.** "the optional local Clay CLI/MCP plugin … must not be required, auto-installed, or vendored by default. Its public repository currently declares no license" (`AN AGENTS.md:245–250`).
- **Hosted-service legal layer (separate from MIT).** The Terms, AI Terms and Privacy policy apply to hosted services only and repeatedly carve out "the framework source code, forks, customized applications, private deployments, or self-hosted versions" (https://www.agent-native.com/terms/ §intro, §4, §5.2).

**Principle.** The licence must travel _in the artifact_, not just in a manifest field. That is the stated reason for git `0cfbd4dde` ("so npm tarballs carry it").

**Gaps.** No NOTICE or third-party inventory covers the npm dependencies. Copied-in snippets other than the Tabler paths are not inventoried; I did not audit for them **(not verified)**.

---

## 7. Corrections to, and changes since, the earlier trainm8 notes

| Earlier note said                                                                                                                  | Now                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "There is **no root `LICENSE` file** … root `package.json` … `"license": "ISC"`" ([agent-native.md](../agent-native.md) §4; [open-stack](../agent-native-open-stack.md) §7.2)             | Root `LICENSE` and per-package files added and root licence set to MIT on 2026-10-19 (git `0cfbd4dde`). The 0.210.0 tarball ships `LICENSE` and `TABLER-ICONS.txt`                                                                       |
| "17 packages declare MIT; 16 are publishable" ([open-stack](../agent-native-open-stack.md) §7.2); §2.1 lists embedding and code-agents-ui among the public packages | The npm publish allow-list has **11** packages (`AN scripts/public-package-names.ts`). `code-agents-ui`, `embedding`, `migrate` and `shared-app-config` are workspace-only (`AN scripts/guard-public-packages.ts`) and return 404 on npm |
| "About 80 `guard-*` scripts run in CI" (§2.12)                                                                                     | 92 registered guards (89 at the base); 83 non-test `guard-*` files; a few guards are `sync-*.ts --check`                                                                                                                                 |
| "1,209 co-located `*.spec.ts(x)` files in `packages/core/src`"                                                                     | Correct at the base; 1,314 at HEAD                                                                                                                                                                                                       |
| 7,301 commits, 87 authors                                                                                                          | 7,707 commits, 94 authors                                                                                                                                                                                                                |
| Since 2026-09-11, Sewell 69%                                                                                                       | In the nine days since the base, 52.7% (214/406); Alice Alexandra Moore 20.9%                                                                                                                                                            |
| Release cadence "Monday to Thursday" (§4, quoting the docs)                                                                        | The workflow has also run Friday 10:00 PT since 2026-09-25; it is the docs that are stale                                                                                                                                                |
| Core tarball 32.5 MB                                                                                                               | 0.210.0: 35.0 MB, 4,582 files                                                                                                                                                                                                            |
| Stars "7.1k" (unverified)                                                                                                          | The site badge reads 7.5k (still unverified)                                                                                                                                                                                             |
| Composable mini-apps over A2A as the house style (implied by `AGENTS.md` at the base)                                              | Reversed: local actions by default, A2A only for peer-exclusive needs (git `7c4669b17`)                                                                                                                                                  |
| `CHANGELOG.md` "still opens with a `## 1.0.0` section above `0.206.0`"                                                             | Still true at HEAD, now above `0.210.0` (`AN packages/core/CHANGELOG.md:3–52`)                                                                                                                                                           |

---

## Principles list

1. **One action surface for every client.** "One action powers every app surface: UI, agent, HTTP, MCP, A2A, and CLI" (`AN README.md:50`; `AN PRODUCT.md:19`).
2. **Small invariant file, deep skills.** "Keep this file small: the rules below are the invariants, and `.agents/skills/*` carries the workflow" (`AN AGENTS.md:5–7`), enforced by word budgets (`AN scripts/guard-doc-budgets.mjs:4–15`).
3. **One canonical instructions file; symlink the rest.** (`AN .agents/skills/writing-agent-instructions/SKILL.md:92–97`).
4. **Write for retrieval within a hard prompt budget.** A template `AGENTS.md` is cut at 6,000 characters; skills list second (`AN .agents/skills/writing-agent-instructions/SKILL.md:40–62`).
5. **Loud, typed failure over plausible defaults.** (`AN AGENTS.md:86–92`; `AN scripts/guard-no-silent-coercion.mjs:1–25`).
6. **A guard that inspected nothing must not pass.** Three-outcome exit codes (`AN AGENTS.md:149–154`).
7. **Stop the habit from spreading before fixing the backlog.** Diff-scoped guards (`AN AGENTS.md:138–145`).
8. **Mechanism over guidance, and only where guidance demonstrably fails.** Measured by the friction report; "No key, no rule"; delete the prose a mechanism replaces (`AN AGENTS.md:176–191`).
9. **Hooks only for what reading cannot prevent.** The file lease between concurrent agent sessions (`AN AGENTS.md:160–168`).
10. **Fix at the owning boundary; sweep siblings.** (`AN AGENTS.md:93–95`; `AN .agents/skills/fix-at-the-boundary/SKILL.md`).
11. **Verify before done, at the cheapest tier that can fail.** (`AN .agents/skills/verifying-changes/SKILL.md:42–58`; `AN .agents/skills/adding-tests-and-ci/SKILL.md:33–45`).
12. **Autonomy by default; ask only for credentials, user-only decisions or destructive actions.** (`AN AGENTS.md:71–77`; `AN .agents/skills/reporting-progress/SKILL.md:20–45`).
13. **CI scope is a shared-cost decision made in one place.** (`AN .agents/skills/adding-tests-and-ci/SKILL.md:16–31`).
14. **Releases are bot-only and cryptographically gated; nightlies never move `latest`.** (`AN .github/workflows/auto-publish.yml:3–21,85–125`).
15. **Schema changes are additive and owned by stores, applied at release, never at cold start.** (`AN AGENTS.md:266–271,279–283`; `AN packages/core/src/db/store-registry.ts:1–13`).
16. **Docs are regression-tested like code.** (`AN packages/core/src/docs-false-claims.guard.spec.ts:7–22`).
17. **Upgrade dependencies, never patch them.** (`AN AGENTS.md:83–85`).
18. **Supply-chain quarantine.** 24 h `minimumReleaseAge`, an install-script allow-list and SHA-pinned Actions (`AN pnpm-workspace.yaml:9–21,91–127`).
19. **Licence text travels in the artifact.** (git `0cfbd4dde`).
20. **Keep work local; cross-app (A2A) delegation only for peer-exclusive needs.** (`AN AGENTS.md:251–255`).

## Docs vs code

1. `DEVELOPMENT.md:114` says "`pnpm run fmt` … Format all files with Prettier". The script is `oxfmt --write .` (`AN package.json:29`), and `AGENTS.md:319` says "Run oxfmt".
2. `DEVELOPMENT.md:48–63,69` lists 12 packages and 13 templates. It omits agentkit, toolkit, core-corpus, otel, skills, recap-cli, creative-context, both browser extensions, browser-control-extension-core and vscode-extension, and the tasks, crm, factory and videos templates.
3. `PRODUCT.md:28,39` claims "backend-agnostic hosting" and "backend-agnostic database support". The code and `AGENTS.md:200–207` are PostgreSQL-only. (Flagged earlier; unchanged.)
4. `registry/agent-native-app/AGENTS.md:10` says "Keep schemas provider agnostic". The root `AGENTS.md:203` says "Keep schemas PostgreSQL-specific". The shadcn registry therefore ships the contradicted rule to outside apps.
5. `docs versioning-and-stability 21` says scheduled releases run "Monday through Thursday". The workflow also runs Fridays (`AN .github/workflows/release-everything.yml:7–8`).
6. `docs versioning-and-stability 56–58` says "beta by mid-October 2026". On 2026-10-20 nothing is beta: the site labels apps alpha and the npm `beta` tag is stale.
7. `docs versioning-and-stability 33–35` implies breaking changes come with manifest-driven migrations. The 0.210.0 `recordActionAudit` signature break has no manifest entry; the manifest is unchanged since 0.206.0.
8. The pricing page says the Builder backend covers "databases". `docs server-database 119–121` says the managed database is "Planned (not yet available)".
9. The pricing page says "configure another all-in-one provider within your app settings". No such provider abstraction was found in code **(inference)**.
10. The download page labels the Linux archive `tar.gz` (`AN packages/docs/app/routes/download.tsx:117`); the build produces `tar.xz` (`AN packages/desktop-app/electron-builder.yml:87`).
11. `AGENTS.md:42` says "Never add Co-Authored-By". 33 commits since 0.206.0 (and 756 all-time) carry AI co-author trailers or bot authorship, and no guard enforces the rule.
12. Release commit titles say "(patch)" while the releases are minors (for example 0.208.0, 0.210.0).
13. The About page says Builder.io operates the hosted services; the Terms, Privacy and AI Terms never name the operator.
14. `docs versioning-and-stability 47–52` says the CLI pins the core version. It does, but falls back to `"latest"` silently if it cannot read its own version (`AN packages/core/src/cli/create.ts:4046`), and non-core workspace dependencies scaffold as `"latest"` (`:2232–2233`).
15. The website `/apps/` page omits Brain, although the catalogue marks it public, `core: true` and `defaultAgent: true` (`AN packages/shared-app-config/templates.ts:84–97`).

## Not verified

- GitHub stars (the site badge says 7.5k). The GitHub API was not enabled for this session.
- Whether `Security guards` and other CI jobs are _required_ status checks on `main`. `AN DEVELOPMENT.md:165–167` says they must be added to the ruleset; the repository settings are not visible.
- How much of the top author's work is agent-written. This is an inference from the rules, skills and commit shapes (§3.9); trailers give only a floor.
- Whether Builder.io's backend provides auth and deploys as the pricing page says. Only tokens and upload storage are documented in the repo docs.
- The per-client install behaviour of `skills add` across Claude Code, Codex, Cursor, Pi, OpenCode and Copilot.
- The content of `.github/skills/impeccable` and of `~/.agents/skills/impeccable`, which the hooks reference but the repo does not contain.
- The full LOC diff by file type beyond core (§4.1 uses `git diff --numstat`, which counts generated files).
- Whether any other third-party code is inlined beyond Tabler icon paths and fonts.

## Open questions

1. Will the beta milestone be re-dated in the docs, or declared? Nothing in the window addresses the missed "mid-October" target.
2. Is the A2A demotion (git `7c4669b17`) the start of a wider retreat from the "composable mini-apps" model in the docs (`composable-mini-apps` skill, A2A docs), or only a default for template agents?
3. Will signature-level breaks (such as `recordActionAudit`) get codemods or doctor checks, or does the manifest stay limited to moves and renames?
4. Who operates the hosted services in legal terms? The Terms leave "we" unnamed while the About page names Builder.io.
5. Is the hosted Clips allowance the first step toward metered hosted apps, given that the Terms say "no paid plans" and the pricing page says "no credit meter"?
6. How sustainable is a 92-guard, 46-workflow, ~72 k-test-case regime for outside contributors? The new `community-prs` skill suggests the maintainers see outside PRs needing staff ownership to land.
7. Will the extremely detailed agent-written CHANGELOG entries (up to 6,048 characters each) be summarized for app authors? At present the breaking items are buried inside long paragraphs.
