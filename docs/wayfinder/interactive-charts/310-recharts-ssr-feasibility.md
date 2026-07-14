# Research: Recharts (shadcn `chart`) in this Epic Stack SSR setup — feasibility & cost

Resolves [#310](https://github.com/leskraas/trainm8/issues/310) under the map
[Wayfinder map: interactive shadcn-style charts & diagrams](https://github.com/leskraas/trainm8/issues/309).

**Posture:** this is a research ticket — it gathers _evidence_, it does not pick the
approach. The approach decision belongs to
[Prototype: Recharts vs hand-rolled — weekly-load bars + CTL curve, side by side](https://github.com/leskraas/trainm8/issues/311).
Where a fact points at a prototype risk, it's flagged **→ prototype** rather than decided here.

---

## TL;DR

- **It can run.** Recharts v3 declares React 19 in its peer range and shadcn's `chart`
  component is on Recharts v3, so nothing in `react@19.2` / `react-router@7.13` / `vite@7` /
  `tailwind v4` / `base-rhea` structurally blocks it.
- **But it is not SSR-native.** shadcn's `ChartContainer` wraps Recharts `ResponsiveContainer`,
  which measures the DOM on the client and renders **nothing meaningful on the server**. The
  official component ships with `"use client"` and requires a fixed `min-h`/`aspect` so it can
  measure on first paint. That is the opposite of our current charts, which render complete SVG
  on the server with zero measurement.
- **Cost is real but tree-shakeable.** Full package is ~515 kB min / ~136 kB gzip; realistic
  tree-shaken usage is commonly cited around ~50 kB gzip. Today the app ships **zero** charting
  dependency, so this is net-new weight either way.
- **Touch is the weak spot** and the one that hits our mobile-first mandate hardest — Recharts
  has a long history of tap-tooltip bugs; v3's default `accessibilityLayer` improves
  keyboard/AT but touch-tap remains **→ prototype**-worthy to verify at 390 px.
- **A11y / honesty do not come for free** — `accessibilityLayer` gives keyboard + screen-reader
  affordances but uses `role="application"` (a VoiceOver caveat), and there is no built-in
  "Unavailable Metric" concept; honest empty-state rendering is on us regardless of library.

---

## The stack we're dropping it into (local facts)

Measured from the repo on branch `claude/wayfinder-309-nfleuj`:

| Fact | Value | Source |
|---|---|---|
| Framework | React Router 7.13 (`ssr: true`) | `react-router.config.ts` |
| React | 19.2.4 | `package.json` |
| Bundler | Vite 7.3, `build.target: es2022`, `unstable_optimizeDeps` | `vite.config.ts`, `react-router.config.ts` |
| Styling | Tailwind v4 (CSS-first, **no** `tailwind.config`), `app/styles/tailwind.css` | `components.json` |
| shadcn | CLI `4.8.2`, style `base-rhea`, `rsc: false`, `tsx: true`, icons `tabler` | `components.json`, `package.json` |
| Charting deps today | **none** — no `recharts`, no `d3-*`, no `victory-vendor` | grep of tree/lockfile |
| Existing charts | hand-rolled SVG, `viewBox` + `preserveAspectRatio="none"`, no `window`, no measurement | `fitness-journey.tsx`, `shape-strip.tsx`, `route-sketch.tsx` |

The existing `fitness-journey.tsx` is the reference for "how we do charts now": a pure function of
props → SVG string, laid out in a fixed `800×220` viewBox and stretched with CSS. It renders
identically on server and client (no hydration risk), degrades to explicit **Unavailable** text
(`role="img"` + `aria-label`, and an inline "projection unavailable · reason" note) rather than a
fabricated point, and carries no runtime dependency. Any Recharts adoption trades that property away.

---

## Q1 — Does `shadcn add chart` + Recharts render under React Router SSR (`rsc: false`)? Hazards?

**Yes, it renders — but only after client hydration, not on the server.**

- shadcn's `chart` is **on Recharts v3** and its docs state plainly: *"We use Recharts under the
  hood,"* that `ChartContainer` wraps `ResponsiveContainer`, and *"keep a height, `min-h-*`, or
  `aspect-*` on `ChartContainer` so `ResponsiveContainer` can measure on first render."* The
  example components carry `"use client"`.
- `ResponsiveContainer` **cannot render on the server**: it needs pixel dimensions it can only get
  from the DOM (ResizeObserver / element measurement), so during SSR it has no size and emits no
  chart. This is a long-standing, acknowledged Recharts limitation (issues
  [#531](https://github.com/recharts/recharts/issues/531),
  [#3595](https://github.com/recharts/recharts/issues/3595)) and resurfaced under React 19
  ([#4590](https://github.com/recharts/recharts/issues/4590), closed *not planned*).

**Implication for `rsc: false`:** `rsc: false` means components are ordinary client/SSR React (not
React Server Components), so there is no RSC boundary problem — but it also means our routes _do_
server-render, and a `ResponsiveContainer`-based chart will SSR as an empty sized box that fills in
after hydration. Practical consequences:

- **First paint shows no chart** (empty min-height box) until JS hydrates — a visible pop-in,
  and nothing at all if JS fails/av is slow. Our current SVG charts show fully on first byte.
- **Hydration mismatch risk** is low *if* the container reserves a fixed height and the chart body
  is genuinely client-only (server renders the same empty container). It becomes a real mismatch if
  anything tries to render chart geometry during SSR. The safe pattern is: reserve space server-side,
  render the Recharts tree client-side only.
- Escape hatches exist (fixed `width`/`height` instead of `ResponsiveContainer`, or an
  `initialDimension` prop) that _can_ SSR real geometry, at the cost of the "responsive" part —
  **→ prototype** should try a fixed-viewBox-style Recharts config to see if we can keep SSR.

## Q2 — Bundle-size delta

Net-new, because we currently ship **0 KB** of charting.

- Recharts v3 full: **~515 kB minified / ~136 kB gzip** (bundlephobia, v3.9.x).
- Tree-shaken real-world usage is commonly cited **~50 kB gzip** when importing only the chart
  types used (v3 removed `react-smooth` and `recharts-scale`; d3 bits now come via `victory-vendor`).
- For comparison in the same class: Chart.js ~66 kB gzip, Frappé ~15 kB gzip, "Chart.ts" claims
  <15 kB gzip. A thin hand-rolled SVG primitive (our current approach) adds **~0 KB** runtime.

**So the delta is roughly +50 kB gzip realistic / +136 kB worst-case**, versus ~0 for staying
hand-rolled. Whether that's acceptable is a decision for #311, not this ticket.

## Q3 — Touch on mobile out of the box, or hover-only?

**Historically hover-first, with a documented trail of mobile-tap tooltip bugs** — this is the
single biggest risk against ADR-0028 (mobile-first, no hover on touch).

- Recharts `Tooltip` default `trigger` is `hover` (mouse enter/leave). Tap-to-show on touch has
  been repeatedly broken (issues [#754](https://github.com/recharts/recharts/issues/754) bar charts,
  [#444](https://github.com/recharts/recharts/issues/444) area charts; line charts were fixed
  earlier).
- v3's **`accessibilityLayer` is on by default** and adds pointer/keyboard-driven active-index
  movement, which improves the tap story versus v2 — but there is no clean "tap a bar → inspect,
  tap elsewhere → dismiss" contract guaranteed out of the box.
- **→ prototype (#311):** must verify tap-to-inspect + dismissal at 390×844 on a real bar chart
  and CTL curve. This is exactly the kind of thing that looks fine on desktop and fails on a phone.

## Q4 — Lighter shadcn-compatible alternatives worth noting

For the prototype's comparison column (not a recommendation):

- **Hand-rolled SVG + a thin primitive** (extend `fitness-journey.tsx`): ~0 KB, SSR-native,
  full control over honesty & touch — but every chart type is bespoke work. This is the incumbent
  and the natural "other side" of the #311 prototype.
- **Recharts v3 (shadcn official `chart`)**: best "like shadcn" fidelity + theming tokens; the SSR
  and touch caveats above.
- **Chart.js / react-chartjs-2**: smaller (~66 kB gzip), canvas-based — but canvas is _not_ SSR-able
  at all and is harder to theme with our CSS variables / zone palette; weaker a11y story.
- **Frappé / "Chart.ts" / Lightweight-Charts**: smaller still, but not shadcn-idiomatic; Lightweight
  Charts is finance-specialised (candles/series), a poor fit for planned-vs-actual bars.

The realistic contest is **Recharts-v3-via-shadcn vs hand-rolled-SVG-made-interactive** — which is
precisely how #311 is framed.

## Q5 — Reconciling with `aria-hidden` / Unavailable Metric conventions

- **Unavailable Metric (ADR-0008):** Recharts has **no** notion of an honest empty/unavailable
  datum. Feeding it `0` or a gap draws a zero bar or a broken line — a fabrication we forbid. So the
  "render Unavailable, not a zero bar" behaviour must be built _around_ the library (filter the
  datum out and render an explicit label/placeholder), exactly as `fitness-journey.tsx` does today.
  **Library choice does not solve honesty; it's our layer either way.** This is a core input to the
  contract ticket
  [Decide: the honesty + accessibility + mobile-interaction contract](https://github.com/leskraas/trainm8/issues/312).
- **Accessibility:** our current charts are effectively "image + text equivalent" (`role="img"` +
  `aria-label`, or `aria-hidden` glyphs like the Workout Shape strip with the real value stated in
  text). Recharts v3 instead offers `accessibilityLayer` → `role="application"` with arrow-key
  navigation and `aria-live` tooltip announcements. These are **two different a11y philosophies**;
  `role="application"` has a known VoiceOver/QuickNav caveat and doesn't automatically give us the
  "text statement is the accessible truth" property we rely on. Which philosophy wins is a #312
  decision.

---

## Facts that feed the next tickets

- **#311 (prototype/approach):** build both columns; specifically stress (a) SSR — can we avoid
  `ResponsiveContainer` and keep first-paint SVG? (b) tap-to-inspect + dismiss at 390 px; (c) an
  Unavailable/empty week; (d) measure the actual tree-shaken bundle delta in _our_ build, not
  bundlephobia's number.
- **#312 (contract):** honesty (no zero bar — our layer regardless of library), a11y philosophy
  (`role="img"`+text vs Recharts `accessibilityLayer`/`role="application"`), tap interaction model.
- **#313 (build):** whichever approach wins, the "Unavailable, never a zero bar" and 390 px
  tap-inspect behaviours are hand-built obligations, not library defaults.

## Sources

- shadcn Chart component — https://ui.shadcn.com/docs/components/chart
- Recharts v3 releases & 3.0 migration guide — https://github.com/recharts/recharts/releases · https://github.com/recharts/recharts/wiki/3.0-migration-guide
- Recharts bundlephobia (v3.9.x) — https://bundlephobia.com/package/recharts
- SSR / ResponsiveContainer issues — [#531](https://github.com/recharts/recharts/issues/531), [#3595](https://github.com/recharts/recharts/issues/3595), [#4590](https://github.com/recharts/recharts/issues/4590)
- Touch/mobile tooltip issues — [#754](https://github.com/recharts/recharts/issues/754), [#444](https://github.com/recharts/recharts/issues/444)
- Recharts accessibility (wiki) — https://github.com/recharts/recharts/wiki/Recharts-and-accessibility
- shadcn/ui charts a11y review (Ashlee Boyer) — https://ashleemboyer.com/blog/a-quick-ish-accessibility-review-shadcn-ui-charts/
- React chart library comparisons (2026) — https://blog.logrocket.com/best-react-chart-libraries-2026/ · https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026

_Local stack facts verified against the repo at commit `aaaedde` on `claude/wayfinder-309-nfleuj`._
