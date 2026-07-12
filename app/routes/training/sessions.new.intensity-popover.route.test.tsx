/**
 * @vitest-environment jsdom
 *
 * The intensity popover — full target-kind support (workout-editor spec
 * §7.2 + §7.3, #253): every Intensity Target kind is authored, edited, and
 * read back through the shared retargeting popover; the chip carries the
 * authored value with the zone-equivalent tint; the provenance line speaks
 * athlete words in every state.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import NewSessionRoute from './sessions.new.tsx'

window.HTMLElement.prototype.scrollIntoView = () => {}
window.ResizeObserver ??= class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

// A run profile on an LTHR-anchored HR recipe: bpm and %LTHR/%maxHR targets
// resolve; pace does not map onto its heart-rate-based zones.
const RUN_HR_PROFILE = {
	discipline: 'run',
	lthr: 168,
	maxHr: 190,
	ftp: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'friel-hr-5-run',
	zoneOverrides: null,
}

// A run profile on the Daniels pace recipe: authored pace buckets directly.
const RUN_PACE_PROFILE = {
	...RUN_HR_PROFILE,
	zoneSystem: 'daniels-pace-5',
}

// A bike profile on the Coggan power recipe with a known FTP, so W ⇄ %FTP
// converts and watts bucket into the seven-band recipe (clamped to 5 steps).
const BIKE_POWER_PROFILE = {
	discipline: 'bike',
	lthr: 160,
	maxHr: 185,
	ftp: 250,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: 'coggan-power-7',
	zoneOverrides: null,
}

function renderNewSession(profiles: unknown[] = []) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/sessions/new',
			Component: (props: Record<string, unknown>) => (
				<NewSessionRoute {...(props as any)} />
			),
			loader: () => ({
				defaultDate: '2026-06-01',
				defaultTime: '08:00',
				exercises: [],
				recentExerciseIds: [],
				disciplineProfiles: profiles,
			}),
			action: async ({ request }) => {
				const formData = await request.formData()
				submitted(Object.fromEntries(formData))
				return { result: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/new']} />)
	return { submitted }
}

async function hydrated() {
	await screen.findByLabelText(/title/i)
	await screen.findByText(/step 1/i)
}

/** Seed a zone intensity through the classic editor so the sentence renders
 * an intensity chip to anchor the popover on. */
async function seedZoneIntensity(
	user: ReturnType<typeof userEvent.setup>,
	zone: string,
) {
	await user.click(screen.getByLabelText('Intensity'))
	await user.click(await screen.findByRole('option', { name: 'Zone' }))
	const zoneField = await screen.findByLabelText('Zone')
	if (zoneField instanceof HTMLInputElement) {
		// No recipe → the classic editor falls back to a free-text label.
		await user.type(zoneField, zone)
	} else {
		await user.click(zoneField)
		await user.click(await screen.findByRole('option', { name: zone }))
	}
}

const sentence = () =>
	document.querySelector('[data-token-sentence-editor]') as HTMLElement

const chipEl = () =>
	sentence().querySelector('[data-token-type="intensity"]') as HTMLElement

/** Open the intensity popover from the sentence chip and return the popup. */
async function openIntensityPopover(user: ReturnType<typeof userEvent.setup>) {
	await waitFor(() => expect(chipEl()).not.toBeNull())
	await user.click(chipEl().closest('button')!)
	return await waitFor(() => {
		const popup = document.querySelector('[data-slot="token-popover"]')
		expect(popup).not.toBeNull()
		return popup as HTMLElement
	})
}

async function switchDisciplineToBike(
	user: ReturnType<typeof userEvent.setup>,
) {
	// Both the workout header and the step carry a Discipline select; the
	// workout-level one renders first.
	await user.click(screen.getAllByLabelText('Discipline')[0]!)
	await user.click(await screen.findByRole('option', { name: 'Ride' }))
}

// ——— Zone first ——————————————————————————————————————————————————————————

