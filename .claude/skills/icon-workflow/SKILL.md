---
name: icon-workflow
description: Standardizes icon work in this Trainm8 repo (Epic Stack + shadcn). Covers Tabler-first and Hugeicons-fallback via Sly CLI, SVG sprites with the shared Icon component, and cleanup after shadcn adds lucide-react. Use whenever the user adds or changes icons, runs npx shadcn add or shadcn CLI, edits components.json, mentions lucide-react, sprites, Sly, Tabler, Hugeicons, Radix icons, or vite-plugin-icons-spritesheet—even if they only ask to "add a component".
compatibility: React Router, vite-plugin-icons-spritesheet, Sly CLI (@sly-cli/sly), shadcn (components.json).
license: MIT
---

# icon workflow

## Out of scope

If the request is unrelated to icons, shadcn-generated `lucide-react` imports, the SVG sprite, or Sly, **do not** drag in this workflow—handle the actual task (data, routing, tests, etc.) instead.

## What this skill is for

Use this skill when the task involves:

- choosing an icon library
- adding icons via Sly CLI
- importing and rendering icons in UI code
- troubleshooting icon sprite/type generation
- **adding or updating UI via the shadcn CLI** (components often pull in `lucide-react`)

## Project policy

- Use Tabler as primary icon source.
- Use Hugeicons only when Tabler lacks the required glyph.
- Keep one primary family and one fallback family to minimize style drift.

## Source of truth in this repo

- Raw SVGs: `other/svg-icons`
- Sly config: `other/sly/sly.json`
- Sly transformer: `other/sly/transform-icon.ts`
- Sprite output: `app/components/ui/icons/sprite.svg`
- Icon component: `app/components/ui/icon.tsx`
- Icon name fallback type: `types/icon-name.d.ts`
- shadcn config: `components.json` (currently `iconLibrary: "lucide"`)

## Workflow (icons only)

1. Choose icon source:
   - check Tabler first
   - use Hugeicons only if needed
2. Add icon(s) with Sly CLI.
3. Build to regenerate sprite/types.
4. Render via `Icon` component in app code.
5. Verify naming and accessibility.

## Workflow (shadcn CLI + icons)

`components.json` sets `iconLibrary` to `lucide`, so **`npx shadcn add …` often generates `import … from 'lucide-react'`**. This repo’s standard is the **sprite `Icon`**, not bundling many Lucide components.

After adding a shadcn component:

1. Run the CLI from the repo root, e.g. `npx shadcn@latest add <name>` (use flags your team prefers; keep `components.json` paths).
2. In the new/changed files under `app/components/ui/`, search for `lucide-react`.
3. For each Lucide icon used:
   - Prefer a **Tabler** equivalent; add the SVG with Sly into `other/svg-icons` (same basename you will use in `Icon name`).
   - Replace the Lucide JSX with `<Icon name="kebab-name" />` (and `aria-hidden` / labels as needed).
4. Run `npm run build` so the sprite and `IconName` types stay correct.
5. If no reasonable Tabler/Hugeicons match exists, **leaving that one `lucide-react` import is an acceptable exception**—do not block the PR on it, but default to `Icon` for consistency.

### shadcn-specific tips

- Respect existing aliases: `components.json` maps `ui` → `app/components/ui`, `@/…` for utils as configured.
- Do not change `iconLibrary` in `components.json` unless the team explicitly standardizes on something else; **post-process generated files** instead so CLI keeps working predictably.
- If a shadcn snippet uses icon components as props (e.g. `icon: ChevronRight`), refactor to `icon: () => <Icon name="chevron-right" />` or pass a small wrapper—match the consuming API.

## Sly CLI commands

Recommended interactive flow:

```bash
npx sly add
```

Direct flow:

```bash
npx sly add <library> <icon-name>
npx sly add <library> <icon-a> <icon-b>
npx sly add <library> <icon-name> --yes --overwrite
```

If you are unsure about the exact registry library name for Tabler/Hugeicons, run interactive mode and select the correct library from the list.

## Sly config guidance

Keep `other/sly/sly.json` aligned to this policy:

- include a Tabler library entry to `./other/svg-icons`
- optional Hugeicons library entry for fallback usage
- keep `transform-icon.ts` transformer enabled

Use Tabler as the default selected library during installs.

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
- Icon-only controls: put accessible label on the control (`aria-label`), optionally add `title` on `Icon`.
- Only add icons actively used by UI.

## Troubleshooting

- Type error for icon name:
  - run `npm run build`
- Icon not rendering:
  - verify file exists in `other/svg-icons`
  - verify `Icon name` matches file name
- Visual mismatch:
  - replace fallback icon with Tabler equivalent when available
- After shadcn add, TypeScript errors on Lucide imports:
  - ensure `lucide-react` is in `package.json` if you keep Lucide icons; otherwise replace with `Icon` and remove unused imports

## Validation prompts

Use `EVALS.md` and `evals/evals.json` for trigger smoke tests. Eval artifacts and the static review HTML live under `icon-workflow-workspace/`.
