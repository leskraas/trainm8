# Appendix 05 — The toolkit and the templates: how a real agent-native app is put together

> **Appendix to [agent-native-deep-dive.md](../agent-native-deep-dive.md).**
> Core, Toolkit and templates; kits, adapters and ejection; how apps take
> framework updates; Mail and Calendar end to end, Plan in part. Read at
> agent-native commit `a03f638` (2026-10-20, `@agent-native/core` 0.210.0);
> compiled 2026-10-20. Citations as in the main document.

- Repo: `BuilderIO/agent-native` at HEAD `a03f638` (2026-10-20, `@agent-native/core` 0.210.0,
  `@agent-native/toolkit` 0.210.0), read-only clone. "Since 0.206.0" means
  `git 1284000325bf..HEAD` (2026-10-11 → 2026-10-20).
- Docs read in full from `packages/core/docs/content/*.mdx`: `agent-native-toolkit`, all 15
  `toolkit-*` pages, `creating-templates`, `custom-design-system`, `docs-components`, every
  `template-*` overview page (13) and every `template-*-developers` page (12), plus
  `syncing-template-changes`, `package-lifecycle`, `blueprint-installer`, `cloneable-saas`.
  The `template-*-features/-agent/-integrations` pages were skimmed (grep for approval,
  undo, preview, restore, review), except Mail's and Calendar's, which were read in full.
- Code traced: `packages/toolkit`, `packages/shared-app-config`, `packages/skills`,
  `packages/core/blueprints`, `packages/core/src/cli/{eject,template-sync,template-baseline,
  template-layer,add,workspace-skill-policy}.ts`, `templates/mail` and `templates/calendar`
  end to end, `templates/plan` partly, `community-templates/`, and the monorepo guards in
  `scripts/` that hold templates to one shape.
- Live site spot checks: `docs/template-mail-developers`, `docs/toolkit-sharing`,
  `docs/syncing-template-changes` match the repo text (including the errors noted in
  "Docs vs code").
- Citation forms: `AN path:L–L` (repo at `a03f638`), `docs <slug> L–L`, `git <sha>`, URLs.
  **(inference)** marks my own reasoning.

---

## 0. The five things that matter most

1. **A template is a domain app built from three kinds of code, and only one kind is
   really "the app".** Framework code lives in `node_modules` (`@agent-native/core`,
   `@agent-native/toolkit`). A second layer is *copied into* each template and kept in sync
   by monorepo scripts: 17–22 framework skills, `_gitignore`, `learnings.defaults.md`,
   one-line UI adapter files, and the standard plugin files. The app-owned part is
   `actions/`, `server/db/schema.ts` and its migrations, `app/` screens, the domain skills,
   `AGENTS.md` and the agent-chat system prompt. The repo states this split itself:
   "actions/ (app-specific operations)", "drizzle schema", "app/ UI", "app-specific skills"
   are the surfaces that are "never standardized" (`AN scripts/template-standard/manifest.ts:16–23`).
2. **The agent "sees the screen" through a 3-hop pipe: UI → `navigation` app-state →
   the template's own `view-screen` action → `<current-screen>`.** The framework runs the
   template's `view-screen` action before every turn and injects its output, capped at
   10,000 characters (`AN packages/core/src/agent/production-agent.ts:13177–13210, 2273`).
   So each template decides what "the screen" means: Mail adds the open thread, a bounded
   list of 10 rows and coverage flags; Calendar adds up to 50 visible events and any open
   invite draft.
3. **Safety is per-action and domain-specific, not a framework default.** Mail gates every
   real send behind `needsApproval` unless an automation owner opted in, queues
   teammate requests instead of sending, claims rows before sending, and parks a scheduled
   send it cannot prove as `uncertain` rather than retrying it. Calendar asks for approval
   only when **other people** would be notified, and bulk deletes need a `dryRun` preview
   first. Plan requires `expectedUpdatedAt` plus `allowDestructive` for destructive
   rewrites. None of these is inherited: each template wrote its own. One caveat: the user
   can "Always allow" a gated tool, which turns the gate off unless the action sets
   `allowPersistentApproval: false`.
4. **The Toolkit is mostly presentation. The state, access checks and actions live in Core,
   and adoption across templates is uneven.** Toolkit's own README: Core "owns the
   foundational runtime contracts"; Toolkit "owns reusable app-building surfaces"
   (`AN packages/toolkit/README.md:5–11`). Several kits the docs present as standard are
   unused by the flagship templates. No template calls `registerVersionedResource` (the
   History Kit); Content, Design, Slides and Plan each keep their own `*_versions` table.
   Mail and Calendar each hand-roll their own `use-undo.ts`. The Review kit is used by
   Design and Content but not by Plan, which has its own comments.
5. **Upgrades take three separate paths.** (a) `upgrade` moves package versions and runs
   codemods. (b) `template sync` does a real three-way `git merge-file` of scaffolded files
   against a pristine baseline stored as a git ref. (c) `eject` copies a Toolkit unit into the
   app with hash-checked provenance in `agent-native.ejections.json`. Inside the monorepo, the
   templates never "upgrade": they use `workspace:*`, and CI guards fail on drift.

Surprises: Mail's scaffolded `undoSendDelay: 5` setting is never read. Template docs promise
behaviour ("No dialog needed") that the code qualifies or contradicts (see "Docs vs code").
We noted security-relevant gaps in Mail's send path; they are recorded separately in
a private note.

---

## 1. The layering: Core, Toolkit, Templates

### What it is

Three layers with a strict dependency direction: Core (runtime contracts) ← Toolkit
(reusable UI and product surfaces) ← Templates (complete domain apps). Toolkit and Templates
are optional.

### How it works

- **Docs framing.** "Core is the framework. Toolkit is an optional shelf of reusable pieces
  for the framework. Templates are optional apps built on Core; they can use Toolkit and can
  be forked and used as complete starting points" (`docs agent-native-toolkit 73–76`).
  "Core - the framework … Toolkit - optional reusable pieces … Templates - optional apps"
  (`docs creating-templates 19–26`).
- **Package boundary, in code.** `@agent-native/toolkit` 0.210.0 publishes **86 export
  subpaths** (`AN packages/toolkit/package.json` `exports`). Two families:
  - *Core-free presentational* entry points: `./ui/*`, `./sharing`, `./collab-ui`,
    `./chat-history`, `./data-grid`, `./dashboard`, `./editor`, `./canvas-*`,
    `./design-system`, `./conformance`, `./context-ui`, `./hooks/*`, `./provider`.
  - *Runtime-backed* `./app/*` entry points (`app/chat`, `app/settings`, `app/org`,
    `app/sharing`, `app/review`, `app/progress`, `app/observability`, `app/auth/server`, …),
    which call Core's public runtime APIs.
  - Core is an **optional peer** (`"@agent-native/core": ">=0.205.1"`, `optional: true`).
    Toolkit carries 88 runtime dependencies, including 27 Radix packages, assistant-ui, Tiptap
    and recharts (`AN packages/toolkit/package.json`).
  - README: "`@agent-native/toolkit/ui/*` and the other presentational surfaces stay
    Core-free. Runtime-backed React surfaces live under `@agent-native/toolkit/app/*`; those
    entrypoints use Core's public runtime APIs and declare Core as an optional peer
    dependency" (`AN packages/toolkit/README.md:12–19`). A CI guard named
    `guard:toolkit-must-not-import-core` exists (`AN package.json` scripts). A grep of
    `src/` outside `src/app/` finds `@agent-native/core` only inside a code comment in
    `src/composer/TiptapComposer.tsx:1838`, so the claim holds.
- **Source size.** About 304 k lines of non-test TS/TSX in `packages/toolkit/src`, measured
  with `wc`.

### Principle

"Use a toolkit when the behavior repeats across apps and users expect it to feel standard:
sharing, settings, teams, comments, history, and agent progress should not be slightly
different in every template. Keep domain-specific data, workflows, labels, and visual styling
in the app" (`docs agent-native-toolkit 201–206`). The coding-agent skill puts it as a
test: move behaviour into the toolkit when it is "workspace-wide", "agent-visible",
"governed", "repeated by two or more apps", and "not tied to one domain model"
(`AN templates/mail/.agents/skills/agent-native-toolkit/SKILL.md:18–34`).

### Changes since 0.206.0

About 70 commits touched `packages/toolkit`, mostly fixes. Notable ones: approvals bound
to a tool revision (`git ce015590d`); an A/B-tested "free credits" first-run offer
(`git 8e8419361`, `git 2d994c1a9`); MIT `LICENSE` files added to packages (`git 0cfbd4dde`).

### Gaps

- "Optional" is relative. Every first-party template imports `app/*` Toolkit surfaces
  (auth plugin, settings, chat). Leaving Toolkit out means rebuilding settings, the auth UI
  and the agent sidebar **(inference)**.

---

## 2. Toolkit kits: what each one actually owns, and who uses it

### What it is

A catalogue of 16 "product kits" (`docs agent-native-toolkit 90–110`). Each kit splits
into a Core part (tables, actions, access) and a Toolkit part (React views). Apps "usually
wrap both through local adapters" (`docs agent-native-toolkit 146–152`).

### How it works (kit by kit, verified where noted)

| Kit | Core side (runtime) | Toolkit side (UI) | Verified in code | Template adoption at HEAD |
|---|---|---|---|---|
| UI primitives | — | `@agent-native/toolkit/ui/*` shadcn-style on Radix | `AN packages/toolkit/src/ui` | Every template, through `app/components/ui/*` one-line adapters |
| Sharing | `ownableColumns()`, `createSharesTable()`, `registerShareableResource()`, `accessFilter`, share actions | `ShareButton`, `ShareDialog`, `VisibilityBadge` | `AN packages/core/src/sharing/schema.ts:3–50`, `registry.ts:11–184` | Calendar (`booking-link`), Forms, Content, Design, Slides, Plan, Clips, Brain |
| Collaboration | `createCollabPlugin`, Yjs sync, awareness | `PresenceBar`, `LiveCursorOverlay`, `RecentEditHighlights` | `AN packages/core/src/server/collab-plugin.ts:77–216` | Content, Slides, Design |
| History | `registerVersionedResource`, version actions, audit log | **none**: "Toolkit does not ship a drop-in history panel" (`docs toolkit-history 8`) | `AN packages/core/src/history/registry.ts:17–26` | **No template calls `registerVersionedResource`** (grep). Content, Design, Slides and Plan each have their own `*_versions` table |
| Comments & Review | `registerReviewableResource`, `list-/create-/reply-/resolve-/delete-review-comment`, `consume-review-feedback`, `set-review-status` | `ReviewThreadPanel`, `ReviewStatusBadge` | `AN packages/core/src/comments-review/index.ts` re-exports `../review` | Design (`server/plugins/review.ts`), Content. **Plan has its own** `plan_comments` and actions |
| Settings | Settings actions, the `settings-view` app-state key, the `open-settings-page` tool | `SettingsTabsPage`, `registerSettingsPages`, `CORE_SETTINGS_PAGES` | `docs toolkit-settings 50–206` | All templates, through a `settings.tsx` plus `settings.$.tsx` splat |
| Org & Team | `/_agent-native/org/*`, role helpers, `defineAppRoles` | `OrgSwitcher`, `TeamPage`, `RequireActiveOrg`, `OrgMembersPage` | `AN packages/toolkit/src/app/org/TeamPage.tsx`, `RequireActiveOrg.tsx`; hooks in `AN packages/core/src/client/org/hooks.ts:62–731` | All templates |
| Setup & Connections | `registerOnboardingStep`, workspace connections, secrets | `SetupConnectionsPage`, `ProviderReadinessBadge` | `docs toolkit-setup-connections 38–97` | Mail and Calendar register onboarding (`server/onboarding.ts`) |
| Command & Navigation | `createNavigateAction`, `createViewScreenAction`, `buildDeepLink`, `buildSettingsRoute` | `CommandMenu` | `AN packages/core/src/command-navigation/index.ts:1–3` | Mail and Calendar write **their own** `navigate`/`view-screen` actions instead of using the factories |
| Agent UX | approvals, runs API | `PromptComposer`, `RunsTray` (polls `/_agent-native/runs`), `AgentSidebar` | `AN packages/toolkit/src/app/progress/RunsTray.tsx:115` | All templates (sidebar) |
| Observability | traces, feedback tables | `ObservabilityDashboard` (tabs overview, review, conversations, evals, experiments, feedback), `ThumbsFeedback` | `AN packages/toolkit/src/app/observability/ObservabilityDashboard.tsx:3165–3189` | Every template mounts `/observability` (`docs template-chat-developers 207–210`) |
| Resources | resource tables, local file mode | `ResourcesPanel`, `ResourceTree` | `docs toolkit-resources 24–101` | Agent panel "Resources" tab |
| Context & Knowledge | Context X-Ray engine (Core) | `ContextXRayPanel`, `ContextMeterView` | `docs toolkit-context-knowledge 21–62` | Framework chrome |
| Data grid | — | `DataGrid` ("does not fetch data, call actions, resolve credentials, or persist edits") | `docs toolkit-ui 125–143` | Content `DatabaseView.tsx` |
| Dashboard | `@agent-native/core/dashboard-storage` | `@agent-native/toolkit/dashboard` ("never fetches data") | `docs agent-native-toolkit 128–142` | Analytics |
| Editors & canvases | Blocks schema (Core) | `SharedRichEditor`, `createSharedEditorExtensions`, canvas interactions and annotations | `docs toolkit-editors-canvases 31–123` | Content, Slides, Design, Mail (compose) |
| Capability modules | separate npm packages | — | `AN packages/scheduling/agent-native.package.json`: 66 actions, 10 required secrets, 11 skills listed under `docs.skills`; creative-context: 35 actions, 13 secrets | Calendar depends on `@agent-native/scheduling` (`AN templates/calendar/package.json:22`) but still keeps its own booking tables (§9.3) |

### Principle

"Kits are product surfaces first. Some pieces are runtime-backed (`@agent-native/core`),
some are presentation primitives (`@agent-native/toolkit`), and apps usually wrap both
through local adapters … design the user-facing settings, collaboration, sharing, team,
review, and setup experiences as one coherent kit instead of exposing package boundaries in
the app" (`docs agent-native-toolkit 146–152`). The presentational parts "do not query,
authorize, persist, or route" (`docs toolkit-agent-ux 46`). "Do not treat a presentation
component as an authorization boundary" (`docs toolkit-context-knowledge 73–74`).

