/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { type OneRmReading } from '#app/utils/strength/one-rm.ts'
import { type AnchorProposal } from '#app/utils/strength-anchors.server.ts'
import ProposeAnchorRoute from './lifts.$exerciseId_.propose.tsx'

// ── What your sets say ───────────────────────────────────────────────────────
// Every row is a proposal. The screen's contract: loading it writes nothing, the
// band travels with the number, the derivation waits behind a tap, and a refusal
// is stated in place with nothing to accept.

const ESTIMATE: OneRmReading = {
	kind: 'estimate',
	construct: 'estimatedOneRm',
	protocol: 'epley',
	valueKg: 116.7,
	reps: 5,
	confidence: 'medium',
	band: { lowKg: 104.8, highKg: 128.6, sdPct: 10.2, meanBiasPct: 0.5 },
	basis: {
		setsRead: 7,
		source: {
			setLogId: 'set-1',
			loadKg: 100,
			reps: 5,
			performedAtISO: '2026-08-01T17:00:00.000Z',
			rir: null,
			toFailure: true,
		},
		recencyDays: 13,
		equationText: 'load × (1 + reps / 30)',
		stale: false,
	},
}

function proposal(reading: OneRmReading = ESTIMATE): AnchorProposal {
	return {
		exerciseId: 'ex-1',
		exerciseName: 'Back squat',
		estimator: null,
		reading,
		currentAnchors: [],
	}
}

function renderRoute(value: AnchorProposal = proposal()) {
	const acted = vi.fn()
	const Stub = createRoutesStub([
		{
			path: '/settings/training/lifts/:exerciseId/propose',
			Component: (props: Record<string, unknown>) => (
				<ProposeAnchorRoute {...(props as any)} />
			),
			loader: () => ({ proposal: value, timezone: 'UTC' }),
			action: async ({ request }) => {
				acted(Object.fromEntries(await request.formData()))
				return { ok: true, message: 'Saved as your 116.7 kg 1RM.' }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<Stub initialEntries={['/settings/training/lifts/ex-1/propose']} />)
	return { acted }
}

test('a proposal screen writes nothing on load', async () => {
	const { acted } = renderRoute()

	// The number is on screen and nothing has been submitted: derived-then-
	// authored, so a reading becomes the athlete's number only when they say so.
	expect(await screen.findByText('116.7')).toBeInTheDocument()
	expect(
		screen.getByText(/Nothing is saved until you accept it/i),
	).toBeInTheDocument()
	expect(acted).not.toHaveBeenCalled()
})

test('the band travels with the number, so the point estimate never stands alone', async () => {
	renderRoute()

	expect(
		await screen.findByText(/Somewhere between 104.8 and 128.6 kg/i),
	).toBeInTheDocument()
	expect(screen.getByText(/±10.2 %/)).toBeInTheDocument()
})

test('the derivation waits behind a tap and names the equation it applied', async () => {
	renderRoute()

	const summary = await screen.findByText('How we got this')
	const details = summary.closest('details')
	// Closed by default: the reasoning is available, not asserted.
	expect(details).not.toBeNull()
	expect(details).not.toHaveAttribute('open')
	expect(screen.getByText('load × (1 + reps / 30)')).toBeInTheDocument()
	expect(screen.getByText(/100 kg × 5 on/)).toBeInTheDocument()
})

test('accepting posts the value that was shown, for the server to re-derive', async () => {
	const { acted } = renderRoute()
	const user = userEvent.setup()

	await user.click(await screen.findByRole('button', { name: 'Use this' }))

	expect(acted).toHaveBeenCalledWith(
		expect.objectContaining({ intent: 'accept-estimate', valueKg: '116.7' }),
	)
})

test('a refusal is stated in place and offers nothing to accept', async () => {
	renderRoute(
		proposal({
			kind: 'refusal',
			construct: 'estimatedOneRm',
			protocol: 'epley',
			refusal: 'effort-unknown',
			basis: {
				setsRead: 4,
				source: null,
				recencyDays: null,
				equationText: 'load × (1 + reps / 30)',
				stale: false,
			},
		}),
	)

	expect(await screen.findByText('Unavailable')).toBeInTheDocument()
	expect(
		screen.getByText(
			/None of your sets here says how close to failure it was/i,
		),
	).toBeInTheDocument()
	// An absence is not a low grade, and it has no accept control.
	expect(screen.queryByRole('button', { name: /Use this/i })).toBeNull()
	expect(screen.queryByText(/confidence/i)).toBeNull()
})

test('a set above the ten-rep gate refuses rather than grading itself low', async () => {
	renderRoute(
		proposal({
			kind: 'refusal',
			construct: 'estimatedOneRm',
			protocol: 'epley',
			refusal: 'reps-out-of-range',
			basis: {
				setsRead: 3,
				source: null,
				recencyDays: null,
				equationText: 'load × (1 + reps / 30)',
				stale: false,
			},
		}),
	)

	expect(
		await screen.findByText(/above 10 reps, where these equations stop being/i),
	).toBeInTheDocument()
	expect(screen.queryByText(/low confidence/i)).toBeNull()
})

test('a tested single is presented as a measurement rather than an estimate', async () => {
	renderRoute(
		proposal({
			kind: 'estimate',
			construct: 'oneRm',
			protocol: 'tested',
			valueKg: 140,
			reps: 1,
			confidence: 'high',
			band: { lowKg: 134.1, highKg: 145.9, sdPct: 4.2, meanBiasPct: 0 },
			basis: {
				setsRead: 5,
				source: {
					setLogId: 'set-9',
					loadKg: 140,
					reps: 1,
					performedAtISO: '2026-08-10T17:00:00.000Z',
					rir: null,
					toFailure: true,
				},
				recencyDays: 4,
				equationText:
					'the load lifted — a single to failure is the measurement, so no equation is applied',
				stale: false,
			},
		}),
	)

	expect(await screen.findByText('Tested 1RM')).toBeInTheDocument()
	expect(screen.getByText('high confidence')).toBeInTheDocument()
	expect(screen.getByText('140')).toBeInTheDocument()
})
