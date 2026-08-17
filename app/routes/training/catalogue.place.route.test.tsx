/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { COMMUNITY_NON_VOUCH } from '#app/utils/community.ts'
import { CONVENTION_SLOT_LINE } from '#app/utils/plan-generation/provenance.ts'
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

	const date = await screen.findByLabelText(/which day/i)
	expect(date).toHaveValue('2026-08-13')
	// The default states that it is a default, in a phrase rather than a paragraph.
	expect(
		screen.getByText(/scheduled at your default training time/i),
	).toBeInTheDocument()
})

test('placing sends the day the athlete picked', async () => {
	const { submitted } = renderPlace()

	const date = await screen.findByLabelText(/which day/i)
	await userEvent.clear(date)
	await userEvent.type(date, '2026-09-01')
	await userEvent.click(
		screen.getByRole('button', { name: /add to my calendar/i }),
	)

	expect(submitted).toHaveBeenCalledWith({ date: '2026-09-01' })
})

test('the row shows what it can source — including an uncited Stock Workout (#474)', async () => {
	renderPlace({ sourcing: { kind: 'convention' } })

	expect(await screen.findByText(CONVENTION_SLOT_LINE)).toBeInTheDocument()
	// trainm8 wrote or transcribed this one, so it is not disclaimed.
	expect(screen.queryByText(COMMUNITY_NON_VOUCH)).not.toBeInTheDocument()
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

	expect(await screen.findByText(/Published by Jo Kraas/)).toBeInTheDocument()
	expect(screen.getByText(COMMUNITY_NON_VOUCH)).toBeInTheDocument()
})

test('back and cancel return to the list the athlete filtered', async () => {
	renderPlace({}, ['/training/catalogue/place/stock-1?archetype=threshold'])

	expect(
		await screen.findByRole('link', { name: /back to the catalogue/i }),
	).toHaveAttribute('href', '/training/catalogue?archetype=threshold')
	expect(screen.getByRole('link', { name: /cancel/i })).toHaveAttribute(
		'href',
		'/training/catalogue?archetype=threshold',
	)
})

test('the athlete is told the copy is theirs, in one line', async () => {
	renderPlace()

	expect(
		await screen.findByText(/Editing it never changes the Catalogue's\./),
	).toBeInTheDocument()
})