test('the popover leads with the athlete’s own zone chips; one tap re-zones the target', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)

	// The zone chips lead (§7.3), named by the athlete's recipe, the authored
	// zone pressed.
	const chips = within(popup).getByRole('group', { name: 'Zone' })
	const chipButtons = within(chips).getAllByRole('button')
	expect(chipButtons.map((b) => b.textContent)).toEqual([
		'Z1',
		'Z2',
		'Z3',
		'Z4',
		'Z5',
	])
	expect(within(chips).getByRole('button', { name: 'Z2' })).toHaveAttribute(
		'aria-pressed',
		'true',
	)

	// One tap re-zones: the chip re-renders with the new label and tint.
	await user.click(within(chips).getByRole('button', { name: 'Z4' }))
	await waitFor(() => {
		expect(chipEl().textContent).toBe('Z4')
		expect(chipEl()).toHaveAttribute('data-zone-step', '4')
	})

	// Read back: the new zone is the pressed chip.
	expect(within(chips).getByRole('button', { name: 'Z4' })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
})

// ——— The kind row ————————————————————————————————————————————————————————

test('the kind row is ordered discipline-aware — run leads with pace, RPE last', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	const row = popup.querySelector('[data-slot="intensity-kind-row"]')!
	const labels = Array.from(row.querySelectorAll('button')).map(
		(b) => b.textContent,
	)
	expect(labels).toEqual(['pace', 'watts', 'heart rate', 'RPE'])
})

test('a bike step leads the kind row with watts', async () => {
	const user = userEvent.setup()
	renderNewSession([BIKE_POWER_PROFILE])
	await hydrated()
	await switchDisciplineToBike(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	const row = popup.querySelector('[data-slot="intensity-kind-row"]')!
	const labels = Array.from(row.querySelectorAll('button')).map(
		(b) => b.textContent,
	)
	expect(labels).toEqual(['watts', 'pace', 'heart rate', 'RPE'])
})

// ——— Watts, W ⇄ %FTP ————————————————————————————————————————————————————

test('watts: authored W reads back in the chip with the zone-equivalent tint; W ⇄ %FTP converts through FTP', async () => {
	const user = userEvent.setup()
	renderNewSession([BIKE_POWER_PROFILE])
	await hydrated()
	await switchDisciplineToBike(user)
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'watts' }))
	await user.type(await within(popup).findByLabelText('Min W'), '235')

	// The chip shows the authored value in its own form; the tint is the
	// zone-equivalent (235 / 250 FTP = 0.94 → Coggan Z4).
	await waitFor(() => {
		expect(chipEl().textContent).toBe('235 W')
		expect(chipEl()).toHaveAttribute('data-zone-step', '4')
	})
	expect(popup).toHaveTextContent('≈ zone 4 for you')

	// Toggle to %FTP: one field, mutually exclusive units, the value converted
	// through the athlete's FTP — 235 W at FTP 250 is 94% FTP.
	const toggle = within(popup).getByRole('group', { name: 'Power unit' })
	await user.click(within(toggle).getByRole('button', { name: '%FTP' }))
	expect(await within(popup).findByLabelText('Min %FTP')).toHaveValue('94')
	expect(within(popup).queryByLabelText('Min W')).not.toBeInTheDocument()
	await waitFor(() => {
		expect(chipEl().textContent).toBe('94% FTP')
		expect(chipEl()).toHaveAttribute('data-zone-step', '4')
	})

	// And back: 94% of 250 is 235 W again — the value survives the round trip.
	await user.click(within(toggle).getByRole('button', { name: 'W' }))
	expect(await within(popup).findByLabelText('Min W')).toHaveValue('235')
})

// ——— Heart rate, bpm ⇄ %LTHR ⇄ %maxHR ———————————————————————————————————

