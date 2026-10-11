/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { NB_PROVENANCE_LABELS } from '#app/utils/labels.ts'
import PlaceRoute from './catalogue.place.$workoutId.tsx'

function renderPlace(
	overrides: Record<string, unknown> = {},
	entries = ['/training/catalogue/place/stock-1'],
) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/catalogue/place/:workoutId',
			Component: (props: Record<string, unknown>) => (
				<PlaceRoute {...(props as any)} />
			),
			loader: () => ({
				workoutId: 'stock-1',
				title: '4 × 6 min @ T',
				description: 'Threshold repeats',
				discipline: 'run',
				archetype: 'threshold',
				tier: 'stock',
				sourcing: {
					kind: 'corpus',
					citation: {
						author: 'Daniels',
						work: "Daniels' Running Formula",
						year: 2013,
						locator: null,
					},
				},
				today: '2026-08-13',
				...overrides,
			}),
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return null
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={entries} />)
	return { submitted }
}

test('the screen asks one question and defaults to today in the athlete’s own zone', async () => {
	renderPlace()

	const date = await screen.findByLabelText(/hvilken dag/i)
	expect(date).toHaveValue('2026-08-13')
	// The default states that it is a default, in a phrase rather than a paragraph.
	expect(
		screen.getByText(/ditt vanlige treningstidspunkt/i),
	).toBeInTheDocument()
})

test('placing sends the day the athlete picked', async () => {
	const { submitted } = renderPlace()

	const date = await screen.findByLabelText(/hvilken dag/i)
	await userEvent.clear(date)
	await userEvent.type(date, '2026-09-01')
	await userEvent.click(
		screen.getByRole('button', { name: /legg i kalenderen/i }),
	)

	expect(submitted).toHaveBeenCalledWith({ date: '2026-09-01' })
})

test('the row shows what it can source — including an uncited Stock Workout (#474)', async () => {
	renderPlace({ sourcing: { kind: 'convention' } })

	expect(
		await screen.findByText(NB_PROVENANCE_LABELS.convention),
	).toBeInTheDocument()
	// trainm8 wrote or transcribed this one, so it is not disclaimed.
	expect(
		screen.queryByText(NB_PROVENANCE_LABELS.nonVouch),
	).not.toBeInTheDocument()
})

test('a community row carries its non-vouch to the moment of placing it', async () => {
	renderPlace({
		tier: 'community',
		sourcing: {
			kind: 'community',
			attribution: {
				displayName: 'Jo Kraas',
				publishedAt: new Date('2026-08-01T10:00:00Z'),
			},
		},
	})

	expect(await screen.findByText(/Publisert av Jo Kraas/)).toBeInTheDocument()
	expect(screen.getByText(NB_PROVENANCE_LABELS.nonVouch)).toBeInTheDocument()
})

test('back and cancel return to the list the athlete filtered', async () => {
	renderPlace({}, ['/training/catalogue/place/stock-1?archetype=threshold'])

	expect(
		await screen.findByRole('link', { name: /tilbake til katalog/i }),
	).toHaveAttribute('href', '/training/catalogue?archetype=threshold')
	expect(screen.getByRole('link', { name: /avbryt/i })).toHaveAttribute(
		'href',
		'/training/catalogue?archetype=threshold',
	)
})

test('the athlete is told the copy is theirs, in one line', async () => {
	renderPlace()

	expect(
		await screen.findByText(/Endrer du den, endres ikke katalogens\./),
	).toBeInTheDocument()
})
