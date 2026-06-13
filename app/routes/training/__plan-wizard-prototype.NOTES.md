# Prototype — Plan Generation wizard ("plan training program")

**Question:** What should the plan-creation flow look like? The live
`/training/plan/new` is a single dense form → SSE generate → stacked preview.
Brief: don't follow generic patterns — this is built from scratch, so make
something unique to *this* app.

**Approach:** instead of generic wizard chrome (stepper / split-pane / chat —
the rejected first cut), each variant **is** one of this product's own domain
primitives. Plans here are about *time*, *form (Training Load)*, and the
*journey to an event* — so each variant manipulates one of those directly.

**Shape:** UI prototype, sub-shape A. Three variants render on the existing
`/training/plan/new` route, gated by `?variant=tape|curve|summit` and cycled
from the floating `PrototypeSwitcher` (← / → keys). Global app chrome is hidden
for these (see `root.tsx`). Generation + approve are **stubbed** (no SSE, no DB
write) so every state is clickable/screenshot-able without a backend.

## Variants

- **`tape` — The Tape**: builds the plan ON a horizontal time-ribbon — the app's
  signature primitive (CONTEXT.md "The Tape"). NOW on the left, the event flag
  on the right, periodization phases as colored bands, each week a column of
  session tiles; scrub a week to expand its sessions. Dark, spatial, temporal.
- **`curve` — Load Sculptor**: the projected **fitness curve** (CTL ramp) is the
  hero — "the form you're buying." An ambition dial reshapes the curve live;
  weekly load bars sit under it; NOW/GOAL verticals and phase bands anchor it.
  Sessions are derived from the shape. Direct manipulation of Training Load,
  which only an app that models CTL/ATL/TSB can offer.
- **`summit` — The Ascent**: the plan as a route climbing to the event summit;
  phases are altitude camps from base (this week) to summit (race day).
  Narrative and motivational.

Screenshots (desktop + mobile, setup + plan states) in `/prototype-screens`.

## How to run

```
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test __plan-wizard-proto
# or just open, logged in:  /training/plan/new?variant=curve
```

## Verdict

_TBD — awaiting Lars._ Once chosen: fold the winner into `plan.new.tsx`
(re-wire the real EventSource + approve action), then delete this file, the
`?variant` branch in `plan.new.tsx`, the `isFocusedPrototype`/plan-wizard bits
in `root.tsx`, and the harness `tests/e2e/__plan-wizard-proto.test.ts`.
