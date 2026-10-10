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
