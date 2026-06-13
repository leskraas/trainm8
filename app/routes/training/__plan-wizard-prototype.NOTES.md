# Prototype — Plan Generation wizard ("plan training program")

**Question:** What should the plan-creation flow look like? The live
`/training/plan/new` is a single dense form → SSE generate → stacked preview. We
want a well-designed flow that works on both desktop and mobile.

**Shape:** UI prototype, sub-shape A. Three radically different variants render
on the existing `/training/plan/new` route, gated by `?variant=A|B|C` and
cycled from the floating `PrototypeSwitcher` (← / → keys). Global app chrome is
hidden for these (see `root.tsx`) so each is a focused full-screen flow.
Generation + approve are **stubbed** (no SSE, no DB write) so every state is
clickable/screenshot-able without a backend.

## Variants

- **A — Guided Stepper** (`?variant=A`): one decision per screen (Goal → Sports
  → Level → Timeline → Review), progress rail, big tap targets, animated
  generating screen. Mobile-first; calmest for newcomers.
- **B — Split Studio** (`?variant=B`): dense two-pane — sticky control panel
  (all inputs at once) + live plan preview grouped by week. Desktop-first power
  layout; stacks on mobile with the preview below the inputs.
- **C — Coach Chat** (`?variant=C`): conversational column — the coach asks,
  the athlete answers via inline chips/controls, and the plan arrives as a rich
  coach message. Friendliest / most narrative.

Screenshots (desktop + mobile, input + plan states) in `/prototype-screens`.

## How to run

```
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test __plan-wizard-proto
# or just open, logged in:  /training/plan/new?variant=B
```

## Verdict

_TBD — awaiting Lars._ Likely outcome is a hybrid (e.g. Stepper's guided
hierarchy on mobile + Studio's live-preview density on desktop). Once chosen:
fold the winner into `plan.new.tsx` (re-wire the real EventSource + approve
action), then delete this file, the `?variant` branch in `plan.new.tsx`, the
`isFocusedPrototype`/plan-wizard bits in `root.tsx`, and the screenshot harness
`tests/e2e/__plan-wizard-proto.test.ts`.
