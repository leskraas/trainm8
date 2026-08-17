# Research: `@dnd-kit/react` and the TanStack shelf for the plan calendar

## Decision (2026-08-14)

The owner chose `@dnd-kit/react`. The maturity question below is **closed** —
read Part 3.11 as the record of what we knowingly accepted, not as an open
trade-off. The containment strategy is an **exact pin** (`0.5.0`, no caret) plus
a **single module**: every `@dnd-kit/*` import lives in
`app/routes/training/__prototype-dnd.tsx`, so a breaking pre-1.0 minor is a
one-file edit. Verified in the browser on variant J the same day: no hydration
mismatches, the chip follows the pointer, a mid-drag scroll no longer misdrops,
one arrow press is one weekday, and the announcements are ours. Two things below
turned out to be wrong in practice: `OptimisticSortingPlugin` must be refused on
every `dragover` (Part 3.8 reads it as an optional constraint hook — in fact its
DOM re-parenting crashes React's reconciler on a derived-state calendar), and
the `CollisionPriority.Low` container recipe from the multiple-lists guide is
the wrong shape here — chips must not be droppables at all, or a chip outranks
every empty day cell and one arrow press skips a weekday.

**Where this lives, and why.** Not `docs/research/` — that directory is an
endurance-domain, primary-source corpus (physiology, file formats, load models),
and its README says so: "Written from **primary sources**: peer-reviewed papers
with DOIs, the coaches and scientists who defined each model, official
file-format specifications" (`docs/research/README.md:9-13`). A frontend library
evaluation is not that. Not `docs/design/` either — that holds _settled_
conventions and audits (`ui-conventions.md`, `mobile-audit.md`), and this
document decides nothing on its own. The repo already has the right precedent:
[`docs/wayfinder/interactive-charts/310-recharts-ssr-feasibility.md`](../interactive-charts/310-recharts-ssr-feasibility.md)
is a frontend library evaluation living under `docs/wayfinder/<map>/`, written
to feed a prototype and then an ADR (0029). This file follows it, under the map
that owns the plan-builder calendar. No index or README exists in
`docs/wayfinder/`, so nothing needed updating.

**Posture.** This gathers evidence and then states a recommendation, clearly
separated. It does not amend an ADR. If it is acted on, the acts are (a) a
prototype on variant J and (b) an ADR for the drag/table approach — the same
shape #310 → #311 → ADR 0029 took.

**Date of the facts.** All version numbers and publish dates were read from the
npm registry on **2026-08-14**. Every dnd-kit API claim is traced either to
`dndkit.com` / the `clauderic/dnd-kit` repo, or to the published `.d.ts` / dist
JavaScript of `@dnd-kit/*@0.5.0`, unpacked into `/tmp` with `npm pack` (nothing
was installed into this repo). Source-derived claims are labelled **[source,
undocumented]**.

---

## TL;DR

- **The package the owner asked for is real, is the maintainer's forward line,
  and is `0.5.0` — not 1.0.** `@dnd-kit/react@0.5.0` (published 2026-06-11) is
  the React adapter for the dnd-kit rewrite. Its predecessor `@dnd-kit/core` is
  at `6.3.1`, **last published 2024-12-05** — no release in ~20 months — and the
  official docs site files v6 under `/legacy/`. So "the old one" is not the safe
  choice; it is the unmaintained one.
- **It is production-_capable_ but not production-_guaranteed_.** The docs site
  claims "Production ready: Built for performance, accessibility, and
  reliability" (dndkit.com), while the version number says pre-1.0, there is no
  published 1.0 roadmap I could find, and the repo carries 124 open issues
  including several that touch exactly what we need (keyboard drag escaping
  scroll containers, keyboard sensor locking out the mouse, a `dragover` firing
  immediately after `dragstart` in sortables). Evidence and issue numbers below.
- **It solves, for free, three of our four named weaknesses**: the chip follows
  the pointer (Feedback plugin, default), rects are re-measured rather than
  cached (collision observer + `ScrollListener`), and there is a real ARIA live
  region with customisable announcements (Accessibility plugin, default).
  Cross-week (2-axis) drops fall out of the same model.
- **TanStack has no drag-and-drop package.** Verified against
  `tanstack.com/llms.txt` (the canonical library index) and by 404s on npm for
  plausible names. TanStack cannot satisfy the drag half of this brief; dnd-kit
  is not a substitution for a TanStack package, because there is nothing to
  substitute.
- **TanStack Table v9.0.0 shipped 2026-08-04 — ten days ago.** We are on
  `8.21.3` (published 2025-04-14, the last v8). v9 adds `cellSpanningFeature`
  and `cellSelectionFeature`, is ESM-only, renames `useReactTable` → `useTable`,
  and ships a deprecated `useLegacyTable` shim for incremental migration.
- **Recommendation in one line:** plain CSS grid + `@dnd-kit/react` for the
  calendar; TanStack Table for variant K's stat table only; no virtualization at
  20 rows; stay on Table v8 for now and revisit v9 in a separate refactor.

---

## Part 1 — What we are actually building (repo facts)

### Variant J: the calendar (the front-runner)

`app/routes/training/__prototype-variant-j.tsx` (1703 lines, untracked
prototype, `THROWAWAY — do not ship` in its header comment).

| Fact                                                                                                                                                                                                                           | Where                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| The grid is **CSS grid**, not a `<table>`: `grid-cols-[4.25rem_repeat(7,minmax(0,1fr))]` (single-track) / `4.75rem` (multi-track), widened at `md`                                                                             | `__prototype-variant-j.tsx:633-635` |
| One `<div data-weekrow={n}>` per week; 1 gutter cell + 7 weekday cells `<div data-day={day}>`                                                                                                                                  | `:1336-1343`, `:1424-1437`          |
| The gutter holds the week index button plus **one editable total per Training Track** — 1 for a runner, 3 for a triathlete                                                                                                     | `:1371-1420`                        |
| Chips are `<button>`s inside the day cell, with a ⠿ grip glyph, `cursor-grab`, `touch-none`                                                                                                                                    | `:1443-1496`                        |
| Chip drag is hand-rolled Pointer Events: `setPointerCapture`, 5px threshold, `[data-day]` rects **cached at drag start**, hit-tested on **x only**                                                                             | `:698-748`                          |
| Week-total drag is a separate vertical hand-rolled gesture: `startY`, `Math.round(dy / 5) * step`, and a tap (no move) opens a numeric `<input>` instead                                                                       | `:750-780`, `:1374-1397`            |
| Keyboard: `ArrowLeft`/`ArrowRight` nudge one weekday, `Enter`/`Space` select, `Escape` deselect — **no announcement**                                                                                                          | `:1452-1469`                        |
| A non-drag fallback already exists: selecting a chip reveals a 7-button day picker row aligned to the columns                                                                                                                  | `:1503-1526`                        |
| Dropping rebalances: `moveChip` writes a `moves: Record<chipKey, Day>` map; `applyMoves` re-derives the whole season and `rebalance` redistributes day load against the long-session cap, keeping the **week total unchanged** | `:663-665`, `:323-362`, `:268-305`  |
| Editing a week total re-solves that track's **Season Anchor** (`setWeekTotal`)                                                                                                                                                 | `:673-679`                          |

Two things follow from `rebalance` that matter for the library choice:

1. **The drop payload is `(chipKey → weekday)` and nothing else.** No index, no
   ordering within the day. The chip's _position inside the cell_ is not
   meaningful state; only which cell it is in.
2. **State is derived, not mutated.** `applyMoves(season, moves, raceWeekday)`
   recomputes chips and values from a small override map. Any library that
   insists on owning an array and mutating it in place is fighting this.

### Variant K: the stat table

`app/routes/training/__prototype-variant-k.tsx:798-893` — a real `<table>` built
on the repo's own primitives (`Table`/`TableHeader`/`TableRow`/`TableHead`/
`TableCell`), 8 + N columns where N = track count, responsive column hiding
(`hidden sm:table-cell`, `hidden md:table-cell`, `hidden lg:table-cell`), a
per-track column pair generated from `trackStats.map(...)`, an expandable detail
row via `colSpan={6 + trackStats.length}` (`:886`), and a sparkline-ish bar
inside a cell. Rows are mapped by hand; no TanStack Table.

### Variant I: the ancestor

`app/routes/training/__prototype-variant-i.tsx:376-460`, `:738`, `:754` — the
same hand-rolled `startChipDrag` / `startTotalDrag` pair and the same
`[data-day]` hit-test. J inherited the drag code from I essentially verbatim;
the only material difference is J removed I's instruction sentence. So there is
one drag implementation to replace, not two.

---

## Part 2 — The precedent already in the app

### `app/routes/_home/session-ledger.tsx` — the only TanStack consumer

`package.json:71-72` declares `@tanstack/react-table` `^8.21.3` and
`@tanstack/react-virtual` `^3.13.26`. One file imports them
(`session-ledger.tsx:1-7`). The conventions it establishes, which any new table
work either follows or consciously departs from:

