# The design system is shadcn `base-luma` on Base UI, and motion follows one scale

Status: Accepted

**Amends**
[ADR 0077](0077-the-timeline-animates-four-things-and-reduced-motion-is-gentler-never-zero.md)
§2–3: those sections count "four animations" and "two accordions" as the whole
of the app's motion. They were true of the home timeline in #502 and are not
true of the app now (§4 below). **Builds on**
[ADR 0028](0028-mobile-first-ui-standard.md) (44px controls, 16px phone fonts)
and ADR 0077 §1 and §6 (the easing scale, the gated `hover:` variant), which
stand. Spec #505, owner decisions of 2026-10-10 ("Look", story 86).
`docs/design/design-system.md` is the reference; `/design` is the live sheet.

## Context

#505 asks for a calmer, rounder look ("luma"): larger radii, surfaces separated
by tone and shadow rather than hairlines everywhere, a typographic hierarchy,
and tabular numbers. It keeps the green primary and Public Sans. Home is to be
rebuilt on that foundation, and other pages inherit it without being rewritten.

The foundation was shadcn's `base-rhea` style on `@base-ui/react` 1.5. The
components had been edited in place over many tickets. Their motion was
tw-animate keyframes on 100ms with a built-in curve: ADR 0077's audit had only
ever covered the timeline, so the shared primitives fell outside it.
`tailwind.css` imported each library three or four times and carried dead
utilities. There was also no page where the system could be seen.

## Decision

### 1. shadcn is the backbone, on the `base-luma` style

`components.json` moves from `base-rhea` to **`base-luma`**: shadcn on Base UI,
with the luma look. Components come from `npx shadcn@latest add`. Every existing
primitive was regenerated, and the new ones were added the same way: `drawer`,
`sheet`, `dialog`, `toggle`, `toggle-group`, `progress`, `collapsible` (and
`input-group`, which `command` pulls in). Local changes to the generated code
are kept small. Each one carries a comment at the line and a row in the
design-system doc's deviation table (N1–N3, D1–D13, A1–A2, C1), so a later
`shadcn add --diff` stays reviewable. Two things are not from the CLI: a
`SegmentedControl` in `toggle-group.tsx` and a `meter.tsx`, because the registry
has neither.

[coss ui](https://coss.com/ui), Cal.com's Base UI library, was studied for the
docs-page layout and for composition (`data-slot` on every part, variants
carried by context). It is a reference, not a source.

`@base-ui/react` moves from **1.5.0 to 1.9.0**. The changelog for 1.6–1.9 has
one breaking change, the `OTPFieldPreview` → `OTPField` rename, and nothing here
used it. 1.9 ships `Drawer`, `Meter` and `ToggleGroup`, which the new primitives
build on.

### 2. Tokens follow shadcn's conventions; app roles only where shadcn has none

The shadcn roles keep their names (`background`, `card`, `popover`, `primary`,
`secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`,
`chart-*`, `sidebar-*`). They map through `@theme inline` exactly as the CLI
writes them. The light page becomes a faint tint so that white cards separate by
tone. App roles are added only where shadcn has none, and named in the same
style:

- `status-on`, `status-under`, `status-over`, `status-missed`: i rute, under,
  over, ikke gjort.
- `track-run`, `track-bike`, `track-swim`, `track-strength`.
- `phase-base`, `phase-build`, `phase-peak`, `phase-taper`: Grunntrening,
  Oppbygging, Spissing, Nedtrapping.
- The motion tokens (§4) and a type scale (§3).

There is no parallel naming. The older app tokens the timeline still reads
(`ink-*`, `hairline*`, `warning`, `--shadow-pill`, `zone-*`) are documented as
temporary, to be removed when their call sites move to shadcn roles.

**Radius.** There is one `--radius` and shadcn's derived scale (`sm` ×0.6 …
`4xl` ×2.6). The base is set to **6px** so that luma's generated classes land on
the #505 numbers without editing them: `rounded-4xl` buttons and cards come out
at ~16px, `rounded-3xl` controls and popups at ~13px, `rounded-2xl` items at
~11px. Elevation is Tailwind's `shadow-sm/md/lg/xl`, as luma uses it.

### 3. A type scale as sets

The steps are `text-display`, `title`, `heading`, `body`, `callout`, `footnote`,
`caption` and `overline`. Each one sets size, line height, weight and
size-specific tracking together, in Tailwind's `--text-*` namespace. Figures use
`tabular-nums`. `cn()`'s tailwind-merge learns these names (and the duration
tokens). Without that it reads them as colours and drops the colour class beside
them, which it was already doing for `text-body-*`.

