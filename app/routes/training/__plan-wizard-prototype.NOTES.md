# Prototype — Plan Generation wizard ("plan training program")

**Question:** What's the best *step-based wizard* for building a training plan,
desktop + mobile?

**History:** cut 1 generic (stepper/studio/chat); cut 2 bold app-native
(tape/curve/summit — surfaced a fabricated-CTL problem); cut 3 single-page
"optimal" builders (planner/sculptor/brief). This **cut 4** is what was asked
for: a stepped **wizard**, in three structurally different forms — all carrying
the corrected foundation.

**Shape:** UI prototype, sub-shape A. Variants on `/training/plan/new`, gated by
`?variant=rail|sidebar|focus`, cycled from the floating PrototypeSwitcher
(← / →). Global chrome hidden (see `root.tsx`). Generation + approve stubbed.

All three share the same 5 steps (Goal → Sports → Experience → Timeline →
Review) and the same honest preview (phase ribbon + projected weekly load in
**hours**, explicitly a projection — never a fabricated CTL — plus week-grouped
sessions and the "regeneration only replaces future generated sessions" note).

## Variants (same steps, radically different stepping)

- **`rail` — Progress Rail**: classic top numbered rail, one decision per
  screen, Back/Continue. Mobile-first, big tap targets.
- **`sidebar` — Step Sidebar**: desktop has a vertical numbered step list you
  can jump back to (checkmarks + active highlight); mobile collapses to a thin
  progress bar + content.
- **`focus` — Focus (one-at-a-time)**: full-bleed single question, thin top
  progress bar, **Enter to advance**. Calmest / most immersive.

Screenshots (desktop + mobile: goal, timeline, plan) in `/prototype-screens`.

## How to run

```
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test __plan-wizard-proto
# or open, logged in:  /training/plan/new?variant=rail
```

## Verdict

_TBD — awaiting Lars._ `rail` is the safest default; `sidebar` is best when
people want to jump around; `focus` is the most premium-feeling. Once chosen:
fold into `plan.new.tsx` (re-wire EventSource + approve), then delete this file,
the `?variant` branch in `plan.new.tsx`, the plan-wizard bits in `root.tsx`,
and the harness.
