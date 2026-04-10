---
name: icon-workflow
description: Standardizes icon decisions and implementation in this project. Use when adding icons with Sly CLI, choosing between Tabler and Hugeicons, or importing/rendering icons through the SVG sprite Icon component.
compatibility: React Router app using vite-plugin-icons-spritesheet and Sly CLI.
license: MIT
---

# icon workflow

## What this skill is for

Use this skill when the task involves:

- choosing an icon library
- adding icons via Sly CLI
- importing and rendering icons in UI code
- troubleshooting icon sprite/type generation

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

## Workflow

1. Choose icon source:
   - check Tabler first
   - use Hugeicons only if needed
2. Add icon(s) with Sly CLI.
3. Build to regenerate sprite/types.
4. Render via `Icon` component in app code.
5. Verify naming and accessibility.

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

## Validation prompts

Use `EVALS.md` for trigger smoke tests and expected outcomes before iterating on this skill's instructions or description.
