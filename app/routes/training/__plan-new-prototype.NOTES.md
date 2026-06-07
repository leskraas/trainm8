# Prototype — Plan-generation wizard UX

**Question:** What flow/layout should the "Generate a Training Plan" wizard use?

**How to view:** open `/training/plan/new?variant=A` (logged in, dev only). Flip
between variants with the floating bottom bar or `←`/`→` arrow keys.

Generation is **simulated** here (timed progress + a hardcoded sample preview) so
the idle → generating → preview flow is demonstrable without an athlete profile.

## Variants

- **A · Guided Stepper** — one decision per screen (Disciplines → Experience →
  Goal → Target → Review), progress rail, Back/Next, summary before generate.
  Best for first-timers / mobile; more clicks.
- **B · Narrative builder** — one editable sentence; click any underlined token
  to set it in a popover. Fastest, most opinionated, low friction; less
  discoverable, weaker on mobile.
- **C · Split workbench** — persistent control panel + live preview pane.
  Optimised for the tweak-and-regenerate loop; desktop-first, denser.

All three reuse one shared preview body (periodization bar + phase list + next
sessions) and one shared "generating" checklist.

## Verdict

_TBD — fill in which layout (or mix) wins, then fold it into `plan.new.tsx`
(wiring the real `generate()`/approve) and delete this file, the prototype file,
and the `?variant=` branch + imports in `plan.new.tsx`._

Common request shape: "stepper structure from A, but with C's live preview pane."
