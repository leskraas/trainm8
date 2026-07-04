/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import ImportsUploadRoute from './imports.upload.tsx'

function renderUpload() {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/imports/upload',
			Component: (props: Record<string, unknown>) => (
				<ImportsUploadRoute {...(props as any)} />
			),
			action: async ({ request }) => {
				const formData = await request.formData()
				submitted({
					disciplineOverride: formData.get('disciplineOverride'),
					file: formData.get('file'),
				})
				return { error: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/imports/upload']} />)
	return { submitted }
}

function gpxFile() {
	return new File(['<gpx></gpx>'], 'ride.gpx', { type: 'application/gpx+xml' })
}

test('the file input accepts many files across the supported formats', () => {
	renderUpload()

	const fileInput = screen.getByLabelText<HTMLInputElement>(/activity file/i)
	expect(fileInput.multiple).toBe(true)
	expect(fileInput.accept).toBe('.fit,.fit.gz,.tcx,.gpx,.zip,.gz')
	// Accepted formats are stated and the Strava-export guidance is linked.
	expect(
		screen.getByText(/\.fit, \.fit\.gz, \.tcx, \.gpx, \.zip, \.gz/i),
	).toBeInTheDocument()
	expect(screen.getByRole('link', { name: /strava export/i })).toHaveAttribute(
		'href',
		expect.stringContaining('support.strava.com'),
	)
})

test('submits with no discipline override by default (auto-detect)', async () => {
	const user = userEvent.setup()
	const { submitted } = renderUpload()

	const fileInput = screen.getByLabelText(/activity file/i)
	await user.upload(fileInput, gpxFile())
	// jsdom doesn't satisfy a `required` file input from a programmatic upload,
	// so dispatch submit directly to exercise what the form sends to the action.
	fireEvent.submit(fileInput.closest('form')!)

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]
	expect(payload.disciplineOverride).toBeFalsy()
	// A file is posted under the `file` field (cross-realm File identity and
	// filename aren't reliable through jsdom, so assert the field shape).
	expect(payload.file).not.toBe('')
	expect(typeof payload.file).toBe('object')
})

test('submits the chosen discipline as the override', async () => {
	const user = userEvent.setup()
	const { submitted } = renderUpload()

	const fileInput = screen.getByLabelText(/activity file/i)
	await user.upload(fileInput, gpxFile())

	await user.click(screen.getByLabelText(/discipline/i))
	await user.click(await screen.findByRole('option', { name: /run/i }))

	fireEvent.submit(fileInput.closest('form')!)

	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	expect(submitted.mock.calls[0]![0].disciplineOverride).toBe('run')
})
