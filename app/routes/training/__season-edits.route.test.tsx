/**
 * @vitest-environment jsdom
 *
 * Two small things about _Endre sesongen_ (audit B10, and ADR 0028 §2):
 *
 * - _Tilbake til planens mål_ is offered only on a week the athlete has set a
 *   target on themselves. On any other week there is nothing to go back to, and
 *   a button that previews "no change" is a dead end.
 * - The text links into an edit are a 20 px line of text, so they carry an
 *   invisible hit area to 44 px instead of growing the line.
 *
 * The rest of the card (previews, confirms, refusals) is covered in
 * `plan.route.test.tsx` and `plan.season-edits.test.ts`.
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { SeasonEditLink, SeasonEditsCard } from './__season-edits.tsx'

const RUN = 'track-run'
const BIKE = 'track-bike'

type Target = {
	trackId: string
	discipline: 'run' | 'bike'
	currency: 'km'
	value: number | null
	overridden?: boolean
}

function target(trackId: string, value: number, overridden = false): Target {
	return {
		trackId,
		discipline: trackId === RUN ? 'run' : 'bike',
		currency: 'km',
		value,
		overridden,
	}
}

function renderCard({
	targets,
	search,
	tracks = [RUN],
}: {
	targets: (weekKey: string) => Target[]
	search: string
	tracks?: string[]
}) {
	const weekKeys = ['2030-01-07', '2030-01-14']
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<SeasonEditsCard
					outlineId="outline-1"
					weeks={weekKeys.map((weekKey) => ({
						weekKey,
						phaseIndex: 0,
						role: 'loading',
						targets: targets(weekKey),
					}))}
					phases={[
						{
							id: 'phase-base',
							name: 'Grunntrening',
							weeks: 2,
							rhythm: 'none',
							tapers: false,
							fromWeekKey: '2030-01-07',
						},
					]}
					tracks={tracks.map((trackId) => ({
						trackId,
						discipline: trackId === RUN ? 'run' : 'bike',
						currency: 'km',
					}))}
					firstUnbegunWeekKey="2030-01-07"
					reply={null}
				/>
			),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={[`/training/plan${search}`]} />)
}

const REVERT = 'Tilbake til planens mål'

test('a week on the plan’s own target offers no way back to it', async () => {
	renderCard({
		targets: () => [target(RUN, 50)],
		search: `?edit=week-target&weekKey=2030-01-14&trackId=${RUN}`,
	})

	expect(
		await screen.findByRole('form', { name: 'Endre ukemålet' }),
	).toBeInTheDocument()
	expect(screen.queryByRole('button', { name: REVERT })).toBeNull()
	expect(screen.queryByText(/tar bort ukemålet du har satt selv/)).toBeNull()
})

test('a hand-set week offers the way back to the plan’s own target', async () => {
	renderCard({
		targets: (weekKey) => [target(RUN, 42, weekKey === '2030-01-14')],
		search: `?edit=week-target&weekKey=2030-01-14&trackId=${RUN}`,
	})

	const revert = await screen.findByRole('button', { name: REVERT })
	expect(revert).toHaveAccessibleDescription(
		/tar bort ukemålet du har satt selv/,
	)
})

test('the way back follows the chosen track, not any track that week', async () => {
	const targets = () => [target(RUN, 50), target(BIKE, 120, true)]

	renderCard({
		targets,
		tracks: [RUN, BIKE],
		search: `?edit=week-target&weekKey=2030-01-14&trackId=${RUN}`,
	})
	expect(
		await screen.findByRole('form', { name: 'Endre ukemålet' }),
	).toBeInTheDocument()
	expect(screen.queryByRole('button', { name: REVERT })).toBeNull()
})

test('the way back is there for the hand-set track of a multi-track week', async () => {
	renderCard({
		targets: () => [target(RUN, 50), target(BIKE, 120, true)],
		tracks: [RUN, BIKE],
		search: `?edit=week-target&weekKey=2030-01-14&trackId=${BIKE}`,
	})

	expect(
		await screen.findByRole('button', { name: REVERT }),
	).toBeInTheDocument()
})

test('a text link into an edit reaches 44 px without growing its line', async () => {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<SeasonEditLink edit="phase" fields={{ phaseId: 'phase-base' }}>
					Endre navn eller lengde på en fase
				</SeasonEditLink>
			),
		},
	])
	render(<App initialEntries={['/training/plan']} />)

	const link = await screen.findByRole('link', {
		name: 'Endre navn eller lengde på en fase',
	})
	// An invisible `after:` box 12 px above and below a 20 px line: 44 px of
	// target with no change to the reading's rhythm (ADR 0028 §2).
	expect(link.classList).toContain('relative')
	expect(link.classList).toContain('after:absolute')
	expect(link.classList).toContain('after:-inset-y-3')
	expect(link.classList).toContain('touch-manipulation')
})

// _Endre startnivået_ (#673): opened from the lead on the act that will not
// be refused, pre-filled with the ramp's level, and never offering to remove
// the season's first Season Anchor.

type Choice = Parameters<typeof SeasonEditsCard>[0]['anchorChoices']

function anchorChoice(
	anchors: Array<{ fromWeekKey: string; value: number }>,
): NonNullable<Choice>[number] {
	return {
		trackId: RUN,
		discipline: 'run',
		currency: 'km',
		anchors: anchors.map((anchor, index) => ({
			...anchor,
			earliest: index === 0,
			inPlan: true,
			removable: index > 0 && anchor.fromWeekKey >= '2030-01-07',
		})),
		weeks: [
			{
				weekKey: '2030-01-07',
				role: 'recovery',
				target: 25,
				overridden: false,
				level: 37.4567,
			},
			{
				weekKey: '2030-01-14',
				role: 'loading',
				target: 39.3,
				overridden: false,
				level: 39.3,
			},
		],
	}
}

function renderAnchorEdit(
	choice: NonNullable<Choice>[number],
	reply: Parameters<typeof SeasonEditsCard>[0]['reply'] = null,
) {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<SeasonEditsCard
					outlineId="outline-1"
					weeks={[]}
					phases={[]}
					tracks={[]}
					anchorChoices={[choice]}
					firstUnbegunWeekKey="2030-01-07"
					reply={reply}
				/>
			),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(
		<App
			initialEntries={[
				`/training/plan?edit=season-anchor&trackId=${RUN}#season-edit-season-anchor`,
			]}
		/>,
	)
}

test('the lead’s link opens a fresh start from the first unbegun week, pre-filled with the ramp’s level', async () => {
	renderAnchorEdit(anchorChoice([{ fromWeekKey: '2029-12-31', value: 30 }]))

	const form = await screen.findByRole('form', { name: 'Endre startnivået' })
	expect(form.closest('#season-edit-season-anchor')).not.toBeNull()
	expect(
		screen.getByRole('radio', { name: /Start på nytt fra en uke/ }),
	).toBeChecked()
	// The level to three decimals, not the easy week's own target.
	expect(screen.getByLabelText('Starter på (km)')).toHaveValue('37,457')
	expect(screen.getByText('Nå: 25 km, lett uke.')).toBeInTheDocument()
	// Only the season's first anchor: nothing to remove.
	expect(screen.queryByRole('radio', { name: /Fjern/ })).toBeNull()
})

test('a segment starting on the first unbegun week opens on its value; only later ones can go', async () => {
	renderAnchorEdit(
		anchorChoice([
			{ fromWeekKey: '2029-12-31', value: 30 },
			{ fromWeekKey: '2030-01-07', value: 36 },
		]),
	)

	expect(
		await screen.findByRole('radio', { name: /Endre tallet i et startnivå/ }),
	).toBeChecked()
	expect(screen.getByLabelText('Nytt tall (km)')).toHaveValue('36')
	expect(
		screen.getByRole('radio', { name: /Fjern et nytt startnivå/ }),
	).toBeInTheDocument()
	expect(
		screen.getByText(/Sesongstarten \(Fra uke 1 · 31\. des 2029 · 30 km\)/),
	).toBeInTheDocument()
})

test('a preview row names the track’s Volume Currency beside its figures', async () => {
	const edit = {
		kind: 'season-anchor' as const,
		trackId: RUN,
		action: 'add' as const,
		fromWeekKey: '2030-01-14',
		value: 42,
	}
	renderAnchorEdit(anchorChoice([{ fromWeekKey: '2029-12-31', value: 30 }]), {
		edit: 'season-anchor',
		preview: {
			kind: 'season-anchor',
			weeks: [],
			digest: 'digest-1',
			message: 'Løping fra uke 3: nytt startnivå 42 km.',
			warnings: [],
			edit,
			anchor: {
				unit: 'km',
				changedWeeks: '1 uke får nytt mål',
				rows: [
					{
						weekKey: '2030-01-14',
						weekNumber: 3,
						where: 'hard uke · Base',
						before: '39,3',
						after: '42',
						authored: false,
						how: null,
					},
				],
				held: [],
			},
		},
	})

	const row = await screen.findByText('Uke 3')
	expect(row.closest('li')?.textContent).toMatch(/39,3.*→.*42\s*km/)
})