test('heart rate: bpm ⇄ %LTHR ⇄ %maxHR converts through the profile thresholds', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'heart rate' }))
	await user.type(await within(popup).findByLabelText('Min bpm'), '162')

	// 162 bpm at LTHR 168 = 96% → Friel run Z4.
	await waitFor(() => {
		expect(chipEl().textContent).toBe('162 bpm')
		expect(chipEl()).toHaveAttribute('data-zone-step', '4')
	})

	const toggle = within(popup).getByRole('group', { name: 'Heart rate unit' })
	await user.click(within(toggle).getByRole('button', { name: '%LTHR' }))
	expect(await within(popup).findByLabelText('Min %LTHR')).toHaveValue('96')
	await waitFor(() => expect(chipEl().textContent).toBe('96% LTHR'))

	// %LTHR → %maxHR converts through both thresholds (96% of 168 ≈ 161 bpm ≈
	// 85% of 190).
	await user.click(within(toggle).getByRole('button', { name: '%maxHR' }))
	expect(await within(popup).findByLabelText('Min %maxHR')).toHaveValue('85')
	await waitFor(() => expect(chipEl().textContent).toBe('85% max HR'))
})

// ——— Pace ————————————————————————————————————————————————————————————————

test('pace renders inside the chip and buckets against a pace-anchored recipe', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_PACE_PROFILE])
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'T')

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'pace' }))
	// Typed in the keypad-friendly form — touch keypads have no ":" key (§9.2).
	await user.type(await within(popup).findByLabelText('Min pace'), '4.40')

	// 4:40/km against T-pace 4:00 is ratio 1.17 → Daniels M, band 2. The pace
	// lives inside the chip — the line's only chip element (§7.2).
	await waitFor(() => {
		expect(chipEl().textContent).toBe('4:40/km')
		expect(chipEl()).toHaveAttribute('data-zone-step', '2')
	})
	expect(popup).toHaveTextContent('≈ zone 2 for you')
})

// ——— RPE ————————————————————————————————————————————————————————————————

test('RPE is authorable, tints by the convention table, and never degrades to unresolved', async () => {
	const user = userEvent.setup()
	renderNewSession() // no profile at all
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'RPE' }))
	await user.type(await within(popup).findByLabelText('Min RPE'), '7')

	// RPE 7 → step 4 by the fixed convention (§7.4) — resolved even with no
	// thresholds anywhere; the provenance line says so in athlete words.
	await waitFor(() => {
		expect(chipEl().textContent).toBe('RPE 7')
		expect(chipEl()).toHaveAttribute('data-zone-step', '4')
		expect(chipEl()).not.toHaveAttribute('data-unresolved')
	})
	expect(popup).toHaveTextContent('RPE 7 ≈ zone 4 effort')

	// Every value is type-to-edit with ± nudges, never stepper-only (§2.4).
	await user.click(
		within(popup).getByRole('button', { name: 'Increase Min RPE' }),
	)
	expect(within(popup).getByLabelText('Min RPE')).toHaveValue('8')
	await waitFor(() => expect(chipEl().textContent).toBe('RPE 8'))
})

// ——— Honesty: the dashed chip and the provenance line —————————————————————

test('an unresolvable metric target renders the dashed chip and the provenance line says why', async () => {
	const user = userEvent.setup()
	renderNewSession() // no zone system, no thresholds
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'watts' }))
	await user.type(await within(popup).findByLabelText('Min W'), '235')

	// The chip keeps the authored value but goes dashed — never an asterisk,
	// never a fabricated zone (§7.2).
	await waitFor(() => {
		expect(chipEl().textContent).toBe('235 W')
		expect(chipEl()).toHaveAttribute('data-unresolved', 'true')
		expect(chipEl()).not.toHaveAttribute('data-zone-step')
	})
	expect(popup).toHaveTextContent(
		"can't be placed in a zone — no zone system chosen in settings",
	)
})

