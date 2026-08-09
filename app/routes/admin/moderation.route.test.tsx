/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import ModerationRoute from './moderation.tsx'

function report(overrides: Record<string, unknown> = {}) {
	return {
		id: 'report-1',
		reason: 'unsafe',
		detail: 'Twelve maximal 400s off 30 s rest, sold to beginners.',
		createdAt: new Date('2026-08-05T10:00:00Z'),
		reporter: 'Alex',
		workout: {
			id: 'workout-1',
			title: 'Brutal 400s',
			description: 'Go until you cannot',
			discipline: 'run',
			visibility: 'public',
			attribution: {
				displayName: 'Jo Kraas',
				publishedAt: new Date('2026-08-01T10:00:00Z'),
			},
		},
		...overrides,
	}
}

function renderQueue(reports: Array<Record<string, unknown>> = [report()]) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/admin/moderation',
			Component: (props: Record<string, unknown>) => (
				<ModerationRoute {...(props as any)} />
			),
			loader: () => ({ reports }),
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return { ok: true }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/admin/moderation']} />)
	return { submitted }
}

test('the queue shows what a report is about and who published it', async () => {
	renderQueue()

	expect(await screen.findByText('Brutal 400s')).toBeInTheDocument()
	expect(screen.getByText(/Published by Jo Kraas/)).toBeInTheDocument()
	expect(screen.getByText(/Reported by Alex/)).toBeInTheDocument()
	expect(screen.getByText(/Twelve maximal 400s/)).toBeInTheDocument()
	expect(screen.getByText('Unsafe to train')).toBeInTheDocument()
})

test('taking down carries the reason the author will be shown', async () => {
	const { submitted } = renderQueue()

	const reason = await screen.findByLabelText(/reason shown to the author/i)
	await userEvent.type(reason, 'Unsafe for the level it claims')
	await userEvent.click(screen.getByRole('button', { name: /take down/i }))

	expect(submitted).toHaveBeenCalledWith(
		expect.objectContaining({
			intent: 'take-down',
			workoutId: 'workout-1',
			reason: 'Unsafe for the level it claims',
		}),
	)
})

test('dismissing closes one report and never touches the session', async () => {
	const { submitted } = renderQueue()

	await userEvent.click(
		await screen.findByRole('button', { name: /dismiss report/i }),
	)

	expect(submitted).toHaveBeenCalledWith({
		intent: 'dismiss',
		reportId: 'report-1',
	})
})

test('an empty queue says so rather than showing nothing', async () => {
	renderQueue([])

	expect(await screen.findByText(/no open reports/i)).toBeInTheDocument()
})

test('a report from a deleted account still reads', async () => {
	renderQueue([report({ reporter: null })])

	expect(await screen.findByText(/a deleted account/i)).toBeInTheDocument()
})