Each kit page ends with a "UX Standard". Three of them are domain-relevant rules:
- History: "Restore is a new action, not a silent database rewind"; "History should
  identify human vs agent edits" (`docs toolkit-history 72–79`).
- Review: "`consumedAt` and `resolved` are separate. An agent can consume a piece of feedback
  without closing the reviewer-visible thread"; "The root comment owns routing"
  (`docs toolkit-comments-review 98–109`).
- Agent UX: "Approval prompts should name the action, data, and risk before proceeding";
  "Long-running work belongs in the runs tray, not as a frozen composer spinner"
  (`docs toolkit-agent-ux 91–97`).

### Gaps

- The History and Command-navigation kits are documented as standard but the flagship
  templates do not use them (table above). The pages read like a target state
  **(inference)**.
- `useLocalOpUndo()` (`docs toolkit-collaboration 33`, `toolkit-history 31`) lives in
  `AN packages/core/src/collab/undo.ts`. No template imports it (grep). Mail and Calendar
  each have their own `app/hooks/use-undo.ts` with different semantics (§8.7, §9.7).

---

## 3. App adapters, the provider seam and the design-system bridge

### What it is

How a template can restyle shared UI without forking it. The ladder has four rungs:
theme tokens, semantic components, product slots, eject.

### How it works

1. **Local adapter files.** Template code imports `@/components/ui/button`, never the
   Toolkit path. Most adapters are a single line: `export * from "@agent-native/toolkit/ui/button";`
   (`AN templates/mail/app/components/ui/button.tsx:1`; `docs toolkit-ui 46–81`). Mail ships 17
   adapters (`AN templates/mail/app/components/ui/`).
2. **Provider overrides.** Toolkit components read overridable primitives from
   `ToolkitProvider`. Mail wires both the legacy and the new API:
   ```tsx
   const components: ToolkitComponents = { Button: Button as ToolkitComponents["Button"] };
   export function AppToolkitProvider({ children }: { children: ReactNode }) {
     return (
       <ToolkitProvider components={components} designSystem={designSystem}>
         {children}
       </ToolkitProvider>
     );
   }
   ```
   (`AN templates/mail/app/components/ui/toolkit-provider.tsx`.) "When both APIs provide the
   button, `designSystem.components.ActionButton` wins" (`docs toolkit-ui 115–121`).