| Convention                                                                                                                                                                                                                                            | Evidence                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **`createColumnHelper<T>()` + `columnHelper.display({...})` for every column** — no `accessorKey` anywhere. Cells reach into `row.original` directly.                                                                                                 | `:46`, `:53-142`                     |
| **Per-column Tailwind classes ride in `columnDef.meta.className`**, cast at the render site (`(header.column.columnDef.meta as {className?: string})?.className`)                                                                                     | `:57`, `:65`, `:246-250`, `:282-286` |
| **`flexRender` is used** for both headers and cells                                                                                                                                                                                                   | `:252-255`, `:288`                   |
| **Only `getCoreRowModel()`** — no sorting, filtering, pagination, or grouping row model                                                                                                                                                               | `:205`                               |
| **`getRowId: (row) => row.id`** — stable ids from the presenter                                                                                                                                                                                       | `:206`                               |
| **The row array comes from a separate presenter module**, `buildLedgerRows(sessions, now)` in `app/utils/session-ledger-rows.ts`, memoized                                                                                                            | `:158-161`                           |
| **A discriminated union of row kinds** (`kind: 'now'` divider vs session rows) is short-circuited _inside the render loop_, not modelled in the columns; a `session(row)` cast helper exists precisely because column cells only run for session rows | `:48-51`, `:268-270`                 |
| **Rendering uses the shadcn-style primitives** in `app/components/ui/table.tsx`, not raw `<table>`                                                                                                                                                    | `:12-19`, `:240-300`                 |
| **Sticky header** = `TableHeader className="bg-card sticky top-0 z-10"` plus `bg-card` repeated on each `TableHead` (the cells need their own background or rows show through)                                                                        | `:241-251`                           |
| **Virtualization is the padding-row technique**, not absolute positioning: two `<tr aria-hidden>` spacers with a single `colSpan` `<td>` above and below the visible window                                                                           | `:261-265`, `:294-298`               |
| `useVirtualizer` config: `count: rows.length`, `estimateSize: () => 44`, `overscan: 10`, and — notably — **`initialRect: {width: 1024, height: 640}`**, which is what makes it SSR-safe (the virtualizer has no element to measure on the server)     | `:210-216`                           |
| Scroll container is the wrapper `div` with `max-h-[60vh] overflow-auto`                                                                                                                                                                               | `:236-239`                           |
| `scrollToIndex(nowIndex, {align: 'center'})` once, guarded by a `didCenter` ref                                                                                                                                                                       | `:219-224`                           |
| **Below `md`, the table is replaced wholesale by a virtualized card list** (`SessionLedgerCards`), sharing the same presenter rows. The card list _does_ use absolute positioning + `virtualizer.measureElement` because card heights vary            | `:183-192`, `:311-373`               |
| A load-bearing comment warns that an unstable `data` array breaks React Router 7 client transitions ("the URL updates but the Outlet stays rendering the previous route's element") — hence `nowRef`                                                  | `:152-157`                           |

Two of these are directly relevant to the calendar decision. First, the ledger
uses TanStack Table for a genuinely tabular surface and still needed a
non-tabular escape hatch (the `now` divider) _and_ a wholly different mobile
presentation. Second, the mobile fallback is not a narrower table; it is a
different component. Both are evidence that the abstraction earns its keep
narrowly.

### `app/components/ui/table.tsx`

114 lines of shadcn-style primitives. The one behaviour worth knowing: `Table`
wraps the `<table>` in
`<div data-slot="table-container" className="relative w-full overflow-x-auto">`
(`:5-17`). So _every_ `Table` in the app is already inside a horizontal scroller
— which is why the ledger's `max-h-[60vh] overflow-auto` wrapper sits _outside_
it, and why a sticky header works at all.

### What the ADRs and conventions already decide

- **ADR 0029 — charting is hand-rolled SVG, no library.** The reasoning is the
  precedent that matters most here: "The expensive parts are ours either way",
  "Recharts is not SSR-native", "**Bundle.** Recharts measured ~111 KB gzip as a
  lazy route chunk; hand-rolled is ~0 KB", and "There is no reusable chart layer
  for a library to amortise against"
  (`docs/adr/0029-charting-approach-hand-rolled-svg.md:20-45`). Any library
  proposal in this repo must survive those four tests. I apply them explicitly
  in Part 5.
- **ADR 0030 §2 — the accessibility contract for interactive surfaces.** "The
  chart is focusable; arrow keys move the inspection across marks, Enter/Space
  inspects, Escape dismisses. We do **not** adopt a `role="application"`
  per-point interactive model"
  (`docs/adr/0030-interactive-chart-contract.md:23-31`). The house keyboard
  grammar is therefore **arrows to move, Enter/Space to commit, Escape to
  cancel** — which is, by coincidence or convergence, exactly dnd-kit's default
  keybinding set (Part 3).
- **ADR 0028 / `docs/design/ui-conventions.md` §2.1–2.2 — touch targets.**
  Default controls are a real 44px (`h-11`); the invisible `after:` hit-area
  extension is retained "**only where a control can't be 44px tall**: the
  compact button sizes …, inline text links, steppers, **chips**, and glyph
  chrome marks (⠿/⋮/＋)" (`ui-conventions.md:104-112`). Calendar chips are
  named. Variant J's own header comment declares the chips, week totals and
  intent segments as named exceptions carrying the extension by hand
  (`__prototype-variant-j.tsx:25-28`).
- **Nothing in `docs/adr/` or `docs/design/` decides anything about tables,
  virtualization, or drag interactions.** I grepped both directories; the
  `ui-conventions.md` table of contents (`:17-241`) has sections for spacing,
  form controls, navigation, enum labels and verification, and no section for
  data tables, grids, or pointer gestures. So there is no convention to violate
  here — and, symmetrically, no convention to lean on. That gap is itself worth
  closing when this is decided.
- There is one existing repo-wide idiom for the missing announcement:
  `app/routes/training/__token-sentence-editor.tsx:450` is
  `<div aria-live="polite" role="status" className="sr-only">`, and
  `app/components/chart/chart.tsx:408-412` does the same for chart inspection.
  So "announce state changes in an sr-only polite live region" is already how
  this app behaves; the calendar is the outlier.

---

## Part 3 — What the sources state: dnd-kit

### 3.1 Package names, versions, and what "the new one" actually is

Read from the npm registry, 2026-08-14
(`npm view <pkg> version dist-tags time.modified license`):

| Package                    | latest    | dist-tags                                          | latest publish | licence |
| -------------------------- | --------- | -------------------------------------------------- | -------------- | ------- |
| `@dnd-kit/react`           | **0.5.0** | `latest: 0.5.0`, `beta: 0.5.1-beta-20260713030121` | 2026-06-11     | MIT     |
| `@dnd-kit/dom`             | 0.5.0     | same shape                                         | 2026-06-11     | MIT     |
| `@dnd-kit/abstract`        | 0.5.0     |                                                    | 2026-06-11     | MIT     |
| `@dnd-kit/state`           | 0.5.0     |                                                    | 2026-06-11     | MIT     |
| `@dnd-kit/helpers`         | 0.5.0     |                                                    | 2026-06-11     | MIT     |
| `@dnd-kit/collision`       | 0.5.0     |                                                    | 2026-06-11     | MIT     |
| `@dnd-kit/geometry`        | 0.5.0     |                                                    | 2026-06-11     | MIT     |
| `@dnd-kit/core` (old)      | **6.3.1** | `latest: 6.3.1`                                    | **2024-12-05** | MIT     |
| `@dnd-kit/sortable` (old)  | 10.0.0    |                                                    | 2024-12-04     | MIT     |
| `@dnd-kit/utilities` (old) | 3.2.2     |                                                    | 2023-11-06     | MIT     |

`@dnd-kit/react@0.5.0` declares
`dependencies: {tslib, @dnd-kit/dom@^0.5.0, @dnd-kit/state@^0.5.0, @dnd-kit/abstract@^0.5.0}`
and
`peerDependencies: {react: "^18.0.0 || ^19.0.0", react-dom: "^18.0.0 || ^19.0.0"}`
(npm registry). React 19 is in the declared peer range. `@dnd-kit/core@6.3.1`'s
peer range is `react >=16.8.0`, which does not _exclude_ 19 but was published
before React 19 shipped widely.

