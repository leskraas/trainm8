# Mobile-first UI standard: structural conventions for the logged-in app

The app grew screen by screen with no shared layout rules. A full audit at
390×844 (`docs/design/mobile-audit.md`, #278) found horizontal overflow on
every settings subpage (non-wrapping breadcrumb trails, up to +110px),
onboarding overflowing 240px, five competing navigation affordances, 14px
select fonts triggering iOS focus zoom, sub-44px touch targets everywhere, raw
enum values (`run`, `inherit`) leaking into triggers, and display-sized page
titles wrapping awkwardly with actions stranded mid-wrap.

## Decision

One written standard — `docs/design/ui-conventions.md` — governs structure for
the logged-in app and auth flows. The phone viewport is the primary design
target; desktop adapts up via breakpoints. The standard is **structural only**:
the dark theme, teal accent, typography, and card style are untouched.

Its four pillars (each decided on its own map ticket):

1. **Spacing & layout (#279)** — 16px page padding on phones (via the shared
   `container` utility); three page width tiers (narrow/standard/wide); 24px
   page titles (30px ≥ `md`) with the action pinned right; an 8px-grid spacing
   ladder bound to roles; single-column forms on phones; cards only for
   repeated/interactive units; one bottom action row with a full-width primary
   on phones; one label style.

2. **Form controls (#280)** — compact-but-tappable: 32px (`h-8`) visual
   heights stay on all viewports, ~44px *effective* touch targets via
   invisible `after:` hit-area extensions, and `text-base md:text-sm` (16px
   phone) on all form controls — the actual iOS-zoom fix. One select
   (`SelectField` over Base UI) for every enum field; date/time stays native.
   The ui primitives own these physics; per-screen height/font overrides are
   review flags. **⚠️ The height half of this pillar is superseded by
   [ADR 0029](0029-full-size-form-controls.md):** the default control is now a
   real 44px (`h-11`), not a compact 32px with an extended hit area. The font
   rule, the one-select rule, and native date/time all stand.

3. **Navigation (#282)** — non-top-level screens get a shared `PageHeader`
   (back button + 18px title + optional action); overlays get `OverlayHeader`
   (title + close ✕). The back target is an **explicit parent route** derived
   from a `handle.pageHeader` route-tree convention, never browser history.
   Breadcrumbs are dropped on mobile.

4. **Enum labels (#281)** — `app/utils/labels.ts` owns every athlete-facing
   enum→label mapping, extending ADR 0023's fixed-locale, English-only house
   policy from formatting to wording. UI code never hand-capitalizes an enum;
   the module is the future i18n seam.

Every screen change under the standard is verified with Playwright at 390×844
before its ticket closes.

## Alternatives considered

- **44px visual controls on phones** (the platform guideline reading):
  rejected — the compact 32px density is a deliberate product choice; the
  guideline's intent (tappability, no zoom) is met by hit-area extensions and
  16px fonts instead. **_Reversed by [ADR 0029](0029-full-size-form-controls.md)_**
  — the default control is now a real 44px; the invisible-extension approach
  proved fragile in practice.
- **History-based back buttons**: rejected — deep links and refreshes arrive
  with no useful history, and the browser already owns history-back. Explicit
  parent routes are predictable and idempotent.
- **Adopting an i18n library for labels**: deferred — `labels.ts` is designed
  as the seam, but translation is a separate future effort (would also revisit
  ADR 0023).

## Consequences

- Per-screen fixes become mechanical: the map's fix tickets apply the standard
  screen by screen against the audit's inventory.
- Review gains teeth: `text-sm`/`h-7` on a control in a route file, a new
  native enum `<select>`, hand-capitalized enum text, or a hand-rolled back
  affordance are violations by definition.
- Marketing pages and admin routes are out of scope; they can adopt the
  conventions in a later effort. Visual identity is likewise untouched.
- A regression guard (e.g. viewport screenshot checks in e2e) is worth
  deciding on now that the standard exists — tracked on map #277.
