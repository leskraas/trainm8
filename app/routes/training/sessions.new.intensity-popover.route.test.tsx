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
				// The prefilled Discipline the loader derives from the athlete's own
				// history (#501). These specs are about the sentence, not about the
				// derivation, so they open on the discipline the route used to
				// hardcode.
				defaultDiscipline: 'run',
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

// A new session is honestly empty (spec §11): seed one block + one cardio step
// (a 10 min varighet) through the empty-state "start from scratch ＋" kind
// chooser — the classic "+ Add Block" fieldset is gone. The seeded step carries
// no intensity yet; the popover is reached through the duration token.
async function addStructure(user: ReturnType<typeof userEvent.setup>) {
	await screen.findByLabelText(/tittel/i) // wait for hydration
	await user.click(
		await screen.findByRole('button', { name: /begynn med et tomt steg/i }),
	)
	await user.click(await screen.findByRole('menuitem', { name: /kondisjon/i }))
	await screen.findByRole('button', { name: /min varighet/ })
}

const sentence = () =>
	document.querySelector('[data-token-sentence-editor]') as HTMLElement

const chipEl = () =>
	sentence().querySelector('[data-token-type="intensity"]') as HTMLElement

const popupEl = () =>
	document.querySelector('[data-slot="token-popover"]') as HTMLElement | null

/** Open the intensity editor on a step with NO intensity yet, through the
 * "＋ intensity" neighbour link in the duration token popover — the same popup
 * swaps to the zone chips + kind row. Returns the (still-open) popup. */
async function openIntensityPopover(user: ReturnType<typeof userEvent.setup>) {
	await user.click(await screen.findByRole('button', { name: /min varighet/ }))
	await user.click(
		await within(popupEl()!).findByRole('button', { name: '＋ intensitet' }),
	)
	await within(popupEl()!).findByRole('group', { name: 'Sone' })
	return popupEl()!
}

/** Seed a zone chip on the line (through the "＋ intensity" neighbour), then
 * close the popover — leaving an intensity chip to anchor on later. */
async function seedZoneIntensity(
	user: ReturnType<typeof userEvent.setup>,
	zone: string,
) {
	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: zone }))
	await waitFor(() => expect(chipEl()?.textContent).toBe(zone))
	await user.keyboard('{Escape}')
	await waitFor(() => expect(popupEl()).toBeNull())
}

async function switchDisciplineToBike(
	user: ReturnType<typeof userEvent.setup>,
) {
	// Both the workout header and the step carry a Discipline select; the
	// workout-level one renders first.
	await user.click(screen.getAllByLabelText('Sport')[0]!)
	await user.click(await screen.findByRole('option', { name: 'Sykling' }))
}

// ——— Zone first ——————————————————————————————————————————————————————————

test('the popover leads with the athlete’s own zone chips; one tap re-zones the target', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await addStructure(user)

	// Author Z2 through the "＋ intensity" neighbour; the popover stays open on
	// it, so the authored zone reads back as the pressed chip.
	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'Z2' }))
	await waitFor(() => expect(chipEl().textContent).toBe('Z2'))

	// The zone chips lead (§7.3), named by the athlete's recipe, the authored
	// zone pressed.
	const chips = within(popup).getByRole('group', { name: 'Sone' })
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
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	const row = popup.querySelector('[data-slot="intensity-kind-row"]')!
	const labels = Array.from(row.querySelectorAll('button')).map(
		(b) => b.textContent,
	)
	// `lactate` joined the row with #449 and sits before RPE: it is a measured
	// anchor like bpm, not a unit of the pace group, and RPE stays last by
	// convention (§7.4).
	expect(labels).toEqual(['fart', 'watt', 'puls', 'laktat', 'RPE'])
})

test('a bike step leads the kind row with watts', async () => {
	const user = userEvent.setup()
	renderNewSession([BIKE_POWER_PROFILE])
	await addStructure(user)
	await switchDisciplineToBike(user)

	const popup = await openIntensityPopover(user)
	const row = popup.querySelector('[data-slot="intensity-kind-row"]')!
	const labels = Array.from(row.querySelectorAll('button')).map(
		(b) => b.textContent,
	)
	expect(labels).toEqual(['watt', 'fart', 'puls', 'laktat', 'RPE'])
})

// ——— Watts, W ⇄ %FTP ————————————————————————————————————————————————————

