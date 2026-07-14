# Full-size 44px form controls

Supersedes the form-control **height** decision in [ADR 0028](0028-mobile-first-ui-standard.md)
(pillar 2, "Form controls"). Everything else in ADR 0028 — spacing/layout,
navigation, enum labels, the 16px-phone control font, and the 390×844
verification gate — stands unchanged.

ADR 0028 chose **compact-but-tappable**: controls kept a 32px (`h-8`) visual
height on every viewport and reached a ~44px *effective* touch target through an
invisible `after:` hit-area extension (the `checkbox.tsx` pattern). In practice
that traded a visible, honest target for an invisible one: the extension has to
be hand-tuned per size, and trimmed by hand in dense clusters so adjacent
extensions meet instead of stacking — a standing source of per-case fiddling.
The mobile audit (#278) had itself flagged sub-44px targets and values clipping
inside 32px fields as the core problems; a real 44px control addresses both at
the source.

## Decision

The **default** form control is a real **44px (`h-11`) tall** on all viewports:

- `input`, the default `Select` trigger, and the default `Button` are `h-11`.
- `textarea` keeps its multi-line `min-h-16`.
- Native date/time `input`s get `appearance-none` plus resets on their internal
  `::-webkit-datetime-edit` / `::-webkit-date-and-time-value` box (in
  `tailwind.css`, keyed off `data-slot="input"`) so iOS Safari no longer pads
  them taller than sibling text fields.
- The invisible `after:` hit-area extension is **retained only where a control
  genuinely can't be 44px tall**: the compact button sizes (`xs`/`sm`/`lg`),
  icon buttons, inline text links, steppers, chips, and glyph chrome marks
  (⠿/⋮/＋). On the now-44px default controls the base `after:` inset is cancelled
  back to the visual edge.

The physics still live in the ui primitives (`input.tsx`, `select.tsx`,
`button.tsx`); per-screen height overrides remain review flags. The 16px-phone /
14px-desktop control font (ADR 0028 §2.3) is unchanged — it is the actual
iOS-zoom fix and is orthogonal to height.

## Alternatives considered

- **Keep the compact 32px + hit-area extensions (the ADR 0028 status quo):**
  rejected — the invisible extension is fragile (per-size tuning, manual
  trimming in dense clusters) and leaves the *visible* target below the platform
  guideline the audit was chasing. A real 44px control is simpler and honest.
- **Scope the bump to native date/time inputs only:** rejected — it would leave
  text, select, and button controls at 32px, so forms would mix heights and the
  "compact density" rationale would only half-hold. If we're keeping 44px, keep
  it uniformly.
- **Bump every button size and icon button to 44px too:** rejected —
  `xs`/`sm`/`lg` and icon sizes are deliberate scale steps (toolbars, dense
  editor rows); enlarging them all would bloat those surfaces. Only the
  *default* size grows; the smaller sizes keep the hit-area extension.

## Consequences

- ADR 0028's compact-32px height decision no longer holds; `docs/design/ui-conventions.md`
  §2.1–2.2 are rewritten to the 44px stance.
- The `after:` hit-area machinery is now redundant on default controls (it
  cancels to the visual edge) but still load-bearing for compact sizes, inline
  links, and glyph marks — so it stays. Simplifying it further is a possible
  future cleanup, not part of this decision.
- `docs/design/mobile-audit.md` (#278) reads as a historical snapshot: its
  "32px everywhere → sub-44px targets" inventory described the pre-standard
  baseline and the ADR 0028 remedy, not the current target.
- The wayfinder map #277 form-control pillar (decided in #280, implemented in
  #289) is revised by this ADR; the change applies globally through the shared
  primitives, so every screen inherits it.
- Still gated on 390×844 Playwright verification before shipping (ADR 0028's
  verification rule is unchanged).
