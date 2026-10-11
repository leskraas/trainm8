/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { NB_PROVENANCE_LABELS } from '#app/utils/labels.ts'
import ReportRoute from './catalogue.report.$workoutId.tsx'

function renderReport(
	loaderData: Record<string, unknown> = {
		workout: {
			id: 'community-1',
			title: 'My double threshold day',
			discipline: 'run',
		},
		attribution: {
			displayName: 'Jo Kraas',
			publishedAt: new Date('2026-08-01T10:00:00Z'),
		},
		alreadyReported: false,
	},
) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/catalogue/report/:workoutId',
			Component: (props: Record<string, unknown>) => (
				<ReportRoute {...(props as any)} />
			),
			loader: () => loaderData,
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return { result: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/catalogue/report/community-1']} />)
	return { submitted }
}

test('the screen states both halves of what a report does', async () => {
	renderReport()

	expect(
		await screen.findByText(/skjuler økta i katalogen din/i),
	).toBeInTheDocument()
	// The half that keeps reporting safe to give to everybody: it is not a
	// unilateral takedown of somebody else's work.
	expect(
		screen.getByText(/fjerner den ikke for noen andre/i),
	).toBeInTheDocument()
})

test('the non-vouch travels with the row onto the report screen', async () => {
	renderReport()

	expect(
		await screen.findByText(NB_PROVENANCE_LABELS.nonVouch),
	).toBeInTheDocument()
	expect(screen.getByText(/Publisert av Jo Kraas/)).toBeInTheDocument()
})

test('a reason is picked from the closed vocabulary and sent with the report', async () => {
	const { submitted } = renderReport()

	await userEvent.click(
		await screen.findByRole('radio', { name: /utrygg å trene/i }),
	)
	await userEvent.click(screen.getByRole('button', { name: /send rapport/i }))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({ reason: 'unsafe' }),
	)
})

test('an athlete who already reported it is told, rather than asked again', async () => {
	renderReport({
		workout: { id: 'community-1', title: 'A session', discipline: 'run' },
		attribution: null,
		alreadyReported: true,
	})

	expect(
		await screen.findByText(/allerede rapportert denne økta/i),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /send rapport/i }),
	).not.toBeInTheDocument()
})
