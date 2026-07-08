/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
	deriveWorkoutNotation,
	notationSentence,
	type NotationInput,
} from '#app/utils/workout-notation.ts'
import { TokenSentence } from './token-sentence.tsx'

// The ADR 0027 canonical interval session: warm-up, a repeated work block
// with an inline rest, cool-down.
const intervalInput: NotationInput = {
	blocks: [
		{
			name: 'warm-up',
			repeatCount: 1,
			steps: [{ kind: 'cardio', distanceM: 2000 }],
		},
		{
			name: null,
			repeatCount: 4,
			steps: [
				{
					kind: 'cardio',
					durationSec: 360,
					intensity: { kind: 'pace', minSecPerKm: 280 },
				},
				{ kind: 'rest', durationSec: 60 },
			],
		},
		{ name: 'cool-down', repeatCount: 1, steps: [{ kind: 'cardio' }] },
	],
}

test('renders the model’s sentence verbatim — separators and parens come from the notation, not the component', () => {
	const notation = deriveWorkoutNotation(intervalInput)
	render(<TokenSentence notation={notation} />)

	const sentence = document.querySelector('[data-token-sentence]')
	expect(sentence).toHaveTextContent(
		'2 km warm-up → 4 × 6 min @ 4:40 /km (1 min rest) → cool-down',
	)
	// The rendered text is exactly the plain-text serialization.
	expect(sentence?.textContent).toBe(notationSentence(notation))
})

test('tokens are real labelled elements, one per token, typed for styling and the later editor slice', () => {
	render(<TokenSentence notation={deriveWorkoutNotation(intervalInput)} />)

	// Each value is its own element, findable by its visible text.
	expect(screen.getByText('2 km')).toHaveAttribute(
		'data-token-type',
		'quantity',
	)
	expect(screen.getByText('4')).toHaveAttribute('data-token-type', 'repeat')
	expect(screen.getByText('4:40 /km')).toHaveAttribute(
		'data-token-type',
		'intensity',
	)
	expect(screen.getByText('1 min rest')).toHaveAttribute(
		'data-token-type',
		'rest',
	)
	expect(screen.getByText('warm-up')).toHaveAttribute(
		'data-token-type',
		'label',
	)
})

test('is inert by default: no interactive elements anywhere in the sentence', () => {
	render(<TokenSentence notation={deriveWorkoutNotation(intervalInput)} />)

	const sentence = document.querySelector('[data-token-sentence]')!
	expect(
		sentence.querySelectorAll('button, a, input, [role="button"], [tabindex]'),
	).toHaveLength(0)
})

test('a notes marker reads its note text to screen readers, not just an asterisk', () => {
	const notation = deriveWorkoutNotation({
		blocks: [
			{
				name: null,
				repeatCount: 1,
				steps: [{ kind: 'cardio', distanceM: 2000, notes: 'strides after' }],
			},
		],
	})
	render(<TokenSentence notation={notation} />)

	const marker = document.querySelector('[data-token-type="notes"]')
	expect(marker).toHaveTextContent('*')
	expect(marker).toHaveTextContent(/strides after/)
})

test('the renderToken hook wraps each token’s default rendering (the 4/9 editor seam)', () => {
	render(
		<TokenSentence
			notation={deriveWorkoutNotation(intervalInput)}
			renderToken={(segment, children) => (
				<span data-wrapped={segment.token.type}>{children}</span>
			)}
		/>,
	)

	const wrapped = document.querySelectorAll('[data-wrapped]')
	const tokens = document.querySelectorAll('[data-token-type]')
	expect(wrapped).toHaveLength(tokens.length)
	expect(wrapped.length).toBeGreaterThan(0)
	// The default token element still renders inside the wrapper.
	expect(
		document.querySelector(
			'[data-wrapped="repeat"] [data-token-type="repeat"]',
		),
	).toHaveTextContent('4')
})

test('an empty notation renders nothing at all', () => {
	const { container } = render(
		<TokenSentence notation={deriveWorkoutNotation({ blocks: [] })} />,
	)
	expect(container).toBeEmptyDOMElement()
})
