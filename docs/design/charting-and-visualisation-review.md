# Charting and visualisation review — what to build with, and what earns space in variant J

_Written 2026-08-14. Verified against npm's registry API, the GitHub REST API, and
each package's own repository source on that date. Every version and
last-publish date below was read from `registry.npmjs.org`, not from a blog post._

## Where this file lives, and why

Three candidate homes were inspected:

- **`docs/research/`** — its own index says it holds "Eighteen research documents
  covering how a best-in-class endurance training platform analyses workouts…
  Written from **primary sources**… Findings are recorded vendor-neutrally — **no
  product is named**" (`docs/research/README.md:1-12`). This document names
  eleven products and compares them. It would violate the stated charter of that
  directory.
- **`docs/adr/`** — holds decisions, and the relevant ones already exist
  (ADR 0029, ADR 0030). This file does not supersede them; it re-tests them
  against a package that did not exist when they were written, and recommends
  a small amendment rather than a reversal. It is input to a decision, not one.
- **`docs/wayfinder/interactive-charts/`** — the repo's existing chart research
  (`310-recharts-ssr-feasibility.md`, `311-recharts-vs-handrolled.md`). Files
  there are named by the GitHub issue they resolve. This work has no issue.

So: **`docs/design/`**, alongside `ui-conventions.md` and `mobile-audit.md` —
the home for cross-cutting frontend standards and audits. That directory has
**no `README.md` or index file**, so there was no index to update. If one is ever
created, this file and `docs/wayfinder/interactive-charts/310`–`311` belong in it
together.

> A sibling document on `@dnd-kit/react` and TanStack Table/Virtual for the same
> surface was written concurrently and may land in this directory too. Drag-and-
> drop and table virtualisation are deliberately out of scope here; where they
> touch this argument it is flagged in one sentence and dropped.

---

## The finding that reframes the question

The brief for this review said "every chart in this repo today is hand-rolled
inline SVG. There is no charting dependency." That is true, and it undersells
the situation in a way that changes the answer.

**The repo has already run this evaluation once, decided it, and shipped the
result.**

- `docs/wayfinder/interactive-charts/310-recharts-ssr-feasibility.md` — research
  on Recharts-via-shadcn in this exact stack.
- `docs/wayfinder/interactive-charts/311-recharts-vs-handrolled.md` — a
  **measured** side-by-side prototype at 390×844, with screenshots and a real
  bundle number from our own build (`371 KB raw / ~111 KB gzip` route chunk).
- **ADR 0029** — the decision:
  > "Charts stay **hand-rolled SVG**, but no longer ad hoc: a single small,
  > SSR-native, zero-dependency **Chart Primitive** owns the shared machinery —
  > scale and ticks, the **Chart Inspect** (tap-to-inspect) controller, the
  > **Unavailable Metric** marker, and the accessible data-table equivalent.
  > Every interactive chart is built on it. Recharts and the shadcn `chart`
  > component are not adopted." (`docs/adr/0029-charting-approach-hand-rolled-svg.md:13-18`)
- **ADR 0030** — the three rules every chart obeys: no zero bar for an
  Unavailable Metric, `role="img"` + a visually-hidden data table, and
  tap-to-inspect into a fixed panel below the chart
  (`docs/adr/0030-interactive-chart-contract.md:14-39`).
- **The primitive exists and is shipped**: `app/components/chart/chart.tsx`
  (508 lines) — `niceLinearTicks` (`:52-64`), `useChartInspect` (`:127-244`),
  `ChartFigure` (`:322-420`), `ChartUnavailableMark` (`:432-451`),
  `ChartDataTable` (`:472-508`).
- **Five production charts already sit on it**: `__season-chart.tsx:544` and
  `:900`, `cockpit/discipline-mix.tsx:60`, `cockpit/weekly-build.tsx:55`,
  `cockpit/fitness-journey.tsx:144`, `sessions.$sessionId.tsx:1664`. A raw
  `grep '<svg'` **undercounts** the chart inventory, because charts on the
  primitive draw no literal `<svg>` of their own.
- **`CONTEXT.md:2069-2082`** enters **Chart Primitive** and **Chart Inspect**
  into the domain vocabulary, with `_Avoid_: Chart library, ChartContainer (the
  shadcn name), Recharts.`

The second reframing finding, which matters even more for Part 2:

**The "season load profile per Training Track, coloured by Week Role" already
exists.** `app/routes/training/__season-chart.tsx` (1382 lines) is the *layered
season chart* from variant F / #413 — volume, fitness, rhythm, ramp and emphasis
stacked on one time axis, mounted on `ChartFigure`, imported by the production
route `app/routes/training/plan.tsx:244`. It has a 512-line behaviour test
(`__season-chart.route.test.tsx`) that asserts through ARIA, not pixels. So the
Part 2 question is not "should J get a season chart" but "**what, if anything,
should J show inline given that this chart already exists one navigation away**".

So the honest framing of Part 1 is not "library vs hand-rolling". It is:
**does anything on npm today beat a shipped, SSR-native, zero-dependency
primitive that already encodes three ADRs?**

---

# Part 1 — what to build with

## 1.1 What the sources state: verified package status

All figures read on **2026-08-14** from `https://registry.npmjs.org/<pkg>`
(versions, publish times, dependencies, peer metadata) and
`https://api.github.com/repos/<owner>/<repo>` (stars, open issues, last push).
Weekly downloads from `https://api.npmjs.org/downloads/point/last-week/<pkg>`.
Bundle figures from `https://bundlephobia.com/api/size?package=<pkg>@<version>`
and are **whole main-export, gzip, no tree-shaking** — the pessimistic number.

