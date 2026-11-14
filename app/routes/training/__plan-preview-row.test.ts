/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { COLLAPSE_OPEN_MS } from '#app/utils/motion.ts'
import { holdInPlace, usePlanPreviewOpenRow } from './__plan-preview-row.tsx'

let frames: FrameRequestCallback[] = []
let top = 300

function flushFrames() {
	while (frames.length > 0) {
		const pending = frames
		frames = []
		for (const frame of pending) frame(0)
	}
}

function tappedRow() {
	const row = document.createElement('button')
	row.getBoundingClientRect = () => ({ top }) as DOMRect
	document.body.append(row)
	return row
}

beforeEach(() => {
	frames = []
	top = 300
	vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => {
		frames.push(frame)
		return frames.length
	})
	window.scrollBy = vi.fn() as typeof window.scrollBy
})

afterEach(() => {
	document.body.replaceChildren()
})

test('the tapped row is held where it was while the panel above closes', () => {
	holdInPlace(tappedRow())
	// The panel above snaps shut: the row rises by its height.
	top = 180
	flushFrames()
	expect(window.scrollBy).toHaveBeenCalledWith({
		top: -120,
		behavior: 'instant',
	})
})

test.each(['pointerdown', 'wheel', 'keydown'])(
	'the hold lets go once the athlete scrolls (%s)',
	(event) => {
		holdInPlace(tappedRow())
		window.dispatchEvent(new Event(event))
		// The athlete's own flick moves the row: the hold never pulls it back.
		top = 40
		flushFrames()
		expect(window.scrollBy).not.toHaveBeenCalled()
	},
)

/** A row and its mounted panel, whose scroll into view is watched. */
function rowWithPanel(key: string) {
	const row = tappedRow()
	const panel = document.createElement('div')
	panel.id = `provenance-${key}`
	panel.scrollIntoView = vi.fn()
	document.body.append(panel)
	return { row, panel }
}

test.each([
	[
		'closed again',
		(toggle: (key: string, row: HTMLElement) => void, a: HTMLElement) =>
			toggle('a', a),
	],
	[
		'closed by another row',
		(toggle: (key: string, row: HTMLElement) => void) =>
			toggle('b', rowWithPanel('b').row),
	],
])(
	'a panel %s before it finished opening is never scrolled to',
	(_, closeIt) => {
		vi.useFakeTimers()
		try {
			const { result } = renderHook(() => usePlanPreviewOpenRow())
			const a = rowWithPanel('a')
			act(() => result.current.toggle('a', a.row))
			act(() => vi.advanceTimersByTime(COLLAPSE_OPEN_MS / 2))
			act(() => closeIt(result.current.toggle, a.row))
			act(() => vi.advanceTimersByTime(COLLAPSE_OPEN_MS))
			// Its exit is still running: scrolling to it would chase a closing panel.
			expect(a.panel.scrollIntoView).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	},
)

test('Escape before a panel finished opening cancels its scroll into view', () => {
	vi.useFakeTimers()
	try {
		const { result } = renderHook(() => usePlanPreviewOpenRow())
		const a = rowWithPanel('a')
		act(() => result.current.toggle('a', a.row))
		act(() => result.current.close())
		act(() => vi.advanceTimersByTime(COLLAPSE_OPEN_MS))
		expect(a.panel.scrollIntoView).not.toHaveBeenCalled()
	} finally {
		vi.useRealTimers()
	}
})

test('a panel left open is scrolled into view once it has opened', () => {
	vi.useFakeTimers()
	try {
		const { result } = renderHook(() => usePlanPreviewOpenRow())
		const a = rowWithPanel('a')
		act(() => result.current.toggle('a', a.row))
		act(() => vi.advanceTimersByTime(COLLAPSE_OPEN_MS))
		expect(a.panel.scrollIntoView).toHaveBeenCalledTimes(1)
	} finally {
		vi.useRealTimers()
	}
})
