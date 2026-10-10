/**
 * Which day the large screen's day pane shows (ADR 0087), and how the list
 * picks it.
 *
 * **Delegated, on the list's scroller**, rather than a prop on every row: a
 * row is memoised and rendered hundreds of times (#503), and picking a day is
 * a fact about the large screen, not about the row — on a phone nothing here
 * listens at all. The row says which day it is (`data-timeline-day`); the
 * listener reads that off the event and the row never learns it was picked.
 *
 * - **A pointer** picks the day on a click anywhere in its row. Next to the
 *   pane (≥1280) any click does; with the day in a Sheet (1024–1279) only a
 *   click on the row's own surface — the date gutter, the space around the
 *   sentence — opens it, since a click on the sentence's link, `Gjort` or an
 *   empty day's "+" already does something of its own.
 * - **The keyboard**: next to the pane the pick follows focus, so tabbing
 *   through the list reads each day beside it; and `I` on any row reveals
 *   the day — it focuses the pane, or opens the Sheet.
 *
 * The picked row is marked with {@link DAY_SELECTED_ATTR}, set on the row's
 * node directly: React renders no such attribute, so it never takes it away,
 * and the memoised rows do not re-render for a pick. The list's own class
 * draws the mark.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export const DAY_SELECTED_ATTR = 'data-day-selected'
const DAY_ATTR = 'data-timeline-day'

/** What a click inside a row may land on that already does something. */
const INTERACTIVE =
	'a, button, input, textarea, select, label, summary, [role="button"], [role="menuitem"], [contenteditable="true"]'

export type DaySelectionMode = 'off' | 'pane' | 'sheet'

export function useDaySelection({
	stream,
	todayKey,
	mode,
	revision,
	onReveal,
}: {
	/** The list's scroller, where the listeners sit. */
	stream: () => HTMLElement | null
	todayKey: string
	/** `off` on a phone; `pane` beside the list; `sheet` from the right. */
	mode: DaySelectionMode
	/** Changes when the rows mounted change, so a late row gets its mark. */
	revision: unknown
	/** Show the picked day: focus the pane (the sheet opens on its own). */
	onReveal?: () => void
}) {
	const [selected, setSelected] = useState(todayKey)
	const [sheetOpen, setSheetOpen] = useState(false)
	// Today moves at midnight; a pick of the old today follows it.
	const todayRef = useRef(todayKey)
	useEffect(() => {
		setSelected((key) => (key === todayRef.current ? todayKey : key))
		todayRef.current = todayKey
	}, [todayKey])

	const revealRef = useRef(onReveal)
	revealRef.current = onReveal

	useEffect(() => {
		const el = stream()
		if (!el || mode === 'off') return
		const dayOf = (target: EventTarget | null) =>
			target instanceof Element
				? (target.closest(`[${DAY_ATTR}]`)?.getAttribute(DAY_ATTR) ?? null)
				: null
		const onClick = (event: MouseEvent) => {
			const key = dayOf(event.target)
			if (!key) return
			setSelected(key)
			if (mode !== 'sheet') return
			const hit =
				event.target instanceof Element
					? event.target.closest(INTERACTIVE)
					: null
			if (!hit || !el.contains(hit)) setSheetOpen(true)
		}
		const onFocusIn = (event: FocusEvent) => {
			const key = dayOf(event.target)
			if (key) setSelected(key)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'i' && event.key !== 'I') return
			if (event.ctrlKey || event.metaKey || event.altKey) return
			const target = event.target
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest('input, textarea, select') != null)
			) {
				return
			}
			const key = dayOf(target)
			if (!key) return
			event.preventDefault()
			setSelected(key)
			if (mode === 'sheet') setSheetOpen(true)
			else revealRef.current?.()
		}
		el.addEventListener('click', onClick)
		el.addEventListener('keydown', onKeyDown)
		// Beside the pane the pick follows focus; with the sheet, focus alone
		// must not open anything, so it only remembers the day for `I`.
		el.addEventListener('focusin', onFocusIn)
		return () => {
			el.removeEventListener('click', onClick)
			el.removeEventListener('keydown', onKeyDown)
			el.removeEventListener('focusin', onFocusIn)
		}
	}, [mode, stream])

	// The mark. Off on a phone; re-applied when rows mount, so a pick in a week
	// that mounts later is marked when it arrives.
	useEffect(() => {
		const el = stream()
		if (!el) return
		for (const node of el.querySelectorAll(`[${DAY_SELECTED_ATTR}]`)) {
			if (mode === 'off' || node.getAttribute(DAY_ATTR) !== selected) {
				node.removeAttribute(DAY_SELECTED_ATTR)
			}
		}
		if (mode === 'off') return
		el.querySelector(`[${DAY_ATTR}="${selected}"]`)?.setAttribute(
			DAY_SELECTED_ATTR,
			'',
		)
	}, [mode, revision, selected, stream])

	const select = useCallback((key: string) => setSelected(key), [])
	return { selected, select, sheetOpen, setSheetOpen }
}
