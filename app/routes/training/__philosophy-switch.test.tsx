/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import {
	PHILOSOPHY_DESCRIPTIONS,
	PHILOSOPHY_LABELS,
	PHILOSOPHY_SWITCH_LABELS,
} from '#app/utils/labels.ts'
import { type PresetFamily } from '#app/utils/plan-outline/presets.ts'
import { PhilosophyCard } from './__philosophy-switch.tsx'

function renderCard(family: PresetFamily | null) {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<PhilosophyCard
					outlineId="outline-1"
					family={family}
					preview={null}
					lastResult={undefined}
					confirmResult={undefined}
				/>
			),
		},
	])
	render(<App initialEntries={['/training/plan']} />)
}

test('the Filosofi card names the philosophy the plan follows, and what it is', async () => {
	renderCard('classic')

	// The radios below name every philosophy too; the line above them names one.
	const current = await screen.findByText(PHILOSOPHY_SWITCH_LABELS.follows, {
		exact: false,
	})
	expect(current).toHaveTextContent(
		`${PHILOSOPHY_SWITCH_LABELS.follows} ${PHILOSOPHY_LABELS.classic}`,
	)
	expect(
		screen.getAllByText(PHILOSOPHY_DESCRIPTIONS.classic).length,
	).toBeGreaterThan(0)
	expect(
		screen.queryByText(PHILOSOPHY_SWITCH_LABELS.none),
	).not.toBeInTheDocument()
})

test('a plan that follows no philosophy says so instead of showing nothing', async () => {
	renderCard(null)

	expect(
		await screen.findByText(PHILOSOPHY_SWITCH_LABELS.none),
	).toBeInTheDocument()
	expect(screen.getByText('Ingen filosofi valgt')).toBeInTheDocument()
	expect(
		screen.getByText(PHILOSOPHY_SWITCH_LABELS.noneHint),
	).toBeInTheDocument()
	expect(
		screen.queryByText(PHILOSOPHY_SWITCH_LABELS.follows, { exact: false }),
	).not.toBeInTheDocument()
	// The switch stays the way to pick one.
	expect(screen.getByText(PHILOSOPHY_SWITCH_LABELS.open)).toBeInTheDocument()
})
