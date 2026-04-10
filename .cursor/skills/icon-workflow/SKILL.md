---
name: icon-workflow
description: Standardizes icon decisions and implementation for this project. Use when adding icons, choosing between Tabler and Hugeicons, configuring Sly CLI icon libraries, or importing/rendering icons through the SVG sprite Icon component.
---

# Icon Workflow

## When to use this skill

Use this skill when the user asks to:

- add new icons
- pick an icon library
- use Sly CLI for icon installation
- import and render icons in app UI

## Default policy

- Use Tabler as the primary icon source for consistency.
- Use Hugeicons only when Tabler does not have the glyph.
- Keep one primary family and one fallback family to reduce visual drift.

## Project icon architecture

- Source SVGs live in `other/svg-icons`.
- Sly config lives in `other/sly/sly.json`.
- Vite builds a sprite to `app/components/ui/icons/sprite.svg`.
- Types are generated for icon names and consumed by `app/components/ui/icon.tsx`.
- App code should render icons with `Icon` from `#app/components/ui/icon.tsx`.

## Sly setup (Tabler primary)

1. Open `other/sly/sly.json`.
2. Ensure a library entry for Tabler points to `./other/svg-icons`.
3. Keep existing transformers (for license headers) enabled.
4. If both Tabler and Hugeicons are configured, keep Tabler listed first.

Example config shape:

```json
{
  "$schema": "https://sly-cli.fly.dev/registry/config.json",
  "libraries": [
    {
      "name": "@tabler/icons",
      "directory": "./other/svg-icons",
      "transformers": ["transform-icon.ts"]
    },
    {
      "name": "@hugeicons/core-free-icons",
      "directory": "./other/svg-icons",
      "transformers": ["transform-icon.ts"]
    }
  ]
}
```

If package names differ in your registry, run `npx sly add` and select the matching Tabler/Hugeicons library from the interactive list.

## Add icons with Sly

- Interactive (recommended): `npx sly add`
- Direct when library is known: `npx sly add <library> <icon-name>`
- Multiple icons: `npx sly add <library> <icon-a> <icon-b>`
- Non-interactive overwrite: `npx sly add <library> <icon-name> --yes --overwrite`

After adding icons, regenerate/build so sprite and types are up to date:

- `npm run build`

## Use icons in code

1. Import the shared icon component:
   - `import { Icon } from '#app/components/ui/icon.tsx'`
2. Render by sprite name (file name without `.svg`):
   - `<Icon name="trash" />`
3. Size with `size` prop (`font | xs | sm | md | lg | xl`) or `className`.
4. For icon + label alignment, pass text as children:
   - `<Icon name="plus">Add note</Icon>`
5. Add accessibility semantics:
   - Decorative icon: `aria-hidden="true"`
   - Meaningful icon-only button: provide label text via `aria-label` on the button and/or `title` on `Icon`

## Naming and consistency rules

- Use `kebab-case` SVG file names.
- Prefer action/meaning names users recognize (`trash`, `plus`, `arrow-right`).
- Do not add icons "just in case"; only include icons actively used by UI.
- Before adding from Hugeicons, check Tabler first.

## Quick troubleshooting

- Icon not found in TypeScript:
  - Run `npm run build` to regenerate sprite/types.
- Icon renders empty:
  - Confirm SVG file exists in `other/svg-icons` and name matches `Icon name`.
- Visual mismatch:
  - Replace fallback icon with Tabler equivalent when one exists.
