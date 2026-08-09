/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { COMMUNITY_NON_VOUCH } from '#app/utils/community.ts'
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
		await screen.findByText(/hides this session from your Catalogue/i),
	).toBeInTheDocument()
	// The half that keeps reporting safe to give to everybody: it is not a
	// unilateral takedown of somebody else's work.
	expect(
		screen.getByText(/does not remove it for anybody else/i),
	).toBeInTheDocument()
})

test('the non-vouch travels with the row onto the report screen', async () => {
	renderReport()

	expect(await screen.findByText(COMMUNITY_NON_VOUCH)).toBeInTheDocument()
	expect(screen.getByText(/Published by Jo Kraas/)).toBeInTheDocument()
})

test('a reason is picked from the closed vocabulary and sent with the report', async () => {
	const { submitted } = renderReport()

	await userEvent.click(await screen.findByLabelText(/unsafe to train/i))
	await userEvent.click(screen.getByRole('button', { name: /send report/i }))

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
		await screen.findByText(/already reported this session/i),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /send report/i }),
	).not.toBeInTheDocument()
})