### 4. Motion: one scale, a handful of utilities, Emil's rules

The rules come from Emil Kowalski's skills. The curves are `--ease-out`,
`--ease-in-out` and **`--ease-drawer`** (new). Durations are named by element:
press 160ms, tooltip 150/100, dropdown 200/150, collapse 200/150, modal 250/200,
drawer 450 in. The utilities `pressable`, `motion-popup`, `motion-tooltip`,
`motion-modal`, `motion-backdrop` and `motion-collapse` are the only places a
curve meets a duration. They replace the generated tw-animate keyframes and
built-in curves.

The rules:

- Press is `scale(0.97)` on `:active`.
- Popups grow from Base UI's `--transform-origin`, starting at
  `scale(0.96–0.97)` plus opacity, never from 0. Modals stay centred.
- Exits are faster than entrances.
- Tooltips wait 500ms for the first one, then open instantly with no animation.
- Use transitions, not keyframes. No `ease-in` and no `transition-all`.
- Animate `transform` and `opacity` only.
- Reduced motion keeps the fade or colour change and drops the movement.

**Amending ADR 0077 §2–3.** The app now animates more than the timeline's four
things, and `height` is no longer confined to two accordions: `motion-collapse`
(Base UI Collapsible) is the general sanctioned height animation. Two further
declarations sit outside the utilities: the drawer, on Base UI's own swipe
variables, and the sheet. ADR 0077's timeline audit
(`tests/e2e/home-timeline.test.ts`) still governs what the _timeline frame_
declares. When home is rebuilt on these primitives, its expected list changes
with it.

### 5. The mobile baseline is global

This applies the mobile-native skill's floor:

- No tap highlight and no text inflation.
- `color-scheme` per theme.
- `touch-action: manipulation` on controls, and `user-select: none` on controls
  only.
- A 16px floor for inputs on coarse pointers.
- `interactive-widget=resizes-content` in the viewport.
- `theme-color` matching the page per scheme, or the athlete's chosen theme.
- The `hover:` variant stays `(hover: hover) and (pointer: fine)`; this was
  verified on the built CSS.

### 6. The bottom sheet is Base UI's Drawer

The shadcn `base-luma` drawer is built on Base UI's own `Drawer`. That primitive
owns the gesture:

- Dismissal is based on velocity, so a flick is enough.
- It captures the pointer.
- `--drawer-swipe-strength` scales the exit.
- It arbitrates between scrolling and swiping.

We adjust the curve (`--ease-drawer`), the safe-area padding and the
reduced-motion branch. It is not Vaul, and not a Dialog moved to the bottom
edge. `Sheet` (Base UI Dialog) is the side panel for large screens.

### 7. `/design` shows the system

It is a route for logged-in users. It shows tokens and components only and reads
no athlete data, which is why it is not development-only like the
`__prototype-*` pages that read a real athlete.

## Scope

**In:** the dependency upgrade, `components.json`, `tailwind.css`,
`app/components/ui/*`, `cn()`'s merge config, `root.tsx` meta, `/design`, this
ADR and `docs/design/design-system.md`.

**Out:** rebuilding home (a parallel change on #505), rewriting other pages, and
migrating the older timeline tokens or the `AlertDialogPopup` call sites.

## Consequences

- Every page picks up the tinted page, the 6px radius base and the luma
  components. Pages that said `rounded-lg`/`rounded-xl` render somewhat sharper
  (lg 10 → 6px) until they move to the luma steps.
- The default button, input and select trigger stay a real 44px. luma's 36px
  compact look appears only on the compact sizes, each with a hit area.
- A future `shadcn add` re-adds the `cn` npm package and re-generates icon
  imports. The deviation table says what to reapply.
- Menus are solid (`menuColor: default`). The translucent luma menu let the text
  behind it read through.

## Alternatives considered

- **Keeping `base-rhea` and editing radii by hand**: rejected. It would fork the
  generated code further from the registry, which is the opposite of the owner's
  direction.
- **An app-named token layer** (`surface-*`, `ink-*`, `rounded-card`,
  `shadow-raised`), which was built first on this branch: rejected. It is a
  parallel vocabulary next to shadcn's, and the owner chose shadcn's.
- **`--radius` left at 10px**: rejected. luma's `rounded-4xl` cards would be
  26px, well past #505's 14–16.
- **Vaul, or a Dialog-based sheet**: rejected. Base UI 1.9's Drawer does the
  gesture natively and is what the shadcn drawer uses.
