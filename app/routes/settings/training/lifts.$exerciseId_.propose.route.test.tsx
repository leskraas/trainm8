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

function proposal(
	reading: OneRmReading = ESTIMATE,
	overrides: Partial<AnchorProposal> = {},
): AnchorProposal {
	return {
		exerciseId: 'ex-1',
		exerciseName: 'Back squat',
		estimator: null,
		repLoadBasis: 'fitted',
		reading,
		currentAnchors: [],
		...overrides,
	}
}

function renderRoute(
	value: AnchorProposal = proposal(),
	basisNote: string | null = null,
) {
	const acted = vi.fn()
	const loadedWith = vi.fn()
	const Stub = createRoutesStub([
		{
			path: '/settings/training/lifts/:exerciseId/propose',
			Component: (props: Record<string, unknown>) => (
				<ProposeAnchorRoute {...(props as any)} />
			),
			loader: ({ request }) => {
				loadedWith(new URL(request.url).searchParams.get('estimator'))
				return { proposal: value, timezone: 'UTC', basisNote }
			},
			action: async ({ request }) => {
				acted(Object.fromEntries(await request.formData()))
				return { ok: true, message: 'Saved as your 116.7 kg 1RM.' }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<Stub initialEntries={['/settings/training/lifts/ex-1/propose']} />)
	return { acted, loadedWith }
}

test("a weight the athlete's plates can make is stated as it was stored, not rounded to one decimal", async () => {
	// A rack with 1.25 kg pairs makes 61.25, and the runner's plate line prints it
	// as 61.25 — so the reading, its band and the set it was read from all state
	// the number they hold rather than a one-decimal restatement of it.
	renderRoute(
		proposal({
			...ESTIMATE,
			valueKg: 61.25,
			band: { lowKg: 55.25, highKg: 67.25, sdPct: 10.2, meanBiasPct: 0.5 },
			basis: {
				...ESTIMATE.basis,
				source: {
					setLogId: 'set-1',
					loadKg: 61.25,
					reps: 5,
					performedAtISO: '2026-08-01T17:00:00.000Z',
					rir: null,
					toFailure: true,
				},
			},
		}),
	)

	expect(await screen.findByText('61.25')).toBeInTheDocument()
	expect(
		screen.getByText(/Somewhere between 55.25 and 67.25 kg/),
	).toBeInTheDocument()
	expect(screen.queryByText(/61\.3/)).not.toBeInTheDocument()
})

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
	expect(
		screen.getByText(/±10.2 %, which is this equation's own spread/i),
	).toBeInTheDocument()
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

test('every implemented equation is offered, each with its own error band', async () => {
	renderRoute()

	// Seven published equations are implemented and storable; a screen that
	// reaches only the default makes the other six dead code.
	for (const [name, band] of [
		['Epley', '±10.2 %'],
		['Brzycki', '±10.5 %'],
		['Mayhew', '±9.4 %'],
		['Wathen', '±10.6 %'],
		['Lombardi', '±9.2 %'],
		['Lander', '±10.5 %'],
		['Adams', '±9.1 %'],
	] as const) {
		const link = await screen.findByRole('link', {
			name: new RegExp(`^${name}`),
		})
		expect(link).toHaveTextContent(band)
	}
})

test('no equation is presented as the better one', async () => {
	renderRoute()

	expect(
		await screen.findByText(/None of these is the better one/i),
	).toBeInTheDocument()
	expect(screen.queryByText(/recommended|most accurate|best/i)).toBeNull()
})

test('choosing another equation re-reads the sets and writes nothing', async () => {
	const { acted, loadedWith } = renderRoute()
	const user = userEvent.setup()

	await user.click(await screen.findByRole('link', { name: /^Mayhew/ }))

	// A pick is a navigation: the loader re-derives and the derivation is shown
	// again, and the accept button is still the only write.
	expect(loadedWith).toHaveBeenLastCalledWith('mayhew')
	expect(acted).not.toHaveBeenCalled()
})

test('accepting posts the equation that was applied, for the server to re-run', async () => {
	const { acted } = renderRoute(
		proposal(
			{ ...ESTIMATE, protocol: 'mayhew', valueKg: 119 },
			{
				estimator: 'mayhew',
			},
		),
	)
	const user = userEvent.setup()

	await user.click(await screen.findByRole('button', { name: 'Use this' }))

	expect(acted).toHaveBeenCalledWith(
		expect.objectContaining({ estimator: 'mayhew', valueKg: '119' }),
	)
})

test('an estimate resting on a weaker basis says so beside the number', async () => {
	renderRoute(
		proposal(
			{ ...ESTIMATE, confidence: 'low' },
			{
				repLoadBasis: 'measured-biased',
			},
		),
		'These equations were tested on the deadlift and every one of them underestimated it (LeSuer 1997), so this number most likely reads low.',
	)

	expect(
		await screen.findByText(/every one of them underestimated it/i),
	).toBeInTheDocument()
	expect(screen.getByText('low confidence')).toBeInTheDocument()
})

test('a tested single is offered no equation to choose, because none was applied', async () => {
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
	expect(screen.queryByRole('link', { name: /^Mayhew/ })).toBeNull()
})
