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

	expect(await screen.findByText('61,25')).toBeInTheDocument()
	expect(
		screen.getByText(/Et sted mellom 55,25 og 67,25 kg/),
	).toBeInTheDocument()
	expect(screen.queryByText(/61[.,]3/)).not.toBeInTheDocument()
})

test('a proposal screen writes nothing on load', async () => {
	const { acted } = renderRoute()

	// The number is on screen and nothing has been submitted: derived-then-
	// authored, so a reading becomes the athlete's number only when they say so.
	expect(await screen.findByText('116,7')).toBeInTheDocument()
	expect(
		screen.getByText(/Ingenting lagres før du godtar det/i),
	).toBeInTheDocument()
	expect(acted).not.toHaveBeenCalled()
})

test('the band travels with the number, so the point estimate never stands alone', async () => {
	renderRoute()

	expect(
		await screen.findByText(/Et sted mellom 104,8 og 128,6 kg/i),
	).toBeInTheDocument()
	expect(
		screen.getByText(/±10,2 %. Det er likningens egen spredning/i),
	).toBeInTheDocument()
})

test('the derivation waits behind a tap and names the equation it applied', async () => {
	renderRoute()
	const user = userEvent.setup()

	const trigger = await screen.findByRole('button', {
		name: /Slik kom vi fram til det/i,
	})
	// Closed by default: the reasoning is available, not asserted.
	expect(trigger).toHaveAttribute('aria-expanded', 'false')
	await user.click(trigger)
	expect(await screen.findByText('vekt × (1 + reps / 30)')).toBeInTheDocument()
	expect(screen.getByText(/100 kg × 5 /)).toBeInTheDocument()
})

test('accepting posts the value that was shown, for the server to re-derive', async () => {
	const { acted } = renderRoute()
	const user = userEvent.setup()

	await user.click(await screen.findByRole('button', { name: 'Bruk dette' }))

	// The posted number keeps the point the server parses, though the screen
	// reads 116,7.
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

	expect(await screen.findByText('Ikke tilgjengelig')).toBeInTheDocument()
	expect(
		screen.getByText(/Ingen av settene sier hvor nær utmattelse de var/i),
	).toBeInTheDocument()
	// An absence is not a low grade, and it has no accept control.
	expect(screen.queryByRole('button', { name: /Bruk dette/i })).toBeNull()
	expect(screen.queryByText(/sikkerhet/i)).toBeNull()
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
		await screen.findByText(/over 10 reps, der disse likningene slutter/i),
	).toBeInTheDocument()
	expect(screen.queryByText(/lav sikkerhet/i)).toBeNull()
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

	expect(await screen.findByText('Testet 1RM')).toBeInTheDocument()
	expect(screen.getByText('høy sikkerhet')).toBeInTheDocument()
	expect(screen.getByText('140')).toBeInTheDocument()
})

test('every implemented equation is offered, each with its own error band', async () => {
	renderRoute()

	// Seven published equations are implemented and storable; a screen that
	// reaches only the default makes the other six dead code.
	for (const [name, band] of [
		['Epley', '±10,2 %'],
		['Brzycki', '±10,5 %'],
		['Mayhew', '±9,4 %'],
		['Wathen', '±10,6 %'],
		['Lombardi', '±9,2 %'],
		['Lander', '±10,5 %'],
		['Adams', '±9,1 %'],
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
		await screen.findByText(/Ingen av dem er bedre enn de andre/i),
	).toBeInTheDocument()
	expect(screen.queryByText(/anbefalt|mest nøyaktig|beste/i)).toBeNull()
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

	await user.click(await screen.findByRole('button', { name: 'Bruk dette' }))

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
		'Disse likningene er testet på markløft, og alle undervurderte det (LeSuer 1997), så tallet er trolig for lavt.',
	)

	expect(await screen.findByText(/alle undervurderte det/i)).toBeInTheDocument()
	expect(screen.getByText('lav sikkerhet')).toBeInTheDocument()
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

	expect(await screen.findByText('Testet 1RM')).toBeInTheDocument()
	expect(screen.queryByRole('link', { name: /^Mayhew/ })).toBeNull()
})