3. **Semantic design-system bridge.** `defineTheme` produces build-time tokens. The Core Vite
   plugin turns them into `virtual:agent-native-theme.css`. `defineDesignSystem` maps
   **17 semantic contracts**: 9 leaf (`ActionButton`, `IconButton`, `TextField`, `TextArea`,
   `Spinner`, `Skeleton`, `Status`, `Surface`, `Avatar`) and 8 behaviour (`Tooltip`, `Menu`,
   `Popover`, `Dialog`, `Picker`, `Checkbox`, `Switch`, `Tabs`) (`docs custom-design-system
   144–186`). Props are semantic: `intent` is `primary|neutral|danger`; `emphasis` is
   `solid|outline|ghost`. Partial adapters work, and "a per-component error boundary logs the
   failure and renders the default component for that control" (`docs custom-design-system
   103–106`). A conformance kit, `assertDesignSystemConformance`, checks all 17 exports
   (`:256–290`).
4. **Headless feature controllers and product slots.** "A controller owns state transitions,
   actions, tracking, and the view model; both the default view and a product slot consume
   that same controller" (`docs custom-design-system 211–216`). `BuilderConnectCard` and
   `ChatHistoryRail` are the first slices.
5. **v1 boundaries.** assistant-ui chat internals, Tiptap, cmdk, vaul, Recharts,
   react-day-picker and date pickers are *not* covered by the semantic contract
   (`docs custom-design-system 383–400`).
6. **Monorepo drift guard.** `ui-primitives-sync.spec.ts` keeps template adapters identical
   to the canonical primitives, except for an explicit allow-list with reasons. Examples:
   `["mail","sonner.tsx","uses Mail-specific toast visuals and actions"]`,
   `["forms","popover.tsx","uses wider collision padding for form-editor controls"]`
   (`AN packages/core/src/templates/ui-primitives-sync.spec.ts:7–110`).

### Principle

"Start with tokens, add semantic components where your system has an equivalent, use a
product slot for feature-level composition, and eject only the smallest unit that still needs
ownership" (`docs custom-design-system 35–37`). "Propose a new semantic component only when
the same meaning and behavior is useful across more than one feature"
(`docs custom-design-system 397–400`). "Agent-Native never scans dependencies, auto-detects a
library, or loads components from JSON" (`:41–43`).

### Gaps

- Toolkit is Radix plus shadcn. A Base UI design system can plug in only through the
  semantic adapters, and the composer, chat and editor internals stay out of scope in v1
  (`docs custom-design-system 383–395`). (Relevance to trainm8: ADR 0085 is Base UI.)

---

## 4. Customize or eject: units, provenance, restore

### What it is

A manifest-driven way to take ownership of one Toolkit feature's source while still taking
upgrades for everything else.

### How it works

- **Unit catalogue.** `AN packages/toolkit/agent-native.eject.json` (`manifestVersion: 1`)
  defines **54 units** in 3 catalogues (`toolkit-ui`, `remote-mcp-presets`,
  `setup-readiness-ui`). 52 units use `strategy: "source-copy"`; 2 are `protected-seam`
  (`toolkit/agentkit`, `toolkit/migration-metadata`). Each unit lists `entrypoints`,
  `sourceEntries`, `targetRoot` (usually `app/components/agent-native/toolkit`),
  `dependencies`, `verification` (for example `["pnpm typecheck"]`) and **`protectedImports`**.
  The protected imports are the Core runtime specifiers that stay package imports after
  ejection. `toolkit/app-settings` has 68 of them; `toolkit/app-chat` has 50.
- **Planner** (`AN packages/core/src/cli/eject.ts:596–710`):
  1. `collectSourceClosure` walks relative imports from the unit's `sourceEntries`.
  2. Each file is copied with package specifiers rewritten (`rewritePackageSpecifiers`).
  3. It refuses to overwrite an *untracked* existing file, or a tracked one whose content
     changed (`collisions`).
  4. It rewrites consumer imports across the app, recording `beforeHash`/`afterHash` per file.
  5. It writes an `EjectionRecord`
     `{ unit, source:{package, version, manifestDigest}, targets:[{path, source, hash}], importRewrites, dependencyRewrite? }`
     into `agent-native.ejections.json`.
- **Commands:** `eject --list | inspect <unit> | <unit> --app <a> [--apply] | diff | restore`.
  Every write command is a dry run until `--apply` (`docs agent-native-toolkit 154–190`;
  `docs package-lifecycle 27–73`). "Restore refuses when any ejected file or rewritten import
  has local edits" (`docs agent-native-toolkit 180–182`).
- **Whole-package lifecycle** (`agent-native package inspect|add|eject`) reads a static
  `agent-native.package.json` "without executing package code". `add` creates action
  re-export stubs, adds the schema export, copies skills and reports secret names. `eject`
  copies the package to `packages/<name>` and switches the dependency to `workspace:*`
  (`docs package-lifecycle 10–25, 119–132`). Safety: "stages the complete write set, uses
  atomic renames, snapshots package and lock files, and rolls back if the package-manager
  install fails"; "passes `--ignore-scripts`" (`:75–88`).
- **Coverage guard.** "The catalog is complete by construction; a missing first-party unit
  fails the release guard. Unknown third-party packages receive an add-style blueprint.
  Protected runtime contracts are not ejectable" (`docs agent-native-toolkit 184–190`).
  `blueprintFor(unit)` is at `AN packages/core/src/cli/eject.ts:1485`.

### Principle

"Adopt shared behavior in this order: configure the public component or adapter, compose
public primitives behind an app-owned wrapper, eject the smallest supported unit, then propose
a new shared seam when the same override appears in multiple apps"
(`docs agent-native-toolkit 156–159`). "Ejection transfers ownership; it does not fork Core
auth, actions, persistence, access checks, chat transport, or agent execution"
(`docs custom-design-system 253–254`).

### Changes since 0.206.0

`eject.ts`: no commits. `template-sync.ts`: one commit.

---

## 5. Blueprints: `agent-native add` (recipes for coding agents)

### What it is

Markdown recipes printed to stdout and meant to be piped into a coding agent:
`agent-native add provider stripe | claude` (`docs blueprint-installer 15–21`).

### How it works

- Files live in `packages/core/blueprints/<kind>/<name>.md` and are discovered at runtime from
  the directory listing (`AN packages/core/src/cli/add.ts:14–60`). Four ship today:
  `action/crud.md` (98 lines), `provider/stripe.md` (87), `channel/discord.md` (74),
  `sandbox/docker.md` (78).
- With a URL instead of a name, `add` emits a generic "research-and-integrate" blueprint that
  tells the agent to fetch the URL "not to guess from training data"
  (`docs blueprint-installer 94–102`).
- Every blueprint follows the same shape: goal and framing, "Read first", "Files to touch",
  "Framework rules to honor", "Verify" (`docs blueprint-installer 110–116`). Example
  (`AN packages/core/blueprints/action/crud.md`):
  > "Prefer one CRUD-style `update-<thing>` taking a patch of optional fields over N
  > per-field actions. One `create` / one `update` / one `delete` per resource." …
  > "No `/api/*` or Nitro pass-through route whose job is to call/repackage this action — that
  > violates the Architecture Contract." … "For ownable resources, confirm a non-owner cannot
  > read or mutate another user's row (access check fails closed)."

### Principle

"`agent-native add` is **not** a dumb scaffolder that writes files for you … the framework
supplies the recipe … and the coding agent does the editing"
(`docs blueprint-installer 15–17`).

### Changes since 0.206.0

None (`git log 1284000325bf..HEAD -- packages/core/blueprints` is empty). The last
substantive change was `git cc2a915ad` (2026-09-04).

---

## 6. How templates get framework updates

### What it is

Three independent mechanisms for apps generated outside the monorepo, plus a separate set of
sync scripts and guards for the first-party templates inside it.

### 6.1 Inside the monorepo (first-party templates)

- **No version pins.** Templates depend on `"@agent-native/core": "workspace:*"`, and likewise
  for `toolkit` and `otel` (`AN templates/mail/package.json` `dependencies`). A framework
  change reaches every template in the same commit.
- **Framework skills are copied, not linked.** The canonical skills live in the repo root
  `.agents/skills` (97 skill dirs). `scripts/sync-workspace-core-skills.ts` copies a
  policy-chosen subset into each template's `.agents/skills`, deletes stale framework skills,
  and runs in `--check` mode as `guard:workspace-skills` (`AN package.json` script;
  `AN scripts/sync-workspace-core-skills.ts:995–1018`). The policy is code:
  `STANDALONE_APP_SKILLS` (17 skills) plus `DOMAIN_TEMPLATE_EXTRA_SKILLS` (`external-agents`,
  `portability`, `self-modifying-code`, `turn-into-skill`, `workspace-conventions`) make up
  `DOMAIN_TEMPLATE_SHARED_SKILLS`, the default for domain templates
  (`AN packages/core/src/cli/workspace-skill-policy.ts:1–66`;
  `AN scripts/sync-workspace-core-skills.ts:116–135`). Chat, Clips, Dispatch and Factory get
  their own lists.
  - Verified: `templates/mail/.agents/skills/{actions,adding-a-feature,real-time-sync,
    context-awareness,storing-data,security}/SKILL.md` are byte-identical to
    `packages/core/src/templates/default/.agents/skills/…` (`diff -q`).
- **"Template standard" drift guard.** `pnpm guard:template-standard`
  (`AN scripts/template-standard/index.ts:1–15`) checks every template against a manifest:
  - byte-synced `learnings.defaults.md` and `_gitignore`;
  - `package.json` scripts `dev`, `build`, `typecheck` calling `agent-native …` and `test`
    calling `vitest`;
  - `tsconfig` extends `@agent-native/core/tsconfig.base.json`;
  - `server/middleware/auth.ts` imports `runAuthGuard`;
  - `server/routes/[...page].get.ts` imports `createH3SSRHandler`;
  - `CLAUDE.md` is a symlink;
  - `AGENTS.md` has no leftover `{{PLACEHOLDER}}`;
  - the vite dev port matches `shared-app-config`;
  - `workspace:*` ranges and version bands for `react-router`, `drizzle-orm` and `zod`.

  (`AN scripts/template-standard/manifest.ts:70–114`; rule names in
  `AN scripts/template-standard/checks.ts:32–343`.) It runs as a **ratchet**: known gaps sit in
  `scripts/template-standard-baseline.json` with notes ("Extended the shared scaffold with
  real app-specific learnings … intentional customization, not a gap to silently overwrite").
  "The guard only fails on NEW drift" (`AN scripts/template-standard-baseline.json`).
- **Other per-template guards that define the shape:**
  - `guard:agent-chat-context`: `AGENTS.md` ≤ **6,000 characters** (hard), warning at 5,500;
    `initialToolNames` ≤ **40** and a static string array, or `leanPrompt: true`
    (`AN scripts/guard-agent-chat-context.ts:5–9, 89–133, 296–308`). The 6,000 figure is the
    compact prompt cap in Core: `COMPACT_PROMPT_RESOURCE_MAX_CHARS = 6_000` (non-compact is
    `30_000`) (`AN packages/core/src/server/agent-chat/prompt-resources.ts:50–51`). Measured
    sizes: every template `AGENTS.md` is 3,965–6,025 bytes (`wc -c`).
  - `guard:no-action-twin-routes`: a `server/routes/api/**` route whose verb+noun matches an
    action fails CI, unless it is in a grandfathered ALLOWLIST "ratchet" (14 entries: 8 Mail,
    6 Analytics) or `CRUD_ROUTE_BASELINE` (Calendar 2, Clips 3, Content 3, Forms 1). Opt out
    per file with `// guard:allow-api-route — reason`. Plan is "fenced — separate team
    ownership" (`AN scripts/guard-no-action-twin-routes.mjs:1–53, 233–248`).
  - `guard:template-list`: `packages/shared-app-config/templates.ts` is the "SOURCE_OF_TRUTH"
    and `packages/core/src/cli/templates-meta.ts` the "CLI_DUPLICATE"
    (`AN scripts/guard-template-list.mjs:10–11`).
  - `auth-plugin-sync.spec.ts` and `ui-primitives-sync.spec.ts` under
    `packages/core/src/templates/`.
  - Template layers: the Builder Code starter is stored as **patches over `templates/chat`**
    (`template-layer.json` `{ base: "chat", delete: [...] }` plus `*.patch` files). "A patch
    whose context no longer matches the base fails the materialize instead of silently
    dropping the change" (`AN packages/core/src/cli/template-layer.ts:15–23`;
    `AN packages/core/src/templates/builder-code-starter/template-layer.json`; `git d9ab440d4`).

### 6.2 For generated apps: `create` → `upgrade` → `template sync` → `eject`

| Command | Moves | Mechanism |
|---|---|---|
| `create` | copies a template once | Downloads `templates/<name>` from GitHub at an immutable tag (`@agent-native/core@x.y.z`). Substitutes `{{APP_NAME}}` and `{{APP_TITLE}}`, renames `_gitignore`, pins `workspace:*` and `catalog:` to versions, and records provenance in `package.json` → `agent-native.scaffold` `{ template, frameworkSkills, templateRef, templateSource, coreVersion, shape }` (`docs syncing-template-changes 8, 70–89`; `AN packages/core/src/cli/create.ts:1337–1457, 3923–3928, 4641–4653`) |
| `upgrade` | `@agent-native/*` versions, imports, skills | Bumps to `latest`, installs, runs `skills update scaffold --project`, typechecks. `--codemods` rewrites imports from `migration-manifest.json`. "it never touches a file that was copied out of a template" (`docs syncing-template-changes 10, 28`; `docs package-lifecycle 90–117`) |
| `template sync` | files copied out of the template | Three-way merge per file (below) |
| `eject` | one framework unit into app source | §4 |

**Three-way merge mechanics** (`AN packages/core/src/cli/template-sync.ts`,
`template-baseline.ts`):
- **base**: the pristine template at the recorded `templateRef`, re-materialized through
  the same transforms. It is stored as a commit on
  `refs/agent-native/template-baseline/<app path>`, written with plumbing against a throwaway
  index (`GIT_INDEX_FILE`, `write-tree`, `commit-tree`, `update-ref`), so HEAD, the branch,
  the index and the work tree are never touched (`AN template-baseline.ts:110–150`). The
  refspec `+refs/agent-native/*:refs/agent-native/*` is added to the remote's fetch and push
  config so the baseline survives a clone (`:236–250`). Outside git, it falls back to a
  tarball under `.agent-native/`.
- **theirs**: the same template at the target ref.
- **ours**: the working tree.
- Each file goes through `git merge-file -p -L ours -L base -L theirs`
  (`AN template-sync.ts:350–378`). Upstream-unchanged files are left alone; files the user
  never touched fast-forward; files both sides changed get conflict markers.
- **Refuses** when the app dir has uncommitted changes, unless `--force` is passed
  (`:729`). The baseline advances only on a clean merge. `template accept` refuses while any
  `<<<<<<< ` marker remains (`:815–821, 955`).
- **Never merged:** `data/pglite`, `changelog/`, any `.env*`, `learnings.md`, lockfiles and
  scaffold-skipped build output (`AN template-sync.ts:62–69, 233–245`).
- **Reverse direction** (monorepo only): `pnpm contribute:template --app <path>` inverts the
  placeholder substitution on just the user's own changes and three-way merges them into
  `templates/<name>/`. Files `create` rewrote wholesale (`package.json`, `netlify.toml`,
  `app/root.tsx`, `server/plugins/auth.ts`) "have no faithful inverse at all"
  (`docs syncing-template-changes 148–158`).
- **Community templates are excluded** from sync. Their provenance
  (`agent-native.communityTemplate`) is "not first-party scaffold provenance"
  (`docs syncing-template-changes 14–19`; `docs cloneable-saas 124–130`).

### Principle

"Without a base, 'sync' can only mean overwrite, which silently discards your work or reverts
upstream's" (`docs syncing-template-changes 49`). "Syncing is one-directional by design:
upstream is the source of truth for template content" (`:150`). "Do not fix a broken upgrade
with `pnpm.overrides`, `patchedDependencies`, or edits under `node_modules/@agent-native/*`"
(`:30`).

### Changes since 0.206.0

One commit touched `template-sync.ts`. `git 579d66ca4` ("Apply starter apps' own migrations
in migrate:production") touched templates. No changes to the merge design.

### Gaps

- **(inference)** Template sync covers only first-party templates. A team that forks a
  first-party template and changes its schema or actions heavily will mostly get conflicts in
  exactly the files that matter (actions, schema, `AGENTS.md`). The mechanism suits
  "lightly customized" apps best.

---

## 7. The shape of an agent-native app (what every template shares)

### 7.1 Directory layout (Mail as the reference; Calendar is the same shape)

```
AGENTS.md                 runtime + coding-agent instructions (≤6,000 chars; CLAUDE.md → AGENTS.md symlink)
DEVELOPING.md             "for development-mode agents editing this app's source code"
.agents/skills/<name>/SKILL.md   8 domain skills (scope: both) + 22 framework skills (scope: dev)
.claude/skills → ../.agents/skills   symlink
learnings.defaults.md     seed for the gitignored learnings.md ("This file is your app's memory")
changelog/                one file per user-facing change → Settings › What's new
agent-native.config.ts    defineAgentNativeConfig({ changelog, harness })
agent-native.json         { onboarding.firstRun, doctor }
.mcp.json                 shadcn MCP for coding agents
actions/*.ts              one defineAction per file; filename = tool name
app/root.tsx              providers + useDbSync wiring
app/routes/*.tsx          React Router file routes (+ settings.tsx, settings.$.tsx, team.tsx redirect)
app/components/ui/*       one-line Toolkit adapters + toolkit-provider.tsx
app/hooks/use-navigation-state.ts   writes `navigation`, consumes `navigate`
server/db/schema.ts       Drizzle tables (app-owned)
server/db/index.ts        createGetDb(schema) (+ registerShareableResource)
server/plugins/db.ts      runMigrations([...]) + ensureAdditiveColumns + registerIdentityColumns
server/plugins/agent-chat.ts  createAgentChatPlugin({ actions, appId, initialToolNames, systemPrompt, … })
server/plugins/auth.ts    createToolkitAuthPlugin({ … })
server/plugins/core-routes.ts (optional) createCoreRoutesPlugin({ … })
server/plugins/otel.ts, oauth-refresh.ts, integrations.ts (Slack), mail-jobs.ts (crons)
server/middleware/auth.ts runAuthGuard(event)
server/routes/[...page].get.ts createH3SSRHandler(...)
server/routes/api/**      "custom routes only when actions are not enough"
server/lib/**             provider clients, domain logic
server/onboarding.ts      registerOnboardingStep(...)
shared/*.ts               client+server types
tests/, **/*.spec.ts      vitest (175 test files in Mail)
```
(Paths: `AN templates/mail/` listing; `docs creating-templates 56–127`; plugin bodies in §8.)
`server/plugins/core-routes.ts` is optional. Templates without it get `defaultCoreRoutesPlugin`
auto-mounted (`AN scripts/template-standard/manifest.ts:8–14`).

### 7.2 Framework code vs template code

| Kind | Where | Who changes it | How it updates |
|---|---|---|---|
| Framework runtime | `node_modules/@agent-native/core` (actions runtime, agent loop, app-state, sharing, auth, MCP/A2A, built-in tools such as `docs-search`, `tool-search`, `open-settings-page`, `set-search-params`, the review and history actions) | Builder | `upgrade` |
| Framework UI | `node_modules/@agent-native/toolkit` (settings, sidebar, auth UI, org pages, primitives) | Builder | `upgrade`; `eject` to own |
| Copied framework scaffolding | `.agents/skills/<framework skill>` (scope `dev`), `_gitignore`, `learnings.defaults.md`, `app/components/ui/*` adapters, `server/middleware/auth.ts`, `server/routes/[...page].get.ts`, `server/plugins/{auth,otel,oauth-refresh}.ts`, `ssr-entry.ts`, `vite.config.ts`, `react-router.config.ts` | Builder (monorepo) / user (generated app) | monorepo sync scripts; `skills update scaffold`; `template sync` |
| App code | `actions/`, `server/db/schema.ts`, `server/plugins/db.ts` migrations, `server/lib/`, `app/routes`, `app/components/<domain>`, `app/hooks`, `shared/`, domain skills, `AGENTS.md`, `DEVELOPING.md`, agent-chat `systemPrompt`, `initialToolNames`, onboarding steps, `changelog/` | the app owner | never synced except through `template sync` merges |

### 7.3 Conventions every template follows (with the mechanism behind each)

1. **Actions are the API.** One file per operation; the default export is `defineAction`.
   It is auto-mounted at `POST /_agent-native/actions/:name` (or `GET` with
   `http: { method: "GET" }`), exposed as an agent tool unless `agentTool: false`, and
   callable as `pnpm action <name>` (`docs template-mail-developers 31`;
   `docs template-chat-developers 70–101`). Flags templates actually use:
   - `readOnly`, `http:false`;
   - `agentTool:false` (UI-only, hidden from the agent's tool list);
   - **`uiOnly:true`**, which is enforced at run time: the run throws
     `ui_only_action`/403 unless `ctx.caller === "frontend"`
     (`AN packages/core/src/action.ts:1059–1070`);
   - `needsApproval` (boolean or a predicate over args and ctx);
   - `allowPersistentApproval:false`;
   - `toolCallable:false` (not from the code sandbox);
   - `mcpTool`/`mcpAnnotations` and `publicAgent` (external exposure);
   - `link` (deep link in the result) and `chatUI` (compact result card).

   A template action that shares its name with a core action **replaces** it. Mail has a
   test that its file names shadow nothing, after "Settings › Automations listed nothing while
   Mail had its own `list-automations`" (`AN templates/mail/actions/action-names.spec.ts:14–37`).
2. **A standard context trio.** `view-screen` (screen snapshot), `navigate` (writes a
   one-shot `navigate` command to application state) and `refresh-list`/`refresh-signal`
   (asks the UI to refetch). §7.4 has the details.
3. **The provider-API escape hatch trio plus staged datasets.** `provider-api-catalog`,
   `provider-api-docs` and `provider-api-request` with `stageAs`, then
   `list-/query-/delete-staged-dataset`. "First-class actions are ergonomic shortcuts, not
   capability limits" (`AN AGENTS.md:233–242`). In Mail and Calendar, `provider-api-request`
   is `toolCallable:false`. Mail's version is also approval-gated with
   `allowPersistentApproval:false` (`AN templates/mail/actions/provider-api-request.ts:319`).
4. **Data in Postgres via Drizzle, schema additive.** Hand-written `runMigrations` entries,
   each with a unique `name:` slug ("Version numbers alone are not a safe identity across
   parallel branches"). `ensureAdditiveColumns` runs afterwards as a "belt-and-braces safety
   net … It only ever adds missing columns" (`AN templates/mail/server/plugins/db.ts:62–66,
   478–506`). The escape hatch for a needed type change is an inline pragma:
   `-- guard:allow-destructive-ddl — widen quota timestamps …` (`:455`).
   `registerIdentityColumns` declares, for each email-valued column, what happens on an email
   change or offboarding (`retain` vs `rekey`) (`:13–49`).
5. **Ownable rows plus share grants.** `...ownableColumns()` adds `owner_email` (default
   `'local@localhost'`), `org_id` and `visibility` (`private|org|public`).
   `createSharesTable(name)` creates
   `(id, resource_id, principal_type user|group|org, principal_id, role viewer|commenter|editor|admin, created_by, created_at, notified_at)`
   (`AN packages/core/src/sharing/schema.ts:3–50`). Reads go through
   `accessFilter(table, sharesTable)` (`docs template-chat-developers` "list-notes").
6. **Two instruction channels for the in-app agent.** (a) `AGENTS.md`, loaded as the
   `<template>` prompt resource and capped at 6,000 characters in compact mode. Six layers
   are concatenated: workspace core, template, workspace SQL, app-default, org `<shared>`,
   personal memory (`AN packages/core/src/server/agent-chat/prompt-resources.ts:1563–1583`).
   (b) The `systemPrompt` string inside `server/plugins/agent-chat.ts`, which is code. Mail's
   is about 125 lines (`AN templates/mail/server/plugins/agent-chat.ts:100–224`).
7. **Skill scoping.** Skills declare `scope: runtime|dev|both`; the default is `both`
   (`AN packages/core/src/server/agent-chat/skill-frontmatter.ts:45–72`). In Mail, all 20
   framework skills except `frontend-design` and `turn-into-skill` are `scope: dev`, so they
   are hidden from the in-app agent and visible to coding agents. The 8 domain skills have no
   scope, so they are `both`.
8. **A first-request tool budget.** `initialToolNames` lists what the model gets on turn 1.
   "Everything else … stays reachable through `tool-search` and loads on demand"
   (`docs template-chat-developers 97–105`). Mail declares 32 entries (`sync-inbox` twice);
   Calendar declares 21.
9. **The four-area rule for features.** "If you add a feature, remember to update all four
   areas: UI, action, skill or AGENTS.md entry, and any application state the agent needs to
   see. That is what keeps the agent and the UI in parity" (`docs template-calendar-developers
   482`; same text at `docs template-chat-developers 234–236`). The worked recipe in
   `docs template-chat-developers 296–633` is: schema plus `registerShareableResource`, a
   migration, `create-note`/`list-notes` actions, a route using `useActionQuery`/
   `useActionMutation`, a sidebar link, a `viewForPath`/`pathForView` entry in
   `use-navigation-state.ts` ("Without these two edits, the agent sees the Notes page as
   `chat`"), and an `AGENTS.md` section.
10. **Parity harnesses against a reference product.** Mail keeps a
    `mail-interaction-parity` skill that compares with Superhuman ("Do not report 'bug free'
    or '1:1' globally. Report the tested case IDs, evidence, and remaining gaps",
    `AN templates/mail/.agents/skills/mail-interaction-parity/SKILL.md:52–62`). Calendar keeps a
    57 KB `INTERACTION-MATRIX.md` against Notion Calendar ("A row is not considered passed
    until the same steps and oracle have been exercised in both products",
    `AN templates/calendar/INTERACTION-MATRIX.md:1–7`). Content keeps a parity matrix of UI
    entry point to action (from the earlier note).
11. **UI latency rule in every AGENTS.md:** "UI feedback: target 100 ms, never exceed 400 ms;
    acknowledge before network work" (`AN templates/mail/AGENTS.md:31`;
    `AN templates/calendar/AGENTS.md:13`).
12. **Default UI density is a hard rule:** no page title that repeats the nav item, no
    subtitles, eyebrows or stat strips; `templates/forms/` is the reference implementation;
    `guard:no-default-chrome` enforces it (`AN AGENTS.md:340–354`).

### 7.4 How screens expose context to the agent (the general mechanism)

```
UI route/selection state ──useSemanticNavigationState / useAgentRouteState──▶ application_state["navigation"]  (per browser tab, debounced)
agent `navigate` action ──writeAppStateForCurrentTab("navigate", cmd)──▶ application_state["navigate"] ──UI consumes, navigates, deletes──▶
each turn: framework runs template `view-screen` ({}, caller "tool") ──▶ "<current-screen>…</current-screen>" (≤10,000 chars) appended to the user message
drafts the user and agent co-edit: application_state["compose-{id}"] (Mail), ["calendar-draft-{id}"] (Calendar) — visible live in the UI
```
- Framework side: if the app has a `view-screen` action, the framework runs it and wraps its
  output in `<current-screen>`. Otherwise it injects the raw `navigation` JSON. Output past
  `MAX_SCREEN_CONTEXT_CHARS = 10_000` is truncated with a note to call `view-screen` for the
  full snapshot (`AN packages/core/src/agent/production-agent.ts:2273–2277, 13177–13210`).
- Template side: the UI writes the semantic state (§8.5, §9.5). `view-screen` reads it with
  `readAppStateForCurrentTab("navigation", { fallbackToGlobal: false })` (Mail) and
  **enriches it with live data**: the visible rows, the open thread, the draft queue.
- URL query params are separate and reach the agent as `<current-url>`; the built-in agent
  changes them with `set-search-params`. "`navigation` should hold semantic IDs and aliases,
  not a second copy of the full query string" (`docs creating-templates 375–379`).
- Other context channels:
  - mention providers (`@`-mention emails or bookings in the composer;
    `AN templates/mail/server/plugins/agent-chat.ts:57–99`);
  - selection hand-off (`Cmd+I`; `docs template-mail-agent 42–44`);
  - UI buttons that call `sendToAgentChat({ message, context, submit, openSidebar })` with
    hidden context (`AN templates/mail/app/hooks/use-ai-priority-feedback.ts:14–25`;
    `AN templates/calendar/app/components/calendar/CreateEventDialog.tsx:674–694`).

### Principle

"Application state is how the agent knows what the user is seeing"
(`docs creating-templates 347–353`). "Prefer the auto-included `<current-screen>` block; call
this only when you need a refreshed snapshot" (`AN templates/mail/actions/view-screen.ts:511–513`).
Design-rule skill: "Any button labeled as agent work must use `sendToAgentChat` with bounded
context and `openSidebar: true`"; "Never use sparkle, wand, magic, or robot icons as an AI
label" (`AN templates/mail/.agents/skills/agent-native-toolkit/SKILL.md:36–64`).

### 7.5 How the UI calls actions

- Hooks: `useActionQuery(name, args, opts)`, `useActionMutation(name)` and imperative
  `callAction(name, args, { method })` from `@agent-native/core/client/hooks`
  (`AN templates/mail/app/hooks/use-draft-queue.ts:1–108`). Query keys are
  `["action", name, …]`. Mutating actions emit `source: "action"` change events, which
  `useDbSync` turns into cache invalidations (`docs creating-templates 315–341`).
- Usage counts in `app/` (grep): Mail 19 `useActionQuery`, 27 `useActionMutation`, 43
  `callAction`, and **about 45 references to legacy `/api/*` routes** (`/api/emails`,
  `/api/emails/draft`, `/api/automations/trigger` …). Calendar 34 / 23 / 7
  and 13. The `/api/*` uses are the grandfathered twins from §6.1.

---

## 8. Worked example A: Mail (`templates/mail`)

"Agent-Native Superhuman — email client with keyboard shortcuts and AI triage"
(`AN packages/shared-app-config/templates.ts`). 882 files; 83 actions; 15 tables;
175 test files; 30 skills.

### 8.1 Layout

As in §7.1. Mail-specific parts:
- `app/pages/{InboxPage,DraftQueuePage,SettingsPage}.tsx`
- `app/components/email/*`: `ComposeModal`, `EmailList`, `EmailThread`,
  `InlineReplyComposer`, `RecipientInput`, `SnoozeModal`, `AiFilterDialog` …
- `server/lib/*`: about 90 modules, including Gmail client, inbox store/sync, jobs, quota
  budget, queued drafts, AI filter, automation engine, tracking.
- `server/handlers/*`: the legacy `/api` handlers.
- `server/routes/_agent-native/google/*`: OAuth add-account.
- `server/plugins/mail-jobs.ts`: crons.
- `server/plugins/integrations.ts`: Slack intake.

### 8.2 Actions (83; one line each; flags in brackets)

Mail actions are a mix of agent tools, UI-only actions and MCP-oriented actions. Source:
each file's `description` (`AN templates/mail/actions/*.ts`).

**Inbox inventory and sync**
- `list-inbox-threads` [GET, readOnly]: the inbox "exactly as the UI shows it": tab bar,
  per-tab counts, rows, from one synced-store SQL read.
- `sync-inbox` [POST]: advance one bounded Gmail sync step per account; returns status, push
  generations, quota cooldown.
- `resync-inbox` [POST]: reset an account's sync cursor and run one bounded step.
- `bootstrap-watches` [http:false]: start or renew Gmail push watches; a 12-hour cron normally
  does this.
- `refresh-list` [http:false]: write `refresh-signal` so the UI rereads; "does not contact
  Gmail".

**Reads**
- `list-emails` [GET, readOnly]: emails for a view (inbox, unread, starred, sent, drafts,
  scheduled, archive, trash) plus a query.
- `search-emails` [GET, readOnly]: Gmail search syntax across all views and accounts.
- `get-email` / `get-thread` [GET, readOnly]: exact message or thread "without changing
  UNREAD".
- `list-labels` [GET, readOnly]: labels with stable ids and counts from cache; live Gmail
  fallback.
- `find-contact` [GET, readOnly]: resolve a name to an address from Contacts plus history; "Use
  this BEFORE asking the user … guessing patterns … is unreliable".
- `view-screen` [http:false, readOnly]: the screen snapshot (§8.5).
- `view-composer` [http:false]: all open compose drafts.
- `export-emails` [http:false]: export a view as JSON (local mailbox only).

**Mailbox state**
- `star-email`, `archive-email`, `unarchive-email`, `trash-email`, `untrash-email`: per-id,
  batched per account through Gmail `batchModify`.
- `move-email`: move threads to a label (removes Inbox).
- `mark-read`: explicit ids, `threadIds`, or `scope:"all-unread"` with `excludeThreadIds`;
  "Never loop mark-thread-read for broad cleanup".
- `mark-thread-read`: one conversation.
- `bulk-archive` [http:false]: archive older than N days (local data only).

**Drafting and sending**
- `manage-draft`: create, update or delete a `compose-{id}` draft (app-state plus Gmail draft
  mirror).
- `send-email` [**needsApproval predicate**]: real Gmail send.
- `create-attachment-upload`: short-lived owner-bound upload URL for one attachment.
- `manage-snippets`: canned responses for the slash menu.
- `get-mail-settings` [GET, readOnly] / `update-mail-settings`: signature, writing style,
  autocomplete, Send + Mark Done.
- `import-gmail-signature`: Gmail HTML signature → Markdown.
- `get-mail-preferences` / `update-mail-preferences` [agentTool:false]: the full Settings
  preferences object.

**Scheduling and snooze**
- `create-scheduled-send` [**needsApproval predicate**]: schedule a send with a full payload.
- `create-scheduled-job`: create a snooze job (an agent tool, in `INITIAL_TOOL_NAMES`).
- `list-scheduled-jobs` [GET]: pending and processing snoozes and sends.
- `update-scheduled-job` [agentTool:false]: reschedule.
- `send-scheduled-email-now`: fire a pending scheduled send now.
- `cancel-scheduled-email`: cancel a pending one.
- `confirm-uncertain-scheduled-email`: owner confirms an "uncertain" send arrived in Sent.
- `retry-uncertain-scheduled-email` [**uiOnly**, `duplicateRiskAcknowledged: z.literal(true)`]:
  send a new copy after the owner accepts the duplicate risk.

**Draft queue (teammate and Slack requests)**
- `list-org-members` [GET]: valid owners in the active org.
- `queue-email-draft` [+ `link` to review URL]: queue a draft for an org member; "Use this
  for Slack or teammate requests instead of sending directly".
- `list-queued-drafts` [GET]: review, requested, or all scope.
- `update-queued-draft`: edit fields or status.
- `open-queued-draft`: copy into `compose-{id}` and set `in_review`.
- `send-queued-drafts` [**needsApproval predicate**]: send one or all active drafts assigned to
  me, through `send-email`.

**Rules, AI filter, priority**
- `manage-automations` [agentTool:boolean param]: create, list, update or delete inbox
  rules; NL rules with mode tag|important|notify|filter|archive.
- `manage-email-rules`: the same factory (`createManageEmailRulesAction(true)`).
- `trigger-automations` [http:false]: run automations now.
- `create-/list-/update-/delete-email-rule` [agentTool:false]: Settings UI rows.
- `get-/update-automation-settings` [agentTool:false]: rule engine and model, plus
  `allowAutomationSends`.
- `manage-gmail-filters`: native Gmail filters (list, create, replace, delete).
- `apply-ai-filter`: filter or keep a message (reversible label plus archive) and learn from
  it.
- `refine-ai-filter` [agentTool:true]: rewrite an AI rule from corrections; backfill after 3
  confirmed examples.
- `get-ai-filter` [agentTool:false], `preview-ai-filter` [readOnly, agentTool:false].
- `consolidate-ai-filter-rules` [PUT, agentTool:false]: atomically update one rule and delete
  duplicates.
- `manage-ai-filter-backfill` [agentTool:false]: start or **undo** a backfill run's exact
  label and archive changes.
- `get-ai-filter-backfill` [agentTool:false].
- `manage-ai-filter-rule-undo` [agentTool:false]: clear rules, or restore them from a
  short-lived undo token.
- `get-ai-priority` [agentTool:false]: score up to 500 inbox emails with Jev.
- `record-ai-priority-feedback` [agentTool:true].
- `get-jev-availability` [agentTool:false].

**CRM, tracking, calendar, integrations**
- `get-hubspot-contact` [GET, readOnly]: contact, deals, tickets.
- `get-integration-statuses` [agentTool:false]: which sidebar integrations are configured
  (no secret values).
- `get-tracking` [GET]: open and click stats for a sent message.
- `respond-calendar-invite`: accept, decline or tentative from Mail.
- `create-/list-/update-/delete-alias` [agentTool:false]: recipient aliases.

**Provider escape hatch and staged data**
- `provider-api-catalog` [GET], `provider-api-docs` [GET].
- `provider-api-request` [http:false, toolCallable:false, needsApproval predicate,
  allowPersistentApproval:false]: raw Gmail, Google Calendar or HubSpot call.
- `list-staged-datasets` [GET], `query-staged-dataset` [http:false],
  `delete-staged-dataset` [http:false].

**Navigation and code**
- `navigate` [http:false]: view, tab, sort, thread, settings section, queued draft, compose
  draft (§8.5).
- `request-code-change` [http:false]: in production, request a source change via Builder
  branch creation.

(Non-actions in the folder: `helpers.ts`, `run.ts`. 42 sibling `*.spec.ts` files.)

### 8.3 Database schema (15 Drizzle tables, `AN templates/mail/server/db/schema.ts:11–340`)

Email bodies are **not** stored as a primary copy. "Email itself lives in Gmail (or the local
`getSetting("local-emails")` fallback when no account is connected)"
(`docs template-mail-developers 102`). The tables hold what Gmail does not hold, plus a
synced inbox cache.

| Table | Columns (abridged) | Purpose |
|---|---|---|
| `scheduled_jobs` | `id, type snooze\|send_later, owner_email, email_id, thread_id, account_email, payload(json text), run_at, status pending\|processing\|done\|cancelled\|uncertain\|retry_queued, processing_claim_id, processing_lease_until, send_started_at, created_at` | snoozes and send-later with lease-based claims |
| `queued_email_drafts` | `id, org_id, owner_email, requester_email, requester_name, to/cc/bcc_recipients, subject, body, context, source(agent\|slack\|ui\|api), source_thread_id, account_email, compose_id, sent_message_id, send_claim_id, send_claimed_at, status queued\|in_review\|sent\|dismissed, created_at, updated_at, sent_at` | teammate draft queue |
| `automation_rules` | `id, owner_email, domain(mail\|calendar), kind automation\|ai-filter, name, condition(NL), actions(json), enabled, created_at, updated_at` | NL triage rules |
| `mail_ai_filter_rule_undo` | `id, owner_email, rules_json, expires_at` | short-lived undo snapshots of rule sets |
| `mail_ai_filter_backfills` | `id, owner_email, rule_set_key, status queued\|running\|completed\|failed\|undoing\|undone, state_json, undo_token, undo_expires_at, expires_at, claim_id, claimed_at, …` (unique active run per owner+rule set) | reversible bulk application of rules |
| `contact_frequency` | `id(owner:contact), owner_email, contact_email, contact_name, send_count, receive_count, last_contacted_at` | ranking for `find-contact` |
| `email_tracking` / `email_link_tracking` | `pixel_token, message_id, owner_email, sent_at, opens_count, first/last_opened_at, last_user_agent` / `click_token, pixel_token, url, clicks_count, …` | open and click tracking |
| `snippets` | `id, owner_email, name, body, created_at, updated_at` | canned responses |
| `mail_sync_accounts` | `id(owner:account), history_id, full_sync_* (page token, phase, reconcile state), status idle\|syncing\|error\|needs_reauth, last_error, last_push_generation, sync_claim_id, watch_* claims, labels_json, …` | per-account Gmail sync cursor and claims |
| `mail_inbox_threads` | `id(owner:account:thread), thread_id, in_inbox, is_unread, is_starred, is_important, is_automated, latest_date, subject, snippet, from_*, to_json, label_ids_json, message_ids_json, counts, synced_at, local_mutation_*` | the SQL inbox cache behind `list-inbox-threads` |
| `mail_inbox_push_invalidations` | `id, owner_email, account_email, generation` | Gmail push generations |
| `mail_gmail_quota_budgets` | `id, owner/account, quota_window_started_at, quota_units_used(+background/backfill), quota_cooldown_until, attempts` | per-account Gmail quota budgeting |
| `mail_gmail_token_accounts` | `token_hash(sha256), owner_email, account_email, expires_at` | maps a token to its quota account across serverless instances |
| `mail_inventory_cursors` | `id, owner_email, query_fingerprint, state, version, claim_id, claimed_at, expires_at, updated_at` | MCP inventory continuation |

Also used:
- framework `oauth_tokens` (one row per Google account);
- user settings `mail-settings`, `aliases`, `automation-settings`, `labels`, `local-emails`;
- `application_state` keys `navigation`, `navigate`, `compose-{id}`, `refresh-signal`.

Migrations: 38 hand-written versions in `runMigrations([...], { table: "mail_migrations" })`
(`AN templates/mail/server/plugins/db.ts:66–476`).

### 8.4 Agent instructions

- **`AGENTS.md`** (69 lines, 5,475 bytes). Sections: purpose; skills index (8 domain plus 22
  shared); "Use local framework docs, not web research: `pnpm action docs-search`"; Core Rules;
  an action table; Application State. Core Rules worth quoting
  (`AN templates/mail/AGENTS.md:31–39`):
  > "Use real Gmail when connected, otherwise synthetic `local-emails`; never claim fallback
  > data changed the real inbox." … "Interactive sends require approval; draft/queue by
  > default. Automation sends remain gated unless the owner enables Mail's setting … Use
  > `queue-email-draft` for teammate/Slack send requests." … "Resolve recipients with
  > `find-contact`; never guess addresses. Read `get-mail-settings` before drafting and use its
  > signature exactly; never invent one." … "Preserve per-account coverage: partial, empty,
  > exhausted, and error are distinct."
- **Plugin `systemPrompt`** (`AN templates/mail/server/plugins/agent-chat.ts:100–224`).
  It contains much of the behavioural policy:
  - "Deterministic Mail Reads": call `list-emails` directly; don't use `view-screen` as a
    connection preflight; "Treat real action errors as the evidence for an unavailable
    connection".
  - "Reliable Mail Mutations": `mark-read` exactly once with `scope:"all-unread"`, and
    "Report the returned matched, excluded, changed, and remaining-unread counts;
    completeness comes from the action's verification read, not merely from a successful
    tool submission".
  - "Provider APIs Are Escape Hatches, Not Limits".
  - "Calendar Context via A2A": use `call-agent` with agent "calendar".
  - "Draft Queue": "Do not use raw `send-email` to send on behalf of a teammate who asked
    from Slack; queue it instead".
  - "Automations": opt-in sending.
  - "Durable Drafting Preferences — CRITICAL": a preference change is a settings update,
    never a draft.
  - "Composing vs Replying".
  - "Code Changes (Production Only)" → `request-code-change`.

  The paragraph on inbox SQL snapshots appears twice verbatim (`:108` and `:110`), and
  `"sync-inbox"` appears twice in `INITIAL_TOOL_NAMES` (`:14–15`). Sloppy, but harmless.
- **Slack channel prompt.** `server/plugins/integrations.ts` builds a second agent surface
  for Slack. It **deletes `send-email` from that surface's action set**
  (`delete actions["send-email"]`, `AN templates/mail/server/plugins/integrations.ts:14`) and
  instructs: "queue it with queue-email-draft. Do not send raw email directly from Slack"
  (`:20–29`). The safety rule is enforced structurally here, not only by the prompt.
- **8 domain skills:**
  - `inbox-reads-and-triage` (105 lines)
  - `email-drafts` (318)
  - `draft-queue` (82)
  - `contacts-and-crm` (77)
  - `mail-backends` (33)
  - `inbox-automations` (101)
  - `provider-api-scans` (39)
  - `mail-interaction-parity` (74, with `references/interaction-matrix.md`)

  `draft-queue` documents the state machine and access rules
  (`AN templates/mail/.agents/skills/draft-queue/SKILL.md:33–60`).

### 8.5 How Mail's screens expose context

- **Writer:** `useNavigationState()` wraps `useSemanticNavigationState({ state, browserTabId,
  requestSource, writeDebounceMs: 500 })` (`AN templates/mail/app/hooks/use-navigation-state.ts:25–52`).
  `InboxPage` calls `navState.sync({ view, threadId, focusedEmailId, search, label, filter,
  activeInboxTab, activeAccounts, selectedThreadIds, sort })` on every relevant change
  (`AN templates/mail/app/pages/InboxPage.tsx:849–884`). The `NavigationState` interface lists
  15 fields (`use-navigation-state.ts:6–23`).
- **Commands:** `navigate` writes `writeAppStateForCurrentTab("navigate", nav)`, or for
  Settings writes `__set_url__` directly (`AN templates/mail/actions/navigate.ts:97–130`).
  `InboxPage` consumes the command: it de-duplicates by JSON key, routes to the view, tab,
  thread, draft queue or compose draft, then `clearCommand()`
  (`AN templates/mail/app/pages/InboxPage.tsx:886–935`). The comment there reads "agent writes
  navigate.json, UI reads it, navigates, deletes it", a leftover from the old file-based
  design.
- **Reader:** `view-screen` (`AN templates/mail/actions/view-screen.ts:511–637`) reads
  tab-scoped `navigation`, then branches:
  - Draft queue view: up to 50 active queued drafts plus the selected draft.
  - Any other view: a **bounded** preview (`SCREEN_EMAIL_LIMIT = 10`, at most 3 pages), each row
    with `isSelected`, plus `coverage: { complete, failedAccounts, error? }`, plus inbox tabs
    with total and unread counts.
  - Open thread: `thread` with its messages.

  Errors are redacted (`Bearer [redacted]`, `token=[redacted]`, `:61–78`).
- **Co-edited drafts:** `manage-draft` writes `compose-{id}` app-state. The UI's
  `DbSyncSetup` invalidates `["compose-drafts"]` when a `compose-*` app-state event arrives
  from another source (`AN templates/mail/app/root.tsx:422–430`), so an agent edit appears in
  the open compose panel.

### 8.6 How Mail's UI calls actions and stays in sync

- Hooks as in §7.5. For example, `useQueuedDrafts` → `useActionQuery("list-queued-drafts")` and
  `useSendQueuedDrafts` → `useActionMutation("send-queued-drafts")`
  (`AN templates/mail/app/hooks/use-draft-queue.ts:49–108`).
- We noted security-relevant gaps in Mail's compose send path; they are recorded separately
  in a private note.
- **Sync:** `useDbSync({ actionInvalidatePredicate, ignoreSource: TAB_ID, onEvent, realtime:
  isPrivateInboxPath ? { reason: "new mail arrives while the inbox is open" } : undefined,
  pauseWhenHidden: true })` (`AN templates/mail/app/root.tsx:506–522`). The custom `onEvent`
  maps sources and keys to React Query invalidations:
  - app-state `compose-*` → compose drafts;
  - `refresh-signal` → emails, labels, inbox threads;
  - settings `mail-settings` → settings plus inbox;
  - action names → email lists.

  Own-tab events are ignored (`:415–470`). Realtime is requested only on inbox paths.
  Elsewhere `realtime` is `undefined`, which turns off both SSE and background polling:
  `useDbSync` creates no transport at all without a realtime reason
  (`AN packages/core/src/client/use-db-sync.ts:1933–1946`). Non-inbox pages update only
  through local mutations, chat-run (`tool-done`) invalidation and ordinary refetches;
  changes made elsewhere are not pushed to them.

### 8.7 Domain safety: drafts, queue, approval, undo

1. **Approval on send is a predicate, not a constant.**
   ```ts
   needsApproval: (_args, ctx?: ActionRunContext) => requiresEmailSendApproval(ctx),
   ```
   `requiresEmailSendApproval` returns `true` unless `ctx.caller === "automation"` **and** the
   owner's `automation-settings.allowAutomationSends === true`
   (`AN templates/mail/server/lib/automation-settings.ts:20–27`). Inside `run`, an
   automation caller without opt-in is rejected outright: "Automation email sending is
   disabled. Enable it in Mail settings to send automatically"
   (`AN templates/mail/actions/send-email.ts:197–209`). The same predicate guards
   `create-scheduled-send` (`:66–67`) and `send-queued-drafts` (`:104–105`). Tests: "requires
   approval for interactive sends", "requires approval for automations unless the owner opts
   in", "fails closed when automation settings are malformed"
   (`AN templates/mail/actions/send-email.spec.ts:171–220`).
   - How the gate fires: the agent loop evaluates `needsApproval` with
     `{ userEmail, orgId, caller: opts.actionCaller ?? "tool", automation, … }`, fails closed
     on an exception, then **checks `isToolAlwaysAllowed`** (per owner, org, tool name and tool
     revision) unless the action sets `allowPersistentApproval: false`
     (`AN packages/core/src/agent/production-agent.ts:8829–8865, 13915–13923`). The approval card
     offers "Always allow this action" (`AN packages/toolkit/src/app/i18n/catalogs/en-US.ts:48–51`).
     We noted security-relevant gaps in this area; they are recorded separately in
     a private note.
2. **Queue instead of send for third parties.** `queue-email-draft` → `queued_email_drafts`
   status `queued`; `open-queued-draft` → `in_review` plus `compose-{id}`; send →
   `sent` (frozen). `assertCanAccessDraft`: requester, owner or admin may read; with
   `ownerOnly`, **only the owner or an org admin** may update, open or send
   (`AN templates/mail/server/lib/queued-drafts.ts:274–297`). Slack intake can only queue
   (`send-email` is removed from that surface, §8.4) and needs a verified Slack email
   ("will not queue anything … rather than guessing their address",
   `AN templates/mail/.agents/skills/draft-queue/SKILL.md:21`).
3. **Claimed, idempotent queue sends.** `send-queued-drafts` claims each row
   (`claimQueuedDraftForSending`) and skips "Already sent." or "Already being sent by another
   request." It calls `sendEmailAction.run(...)` and then `markQueuedDraftSent`, or
   `releaseQueuedDraftClaim` on failure, and reports `{ sent, failed }` per draft without
   aborting the batch (`AN templates/mail/actions/send-queued-drafts.ts:37–162`).
4. **At-most-once scheduled sends with an "uncertain" state.** A cron
   (`server/plugins/mail-jobs.ts`, 60 s interval, ≤20 due jobs per tick) claims a job with a
   `processing_lease_until` lease and stamps `send_started_at` **before** calling Gmail. If the
   lease expires after `send_started_at` was set, the job becomes `uncertain`. It is **not
   retried automatically** (`markExpiredScheduledSendsUncertain`, `markJobUncertain`;
   `AN templates/mail/server/lib/jobs.ts:284–307, 961–981`). The owner resolves it in one of
   two ways:
   - `confirm-uncertain-scheduled-email`: "I found it in Sent" → `done`;
   - `retry-uncertain-scheduled-email`: `uiOnly`, with a schema-level
     `duplicateRiskAcknowledged: z.literal(true)` → `retry_queued` → send a new copy
     (`AN templates/mail/actions/retry-uncertain-scheduled-email.ts:10–38`).

   The schema migration that introduced this is `mail-scheduled-job-uncertain-send-recovery`
   (`AN templates/mail/server/plugins/db.ts:413–420`).
5. **Undo, three kinds:**
   - Client-side single-slot undo for archive, trash and similar, 10 s
     (`UNDO_DURATION = 10_000`). It runs compensating mutations, for example `unarchive-email`
     with a `suppressionToken` and an inbox snapshot (`AN templates/mail/app/hooks/use-undo.ts:6, 53–64`;
     `AN templates/mail/app/components/email/EmailList.tsx:1350–1400`).
   - **Send-undo: a 10 s client timer before the request is made**
     (`SEND_UNDO_WINDOW_MS = 10_000`; `handleSend` → `setTimeout(…, SEND_UNDO_WINDOW_MS)`;
     `AN templates/mail/app/components/email/ComposeModal.tsx:78, 404–505`). Closing the tab
     inside the window means the email is never sent **(inference)**. The Settings field
     `undoSendDelay` (default 5, `AN templates/mail/server/lib/mail-settings.ts:18`) is read by
     nothing that sends (grep shows only types, defaults, the schema and one test). It is dead
     configuration.
   - Server-side undo for bulk AI work: `mail_ai_filter_backfills.undo_token`/
     `undo_expires_at` and `mail_ai_filter_rule_undo` snapshots, used by
     `manage-ai-filter-backfill` (undo "the exact label and archive changes from a run") and
     `manage-ai-filter-rule-undo`.
6. **Truthfulness rules in data shapes:** `coverage.complete`/`failedAccounts` in reads;
   "partial, empty, exhausted, and error are distinct" (`AGENTS.md:37`); the send action never
   reports an accepted Gmail send as failed just because the refresh signal failed (test
   "does not report an accepted Gmail send as failed when refresh signaling fails",
   `send-email.spec.ts:248`).

### 8.8 Tests

175 test files across `actions/*.spec.ts` (42), `server/lib/*.spec.ts`,
`server/handlers/*.spec.ts`, `server/plugins/*.spec.ts`, `app/**/*.test.tsx` (interaction
tests such as `EmailList.keyboard-navigation.test.tsx` and `ComposeModal.schedule.test.tsx`)
and `tests/redirects.test.ts`. The style is unit tests with `vi.hoisted` mocks of Core modules
(`AN templates/mail/actions/send-email.spec.ts:1–60`), plus a few PGlite-backed specs
(`gmail-quota.cooldown-pglite.spec.ts`, `inbox-store.quota-pglite.spec.ts`).
`vitest.config.ts` merges `@agent-native/core/vitest-config` (`AN templates/mail/vitest.config.ts`).

### 8.9 Changes since 0.206.0

17 commits. Highlights:
- "Speed up Mail search and cached inbox access" (`git 695f465ed`)
- "Decode HTML entities in Mail inbox snippets" (`git 81b155e41`)
- MCP catalog checks: "mutating tools declare destructiveHint, write-capable tools need
  mcp:write" (`git 9c277b79c`)
- output schemas only for audited actions (`git fab1c27c7`)
- "Stop chat runs ending on rejected writes" (`git 64bf791ac`)
- "Show agents the details a fail() attaches" (`git 578c558da`)

---

## 9. Worked example B: Calendar (`templates/calendar`)

"Agent-Native Google Calendar — manage events, sync, and public booking"
(`AN packages/shared-app-config/templates.ts`). 55 actions, 6 tables, 127 test files, 24
skills, 26 migrations. Its domain (time slots, availability, invites to other people) is the
closest of all the templates to scheduling training sessions.

### 9.1 Layout

The §7.1 shape, plus:
- `app/routes/_app.*` (pathless `_app` layout): `home`, `availability`, `booking-links`,
  `bookings`, `settings`, `extensions`, `agent`, `team`, `shared-availability.add`.
- Public pages: `book.$username.$slug.tsx`, `booking.manage.$token.tsx`, and legacy
  `book.$slug`/`meet.*` routes that canonicalize the URL.
- `event.tsx`: an inline event preview embedded in chat.
- `server/lib/{google-calendar,google-api,find-time,calendar-availability,ical-fetcher,zoom,
  people-search,booking-*}.ts`.
- `server/plugins/event-rules.ts`: automatic invitation rules on a 5-minute sweep.
- `server/plugins/transactional-emails.ts`.
- `INTERACTION-MATRIX.md` (parity with Notion Calendar) and `UPGRADING.md`.

### 9.2 Actions (55; one line each)

Non-action helper files in `actions/`: `action-chat-ui.ts`, `event-action-helpers.ts`,
`event-search.ts`, `helpers.ts`, `run.ts`.

**Events (live in Google, never in SQL)**
- `list-events` [GET, readOnly, publicAgent]: Google, ICS feeds and local bookings for a
  range; defaults to today; keeps account and source coverage.
- `search-events` [readOnly]: bounded search by title, attendees, organizer, location.
- `get-event` [GET, readOnly, publicAgent]: one event by id.
- `list-google-calendars` [GET, readOnly, publicAgent]: discover calendars across accounts;
  returns opaque `sourceKey`s ("names and roles in client requests are never trusted").
- `create-event` [**needsApproval when guests are notified**, mcpTool]: create on an owned
  account's primary calendar (recurrence, OOO, focus time, working location, Meet or Zoom).
- `update-event` [**needsApproval predicate**, toolCallable:false, mcpTool]: edit, move
  between accounts, recurrence scope.
- `update-events` [toolCallable:false; `dryRun`]: bulk shift or retime by ids or filters.
- `delete-event` [**needsApproval when notifying**, toolCallable:false]: delete one;
  recurring scope single|all|thisAndFollowing; `removeOnly` for non-organizers.
- `delete-events` [**needsApproval unless `dryRun`**, toolCallable:false]: bulk delete by
  range plus weekdays plus query, or by ids.
- `manage-event-draft`: create, update or delete an **unsent invite draft** shown as a
  placeholder for review.
- `rsvp-event`: accept, decline or tentative with an optional note.
- `respond-to-event` [agentTool:false, mcpTool]: the MCP-facing RSVP twin (same
  implementation).
- `get-attendee-timezones` [GET] / `set-attendee-timezone` [PUT]: per-guest IANA overrides.
- `undo-calendar-event-rule`: undo one automatic invitation action (restore the prior RSVP
  or unhide).
- `get-event-rules-status` [GET]: whether the durable recurring sweep can run here.
- `sync-google-calendar` [http:false]: deprecated no-op ("no longer needed. Events are read
  directly from the Google Calendar API").

**Availability**
- `get-availability` [GET] / `update-availability`: weekly hours, timezone, buffer,
  notice, horizon ("Read the current config first and preserve fields the user did not ask to
  change").
- `check-availability` [http:false]: free slots on one date.
- `find-a-time` [GET, readOnly]: shared free slots across organizer and attendees (Google
  free/busy plus local conflicts).

**Booking links and bookings**
- `create-booking-link`, `update-booking-link`, `duplicate-booking-link`.
- `delete-booking-link` [toolCallable:false]: owner or admin; removes stale slug redirects.
- `list-booking-links` [GET], `list-bookings` [GET].
- `cancel-booking` [**needsApproval: true**, toolCallable:false]: cancel the booking plus its
  calendar and Zoom meetings ("Use this instead of delete-event … for booking-backed events").

**People and overlays**
- `search-people` [GET]: Google Contacts plus the Workspace directory.
- `get-/update-overlay-people`, `add-overlay-person` [PUT], `remove-overlay-person` [PUT],
  `update-overlay-person-color` [PUT]: teammates' calendars pinned into the view.
- `get-overlay-reciprocity`, `get-host-overlay-status` [GET]: whether peers added you back,
  so their real working hours apply to co-hosted links.
- `send-overlay-request` [POST]: email a co-host asking them to add the owner back.

**External ICS feeds**
- `add-/remove-/update-/list-external-calendars`.

**Connections and settings**
- `connect-google-calendar` [GET, readOnly]: return a user-clickable OAuth link ("Do not
  fetch the returned URL as an API").
- `get-zoom-status` [GET].
- `get-settings` [GET] / `update-settings`.
- `update-calendar-visual-preferences`: app-only display; "does not call Google Calendar".
- `db-status` [http:false].

**Provider escape hatch**
- `provider-api-catalog`, `provider-api-docs`.
- `provider-api-request` [toolCallable:false].
- `list-/query-/delete-staged-dataset`.

**Navigation**
- `navigate` [http:false]: view, `calendarViewMode`, date, `eventId`, `eventDraftId`,
  `extensionId`, `addPersonEmail`.
- `view-screen` [http:false, readOnly].

### 9.3 Database schema (`AN templates/calendar/server/db/schema.ts:10–75`)

"**Events live in Google Calendar, not SQL.** Every event action calls the Google Calendar
API directly — there is no local events table" (`docs template-calendar-developers 98–102`).

| Table | Columns | Notes |
|---|---|---|
| `bookings` | `id, name, email, additional_guest_emails, start, end, slug, event_title, notes, field_responses, meeting_link, meeting_link_pending(bool), google_event_id, calendar_account_id, cancel_token, zoom_needs_review(bool), zoom_meeting_id, zoom_account_id, status confirmed\|cancelled, created_at, owner_email (default 'local@localhost'), org_id` | confirmed public bookings; `cancel_token` powers `/booking/manage/:token` |
| `booking_links` | `id, slug(unique), title, description, duration(default 30), durations, hosts, custom_fields, conferencing, color, is_active, created_at, updated_at, …ownableColumns()` | ownable, shareable |
| `booking_slug_redirects` | `old_slug(pk), new_slug, created_at` | renamed links keep working |
| `booking_usernames` | `username(pk), owner_email(unique), created_at, updated_at` | the `{username}` in `/book/{username}/{slug}` |
| `booking_username_changes` | `id, owner_email, old_username, new_username, created_at` | audit log for the 3-changes-per-30-days limit |
| `booking_link_shares` | `createSharesTable("booking_link_shares")` → `resource_id, principal_type, principal_id, role, created_by, created_at, notified_at` | share grants |

Registered as a shareable resource, type `"booking-link"`, with `resourceTable`,
`sharesTable`, `titleColumn`, `getResourcePath` and `getDb`
(`AN templates/calendar/server/db/index.ts:9–17`). Non-table state:
- user settings `calendar-availability`, `calendar-overlay-people`, `attendee-timezones`,
  `external-calendars`, `calendar-settings` (holds `eventRules` and activity);
- `oauth_tokens` for Google and Zoom;
- application state `navigation` and `calendar-draft-{id}`
  (`docs template-calendar-developers 365`).
- `UPGRADING.md` describes a planned move from these tables to `@agent-native/scheduling`'s
  `event_types`. Today Calendar imports only the Zoom provider and the booking-links React
  components from that package (`AN templates/calendar/server/lib/zoom.ts:10`;
  `AN templates/calendar/app/pages/BookingLinksPage.tsx:7`).

### 9.4 Agent instructions

- **`AGENTS.md`** (5,265 bytes). Core rules worth quoting (`AN templates/calendar/AGENTS.md:13–22`):
  > "For multi-event requests use one batch action (`delete-events` or `update-events`);
  > preview destructive batches with `dryRun`. Singular actions are for one event. Use runtime
  > date context for today/tomorrow/yesterday." … "Preserve `accountEmail` on every Google
  > event write." … "`list-events` preserves account/source coverage and `coverageComplete`;
  > partial failure is not an empty calendar." … "Keep scheduling answers concrete: dates,
  > time zones, conflicts, and assumptions."

  A "Direct MCP actions" table names the four actions external MCP clients get
  (`list-events`, `create-event`, `update-event`, `respond-to-event`) (`:24–33`). The last
  paragraph is duplicated (`:41–43`).
- **`systemPrompt`** (`AN templates/calendar/server/plugins/agent-chat.ts:100–143`):
  - "Critical: Use Actions And Provider APIs, Not Raw SQL … Never use db-query or db-exec for
    calendar operations";
  - a CLI-style crib of every action and its flags;
  - "Google Connection Check": call `list-events` directly and only ask to reconnect on a real
    auth error;
  - "When the user says 'show me', 'go to', 'open', or 'switch to' … ALWAYS use the `navigate`
    action to update the UI first".
- **Event bus registration** in the same plugin: `calendar.event.created`,
  `calendar.event.updated`, `calendar.booking.created`, with zod payload schemas
  (`:20–58`). Other apps' automations subscribe to these
  (`docs template-calendar-integrations 43–51`).
- **Domain skills:** `event-management`, `availability-booking`; plus 22 shared framework
  skills.
- `initialToolNames`: 21 tools, including `create-event`, `update-event`, `delete-event` and
  `rsvp-event` (`:60–82`).

### 9.5 How Calendar's screens expose context

- **Writer:** `useAgentRouteState<NavigationState>({ getNavigationState, getCommandPath,
  onNavigate })` (`AN templates/calendar/app/hooks/use-navigation-state.ts:106–220`).
  `getNavigationState` derives `view` from the pathname (`calendar|availability|
  booking-links|bookings|settings|extensions`) and adds `calendarViewMode`, `date`, `eventId`
  (open sidebar event) and `eventDraftId`. `onNavigate` applies agent commands:
  - set the view mode and date;
  - for `eventId`, `callAction("get-event")` then open the detail sidebar;
  - for `addPersonEmail`, **open the add-person dialog prefilled. "Prefills the search only;
    the user still confirms the add"** (`AN templates/calendar/actions/navigate.ts:31–36`);
  - for `eventDraftId`/`calendarDraft`, load the draft from
    `/_agent-native/application-state/calendar-draft-{id}` (or a base64url payload in the
    deep link) and show it as a placeholder.
- **Reader:** `view-screen` (`AN templates/calendar/actions/view-screen.ts:74–257`) reads
  `navigation` and the visual preferences, then branches. For the calendar view it loads
  events for the visible range in the saved timezone and returns **up to 50 compact events**:
  ids, account, calendar source and access role, read-only flag, attendee count and names (≤8),
  video link, `responseStatus`. It also returns `errors`, a `calendarConnection` notice when
  Google is not connected, `selectedEvent`, and `eventDraft` (or `{ missing: true }`). For
  booking links it returns up to 50 rows under `accessFilter`. For settings it returns the Zoom
  status.

### 9.6 How Calendar's UI calls actions

Mostly hooks: 34 `useActionQuery`, 23 `useActionMutation`, 7 `callAction`, 13 legacy `/api`
references. `CRUD_ROUTE_BASELINE` keeps 2 Calendar `/api` CRUD routes
(`AN scripts/guard-no-action-twin-routes.mjs:293+`). UI hand-off to the agent:
`CreateEventDialog` → "Draft description" calls `sendToAgentChat({ message, context: {title,
date, time, timezone, location, attendees, description}, submit: true })`
(`AN templates/calendar/app/components/calendar/CreateEventDialog.tsx:674–694`).

### 9.7 Domain safety: drafts, approval, previews, undo

1. **Approval when other people are affected**, as predicates over the call's arguments:
   ```ts
   // create-event.ts:340–345
   needsApproval: ({ sendUpdates, attendees, eventType, autoDeclineMode }) =>
     sendUpdates === "all" || sendUpdates === "externalOnly" ||
     (sendUpdates === undefined && (normalizeAttendees(attendees)?.length ?? 0) > 0) ||
     (eventType === "outOfOffice" && autoDeclineMode !== "declineNone"),
   // update-event.ts:231–240
   needsApproval: ({ sendUpdates, notificationMessage, targetAccountEmail, addAttendees }) =>
     targetAccountEmail !== undefined || sendUpdates === "all" ||
     !!notificationMessage?.trim() || (sendUpdates === undefined && namesGuests(addAttendees)),
   // delete-event.ts:55–57
   needsApproval: ({ sendUpdates, notificationMessage, removeOnly }) =>
     !rawCliBoolean(removeOnly) && (sendUpdates === "all" || !!notificationMessage?.trim()),
   ```
   So a solo event on your own calendar is created, moved or deleted **without** a prompt.
   Inviting guests, notifying them, auto-declining conflicts and cross-account moves all
   require approval. `cancel-booking` always requires approval
   (`AN templates/calendar/actions/cancel-booking.ts:17–18`).
2. **Preview-then-commit for bulk changes.** `delete-events` has
   `needsApproval: ({ dryRun }) => !rawCliBoolean(dryRun)`
   (`AN templates/calendar/actions/delete-events.ts:121–122`); the description says "Call once
   with dryRun true to show the user exactly what matches, then once more without dryRun to
   delete". Guards in `run`:
   - "Pass either explicit ids or a filter … not both";
   - "A bulk delete needs both from and to, or explicit ids";
   - series-wide scopes need exactly one explicit id;
   - booking-backed events are **skipped** with `BOOKED_EVENT_REASON` ("cancel the booking
     with \"cancel-booking\" instead");
   - read-only shared and overlay events are skipped.

   (`:123–200`; `AN templates/calendar/actions/event-action-helpers.ts:295–296`.)
   `update-events` has the same `dryRun` convention. We noted security-relevant gaps in the
   bulk-update path; they are recorded separately in a private note.
3. **Drafts before writes.** `manage-event-draft` stores an "unsent calendar invite draft"
   in `application_state["calendar-draft-{id}"]`. The UI shows "a visible placeholder on the
   calendar with the event detail editor so the user can review it before creating/sending"
   (`AN templates/calendar/actions/manage-event-draft.ts:31–39, 61–64`).
4. **Truthful reports, encoded in tests.** `delete-events.test.ts`:
   - "previews matches without deleting when dryRun is set" (`:323`);
   - "reports per-event failures instead of rounding them up to success" (`:351`);
   - "refuses to delete from an incomplete provider read" (`:442`);
   - "names an ICS feed it could not read so the report is not passed off as complete"
     (`:513`).
5. **Undo:**
   - Client: a **stack of up to 20** compensating closures (`MAX_UNDO_STACK = 20`;
     `AN templates/calendar/app/hooks/use-undo.ts:22–31`). This differs from Mail's single
     10-second slot.
   - Server: `undo-calendar-event-rule` restores the prior RSVP or hidden state for one
     automatic rule action. It is guarded by a short-lived claim token stored in user settings
     (`__calendarEventRuleUndoClaims`, TTL 5 min), and a concurrent undo gets a 409 "already
     being undone" (`AN templates/calendar/actions/undo-calendar-event-rule.ts:12–55`).
6. **Automatic invitation rules** (`server/plugins/event-rules.ts`): a 5-minute recurring sweep
   (`INTERVAL_MS = 5 * 60_000`, batches of 10, "five-minute RSVP lease") applies owner-private
   `eventRules.accept|decline|hide` prompts using Jev. Each action is recorded as an activity
   that `undo-calendar-event-rule` can reverse (`:26–30`; `AN templates/calendar/AGENTS.md:16`).

### 9.8 Tests

127 test files: 25 `actions/*.test.ts`, 6 `actions/*.spec.ts`, 26 in `server/lib`, plus
handlers and app hooks. Approval predicates are covered in
`cancel-booking.test.ts`, `delete-event.test.ts`, `delete-events.test.ts` and
`update-event.test.ts` (grep `needsApproval`).

### 9.9 Changes since 0.206.0

12 commits, mostly cross-cutting:
- MCP schema and annotation audits (`git 9c277b79c`, `git ca67d217b`, `git fab1c27c7`);
- starter migrations in `migrate:production` (`git 579d66ca4`);
- `fail()` details shown to agents (`git 578c558da`);
- Netlify keep-warm opt-in (`git cd60213c8`).

### 9.10 Gaps

- Marketing says: "You choose a suggested time before it books the meeting"
  (https://www.agent-native.com/apps/calendar/). The agent docs say: "Schedule a 30-minute call
  with Alex tomorrow at 2pm. The event appears … No dialog needed"
  (`docs template-calendar-agent 38–39`). The code: inviting Alex makes `create-event` approval-gated
  (attendees > 0). An event with no guests needs no approval and no choice step. So
  "choose before booking" is a prompting convention (`find-a-time` returns options), not a
  gate, and "no dialog" is wrong whenever there are guests **(inference from code)**.
- `view-screen` reads `readAppState("navigation")` (`AN templates/calendar/actions/view-screen.ts:80`),
  while Mail reads `readAppStateForCurrentTab("navigation", { fallbackToGlobal:false })`.
  Whether Calendar's read is tab-scoped depends on Core's default resolution. (Checked in
  editing: it is. `readAppState` suffixes the six ambient keys with the request's browser
  tab, `AN packages/core/src/application-state/script-helpers.ts:38–42,137–138`.)
- `UPGRADING.md` refers to "The `scheduling` sibling template", which does not exist in
  `templates/` at HEAD (only the package does) (`AN templates/calendar/UPGRADING.md`).

---

## 10. A third look: Plan (`templates/plan`), the review workflow

The template for structured documents that a human reviews before work happens. Relevant as
a pattern for agent-authored structured plans **(inference)**.
- 51 actions; tables `plans, plan_sections, plan_comments, plan_events, plan_reports,
  plan_versions, plan_shares, plan_guest_mints, plan_assets`
  (`docs template-plan-developers` DataModel). Runtime plans are "normalized JSON in SQL; MDX
  files are source control" (`AN templates/plan/AGENTS.md`, Core Rules).
- **Write discipline for agent edits** (`AN templates/plan/actions/update-visual-plan.ts:489–548`):
  - Granular `contentPatches` addressed by stable block id are the default.
  - Full replacement and `replace-blocks` are "Destructive". They require `expectedUpdatedAt`
    from a fresh read ("Read the latest plan, copy plan.updatedAt exactly, and do not reuse a
    revision after another write succeeds") — optimistic concurrency.
  - A write that removes block ids or collapses a canvas also needs
    **`allowDestructive: true`**: "Set true only after reviewing the latest plan and
    intentionally accepting those losses; expectedUpdatedAt is still required".
- **Feedback loop.** Comments target "either the **agent** or a **human** reviewer"
  (`docs template-plan-review-workflow 17–23`). The agent reads them with
  `get-plan-feedback`, makes the change, "re-reads the plan to confirm the change actually
  landed", then `resolve-plan-comment` plus `consume-plan-feedback` (`:42–47`). Delete is
  soft (`:97–101`).
- **Versions.** "`restore-plan-version` snapshots the current plan first (so restoring is
  itself reversible)" (`:103–109`). This is app-owned, not the History Kit.
- Plan is "fenced — separate team ownership" from the twin-route guard
  (`AN scripts/guard-no-action-twin-routes.mjs:51`). Its 15 commits since 0.206.0 include
  "Preserve tool history and render legacy Plan blocks" (`git afe2ee7e4`).

---

## 11. Patterns from the other templates (skimmed)

| Template | Pattern | Source |
|---|---|---|
| Forms | Read-modify-write of a JSON field array under a **per-form promise-chain lock**: `withFormLock(id, fn)` chains on a `Map<string, Promise>` in `globalThis`. It reads the row *inside* the lock, validates with `assertValidFields`/`assertPublishableForm` (if published) and invalidates the 60 s public cache | `AN templates/forms/actions/patch-form-fields.ts:20–46`; `docs template-forms-developers 228–267` |
| Slides | One JSON blob per deck (`decks.data`). Every write takes `withDeckLock`, the same promise-chain lock. The browser enqueues granular ops through `patch-deck`: "Do not add a new full-deck PUT. That would reintroduce the last-write-wins race". "Every meaningful change, yours or the agent's, snapshots the deck first … Restoring takes its own snapshot first" | `AN templates/slides/actions/patch-deck.ts:108–121`; `docs template-slides-developers 18–29`; `docs template-slides-features 85–87` |
| Brain | Ingest → raw capture → distill → **proposal reviewed by a human** → knowledge; "Brain won't guess" and gives honest not-found; the public A2A surface is "read-only and citation-backed by design" | `docs template-brain 13–16, 140–142`; `docs template-brain-knowledge 16`; `docs template-brain-agent 90` |
| Content | Parity matrix of UI entry point to action, with meta-tests; external source changes land "as a reviewable change set, never a silent overwrite"; `DataGrid` adapter | `docs template-content 106`; earlier note §2.14 |
| Dispatch | Org-level approval flow for "durable changes" (saved destinations, all-app resources, Dream proposals): "can require a second admin's OK" | `docs template-dispatch-features 253–273` |
| Clips | Consent-by-default for sensitive capture: "Rewind is off by default … nothing leaves your device unless you approve it"; non-destructive edits layered over the original | `docs template-clips-features 131, 208` |
| Design | Delete "asks for confirmation first"; versions with "Restore this version"; review comments via the Review kit (`server/plugins/review.ts`) | `docs template-design-features 50–52, 262–264` |
| Forms (roles) | Per-app roles through `defineAppRoles` and `authorize` guards; "A direct share alone does not satisfy this app-permission check" | `docs template-forms 137–141` |

**(inference)** The per-resource locks in Forms and Slides are process-local (`globalThis`
Map). Two concurrent writers routed to different serverless instances are not serialized,
so "never overwrite each other's work" holds only within one instance.

---

## 12. Community templates (`community-templates/`)

- Nine GTM-flavoured apps: `account-expert`, `account-tiering`, `call-follow-up-drafter`,
  `churn-early-warning`, `demo-clip-library`, `linkedin-icp-prospect-tracker`,
  `linkedin-signal-watch`, `outbound-in-your-voice`, `win-loss-memo`. They form a workspace
  (`agent-native.workspaceCore: "@agent-native/core"`, `deployment.workspace.appsDirectory: "."`)
  deployed to Netlify as one site (`AN community-templates/{package.json,agent-native.config.ts,netlify.toml}`).
- They are **near-identical Chat derivatives**. Each has the same 7 actions (`hello`,
  `navigate`, `view-screen`, `provider-api-request`, `run`, `get-workflow`,
  `set-workflow-selection`) and its `AGENTS.md` still opens "# Chat — Agent Guide". They differ
  only in `app/lib/workflow.ts` (static demo items), branding and the Slack prompt
  (`diff -rq call-follow-up-drafter win-loss-memo`). Workflow data is seeded into
  **application state**, not tables (`WORKFLOW_STATE_KEY = "call-follow-up-drafter:workflow-data"`,
  `AN community-templates/call-follow-up-drafter/actions/get-workflow.ts:10–52`).
- Install path for third parties: `create --template community:owner/repo#ref`. "The CLI
  downloads the source only. It does not install dependencies or run the template's scripts"
  (`docs creating-templates 527–544`). Requirements for workspace sources and catalog
  listing: `docs cloneable-saas 36–148`.
- Since 0.206.0: 2 commits (an icon, Netlify keep-warm).

---

## 13. `packages/shared-app-config` and `packages/skills`

- **`@agent-native/shared-app-config` 0.1.2** (MIT). `TemplateMeta` is
  `{ name, label, hint, description?, icon, color, colorRgb, devPort, prodUrl?, prodPath?,
  defaultMode?, hidden?, defaultAgent?, alwaysAvailable?, requiredPackages?, core? }`
  (`AN packages/shared-app-config/templates.ts:1–18`).
  - 15 entries. Hidden: `tasks`, `crm`, `factory`.
  - `requiredPackages`: Calendar `["scheduling"]`; Content, Slides and Analytics
    `["creative-context"]`; Design and Assets `["embedding","creative-context"]`.
  - `defaultAgent: true` on Brain and Assets; `alwaysAvailable` on Chat.
  - `index.ts` turns the catalogue into `AppConfig`/`APP_REGISTRY` (dev URL
    `http://localhost:<devPort>`, `FRAME_PORT = 3334`, `CHAT_FIRST_DEFAULT_APP_IDS =
    ["content","design","mail","calendar","clips"]`) (`AN packages/shared-app-config/index.ts:150–261`).
  - `create` uses `requiredPackages` to add packages to a new workspace
    (`AN packages/core/src/cli/create.ts:1998–1999`).
  - A CLI copy exists (`packages/core/src/cli/templates-meta.ts`), kept in step by
    `guard:template-list`.
- **`@agent-native/skills`** is a separate installer CLI, not the template skills. "Install
  BuilderIO skill folders into Codex and Claude skill directories". Plain skills come from
  `BuilderIO/skills@main` at install time; app-backed skills (`visual-plan`, `visual-recap`,
  `visualize-repo`, `content`) "delegate to `@agent-native/core` so mode selection, MCP
  registration, and local-files instructions stay in one framework-owned flow". It also
  documents `skills update scaffold --project` for generated apps
  (`AN packages/skills/README.md:1–48`). 8 commits since 0.206.0.

---

## 14. The docs format for templates and `docs-components`

- Every template has **five pages**: Overview, Features, Talk to the Agent, Cross-App Use
  (Integrations), Developer Guide. Chat was brought into line on 2026-10-19: "The Chat docs did
  not follow the five-page structure the other apps use" (`git dd132f705`). Mail splits
  Features into Inbox and Drafts & Queue.
- Developer pages share a skeleton: Quick start → Action inventory → Data model (a
  `<DataModel>` block) → "An action walked through" (`<AnnotatedCode>`) → Routes reference
  (`<FileTree>`) → Customizing it → What's next.
- `docs-components` documents the general MDX set: `Callout` (tones info, warning, success,
  risk, decision), `Steps`, `Sequence`, `Cards`, `Notice`, `Banner`, `Accordion`, `Badge`,
  `Comparison`, `Image`, `Video`, `Signature`, `[[kbd]]`, Mermaid, `FileTree`, `TabsBlock`,
  `Columns`, plus a "when to use which" table (`docs docs-components 874–894`). It does **not**
  document `WireframeBlock`/`Screen`, `Diagram`, `DataModel` or `AnnotatedCode`, which the
  template pages use heavily.

---

## 15. How Builder.io packages and sells it (live site, 2026-10-20)

- **/apps/** (https://www.agent-native.com/apps/): "Open-source agentic apps you own. Start
  from a working app and let the agent evolve it." It lists 11 apps, each tagged **alpha**:
  Design, Slides, Analytics, Calendar, Clips, Mail, Assets, Content, Dispatch, Forms, Plans.
  Chat is not listed. Calls to action: "Build online" (Builder.io) and "Read the docs". The
  header star badge reads 7.5k.
- **/apps/mail/** (https://www.agent-native.com/apps/mail/): sold as "**Jev**". "Take control
  of your inbox with Jev … Tell Jev what matters in plain English". Features: priority sorting,
  contextual AI labels, background automations, "Review before sending", "A spam filter that
  learns". FAQ: "When you ask the AI agent to send an email in chat, it requires your
  approval. Automation-triggered sends also require approval unless you explicitly enable
  automatic sending". "The requester cannot send it on your behalf; the draft owner or an
  organization admin controls sending." In code, priority and filter need "Builder Jev access
  or a direct Jev API key" (`get-ai-priority`, `get-jev-availability` descriptions). Jev is the
  Builder-backed upsell inside an MIT app **(inference)**.
- **/apps/calendar/** (https://www.agent-native.com/apps/calendar/): "Check real availability
  across calendars, then review a clear proposal before a meeting is created or moved";
  "Reschedule … prepare the updated invite for your review"; "You choose a suggested time
  before it books the meeting". Limits stated: Google only; ICS feeds read-only; shared
  calendars view-only and don't block availability.
- **/apps/plan/** (https://www.agent-native.com/apps/plan/): "See what your AI coding agent
  plans to build" (`npx @agent-native/core@latest skills add visual-plan`). The demo canvas is
  a "Personal Habit Tracker" plan.
- **/pricing/** (https://www.agent-native.com/pricing/): "$ Zero … MIT licensed. Every feature,
  every template, unlimited seats, no credit meter." Fine print: "AI tokens are not free";
  "Hosting is not free (unless it is)"; "There's an easy button that costs money … turn on
  Builder.io". "The framework is MIT licensed. We make money if you choose our backend. That's
  the whole business model."
- **/skills/** (https://www.agent-native.com/skills/): "app-backed skills": `/visual-plan`,
  `/visual-recap`, `/visual-edit` for Claude Code, Codex, Cursor and others, installed with
  `npx @agent-native/core@latest skills add`.
- The docs add: "Every example app is also available as a hosted product on `agent-native.com`
  … Use the hosted version for free or paid" (`docs cloneable-saas 274–276`). "The framework's
  maintainer runs his email, calendar, and analytics on the Mail, Calendar, and Analytics
  apps" (`:161`). The first-run "free credits" offer is being A/B-tested in Toolkit
  (`git 8e8419361`).

**The model (inference):** templates are the free funnel. Each is a "Cloneable SaaS" ("you
start from a finished product, not a scaffold", `docs cloneable-saas 10`). Revenue comes from
the Builder.io backend (tokens, storage, database, deploys, auth), Builder Connect,
Jev-powered features and "Build online".

---

## Principles list

1. **One action surface.** The UI, the agent, HTTP, MCP and CLI call the same `defineAction`;
   no pass-through `/api/*` routes (`AN AGENTS.md:207–231`; `AN packages/core/blueprints/action/crud.md`).
2. **Ratchet, don't big-bang.** Known violations sit in baselines that "may shrink, never
   grow" (`AN scripts/guard-no-action-twin-routes.mjs:15–20, 571–573`;
   `AN scripts/template-standard-baseline.json`).
3. **Toolkit for repeated, governed, agent-visible behaviour; the domain stays in the app**
   (`docs agent-native-toolkit 201–206`;
   `AN templates/mail/.agents/skills/agent-native-toolkit/SKILL.md:18–34`).
4. **Presentation is never an authorization boundary.** Toolkit views receive data and
   callbacks; Core checks access (`docs toolkit-context-knowledge 72–74`;
   `docs toolkit-agent-ux 46`).
5. **Use the smallest customization tier:** tokens → semantic components → product slots →
   eject (`docs custom-design-system 35–37`; `docs agent-native-toolkit 156–159`).
6. **Ownership transfer is explicit, recorded and reversible.** Hashes and provenance are
   committed; restore refuses when there are local edits (`docs package-lifecycle 55–73`;
   `AN packages/core/src/cli/eject.ts:596–710`).
7. **A merge needs a base, and nothing is overwritten just because it differs**
   (`docs syncing-template-changes 41–49`).
8. **Context is an app-defined, bounded snapshot injected every turn**
   (`AN packages/core/src/agent/production-agent.ts:13177–13210`; `AN templates/mail/actions/view-screen.ts:52–55`).
9. **Approval follows blast radius.** Ask when other people are notified or something leaves
   the system, not on every write (`AN templates/calendar/actions/create-event.ts:340–345`;
   `AN templates/mail/server/lib/automation-settings.ts:20–27`).
10. **Preview before destroying, and make loss or duplication an explicit argument.** See
    `dryRun`, `allowDestructive` + `expectedUpdatedAt`, `duplicateRiskAcknowledged: true`
    (`AN templates/calendar/actions/delete-events.ts:121–122`;
    `AN templates/plan/actions/update-visual-plan.ts:536–548`;
    `AN templates/mail/actions/retry-uncertain-scheduled-email.ts:17–22`).
11. **Partial is not empty, and failures are not rounded up to success**
    (`AN templates/mail/AGENTS.md:37`; `AN templates/calendar/AGENTS.md:20`;
    `AN templates/calendar/actions/delete-events.test.ts:351, 442`).
12. **Never guess identities or addresses; refuse instead** (`AN templates/mail/AGENTS.md:35`;
    `AN templates/mail/.agents/skills/draft-queue/SKILL.md:21`).
13. **At most once for irreversible side effects.** Claim, stamp "started", and park as
    `uncertain` instead of retrying blind (`AN templates/mail/server/lib/jobs.ts:284–307, 961–981`).
14. **Restore is a new action that snapshots first** (`docs toolkit-history 72–79`;
    `docs template-plan-review-workflow 103–109`; `docs template-slides-features 85–87`).
15. **Drafts live in shared app-state that the human sees and edits before commit.** See
    `compose-{id}`, `calendar-draft-{id}`, and the queued-draft table
    (`AN templates/calendar/actions/manage-event-draft.ts:31–39, 61–64`).
16. **Third-party requests are queued for the owner, never executed for them.** On the Slack
    surface this is structural: `send-email` is deleted from the action set
    (`AN templates/mail/server/plugins/integrations.ts:14`).
17. **Instructions have a budget:** `AGENTS.md` ≤ 6,000 characters and ≤ 40 starter tools; the
    rest goes in skills or `tool-search` (`AN scripts/guard-agent-chat-context.ts:5–9`).
18. **Skills are scoped:** `dev` (coding agents), `runtime` (in-app agent), or `both`
    (`AN packages/core/src/server/agent-chat/skill-frontmatter.ts:45–72`).
19. **Per-user customization lives in SQL, not in per-user code** (`docs cloneable-saas 224–229`).
20. **Schemas are additive.** Destructive DDL needs an inline pragma with a reason
    (`docs creating-templates 217–225`; `AN templates/mail/server/plugins/db.ts:455, 478–506`).
21. **Parity is measured against a named reference product, with case IDs and evidence,
    never claimed globally** (`AN templates/mail/.agents/skills/mail-interaction-parity/SKILL.md:52–62`;
    `AN templates/calendar/INTERACTION-MATRIX.md:1–7`).
22. **Every feature touches four areas: UI, action, skill or `AGENTS.md`, and app-state**
    (`docs template-calendar-developers 482`).
23. **Recipes, not generators.** The framework ships a blueprint; the coding agent edits
    (`docs blueprint-installer 15–17`).
24. **Acknowledge UI input within 100 ms, never more than 400 ms**
    (`AN templates/mail/AGENTS.md:31`), and **no default chrome**: no titles, subtitles or
    stat strips by default (`AN AGENTS.md:340–354`).

---

## Docs vs code

1. **`createSharesTable` signature.** `docs toolkit-sharing 51–54` (and the live page) calls
   `createSharesTable("dashboard_shares", dashboards)`. Code:
   `export function createSharesTable(tableName: string)`, one parameter
   (`AN packages/core/src/sharing/schema.ts:33`). `docs creating-templates 214` and
   `docs template-chat-developers` use the correct one-argument form.
2. **`registerShareableResource` fields.** `docs toolkit-sharing 56–61` passes `{ type,
   displayName, table, sharesTable }`. Code requires `resourceTable` (not `table`) plus
   `getDb` (`AN packages/core/src/sharing/registry.ts:11–39`). Calendar and the Chat tutorial
   use the code's shape (`AN templates/calendar/server/db/index.ts:9–17`).
3. **`ownableColumns()`** is said to add "owner, organization, visibility, and timestamps"
   (`docs toolkit-sharing 26`). Code adds `owner_email`, `org_id` and `visibility` only
   (`AN packages/core/src/sharing/schema.ts:3–13`).
4. **Org & Team imports.** `docs toolkit-org-team 116–123` imports `RequireActiveOrg` and
   `TeamPage` from `@agent-native/core/client/org-team`. That module re-exports only
   `client/org/hooks.ts` (`AN packages/core/src/client/org-team/index.ts`,
   `client/org/index.ts`). The components live in `@agent-native/toolkit/app/org`
   (`AN packages/toolkit/src/app/org/TeamPage.tsx`).
5. **Observability tabs.** The docs say "5 tabs (overview, conversations, evals,
   experiments, feedback)" (`docs toolkit-observability 67`). Code has six `TabsContent`,
   including `review` (`AN packages/toolkit/src/app/observability/ObservabilityDashboard.tsx:3165–3189`).
   `review` is possibly conditional; not verified.
6. **Mail `send-email` approval** is documented as `needsApproval: true`
   (`docs template-mail-developers 52`). Code: a predicate that is false for an automation
   whose owner opted in (`AN templates/mail/actions/send-email.ts:197–198`).
7. *(Recorded separately in a private note.)*
8. **Mail scheduling actions marked "UI-only".** `docs template-mail-developers 62` lists
   `create-scheduled-job / list-scheduled-jobs / update-scheduled-job` as UI-only
   (`agentTool:false`). Only `update-scheduled-job` is; `create-scheduled-job` is even in
   `INITIAL_TOOL_NAMES` (`AN templates/mail/server/plugins/agent-chat.ts:22`). The
   inventory also omits `create-scheduled-send`, `list-inbox-threads`, `sync-inbox`,
   `resync-inbox`, the AI-filter and priority actions, and the uncertain-send actions.
9. **Mail data model** (`docs template-mail-developers 104–252`) shows 8 app tables plus
   `oauth_tokens`. Code has 15. Missing from the docs: `mail_sync_accounts`,
   `mail_inbox_threads`, `mail_inbox_push_invalidations`, `mail_gmail_quota_budgets`,
   `mail_gmail_token_accounts`, `mail_ai_filter_backfills`, `mail_ai_filter_rule_undo`. The
   `scheduled_jobs.status` enum lacks `uncertain` and `retry_queued`, and `automation_rules`
   lacks `kind` (`AN templates/mail/server/db/schema.ts`).
10. **"Agent behavior is changed by editing markdown — not code"** (`docs
    template-mail-developers 336`). Much of Mail's behaviour policy is a TypeScript string:
    the 125-line `systemPrompt` (`AN templates/mail/server/plugins/agent-chat.ts:100–224`)
    and the Slack prompt (`AN templates/mail/server/plugins/integrations.ts:16–30`).
11. **Calendar "No dialog needed."** `docs template-calendar-agent 38–39` says "Schedule a
    30-minute call with Alex tomorrow at 2pm" needs no dialog. With an attendee,
    `create-event.needsApproval` is true
    (`AN templates/calendar/actions/create-event.ts:340–345`).
12. **Calendar shares table.** `docs template-calendar-developers 337–346` gives
    `booking_link_shares` the fields `linkId, principal, role viewer|editor|admin`. Code
    (via `createSharesTable`) has `resource_id, principal_type, principal_id, role
    viewer|commenter|editor|admin, created_by, created_at, notified_at`.
13. **`templates/calendar/UPGRADING.md`** points to "The `scheduling` sibling template",
    which does not exist at HEAD.
14. **Template-sync exclusions.** The docs list `.env`, `.env.local`, lockfiles, generated
    output, `learnings.md` and "pending entries under `changelog/`"
    (`docs syncing-template-changes 137–146`). Code excludes any `.env*`, **all** of
    `changelog/`, and `data/pglite` (`AN packages/core/src/cli/template-sync.ts:233–245`).
    Minor.
15. **AGENTS.md truncation.** "the runtime prompt cuts the file off at 6,000 characters"
    (`docs template-chat-developers` "Tell the agent about it"). That is true for the compact
    prompt; the non-compact cap is 30,000
    (`AN packages/core/src/server/agent-chat/prompt-resources.ts:50–51`). The repo guard
    holds every template to 6,000 anyway.
16. **`docs-components` omits the components the template docs rely on**:
    `WireframeBlock`/`Screen`, `Diagram`, `DataModel`, `AnnotatedCode`.
17. **Marketing vs code.** Calendar: "You choose a suggested time before it books the
    meeting" (https://www.agent-native.com/apps/calendar/). Code has no "choose" gate for
    guest-less events; it is prompt guidance. Slides docs say concurrent writers "never
    overwrite each other's work" (`docs template-slides-developers 20`); the lock is
    process-local (`AN templates/slides/actions/patch-deck.ts:108–121`) **(inference about
    multi-instance behaviour)**.

## What the earlier trainm8 notes got wrong, or what has changed since 0.206.0

- **Licence:** [`agent-native.md`](../agent-native.md) §4 says there is "no root `LICENSE` file". Since `git
  0cfbd4dde` (2026-10-19) there is a root MIT `LICENSE` ("Copyright (c) 2026 Builder.io,
  Inc.") and one in each MIT package. The root `package.json` licence changed from ISC to
  MIT. Templates still ship no licence file (`templates/mail/` listing).
- **Action counts** in [`agent-native.md`](../agent-native.md) §3 count every `.ts` in `actions/`, including helper
  modules. Real counts at HEAD: Mail 83 (not 85: `helpers.ts`, `run.ts`); Calendar 55 (not 60:
  `action-chat-ui.ts`, `event-action-helpers.ts`, `event-search.ts`, `helpers.ts`, `run.ts`).
  File counts have also grown: Analytics 188→210, Design 184→202, Clips 147→154,
  Content 243→245, Slides 87→88.
- **Mail summary** ("Realtime (`useDbSync`) and `needsApproval` on send", §3): needs
  qualifications. The approval is a predicate with an automation opt-in, and realtime SSE is
  requested only on inbox paths. A further qualification about the send path is recorded
  separately in a private note.
- **Star badge** on the site: 7.1k in the earlier note, **7.5k** on 2026-10-20 (header of
  https://www.agent-native.com/apps/).
- **Upgrade picture** ([`agent-native-open-stack.md`](../agent-native-open-stack.md) §6) is right that first-party templates
  "never pay an upgrade step". That is *because* of the sync scripts and ratchet guards in
  §6.1, which a generated app does not get. A generated app has `upgrade` + `template sync` +
  `eject` instead.

## Not verified

- Runtime behaviour. Nothing was run. In particular:
  - whether Slack-originated `send-queued-drafts` raises an approval and where it is shown;
  - whether the `review` observability tab is conditional.
- How `ctx.caller` is decided for HTTP action calls; see
  [appendix 01](01-principles-actions-runtime.md) §2.9.
- Content's parity matrix (39 rows), taken from the earlier note and not re-read.
- The template feature/agent/integration pages for templates other than Mail and Calendar
  were skimmed by keyword, not read line by line.
- Only three docs pages were checked against the live site (they matched).
- Whether an org admin sending another member's queued draft actually sends from the admin's
  mailbox or fails on `Account … not connected`. Code reading suggests it uses the
  **requester's** (admin's) tokens: `getAccessTokens()` with no owner
  (`AN templates/mail/actions/helpers.ts:126–135`) **(inference)**.

## Open questions

1. *(Recorded separately in a private note.)*
2. *(Recorded separately in a private note.)*
3. Is the History Kit meant to replace per-template `*_versions` tables, or is app-owned
   history the real pattern? No first-party template calls `registerVersionedResource`.
4. *(Recorded separately in a private note.)*
5. Do the Forms and Slides promise-chain locks hold on multi-instance serverless deploys, or
   is there a database-level guard elsewhere?
6. What exactly does `toolCallable:false` exclude? `docs creating-templates 292` says "should
   not run from sandboxed tools". Calendar sets it on `delete-event` while also listing that
   action in `initialToolNames`.
7. `@agent-native/scheduling` integration: Calendar declares `requiredPackages: ["scheduling"]`
   yet keeps its own booking tables. When does the "full migration" in `UPGRADING.md` land?
