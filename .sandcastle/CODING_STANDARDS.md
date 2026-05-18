# Coding Standards

These standards are loaded by the reviewer agent via
`@.sandcastle/CODING_STANDARDS.md`. They reflect the conventions in this Epic
Stack + React Router 7 codebase. The associated agent skills (`icon-workflow`,
`react-router-framework-mode`, `playwright-best-practices`, `shadcn`, `coss`,
`improve-codebase-architecture`) are the source of truth when these rules need
elaboration.

## Domain language

- Use the exact terms defined in `CONTEXT.md` (Workout Template, Workout
  Session, Session Log, Upcoming Ledger, 14-Day Horizon, etc.). Avoid the
  "_Avoid_" synonyms listed there.
- Do not invent metrics. Anything that can't be truthfully derived is an
  **Unavailable Metric** and must render as unavailable — never with placeholder
  or mock numbers.
- Architectural decisions live in `docs/adr/`. Reference an ADR by number when a
  change touches a documented decision.

## Style

- TypeScript everywhere. No `any`; use `unknown` + narrowing or a typed schema
  (`zod`).
- camelCase for variables/functions, PascalCase for components and types. Prefer
  named exports.
- Import app modules via the `#app/*` alias and tests via `#tests/*` — not
  relative `../../..` paths.
- Tailwind classes only; do not introduce ad-hoc CSS files. Use `cn()` from
  `#app/utils/misc` to compose class lists.
- Use `@epic-web/invariant` for runtime invariants rather than ad-hoc
  `throw new Error`.
- Format with `prettier` (config from `@epic-web/config`). Don't override
  formatting locally.

## React & React Router (framework mode)

- Routes follow the file-based convention in `app/routes/`. Data loading belongs
  in `loader`; mutations in `action`. Don't fetch in components when a loader
  can do it.
- Use `Form`, `useFetcher`, `useNavigation`, and `useNavigate` from
  `react-router`. Don't reach for client-only state when route state fits.
- URL is the source of truth for shareable state. The **Activity Query** pattern
  in `CONTEXT.md` is the canonical example — filters that should survive
  reload/sharing go in the URL, not component state.
- Validate all `action`/`loader` inputs with `zod` (typically via
  `@conform-to/zod`). Never trust `FormData` directly.
- Server-only modules must use `vite-env-only` (`serverOnly$`) to keep secrets
  and Node APIs out of the client bundle.
- Errors surface through route `ErrorBoundary`. Don't swallow exceptions in
  loaders/actions.

## Components & UI

- Use shadcn components from `#app/components/ui` first. Add new ones via
  `npx shadcn add` against the configured style (`base-luma`, baseColor
  `olive`).
- For lower-level primitives (dialogs, popovers, menus), use `@base-ui/react`
  per the `coss` skill — not Radix directly.
- Compose, don't fork. If a component grows boolean prop sprawl, refactor to
  compound components or `children`/render-prop composition rather than adding
  another flag.
- Keep components focused. Co-locate component tests as `component.test.tsx`
  next to the source.

## Icons

- Icons go through the shared `Icon` component backed by the SVG sprite — never
  import from `lucide-react` or `@tabler/icons-react` in feature code.
- Add icons via Sly: Tabler first, Hugeicons fallback. After running
  `npx shadcn add`, clean up any `lucide-react` / `@tabler/icons-react` imports
  the generator introduces and replace with the `Icon` sprite reference. See the
  `icon-workflow` skill.

## Forms

- Use `@conform-to/react` + `@conform-to/zod` for every form. Don't hand-roll
  `useState` form state.
- The zod schema is the single source of truth for both client validation and
  server parsing in the `action`.

## Database (Prisma)

- Schema changes go through `prisma migrate` — never edit SQLite files directly.
  Generated SQL stays under version control.
- Authorization is per-`Owner`. Every loader/action that reads or writes ownable
  rows (Workout Template, Workout Session, Session Log, …) must scope the query
  by the authenticated user's id.
- Store timestamps as **Scheduled At (UTC)**; only convert to **Local Display
  Time** at the presentation layer.

## Testing

- Unit / component tests: Vitest + Testing Library. Test observable behaviour,
  not implementation details. Query by role/label/text — not by `data-testid`
  unless there's no semantic alternative.
- E2E: Playwright, following `playwright-best-practices` (web-first assertions,
  no manual `waitForTimeout`, role-based locators, mock at the network layer
  with MSW or route interception, not in the app code).
- Every loader/action that branches on input state should have at least one test
  that exercises each branch (happy path + auth/validation failure).
- Tests must run deterministically. No real network, no real clock — use
  fixtures and explicit time control.

## Accessibility

- Every interactive element must be reachable and operable via keyboard, with a
  visible focus state.
- Use semantic elements (`button`, `a`, headings, lists) over generic
  `div`/`span` with handlers.
- All form fields have an associated `<label>` (or `aria-label` when visually
  impossible). Error messages link via `aria-describedby`.
- Don't ship icon-only controls without an accessible name (`aria-label` or
  visually hidden text).

## Architecture

- One responsibility per module. If a file mixes loader logic, business rules,
  and presentation, split it.
- Push domain logic out of route files into `app/utils/` or a dedicated domain
  module so it can be unit-tested without a route harness.
- Prefer composition over inheritance and over configuration-by-flags.
- Before adding a new abstraction, check whether an existing one already fits —
  the `improve-codebase-architecture` skill is the right tool when similar
  shapes start to multiply.

## Performance

- Don't ship server-only dependencies to the client. Audit imports when pulling
  in a new package.
- Loaders should select only the columns/relations they actually need. Avoid
  `include`-everything Prisma queries.
- Use `<Link prefetch="intent">` for likely-next navigations; don't prefetch
  indiscriminately.

## Security

- No secrets in the client bundle. Anything touching `process.env` outside
  Vite-injected `VITE_*` vars is server-only.
- All user-supplied input is validated with `zod` before it reaches the
  database.
- Authorize before you query — confirm the requesting user owns the resource,
  then load it. Don't load-then-check.
