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
	expect(lines[1]).toHaveTextContent('(1 min pause)')
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
	expect(stanza).toHaveTextContent('(1 min pause)')
})

test('a block in series badges its series and its reps as two badges, outer first (#466)', () => {
	render(
		<ScoreStanza
			notation={deriveWorkoutNotation({
				blocks: [
					{
						repeatCount: 13,
						seriesRepeatCount: 3,
						betweenSeriesRestSec: 600,
						steps: [
							{ kind: 'cardio', durationSec: 30 },
							{ kind: 'rest', durationSec: 15 },
						],
					},
				],
			})}
		/>,
	)

	const gutter = document.querySelector('[data-stanza-gutter]')!
	const badges = gutter.querySelectorAll('[data-token-type]')
	expect([...badges].map((b) => b.getAttribute('data-token-type'))).toEqual([
		'series',
		'repeat',
	])
	// Seen as `3×`, heard as what it is — two `×` badges side by side would
	// otherwise read as one number times another.
	expect(badges[0]!.querySelector('[aria-hidden]')).toHaveTextContent(/^3×$/)
	expect(badges[0]).toHaveTextContent('3 serier')
	expect(badges[1]).toHaveTextContent(/^13×$/)

	// The rest between series closes the line, in a rest's inks.
	const line = document.querySelector('[data-stanza-line]')!
	const seriesRest = line.querySelector('[data-series-rest]')!
	expect(seriesRest).toHaveTextContent('(10 min seriepause)')
	expect(seriesRest.querySelector('.font-semibold')).toHaveTextContent(
		/^10 min$/,
	)
})

test('a block repeated only in series badges the series and nothing else', () => {
	render(
		<ScoreStanza
			notation={deriveWorkoutNotation({
				blocks: [
					{
						repeatCount: 1,
						seriesRepeatCount: 3,
						steps: [{ kind: 'cardio', durationSec: 600 }],
					},
				],
			})}
		/>,
	)
	const gutter = document.querySelector('[data-stanza-gutter]')!
	expect(gutter.querySelector('[data-token-type="series"]')).not.toBeNull()
	expect(gutter.querySelector('[data-token-type="repeat"]')).toBeNull()
	expect(document.querySelector('[data-series-rest]')).toBeNull()
})

test('cadence and grade draw on the step after a facet dot, the figure weighing and the word quiet (#466)', () => {
	render(
		<ScoreStanza
			notation={deriveWorkoutNotation({
				blocks: [
					{
						repeatCount: 1,
						steps: [
							{
								kind: 'cardio',
								discipline: 'bike',
								durationSec: 300,
								gradePctMin: 4,
								gradePctMax: 7,
								cadenceRpmMin: 50,
								cadenceRpmMax: 60,
							},
						],
					},
				],
			})}
		/>,
	)

	const step = document.querySelector('[data-stanza-step]')!
	// Tokens are spaced by the layout's gap, not by text.
	expect(step.textContent).toBe('5 min·4–7 % motbakke·50–60 rpm')
	const grade = step.querySelector('[data-token-type="grade"]')!
	expect(grade.querySelector('.font-semibold')).toHaveTextContent(/^4–7 %$/)
	expect(grade).toHaveTextContent('4–7 % motbakke')
	const cadence = step.querySelector('[data-token-type="cadence"]')!
	expect(cadence.querySelector('.font-semibold')).toHaveTextContent(/^50–60$/)
	expect(cadence).toHaveTextContent('50–60 rpm')
})

test('a cadence ladder reads as four different rungs, not four identical steps', () => {
	render(
		<ScoreStanza
			notation={deriveWorkoutNotation({
				blocks: [
					{
						repeatCount: 1,
						steps: [70, 85, 100, 115].map((rpm) => ({
							kind: 'cardio' as const,
							durationSec: 120,
							cadenceRpmMin: rpm,
							cadenceRpmMax: rpm,
						})),
					},
				],
			})}
		/>,
	)
	const rungs = [...document.querySelectorAll('[data-stanza-step]')].map(
		(step) => step.textContent,
	)
	expect(new Set(rungs).size).toBe(4)
})

test('a step that states only a cadence has no dangling dot', () => {
	render(
		<ScoreStanza
			notation={deriveWorkoutNotation({
				blocks: [
					{ repeatCount: 1, steps: [{ kind: 'cardio', cadenceRpmMin: 90 }] },
				],
			})}
		/>,
	)
	const step = document.querySelector('[data-stanza-step]')!
	expect(step.textContent).toBe('≥ 90 rpm')
})

test('a rest value takes the semibold ink and its word recedes (ADR 0089: the word is `pause`)', () => {
	render(<ScoreStanza notation={deriveWorkoutNotation(intervalInput)} />)

	const rest = document.querySelector('[data-token-type="rest"]')!
	expect(rest).toHaveTextContent('1 min pause')
	expect(rest.querySelector('.font-semibold')).toHaveTextContent(/^1 min$/)
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
					runPowerThresholdW: null,
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

test('a long note wraps in full — never cut with "…" (#505 story 32)', () => {
	const long =
		'Steady aerobic effort, conversational the whole way; walk the hills if the heart rate climbs'
	const notation = deriveWorkoutNotation({
		blocks: [
			{
				name: null,
				repeatCount: 1,
				steps: [{ kind: 'cardio', distanceM: 2000, notes: long }],
			},
		],
	})
	render(<ScoreStanza notation={notation} />)

	const note = document.querySelector('[data-token-type="notes"]')!
	expect(note).toHaveTextContent(long)
	// The cut was a class, not the text: `truncate` and a 11ch/22ch cap.
	expect(note.className).not.toMatch(/truncate|max-w-\[/)
	expect(note.className).toContain('whitespace-normal')
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
	expect(stanza).toHaveTextContent(/·\s*2 min 30 s pause/)
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

test('the chrome seams: renderGrip replaces the inert mark, renderStepChrome leads every step, lineProps reach the line', () => {
	render(
		<ScoreStanza
			notation={deriveWorkoutNotation(intervalInput)}
			renderToken={(_segment, children) => <>{children}</>}
			renderGrip={(blockIndex) => (
				<button type="button" data-test-grip={blockIndex}>
					⠿
				</button>
			)}
			renderStepChrome={(blockIndex, step) => (
				<button
					type="button"
					data-test-step-chrome={`${blockIndex}-${step.stepIndex}`}
				>
					⋮
				</button>
			)}
			lineProps={(blockIndex) => ({ 'data-test-line': String(blockIndex) })}
		/>,
	)

	// The interactive grip renders instead of the inert aria-hidden mark.
	expect(document.querySelectorAll('[data-test-grip]')).toHaveLength(2)
	expect(document.querySelector('[data-stanza-grip]')).not.toBeInTheDocument()
	// Every step leads with its chrome — cardio and rest alike (G4).
	const chrome = document.querySelectorAll('[data-test-step-chrome]')
	expect(chrome).toHaveLength(3)
	expect(
		document.querySelector('[data-stanza-step][data-step-kind="rest"]')!
			.firstElementChild,
	).toHaveAttribute('data-test-step-chrome', '1-1')
	// Line attributes pass through to the block rows.
	expect(document.querySelectorAll('[data-test-line]')).toHaveLength(2)
})

test('an empty notation renders nothing at all', () => {
	const { container } = render(
		<ScoreStanza notation={deriveWorkoutNotation({ blocks: [] })} />,
	)
	expect(container).toBeEmptyDOMElement()
})