test('watts: authored W reads back in the chip with the zone-equivalent tint; W ⇄ %FTP converts through FTP', async () => {
	const user = userEvent.setup()
	renderNewSession([BIKE_POWER_PROFILE])
	await addStructure(user)
	await switchDisciplineToBike(user)

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'watt' }))
	await user.type(await within(popup).findByLabelText('Fra W'), '235')

	// The chip shows the authored value in its own form; the tint is the
	// zone-equivalent (235 / 250 FTP = 0.94 → Coggan Z4).
	await waitFor(() => {
		expect(chipEl().textContent).toBe('235 W')
		expect(chipEl()).toHaveAttribute('data-zone-step', '4')
	})
	expect(popup).toHaveTextContent('≈ sone 4 for deg')

	// Toggle to %FTP: one field, mutually exclusive units, the value converted
	// through the athlete's FTP — 235 W at FTP 250 is 94% FTP.
	const toggle = within(popup).getByRole('group', { name: 'Enhet for watt' })
	await user.click(within(toggle).getByRole('button', { name: '%FTP' }))
	expect(await within(popup).findByLabelText('Fra %FTP')).toHaveValue('94')
	expect(within(popup).queryByLabelText('Fra W')).not.toBeInTheDocument()
	await waitFor(() => {
		expect(chipEl().textContent).toBe('94% FTP')
		expect(chipEl()).toHaveAttribute('data-zone-step', '4')
	})

	// And back: 94% of 250 is 235 W again — the value survives the round trip.
	await user.click(within(toggle).getByRole('button', { name: 'W' }))
	expect(await within(popup).findByLabelText('Fra W')).toHaveValue('235')
})

// ——— Heart rate, bpm ⇄ %LTHR ⇄ %maxHR ———————————————————————————————————

test('heart rate: bpm ⇄ %LTHR ⇄ %maxHR converts through the profile thresholds', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'puls' }))
	await user.type(await within(popup).findByLabelText('Fra slag/min'), '162')

	// 162 bpm at LTHR 168 = 96% → Friel run Z4.
	await waitFor(() => {
		expect(chipEl().textContent).toBe('162 bpm')
		expect(chipEl()).toHaveAttribute('data-zone-step', '4')
	})

	const toggle = within(popup).getByRole('group', { name: 'Enhet for puls' })
	await user.click(within(toggle).getByRole('button', { name: '%terskelpuls' }))
	expect(await within(popup).findByLabelText('Fra %terskelpuls')).toHaveValue(
		'96',
	)
	await waitFor(() => expect(chipEl().textContent).toBe('96% LTHR'))

	// %LTHR → %maxHR converts through both thresholds (96% of 168 ≈ 161 bpm ≈
	// 85% of 190).
	await user.click(within(toggle).getByRole('button', { name: '%makspuls' }))
	expect(await within(popup).findByLabelText('Fra %makspuls')).toHaveValue('85')
	await waitFor(() => expect(chipEl().textContent).toBe('85% max HR'))
})

// ——— Pace ————————————————————————————————————————————————————————————————

test('pace renders inside the chip and buckets against a pace-anchored recipe', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_PACE_PROFILE])
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'fart' }))
	// Typed in the keypad-friendly form — touch keypads have no ":" key (§9.2).
	await user.type(await within(popup).findByLabelText('Fra fart'), '4.40')

	// 4:40/km against T-pace 4:00 is ratio 1.17 → Daniels `E`, which declares
	// Training Zone 2 (#449; before that the band's position read it as 1). On the
	// corrected bands (#447) `E` is 1.15–1.31 and `M` is 1.05–1.14, so 40 s/km
	// slower than threshold is easy running; the old bands read the same pace as
	// marathon pace because their `M` ran from 1.15 to 1.28. The pace lives
	// inside the chip — the line's only chip element (§7.2).
	await waitFor(() => {
		expect(chipEl().textContent).toBe('4:40/km')
		expect(chipEl()).toHaveAttribute('data-zone-step', '2')
	})
	expect(popup).toHaveTextContent('≈ sone 2 for deg')
})

// ——— RPE ————————————————————————————————————————————————————————————————

