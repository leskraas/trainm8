/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { holdInPlace } from './__plan-preview-row.tsx'

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
