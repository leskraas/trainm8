/**
 * @vitest-environment jsdom
 *
 * Every write I dag makes has a way back on I dag (ADR 0076, ADR 0082 S11).
 * A sentence from "+ Ny" → "Skriv en økt" lands on a day that may be anywhere
 * in the list, so its row is not opened: its Angre rides on the toast that
 * says what the write did to its week. This drives the provider directly — the
 * panel's own form is `writing-line.tsx`'s, and the server's reply is pinned in
 * `index.writing-line.test.ts`.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { Toaster } from 'sonner'
import { beforeAll, expect, test } from 'vitest'
import { DayStampProvider, useDayStamp } from './day-stamp-context.tsx'

// Sonner captures the pointer for its swipe-to-dismiss; jsdom has no pointer
// capture, and a click on the toast's action is a pointer down first.
beforeAll(() => {
	Element.prototype.setPointerCapture ??= () => {}
	Element.prototype.releasePointerCapture ??= () => {}
})

const WEEK_SUM = 'Løping neste uke: 40 → 46 km. Ukemålet står på 52.'

/** What the panel does on save: write, and leave the row closed. */
function PanelWrite() {
	const stamp = useDayStamp()
	return (
		<button
			type="button"
			onClick={() =>
				stamp.write('2030-06-12', 'run', '6 km rolig', { open: false })
			}
		>
			Lagre
		</button>
	)
}

function renderPanel() {
	const posts: Array<Record<string, FormDataEntryValue>> = []
	const App = createRoutesStub([
		{
			path: '/',
			action: async ({ request }) => {
				const form = Object.fromEntries(await request.formData())
				posts.push(form)
				return form.intent === 'write-session'
					? { stampedSessionId: 'written-1', weekSumLine: WEEK_SUM }
					: { undone: true }
			},
			Component: () => (
				<DayStampProvider prefill="run" thresholds={{}} ledger={[]}>
					<PanelWrite />
					<Toaster />
				</DayStampProvider>
			),
		},
	])
	render(<App initialEntries={['/']} />)
	return posts
}

test('a write from "+ Ny" lands as a toast with the week’s sum and Angre on it', async () => {
	const user = userEvent.setup()
	const posts = renderPanel()
	await user.click(await screen.findByRole('button', { name: 'Lagre' }))

	expect(await screen.findByText(WEEK_SUM)).toBeInTheDocument()
	// The reply carries the words, so the server flashes no second toast.
	expect(posts[0]).toMatchObject({
		intent: 'write-session',
		date: '2030-06-12',
		landing: 'toast',
	})

	await user.click(screen.getByRole('button', { name: 'Angre' }))
	await waitFor(() =>
		expect(posts[1]).toEqual({ intent: 'undo-stamp', sessionId: 'written-1' }),
	)
})
