/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { NB_PROVENANCE_LABELS } from '#app/utils/labels.ts'
import PublishRoute from './catalogue.publish.$workoutId.tsx'

const NO_PROVENANCE = {
	adaptedFrom: null,
	adaptedFromTitle: null,
	adaptedFromWorkoutId: null,
}

function renderPublish(overrides: Record<string, unknown> = {}) {
	const submitted = vi.fn()
	const loaderData = {
		workout: {
			id: 'workout-1',
			title: 'My threshold session',
			description: '4 × 6 min',
			discipline: 'run',
		},
		state: { kind: 'unpublished' },
		provenance: NO_PROVENANCE,
		defaultName: 'Jo Kraas',
		currentArchetype: '',
		currentLevel: '',
		...overrides,
	}
	const App = createRoutesStub([
		{
			path: '/training/catalogue/publish/:workoutId',
			Component: (props: Record<string, unknown>) => (
				<PublishRoute {...(props as any)} />
			),
			loader: () => loaderData,
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return { result: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/catalogue/publish/workout-1']} />)
	return { submitted }
}

test('the author is shown the non-vouch and what a report can do, before publishing', async () => {
	renderPublish()

	expect(
		await screen.findByText(NB_PROVENANCE_LABELS.nonVouch),
	).toBeInTheDocument()
	expect(
		screen.getByText(/fjerner den fra katalogen for godt/i),
	).toBeInTheDocument()
})

test('the published name is a field with a default, never a silent disclosure', async () => {
	renderPublish()

	const name = await screen.findByLabelText(/publiser under navnet/i)
	expect(name).toHaveValue('Jo Kraas')
})

test('publishing sends the name and the retrieval metadata', async () => {
	const { submitted } = renderPublish({ currentArchetype: 'threshold' })

	await userEvent.click(
		await screen.findByRole('button', { name: /^publiser$/i }),
	)

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			displayName: 'Jo Kraas',
			archetype: 'threshold',
		}),
	)
})

test('a fork of a cited session is told the source stays with the original', async () => {
	renderPublish({
		provenance: {
			adaptedFrom: {
				author: 'Daniels',
				work: "Daniels' Running Formula",
				year: 2013,
				locator: null,
			},
			adaptedFromTitle: '4 × 6 min @ T',
			adaptedFromWorkoutId: 'stock-1',
		},
	})

	expect(await screen.findByText(/Hvor denne kommer fra/i)).toBeInTheDocument()
	expect(screen.getByText(/kan aldri ha en kilde/i)).toBeInTheDocument()
})

test('a published session offers withdrawal, which is the author’s own takedown', async () => {
	const { submitted } = renderPublish({
		state: {
			kind: 'published',
			attribution: {
				displayName: 'Jo Kraas',
				publishedAt: new Date('2026-08-01T10:00:00Z'),
			},
		},
	})

	await userEvent.click(
		await screen.findByRole('button', { name: /trekk tilbake fra katalogen/i }),
	)
	expect(submitted).toHaveBeenCalledWith({ intent: 'withdraw' })
})

test('a taken-down session says why, says it is permanent, and offers no publish control', async () => {
	renderPublish({
		state: {
			kind: 'taken-down',
			attribution: {
				displayName: 'Jo Kraas',
				publishedAt: new Date('2026-08-01T10:00:00Z'),
			},
			reason: 'Unsafe to train',
			at: new Date('2026-08-05T10:00:00Z'),
		},
	})

	expect(await screen.findByText(/Fjernet fra katalogen/i)).toBeInTheDocument()
	expect(screen.getByText(/Grunn: Unsafe to train/)).toBeInTheDocument()
	// The session itself is untouched — a takedown removes it from the corpus, not
	// from the athlete's training history.
	expect(screen.getByText(/fortsatt din/i)).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /publish/i }),
	).not.toBeInTheDocument()
})
