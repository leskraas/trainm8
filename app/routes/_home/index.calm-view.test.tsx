/**
 * @vitest-environment jsdom
 *
 * I dag's calm default view on screen (spec #558 S4, ADR 0101 §3–§4): the
 * card with its one _Gjort_, this week's rows, a free day into the composer,
 * and the way to the full view. What each state says is tested on the
 * presenter (`__calm-today.test.ts`) and through the loader
 * (`index.calm.test.ts`); this proves the screen offers exactly those
 * actions and nothing more.
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { beforeAll, expect, test, vi } from 'vitest'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import IndexRoute from './index.tsx'

vi.mock('remix-utils/sse/react', () => ({
	useEventSource: () => null,
}))

// Wednesday 2 January 2030, midday UTC.
const NOW = new Date('2030-01-02T12:00:00Z')

beforeAll(() => {
	if (!('ResizeObserver' in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver
	}
})

function session(
	id: string,
	at: string,
	title: string,
	status = 'scheduled',
): LedgerSession {
	return {
		id,
		scheduledAt: new Date(at),
		status,
		source: 'generated',
		adoptedAt: null,
		releasedAt: null,
		countsInNoTrack: false,
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		replanReason: null,
		workout: {
			id: `w-${id}`,
			title,
			description: null,
			discipline: 'run',
			intent: 'endurance',
			archetype: null,
			activityKind: null,
			effortWord: null,
			blocks: [],
		},
		recording: null,
		sessionLog: null,
		setLogs: [],
	}
}

function plan(): ActivePlan {
	return {
		eventId: null,
		eventName: null,
		eventDate: null,
		planStart: new Date('2029-12-17T00:00:00Z'),
		phases: [{ name: 'Grunntrening', weeks: 4 }],
		weeklyTss: [null, null, null, null],
		round: 1,
		tracks: [],
		weekRoles: ['loading', 'loading', 'loading', 'recovery'],
		fillsWeeks: false,
		family: 'polarized',
		loadBasis: { tracks: [], conventions: [], formulae: [], substitutions: [] },
	}
}

function renderToday({
	ledger = [],
	activePlan = plan(),
}: { ledger?: LedgerSession[]; activePlan?: ActivePlan | null } = {}) {
	const loader = async (_args: LoaderFunctionArgs) => ({
		isAuthenticated: true as const,
		now: NOW,
		ledger,
		current: null,
		tsbTrust: { trustworthy: false, daysOfHistory: 0, requiredDays: 42 },
		activePlan,
		sustained: null,
		thresholds: {},
		loadRecomputeNotice: null,
		sourceCredits: [],
		stampDiscipline: 'run' as const,
	})
	const App = createRoutesStub([
		{
			path: '/resources/week-sum',
			loader: () => ({ day: null, week: null }),
		},
		{
			path: '/resources/sentence-exercises',
			loader: () => ({ exercises: [] }),
		},
		{
			path: '/',
			Component: (props: Record<string, unknown>) => (
				<IndexRoute {...(props as any)} />
			),
			loader,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/']} />)
}

test("I dag opens on today's card with one large Gjort, then this week", async () => {
	renderToday({
		ledger: [
			session('mon', '2029-12-31T07:00:00Z', 'Mandagstur'),
			session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur'),
			session('fri', '2030-01-04T07:00:00Z', 'Fredagsintervaller'),
		],
	})

	const card = await screen.findByRole('region', { name: 'Rolig løpetur' })
	expect(
		within(card).getByRole('button', {
			name: 'Marker «Rolig løpetur» som gjort',
		}),
	).toBeInTheDocument()
	expect(screen.getByRole('heading', { name: 'Denne uka' })).toBeInTheDocument()
	expect(screen.getByText('0 av 3 økter gjort')).toBeInTheDocument()
	expect(screen.getAllByRole('listitem')).toHaveLength(7)
})

test('no session still ahead offers done or missed, and Marker som ikke gjort is nowhere', async () => {
	renderToday({
		ledger: [
			session('mon', '2029-12-31T07:00:00Z', 'Mandagstur'),
			session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur'),
			session('fri', '2030-01-04T07:00:00Z', 'Fredagsintervaller'),
		],
	})

	await screen.findByRole('region', { name: 'Rolig løpetur' })
	const friday = document.querySelector('[data-calm-session="fri"]')!
	expect(within(friday as HTMLElement).queryByRole('button')).toBeNull()
	// Monday is behind today and not done: ikke gjort, with Gjort under it.
	const monday = document.querySelector(
		'[data-calm-session="mon"]',
	) as HTMLElement
	expect(within(monday).getByRole('button', { name: /gjort/i })).toBeTruthy()
	expect(screen.queryByText(/Marker som ikke gjort/)).toBeNull()
})

test('a free day is fri, and tapping it opens the composer', async () => {
	const user = userEvent.setup()
	renderToday({
		ledger: [session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur')],
	})

	await screen.findByRole('region', { name: 'Rolig løpetur' })
	expect(screen.queryByText(/hvile/)).toBeNull()
	const thursday = document.querySelector(
		'[data-calm-free="2030-01-03"]',
	) as HTMLElement
	expect(thursday).toHaveTextContent('fri')
	await user.click(thursday)

	expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

test('a free today says Fri i dag and names the next session', async () => {
	renderToday({
		ledger: [session('fri', '2030-01-04T07:00:00Z', 'Fredagsintervaller')],
	})

	const card = await screen.findByRole('region', { name: 'Fri i dag' })
	expect(card).toHaveTextContent('Neste økt: Fredagsintervaller, fredag')
})

test('Se hele sesongen leads to the full Home Timeline', async () => {
	renderToday()

	const link = await screen.findByRole('link', { name: 'Se hele sesongen' })
	expect(link).toHaveAttribute('href', '/season')
})

test('with no plan, I dag invites the athlete to the start instead of an empty calendar', async () => {
	renderToday({ activePlan: null })

	const card = await screen.findByRole('region', {
		name: 'Du har ingen plan ennå',
	})
	expect(
		within(card).getByRole('link', { name: 'Kom i gang' }),
	).toHaveAttribute('href', '/start')
	expect(
		within(card).getByRole('button', { name: /Legg til en økt i dag/ }),
	).toBeInTheDocument()
})
