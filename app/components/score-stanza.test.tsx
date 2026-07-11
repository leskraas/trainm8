/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
	deriveWorkoutNotation,
	type NotationInput,
} from '#app/utils/workout-notation.ts'
import { ScoreStanza } from './score-stanza.tsx'

// The ADR 0027 canonical interval session: warm-up, a repeated work block
// with an inline rest, cool-down — now rendered as the Score stanza (#251).
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
	],
}

test('one block per line: each block is a row with a gutter, no arrows between blocks', () => {
	render(<ScoreStanza notation={deriveWorkoutNotation(intervalInput)} />)

	const lines = document.querySelectorAll('[data-stanza-line]')
	expect(lines).toHaveLength(2)
	// Steps within a line still join with the step arrow; blocks never do —
	// the line break IS the block boundary.
	expect(lines[0]!.textContent).not.toContain('→')
	// The work line reads: 6 min, chip, inline rest in parens.
	expect(lines[1]).toHaveTextContent('6 min')
	expect(lines[1]).toHaveTextContent('(1 min rest)')
})

test('repeat renders only as the gutter badge — repeat parentheses leave the line', () => {
	render(<ScoreStanza notation={deriveWorkoutNotation(intervalInput)} />)

	const badge = document.querySelector(
		'[data-stanza-gutter] [data-token-type="repeat"]',
	)
	expect(badge).toHaveTextContent('4×')
	// No repeat group parens anywhere: the only parens are the rest step's.
	const stanza = document.querySelector('[data-score-stanza]')!
	expect(stanza.textContent!.match(/\(/g)).toHaveLength(1)
	expect(stanza).toHaveTextContent('(1 min rest)')
})

test('block names never render on the line (G2)', () => {
	render(<ScoreStanza notation={deriveWorkoutNotation(intervalInput)} />)
	expect(screen.queryByText('warm-up')).not.toBeInTheDocument()
	expect(
		document.querySelector('[data-token-type="label"]'),
	).not.toBeInTheDocument()
})

test('the intensity chip carries the authored value, tinted by its zone-equivalent step', () => {
	const notation = deriveWorkoutNotation(
		{
			blocks: [
				{
					name: null,
					repeatCount: 1,
					steps: [
						{
							kind: 'cardio',
							discipline: 'bike',
							durationSec: 1200,
							intensity: { kind: 'powerPct', minPct: 95, maxPct: 105 },
						},
					],
				},
			],
		},
		{
			thresholds: {
				bike: {
					lthr: null,
					maxHr: null,
					ftp: 250,
					thresholdPaceSecPerKm: null,
					cssSecPer100m: null,
					zoneSystem: 'coggan-power-7',
					zoneOverrides: null,
				},
			},
		},
	)
	render(<ScoreStanza notation={notation} />)

	const chip = document.querySelector('[data-token-type="intensity"]')
	expect(chip).toHaveTextContent('95–105% FTP')
	expect(chip).toHaveAttribute('data-zone-step', '4')
	expect(chip).not.toHaveAttribute('data-unresolved')
})

test('an unresolvable intensity renders the same chip dashed — no asterisk, no zoneLabel internals', () => {
	// No thresholds at all: the %FTP target cannot be placed in a zone.
	const notation = deriveWorkoutNotation({
		blocks: [
			{
				name: null,
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						durationSec: 1200,
						intensity: { kind: 'powerPct', minPct: 95, maxPct: 105 },
					},
				],
			},
		],
	})
	render(<ScoreStanza notation={notation} />)

	const chip = document.querySelector('[data-token-type="intensity"]')
	expect(chip).toHaveTextContent('95–105% FTP')
	expect(chip).toHaveAttribute('data-unresolved')
	const stanza = document.querySelector('[data-score-stanza]')!
	expect(stanza.textContent).not.toContain('*')
	expect(stanza.textContent).not.toContain('zoneLabel')
})

test('notes render italic-quoted note text — never an asterisk marker', () => {
	const notation = deriveWorkoutNotation({
		blocks: [
			{
				name: null,
				repeatCount: 1,
				steps: [{ kind: 'cardio', distanceM: 2000, notes: 'strides after' }],
			},
		],
	})
	render(<ScoreStanza notation={notation} />)

	const note = document.querySelector('[data-token-type="notes"]')
	expect(note).toHaveTextContent('“strides after”')
	expect(
		document.querySelector('[data-score-stanza]')!.textContent,
	).not.toContain('*')
})

test('strength rest-between-sets folds in with a mid-dot — parens stay reserved for rest steps', () => {
	const notation = deriveWorkoutNotation({
		blocks: [
			{
				name: null,
				repeatCount: 1,
				steps: [
					{
						kind: 'strength',
						exerciseName: 'Back squat',
						sets: [{ kind: 'reps', reps: 5, weightKg: 80 }],
						restBetweenSetsSec: 150,
					},
				],
			},
		],
	})
	render(<ScoreStanza notation={notation} />)

	const stanza = document.querySelector('[data-score-stanza]')!
	expect(stanza).toHaveTextContent('Back squat')
	expect(stanza).toHaveTextContent('1 × 5 @ 80 kg')
	expect(stanza).toHaveTextContent(/·\s*2 min 30 s rest/)
	expect(stanza.textContent).not.toContain('(')
})

test('is inert by default: no interactive elements and no grip chrome', () => {
	render(<ScoreStanza notation={deriveWorkoutNotation(intervalInput)} />)

	const stanza = document.querySelector('[data-score-stanza]')!
	expect(
		stanza.querySelectorAll('button, a, input, [role="button"], [tabindex]'),
	).toHaveLength(0)
	expect(stanza.querySelector('[data-stanza-grip]')).not.toBeInTheDocument()
})

test('the renderToken hook wraps every token — including the gutter repeat badge — and shows the grip', () => {
	render(
		<ScoreStanza
			notation={deriveWorkoutNotation(intervalInput)}
			renderToken={(segment, children) => (
				<span data-wrapped={segment.token.type}>{children}</span>
			)}
		/>,
	)

	const wrapped = document.querySelectorAll('[data-wrapped]')
	const tokens = document.querySelectorAll('[data-token-type]')
	expect(wrapped).toHaveLength(tokens.length)
	expect(
		document.querySelector(
			'[data-wrapped="repeat"] [data-token-type="repeat"]',
		),
	).toHaveTextContent('4×')
	expect(document.querySelector('[data-stanza-grip]')).toBeInTheDocument()
})

test('an empty notation renders nothing at all', () => {
	const { container } = render(
		<ScoreStanza notation={deriveWorkoutNotation({ blocks: [] })} />,
	)
	expect(container).toBeEmptyDOMElement()
})
