/**
 * @vitest-environment jsdom
 *
 * The load-profile strip's own seam: the geometry it writes into each bar's
 * attributes (#462). React compares attribute strings, not numbers, when it
 * hydrates, so every coordinate is quantised to two decimals at the point it
 * becomes an attribute — a raw `48 - (1 / 7) * 48` must never reach the markup.
 */
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PERIODIZATION_PRESETS } from '#app/utils/plan-outline/presets.ts'
import { LoadProfile } from './__preset-gallery.tsx'

const AT_MOST_TWO_DECIMALS = /^-?\d+(\.\d{1,2})?$/

test('bar geometry is emitted rounded to two decimals', () => {
	const preset = PERIODIZATION_PRESETS[0]!
	// Values over a ceiling of 7 give sevenths: unrounded floats in every bar.
	const profile = [1, 2, 3, 4, 5, 6]
	const { container } = render(
		<LoadProfile preset={preset} profile={profile} ceiling={7} slots={6} />,
	)

	const rects = Array.from(container.querySelectorAll('svg rect'))
	expect(rects).toHaveLength(profile.length)
	for (const rect of rects) {
		for (const attr of ['x', 'y', 'width', 'height']) {
			expect(rect.getAttribute(attr)).toMatch(AT_MOST_TWO_DECIMALS)
		}
		// The bars still stand on the baseline: y + height is the strip's height.
		const y = Number(rect.getAttribute('y'))
		const height = Number(rect.getAttribute('height'))
		expect(y + height).toBeCloseTo(48, 9)
	}
	// Same positions as before, to the rounding: 48 - (1 / 7) * 48 ≈ 41.14.
	expect(rects[0]!.getAttribute('y')).toBe('41.14')
	expect(rects[0]!.getAttribute('height')).toBe('6.86')
})
