# Charting approach: hand-rolled SVG on a shared Chart primitive

Every visualization in the app is hand-rolled, dependency-free SVG/CSS: the CTL
curve (`fitness-journey.tsx`), the **Workout Shape** strip (`shape-strip.tsx`),
the GPS **Route Sketch** (`route-sketch.tsx`). Making charts _interactive_ (map
#309) forced a choice: adopt a charting library — Recharts, via shadcn's
official `chart` component — or extend the hand-rolled approach. Research (#310)
and a measured side-by-side prototype (#311) gathered first-hand evidence in
this stack at 390×844.

## Decision

Charts stay **hand-rolled SVG**, but no longer ad hoc: a single small,
SSR-native, zero-dependency **Chart Primitive** owns the shared machinery —
scale and ticks, the **Chart Inspect** (tap-to-inspect) controller, the
**Unavailable Metric** marker, and the accessible data-table equivalent. Every
interactive chart is built on it. Recharts and the shadcn `chart` component are
not adopted.

The contest looked like "library vs bespoke", but the evidence collapses it:

- **The expensive parts are ours either way.** The prototype showed the app's
  defining chart behaviours — the **Unavailable Metric** marker, tap-to-inspect
  _and_ dismiss, and the `role="img"` + text/table accessible equivalent — are
  hand-built _on top of_ Recharts too. The library's only free lunch
  (axes/ticks/legend/animation) is the cheap part.
- **Recharts is not SSR-native.** `ResponsiveContainer` measures the DOM
  client-side, so it server-renders only an axis frame; the data geometry (bars,
  line) appears after hydration and then reflows. Hand-rolled paints the
  complete chart on the first byte with no reflow, as `fitness-journey.tsx` does
  today.
- **Bundle.** Recharts measured ~111 KB gzip as a lazy route chunk; hand-rolled
  is ~0 KB. The app ships 0 KB of charting today.
- **There is no reusable chart layer for a library to amortise against.** The
  three existing charts share almost no geometry — `shape-strip` is flexbox,
  `route-sketch` is a bespoke projected path, `fitness-journey` has inline scale
  math and _no_ interaction. Hand-rolled's real cost (bespoke geometry per
  chart) is only paid if charts stay ad hoc — a shared primitive collapses it.
- **The palette is already in code.** The zone / **Adherence Band** palette
  lives in `cockpit/shared.tsx`; the primitive bridges to it rather than
  re-theming a library.

## Alternatives considered

- **Recharts (shadcn `chart` component), Recharts v3 via
  `npx shadcn add chart`**: rejected. Feasible in this stack (React 19 peer,
  `rsc: false` fine) and its `trigger="click"` tooltip _does_ work on touch —
  but it trades away SSR-native rendering, adds ~111 KB gzip, and still leaves
  honesty, tap-to-dismiss, and the accessible equivalent as hand-built layers.
  It buys polish for the cheap part and none of the expensive part.
- **Keep charts ad hoc (hand-rolled with no shared primitive)**: rejected. It is
  how we got here — three charts sharing nothing and none interactive — and
  would re-pay the geometry/interaction cost on every future chart.

## Consequences

- The **Chart Primitive** (a `ChartContainer`-equivalent + theme tokens bridged
  to the zone/**Adherence Band** palette) is extracted as part of the reference
  build (#313), **not** deferred to a later ticket: building the weekly-load bar
  chart without extracting it would just mint a fourth ad-hoc chart.
- Its inspect controller is designed for **both** discrete (bar/category) and
  continuous-series (line/area) inspection from day one, because the **Telemetry
  Overlay** (ADR 0020: multi-channel, ~1000-sample downsampled **Activity
  Stream** with `null` gaps) is a distinct interaction regime — though not a
  rendering-perf wall (one polyline per channel). This avoids baking a bar-only
  contract the Overlay later fights.
- The throwaway `/proto/charts` route and the `recharts` dependency added for
  the #311 prototype are removed when the reference build lands.
- The honesty + accessibility + mobile-interaction rules the primitive must obey
  are specified in **ADR 0030**.
- Existing static charts migrate onto the primitive as they gain interactivity
  (map #309 fog: the CTL curve, Discipline Allocation, the Telemetry Overlay).
  The **Workout Shape** strip and **Route Sketch** stay bespoke and out of scope
  — they are pre-attentive glyphs, not data charts.
