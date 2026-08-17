/**
 * PROTOTYPE — the entire `@dnd-kit/react` surface for the plan calendar.
 *
 * Every `@dnd-kit/*` import in the app lives here, on purpose. The package is
 * pinned to an exact `0.5.0` (no caret) because it is pre-1.0 and `0.4.x →
 * 0.5.0` moved the API in April→June 2026; keeping the whole surface behind one
 * module means a breaking minor is a one-file edit, not a variant-wide rewrite.
 * Consumers see day cells, chips and announcements — never a `DragDropProvider`,
 * a `Sortable` or a `CollisionPriority`.
 *
 * Three things arrive for free from the default plugin preset
 * (`[ScrollListener, Scroller, StyleInjector, Accessibility, AutoScroller,
 * Cursor, Feedback, PreventSelection]`) and each replaces hand-rolled code:
 *
 * - **Feedback** promotes the dragged chip to the top layer and moves it with
 *   the pointer. The hand-rolled gesture only lit up the landing cell, which is
 *   why it never felt like dragging.
 * - The **collision observer** re-measures droppable shapes and listens to
 *   scroll, so a mid-drag scroll no longer misdrops the way a `[data-day]` rect
 *   cache taken at drag start did.
 * - **Accessibility** appends a real `role="status" aria-live="polite"` region
 *   to `document.body`; the calendar's keyboard moves used to be silent.
 *
 * Chips are `useSortable`, not `useDraggable`, for one source-derived reason:
 * `SortableKeyboardPlugin` (`@dnd-kit/dom/sortable.js`) is registered by default
 * for every sortable and overrides the documented 10px-per-arrow-press model
 * with "closest droppable in the pressed direction, freshly measured, at least
 * 20% visible" plus `scrollIntoViewIfNeeded`. One arrow press is therefore one
 * day cell — the behaviour a calendar wants — and a `useDraggable` chip would
 * need five presses to cross a 46px column.
 *
 * THROWAWAY — do not ship.
 */
import { type Plugins } from '@dnd-kit/abstract'
import {
	Accessibility,
	PointerActivationConstraints,
	type DragDropManager,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
} from '@dnd-kit/dom'
import {
	DragDropProvider,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
} from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	type ReactNode,
} from 'react'
import { type Day } from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/** What a day cell and a chip both carry, so a drop reads domain values. */
type CellData = { weekIndex: number; day: Day }

/**
 * The droppable id of one day cell, which is also the sortable `group` of every
 * chip sitting in it — dnd-kit's documented multi-container identity.
 */
function dayCellId(weekIndex: number, day: Day): string {
	return `w${weekIndex}-${day}`
}

/**
 * **The same-week constraint, expressed structurally.**
 *
 * A chip in week 3 is typed `chip-w3` and only targets whose `accept` is
 * `chip-w3` will take it — that is, the seven day cells of week 3. A cross-week
 * drop is impossible by
 * construction: no predicate runs, no guard fires, and the keyboard plugin
 * (which filters on `droppable.accepts(source)`) will not even offer another
 * week's cell as an arrow-key target.
 *
 * To allow cross-week drops later, return the constant `'chip'` here. That is
 * the whole library-side change — but it is not the whole change: `rebalance`
 * runs per (week, track), so a cross-week move re-solves *two* weeks and moves
 * volume between them, changing both week totals. That is a domain decision
 * (ADR 0040/0043 territory: does the session carry its volume across, or does
 * the target week absorb and re-scale?) and must be answered before the
 * affordance is offered.
 */
function chipType(weekIndex: number): string {
	return `chip-w${weekIndex}`
}

/* -------------------------------------------------------------------------- */
/* Announcements                                                              */
/* -------------------------------------------------------------------------- */

/** One drag, in the caller's vocabulary. `toDay` is null over dead space. */
export type ChipDrag = {
	chipKey: string
	weekIndex: number
	fromDay: Day
	toDay: Day | null
}

/**
 * The four sentences a screen reader hears. dnd-kit's defaults read internal
 * ids ("Picked up draggable item 3-run-0"), which is noise to an athlete, so
 * every string is the caller's — including the one dnd-kit cannot know, that a
 * drop re-sizes the sessions on the crowded day while the week total holds.
 */
