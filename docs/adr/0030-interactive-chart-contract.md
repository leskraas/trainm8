# Interactive chart contract: honesty, accessibility, mobile interaction

With the hand-rolled approach chosen (ADR 0029), every interactive chart must
obey one contract so the reference build (#313) and every later conversion
inherit it. These rules resolve three questions from map #309, decided against a
live prototype at 390×844. They are library-agnostic — they would hold even
under a charting library, which is why the prototype found each of them is our
own layer regardless of implementation.

## Decision

Three rules the **Chart Primitive** (ADR 0029) enforces:

1. **Honesty — the Unavailable Metric inside a chart (ADR 0008).** An
   **Unavailable Metric** period draws **no bar or point** — never a zero bar,
   never a fabricated value — and carries an **explicit marker** at its slot (a
   small `n/a` tick), so it is distinguishable at a glance from a true zero or a
   mis-tap. **Chart Inspect** on that slot states the reason ("Actual load
   Unavailable — planned 340 TSS, no trustworthy recording to compare"), never a
   silent gap. A companion value that _is_ known (e.g. planned load) still
   shows.

2. **Accessibility — `role="img"` plus a data-table equivalent.** The chart SVG
   keeps the house idiom (`fitness-journey.tsx`, `route-sketch.tsx`):
   `role="img"` with a concise `aria-label`. The accessible equivalent is a text
   summary plus a **visually-hidden data table** carrying the same values the
   inspect panel shows, so assistive-tech and keyboard users get every value.
   The chart is focusable; arrow keys move the inspection across marks,
   Enter/Space inspects, Escape dismisses. We do **not** adopt a
   `role="application"` per-point interactive model (a different a11y philosophy
   that would couple us to a library).

3. **Mobile interaction — tap-to-inspect (ADR 0028: no hover on touch).**
   Tapping a mark inspects it into a **fixed panel below the chart** — never a
   tooltip floating over the marks, which obscures neighbours at 390px.
   Re-tapping the same mark, tapping empty plot area, or pressing Escape
   **dismisses**. Desktop hover is parity, mirroring the same panel. (The
   prototype found a library's click-tooltip snaps to the nearest mark and never
   clears — dismissal and anchoring are our obligation regardless.)

## Consequences

- The **Chart Primitive** implements the marker, the fixed inspect panel and its
  dismissal, the `role="img"` + visually-hidden data table, and keyboard
  inspection **once**; individual charts only supply data and configure them.
- Axis, tooltip, and inspect values format through the shared display-formatting
  layer (ADR 0023, `app/utils/format.ts`) — no ad-hoc number/date rendering.
- New domain terms **Chart Primitive** and **Chart Inspect** enter `CONTEXT.md`.
- The reference build (#313) is verified at 390×844 — including an
  Unavailable/empty week exercising rule 1 — before it closes.