| Package | Latest | Published | Repo last push | Stars | Open issues | Weekly downloads | Main-export gzip |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `@tanstack/charts` | **0.13.0** | **2026-08-14** | 2026-08-14 | 603 | 13 | 33,128 | 60.3 kB |
| `@tanstack/react-charts` | **0.13.0** | **2026-08-14** | (same repo) | — | — | — | shim only |
| `recharts` | 3.10.1 | 2026-07-25 | 2026-08-12 | 27,502 | 446 | 56,948,933 | 151.3 kB |
| `@visx/shape` | 4.0.0 | 2026-06-11 | 2026-06-22 | 21,005 | 147 | (xychart 478,048) | 10.7 kB |
| `@visx/scale` | 4.0.0 | 2026-06-11 | ” | ” | ” | ” | 17.7 kB |
| `@observablehq/plot` | 0.6.17 | **2025-02-14** | 2026-07-13 | 5,352 | 345 | 587,416 | 129.9 kB |
| `@nivo/core` | 0.99.0 | **2025-05-23** | 2026-07-21 | 14,085 | 49 | 1,763,734 | 60.3 kB |
| `victory` | 37.3.6 | **2025-01-14** | 2025-12-19 | 11,243 | 89 | 466,894 | 119.2 kB |
| `@unovis/react` | 1.6.7 | 2026-06-28 | 2026-08-14 | 2,831 | 107 | 8,291 | 3.4 kB (+ `@unovis/ts`) |
| `d3-scale` | 4.0.2 | **2021-09-24** | — | — | — | 72,770,397 | 16.1 kB |
| `d3-shape` | 3.2.0 | **2022-12-20** | — | — | — | 87,431,779 | 8.4 kB |
| `motion` (installed) | 12.38.0 | — | — | — | — | — | — |
| `motion` (latest) | 13.1.0 | 2026-08-10 | — | — | — | — | — |

`motion` is confirmed as **the animation library published from
`github.com/motiondivision/motion`** — Framer Motion's successor, MIT, latest
13.1.0. `package.json:99` pins `^12.38.0` and `node_modules/motion/package.json`
resolves to **12.38.0**, i.e. one major behind. It is an animation library, not
a charting one; it is relevant here only as a possible entrance/transition layer
over SVG we render ourselves.

### `@tanstack/react-charts` — the verified status

This is the package the owner hoped for, so it gets the full treatment.

**What the sources state:**

- `@tanstack/react-charts@0.13.0`, published **2026-08-14T06:12:57Z** — hours
  before this review was written.
- Its own npm `description` is: _"This compatibility package remains supported
  for existing applications. New applications use the React adapter from
  `@tanstack/charts/react`."_ Its only dependency is `@tanstack/charts@0.13.0`.
  **So `@tanstack/react-charts` is a shim; the real package is
  `@tanstack/charts`.**
- `@tanstack/charts`' **first-ever publish was `0.0.0` on 2026-07-29T18:42:40Z**,
  and `github.com/TanStack/charts` was **created 2026-07-28T00:26:39Z**.
  The project is **17 days old**.
- **27 versions in 17 days** (0.0.0 → 0.13.0), i.e. thirteen minor bumps in
  under three weeks.
- Contributors, via the GitHub API: `tannerlinsley` 251 commits,
  `github-actions[bot]` 25, `gillkyle` 11. It is effectively a one-author
  project so far.
- The repo carries `API-HARMONIZATION-ROADMAP.md`, whose first line is:
  _"This roadmap tracks the **pre-alpha** API audit."_ Items AHR-001 … AHR-011
  are renames and contract changes to public API (`behaviors` → `interactions`,
  `DynamicChart*` → `Responsive*`, `color.type` → `color.resolver`,
  `focusX` → `focusGroupX`, `RenderChartPngOptions` → `RenderChartImageOptions`).
  All are ticked, but their existence dates the API's stability from days ago.
- Open issues include basics: **#92 "Support multiple Y axes in one chart"**,
  **#87 "No way to place the Y axis on the right, which breaks RTL locales"**,
  #93 "Allow styling Cartesian axis titles", #94 "Allow configuring the default
  focus ring appearance".
- Docs are **genuinely complete** — 60+ Markdown files under `docs/`, including
  `guides/ssr-and-hydration.md`, `guides/accessibility.md`,
  `guides/responsive-charts.md`, `guides/themes-and-styling.md`,
  `comparison.md`, plus an `llms.txt` and an `ai-authoring.md`. This is not an
  under-documented alpha. It is a well-documented one.
- Peer deps for every framework are marked `optional: true` in
  `peerDependenciesMeta`, and React's range is `^19.0.0` — compatible with our
  `react@19.2.4`. `sideEffects: false`, **113 export subpaths**, unpacked size
  2.70 MB.

**On our top criterion, its docs say the right things.** From
`docs/guides/ssr-and-hydration.md`:

> "TanStack Charts builds a platform-neutral scene before the selected renderer
> produces output. React … use the same runtime and renderer on the server and
> in the browser." … React server output: **"Complete SVG"**.

and from `docs/framework/react/adapter.md`:

> "The default SVG entry emits: the outer `.ts-chart-host` div, a
> `.ts-chart-surface` div, **the complete accessible shared SVG at
> `initialWidth`**. The client renders the same initial structure, then the
> layout effect adopts and reconciles that SVG. **There is no placeholder-only
> server mode.**"