test('RPE is authorable, tints by the convention table, and never degrades to unresolved', async () => {
	const user = userEvent.setup()
	renderNewSession() // no profile at all
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'RPE' }))
	await user.type(await within(popup).findByLabelText('Fra RPE'), '7')

	// RPE 7 → step 4 by the fixed convention (§7.4) — resolved even with no
	// thresholds anywhere; the provenance line says so in athlete words.
	await waitFor(() => {
		expect(chipEl().textContent).toBe('RPE 7')
		expect(chipEl()).toHaveAttribute('data-zone-step', '4')
		expect(chipEl()).not.toHaveAttribute('data-unresolved')
	})
	expect(popup).toHaveTextContent('RPE 7 ≈ innsats i sone 4')

	// Every value is type-to-edit with ± nudges, never stepper-only (§2.4).
	await user.click(within(popup).getByRole('button', { name: 'Øk fra rpe' }))
	expect(within(popup).getByLabelText('Fra RPE')).toHaveValue('8')
	await waitFor(() => expect(chipEl().textContent).toBe('RPE 8'))
})

// ——— Honesty: the dashed chip and the provenance line —————————————————————

test('an unresolvable metric target renders the dashed chip and the provenance line says why', async () => {
	const user = userEvent.setup()
	renderNewSession() // no zone system, no thresholds
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'watt' }))
	await user.type(await within(popup).findByLabelText('Fra W'), '235')

	// The chip keeps the authored value but goes dashed — never an asterisk,
	// never a fabricated zone (§7.2).
	await waitFor(() => {
		expect(chipEl().textContent).toBe('235 W')
		expect(chipEl()).toHaveAttribute('data-unresolved', 'true')
		expect(chipEl()).not.toHaveAttribute('data-zone-step')
	})
	expect(popup).toHaveTextContent(
		'kan ikke plasseres i en sone — ingen sonesystem valgt i innstillingene',
	)
})

test('a half-typed target states its own state in the provenance line', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'puls' }))

	// Kind picked, value not yet — the line still speaks (never blank chrome).
	expect(popup).toHaveTextContent(
		'ikke plassert i en sone ennå — fyll inn verdien',
	)
})

test('%LTHR ⇄ %maxHR with no thresholds clears rather than reinterpreting the number', async () => {
	const user = userEvent.setup()
	renderNewSession() // no thresholds to convert through
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'puls' }))
	const toggle = within(popup).getByRole('group', { name: 'Enhet for puls' })
	await user.click(within(toggle).getByRole('button', { name: '%terskelpuls' }))
	await user.type(await within(popup).findByLabelText('Fra %terskelpuls'), '90')
	await waitFor(() => expect(chipEl().textContent).toBe('90% LTHR'))

	// The two % units share one field; with nothing to convert through, the
	// same number would silently restate a different physiological target —
	// the field clears instead.
	await user.click(within(toggle).getByRole('button', { name: '%makspuls' }))
	expect(await within(popup).findByLabelText('Fra %makspuls')).toHaveValue('')
	expect(popup).toHaveTextContent(
		'ikke plassert i en sone ennå — fyll inn verdien',
	)
})

// ——— The shared instrument ———————————————————————————————————————————————

test('the intensity chip retargets the open popover in place — same popup, swapped content', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await addStructure(user)
	await seedZoneIntensity(user, 'Z2')

	// Open on the duration token first.
	await user.click(await screen.findByRole('button', { name: /min varighet/ }))
	const popup = await waitFor(() => {
		const el = document.querySelector('[data-slot="token-popover"]')
		expect(el).not.toBeNull()
		return el as HTMLElement
	})
	await within(popup).findByLabelText('Verdi for varigheten')

	// Activate the intensity chip while open: the SAME popup swaps to the
	// intensity editor — zone chips, kind row, provenance — no close-and-reopen.
	await user.click(
		document.querySelector<HTMLButtonElement>(
			'button[data-token-editor="intensity"]',
		)!,
	)
	await waitFor(() =>
		expect(
			within(popup).getByRole('group', { name: 'Sone' }),
		).toBeInTheDocument(),
	)
	expect(document.querySelectorAll('[data-slot="token-popover"]')).toHaveLength(
		1,
	)
	expect(popup).toHaveTextContent(/intensitet/i)
	expect(
		within(popup).queryByLabelText('Verdi for varigheten'),
	).not.toBeInTheDocument()
})

