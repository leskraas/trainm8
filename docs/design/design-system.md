# Design system

The written half of trainm8's design system. The live half is `/design`
(logged-in users): every token in both themes and every `app/components/ui`
primitive in its states. Decided in
[ADR 0085](../adr/0085-the-design-system-is-shadcn-base-luma-on-base-ui-and-motion-follows-one-scale.md);
structure (layout, sizing, navigation, wording) stays in
[`ui-conventions.md`](ui-conventions.md).

**The backbone is shadcn.** `components.json` uses the `base-luma` style (shadcn
on Base UI, the "luma" look #505 asks for). Tokens follow shadcn's CSS-variable
conventions; components come from `npx shadcn@latest add`. Local changes to what
the CLI generates are kept small, commented where they occur, and listed in
[Deviations from shadcn](#deviations-from-shadcn) below, so a future
`shadcn add --diff` stays reviewable. [coss ui](https://coss.com/ui) (Cal.com's
library, also on Base UI) was the reference for the docs-page layout and for
composition (`data-slot` on every part, context-carried variants); shadcn is the
source of truth.

Contents: [Tokens](#tokens) · [Motion](#motion) ·
[Mobile baseline](#mobile-baseline) · [Components](#components) ·
[Review](#review-before--after) ·
[Deviations from shadcn](#deviations-from-shadcn) ·
[Updating from the CLI](#updating-from-the-cli)

## Tokens

All in `app/styles/tailwind.css`. Light is `:root`, dark is `.dark` on `<html>`
(`.light` re-scopes a subtree to light, for `/design`).

### Colour roles: shadcn's own

| Role                             | Use it for                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `background` / `foreground`      | The page (a faint tint) and its text. The top chrome sits on it; `theme-color` matches it.               |
| `card` / `card-foreground`       | Raised surfaces: cards, list groups. White on the tinted page, one step up in dark.                      |
| `popover` / `popover-foreground` | Overlays: popovers, menus, selects, sheets, dialogs.                                                     |
| `muted` / `muted-foreground`     | Sunken wells and tracks (the segmented rail, meter tracks), hover fills; secondary text.                 |
| `primary` / `primary-foreground` | The green. One primary action per screen, links, selected state, "i rute".                               |
| `secondary`, `accent`            | Quiet buttons; highlighted menu items.                                                                   |
| `destructive`                    | Delete, errors.                                                                                          |
| `border`, `input`                | Hairlines and field fills. **Sparingly**: in the luma direction tone and shadow separate surfaces first. |
| `ring`                           | Focus. A mix of `primary`, so focus reads as the app's.                                                  |
| `chart-1…5`, `sidebar-*`         | As shadcn defines them.                                                                                  |

### Colour roles: app-only (no shadcn equivalent)

| Token                                                          | Meaning                                                                                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status-on` · `status-under` · `status-over` · `status-missed` | i rute (the green) · under (amber) · over (blue-violet) · ikke gjort (red, quieter than `destructive`). Colour never carries the verdict alone; the word is always beside it. |
| `track-run` · `track-bike` · `track-swim` · `track-strength`   | One hue per discipline. For marks (a dot, a bar, an edge, a meter), not fills or text.                                                                                        |
| `track-*-ink` (`track-run-ink` …)                              | The same hue dark enough (light) or light enough (dark) to be **text**: a track's name in its colour. AA on `card` and `background` in both themes; see the table below.      |
| `phase-base` · `phase-build` · `phase-peak` · `phase-taper`    | Grunntrening · Oppbygging · Spissing · Nedtrapping. Lower chroma than the tracks; for bands and the strip's phase line.                                                       |

Every role is a Tailwind colour (`bg-status-under`, `text-track-run-ink`,
`bg-phase-build/20`).

**Track ink contrast** (WCAG 2 relative luminance, OKLCH converted to sRGB; AA
for text is 4.5:1). The marks are listed for comparison: in light mode three of
the four fail as text, which is why text never takes the mark.

| Token                   | Light value            | on `card` | on `background` | Dark value             | on `card` | on `background` |
| ----------------------- | ---------------------- | --------- | --------------- | ---------------------- | --------- | --------------- |
| `track-run-ink`         | `oklch(0.54 0.15 32)`  | 5.44      | 5.06            | `oklch(0.74 0.13 32)`  | 7.37      | 8.12            |
| `track-bike-ink`        | `oklch(0.53 0.11 78)`  | 5.37      | 5.00            | `oklch(0.8 0.12 78)`   | 9.46      | 10.42           |
| `track-swim-ink`        | `oklch(0.52 0.09 225)` | 5.37      | 5.00            | `oklch(0.76 0.09 225)` | 8.53      | 9.40            |
| `track-strength-ink`    | `oklch(0.53 0.12 300)` | 5.55      | 5.17            | `oklch(0.74 0.1 300)`  | 7.52      | 8.28            |
| `track-run` (mark)      | `oklch(0.63 0.16 32)`  | 3.76      | 3.50            | `oklch(0.7 0.14 32)`   | 6.32      | 6.96            |
| `track-bike` (mark)     | `oklch(0.72 0.13 78)`  | 2.52      | 2.35            | `oklch(0.78 0.12 78)`  | 8.83      | 9.72            |
| `track-swim` (mark)     | `oklch(0.62 0.1 225)`  | 3.54      | 3.30            | `oklch(0.72 0.09 225)` | 7.39      | 8.14            |
| `track-strength` (mark) | `oklch(0.55 0.11 300)` | 5.07      | 4.72            | `oklch(0.7 0.1 300)`   | 6.48      | 7.14            |

`card` is `oklch(1 0 0)` / `oklch(0.205 0.007 223.9)` and `background` is
`oklch(0.975 0.003 197)` / `oklch(0.148 0.004 228.8)`. Track names in their
colour use the ink: I dag's week header and the large-screen season table's
column heads.

**Older app tokens:** only `zone-1…5` remains, read by pages outside home. The
timeline's own (`ink-*`, `hairline*`, `warning`, `--shadow-pill`) are gone: I
dag uses `foreground`/`muted-foreground` (with opacity steps), `border` at low
opacity for hairlines, tone for surfaces and `status-under` (ADR 0086).

### Radius

One `--radius` (**6px**) and shadcn's derived scale: `sm` 3.6 · `md` 4.8 · `lg`
6 · `xl` 8.4 · `2xl` 10.8 · `3xl` 13.2 · `4xl` 15.6 · `full`. The luma
components use the top of it: buttons and cards `rounded-4xl` (~16px), inputs,
popups and toggles `rounded-3xl` (~13px), menu items `rounded-2xl` (~11px), and
`rounded-full` for pills, tabs and the segmented control. 6px is chosen so
luma's generated class names land on #505's numbers (cards 14–16, controls
10–12+, pills full) without editing them. Pages that already said
`rounded-lg`/`rounded-xl` render a little sharper than before (lg was 10px);
move them to the luma steps when they are touched.

### Elevation

Tailwind's shadow scale, as the luma components use it: `shadow-sm` (the active
tab or segment), `shadow-md` (cards), `shadow-lg` (popovers, menus, selects),
`shadow-xl` (sheets, dialogs). No custom elevation tokens; a dark-mode edge
comes from luma's `ring-foreground/10`.

### Spacing

Tailwind's 4px grid, one value per role (ui-conventions §1.4): `gap-1.5` label →
field, `gap-2` icon ↔ text, `p-4` card and page inset on phones (`container`
gives 16/32px), `space-y-4` between fields, `space-y-8` between sections.

### Type

Public Sans. shadcn ships no type tokens, so this is an app role in Tailwind's
own `--text-*` namespace. Each step is a set: size, line height, weight and
size-specific tracking (negative as type grows, slightly positive at caption
sizes). Generated components keep their `text-sm`/`text-base`; page content uses
these steps.

| Class           | Size/leading | Weight | Tracking | For                                |
| --------------- | ------------ | ------ | -------- | ---------------------------------- |
| `text-display`  | 32/38        | 700    | −0.025em | the event countdown, a hero number |
| `text-title`    | 24/30        | 650    | −0.02em  | page titles                        |
| `text-heading`  | 18/24        | 600    | −0.012em | section headings, sheet titles     |
| `text-body`     | 16/24        | 400    | −0.004em | running text                       |
| `text-callout`  | 15/21        | 500    | −0.004em | row titles                         |
| `text-footnote` | 13/18        | 400    | +0.002em | row facts, descriptions            |
| `text-caption`  | 12/16        | 500    | +0.01em  | labels under figures               |
| `text-overline` | 11/16        | 600    | +0.06em  | kickers; pair with `uppercase`     |

Override weight with `font-*` where needed; never override tracking. Use
**`tabular-nums`** on every figure that shares a column or changes in place (km,
minutes, percentages, week numbers). Decimals use the Norwegian comma
(`formatNbVolumeFigure`), and so do kilos wherever a person reads a lift:
`82,5 kg × 5 · 5 · 5 · 4` — `formatNbKg` for the weight and `formatLiftWork` for
the line, rep counts joined by `·` (a comma beside a comma-decimal kilo would
read as one more decimal). `formatKg` keeps the decimal point: it is the machine
digits that forms post and the workout notation reads back. The Epic Stack's
marketing scale (`text-h1…h6`, `text-body-*`, `text-button`) stays for the
marketing and auth pages.

`cn()` (`app/utils/misc.tsx`) has tailwind-merge taught these names and the
duration tokens. Without that, `cn('text-muted-foreground', 'text-footnote')`
silently dropped the colour, and it already did so for `text-body-*`.

## Motion

From Emil Kowalski's skills, enforced by the utilities in `tailwind.css`.

| Token               | Value                                                     | For                                                 |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| `--ease-out`        | `cubic-bezier(0.23, 1, 0.32, 1)`                          | anything entering or leaving; press; colour changes |
| `--ease-in-out`     | `cubic-bezier(0.77, 0, 0.175, 1)`                         | something already on screen moving                  |
| `--ease-drawer`     | `cubic-bezier(0.32, 0.72, 0, 1)`                          | a sheet travelling its own height                   |
| `duration-press`    | 160ms                                                     | press feedback                                      |
| `duration-tooltip`  | 150 in / 100 out (`-exit`)                                | tooltips                                            |
| `duration-dropdown` | 200 / 150                                                 | popovers, menus, selects                            |
| `duration-collapse` | 200 / 150                                                 | collapsible panels                                  |
| `duration-modal`    | 250 / 200                                                 | dialogs, sheets, backdrops                          |
| `duration-drawer`   | 450 in; out = Base UI's `--drawer-swipe-strength` × 400ms | the bottom sheet                                    |

| Utility           | What it does                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pressable`       | `scale(0.97)` on `:active`, 160ms ease-out; colours on the same curve; no scale on `aria-haspopup` triggers; reduced motion keeps the colours only.                                          |
| `motion-popup`    | `transform-origin: var(--transform-origin)`, from `scale(0.96)` + opacity via `data-starting-style`/`data-ending-style`; 200 in / 150 out; only a fade when a select opens over its trigger. |
| `motion-tooltip`  | Same shape from `scale(0.97)`, 150 / 100; `data-instant` → no transition.                                                                                                                    |
| `motion-modal`    | Centred (modals have no trigger), from `scale(0.96)`, 250 / 200.                                                                                                                             |
| `motion-backdrop` | Opacity, in step with its modal; follows a drawer swipe.                                                                                                                                     |
| `motion-collapse` | Height (Base UI's `--collapsible-panel-height`) + opacity, 200 / 150. The one sanctioned layout animation.                                                                                   |
| `reflow`          | The home timeline's draft opening in place (ADR 0077, 0086): height + opacity written by `timeline/reflow.ts`, on `motion-collapse`'s curve.                                                 |

The rules: transitions, never keyframes, on anything that can be interrupted.
Never `scale(0)`, never `ease-in`, never `transition-all`. Exit faster than
enter. Only `transform` and `opacity`, apart from `motion-collapse`. Every
utility ships its reduced-motion answer (keep the fade or colour, drop the
movement). Hover is a pointer affordance: the `hover:` variant (and so
`group-hover:`, `peer-hover:`) is `@media (hover: hover) and (pointer: fine)`
app-wide. Verified on the built CSS: every `:hover` rule sits inside that query.
`:active` is not gated.

## Mobile baseline

- `html`: `-webkit-tap-highlight-color: transparent`,
  `-webkit-text-size-adjust: 100%`, `color-scheme` per theme.
- Controls (`button`, `a`, `summary`, `label`,
  `[role=button|tab|switch|checkbox|radio|menuitem|option]`):
  `touch-action: manipulation`. Controls, but never links in body text, also get
  `user-select: none` and `-webkit-touch-callout: none`.
- On a coarse pointer every text input, textarea and select is at least 16px
  (unlayered, so no utility can undercut it), so iOS never zooms.
- `root.tsx`: viewport
  `…, viewport-fit=cover, interactive-widget=resizes-content` (zoom stays
  enabled). `theme-color` is the page colour: one meta per scheme when the theme
  follows the OS, one meta when the athlete chose a theme.
- 44px targets on phones: real 44px for the default button, input and select
  trigger; an invisible `after:`/`before:` hit area for compact controls; menu,
  select and command items are 44px on a coarse pointer and the CLI's 36px with
  a mouse.
- The top chrome (wordmark row) pads `env(safe-area-inset-top)`, and the tab bar
  pads the bottom inset. Every tappable thing has a press: `pressable`, or an
  instant `active:` tint where a transition would be wrong (the I dag pill, the
  tabs).
- Contrast is AA (4.5:1) for text in both themes. In light, `muted-foreground`
  measures 5.5 on the card, 5.1 on the page and 4.7 on `muted`. Do not dim it
  further with opacity: at /80 it is 3.6, and at /70 it is 3.0. `status-under`
  is L 0.55 in light (5.0 on the card). Track hues are for marks only, never for
  text.
- Needs a real phone to confirm: tap delay, sticky hover, the theme-colour
  status bar, the keyboard with `interactive-widget`, and the drawer's flick
  dismiss.

## Components

| File                                                                                                                                                       | Exports                                                                                                                                                                             | Notes                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `button.tsx`                                                                                                                                               | `Button`, `buttonVariants`, `ButtonVariant`                                                                                                                                         | variants `default · secondary · outline · ghost · destructive · link`; sizes `default (44) · xs · sm · lg · icon · icon-xs · icon-sm · icon-lg`. Pill: `className="rounded-full"`.                                                                                      |
| `drawer.tsx`                                                                                                                                               | `Drawer`, `DrawerTrigger`, `DrawerClose`, `DrawerContent`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`, `DrawerSwipeHandle`, `DrawerOverlay`, `DrawerPortal` | **The bottom sheet.** Base UI Drawer. `<Drawer showSwipeHandle swipeDirection="down" snapPoints?>`. Put scrolling content in `<div className="overflow-y-auto overscroll-contain">`.                                                                                    |
| `sheet.tsx`                                                                                                                                                | `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent side="right·left·top·bottom"`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`                                  | A side panel (Base UI Dialog), e.g. a large-screen day detail. Use `Drawer` on phones.                                                                                                                                                                                  |
| `toggle.tsx`, `toggle-group.tsx`                                                                                                                           | `Toggle`, `ToggleGroup`, `ToggleGroupItem`, **`SegmentedControl`**                                                                                                                  | `<SegmentedControl value onValueChange aria-label>` with `ToggleGroupItem`s keeps exactly one pressed. `ToggleGroup variant="outline" multiple` for filters.                                                                                                            |
| `progress.tsx`                                                                                                                                             | `Progress`, `ProgressLabel`, `ProgressValue`, `ProgressTrack`, `ProgressIndicator`                                                                                                  | A task getting done. `<Progress value><ProgressLabel/><ProgressValue/></Progress>`; the track is rendered for you.                                                                                                                                                      |
| `meter.tsx`                                                                                                                                                | `Meter`, `MeterLabel`, `MeterValue`, `MeterTrack`, `MeterIndicator`, `MeterTone`                                                                                                    | A measured value in a range (km against target). `tone="on·under·over·missed·primary·muted"`.                                                                                                                                                                           |
| `collapsible.tsx`                                                                                                                                          | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`                                                                                                                           | The trigger is unstyled; the panel animates with `motion-collapse`.                                                                                                                                                                                                     |
| `dialog.tsx`, `alert-dialog.tsx`                                                                                                                           | shadcn's parts; `AlertDialogContent` (+ `AlertDialogPopup` alias)                                                                                                                   | Centred modals.                                                                                                                                                                                                                                                         |
| `popover.tsx`, `tooltip.tsx`, `dropdown-menu.tsx`, `select.tsx`                                                                                            | shadcn's parts                                                                                                                                                                      | Origin-aware. `TooltipProvider` waits 500ms, then opens neighbours instantly. `DropdownMenuLabel` must sit inside `DropdownMenuGroup` (Base UI throws #31 otherwise). Give `Select` an `items` list so the closed trigger shows the label, not the value.               |
| `card`, `badge`, `alert`, `input`, `textarea`, `label`, `field`, `separator`, `table`, `tabs`, `checkbox`, `command`, `input-otp`, `input-group`, `sonner` | shadcn's parts                                                                                                                                                                      | `tabs`: `TabsTrigger`/`TabsContent`. `input-group` came with `command`.                                                                                                                                                                                                 |
| `radio-group`                                                                                                                                              | `RadioGroup`, `RadioGroupItem`                                                                                                                                                      | Added in round 2 for the first run. Use it through `forms.tsx`: `RadioGroupField` (choice cards in a `FieldLabel`), `ToggleGroupField` (a row of pills, e.g. weekdays, posting hidden inputs), `Field`, `CheckboxField`, `SelectField`. No native `<input type=checkbox | radio>`and no raw`<details>`(use`Collapsible`). Field errors are `text-footnote text-foreground-destructive` (13px, AA in both themes). |

Icons in every primitive are the Tabler sprite `Icon` (icon workflow); no
`@tabler/icons-react` or `lucide-react` import remains.

## Review: before → after

The `base-rhea` components as they stood, reviewed against Emil's rules and then
rebuilt as `base-luma` with the deviations below. The "Before" column also
covers what `base-luma` itself would have shipped where that differs.

| Before                                                                                                                | After                                                                                                             | Why                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `button`: `transition-all` + `active:not-aria-[haspopup]:translate-y-px`                                              | `pressable`: `scale(0.97)` 160ms `--ease-out`, colours on the same curve                                          | Press must answer on pointer-down; `all` eased the focus ring and border on a built-in curve       |
| `button` default `h-9`, compact sizes without hit area                                                                | `h-11`; compact and icon sizes get an invisible `after:` hit area to ~44px                                        | 44px touch targets on phones (ADR 0028)                                                            |
| popover/menu/select: tw-animate `zoom-in-95` + `slide-in-from-*` keyframes, `duration-100`                            | `motion-popup`: transition from `scale(0.96)` + opacity on `var(--transform-origin)`, 200 in / 150 out            | Keyframes restart from zero when interrupted; 100ms with an 8px slide read as a jump; origin-aware |
| tooltip: same keyframes plus `data-[state=delayed-open]` (a Radix attribute Base UI never sets)                       | `motion-tooltip`: from `scale(0.97)`, 150 / 100, `data-instant` → 0ms                                             | The dead selector meant the delayed state was never styled; neighbours should open instantly       |
| `TooltipProvider delay={0}`                                                                                           | `delay={500} timeout={400}`                                                                                       | A tooltip on every pass of the pointer; Emil: delay the first, skip the rest                       |
| alert-dialog/dialog: keyframes `zoom-in-95`, `duration-100`                                                           | `motion-modal` (centred) + `motion-backdrop`, 250 / 200                                                           | Modals stay centred; exit faster than enter; interruptible                                         |
| `select` trigger `transition-[color,box-shadow] duration-200` (built-in curve)                                        | `pressable` on `--ease-out`, 160ms; no scale (`aria-haspopup`)                                                    | ADR 0077 §1 violation, #505 S8                                                                     |
| `select` trigger `h-9 text-sm`                                                                                        | `h-11 text-base md:text-sm`                                                                                       | 44px; 16px on phones so iOS never zooms                                                            |
| `Select.Icon render={<Icon/>}`                                                                                        | the icon as children                                                                                              | `render` keeps Base UI's default `▼`, giving two indicators (B6)                                   |
| menu/select/command items `py-2` (~36px)                                                                              | `min-h-11 pointer-fine:min-h-9`                                                                                   | 44px on touch, compact with a mouse; gated on capability, not width                                |
| `menuColor: default-translucent` (`bg-popover/70` + blur)                                                             | `menuColor: default` (solid `bg-popover`)                                                                         | Text behind the menu stayed readable through it; legibility first                                  |
| `tabs` trigger `transition-all`, ~34px                                                                                | `pressable`; `before:` hit area to ~44px                                                                          | Same press rule; `after:` is luma's line indicator                                                 |
| `toggle` `transition-colors` (built-in), 36px                                                                         | `pressable`; `after:` hit area                                                                                    | Same                                                                                               |
| `checkbox` `transition-shadow`, `input`/`textarea` transitions on the default curve                                   | `duration-press ease-out`                                                                                         | One curve app-wide                                                                                 |
| `badge` `transition-all`                                                                                              | `transition-colors duration-press ease-out`, `tabular-nums`                                                       | Badges carry counts                                                                                |
| `collapsible` panel: no animation                                                                                     | `motion-collapse`: height + opacity, 200 / 150                                                                    | Content below jumping is the jarring change; height is the sanctioned exception                    |
| `progress` indicator `transition-all` (width, built-in curve)                                                         | no transition                                                                                                     | A bar that glides lags its number, and width is layout                                             |
| `drawer` popup on a one-off `cubic-bezier(0.22,1,0.36,1)`, no reduced-motion branch, content under the home indicator | `ease-drawer` token, 450ms; reduced motion keeps the fade and drops the slide; `pb-[env(safe-area-inset-bottom)]` | Emil's drawer curve; gentler, never zero; safe areas                                               |
| `sheet` `transition duration-200 ease-in-out`                                                                         | `transition-[opacity,translate] duration-modal ease-out`, exit 200, reduced motion drops the slide                | Entering/exiting is ease-out; in-out is for things already on screen                               |
| `tw-animate-css`/`shadcn/tailwind.css` imported 3–4 times, an unused Inter font                                       | one import each; Inter removed                                                                                    | Dead weight                                                                                        |
| `@utility pill-fold` (unused), stale `--shadow-pill`/`press`/`reflow` comments                                        | removed / rewritten                                                                                               | Dead code; comments now true                                                                       |

## Deviations from shadcn

Every change to what `npx shadcn@latest add` generates for `base-luma`, each
marked by a comment at the line. **N** are mechanical normalisations applied to
every file.

| ID  | Where                                                         | What and why                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | all                                                           | `import { cn } from "cn"` → `#app/utils/misc.tsx`. The luma registry lists a `cn` npm package; the CLI installs it, and we uninstall it again (one `cn`, the repo's, with its tailwind-merge config).                   |
| N2  | all                                                           | `@tabler/icons-react` imports → the sprite `Icon` with the same Tabler glyph (icon workflow).                                                                                                                           |
| N3  | all                                                           | Prettier (tabs, single quotes) and `eslint --fix` import order.                                                                                                                                                         |
| D1  | button, toggle, tabs                                          | `pressable` replaces `transition-all` / `transition-colors` / the 1px nudge.                                                                                                                                            |
| D2  | button, input, select, toggle, tabs                           | 44px: `h-11` defaults; invisible hit areas on compact sizes.                                                                                                                                                            |
| D3  | button                                                        | Border colour stated per variant, not in the base (a `<Link>` spreading `buttonVariants` without tailwind-merge rendered borderless).                                                                                   |
| D4  | popover, tooltip, dropdown-menu, select, dialog, alert-dialog | tw-animate keyframe classes → `motion-popup` / `motion-tooltip` / `motion-modal` / `motion-backdrop`.                                                                                                                   |
| D5  | checkbox, radio-group, input, textarea, badge, select trigger | Transitions on `duration-press ease-out` instead of the built-in curve.                                                                                                                                                 |
| D6  | collapsible, progress                                         | Panel animates with `motion-collapse`; progress fill does not animate.                                                                                                                                                  |
| D7  | dropdown-menu, select                                         | Items `min-h-11 pointer-fine:min-h-9`.                                                                                                                                                                                  |
| D9  | checkbox, button, alert-dialog                                | Re-exports the repo's old names for their call sites: `CheckboxProps`, `ButtonVariant`, `AlertDialogPopup` (= `AlertDialogContent`; delete when settings/integrations, the training editors, events and sessions move). |
| D10 | select                                                        | `text-base md:text-sm` on the trigger.                                                                                                                                                                                  |
| D11 | select                                                        | One indicator: the icon as children of `Select.Icon`.                                                                                                                                                                   |
| D12 | drawer, sheet                                                 | Drawer on `ease-drawer`/`duration-drawer`, safe-area padding, reduced-motion fade; sheet on ease-out with exit faster than enter and reduced-motion fade.                                                               |
| D13 | tooltip                                                       | Provider `delay={500} timeout={400}`.                                                                                                                                                                                   |
| A1  | toggle-group                                                  | Added `SegmentedControl` (not in the registry).                                                                                                                                                                         |
| A2  | meter.tsx                                                     | Added; the registry has no meter. Mirrors `progress.tsx`.                                                                                                                                                               |
| C1  | components.json                                               | `style: base-luma` (was `base-rhea`), `menuColor: default` (was `default-translucent`).                                                                                                                                 |

## Updating from the CLI

```sh
npx shadcn@latest add <component> --diff app/components/ui/<component>.tsx   # review first
npx shadcn@latest add --overwrite --yes <component>
npm uninstall cn                    # N1: the registry re-adds it
```

Then reapply N1–N3 and the component's rows above (they are commented in place),
run `npx vitest run app/components`, and check it on `/design`. If the CLI
re-adds `@import 'tw-animate-css'` to `tailwind.css`, take it out again: nothing
animates on its keyframes since #505 round 2.
