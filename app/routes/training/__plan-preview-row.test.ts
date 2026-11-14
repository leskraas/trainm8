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

/** A row and its mounted panel, opening past the fold (jsdom's 768 px). */
function rowWithPanel(key: string) {
	const row = tappedRow()
	const panel = document.createElement('div')
	panel.id = `provenance-${key}`
	panel.getBoundingClientRect = () => ({ top: 700, bottom: 800 }) as DOMRect
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
		(toggle: (key: string, row: HTMLElement) => void) => {
			// Row B's own panel opens on screen, so only A could scroll.
			const b = rowWithPanel('b')
			b.panel.getBoundingClientRect = () =>
				({ top: 100, bottom: 200 }) as DOMRect
			toggle('b', b.row)
		},
	],
])(
	'a panel %s before it finished opening is never scrolled to',
	(_, closeIt) => {
		vi.useFakeTimers()
		try {
			const { result } = renderHook(() => usePlanPreviewOpenRow())
			const a = rowWithPanel('a')
			act(() => {
				result.current.toggle('a', a.row)
			})
			act(() => {
				vi.advanceTimersByTime(COLLAPSE_OPEN_MS / 2)
			})
			act(() => {
				closeIt(result.current.toggle, a.row)
			})
			act(() => {
				vi.advanceTimersByTime(COLLAPSE_OPEN_MS)
			})
			// Its exit is still running: scrolling to it would chase a closing panel.
			expect(window.scrollBy).not.toHaveBeenCalled()
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
		act(() => {
			result.current.toggle('a', a.row)
		})
		act(() => {
			result.current.close()
		})
		act(() => {
			vi.advanceTimersByTime(COLLAPSE_OPEN_MS)
		})
		expect(window.scrollBy).not.toHaveBeenCalled()
	} finally {
		vi.useRealTimers()
	}
})

test('a panel left open is scrolled into view once it has opened', () => {
	vi.useFakeTimers()
	try {
		const { result } = renderHook(() => usePlanPreviewOpenRow())
		const a = rowWithPanel('a')
		act(() => {
			result.current.toggle('a', a.row)
		})
		act(() => {
			vi.advanceTimersByTime(COLLAPSE_OPEN_MS)
		})
		expect(window.scrollBy).toHaveBeenCalledTimes(1)
		expect(window.scrollBy).toHaveBeenCalledWith(
			expect.objectContaining({ top: 800 - window.innerHeight }),
		)
	} finally {
		vi.useRealTimers()
	}
})

test('on a phone the fold is the top of the fixed tab bar, not the bottom of the viewport', () => {
	vi.useFakeTimers()
	try {
		const bar = document.createElement('nav')
		bar.setAttribute('data-tab-bar', '')
		bar.style.position = 'fixed'
		bar.getBoundingClientRect = () => ({ top: 712 }) as DOMRect
		document.body.append(bar)
		const { result } = renderHook(() => usePlanPreviewOpenRow())
		const a = rowWithPanel('a')
		// On screen, but its last 50 px sit behind the bar.
		a.panel.getBoundingClientRect = () => ({ top: 662, bottom: 762 }) as DOMRect
		act(() => {
			result.current.toggle('a', a.row)
		})
		act(() => {
			vi.advanceTimersByTime(COLLAPSE_OPEN_MS)
		})
		expect(window.scrollBy).toHaveBeenCalledWith(
			expect.objectContaining({ top: 50 }),
		)
	} finally {
		vi.useRealTimers()
	}
})