test('committed intensity changes announce through the polite live region', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	const chips = within(popup).getByRole('group', { name: 'Sone' })
	await user.click(within(chips).getByRole('button', { name: 'Z3' }))

	await waitFor(() =>
		expect(screen.getByRole('status')).toHaveTextContent(
			'Intensiteten er satt til Z3',
		),
	)
})

// ——— Removal (§6.1's footer action) ——————————————————————————————————————

test('Remove intensity clears the target and the chip leaves the line', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_HR_PROFILE])
	await addStructure(user)

	// Author Z2 so the line carries an intensity chip, then reopen the popover
	// from that chip and clear the target from its quiet footer action.
	await seedZoneIntensity(user, 'Z2')
	await user.click(chipEl().closest('button')!)
	const popup = await waitFor(() => {
		const el = document.querySelector('[data-slot="token-popover"]')
		expect(el).not.toBeNull()
		return el as HTMLElement
	})
	await user.click(
		within(popup).getByRole('button', { name: 'Fjern intensiteten' }),
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
	await addStructure(user)
	await user.type(screen.getByLabelText(/tittel/i), 'Tempo')

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'puls' }))
	await user.type(await within(popup).findByLabelText('Fra slag/min'), '150')
	await user.type(
		within(popup).getByLabelText('Til slag/min (valgfritt)'),
		'160',
	)
	await user.keyboard('{Escape}')

	await user.click(screen.getByRole('button', { name: /lag økta/i }))
	await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1))
	const payload = submitted.mock.calls[0]![0]
	expect(JSON.parse(payload['blocks[0].steps[0].intensity'])).toEqual({
		kind: 'hrBpm',
		min: 150,
		max: 160,
	})
})

// ——— #449: pace ⇄ % T-pace, and lactate as its own anchor ——————————————————

const RUN_NORWEGIAN_PROFILE = {
	...RUN_HR_PROFILE,
	zoneSystem: 'norwegian-threshold-run',
}

test('pace: /km ⇄ % T-pace converts through threshold pace, and the bounds swap sides', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_PACE_PROFILE])
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'fart' }))
	// `Min pace` is the *fast* bound — fewer seconds per km.
	await user.type(within(popup).getByLabelText('Fra fart'), '4:05')
	await user.type(
		within(popup).getByRole('textbox', { name: 'Til fart (valgfritt)' }),
		'4:12',
	)
	await waitFor(() => expect(chipEl().textContent).toBe('4:05–4:12/km'))

	// The percentage is of threshold *speed*, so against a 4:00 threshold 4:12 is
	// 95 % and 4:05 is 98 % — and the slower bound becomes the *lower* percentage.
	await user.click(within(popup).getByRole('button', { name: '% terskelfart' }))
	await waitFor(() => {
		expect(within(popup).getByLabelText('Fra % terskelfart')).toHaveValue('95')
		expect(
			within(popup).getByRole('textbox', {
				name: 'Til % terskelfart (valgfritt)',
			}),
		).toHaveValue('98')
	})
	await waitFor(() => expect(chipEl().textContent).toBe('95–98% T-pace'))
})

test('lactate is authored as itself, and the pace beside it is a derived ≈ facet', async () => {
	const user = userEvent.setup()
	renderNewSession([RUN_NORWEGIAN_PROFILE])
	await addStructure(user)

	const popup = await openIntensityPopover(user)
	await user.click(within(popup).getByRole('button', { name: 'laktat' }))
	await user.type(within(popup).getByLabelText('Fra mmol/L'), '2.5')
	await user.type(
		within(popup).getByRole('textbox', { name: 'Til mmol/L (valgfritt)' }),
		'3',
	)

	// The chip carries the *authored* anchor — the mmol figure, never the pace.
	await waitFor(() => expect(chipEl().textContent).toBe('2.5–3.0 mmol/L'))
	// `sub-T` is 1.02–1.05 × a 4:00 threshold, and the reading's 2.75 midpoint is
	// inside its published 2.0–3.0 band, so the athlete is placed on zone 4.
	expect(chipEl()).toHaveAttribute('data-zone-step', '4')
	expect(popup).toHaveTextContent('4:05–4:12 /km')

	// There is deliberately no unit toggle: converting a pace draft into a
	// lactate figure would invent a measurement nobody took.
	expect(
		within(popup).queryByRole('group', { name: 'Enhet for fart' }),
	).not.toBeInTheDocument()
})
