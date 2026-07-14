# UI conventions — mobile-first, structural

The written standard from the mobile-first UI cleanup (wayfinder map #277).
Every per-screen fix ticket and every future feature builds against this
document. It is **structural only**: the dark theme, teal accent, typography
scale, and card visual style are unchanged — this standardizes layout, sizing,
navigation, and wording plumbing.

**Mobile-first**: the phone viewport (390×844 is the reference) is the primary
design target; desktop adapts up via breakpoints. The litmus test for any
screen: drive it at 390×844 (per the `verify` skill) — no horizontal overflow,
no clipped values, no iOS focus zoom.

Decided on the map's tickets: spacing & layout (#279), form controls (#280),
enum labels (#281), navigation headers (#282). Recorded as ADR 0028.

## 1. Spacing & layout

### 1.1 Page horizontal padding

16px (`px-4`) on phones, 32px (`px-8`) from `md` up. Implemented once in the
shared `container` utility (`app/styles/tailwind.css`) — pages use `container`,
never hand-rolled padding.

### 1.2 Page width tiers

Three named tiers; every page picks one. Tiers matter ≥ `md` only — phones are
full-width.

| Tier | Class | Used for |
| --- | --- | --- |
| narrow | `max-w-md` | auth screens, single-purpose forms (change email, password, photo) |
| standard | `max-w-2xl` | forms, detail pages, lists (the old `max-w-3xl` settings layouts fold into this) |
| wide | `max-w-6xl` | dashboard/cockpit |

### 1.3 Page titles

`text-2xl` semibold (24px) on phones, `text-3xl` (30px) ≥ `md`. The display
`text-h1` sizes are not page-title sizes in-app. The title row is a flex row:
title truncates, action pinned right — actions never strand mid-wrap.
Non-top-level screens use the compact `PageHeader` (§3) instead of a page
title.

### 1.4 Spacing ladder

8px grid, one value per role. Off-ladder spacing needs a stated reason.

| Role | Value |
| --- | --- |
| inline gaps (icon↔text, badge rows) | `gap-2` (8px) |
| label → input | `gap-1.5` (6px) |
| between form fields | `space-y-4` (16px) |
| between page sections | `space-y-8` (32px) |
| page vertical padding | `py-6` mobile / `py-8` ≥ `md` |

### 1.5 Form grid

Single column on phones (`grid-cols-1 sm:grid-cols-2`). Named exception:
fixed-format short pairs (date, time, numeric) may stay two-up at 390px because
their content width is known. Free-text fields never share a row on phones.

### 1.6 Cards

Cards are only for repeated list items (events, imports, providers), stat
modules, and self-contained interactive widgets (workout block editor). Forms
and page prose sit directly on the page background — never wrapped in a card.
Card padding: `p-4` mobile / `p-6` ≥ `md`.

### 1.7 Section headings

`text-lg` semibold (18px) at all widths — clearly subordinate to the page
title. Separation comes only from the `space-y-8` section gap; no extra margins
around headings or save buttons.

### 1.8 Form action rows

Exactly one, at the form's bottom. On phones the primary button is full-width
with secondary actions stacked full-width below; ≥ `sm` they sit inline with
the primary on the right. No duplicated Cancel — the header's back/close (§3)
is the mobile dismissal affordance.

### 1.9 Form labels

One style everywhere: `text-sm font-medium` in the default foreground color
(the shadcn default). Muted grey is reserved for helper/description text under
a field, never the label.

## 2. Form controls

The standard is **full-size and tappable**: the default form control is a real
44px tall, so the touch target comes from the control itself, and 16px phone
fonts kill iOS zoom. _(ADR 0028; this pillar was revised from its original
compact-32px form.)_

### 2.1 Control heights

The default form control — `input`, `select` trigger, and default `button` — is
**44px (`h-11`) tall on all viewports**: a real platform touch target, not a
32px control with an extended hit area. `textarea` keeps its multi-line
`min-h-16`. Native date/time `input`s carry `appearance-none` plus resets on
their internal `::-webkit-datetime-edit` box (in `tailwind.css`, keyed off
`data-slot="input"`) so iOS chrome doesn't render them taller than the rest
(§2.4).

### 2.2 Touch targets

A 44px control needs no hit-area trick. The invisible `after:` hit-area
extension `app/components/ui/checkbox.tsx` established (an `after:`
pseudo-element stretching the tappable area) is retained **only where a control
can't be 44px tall**: the compact button sizes (`xs`/`sm`/`lg`, icon buttons),
inline text links, steppers, chips, and glyph chrome marks (⠿/⋮/＋). In dense
clusters (e.g. the workout-editor icon row) adjacent extensions are trimmed
rather than overlapped — per-case care.

### 2.3 Font size (the iOS-zoom fix)

**`text-base md:text-sm`** (16px phones / 14px ≥ `md`) on **all** form
controls: inputs, textareas, selects, and custom triggers — one blanket rule,
even for button-based triggers that can't technically zoom, so control fonts
never disagree side by side. **Buttons stay `text-sm` at all sizes** (they
can't trigger zoom; compact wins).

### 2.4 Selects

- **Every enum-valued field uses the shared Base UI `Select` via
  `SelectField`.** Remaining native `<select>` elements are violations to
  migrate.
- **Date/time fields stay native `<input>`** — platform pickers win there.
- Both the trigger value and the option list render through
  `app/utils/labels.ts` (§4) — no hand-capitalization, no raw enums.

### 2.5 Widths — nothing clips at 390px

- Inputs, textareas, and selects fill their field column (`w-full`) by
  default. `SelectField` forces `w-full`; the bare `SelectTrigger` primitive
  keeps `w-fit` for toolbar-style uses.
- Exception: intrinsically short, fixed-format values (time-of-day, duration,
  HR/pace) get an explicit width sized to the longest legal value — never a
  share-of-grid width that can clip.
- Litmus test: **a value or placeholder must never render clipped at 390px**;
  if it can, the field takes the full column.

### 2.6 Where the physics live

The ui primitives (`app/components/ui/input.tsx`, `textarea.tsx`, `select.tsx`,
`button.tsx`) own the font rule and hit-area extension; `SelectField` owns form
behavior (`w-full` + labels). Custom one-off controls (steppers, zone chips,
day toggles, segmented triggers) are built from `Button`/the primitives, or —
where they can't be — apply the same three tokens by hand (16px mobile font,
hit-area extension, no-clip width) and are listed here as named exceptions.

**Per-screen code never sets control heights or fonts** — a `text-sm` or `h-7`
on a control in a route file is a review flag.

## 3. Navigation

Five competing affordances (breadcrumb trails, "← Home" links, back pills,
floating Cancels, floating "Back") are replaced by two shared components.
Breadcrumbs are dropped on mobile — there is no breadcrumb pattern in-app.

### 3.1 `PageHeader` — every non-top-level screen

`app/components/page-header.tsx`: a ghost icon back button (32px, ~44px
effective per §2.2), an 18px semibold truncating title, and an optional
right-pinned actions slot.

```tsx
<PageHeader
  title="Passkeys"
  back={{ to: '/settings/profile', label: 'Edit Profile' }}
  actions={<Button … />}
/>
```

**The back target is an explicit parent route, never history.** Deep links and
refreshes arrive with no useful history; the browser already owns history-back;
an explicit parent keeps the affordance predictable and idempotent. Layouts
hosting many subpages use the route-handle convention: a route exports
`handle.pageHeader = 'Screen Title'` and `useRoutePageHeader(rootBack)` derives
title and back target from the route tree — "parent" is the literal route
hierarchy, declared once per route.

### 3.2 `OverlayHeader` — every sheet/dialog

`app/components/overlay-header.tsx`: Base UI `Dialog.Title` (+ optional
`Dialog.Description`) on the left, a `Dialog.Close` ghost ✕ (with the hit-area
extension) pinned top-right. Renders inside a `Dialog.Popup`. Overlays don't
duplicate a footer dismiss button — the ✕ is the dismissal affordance.

### 3.3 Top-level screens

Top-level surfaces (Dashboard, auth entry screens) carry no back affordance.
Auth flows use the page-title rules (§1.3) at the narrow tier.

## 4. Enum labels

`app/utils/labels.ts` owns **every** athlete-facing enum→label mapping
(discipline, intent, step/intensity kind, event kind/priority/status/target,
units, week-start, structure mode, provider) — a sibling of `app/utils/format.ts`
under the same house policy (ADR 0023: English-only, fixed wording). It is the
future i18n seam.

- UI code never capitalizes or hand-maps an enum value; it imports the map or
  helper (`getDisciplineLabel`, `getStatusLabel`, `providerLabel`).
- New enums get their map added there, plus coverage in `labels.test.ts`
  (completeness test: every enum value has a label).
- `labels.ts` stays a runtime leaf — type-only imports via `import type`
  statements (inline `{ type … }` imports survive Node's type stripping and
  recreate the schema import cycle).

## 5. Verification

Every screen change under this standard is verified at a phone viewport before
its ticket closes: Playwright, 390×844, `isMobile`, seeded data, per the
`verify` skill. Checks: 0px horizontal overflow, no clipped values, 16px
control fonts, effective touch targets, correct header/back affordance, and
labels (never raw enums) in triggers and options.

## Known violations

Tracked by the audit (`docs/design/mobile-audit.md`) and worked off by the
per-screen fix tickets on map #277. When adding to a screen that still
violates the standard, follow the standard for the new code; don't clone the
violation.
