---
name: nettbil-tailwind
description:
  Nettbil design token conventions for Tailwind v4. Use this skill for ANY task
  that involves building or modifying UI in this codebase — including
  implementing a Figma design (any figma.com URL), building new React
  components, adding visual states (hover, error, active), converting inline
  styles, choosing colors or spacing, or reviewing components for correct token
  usage. This skill must be consulted whenever you are about to write Tailwind
  class names in this repo, even when the user doesn't say "Tailwind" or
  "tokens" — if the task touches how something looks, this skill applies. Token
  names map 1:1 between Figma and Tailwind.
---

# Nettbil Tailwind Token Conventions

This project uses **Tailwind v4** with CSS-based configuration. All design
tokens are defined in:

```
packages/react-design-system/src/theme.css
```

**Always read this file** to find the available tokens before writing or
reviewing Tailwind classes. The variable names in `@theme inline { ... }` map
directly to Tailwind utility classes: `--color-orange-600` → `bg-orange-600`,
`--text-hd-3xl` → `text-hd-3xl`, `--spacing-spacing-xl` → `p-spacing-xl`, etc.

The token names are **1:1 with Figma** — when a Figma design specifies a token,
use the corresponding class directly.

---

## How tokens map to utilities

| CSS variable prefix   | Tailwind usage                                                            |
| --------------------- | ------------------------------------------------------------------------- |
| `--color-*`           | `bg-*` `text-*` `border-*` `ring-*` etc.                                  |
| `--text-*`            | `text-*` (bundles font-size + line-height + font-weight + letter-spacing) |
| `--spacing-spacing-*` | `p-*` `m-*` `gap-*` `inset-*` etc.                                        |
| `--radius-*`          | `rounded-*`                                                               |
| `--shadow-*`          | `shadow-*`                                                                |

> Note: `--space-*` variables in `:root` are SCSS-only, not Tailwind utilities.

---

## Key principles

**Prefer semantic aliases over primitives.** The `@theme` block defines semantic
aliases like `--color-primary`, `--color-foreground`, `--color-background`,
`--color-border`, and status variants (`--color-error-text`,
`--color-success-background`, etc.). Use these when the intent matches — they
communicate meaning and will respond to theme changes.

**Typography tokens bundle everything.** A single `text-hd-3xl` class sets
font-size, line-height, font-weight, and letter-spacing all at once. Don't
recreate these with raw `text-2xl font-semibold leading-tight` combinations.

**Never use hardcoded hex values.** Everything is in the token system.

---

## Conditional classes

Always use the `cn()` object form from `~/lib/utils`:

```tsx
<div
	className={cn('text-bd-base text-foreground', {
		'bg-primary text-white': isActive,
	})}
/>
```