test('a half-typed target states its own state in the provenance line', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'heart rate' }))

	// Kind picked, value not yet — the line still speaks (never blank chrome).
	expect(popup).toHaveTextContent('not placed in a zone yet — finish the value')
})

test('%LTHR ⇄ %maxHR with no thresholds clears rather than reinterpreting the number', async () => {
	const user = userEvent.setup()
	renderNewSession() // no thresholds to convert through
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'heart rate' }))
	const toggle = within(popup).getByRole('group', { name: 'Heart rate unit' })
	await user.click(within(toggle).getByRole('button', { name: '%LTHR' }))
	await user.type(await within(popup).findByLabelText('Min %LTHR'), '90')
	await waitFor(() => expect(chipEl().textContent).toBe('90% LTHR'))

	// The two % units share one field; with nothing to convert through, the
	// same number would silently restate a different physiological target —
	// the field clears instead.
	await user.click(within(toggle).getByRole('button', { name: '%maxHR' }))
	expect(await within(popup).findByLabelText('Min %maxHR')).toHaveValue('')
	expect(popup).toHaveTextContent('not placed in a zone yet — finish the value')
})

// ——— The shared instrument ———————————————————————————————————————————————

test('the intensity chip retargets the open popover in place — same popup, swapped content', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	// Open on the duration token first.
	await user.click(
		await screen.findByRole('button', { name: /^6 min duration/ }),
	)
	const popup = await waitFor(() => {
		const el = document.querySelector('[data-slot="token-popover"]')
		expect(el).not.toBeNull()
		return el as HTMLElement
	})
	await within(popup).findByLabelText('Duration value')

	// Activate the intensity chip while open: the SAME popup swaps to the
	// intensity editor — zone chips, kind row, provenance — no close-and-reopen.
	await user.click(
		document.querySelector<HTMLButtonElement>(
			'button[data-token-editor="intensity"]',
		)!,
	)
	await waitFor(() =>
		expect(
			within(popup).getByRole('group', { name: 'Zone' }),
		).toBeInTheDocument(),
	)
	expect(document.querySelectorAll('[data-slot="token-popover"]')).toHaveLength(
		1,
	)
	expect(popup).toHaveTextContent(/intensity/i)
	expect(
		within(popup).queryByLabelText('Duration value'),
	).not.toBeInTheDocument()
})

test('committed intensity changes announce through the polite live region', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	const chips = within(popup).getByRole('group', { name: 'Zone' })
	await user.click(within(chips).getByRole('button', { name: 'Z3' }))

	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent('Intensity set to Z3'),
	)
})

// ——— Removal (§6.1's footer action) ——————————————————————————————————————

test('Remove intensity clears the target and the chip leaves the line', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await hydrated()
	await user.type(screen.getByLabelText('Duration'), '6 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	await user.click(
		within(popup).getByRole('button', { name: 'Remove intensity' }),
	)

	await waitFor(() => {
		expect(
			sentence().querySelector('[data-token-type="intensity"]'),
		).not.toBeInTheDocument()
		expect(
			document.querySelector('[data-slot="token-popover"]'),
		).not.toBeInTheDocument()
	})
})

// ——— Submission ——————————————————————————————————————————————————————————

test('a popover-authored target submits as the canonical Intensity Target JSON', async () => {
	const user = userEvent.setup()
	const { submitted } = renderNewSession([RUN_HR_PROFILE])
	await hydrated()
	await user.type(screen.getByLabelText(/title/i), 'Tempo')
	await user.type(screen.getByLabelText('Duration'), '40 min')
	await seedZoneIntensity(user, 'Z2')

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'heart rate' }))
	await user.type(await within(popup).findByLabelText('Min bpm'), '150')
	await user.type(within(popup).getByLabelText('Max bpm (optional)'), '160')
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: /create session/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]
	expect(JSON.parse(payload['blocks[0].steps[0].intensity'])).toEqual({
		kind: 'hrBpm',
		min: 150,
		max: 160,
	})
})
