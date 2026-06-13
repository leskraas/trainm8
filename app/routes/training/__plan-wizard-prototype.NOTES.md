# Prototype — Plan Generation wizard ("plan training program")

**Question:** What's the *optimal* plan-builder for this app — desktop + mobile?

**History:** cut 1 = generic stepper/studio/chat (rejected, too conventional).
Cut 2 = bold app-native takes (tape / load-curve / summit) — surfaced a key
problem: the curve fabricated a derived CTL number, which CONTEXT.md forbids
(CTL/ATL/TSB are never authored). This cut 3 is the **optimal** set: it keeps
the boldness but applies the review feedback.

**Feedback applied (all three variants):**
1. Collects every input the generator needs, incl. **experience** (earlier bold
   cut dropped it).
2. **No fabricated metrics** — projections show the plan's own *Planned weekly
   load in hours*, explicitly labelled a projection, never a derived CTL.
3. **Accessible** — real `<label>`s, `role`/`aria-pressed`/`aria-checked`,
   keyboard-operable controls, `aria-label` on the SVG.
4. **One consistent light in-app surface** (no dark/light split).
5. **Regeneration nuance surfaced** — "replaces only future generated sessions".

**Shape:** UI prototype, sub-shape A. Variants on `/training/plan/new`, gated by
`?variant=planner|sculptor|brief`, cycled from the floating PrototypeSwitcher
(← / →). Global chrome hidden (see `root.tsx`). Generation + approve stubbed.

## Variants (all "optimal", radically different shapes)

- **`planner` — Planner (hybrid, recommended)**: accessible sticky control panel
  + a preview you flip between **Tape** (scrollable time-ribbon, phases as
  bands, week columns) and **Weeks** (list), above an honest projected-load
  strip + phase ribbon. The daily-driver.
- **`sculptor` — Load Sculptor (honest)**: hero = projected **weekly training
  load (hours)** you shape with an ambition dial; clearly a projection, not a
  fitness promise; phases + sessions below. Data-first.
- **`brief` — Training Brief (accessible-first)**: one clean scrollable column —
  a sectioned brief → big readable preview (phase ribbon + full week-grouped
  sessions). Fastest, most accessible, closest to the honest baseline.

Screenshots (desktop + mobile) in `/prototype-screens`.

## How to run

```
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test __plan-wizard-proto
# or open, logged in:  /training/plan/new?variant=planner
```

## Verdict

_TBD — awaiting Lars._ Recommendation: ship **planner** as the chassis; it
already folds in the Tape (cut 2) as a view and the honest projection (fixed
sculptor). Once chosen: fold into `plan.new.tsx` (re-wire EventSource + approve),
then delete this file, the `?variant` branch in `plan.new.tsx`, the
plan-wizard bits in `root.tsx`, and the harness.