The docs quickstart confirms one install: "`npm install @dnd-kit/react`" and
"`@dnd-kit/react` is the only required package"; `@dnd-kit/helpers` is
recommended additionally for sortable work
([dndkit.com/react/quickstart](https://dndkit.com/react/quickstart/)).

**Release history and cadence** (`npm view @dnd-kit/react versions time`):
`0.0.1` was first published in 2024, the line has run through **~380 published
versions**, the overwhelming majority of them `-beta-<timestamp>` builds, and
after two years it is at `0.5.0`. The most recent publish of any kind is
`0.5.1-beta-20260713030121` on **2026-07-13** — one month before this document.
The last stable was two months ago. So: actively developed, slowly versioned.

**Naming.** There is no `@dnd-kit/react@2.x`. Calling it "v2" or "next" is
informal; the package name is `@dnd-kit/react` and its version is `0.5.0`. The
`next.dndkit.com` host now 301-redirects to `dndkit.com` (verified with `curl`),
and `dndkit.com` documents the new generation as the default while filing v6
under `/legacy/…` — `apps/docs/docs/legacy/api-documentation/…` in the repo tree
holds `use-draggable.mdx`, `dnd-context.mdx`, `guides/accessibility.mdx` etc.
**Officially, `@dnd-kit/core` v6 is "legacy".**

### 3.2 The real top-level API

From the published types, `@dnd-kit/react@0.5.0/index.d.ts` (verbatim exports):

```
export { type EventHandlers as DragDropEventHandlers, DragDropProvider,
  DragOverlay, type UseDraggableInput, type UseDroppableInput,
  useDragDropManager, useDragDropMonitor, useDragOperation, useDraggable,
  useDroppable, useInstance };
```

plus a second entry point `@dnd-kit/react/sortable` exporting `useSortable`,
`isSortable`, `isSortableOperation`, and a third `@dnd-kit/react/hooks` with
low-level signal hooks. `KeyboardSensor` and `PointerSensor` are re-exported
from `@dnd-kit/dom` through the React package's index.

`useDroppable` returns exactly (`index.d.ts`):

```ts
declare function useDroppable<T extends Data = Data>(
	input: UseDroppableInput<T>,
): {
	droppable: Droppable<T>
	readonly isDropTarget: boolean
	ref: (element: Element | null) => void
}
```

`useDraggable` returns
`{draggable, isDragging, isDropping, isDragSource, handleRef, ref}`.
`useSortable` returns those **plus** `isDropTarget`, `sourceRef` and `targetRef`
(`sortable.d.ts`).

The droppable input is `Omit<DroppableInput, 'element'> & {element?}`, and
`DroppableInput` from `@dnd-kit/abstract@0.5.0/index.d.ts` is:

```ts
interface Input<T extends Data = Data> extends Input$2<T> {
	/** Types of draggables that can be dropped here, or a function to determine compatibility */
	accept?: Type | Type[] | ((source: Draggable) => boolean)
	/** Priority for collision detection */
	collisionPriority?: CollisionPriority | number
	/** Detector for determining collisions with draggables */
	collisionDetector: CollisionDetector
	/** Type for categorization */
	type?: Type
}
```

where the base adds `id: UniqueIdentifier`, `data?: T`, `disabled?: boolean`,
`register?: boolean`, `effects?()`. `type Type = Symbol | string | number`. The
same fields are documented prose-for-prose at
[dndkit.com/concepts/droppable](https://dndkit.com/concepts/droppable/) —
"accept — Restrict which draggables can be dropped on this target",
"collisionPriority — Priority level when multiple droppable targets overlap".

`CollisionPriority` is an enum `Lowest=0, Low=1, Normal=2, High=3, Highest=4`
(`@dnd-kit/abstract/index.d.ts`).

`DragDropProvider` props (`@dnd-kit/react/index.d.ts`): `manager?`,
`onBeforeDragStart`, `onCollision`, `onDragStart`, `onDragMove`, `onDragOver`,
`onDragEnd`, plus everything in `DragDropManagerInput` (`plugins`, `sensors`,
`modifiers`).

**No invented signatures appear anywhere in this document.** Everything above is
copied from the shipped `.d.ts` files or quoted from the docs pages linked.

### 3.3 Free-form drop targets vs sortable

Both exist and they are different hooks. `useDroppable` is a plain drop target:
an id, an optional `accept`, and `isDropTarget` back. `useSortable` requires
`{id, index}` and adds ordering, an optional `group`, and animation
([dndkit.com/react/hooks/use-sortable](https://dndkit.com/react/hooks/use-sortable/);
source MDX: `apps/docs/docs/react/hooks/use-sortable.mdx`).

The `group` option is documented as: "An optional identifier for grouping
sortable items. Items with the same `group` can be sorted within the same list —
useful for multi-list sortable layouts. Items without a `group` are treated as
belonging to the same implicit group."
(`apps/docs/docs/react/hooks/use-sortable.mdx`).

`type` and `accept` are documented as a matched pair — `type` is "An identifier
for this item that other sortables' or droppables' `accept` rules check **when
this item is dragged**", and `accept` is "Restrict which draggables can be
dropped on this sortable item … or a predicate that receives the draggable and
returns `true`" (same file). That predicate form is the mechanism for a
same-week constraint.

`disabled` accepts `boolean | {draggable?: boolean; droppable?: boolean}` — you
can make a cell undroppable without making it undraggable (same file).

### 3.4 Collision detection

`@dnd-kit/collision@0.5.0/dist/index.d.ts` exports, with its own doc comments:

- `defaultCollisionDetection` — "Returns the droppable that has the greatest
  intersection area with the pointer coordinates. If there are no pointer
  coordinates … the greatest intersection area between the collision shape and
  other intersecting droppable shapes."
- `pointerIntersection` — "A high precision collision detection algorithm that
  detects whether the pointer intersects with a given droppable element… Returns
  null if the pointer is outside of the droppable element."
- `closestCenter`, `closestCorners`, `shapeIntersection`, `pointerDistance`,
  `directionBiased`.

`CollisionType` is `Collision | ShapeIntersection | PointerIntersection` and a
`Collision` is `{id, priority, type, value, data?}`
(`@dnd-kit/abstract/index.d.ts`). Collisions are resolved by priority first,
then value — hence the multiple-lists guide's instruction to set the
_container's_ `collisionPriority` to `CollisionPriority.Low` "to prioritize
collisions of items over collisions of columns"
(`apps/docs/docs/react/guides/multiple-sortable-lists.mdx`).

The important structural point for us: **collision detection is per-droppable,
not per-context.** `collisionDetector` is a field on the droppable input, so a
day cell can use `pointerIntersection` while some other target uses
`closestCenter`. Rects are held as `droppable.shape` and re-measured — the
`Droppable` class in `@dnd-kit/dom` exposes
`refreshShape: () => Shape | undefined`, and `ScrollListener` is a default core
plugin. That is the direct answer to the "cached rects go stale on scroll"
weakness.

### 3.5 Keyboard

`KeyboardSensor` is in the default sensor set. `@dnd-kit/dom@0.5.0/index.js`:

```js
var defaultPreset = {
	modifiers: [],
	plugins: [Accessibility, AutoScroller, Cursor, Feedback, PreventSelection],
	sensors: [PointerSensor, KeyboardSensor],
}
```

Documented default keybindings
([dndkit.com/extend/sensors/keyboard-sensor](https://dndkit.com/extend/sensors/keyboard-sensor/)):

```ts
const defaultKeyboardCodes = {
	start: ['Space', 'Enter'], // Start dragging
	cancel: ['Escape'], // Cancel drag operation
	end: ['Space', 'Enter', 'Tab'], // End dragging
	up: ['ArrowUp'],
	down: ['ArrowDown'],
	left: ['ArrowLeft'],
	right: ['ArrowRight'],
}
```

Matched against `KeyboardEvent.key`, not `.code` (same page). Also: "By default,
each arrow key press moves the dragged item by 10 pixels. Hold Shift to multiply
movement by 5", and `preventActivation` defaults to only activating when the
event target _is_ the handle, "preventing accidental drags from focused
descendants like buttons or inputs".

**A 10px-per-press pixel model would be unusable on our grid** — a day column is
roughly (390px − 68px gutter) / 7 ≈ 46px on a phone, so five presses per column.
But:

**[source, undocumented]** For **sortable** sources this pixel model is
overridden. `@dnd-kit/dom@0.5.0/sortable.js:93-215` defines
`SortableKeyboardPlugin`, registered by default for every `Sortable`
(`sortable.js:595-598`:
`var defaultPlugins = [SortableKeyboardPlugin, OptimisticSortingPlugin];`). On
each keyboard-driven `dragmove` it:

1. filters registered droppables to those lying in the pressed direction, using
   a 10px `TOLERANCE` against shape centres and a freshly constructed
   `DOMRectangle(droppable.element, {getBoundingClientRect: …  getVisibleBoundingRectangle(element, undefined, 0.2)})`
   — i.e. **re-measured, and only counting elements at least 20% visible**;
2. runs `collisionObserver.computeCollisions(potentialTargets, closestCorners)`;
3. `actions.setDropTarget(firstCollision.id)`, then
   `scrollIntoViewIfNeeded(element)` and `actions.move({by: delta})` to snap the
   item onto the new target.

So with `useSortable`, **one arrow press = one cell**, plus automatic
scroll-into-view. It also disables the `Scroller` for the duration of a keyboard
drag (`sortable.js:106-117`). None of this is on the keyboard-sensor docs page;
the docs describe only the 10px model. I read it out of the shipped dist. If we
use plain `useDroppable`/`useDraggable` instead of `useSortable`, we get the
10px model and must configure `offset` ourselves —
`KeyboardSensor.configure({offset: {x, y}})` is documented, default 10.

### 3.6 Screen-reader announcements — yes, and better than I expected

There is a documented `Accessibility` plugin, on by default
([dndkit.com/extend/plugins/accessibility](https://dndkit.com/extend/plugins/accessibility/)),
and I verified the docs page against the dist source; they agree.

What it does automatically, per the docs page and confirmed in
`@dnd-kit/dom@0.5.0/index.js`:

- Creates a live region: `role="status"`, `aria-live="polite"`,
  `aria-atomic="true"`, visually hidden via a `clip`/`clip-path` inline style
  block, appended to `document.body`.
- Creates a hidden instructions element referenced by `aria-describedby`.
- On the draggable's activator element sets `role="button"` (unless it is
  already a `<button>` or has a `role`), `aria-roledescription="draggable"`,
  `aria-describedby`, `aria-pressed`, `aria-grabbed`, `aria-disabled`, and
  `tabindex="0"` when the element is not natively focusable.
- Default instructions: "To pick up a draggable item, press the space bar. While
  dragging, use the arrow keys to move the item in a given direction. Press
  space again to drop the item in its new position, or press escape to cancel."
- Default announcements are id-based: `"Picked up draggable item {id}."`,
  `"Draggable item {id} was moved over droppable target {targetId}."`,
  `"Dragging was cancelled. Draggable item {id} was dropped."` etc.
- `dragover`/`dragmove` announcements are debounced (default 500ms);
  `dragstart`/`dragend` are immediate.

Customisation is
`Accessibility.configure({announcements, screenReaderInstructions, debounce, id, idPrefix})`,
passed through `DragDropProvider`'s `plugins` prop. The docs page shows the
React form verbatim:

```tsx
// source: https://dndkit.com/extend/plugins/accessibility (React tab), verbatim
<DragDropProvider
  plugins={(defaults) => [
    ...defaults,
    Accessibility.configure({
      announcements: {
        dragstart({operation: {source}}) {
          if (!source) return;
          return `Started dragging ${source.id}`;
        },
        ...
      },
    }),
  ]}
>
```

Two consequences we must plan for:

1. **The defaults are useless to an athlete.** Our chip ids are strings like
   `3-run-0` (`__prototype-variant-j.tsx:310-316`) and our day-cell ids would be
   `w3-Tue`. "Picked up draggable item 3-run-0" is noise. We must supply
   `announcements` that read domain words — and we have the material to do it
   (`chip.session.title`, `DISCIPLINE_LABELS`, the day, the week index — the
   same strings already assembled for `aria-label` at `:1447`).
2. **`aria-pressed` collides with ours.** The plugin sets `aria-pressed` to the
   _dragging_ state; variant J sets `aria-pressed={selected === chip.key}` for
   _selection_ (`:1448`). One of the two has to go. Since the plugin only writes
   it when the values differ, and it writes on every effect pass, ours would be
   clobbered. The fix is to express selection with `aria-current` or
   `data-selected` + a `role`-appropriate attribute, not `aria-pressed`. ADR
   0030's stance against `role="application"` also cuts here: the plugin's
   `role="button"` fallback is fine, and our chips are already `<button>`s so
   the role is left alone.

The old `@dnd-kit/core` v6 had the same concept (`DndContext`'s
`accessibility={{announcements, screenReaderInstructions}}`, still documented at
`/legacy/guides/accessibility`), so this is continuity, not a new feature.

### 3.7 Auto-scroll, pointer/touch behaviour

`AutoScroller` is a default plugin (see `defaultPreset` above). Documented
options in `@dnd-kit/dom/index.d.ts`:

```ts
interface AutoScrollerOptions {
	/** Base scroll speed multiplier. Higher values scroll faster. @default 25 */
	acceleration?: number
	/**
	 * Percentage of container dimensions that defines the scroll activation zone.
	 * A single number applies to both axes. Use `{ x, y }` … Set an axis to `0`
	 * to disable auto-scrolling on that axis. @default { x: 0.2, y: 0.2 }
	 */
	threshold?: number | Record<Axis, number>
}
```

Touch, from
[dndkit.com/extend/sensors/pointer-sensor](https://dndkit.com/extend/sensors/pointer-sensor/):
"The Pointer sensor handles touch input on mobile devices by default — no
additional setup is required. On touch devices, dragging activates after a
**250ms delay** with **5px movement tolerance**. This prevents accidental drags
when scrolling." Defaults per pointer type: mouse-on-handle immediate; touch
250ms/5px; text inputs 200ms/0px; other 200ms/10px + 5px distance.

This is strictly better than what variant J does today. J puts `touch-none` on
every chip (`:1471`) and on every week total (`:1407`), which means a finger
that lands on a chip _cannot scroll the page_ — on a 390px viewport with 20 week
rows that is a real trap, and the long-press-to-drag model removes the need for
it.

The `Feedback` plugin (also default) "manages visual feedback during drag
operations … handles element promotion to the browser's top layer and drop
animations"
([dndkit.com/react/guides/feedback](https://dndkit.com/react/guides/feedback/)),
with `feedback: 'default' | 'move' | 'clone' | 'none'`
(`@dnd-kit/dom/index.d.ts`). That is the "chip follows the pointer" weakness
closed without writing anything. `DragOverlay` exists for the cases where you
want a bespoke floating representation (`@dnd-kit/react/index.d.ts`).

One gotcha, documented as a warning: "Use the function form
`(defaults) => [...]` to extend the default plugins rather than replacing them.
Passing a plain array replaces all default plugins, which may disable expected
behavior like auto-scrolling and accessibility." (feedback guide). An array
literal in the `plugins` prop silently kills the live region.

### 3.8 Moving an item between two different containers

Documented, and it is the canonical guide:
`apps/docs/docs/react/guides/multiple-sortable-lists.mdx` (canonical URL
https://dndkit.com/react/guides/multiple-sortable-lists). Its shape:

- state is **`Record<containerId, itemId[]>`**;
- items use `useSortable({id, index, type, accept, group})`;
- containers use `useDroppable({id, collisionPriority: CollisionPriority.Low})`
  so an empty container can still receive a drop;
- `onDragOver` calls `move(items, event)` from `@dnd-kit/helpers`.

`@dnd-kit/helpers@0.5.0/dist/index.d.ts` types `move` as accepting
`T extends Items | Record<UniqueIdentifier, Items>` — so the grouped-record form
is first-class, not a workaround. `swap`, `arrayMove`, `arraySwap` are
alongside.

The state-management guide adds the two facts that matter for a derived-state
app like ours (`apps/docs/docs/react/guides/sortable-state-management.mdx`):

- With the default `OptimisticSortingPlugin`, "**`source` and `target` in the
  drag operation will refer to the same element** during a drag. This means you
  cannot compare `source.id` and `target.id` to determine what moved." Instead
  read `source.index`, `source.initialIndex`, `source.group`,
  `source.initialGroup`, narrowed with the `isSortable` type guard.
- "You can call `event.preventDefault()` in `onDragOver` to prevent the
  `OptimisticSortingPlugin` from optimistically updating for that specific
  event. This is useful when you want to conditionally block certain moves (for
  example, preventing items from being dragged into a specific group)."

That last sentence is the same-week constraint, verbatim.

### 3.9 SSR — verified first-hand, it is fine

Claims and how I checked them:

- `@dnd-kit/react/hooks.js` defines
  `canUseDOM = typeof window !== "undefined" && …` and
  `useIsomorphicLayoutEffect = canUseDOM ? useLayoutEffect : useEffect` — no
  layout effect on the server.
- `@dnd-kit/react/index.js:41` has a module-scope
  `var defaultManager = new DragDropManager();`, which _would_ be a problem if
  the constructor touched the DOM. It does not: requiring the package in plain
  Node with no DOM succeeds.
- I rendered it through `react-dom/server`. Test written for this document (not
  from the docs), run in a scratch `/tmp` install of `@dnd-kit/react@0.5.0` +
  `react@19` + `react-dom@19`:

  ```js
  // /tmp probe, written for this doc
  import { renderToString } from 'react-dom/server'
  function Chip() {
  	const { ref } = useDraggable({ id: 'chip-1' })
  	return <button ref={ref}>chip</button>
  }
  function Cell() {
  	const { ref, isDropTarget } = useDroppable({ id: 'w1-Mon' })
  	return (
  		<div ref={ref} data-drop={String(isDropTarget)}>
  			<Chip />
  		</div>
  	)
  }
  renderToString(
  	<DragDropProvider>
  		<Cell />
  	</DragDropProvider>,
  )
  ```

  Output: `<div data-drop="false"><button>chip</button></div>`. No throw, no
  wrapper markup, no injected attributes.

Two honest riders. (a) The ARIA attributes are **absent from the server HTML** —
`role`, `aria-roledescription`, `aria-describedby`, `tabindex` are applied
client-side by the Accessibility plugin via `setAttribute` in a scheduled
effect. That is hydration-safe (React never sees them) but means those
affordances do not exist before hydration. (b) There is an open,
maintainer-confirmed React 19 bug:
[#2116 "React 19: DragDropProvider manager is destroyed during Strict Mode replay"](https://github.com/clauderic/dnd-kit/issues/2116)
(opened 2026-08-04) — `useStableInstance` destroys `ref.current` from
`useInsertionEffect`, so a StrictMode replay can leave a mounted provider
holding a destroyed manager. **We do not use StrictMode** —
`grep -rn StrictMode app/` returns nothing, and `app/entry.client.tsx:10` is a
bare `hydrateRoot(document, <HydratedRouter />)` — so this specific bug does not
reach us — but it is a fair proxy for how mature the React adapter is.

### 3.10 Bundle size — measured, not cited

`gzip -c` over the shipped ESM entry of each package, from the scratch install:

| Package                                             | raw      | gzip        |
| --------------------------------------------------- | -------- | ----------- |
| `@dnd-kit/react/index.js`                           | 21.5 KB  | **5.6 KB**  |
| `@dnd-kit/dom/index.js`                             | 85.2 KB  | **19.4 KB** |
| `@dnd-kit/abstract/index.js`                        | 56.5 KB  | **12.4 KB** |
| `@dnd-kit/state/index.js`                           | 13.6 KB  | **3.8 KB**  |
| `@dnd-kit/collision`                                | 5.6 KB   | 1.2 KB      |
| `@dnd-kit/geometry`                                 | 12.7 KB  | 3.9 KB      |
| **new-generation total (react+dom+abstract+state)** | ~177 KB  | **~41 KB**  |
| `@dnd-kit/core@6.3.1/dist/core.esm.js` (old)        | 104.3 KB | **22.3 KB** |

So the new generation is roughly **1.8× the old one** pre-tree-shaking, ~41 KB
gzip on the wire if nothing shakes out. npm's reported `unpackedSize` for
`@dnd-kit/dom@0.5.0` is 1.21 MB, but that includes CJS + `.d.cts` + source maps
and is not a wire figure. **Unverified:** how much of the 41 KB actually
tree-shakes away in our Vite 7 production build. It should be measured in the
prototype (`vite build` + `rollup-plugin-visualizer` or just the chunk sizes) —
ADR 0029 set the precedent that bundle claims in this repo get measured, not
cited.

For scale: ADR 0029 rejected Recharts at ~111 KB gzip as a lazy chunk. 41 KB is
under half that, and unlike a chart library it is not replaceable with 200 lines
of SVG — see Part 5.

### 3.11 Production-readiness evidence, both directions

**For:**

- The docs site's own words, verbatim from the HTML of
  [dndkit.com](https://dndkit.com/): "**Production ready**: Built for
  performance, accessibility, and reliability" — in a feature list, with no
  version qualifier and no pre-release caveat anywhere on the page.
- The README's feature list claims "lists, grids, **multiple containers**,
  nested contexts, variable sized items, virtualized lists, 2D games" and
  "**Accessibility:** Keyboard support, sensible default ARIA attributes,
  customizable screen reader instructions and live regions built-in"
  (github.com/clauderic/dnd-kit README).
- Docs are genuinely good and match the source. Every API claim I spot-checked
  against the dist agreed. The `apps/docs/docs/` tree has pages for each hook,
  each plugin (`accessibility`, `auto-scroller`, `cursor`, `feedback`,
  `style-injector`, `debug`), each sensor, and guides for multiple lists, state
  management, collision detection, modifiers, feedback and migration.
- The docs site publishes an `llms.txt` index (`https://dndkit.com/llms.txt`).
- Real sponsors are listed in the docs repo (`images/sponsors/`: Doist, Sentry,
  Any.do, HTTPie, Mintlify, Puck). MIT licence on every package; no sponsorware
  or dual-licence angle found.
- 17,538 GitHub stars; repo not archived; four framework adapters (React, Vue,
  Svelte, Solid) versioned in lockstep at 0.5.0.

**Against:**

- **It is `0.5.0`.** Two years after `0.0.1`, ~380 published versions, no 1.0. I
  could not find a published 1.0 roadmap, milestone, or dated stability
  commitment — **explicitly unverified**; I searched the repo's releases and the
  docs site and found neither.
- **124 open issues** (GitHub API, `open_issues_count`, includes PRs). The
  recent ones land on exactly our surface:
  - [#2119](https://github.com/clauderic/dnd-kit/issues/2119) "You can
    keyboard-drag an item outside its scrollable container element by holding
    down the arrow key" (2026-08-04) — our calendar is inside a scroll
    container.
  - [#2118](https://github.com/clauderic/dnd-kit/issues/2118) "Keyboard sensor
    locks out mouse" (2026-08-04).
  - [#2120](https://github.com/clauderic/dnd-kit/issues/2120) "Accessibility:
    `dragover` fires immediately after `dragstart` in sortable" (2026-08-04) —
    i.e. a spurious first announcement.
  - [#2111](https://github.com/clauderic/dnd-kit/issues/2111) "Active sortable
    item becomes invisible during drag in Chrome" (2026-07-29).
  - [#2110](https://github.com/clauderic/dnd-kit/issues/2110) "Layout Thrashing"
    (2026-07-27).
  - [#2116](https://github.com/clauderic/dnd-kit/issues/2116) React 19
    StrictMode, above.
- **Bus factor.** The commit log on `main` is overwhelmingly `clauderic`'s
  merges; last commit 2026-07-13. A month of quiet is not abandonment, but there
  is one maintainer.
- **A July 2026 commit is literally titled**
  `docs: fix incorrect API claims and broken examples across docs` (2026-07-06,
  merged as [#2103](https://github.com/clauderic/dnd-kit/pull/2103)). The docs I
  read are _post_-fix, which is reassuring about the present and unflattering
  about the recent past. Treat any dnd-kit tutorial or LLM-recalled snippet
  dated before July 2026 as suspect and check it against types.
- Missing docs surfaces I looked for and did not find: no page for the
  `Droppable` API in a React idiom (the `/concepts/droppable` page's only
  example is the vanilla `Droppable` class — the React hook page exists
  separately at `/react/hooks/use-droppable`), and **no guide at all for a
  two-dimensional grid of drop targets or a calendar**. The examples in the repo
  (`apps/stories/stories/react/`) cover Draggable, Droppable, Sortable
  (Vertical, Horizontal, Grid, MultipleLists, Table, Tree, Virtualized, Iframe,
  Transformed) — the "Grid" story is a _sortable grid of items_, not a grid of
  cells. **We are the first calendar; there is no example to copy.**

**And the honest counterweight the owner should hear:** the alternative is
worse. `@dnd-kit/core@6.3.1` has had **no release since 2024-12-05**, is filed
under `/legacy/` in its own documentation, and its `@dnd-kit/utilities`
dependency has not been published since 2023. Choosing v6 is choosing a frozen
dependency to avoid a pre-1.0 one. Neither is "safe"; they are different risks,
and only one of them gets bug fixes.

### 3.12 The official dnd-kit + TanStack Table example

It exists, in the dnd-kit repo, not the TanStack repo:
[`apps/stories/stories/react/Sortable/Table/TanstackTableExample.tsx`](https://github.com/clauderic/dnd-kit/blob/main/apps/stories/stories/react/Sortable/Table/TanstackTableExample.tsx).
It imports `useReactTable`, `getCoreRowModel`, `flexRender` from
`@tanstack/react-table` — i.e. **v8** — alongside `DragDropProvider`,
`useSortable` from `@dnd-kit/react/sortable`, `move` from `@dnd-kit/helpers`,
and `RestrictToHorizontalAxis` from `@dnd-kit/abstract/modifiers`. It makes both
rows and columns sortable, discriminates them by `source?.type === 'column'` in
`onDragOver`, and reverts from a `useRef` snapshot when `event.canceled`. There
is a sibling
`apps/stories/stories/react/Sortable/Virtualized/ReactVirtualExample.tsx` for
`@tanstack/react-virtual`.

So the "new dnd-kit + TanStack Table v8 + TanStack Virtual" combination is one
the dnd-kit maintainer actively exercises. **Unverified:** whether it has been
exercised against Table **v9** (ten days old at the time of writing).

---

## Part 4 — What the sources state: TanStack

### 4.1 The complete current library list

From `https://tanstack.com/llms.txt`, which the site publishes as "the routing
layer for the docs" — the canonical machine-readable list. Verbatim
descriptions, plus my relevance verdict for this surface.

| Library             | Official description                                                                | Fit here                                                                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Table**           | "Headless, type-safe table and data-grid infrastructure."                           | **Yes, for variant K.** No for the calendar. Argued in Part 5.                                                                                                                                                                             |
| **Virtual**         | "Headless UI for Virtualizing Large Element Lists."                                 | **Already in use; not needed at 20 rows.** Part 5 Q2.                                                                                                                                                                                      |
| Store               | "Framework agnostic data store with reactive framework adapters."                   | No. Our state is 6 `useState`s in one route component and a pure `applyMoves` derivation (`__prototype-variant-j.tsx:545-567`, `:323-362`). Adding a store buys nothing and Table v9 already bundles `@tanstack/react-store` transitively. |
| Form                | "Headless UI for building performant and type-safe forms."                          | No. This repo standardises on Conform + Zod (see `app/routes/**` form usage); nothing on the calendar is a form except the week-total number input. Swapping form libraries is a separate, unrelated decision.                             |
| Query               | "Powerful asynchronous state management, server-state utilities and data fetching." | No — React Router 7 framework mode owns loaders/actions/revalidation. Adding Query would be a second data layer.                                                                                                                           |
| Router / Start      | "Type-safe Routing…" / "Full-stack Framework…"                                      | Off the table by construction: this app is React Router 7 framework mode (`package.json:63-66`, `react-router.config.ts`).                                                                                                                 |
| DB                  | "The reactive client-first store for your API."                                     | No.                                                                                                                                                                                                                                        |
| AI                  | "The headless agent framework for TypeScript."                                      | No (and the app's generation path is server-side and deterministic, ADR 0053).                                                                                                                                                             |
| **Charts**          | "A chart grammar you don't have to outgrow."                                        | Out of scope here, but worth a note: this did not exist when ADR 0029 chose hand-rolled SVG. `@tanstack/react-charts@0.13.0`. Someone should decide whether that ADR deserves a revisit; **not this document's call**.                     |
| Hotkeys             | "Type-safe keyboard shortcuts, sequences, and key state tracking."                  | **Marginal but real.** `@tanstack/react-hotkeys@0.10.0`. Variant J hand-rolls a `window` keydown listener for ⌘K (`__prototype-variant-j.tsx:784-795`). One listener is not a library. Note it, don't adopt it.                            |
| Markdown, Highlight | serializable doc model / syntax highlighting                                        | No.                                                                                                                                                                                                                                        |
| Pacer               | "debouncing, throttling, rate limiting, queuing, and batching utilities."           | No. The one debounce we'd want (announcements) is already inside dnd-kit's Accessibility plugin.                                                                                                                                           |
| Devtools            | "Centralized devtools panel for TanStack libraries…"                                | No. `react-router-devtools` is already a devDependency (`package.json:167`).                                                                                                                                                               |
| Config, CLI, Intent | packaging / scaffolding / agent skills                                              | No.                                                                                                                                                                                                                                        |

**There is no TanStack drag-and-drop library.** Not in the `llms.txt` index, not
on the homepage's library grid (Framework: Start, Router; Data & State: Query,
DB, Store, AI; UI & UX: Table, Charts, Form, Hotkeys, Markdown, Highlight;
Performance: Virtual, Pacer; Tooling: Devtools, Config, CLI, Intent), and
`npm view` returns 404 for `@tanstack/react-drag` and `@tanstack/react-dnd`. The
only DnD-adjacent thing in the TanStack orbit is the **AG Grid partnership**
(`https://tanstack.com/table/latest/docs/enterprise/ag-grid`), which is a
commercial data-grid, not a drag toolkit, and not something this app wants.

**TanStack Ranger** deserves a specific note because it looks like a fit for the
week-total drag. It is **not on the current library list** — absent from both
`llms.txt` and the homepage — although
`https://tanstack.com/ranger/latest/docs/overview` still resolves (200) and
describes it as "a Feature Rich and Lightweight Headless utility, which means
out of the box, it doesn't render or supply any actual UI elements". npm:
`@tanstack/react-ranger@0.0.5`, last publish 2026-06-30, description "Hooks for
building range and multi-range sliders in React". A `0.0.5` package that the
vendor no longer lists among its libraries is not something to build the plan
builder's primary numeric control on. It is also the wrong shape: a range slider
needs a bounded min/max track, and a week volume has no natural maximum.

### 4.2 Verified versions (npm, 2026-08-14)

| Package                                | latest     | published  | note                                                                           |
| -------------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------ |
| `@tanstack/react-table`                | **9.1.2**  | 2026-08-09 | dist-tags also carry `alpha: 9.0.0-alpha.54`, `beta: 9.0.0-beta.80`            |
| `@tanstack/react-table@8` (highest v8) | **8.21.3** | 2025-04-14 | **what this repo pins** (`package.json:71`)                                    |
| `@tanstack/table-core`                 | 9.1.2      | 2026-08-09 |                                                                                |
| `@tanstack/react-virtual`              | **3.14.9** | 2026-07-28 | repo pins `^3.13.26` → semver-compatible, no action needed (`package.json:72`) |
| `@tanstack/react-ranger`               | 0.0.5      | 2026-06-30 | see above                                                                      |
| `@tanstack/react-form`                 | 1.33.5     | —          |                                                                                |
| `@tanstack/store`                      | 0.11.1     | —          |                                                                                |
| `@tanstack/react-query`                | 5.101.4    | —          |                                                                                |
| `@tanstack/react-charts`               | 0.13.0     | —          |                                                                                |
| `@tanstack/react-hotkeys`              | 0.10.0     | —          |                                                                                |

### 4.3 Table v9: it exists, it is GA, and it is ten days old

`@tanstack/react-table@9.0.0` published **2026-08-04**, then `9.0.1` (08-07),
`9.1.0` (08-07), `9.1.1` (08-08), `9.1.2` (08-09) — **five releases in five
days** (npm `time`). `latest` points at 9.1.2, so it is GA, not a pre-release.
v9 depends on `@tanstack/table-core@9.1.2` and `@tanstack/react-store@^0.11.0`;
peer `react >=18`.

From the official React migration guide
(`https://tanstack.com/table/latest/docs/framework/react/guide/migrating.md`),
quoted:

- `useReactTable` → **`useTable`**: "The number one change".
- **New required `features` option**: "In Table V9, you must explicitly declare
  which features your table uses. Features, Row Models, and Row Model processing
  'Fns' are defined on the new `features` table option." Tree-shaking: "Start
  with 5kb of bundled JS and only bundle the features you need." `stockFeatures`
  restores the v8 everything-included behaviour.
- **State on TanStack Store**: "the state system is built on TanStack Store,
  giving the table a reactive foundation that works correctly under the React
  Compiler", with `table.atoms` / `table.store` / `table.Subscribe`. Backward
  compatible: "`state` plus `on[State]Change`" still works.
- **New features relevant to a grid**: `cellSelectionFeature` —
  "spreadsheet-style rectangular cell range selection, with drag, Shift-extend,
  and multiple disjoint ranges"; `cellSpanningFeature` — "merges body cells
  across rows and columns (`spanRows` / `spanColumns`, with span-aware cell
  selection), and header groups now compute `header.rowSpan`".
- **ESM-only**: "UMD and CJS builds have been dropped", target ES2022.
- Escape hatch: "`useLegacyTable` … accepts the Table V8-style API while using
  Table V9 under the hood. **This is deprecated** and intended only as a
  temporary migration aid. It includes all features by default, resulting in a
  larger bundle size than you even got with Table V8." Imported from
  `@tanstack/react-table/legacy`.
- Reassurance, quoted: "**Table markup is largely unchanged.** How you render
  `<table>`, `<thead>`, `<tr>`, `<td>`, etc. remains the same."

**Is migrating now advisable?** My read: no, not as part of this work. It is a
five-day-old major with a documented rename that touches the one file using it,
and the migration is _orthogonal_ to the calendar rebuild. Doing both at once
makes the prototype's verdict unreadable. The overview page does nudge: "If you
are upgrading from TanStack Table v8, start with the migration guide"
(`https://tanstack.com/table/latest/docs/overview.md`). That is a good separate
refactor PR (the memory note on the tracer-bullet audit explicitly allows pure
refactors as their own PRs).

### 4.4 Table's data model, and what it says about calendars

Quoted from the Data guide
(`https://tanstack.com/table/latest/docs/guide/data.md`):

> "`data` is an array of objects that will be turned into the rows of your
> table. **Each object in the array represents a row of data (under normal
> circumstances).**"

And from the Overview:

> "TanStack Table is **_NOT_** a pre-built table component … it is a headless UI
> library that gives you the power to build your own fully customizable table
> and datagrid components … TanStack Table is the _engine_ that you can hook up
> to your own favorite front-end tech."

So: one row = one record; one cell = the intersection of a record and a column
def; the library computes row models, header groups, sizing and feature state,
and renders nothing. `colSpan`/`rowSpan` are supported at the header level
(header groups; v9 adds `header.rowSpan`) and, as of v9, at the body level via
`cellSpanningFeature`. Nested/grouped headers are a first-class feature ("Header
Groups" guide + a React "Header Groups" example).

**There is no official calendar example and no guidance for cells holding
collections.** I read the full React example list from
`https://tanstack.com/table/latest/llms.txt`: Basic (×6 variants), Header
Groups, Kitchen Sink, Cell Selection, Cell Spanning, Column Filters (×4), Column
Ordering, Virtualized Rows/Columns/Infinite (+ experimental variants), and the
rest of the feature demos. No calendar, no board, no kanban. And — worth stating
plainly — **no row-DnD example either**, in v9's docs. (v8's docs historically
had one; the current index does not list it. The living dnd-kit + Table example
is the one in the dnd-kit repo, §3.12.)

### 4.5 Virtual: grids, and when it pays

From the Virtual introduction
(`https://tanstack.com/virtual/latest/docs/introduction.md`):

> "Virtualizers can be oriented on either the vertical (default) or horizontal
> axes which makes it possible to achieve vertical, horizontal and even
> **grid-like virtualization by combining the two axis configurations
> together**."

So 2D virtualization is supported _by composing two virtualizers_, not by a grid
API. **Note:** the current React example list for Virtual is Fixed, Variable,
Dynamic, Pretext, Padding, Scroll Padding, Sticky, Infinite Scroll, Chat, Smooth
Scroll, Table, Window — **there is no longer a "Grid" example** in the index
(older v3 docs had one; I could not fetch it at
`/virtual/latest/docs/framework/react/examples/grid` — 404). Mark that
**unverified**: a grid example may exist in the repo's `examples/` directory
without being listed.

On the threshold question, the closest thing to official guidance is in the
Table virtualization guide
(`https://tanstack.com/table/latest/docs/framework/react/guide/virtualization.md`):

> "**When To Use Virtualization** — Use virtualization when your table has a
> very large number of rows, columns, or both. … **For small tables, normal
> rendering is simpler and usually preferable.**"

**No numeric threshold is published by TanStack anywhere I could find.** I
looked in the Virtual introduction, the Virtual guides index, and the Table
virtualization guides. Treat any specific number as engineering judgement, not
vendor guidance.

---

## Part 5 — Recommendation

Everything below is my judgement, built on Part 1–4. It is separated from the
sources deliberately.

### Q1 — Is TanStack Table the right model for the calendar grid?

**No. Plain CSS grid for the calendar; TanStack Table for variant K's stat table
only.** The argument from the data models, not from taste:

1. **Our rows are not records and our cells are not values.** Table's contract
   is "each object in the array represents a row of data"
   (`/docs/guide/data.md`). A plan week is not a record with seven fields; it is
   a _container_ whose contents are a set of sessions each carrying its own
   weekday. To force it into Table I would define `Week` as
   `{Mon: Chip[], Tue: Chip[], …}` and seven display columns — at which point
   every single thing the library provides is inert. There is no sorting (weeks
   are chronological by definition), no filtering, no pagination, no grouping,
   no column ordering, no resizing, no row selection semantics.
   `getCoreRowModel` over a 20-element array is a `map`. The only earned feature
   would be `flexRender` + column meta, which is styling indirection, not logic.
2. **The gutter is not a column of the same kind.** It holds _N_ editable
   totals, where N is the track count (1 or 3) — a nested, variable-arity
   control cluster whose height drives the row height. Table has no concept of
   that; it would be one display column whose cell renderer is 50 lines.
   Meanwhile variant K's per-track columns _are_ a genuine dynamic-columns case,
   which Table does well (it has an official "Basic (Dynamic Columns)" example).
3. **The drop target identity is `(week, weekday)`, and CSS grid gives that for
   free.** `grid-cols-[4.25rem_repeat(7,minmax(0,1fr))]` already produces
   exactly the geometry dnd-kit needs to hit-test, and a `<div>` cell can be a
   droppable with an id. Inside a `<table>`, `<td>` elements are also perfectly
   droppable — but the `<table>` buys us nothing to compensate for the layout
   rigidity we'd inherit (`table-layout`, `colgroup`, the `overflow-x-auto`
   wrapper that `ui/table.tsx:5-17` forces on every `Table`).
4. **The mobile-first mandate cuts against a table.** ADR 0028 makes 390×844 the
   primary target and `docs/design/ui-conventions.md:131-141` says "a value or
   placeholder must never render clipped at 390px". The ledger's own answer to a
   table at 390px was _not to render a table_ (`session-ledger.tsx:183-192`). A
   7-column calendar has to survive 390px as a grid; CSS grid with
   `minmax(0,1fr)` does that, and variant J already relies on it.
5. **v9's new features change the argument less than they look like they do.**
   `cellSpanningFeature` and `cellSelectionFeature` are genuinely grid-ish, and
   if we ever build a _spreadsheet_ (drag-select a rectangle of weeks × tracks
   and bulk-edit) v9 Table would be the right engine. But cell _selection_ is
   not item _placement_, and cell _spanning_ is not a cell holding three chips.
   They don't rescue the abstraction for this surface.

**Conversely, adopt TanStack Table for variant K.** That surface is exactly what
Table is for: one row = one week record, 8 + N scalar columns, an expandable
detail row, responsive column hiding, and a dynamic per-track column set. Doing
it with Table would also delete the hand-maintained
`colSpan={6 + trackStats.length}` arithmetic at `__prototype-variant-k.tsx:886`
(Table computes `columns.length`, as the ledger does at
`session-ledger.tsx:263`). Follow the session-ledger conventions verbatim —
`createColumnHelper` + `.display()`, `meta.className`, `flexRender`,
`getCoreRowModel` only, `getRowId`, presenter module for rows — with one
conscious departure: variant K's per-track columns must be built inside a
`useMemo` keyed on the track list rather than as a module-level `const columns`
array (`session-ledger.tsx:53` is module-level because its columns are fixed).

### Q2 — Do we need virtualization at 11–20 week rows?

**No.** Honestly and without hedging.

- 20 rows × 8 cells = 160 cells, each holding 0–3 small buttons. Call it 400–600
  DOM nodes. The session ledger virtualizes because a ledger is unbounded —
  every session an athlete ever recorded — and it still only kicks in past the
  ~15 rows that fit in `max-h-[60vh]`.
- TanStack's own guidance: "For small tables, normal rendering is simpler and
  usually preferable" (Table virtualization guide).
- Virtualization actively **costs** us here. A virtualized row is unmounted when
  scrolled out; a drop target that does not exist cannot be collided with, so
  cross-week drag-scroll-drop would need the virtualizer and dnd-kit's
  auto-scroller to cooperate. dnd-kit does ship a virtualized-sortable example
  (`ReactVirtualExample.tsx`), so it is possible — but it is complexity bought
  for no gain. Keyboard drag is worse: `SortableKeyboardPlugin` enumerates
  `registry.droppables` and requires the target element to be ≥20% visible
  (§3.5), so unmounted cells are invisible to keyboard navigation entirely.
- **Where the threshold actually is**, as engineering judgement (no vendor
  number exists — see §4.5): virtualize when the number of _simultaneously
  mounted interactive elements_ crosses roughly 1,500–2,000, or when a scroll
  frame measurably drops below 60fps at 390px on a mid-range phone. For this
  grid that means somewhere north of **~60–80 week rows** — i.e. a
  three-to-four-year multi-season view. If that view is ever built, it should be
  a different component, the way `SessionLedgerCards` is a different component.
- The one measurement worth taking in the prototype: dnd-kit re-measures
  droppable shapes on drag start and on scroll. 140 day-cells ×
  `getBoundingClientRect` is a real cost, and issue
  [#2110 "Layout Thrashing"](https://github.com/clauderic/dnd-kit/issues/2110)
  suggests it is not free. If that shows up, the fix is fewer droppables (see
  Q3's row-scoped alternative), not virtualization.

### Q3 — Wiring `@dnd-kit/react` to a grid of day-cells

The model that fits our state with the least friction:

**State shape.** Keep `moves: Record<chipKey, Day>` as the source of truth
(`__prototype-variant-j.tsx:558`) and keep `applyMoves` as the derivation. Do
**not** convert to `Record<containerId, chipId[]>` just to use the `move`
helper. Reason: `applyMoves` + `rebalance` re-derive values from the override
map, and an id-array-of-arrays would be a second, redundant representation of
the same fact. The `move` helper is a convenience, not a requirement — the
state-management guide explicitly documents the manual path using
`source.initialGroup` / `source.group`.

**Chips are sortable, not merely draggable.** Use `useSortable` from
`@dnd-kit/react/sortable`, not `useDraggable`, even though we do not care about
order within a day. We take it for the `SortableKeyboardPlugin` (§3.5): one
arrow press = one cell, plus `scrollIntoViewIfNeeded`. That single behaviour is
the difference between a usable keyboard drag and a 5-press-per-day pixel crawl.
Per the docs' own `group` semantics, set:

- `id`: the existing `chipKey(weekIndex, discipline, slot)` (`:310-316`) —
  already unique and stable.
- `index`: the chip's position within its day cell (from the already-sorted
  `week.chips`, `:357-360`).
- `group`: **the day-cell id**, `` `w${week.index}-${day}` `` — the documented
  container identity.
- `type: 'chip'`.
- `accept: 'chip'` — chips may land on chips (within-cell), nothing else.
- `data: {weekIndex, day, discipline, title}` — so the announcement callback and
  `onDragEnd` can read domain values without a lookup.

**Day cells are droppables with low collision priority.** Per the multiple-lists
guide,
`useDroppable({id: `w${week}-${day}`, type: 'day', accept: 'chip', collisionPriority: CollisionPriority.Low, data: {weekIndex, day}})`,
`ref` on the existing `<div data-day={day}>` (`:1430-1437`). Low priority so a
chip-on-chip collision wins over the containing cell, which is what makes drops
into an _empty_ cell work while a populated cell still resolves to a position.
`isDropTarget` from the hook replaces the hand-rolled
`dropping = drag?.week === week.index && drag.day === day` (`:1428`) — and
notably, `isDropTarget` is correct on **both** axes, which is the "x-axis-only
hit testing" weakness gone.

**Collision detector.** `pointerIntersection` on the day cells — it is
documented as returning `null` when the pointer is outside the element, which is
the crisp "you are in this cell or you are not" semantics a calendar wants.
Leave chips on the default.

**The same-week constraint, two ways.** Today it is implicit (only that row's
`[data-day]` cells are hit-tested, `:707`). To keep it:

- _Declaratively_: give the cell's `accept` a predicate —
  `accept: (source) => source.data?.weekIndex === weekIndex` — using the
  documented function form of `accept`. A rejected cell never becomes a target,
  so no visual affordance appears. This is the cleaner expression.
- _Imperatively_: allow the collision and call `event.preventDefault()` in
  `onDragOver` when the weeks differ — the documented way to "conditionally
  block certain moves … preventing items from being dragged into a specific
  group". Useful if we want to _show_ the rejection rather than silently ignore
  it.

I'd start with the predicate.

**Committing the drop.** In `onDragEnd`:

```
if (event.canceled) return
const {source, target} = event.operation
// source/target are the same element under OptimisticSortingPlugin — read the
// sortable's own group instead (documented in the state-management guide).
if (!isSortable(source)) return
const {initialGroup, group} = source
if (group !== initialGroup) moveChip(String(source.id), dayOf(group))
```

That is a 6-line replacement for `startChipDrag`'s 50 lines, and it deletes the
rect cache, the pointer capture, the threshold, and the `drag` state entirely
(`:560`, `:698-748`).

**Allowing cross-week drops later** is then a one-line change: drop the `accept`
predicate. The `group` id already encodes the week, `initialGroup` already tells
us where it came from, and `applyMoves`'s `moves` map is keyed by chip so it
does not care which week the chip lands in — **except** that `rebalance` runs
per `(week, track)` (`:330-336`), so a cross-week move must re-solve _two_ weeks
and, unlike a same-week move, **changes both weeks' totals**. That is a domain
decision (ADR 0040/0043 territory: does dragging a session across a week
boundary move volume, or does the target week absorb it and re-scale?), not a
library question, and it should be answered before the affordance is offered.

**One structural alternative worth prototyping side by side:** scope drop
targets to the _week row_ (20 droppables) and compute the weekday from the
pointer's x within the row, keeping the row's 7 cells as pure presentation. That
is closer to today's code, one-seventh the droppables, and cheaper to measure —
but it throws away `isDropTarget` per cell and re-introduces manual geometry.
I'd expect the per-cell version to win; measure rather than assume.

### Q4 — The accessibility we are missing

**What the library gives us for free** (all default-on, §3.6): a polite
`role="status"` `aria-live` region appended to `document.body`; hidden
`aria-describedby` instructions; `aria-roledescription="draggable"`,
`aria-grabbed`, `aria-disabled`, `tabindex` maintenance; debounced `dragover`
announcements; keyboard pick-up/move/drop/cancel on Space·Enter / arrows /
Escape — which matches ADR 0030's house grammar (`:23-31`) with no
configuration.

**What we must still write:**

1. **Domain announcements.** The defaults emit our internal ids. Supply
   `Accessibility.configure({announcements})` reading `source.data` — e.g.
   `dragstart` → "Picked up Long run, 18 km, Saturday, week 4"; `dragover` →
   "Over Tuesday, week 4"; `dragend` → "Moved Long run to Tuesday, week 4. Week
   total unchanged at 52 km." Route every number and label through the existing
   formatting/label layer (ADR 0023, `app/utils/format.ts`,
   `app/utils/labels.ts`) — the same rule ADR 0030 applies to charts.
2. **The rebalance announcement.** This is the one thing dnd-kit cannot know. A
   drop does not just move a chip; `rebalance` re-sizes sessions on the crowded
   day (`:268-305`). A sighted user sees the numbers change. A screen-reader
   user must be _told_ — and the `dragend` announcement is the place, because it
   fires immediately and un-debounced. This is the single most important custom
   string in the whole integration, and it is entirely on us.
3. **Fix the `aria-pressed` collision** (§3.6). Move chip selection off
   `aria-pressed`.
4. **Keep the non-drag path.** The day-picker row (`:1503-1526`) is a genuinely
   good affordance — an explicit, tappable, 44px-target alternative to a
   gesture, in the spirit of `ui-conventions.md:104-112`. Keep it. Do not treat
   dnd-kit's keyboard drag as a replacement; treat it as an addition.
5. **Verify, don't assume.** Per `ui-conventions.md:229-236` every change is
   verified at 390×844 with Playwright. Add to that a manual VoiceOver pass —
   announcements are the one thing Playwright cannot honestly assert. Note that
   issue [#2120](https://github.com/clauderic/dnd-kit/issues/2120) reports a
   spurious `dragover` announcement firing immediately after `dragstart` in
   sortables; if we hit it, the workaround is a `dragover` callback that returns
   `undefined` when the target equals the initial group.

### Q5 — What replaces the vertical drag on the week total?

**Not a dnd-kit concern.** `startTotalDrag` (`:750-780`) is not drag-and-drop:
it has no source, no target, no drop. It is a **scrubbable number field** — a
gesture that maps vertical displacement to a value
(`start - Math.round(dy/5) * step`), with a tap falling through to a real
numeric `<input>` (`:772-775`, `:1374-1397`). Forcing it through
`DragDropProvider` would mean inventing a fake droppable per value step; the
library's own `Modifier` system is for constraining a drag, not for converting
one into a scalar.

And it is not TanStack Ranger either (§4.1): a `0.0.5` package the vendor no
longer lists, whose model is a bounded slider track, for a value with no natural
maximum.

My recommendation, in order:

1. **Keep the real `<input type="number">` as the primary path** — it already
   exists (`:1374-1397`), it is the platform control, it satisfies
   `ui-conventions.md` §2.1/§2.3 (44px, `text-base md:text-sm`,
   `inputMode="decimal"`), and it is the only path that is keyboard- and
   screen-reader-correct today.
2. **Keep the scrub as a hand-rolled enhancement on top**, but fix its two real
   bugs: (a) it hard-codes `5px per step` with no pointer-type distinction, so
   on touch it is hair-trigger; (b) `touch-none` on the control (`:1407`) blocks
   page scroll from a 20-row list. Gate the scrub to `pointerType !== 'touch'`
   (or require a long-press), and drop `touch-none` on touch.
3. **Add explicit steppers for touch and keyboard** — `−` / `+` at the
   conventions' compact size with the `after:` hit-area extension, which
   `ui-conventions.md:104-112` names ("steppers") as a sanctioned exception.
   That is the accessible equivalent of the scrub, and it is ~20 lines.
4. This is precisely the ADR 0029 pattern: **the expensive part is ours either
   way**, so own it deliberately in one small primitive (`ScrubbableNumber`)
   rather than three copies across variants I, J and K.

### Q6 — Migration risk and effort, plainly

**What genuinely gets better:** the chip follows the pointer (Feedback plugin,
zero lines); rects re-measure on scroll (collision observer + `ScrollListener`,
zero lines); hit-testing is 2-axis (`isDropTarget`, zero lines); a real live
region exists (Accessibility plugin, zero lines); touch gets a 250ms long-press
instead of `touch-none` (zero lines); cross-week drops become a deletion rather
than a feature. Net deletion in variant J: roughly `startChipDrag` (50 lines),
the `drag` state and its call sites, and the `[data-day]` rect cache.

**What it costs:** ~41 KB gzip pre-tree-shaking (measure it); one new pre-1.0
dependency tree of four packages; the custom announcement strings (the real
work); the `aria-pressed` fix; and re-deriving `index` for `useSortable` from
`week.chips`.

**The risks, ranked:**

1. **Pre-1.0 API churn.** `0.4.x → 0.5.0` happened in April→June 2026. A minor
   bump can move the API. Mitigation: pin an exact version (no caret) for the
   first landing, and keep the dnd-kit surface behind one small module
   (`app/utils/plan-calendar-dnd.ts` or a `useChipDrag` hook) so a breaking
   change is a one-file edit — the same "seam" discipline ADR 0053 applies to
   generation. **This is the biggest risk and the cheapest to contain.**
2. **Keyboard-drag inside a scroll container** — issue #2119 is exactly our
   layout. Must be exercised in the prototype at 390×844, holding the arrow key.
3. **Measurement cost at 140 droppables** — issue #2110. Measure a drag start;
   fall back to row-scoped droppables if it thrashes.
4. **The rebalance announcement** is bespoke and easy to get wrong or forget. It
   is the accessibility deliverable, not a nice-to-have.
5. **Chrome invisible-sortable** (#2111) and **keyboard-locks-mouse** (#2118) —
   both cosmetic-to-annoying, both prototype-detectable.
6. **Table v9 churn** if we migrate the ledger at the same time. Don't.

**Effort, honest estimate:** the dnd-kit swap in variant J is roughly a day
(delete 50 lines, add ~40, wire ids and groups). The announcements plus the
`ScrubbableNumber` primitive plus a 390px + VoiceOver verification pass is
another one to two days. Adopting TanStack Table for variant K is half a day
following the ledger's conventions. A Table v8→v9 migration is a separate PR of
its own, touching one file plus `package.json`.

---

## Part 6 — Migration sketch for variant J

Ordered so each step is independently verifiable, in the spirit of the
tracer-bullet rule (no infra without its first consumer).

1. **Measure the baseline.** `vite build`, record the plan-prototype chunk size.
   Playwright at 390×844: drag a chip, note that it does not follow the finger;
   scroll mid-drag, note the stale-rect misdrop; tab to a chip and arrow it,
   note the silence. These are the four claims the rebuild must falsify.
2. **Land `<DragDropProvider>` around the calendar only**, with `onDragEnd`
   writing `moveChip`, chips as `useSortable`, day cells as `useDroppable` with
   `CollisionPriority.Low` and an `accept` predicate pinning the week. Delete
   `startChipDrag`, the `drag` state, and `touch-none` on chips. Keep the
   day-picker fallback row untouched. Pin exact versions.
3. **Verify the four claims are gone**, plus: hold ArrowRight past the last
   column (#2119), drag with a 250ms long-press on touch, drag while the page
   scrolls, and drag with the ⌘K palette open.
4. **Add `Accessibility.configure({announcements})`** with domain strings
   including the rebalance sentence, using the `(defaults) => [...]` function
   form. Move chip selection off `aria-pressed`. VoiceOver pass.
5. **Extract `ScrubbableNumber`** — input-first, mouse-scrub enhancement,
   explicit steppers, no `touch-none` on touch — and use it for the week totals
   in J (and later I and K). Nothing to do with dnd-kit.
6. **Re-measure the bundle.** If the delta is materially above ~25 KB gzip after
   tree-shaking, say so in the ADR; ADR 0029's precedent is that bundle numbers
   are measured and stated, not waved past.
7. **Separately, and only after 1–6 land:** rebuild variant K's table on
   TanStack Table v8 following the session-ledger conventions, with a `useMemo`
   column array for the dynamic per-track columns.
8. **Separately again:** decide on Table v8→v9 for `session-ledger.tsx`, and
   record whichever way it goes. If we go, `useReactTable` → `useTable` +
   `features: tableFeatures({})` + `getCoreRowModel` moved onto `features`, per
   the official React migration guide. Note the ESM-only change against Vite 7
   (should be a non-issue) and re-run the ledger tests
   (`app/utils/session-ledger-rows.test.ts`).
9. **Write the conventions down.** `docs/design/ui-conventions.md` currently has
   no section on tables, grids, virtualization or pointer gestures (§2 of Part
   2). Whatever the ADR decides should land there as a short section, so the
   next surface does not re-litigate it.

---

## Part 7 — What I could not verify

Stated explicitly rather than smoothed over.

- **No 1.0 roadmap for dnd-kit.** I searched the repo's releases and the docs
  site and found no milestone, dated commitment, or "what 1.0 means" statement.
  Absence of evidence; I did not exhaustively read 124 issues or the Discord.
- **Real tree-shaken bundle cost in our Vite 7 build.** My 41 KB is `gzip` over
  the shipped ESM entries, not a production chunk. Must be measured.
- **Whether `@dnd-kit/react` has been exercised against TanStack Table v9.** The
  maintainer's own example is on v8. v9 is ten days old.
- **Whether a 2D grid example exists for TanStack Virtual.** The current React
  example index does not list one;
  `/virtual/latest/docs/framework/react/examples/grid` returns 404. The
  introduction _states_ grid virtualization is achievable by composing two
  virtualizers, which is the load-bearing claim; the example is merely
  convenient.
- **Any numeric virtualization threshold from TanStack.** None published. My
  ~60–80-row figure is engineering judgement, labelled as such.
- **`@dnd-kit/react`'s behaviour under React Router 7 client-side navigations.**
  The ledger carries a scar here (`session-ledger.tsx:152-157`: an unstable
  `data` array broke Outlet rendering). A module-scope `defaultManager` plus
  per-provider managers is a plausible place for a similar surprise. Untested;
  the prototype should navigate away and back mid-session.
- **TanStack Ranger's maintenance status.** Absent from the current library
  index and at `0.0.5`, but I found no explicit deprecation notice. I read
  "quietly unlisted", not "officially dead".
- **How `pointerIntersection` behaves when a chip is dragged into the gutter**
  (a non-droppable region between cells). Should be "no target", but unverified.
- **Whether dnd-kit's `Feedback` top-layer promotion cooperates with our sticky
  headers and `z-index` stack.** Untested at 390px.

---

## Appendix — how the facts were gathered

- npm registry, 2026-08-14:
  `npm view <pkg> version dist-tags time versions dependencies peerDependencies license dist.unpackedSize --json`.
- Package internals:
  `npm pack @dnd-kit/{react,dom,abstract,collision,helpers}@0.5.0` into `/tmp`,
  untarred, then read `*.d.ts` and the dist ESM/CJS. Nothing was installed into
  this repo; `package.json` is untouched.
- SSR and import safety: a scratch `npm install` in `/tmp`
  (`@dnd-kit/react@0.5.0`, `react@19`, `react-dom@19`), a CJS `require()` probe
  in bare Node, and a `renderToString` probe. Both listed in §3.9.
- Sizes: `gzip -c <dist entry> | wc -c` on that scratch install.
- Docs: `dndkit.com` (via its `llms.txt` index and direct page fetches) and the
  raw MDX in `github.com/clauderic/dnd-kit/apps/docs/docs/**` — the MDX is the
  same content, fetched as text so quotes are exact.
- TanStack: `tanstack.com/llms.txt` and the per-library `llms.txt` indices, then
  the `.md` variants of doc pages (`…/docs/<page>.md`), which the site serves as
  clean Markdown.
- GitHub: `gh api repos/clauderic/dnd-kit`, `gh issue list`,
  `gh api .../git/trees/main?recursive=1` for the docs and stories inventory.
- Repo claims: file paths and line numbers as of the working tree on `main` at
  commit `f95e04e`, with the variant prototypes untracked.