export type ChipDragAnnouncements = {
	pickup: (drag: ChipDrag) => string | undefined
	over: (drag: ChipDrag) => string | undefined
	drop: (drag: ChipDrag & { moved: boolean }) => string | undefined
	cancel: (drag: ChipDrag) => string | undefined
}

const AnnounceContext = createContext<(message: string) => void>(() => {})

/**
 * Announce a move that did not come from a drag — the arrow-key nudge and the
 * day-picker row. dnd-kit's live region only knows about drag operations, and
 * those two paths are the non-drag fallbacks, so they get their own region.
 * Never both for one action.
 */
export function useMoveAnnouncer(): (message: string) => void {
	return useContext(AnnounceContext)
}

/* -------------------------------------------------------------------------- */
/* The provider                                                               */
/* -------------------------------------------------------------------------- */

type PlanDragAreaProps = {
	announcements: ChipDragAnnouncements
	/** Commit a drop. Only called when the chip actually changed weekday. */
	onChipMoved: (chipKey: string, day: Day) => void
	children: ReactNode
}

/**
 * Wrap the calendar. Chips inside it call `useChipDrag`, day cells
 * `useDayCell`; nothing else needs to know a drag library exists.
 */
export function PlanDragArea({
	announcements,
	onChipMoved,
	children,
}: PlanDragAreaProps) {
	const liveRef = useRef<HTMLDivElement>(null)

	// The plugin array is built once and reads through refs. `DragDropProvider`
	// deep-compares `plugins` and re-registers on change, and re-registering
	// Accessibility rebuilds its live region — so the descriptor must be stable
	// even though the caller's closures are not.
	const latest = useRef(announcements)
	latest.current = announcements
	const commit = useRef(onChipMoved)
	commit.current = onChipMoved

	const plugins = useMemo(() => {
		const accessibility = Accessibility.configure({
			// 500ms is the default and makes an arrow press feel unacknowledged.
			debounce: 200,
			screenReaderInstructions: {
				draggable:
					'To pick up a session, press space. Use the left and right arrow keys to move it to another weekday in the same week. Press space to drop it, or escape to cancel.',
			},
			announcements: {
				dragstart: (event: DragStartEvent) => {
					const drag = readDrag(event.operation)
					return drag ? latest.current.pickup(drag) : undefined
				},
				dragover: (event: DragOverEvent) => {
					const drag = readDrag(event.operation)
					// dnd-kit issue #2120: `dragover` fires immediately after
					// `dragstart` in sortables, so suppress the no-op announcement.
					if (!drag || drag.toDay === null || drag.toDay === drag.fromDay) {
						return undefined
					}
					return latest.current.over(drag)
				},
				dragend: (event: DragEndEvent) => {
					const drag = readDrag(event.operation)
					if (!drag) return undefined
					if (event.canceled) return latest.current.cancel(drag)
					return latest.current.drop({
						...drag,
						moved: drag.toDay !== null && drag.toDay !== drag.fromDay,
					})
				},
			},
		})
		// The function form extends the default preset. A plain array would
		// replace it and silently delete the live region and the auto-scroller.
		return (defaults: Plugins<DragDropManager>) => [...defaults, accessibility]
	}, [])

	// A mouse needs 5px before it drags, which is what the hand-rolled gesture
	// used and what keeps a plain click a selection rather than a zero-distance
	// drag. Touch keeps dnd-kit's 250ms long-press, so a finger landing on a
	// chip can still scroll a 20-row calendar.
	const sensors = useMemo(
		() => [
			PointerSensor.configure({
				activationConstraints: (event) =>
					event.pointerType === 'touch'
						? [
								new PointerActivationConstraints.Delay({
									value: 250,
									tolerance: 5,
								}),
							]
						: [new PointerActivationConstraints.Distance({ value: 5 })],
			}),
			KeyboardSensor,
		],
		[],
	)

	const announce = useCallback((message: string) => {
		if (liveRef.current) liveRef.current.textContent = message
	}, [])

	return (
		<DragDropProvider
			plugins={plugins}
			sensors={sensors}
			// Refuse every optimistic sort. `OptimisticSortingPlugin` (a default
			// per-sortable plugin) re-parents the dragged element in the DOM as it
			// passes over an occupied cell; the chips are React-owned children of
			// their day cell, and the next render then tries to `removeChild` a node
			// that is no longer where React left it — a hard "NotFoundError: The node
			// to be removed is not a child of this node" crash into the error
			// boundary, reproducible by dragging past a day that already has a
			// session. We do not want the optimism anyway: the drop payload is
			// `(chipKey → weekday)` with no ordering, and `applyMoves` re-derives the
			// whole season on drop. The docs name `preventDefault` here as the way to
			// block it.
			onDragOver={(event) => event.preventDefault()}
			onDragEnd={(event) => {
				if (event.canceled) return
				const drag = readDrag(event.operation)
				if (!drag || drag.toDay === null) return
				// Belt and braces; `chipType` already makes this unreachable.
				if (drag.toDay === drag.fromDay) return
				commit.current(drag.chipKey, drag.toDay)
			}}
		>
			<AnnounceContext.Provider value={announce}>
				{/* Non-drag moves announce here; drag operations announce in
				    dnd-kit's own body-appended region. Empty on the server. */}
				<div
					ref={liveRef}
					role="status"
					aria-live="polite"
					className="sr-only"
				/>
				{children}
			</AnnounceContext.Provider>
		</DragDropProvider>
	)
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Make one chip draggable. `index` is its position inside its day cell —
 * `useSortable` requires one, even though a chip's position within a day is not
 * meaningful state (the drop payload is `(chipKey → weekday)` and nothing else).
 */
export function useChipDrag(input: {
	chipKey: string
	weekIndex: number
	day: Day
	index: number
}): { ref: (element: Element | null) => void; isDragging: boolean } {
	const { chipKey, weekIndex, day, index } = input
	const { ref, isDragging } = useSortable<CellData>({
		id: chipKey,
		index,
		group: dayCellId(weekIndex, day),
		type: chipType(weekIndex),
		// A chip is a drag source only, never a drop target. A `Sortable` is a
		// draggable *and* a droppable by default, and a droppable chip breaks the
		// keyboard grammar: collisions resolve by priority before distance, so a
		// chip (Normal) anywhere in the pressed direction outranks every empty day
		// cell, and one arrow press jumped Tue → Thu → Sat, skipping the empty days.
		// Turning the droppable half off leaves the seven day cells as the only
		// targets, so one press is one weekday. Nothing is lost: the drop payload is
		// `(chipKey → weekday)` with no position inside the day to resolve.
		disabled: { droppable: true },
		data: { weekIndex, day },
	})
	return { ref, isDragging }
}

/**
 * Make one weekday cell a drop target. `isLanding` is where the chip would
 * land: a cell is the whole target, so an occupied cell highlights like an empty
 * one. It is a two-axis hit-test, unlike the x-only `clientX >= rect.left` it
 * replaces, and it survives a mid-drag scroll because dnd-kit re-measures the
 * shape instead of caching a rect at drag start.
 */
export function useDayCell(input: { weekIndex: number; day: Day }): {
	ref: (element: Element | null) => void
	isLanding: boolean
} {
	const { weekIndex, day } = input
	const { ref, isDropTarget } = useDroppable<CellData>({
		id: dayCellId(weekIndex, day),
		type: 'day-cell',
		accept: chipType(weekIndex),
		// No `collisionPriority`: the day cells are the only drop targets (chips are
		// drag-source-only, see `useChipDrag`), so every candidate sits at the same
		// priority and collisions resolve purely by distance — which is what both
		// the pointer hit-test and the keyboard's `closestCorners` want.
		data: { weekIndex, day },
	})
	return { ref, isLanding: isDropTarget }
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

type Operation = {
	source?: { id: string | number; data?: unknown } | null
	target?: { data?: unknown } | null
}

/** Read a drag as domain values. Both ends carry `{weekIndex, day}`. */
function readDrag(operation: Operation): ChipDrag | null {
	const source = operation.source
	const from = source?.data as CellData | undefined
	if (!source || !from) return null
	// The source's `day` is where the chip was rendered, i.e. where the drag
	// started: state only changes on drop, so it never drifts mid-drag.
	const to = operation.target?.data as CellData | undefined
	return {
		chipKey: String(source.id),
		weekIndex: from.weekIndex,
		fromDay: from.day,
		toDay: to?.weekIndex === from.weekIndex ? (to?.day ?? null) : null,
	}
}
