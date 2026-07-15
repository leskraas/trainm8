/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { deriveShapeStrip } from '#app/utils/shape-strip.ts'
import { type NotationInput } from '#app/utils/workout-notation.ts'
import { ShapeStrip } from './shape-strip.tsx'

const interval: NotationInput = {
	blocks: [
		{
			repeatCount: 1,
			steps: [{ kind: 'cardio', durationSec: 900 }],
		},
		{
			repeatCount: 3,
			steps: [
				{
					kind: 'cardio',
					durationSec: 240,
					intensity: { kind: 'zoneLabel', label: 'Z4' },
				},
				{ kind: 'rest', durationSec: 120 },
			],
		},
	],
}

test('renders one bottom-aligned segment per executed step, hidden from assistive tech', () => {
	const { container } = render(
		<ShapeStrip segments={deriveShapeStrip(interval)} />,
	)
	const strip = container.querySelector('[data-shape-strip]')!
	expect(strip).toHaveAttribute('aria-hidden', 'true')
	expect(strip.querySelectorAll('[data-shape-segment]')).toHaveLength(1 + 3 * 2)
})

test('renders nothing at all with zero paintable steps', () => {
	const { container } = render(
		<ShapeStrip
			segments={deriveShapeStrip({
				blocks: [{ repeatCount: 1, steps: [{ kind: 'cardio' }] }],
			})}
		/>,
	)
	expect(container).toBeEmptyDOMElement()
})

test('is lean: no bracket rail, no captions, no legend elements', () => {
	const { container } = render(
		<ShapeStrip segments={deriveShapeStrip(interval)} />,
	)
	expect(container.querySelector('[data-testid="profile-bracket"]')).toBeNull()
	expect(container.textContent).toBe('')
})

test('segments carry their fill, zone and height so both themes style off data attributes', () => {
	const { container } = render(
		<ShapeStrip segments={deriveShapeStrip(interval)} />,
	)
	const segments = [...container.querySelectorAll('[data-shape-segment]')]
	const z4 = segments[1]!
	expect(z4).toHaveAttribute('data-fill', 'zone')
	expect(z4).toHaveAttribute('data-zone-step', '4')
	expect(z4.getAttribute('style')).toContain('height: 82.5%')
	const rest = segments[2]!
	expect(rest).toHaveAttribute('data-fill', 'muted')
	expect(rest.getAttribute('style')).toContain('height: 16%')
})