It also generates a stable `idPrefix` from `React.useId()`, and gives an explicit
"Keep output deterministic" checklist (no `window`, no locale-sensitive
formatting, no random, sort unordered collections). On theming,
`docs/guides/themes-and-styling.md`:

> "The default chart theme uses: `currentColor` for foreground, muted text, and
> grids; `transparent` for the chart background; six CSS-variable-backed
> categorical colors."

with `--ts-chart-1` … `--ts-chart-6` overridable at any container boundary.
`docs/guides/accessibility.md` requires `ariaLabel` on every adapter, emits
`role="img"` + `<desc>` for SVG, exposes keyboard focus, and explicitly says
"Never rely on color alone" and "make touch targets at least 44 CSS pixels where
practical" — the same doctrine as ADR 0028/0030. `README.md` even says
"Set `guides: false` and `margin: 0` for sparklines."

Vendor-reported bundle figures from `benchmarks/comparison/bundle-baseline.json`
(generated `2026-08-14T05:55:21Z`, competitor versions pinned): TanStack line-
basic 38.5 kB gzip vs Recharts 157.7 kB, ECharts 163.2 kB, Chart.js 49.2 kB,
Observable Plot 91.6 kB. **These are the vendor's own controlled suite** and
should be treated as such; Bundlephobia's independent main-export read for
`@tanstack/charts@0.13.0` is 60.3 kB gzip.

**My recommendation on it — no, not yet, and the reasons are not about taste:**

1. **17 days old, 0.13.0, self-described pre-alpha.** Not one release has been
   through a quarter of production use anywhere. Adopting it would make this app
   an early field-tester of a charting engine on the surface an athlete uses to
   commit to a season.
2. **Thirteen minors in seventeen days.** Every one of AHR-001…011 was a public
   API rename. The cost of a breaking rename is not the codemod; it is that our
   charts encode ADR 0029/0030 semantics, and a rename lands in the middle of
   that.
3. **It measures, then reflows.** `initialWidth` defaults to `640`
   (`docs/framework/react/reference/chart.md`, "Accessibility and sizing"), and
   the responsive path is "server renders at `initialWidth`, client measures the
   container and re-renders". At our 390 px reference viewport the container is
   ~358 px, so the first paint is geometry laid out for 640 px, then a
   post-hydration relayout — plus a **second** relayout when web fonts resolve
   ("The browser host remeasures when fonts become available and schedules a new
   layout"). Our current idiom (`viewBox` + `preserveAspectRatio="none"` +
   CSS 100%, `app/components/chart/chart.tsx:369-372`) is responsive with **zero
   measurement and zero reflow**, and pushes all text into HTML overlays so it
   never distorts (`chart.tsx:398-399`). On criterion 1 and 2 we are already
   ahead of the best library on the list. This is the single most surprising
   result of the review.
4. **It does not solve the expensive part.** ADR 0029:22-26 already established
   that the Unavailable Metric marker, tap-and-dismiss, and the accessible
   table are ours regardless of library — and `docs/guides/accessibility.md`
   confirms it in TanStack's own words: "the application still owns the
   surrounding explanation, controls, and exact-value alternative", and
   "a summary or table when exact values matter". Its tooltip also *floats*,
   which ADR 0030 rule 3 forbids at 390 px; we would be configuring it off.
