---
name: icon-workflow
description:
  Standardizes icon work in this Trainm8 repo (Epic Stack + shadcn). Covers
  Tabler-first and Hugeicons-fallback via Sly CLI, SVG sprites with the shared
  Icon component, and cleanup after shadcn generates icon imports
  (`lucide-react` or `@tabler/icons-react`). Use whenever the user adds or
  changes icons, runs `npx shadcn add`, runs `npx shadcn init` (including
  `--preset`), edits `components.json`, mentions lucide/tabler icon imports,
  sprites, Sly, Tabler, Hugeicons, Radix icons, or
  `vite-plugin-icons-spritesheet`—even if they only ask to "add a component".
compatibility:
  React Router, vite-plugin-icons-spritesheet, Sly CLI (@sly-cli/sly), shadcn
  (components.json).
license: MIT
---

# icon workflow

## Out of scope

If the request is unrelated to icons, shadcn-generated icon imports
(`lucide-react` or `@tabler/icons-react`), the SVG sprite, or Sly, **do not**
drag in this workflow—handle the actual task (data, routing, tests, etc.)
instead.

## What this skill is for

Use this skill when the task involves:

- choosing an icon library
- adding icons via Sly CLI
- importing and rendering icons in UI code
- troubleshooting icon sprite/type generation
- **adding or updating UI via the shadcn CLI** (components/presets often pull in
  `lucide-react` or `@tabler/icons-react`)

## Project policy

- **Tabler is the only icon source.** The repo was fully migrated off Radix — do
  **not** add Radix (`@radix-ui/icons`) glyphs, and if you find one, replace it
  with the Tabler equivalent.
- Use Hugeicons **only** when Tabler genuinely lacks the required glyph.
- Keep one primary family (Tabler) and one fallback family (Hugeicons) to
  minimize style drift. Tabler glyphs are 24×24 stroke (`currentColor`); mixing
  in fill-based families breaks visual consistency.

## Source of truth in this repo

- Raw SVGs: `other/svg-icons`
- Sly config: `other/sly/sly.json`
- Sly transformer: `other/sly/transform-icon.ts`
- Sprite output: `app/components/ui/icons/sprite.svg`
- Icon component: `app/components/ui/icon.tsx`
- Icon name fallback type: `types/icon-name.d.ts`
- shadcn config: `components.json` (`iconLibrary: "tabler"`)

## Workflow (icons only)

1. Choose icon source:
   - check Tabler first
   - use Hugeicons only if needed
2. Add icon(s) with Sly CLI.
3. Build to regenerate sprite/types.
4. Render via `Icon` component in app code.
5. Verify naming and accessibility.

## Workflow (shadcn CLI + icons)

`components.json` may not fully control preset output. In practice, shadcn flows
can generate imports from either `lucide-react` or `@tabler/icons-react`
(especially with `npx shadcn init --preset ...`). This repo’s standard is the
**sprite `Icon`** for app-level consistency.

After adding a shadcn component:

1. Run the CLI from the repo root, e.g. `npx shadcn@latest add <name>` or
   `npx shadcn@latest init --preset <id> --base <base> --template react-router`.
2. In new/changed files, search for icon package imports:
   - `lucide-react`
   - `@tabler/icons-react`
3. For each imported icon component:
   - Prefer a **Tabler** equivalent; add the SVG with Sly into `other/svg-icons`
     (same basename you will use in `Icon name`).
   - Replace JSX usage with `<Icon name="kebab-name" />` (and `aria-hidden` /
     labels as needed).
4. Run `npm run build` so the sprite and `IconName` types stay correct.
5. If no reasonable Tabler/Hugeicons match exists, **leaving one package icon
   import is an acceptable exception**—do not block the PR on it, but default to
   `Icon` for consistency.

### shadcn-specific tips

- Respect existing aliases: `components.json` maps `ui` → `app/components/ui`,
  `@/…` for utils as configured.
- `iconLibrary` is set to `tabler`, so the shadcn CLI generates
  `@tabler/icons-react` imports (e.g. `IconCheck`, `IconChevronDown`,
  `IconSelector`). Keep that setting and **post-process generated files**: swap
  the package imports for the sprite `Icon` using the matching Tabler glyph
  name. Do not switch `iconLibrary` to lucide/radix.
- If a shadcn snippet uses icon components as props (e.g. `icon: ChevronRight`),
  refactor to `icon: () => <Icon name="chevron-right" />` or pass a small
  wrapper—match the consuming API.
- If a preset uses `@tabler/icons-react`, treat it as generated code to
  normalize: keep the glyph choice, but migrate rendering to sprite `Icon`
  unless there is a clear reason not to.

## Sly CLI commands

Use the `tabler` library (resolves to the `iconify:tabler` registry):

```bash
npx @sly-cli/sly add tabler <icon-name> --overwrite
npx @sly-cli/sly add tabler <icon-a> <icon-b> --overwrite
```

The Sly icon name is the Tabler glyph name (e.g. `chevron-down`, `selector`,
`search`, `mail`, `brand-github`, `device-laptop`, `x`, `dots`). Look glyphs up
at https://tabler.io/icons. The file lands at `other/svg-icons/<glyph>.svg`; if
you need a different sprite name (to keep an existing `Icon name` stable), `mv`
the downloaded file to that name afterwards.

> **Gotcha:** the `@tabler/icons` library routes through `iconify.design`, which
> can be Cloudflare-blocked from CI/agent environments and will silently write a
> "Sorry, you have been blocked" HTML page into the `.svg`. Prefer the `tabler`
> library, and after any add **verify** the file contains
> `stroke="currentColor"` and not `DOCTYPE html`/`Cloudflare`; retry on failure.

## Sly config guidance

`other/sly/sly.json` is the v2 schema and is Tabler-only:

- a single `iconify:tabler` library entry pointing at the shared `icons` config
  (`directory: ./other/svg-icons`, `transformers: ["transform-icon.ts"]`)
- no Radix entry — it was removed during the Tabler migration
- add a Hugeicons library entry only if a fallback glyph is ever required

Tabler is the only library, so it is always the selected source during installs.

## Build/regenerate

After adding SVGs:

```bash
npm run build
```

This regenerates the sprite/types used by `Icon`.

## Code usage pattern

Always render icons with:

```tsx
import { Icon } from '#app/components/ui/icon.tsx'
```

Examples:

```tsx
<Icon name="trash" />
<Icon name="plus">Add note</Icon>
<Icon name="check" aria-hidden="true" />
```

## Accessibility and naming rules

- Use `kebab-case` SVG file names.
- `Icon` name equals file name without `.svg`.
- Decorative icon: `aria-hidden="true"`.
- Icon-only controls: put accessible label on the control (`aria-label`),
  optionally add `title` on `Icon`.
- Only add icons actively used by UI.

## Troubleshooting

- Type error for icon name:
  - run `npm run build`
- Icon not rendering:
  - verify file exists in `other/svg-icons`
  - verify `Icon name` matches file name
- Visual mismatch:
  - replace fallback icon with Tabler equivalent when available
- After shadcn add/init, TypeScript errors on package icon imports:
  - if keeping package icons, ensure `lucide-react` or `@tabler/icons-react` is
    installed
  - otherwise replace with sprite `Icon` and remove unused imports

## Validation prompts

Use `EVALS.md` and `evals/evals.json` for trigger smoke tests. Eval artifacts
and the static review HTML live under `icon-workflow-workspace/`.
