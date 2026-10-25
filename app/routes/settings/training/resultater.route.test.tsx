/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { MEG_RESULTS_LABELS as L } from '#app/utils/labels.ts'
import PerformanceResultsRoute from './resultater.tsx'

// ── Løpsresultater ─────────────────────────────────────────────────────────
// What a keyboard or screen-reader user meets on the page: a refusal is
// announced, and a delete never leaves focus on nothing.

type Reply = {
	ok: boolean
	error: string | null
	field: 'time' | 'date' | null
	replaced: boolean
}

function result(id: string, distance: string, time: string) {
	return {
		id,
		distance,
		time,
		pace: '4:00 /km',
		date: '3. mai 2026',
		source: 'Løp',
		typed: true,
	}
}

function renderRoute({
	results = () => [] as ReturnType<typeof result>[],
	reply = (_form: Record<string, FormDataEntryValue>): Reply => ({
		ok: true,
		error: null,
		field: null,
		replaced: false,
	}),
} = {}) {
	const Stub = createRoutesStub([
		{
			path: '/settings/training/resultater',
			Component: (props: Record<string, unknown>) => (
				<PerformanceResultsRoute {...(props as any)} />
			),
			loader: () => ({ results: results(), today: '2026-05-10' }),
			action: async ({ request }) =>
				reply(Object.fromEntries(await request.formData())),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<Stub initialEntries={['/settings/training/resultater']} />)
}

test('a refused time is shown at the field and announced', async () => {
	const user = userEvent.setup()
	renderRoute({
		reply: () => ({
			ok: false,
			error: L.implausible,
			field: 'time',
			replaced: false,
		}),
	})
	await user.type(await screen.findByLabelText(L.time), '3:15')
	await user.click(screen.getByRole('button', { name: L.save }))

	expect(await screen.findByRole('alert')).toHaveTextContent(L.implausible)
	expect(screen.getByLabelText(L.time)).toHaveAttribute('aria-invalid', 'true')
	expect(screen.getByLabelText(L.time)).toHaveAccessibleDescription(
		expect.stringContaining(L.implausible),
	)
})

test('deleting a result moves focus to the list heading, not to the page', async () => {
	const user = userEvent.setup()
	let results = [result('r1', '10 km', '40:00'), result('r2', '5 km', '19:00')]
	renderRoute({
		results: () => results,
		reply: (form) => {
			results = results.filter((row) => row.id !== form.id)
			return { ok: true, error: null, field: null, replaced: false }
		},
	})
	const remove = await screen.findByRole('button', {
		name: L.deleteLabel('10 km 40:00'),
	})
	await user.click(remove)
	await user.click(remove)

	const heading = screen.getByRole('heading', { name: L.title })
	await waitFor(() => expect(heading).toHaveFocus())
	await waitFor(() =>
		expect(screen.getAllByTestId('performance-result')).toHaveLength(1),
	)
	expect(heading).toHaveFocus()
})

test('a delete that fails brings the row back with focus on its button', async () => {
	const user = userEvent.setup()
	renderRoute({
		results: () => [result('r1', '10 km', '40:00')],
		reply: () => ({
			ok: false,
			error: L.notDeleted,
			field: null,
			replaced: false,
		}),
	})
	const remove = await screen.findByRole('button', {
		name: L.deleteLabel('10 km 40:00'),
	})
	await user.click(remove)
	await user.click(remove)

	expect(await screen.findByRole('alert')).toHaveTextContent(L.notDeleted)
	const row = screen.getByTestId('performance-result')
	await waitFor(() => expect(within(row).getByRole('button')).toHaveFocus())
})
