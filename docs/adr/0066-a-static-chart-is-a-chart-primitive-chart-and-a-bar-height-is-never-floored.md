# A static chart is a Chart Primitive chart, and a bar height is never floored

Status: Accepted

ADR 0063 §3 declined to mount the lift-over-time chart on the **Chart
Primitive**: ADR 0029 mounts every _interactive_ chart, this one is static, and
"adopting the primitive now to draw twelve static rectangles would buy the
contract's cost without its benefit". Issue #490 reopened that against the
shipped code, and the code is the evidence the reasoning was wrong. The bespoke
chart hand-reimplemented the **Unavailable Metric** marker, skipped the data
table ADR 0030 rule 2 owes, and delegated its bar heights to a CSS floor that
drew a real reading at the height of the stub meaning _there is no reading
here_.

The contract's cost was never the interaction. It is the marker, the accessible
equivalent and the geometry — and those are owed by a static chart exactly as
much as by a tapped one.

Scope: `app/components/chart/chart.tsx`, `app/routes/training/__lift-chart.tsx`
and its presenter (issue #490, under ADR 0029/0030).

## Decision

### 1. A chart with no Chart Inspect is a mode of the primitive, not a reason to stay bespoke

`ChartFigure` accepts no `inspect` and no `renderInspect`. It then renders no
focusable surface, no keyboard model and no panel — ADR 0030 rule 3 still does
not apply to a chart the design gives no tap, no tooltip and no motion. What it
does render is everything rule 1 and rule 2 are about, which is the expensive
half.

It also takes `gridlines={false}`, for a chart whose value axis is a **window on
the range in view** rather than a domain from zero. An unlabelled line halfway
up a floating window names no weight, and drawing one would be a worse chart
than drawing none.

**This supersedes ADR 0063 §3's rejection.** Its rule ("if this chart ever gains
per-bar inspection it moves onto the primitive and takes all three rules") still
holds in the direction it was written; what it got wrong is the converse — that
staying static was a reason to stay off.

### 2. Rule 2 is a concise name _and_ a data table, on this chart too

**This supersedes ADR 0063 §2**, which held that the chart's `role="img"` name
should recite every marked session and that "there is no visually-hidden second
table, because the visible list is that table".

The visible list is not that table. It runs newest-first while the bars run
oldest-first, it is numbered by nothing, and it says which sessions happened —
never which bar is marked, or which slot has no bar at all. A reader who cannot
see the picture was getting the page's data, not the chart's.

So the name is one clause — what is plotted, over how many sessions, with how
many **Stall Cuts** marked — and the visually-hidden table carries the rest:
session, date, top set, and what the bar is marked as. The `Marked` column reads
in the **same precedence the tone uses**, a Stall Cut over the latest bar, so
the picture and the words cannot disagree — the same reason ADR 0063 §2 made the
marking a join rather than a shape read off the curve.

### 3. A bar's height is its value, and there is no minimum

The old chart rounded each bar's fraction to a whole percent and let a CSS
`min-h-1` catch whatever that flattened. Both halves lie, and they compound: a
reading worth a fraction of a percent rounded to zero and was then drawn at the
floor — roughly the height of the **Unavailable Metric** stub. A value the app
_had_ came out looking like a value the app _did not have_, which is rule 1
inverted.

Height is arithmetic now: a bar is exactly as tall as its fraction of the plot.
A reading too small to see draws too small to see, and the only mark that means
"nothing here" is the one that says so.

## Consequences

- The lift-over-time chart is `app/routes/training/__lift-chart.tsx`. It is the
  fourth chart on the primitive and the first static one, so ADR 0029's "every
  interactive chart is built on it" now reads **every chart**; the
  **pre-attentive glyphs** (the **Workout Shape** strip, the **Route Sketch**)
  are still out of scope, and still owe rule 2 through `ChartDataTable` alone.
- `ChartBar` carries the session's date and its top-set text instead of a
  pre-composed sentence, because the table needs the values in cells and the
  name no longer needs the sentence.
- This is otherwise a **behaviour-preserving port**. The Stall Cut still wins
  over the latest bar, an unavailable session still draws no bar and still
  carries its `n/a`, every third session still carries its tick, and a lift in
  no program is still marked nowhere. The one deliberate change is §3.
- Verified at 390×844 (ADR 0028).

## Alternatives considered

- **Give the chart a Chart Inspect while porting it.** Rejected — the design
  specifies no interaction, and #490 is a port. Rule 3's machinery is available
  the day the design asks for it.
- **Keep the long reciting `aria-label` and skip the table.** Rejected — a name
  is read before anything else, and a name that recites nine sessions is a table
  pretending to be a label.
- **Keep a minimum bar height so a tiny reading stays visible.** Rejected — it
  is visible as something it is not. If a real value is invisible, the axis
  window is the thing to argue about, not the rectangle.