5. **Multiple Y axes is an open issue (#92)** — and while ADR 0043 §7 means we
   must *never* share a value axis across tracks, #92's absence is a proxy for
   how much basic Cartesian surface area is still unbuilt (see also #87, Y-axis
   on the right).

**Verdict: cannot responsibly recommend today.** Not because TanStack is the
wrong house — because the package is 17 days old and our incumbent already beats
it on the criterion we weighted first. **Re-evaluate at `1.0.0`**, and re-evaluate
sooner if we ever need something the primitive genuinely cannot express
(faceting, a spatial index over a dense Telemetry Overlay, Canvas). The
`@tanstack/charts/polar` entry (`radialArc`, `radialLine`, `angleGrid`,
`radialGrid`) is worth remembering: it is exactly the geometry variant G
hand-rolled, and the honest cheapest source of it today is `d3-shape.arc()`
(§1.3).

### The other candidates, on our criteria

**Criterion 1 — SSR/hydration safety.** Evidence read from each package's own
source, not its marketing:

- **Recharts** — `src/component/responsiveContainerUtils.ts` sets
  `initialDimension: { width: -1, height: -1 }`, and
  `src/component/ResponsiveContainer.tsx` returns `null` when the size is not
  positive, with the comment _"Don't render the container if width or height is
  non-positive… We will instead wait for the next resize event."_ So an
  unconfigured `ResponsiveContainer` **renders nothing on the server**. Our own
  measured prototype found this concretely: `311-recharts-vs-handrolled.md`
  §1 — bars painted server-side: hand-rolled **all**, Recharts **none**. Already
  rejected by ADR 0029:27-31 and re-verified here at the source level.
- **visx** — its primitives (`@visx/shape`, `@visx/scale`, `@visx/group`) are
  pure React components taking explicit numbers; nothing measures. The
  measurement lives only in `@visx/responsive`, and
  `packages/visx-responsive/src/hooks/useParentSize.ts` sets
  `defaultInitialSize = { width: 0, height: 0, top: 0, left: 0 }` — so
  `<ParentSize>` server-renders a 0×0 chart unless you pass `initialSize`. **The
  correct use of visx here is to not use `@visx/responsive` at all.** That makes
  visx the only candidate that is SSR-safe *by omission* rather than by
  configuration.
- **Observable Plot** — `docs/features/plots.md` documents a **`document`**
  option: _"It defaults to `window.document`, but can be changed to another
  document, say when using a virtual DOM implementation for server-side
  rendering in Node."_ It returns a DOM node, not React elements. SSR means
  shipping jsdom to the server and `dangerouslySetInnerHTML`-ing the result.
  Disqualifying for this app.
- **unovis** — `packages/ts/src/core/container/index.ts` constructs its SVG
  imperatively with `d3-selection` (`container.append('svg')`) inside a
  `ContainerCore` class, driven by a `ResizeObserver`. Client-only by
  construction. Disqualifying.
- **Nivo** — the README claims SSR support, and its non-responsive components do
  take explicit `width`/`height`. But `packages/core/src/hooks/useMeasure.js`
  starts at `{ left: 0, top: 0, width: 0, height: 0 }`, so every `Responsive*`
  component server-renders 0×0. And `packages/theming/src/defaults.ts` is a JS
  object of hardcoded hex (`fill: '#333333'`, `stroke: '#dddddd'`) — a JS theme
  object, not `currentColor`, which is the opposite of criterion 5 and of
  `chart.tsx`'s `stroke="currentColor"` + `className="text-border"` idiom.
- **Victory** — SVG React components with explicit dimensions, so the primitives
  SSR. But: latest publish **2025-01-14** (19 months before this review), last
  repo push 2025-12-19, while its README still displays a
  `maintenance-active` badge. A badge that disagrees with the registry is a
  maintenance signal in itself.
- **Hand-rolled SVG (incumbent)** — SSR-native by construction, and the repo has
  the scar tissue to prove the failure modes are understood (§1.2).

**Criterion 3 — bundle.** The app ships 0 kB of charting today. Our own measured
Recharts route chunk was ~111 kB gzip (`311-recharts-vs-handrolled.md` §4).
`@tanstack/charts` is the cheapest full framework at 38–60 kB gzip. `d3-shape`
alone is 8.4 kB gzip; `d3-scale` 16.1 kB.

**Criterion 4 — accessibility.** Every library gives you an `aria-label` and
some form of keyboard focus. **None** gives you ADR 0030 rule 2's
"visually-hidden data table carrying the same values the inspect panel shows".
We have that, once, in `ChartDataTable` (`chart.tsx:472-508`) — including a
non-obvious correctness fix documented at `:456-464`: the `sr-only` must live on
a wrapping `div`, because a `<table>` ignores `width: 1px` and would push the
document's scroll width past 390 px. That is a bug a library would have
reintroduced.

**Criterion 5 — Tailwind/`currentColor`.** Only `@tanstack/charts` (documented
`currentColor` + CSS-variable palette) and visx (you pass whatever `className`
or `stroke` you like) are token-friendly without a JS theme object. Nivo and
Victory want theme objects. Our primitive is deliberately palette-*agnostic* —
ADR 0029:39-41, "the zone / Adherence Band palette lives in
`cockpit/shared.tsx`… a chart passes fill classes in as data".

**Criterion 6 — touch at 390×844.** Every library's default is a floating
tooltip; ADR 0030 rule 3 bans it. `useChartInspect` (`chart.tsx:127-244`) already
implements the required model — `onPointerEnter` inspects only when
`e.pointerType === 'mouse'` (`:191-193`), `onPointerUp` toggles only when it is
**not** mouse (`:195-197`), and a `trackProps` continuous-scrub path exists for
the future Telemetry Overlay (`:202-227`).

**Criterion 7 — can it express our shapes?** The specific shapes in play are: a
per-week bar chart with role colouring (have it — `__season-chart.tsx:622-735`),
a dashed projection polyline (have it — `:670-676`), concentric ring gauges
(variant G, `ShareRing` via `stroke-dasharray`), a radial week calendar
(variant G), and **variant D's interactive draggable load-profile curve** — which
turns out not to be SVG at all: `__prototype-variant-d.tsx` builds it from
flexbox `<button>`s with percentage heights (`:668-669`), each one
`role="slider"` with arrow-key support (`:636-659`), dragged through a shared
`drag()` helper using `setPointerCapture` and a 4 px threshold (`:389-421`). **No
charting library would have produced that, and none would improve it** — it is a
form control that looks like a chart, and it is the right shape for the job.

## 1.2 The hydration evidence, in this repo's own comments

The brief said four variants hit real hydration mismatches. Confirmed, and the
fixes are documented in code:

- **Trig** — `__prototype-variant-g.tsx:45-55`:
  > "Rounded to 3 decimals on purpose: `Math.sin` differs in its last bit
  > between Node and the browser, and an unrounded coordinate hydrates with a
  > mismatch."

  Enforced at `:52-53` (`Math.round(… * 1000) / 1000`) and again as `.toFixed(2)`
  in the emitted path string at `:68`.
- **Dates** — `__prototype-variant-j.tsx:195-198`:
  > "Dates are assembled by hand, not through `toLocaleDateString`: Node's ICU
  > prints `Fri, 30 Oct` where the browser prints `Fri 30 Oct`, and that comma is
  > a hydration mismatch."

  Same fix, same reasoning, at `__prototype-variant-f.tsx:84-88`. Variants
  A/C/D/E/I/K still call `toLocaleDateString` (`a:101`, `a:109`, `c:99`,
  `d:200`, `e:99`, `i:111`, `k:110`) — they predate the fix.
- **Sparkline coordinates** are rounded everywhere: `round1` in J (`:166`, used
  `:507`), `round` in A (`:117-119`, used `:136`), `.toFixed(1)` in C (`:182`)
  and K (`:220`), `.toFixed(2)` on the Route Sketch `viewBox`
  (`app/components/route-sketch.tsx:55`).
- **`suppressHydrationWarning` appears nowhere in `app/`.** The house fix is
  always determinism, never suppression.

## 1.3 The one change I do recommend: `d3-shape` + `d3-scale` as pure helpers

This is the part of the brief's "honest baseline" that turns out to be more than
a fallback.

**`d3-shape` rounds path coordinates to 3 decimal places by default.** From
`d3-shape/src/path.js`:

```js
export function withPath(shape) {
  let digits = 3
  shape.digits = function (_) { /* … */ }
  return () => new Path(digits)
}
```

`arc.js:86` and `line.js:12` both call `withPath`, and `d3-path/src/path.js`
implements the rounding in `appendRound(digits)`. _(Source: the packages' own
`main` branch source, read 2026-08-14.)_

That is precisely the class of bug variant G had to fix by hand. **Adopting
`d3-shape` for arcs and curves is not a step away from the repo's
hydration-safety discipline — it is that discipline implemented upstream, by
default, with a test suite behind it.** If we ever want the concentric rings or
the radial week calendar in production, `d3.arc()` at 8.4 kB gzip is safer than
another hand-written `Math.sin` call site, and `d3-scale` (16.1 kB) is safer than
another hand-written `scaleY`. Both are **pure functions returning strings and
numbers** — no DOM, no measurement, no React, no renderer. They fit inside
`ChartFigure`'s `renderMarks(geom)` callback with no architectural change.

Caveat, stated as a caveat: `d3-scale@4.0.2` last published 2021-09-24 and
`d3-shape@3.2.0` 2022-12-20. For most packages that would be a red flag. For
these two — 72.8M and 87.4M weekly downloads, a settled API, and the numerical
core of half the libraries above (`@tanstack/charts` itself depends on
`d3-shape@3.2.0` and `d3-scale@4.0.2` exactly) — it reads as finished, not
abandoned. **Unverified:** I did not check whether the d3 monorepo has unreleased
commits on `main` beyond those tags.

## 1.4 Recommendation for Part 1

**Keep ADR 0029. Do not adopt a charting library. Amend ADR 0029 with one
sentence permitting `d3-shape` / `d3-scale` as pure geometry helpers inside the
Chart Primitive — never a rendering framework.**

Rationale, ranked by our own criteria:

1. The incumbent wins criterion 1 outright and criterion 2 **outright** — no
   library on the list is responsive without either measuring or being told a
   fixed width, and `viewBox` + `preserveAspectRatio="none"` is both.
2. It wins criterion 4 outright — nothing ships ADR 0030 rule 2.
3. It ties or wins criterion 6 — `useChartInspect` already implements the banned-
   tooltip-free model, and every library would need it configured off.
4. Criterion 3 is 0 kB versus 38–151 kB.
5. What we would buy is axes, ticks, legends and animation — which ADR 0029:26
   already called "the cheap part", and which `niceLinearTicks` already covers
   for our one-axis-per-chart world.

`@tanstack/charts` is the best library on this list and the one to watch. The
honest reason to say no is its age, not its design.

---

# Part 2 — which visualisations earn their place in variant J

## 2.1 What J is now

`app/routes/training/__prototype-variant-j.tsx` (1703 lines; docblock ends
`THROWAWAY — do not ship.` at `:29`; reachable only via
`plan.prototype.tsx:47`/`:481`):

- **Header** `:962-1255` — Target Event (`:965-973`), one question
  "Where are you now?" (`:976`), the 3-way intent control as a
  `role="radiogroup"` of three `role="radio"` buttons in a `grid grid-cols-3`,
  `min-h-9` (`:978-1000`), one Season Anchor row per Training Track
  (`:1002-1072`, with `describeLevel` at `:1007` and its `level.summary` at
  `:1026`), then a horizontally-scrolling row of derived-fact chips with popovers
  (`:1074-1255`).
- **Sticky summary + action bar** `:1258-1296` — the summary line `:1261-1264`,
  a ⌘K button, and `Create plan` at `:1288-1295`. (It is prototype-only:
  `onClick={() => setCreated(true)}` at `:1291`; no `Form`, no action.)
- **Calendar** `:1324-1571` — one row per week on
  `grid-cols-[4.75rem_repeat(7,minmax(0,1fr))]` (`:633-635`), cells `min-h-9`
  (`:1434`), session chips as `<button>`s with `aria-label`/`aria-pressed`,
  `KIND_CHIP` fill, a track glyph and `compact(value, currency)` (`:1443-1499`).
- **Visual encoding already present**: the phase band, a 4 px full-height CSS bar
  at `:1346-1349` (`absolute inset-y-0 left-0 w-1 ${band}`, five cycled classes
  from `PHASE_BAND` `:129-135`); race-week and week-1 row tints (`:1340-1341`);
  non-trainable weekday dimming (`:1312-1314`).
- **Exactly one SVG**: `Sparkline` `:497-526` — `viewBox="0 0 100 20"`,
  `preserveAspectRatio="none"`, `aria-hidden`, rendered `h-3 w-10`
  (**12 × 40 CSS px**), one `<polyline>`, coordinates rounded via `round1`
  (`:507`). It is used **once**, at `:1078`, inside the *preset chip's* popover
  trigger.

**Nothing in the repo states J's rendered height.** The brief's "989 px for an
11-week season at 390 px wide, 4 visible prose words" is taken as given and
**not re-verified in this document** — the only footprint statement in the file
is `pb-16` at `:961` ("keeps the last week clear of the prototype switcher
pill"). Every px figure below is derived from Tailwind class values in the code,
and is marked as such.

## 2.2 The trap, addressed head-on: three currencies that must never be summed

ADR 0043 §7 (`docs/adr/0043-…:290-294`):

> "A chart's value axis is owned by exactly one track reading exactly one
> currency. More views means more axes… but never a shared or normalised axis."

and `:301-303`:

> "Rejected: normalising a second track onto the same value axis. Every choice of
> scaling is a claim about the exchange rate between km and sets, which is the
> fabricated conversion ADR 0041 forbade, **smuggled in as a pixel decision**."

ADR 0046 §1 (`:223-226`) states the figure-level version: "No planned figure
spans an endurance track and a strength track… `55 → 78 km/wk` beside
`12 → 21 sets/wk`". The rule is even enforced in the schema —
`prisma/schema.prisma:1637-1638`: "The Training Load input: the endurance
disciplines only (ADR 0046 §2). **NOT the sum of `tssByDiscipline`**".

**J already obeys this**: its gutter renders one editable total *per track*
(`:1345-1421`), never a sum. And the repo has already caught itself: variant K's
docblock (`:411-415`) says "Bars are scaled to the **lead track's** peak and the
column header says whose km they are — the axis is one track's, deliberately,
because two Volume Currencies cannot share a y-axis."

**Consequence for every proposal below: no proposal may introduce a shared value
axis, a stacked bar, or a normalised height across tracks.** The only encodings
that survive are (a) one mark per track with its own scale, or (b) marks on the
**time** axis, which ADR 0043 §296-299 expressly permits (phase boundaries, week
roles, other tracks' segment boundaries, Quality Session Mix marks, re-anchor
points, the Target Event).

## 2.3 Ranked shortlist

### 1 — A per-track volume hairline in the week gutter. **0 px added.**

**Question it answers:** "what shape is my season?" — the one thing the calendar
structurally cannot show, because it shows detail and not silhouette.

**Where:** inside the existing week-row gutter (`:1345-1421`), immediately under
each track's editable total. A 2 px-tall `<div>` whose **width** is
`volume / seasonPeakForThatTrack`, in that track's own colour.

**Footprint at 390 px:** **zero added vertical px.** Rows are `min-h-9` (36 px)
and the gutter is `4.75rem` = 76 px wide, so a 2 px rule absorbs into existing
row padding, and the widest hairline is ~60 px — enough for ~20 visually
distinguishable steps at 3 px granularity.

**What it replaces:** nothing textual — and that is the point. It is the only
proposal that adds shape without spending the budget, which is why it ranks
first. It also makes the *rhythm* (loading / recovery / taper) legible while
scrolling, which today requires reading `ROLE_LABEL` words.

**Never sums:** one hairline per track, each scaled to **its own** peak, stacked
vertically in the gutter, never end-to-end. Two tracks give two hairlines of
independent length; there is no total.

**Degrades:** at 390 px it is a 60 px rule; if a track's peak is unknown
(an unpriced week) it draws **nothing** and the total already carries the
Unavailable state — ADR 0030 rule 1 is satisfied by omission plus the existing
text, exactly as `ChartUnavailableMark` does in SVG.

**Precedent in-repo:** `__season-chart.tsx:196-201` already uses *height* as a
redundant role encoding ("Loading reads tallest, so the rhythm is legible without
relying on colour"). This is the same trick rotated 90°.

### 2 — Promote J's existing 12 × 40 px sparkline into the sticky summary bar. **0 px added.**

**Question:** "does the shape I picked look like what I meant?" — answerable
*before* scrolling 20 rows.

**Where:** the sticky summary line at `:1261-1264`, beside the words that are
already there. J already has the component (`:497-526`) and already renders it in
the preset chip (`:1078`).

**Footprint:** **zero added rows.** `h-3` is 12 px, inside a line of `text-sm`
(20 px line-height). `w-10` = 40 px of the ~358 px content width.

**What it replaces:** it lets the summary line drop one clause. Today the shape
is only nameable ("classic-build"); a 40 px glyph shows it.

**Honesty caveat that must be respected:** `Preset.weeklyLoad` is documented as
"**Normalized 0–1** weekly load, one entry per week"
(`__prototype-data.ts:385-397`). It is a **ratio, not a currency**, so this glyph
is a per-track-agnostic *silhouette* and must never be labelled with a unit. That
is exactly the criterion `__preset-gallery.tsx:319-336` uses to keep its own
strip a bespoke `aria-hidden`-adjacent glyph rather than a `ChartFigure`: "a
preset carries no **Volume Currency** and no **Season Anchor**, so every bar is a
ratio". Keep it `aria-hidden` and keep the numbers in the words beside it.

### 3 — One chip that opens the existing layered Season Chart. **0 px inline; ~332 px when opened.**

**Question:** "show me the season as a chart, with values I can read."

**Where:** one more chip in the derived-facts row (`:1074-1255`), which is
already a row of popover triggers. It opens `__season-chart.tsx` — the shipped,
tested, ADR-compliant chart — not a new one.

**Footprint:** **0 px inline.** When opened: `ChartFigure`'s volume instance is
`plotHeightClass="h-64"` (256 px, `__season-chart.tsx:544`) plus `mt-3` (12 px)
plus the `min-h-16` inspect figcaption (64 px) = **~332 px**, before the layer
toggles. The fitness chart is a second `h-32` instance (`:900`) and is **off by
default** — its own docblock (`:34-36`) explains why: "a second chart is a second
inspect panel, and two at 390 px is two things to read (ADR 0028)."

**Why not inline:** 332 px is 39% of an 844 px viewport, spent before the athlete
reaches week 1. J's discipline is that the create action is visible at load; an
inline chart of that height destroys it. Behind a chip, it costs one tap and
zero pixels.

**What it replaces:** the need to invent any new chart for J at all. This is the
highest-leverage item on the list precisely because the work is already done.

## 2.4 Considered and rejected

**The season load profile as a new inline chart in J.** Rejected — not because
the gap isn't real (it is; the calendar shows detail, not shape) but because
proposals 1 and 3 close it for 0 px, and because building a fourth ad-hoc load
chart is exactly what ADR 0029:57-60 warns against ("would just mint a fourth
ad-hoc chart"). C and K already minted two: their `LoadProfile`
(`c:350-397`, `k:416-471`) is flexbox `<button>`s with percentage heights, whose
reading is a **native `title=` tooltip** (`c:373`, `k:446`) — a violation of ADR
0030 rule 3 — and whose `Math.max(4, height)` floor (`c:382`, `k:455`) draws a
visible 4% bar for an empty week, which is the **zero-bar fabrication** ADR 0030
rule 1 forbids. Do not copy them into J.

**Intensity distribution as concentric rings (variant G).** Rejected for J. G's
`ShareRing` (`g:197-231`) is honest work — two `<circle>`s with
`strokeDasharray`/`strokeDashoffset` — but it lives inside a 340 × 340 dial
(`g:311`, container `max-w-[320px]`, `g:277`). **320 × 320 px to convey three
ratios**, against K's typographic version, which states `EASY % 92 /
QUALITY 1` in about 18 px of a text row. The figures read faster, and ADR 0042 §5
(`:167-169`) already decided the *word* is the carrier: "the season chart reads
**'Build · 2× threshold + 1× VO2max'** — kind _and_ dose". A ring conveys the
share and loses the dose. **K's figures win; G's rings do not enter J.**

**Variant G's radial ring calendar.** Rejected for J — and not because it is bad.
It is a genuinely good visualisation (`g:391-498`; stroke **width** encodes load
at `:418`, `width = 7 + 22 * load`; a transparent `strokeWidth={38}` arc supplies
a real 38 px hit target with `role="button"` and an `aria-label` at `:455-473`).
It is rejected because it is a **competing layout**, not an addition: J *is* a
weekday × week grid. Two calendars is one too many. One flaw worth recording if
it ever ships: its `<text>` labels (`:438-453`) live inside the 300 × 300 SVG and
will scale with the container, unlike `chart.tsx:398-399`, which pushes all text
to crisp HTML overlays.

**Session chip width ∝ volume.** Rejected, despite being the zero-footprint idea
I took most seriously. Three reasons: (a) the chip already carries the number —
`compact(value, currency)` at `:1489` — so width would be a redundant second
encoding of a value already stated; (b) `chipClass` (`:528`) builds a fixed
`h-8` pill with an `after:` hit-area extension per `ui-conventions.md` §2.2, and
variable width degrades the smallest chips below a reliable target; (c) chips are
**drag sources** (`onPointerDown={startChipDrag}`, `:1450`, hit-testing cached
`[data-day]` rects at `:698-747`) — variable-width drag handles make the
grab affordance inconsistent. The gutter hairline (proposal 1) gets the same
information for free without touching a control.

**A chart of the level adaptation (`describeLevel`).** Rejected. `describeLevel`
(`__prototype-data.ts:312+`) produces `sessions`, `quality: [number, number]`,
`longCapShare`, `longCap`, `easyShareTarget: [number, number]` — and
`level.summary`, documented at `:308-309` as "One line, numbers only:
`beginner · 3 sessions · long ≤ 5 km`", already rendered in J at `:1026`. **That
sentence is the visualisation.** A chart of a three-number rule is strictly worse
than the rule: it is bigger, slower to read, and cannot say "≤".

**Phase structure as bands.** Already present and already correct
(`PHASE_BAND` `:129-135`, rendered `:1346-1349`). **Keep as-is.** Nothing to add;
adding tick labels or a legend would spend prose budget on something the row
gutter already words (`ROLE_LABEL`, `:72-77`).

**A second (fitness / CTL) axis in J.** Rejected. It requires a second value
axis, therefore a second chart (ADR 0043 §7), therefore a second inspect panel —
which `__season-chart.tsx:34-36` already decided is one thing too many at 390 px.
It is also not a quantity a plan contains: `__season-chart.tsx:51-58` and
`app/utils/plan-outline/season-chart.ts:25-30` explain that the Form layer
*exists in order to refuse*. If J ever shows fitness, it inherits that refusal.

**Anything animated with `motion`.** Not rejected on principle, but out of scope
and unmeasured: our installed 12.38.0 is a major behind latest 13.1.0, and none
of the three proposals above needs animation. A hairline that animates on anchor
change is a nice-to-have with a real risk of drawing the eye during a drag.

## 2.5 Which existing hand-rolled visuals are already good enough

**Keep exactly as they are:**

- **`app/components/chart/chart.tsx`** — the Chart Primitive. It is the best
  artefact in this review, library or not. SSR-native by construction
  (`:30-32`), `currentColor` + Tailwind classes (`:389-390`),
  `vectorEffect="non-scaling-stroke"` (`:392`), text pushed to HTML overlays
  (`:398-399`), a fixed `aria-live` inspect panel instead of a tooltip
  (`:410-415`), the `sr-only`-on-a-div correctness fix (`:456-464`), and a
  gridline-keying subtlety most libraries get wrong (`:379-383`).
- **`app/routes/training/__season-chart.tsx`** — mounted on the primitive, ADR-
  anchored in its own docblock, and covered by a 512-line ARIA-level test suite.
  This is the season load profile; do not rebuild it.
- **`app/routes/training/__preset-gallery.tsx`** — 48 px-tall bespoke strip
  (`SLOT = 10`, `STRIP_HEIGHT = 48`, `:312-314`; `role="img"` + generated
  `aria-label`, `:373-374`) that pays ADR 0030 rule 2 by reusing the primitive's
  own `ChartDataTable`. Its docblock (`:319-336`) contains the best statement in
  the repo of *when a picture is a glyph and when it graduates to a chart*.
  That criterion should be quoted in whatever ADR follows this document.
- **`app/components/route-sketch.tsx`** — `viewBox` rounded via `.toFixed(2)`
  (`:55`); a pre-attentive glyph, explicitly out of scope per ADR 0029:71-74.
- **The A / J sparklines** (`a:125-155`, `j:497-526`) — 16 × 64 px and
  12 × 40 px, rounded coordinates, `aria-hidden`, one `<polyline>`, zero chrome.
  Near-perfect data-ink. Nothing to change.
- **Variant D's draggable load-profile curve** (`d:389-421`, `:576-616`,
  `:636-659`) — as a *control* it is excellent: `setPointerCapture`, a 4 px
  threshold, `role="slider"` with full `aria-valuemin/max/now/text`, keyboard
  Arrow/Home, `h-11 w-8 cursor-ns-resize touch-none`. One thing to fix before it
  ships: its readout is transient state cleared on pointer-up (`:415`), i.e. the
  hover-tooltip pattern ADR 0030 rule 3 rejects. It wants the primitive's fixed
  panel.

**Do not promote as-is:**

- **C / K `LoadProfile`** (`c:350-397`, `k:416-471`) — `title=` tooltip, no data
  table, and a 4% floor that fabricates a bar for an empty week. K's honest axis
  caption (`k:411-415`, `:433-436`) is the one part worth keeping.
- **Verbatim duplicated sparkline code** — C `:177-200` and K `:215-238` are
  byte-identical including the docblock. If any sparkline ships, it ships once.

---

# Headline

**Rendering approach.** Keep ADR 0029: hand-rolled SVG on the existing
`app/components/chart/chart.tsx` Chart Primitive. Add one sentence to ADR 0029
permitting **`d3-shape` and `d3-scale` as pure geometry helpers** inside the
primitive — never as a rendering framework — because `d3-shape` rounds path
coordinates to 3 decimals **by default** (`d3-shape/src/path.js`, `digits = 3`),
which is the hydration fix variant G had to write by hand. Do **not** adopt
`@tanstack/charts` yet; re-evaluate at `1.0.0`.

**Visualisation shortlist for J, ranked.**

1. **Per-track volume hairline in the week gutter** — **0 px added** (2 px inside
   an existing 36 px row; ≤60 px wide in a 76 px gutter). Gives the season its
   silhouette; one hairline per track, each on its own scale, never summed.
2. **J's existing 12 × 40 px sparkline promoted into the sticky summary bar** —
   **0 px added** (12 px inside an existing 20 px text line). Shape visible
   before scrolling; must stay unit-less, because `weeklyLoad` is a 0–1 ratio.
3. **One chip that opens the existing layered Season Chart** — **0 px inline,
   ~332 px when opened** (`h-64` plot + `mt-3` + `min-h-16` panel). Reuses a
   shipped, tested, ADR-compliant chart instead of building a fourth one.

**Not worth it.** A new inline season chart in J (proposals 1 and 3 close the gap
for 0 px, and C/K's flexbox `LoadProfile` already violates ADR 0030 rules 1 and
3). Concentric intensity rings — 320 × 320 px for three ratios K states in ~18 px
of text, and ADR 0042 §5 already made the *word* the carrier. G's radial ring
calendar in J — a competing layout, not an addition. Session-chip width ∝ volume
— duplicates a number the chip already prints and degrades a 44 px drag target. A
`describeLevel` chart — `level.summary` ("beginner · 3 sessions · long ≤ 5 km")
is already the visualisation. A second fitness axis inline — a second axis means
a second chart means a second inspect panel, which is one too many at 390 px, and
a plan does not contain Form anyway.

**Biggest risk found.** Not a library and not a chart: **a shared or normalised
value axis across Training Tracks.** ADR 0043 §7 calls it "a fabricated exchange
rate, smuggled in as a pixel decision", ADR 0046 §1 bans the figure-level
equivalent, and `prisma/schema.prisma:1637-1638` enforces it at the schema. It
has already caught three variants — C and K scale bars to one track's peak and
had to add a caption saying whose km they are (`k:411-415`), and G's dial
encodes one track at a time by construction. **Every chart-shaped idea for J must
be checked against it first**, because it is the one mistake that looks like a
nice chart and is actually a lie.
