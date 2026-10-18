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
import { type AutopilotNotice } from '#app/utils/load/autopilot-notice.ts'
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
	autopilotNotice = null,
	onAutopilotPost = () => {},
	onAdjustPost = () => {},
}: {
	ledger?: LedgerSession[]
	activePlan?: ActivePlan | null
	autopilotNotice?: AutopilotNotice | null
	onAutopilotPost?: (form: FormData) => void
	onAdjustPost?: (form: FormData) => void
} = {}) {
	const loader = async (_args: LoaderFunctionArgs) => ({
		autopilotNotice,
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
			path: '/resources/autopilot',
			action: async ({ request }: { request: Request }) => {
				onAutopilotPost(await request.formData())
				return { ok: true, toast: 'Endringen er angret.', submission: null }
			},
		},
		{
			path: '/resources/session-swap',
			loader: ({ request }: { request: Request }) => {
				const from = new URL(request.url).searchParams.get('from')
				return {
					from,
					q: '',
					rows:
						from === 'catalogue'
							? [
									{
										id: 'stock-ride',
										title: 'Rolig sykkeltur',
										sentence: null,
										figures: ['45 min'],
									},
								]
							: [],
					total: from === 'catalogue' ? 1 : 0,
				}
			},
		},
		{
			path: '/resources/session-adjust',
			action: async ({ request }: { request: Request }) => {
				onAdjustPost(await request.formData())
				return {
					submission: { status: 'success' },
					result: {
						ok: true,
						toast: 'Dagens økt er byttet til «Rolig sykkeltur».',
						title: 'Rolig sykkeltur',
						changedSessionIds: ['today'],
						undo: { adjustmentId: 'adj-1' },
					},
					undone: null,
				}
			},
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
	return render(<App initialEntries={['/']} />)
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

/** A notice for the week that closed on Sunday 30 Dec, as the reader builds it. */
function notice(
	lines: AutopilotNotice['lines'],
	extra: Partial<AutopilotNotice> = {},
): AutopilotNotice {
	return {
		closedWeekKey: '2029-12-24',
		comingWeekKey: '2029-12-31',
		heading: 'Neste uke er lagt ut',
		begun: false,
		showEase: true,
		seen: true,
		lines,
		unlaidLine: null,
		undoable: lines.filter((line) => line.undo === 'offered').length,
		closedLine: null,
		eased: null,
		...extra,
	}
}

const CHANGED = {
	kind: 'changed' as const,
	subject: '«Fredagsintervaller» · fredag',
	text: 'Økta er gjort ca. 15 % kortere.',
	undo: 'offered' as const,
}

test('under autopilot, Neste uke er lagt ut sits above the week, one line per change with Angre', async () => {
	const user = userEvent.setup()
	const posts: FormData[] = []
	renderToday({
		ledger: [session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur')],
		autopilotNotice: notice([
			{ ...CHANGED, proposalId: 'p1' },
			{ ...CHANGED, proposalId: 'p2', subject: '«Langtur» · søndag' },
			{
				proposalId: 'p3',
				kind: 'left-alone',
				subject: null,
				text: 'Lørdagens «Styrke» er din, den står.',
				undo: null,
			},
		]),
		onAutopilotPost: (form) => posts.push(form),
	})

	const region = await screen.findByRole('region', {
		name: 'Neste uke er lagt ut',
	})
	expect(region).toHaveTextContent('Lørdagens «Styrke» er din, den står.')
	expect(
		within(region).getAllByRole('button', { name: /^Angre:/ }),
	).toHaveLength(2)
	expect(
		within(region).getByRole('button', { name: 'Angre alle 2 endringene' }),
	).toBeInTheDocument()
	// Gjør uka lettere stays available (ADR 0100 §5).
	expect(
		within(region).getByRole('button', { name: /Gjør uka lettere/ }),
	).toBeInTheDocument()
	// The notice comes before the week, in reading order.
	const week = screen.getByRole('heading', { name: 'Denne uka' })
	expect(
		region.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()

	await user.click(
		within(region).getByRole('button', {
			name: 'Angre: «Fredagsintervaller» · fredag',
		}),
	)
	await vi.waitFor(() => expect(posts).toHaveLength(1))
	expect(Object.fromEntries(posts[0]!)).toEqual({
		intent: 'undo',
		proposalId: 'p1',
	})
})

test('one change has its Angre and no Angre alt; an undone one says Angret', async () => {
	renderToday({
		ledger: [session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur')],
		autopilotNotice: notice([
			{ ...CHANGED, proposalId: 'p1' },
			{ ...CHANGED, proposalId: 'p2', undo: 'undone' },
		]),
	})

	const region = await screen.findByRole('region', {
		name: 'Neste uke er lagt ut',
	})
	expect(
		within(region).getAllByRole('button', { name: /^Angre:/ }),
	).toHaveLength(1)
	expect(
		within(region).queryByRole('button', { name: /Angre alle/ }),
	).toBeNull()
	expect(region).toHaveTextContent('Angret')
})

test('once its week has begun, the notice says Denne uka and no longer offers Gjør uka lettere', async () => {
	renderToday({
		ledger: [session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur')],
		autopilotNotice: notice(
			[{ ...CHANGED, proposalId: 'p1', undo: 'closed' }],
			{
				heading: 'Denne uka er lagt ut',
				begun: true,
				showEase: false,
				closedLine: 'Uka har begynt, så endringene kan ikke angres lenger.',
			},
		),
	})

	const region = await screen.findByRole('region', {
		name: 'Denne uka er lagt ut',
	})
	expect(
		within(region).queryByRole('button', { name: /Gjør uka lettere/ }),
	).toBeNull()
	expect(within(region).queryByRole('button', { name: /^Angre/ })).toBeNull()
})

test('a week the autopilot could not lay is said in the notice, with why', async () => {
	renderToday({
		ledger: [session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur')],
		autopilotNotice: notice([], {
			unlaidLine:
				'Uka fra mandag 7. januar ble ikke lagt ut: den ligger etter slutten av planen.',
		}),
	})

	const region = await screen.findByRole('region', {
		name: 'Neste uke er lagt ut',
	})
	expect(region).toHaveTextContent(
		'Uka fra mandag 7. januar ble ikke lagt ut: den ligger etter slutten av planen.',
	)
})

test('a notice not yet seen tells the server once it is on screen, and a seen one does not', async () => {
	const fetchSpy = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(new Response(null, { status: 200 }))
	try {
		const { unmount } = renderToday({
			ledger: [session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur')],
			autopilotNotice: notice([{ ...CHANGED, proposalId: 'p1' }], {
				seen: false,
			}),
		})
		await screen.findByRole('region', { name: 'Neste uke er lagt ut' })
		await vi.waitFor(() => expect(seenPosts(fetchSpy)).toHaveLength(1))
		expect(seenPosts(fetchSpy)[0]).toEqual({
			intent: 'seen',
			weekKey: '2029-12-24',
		})
		unmount()

		fetchSpy.mockClear()
		renderToday({
			ledger: [session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur')],
			autopilotNotice: notice([{ ...CHANGED, proposalId: 'p1' }]),
		})
		await screen.findByRole('region', { name: 'Neste uke er lagt ut' })
		expect(seenPosts(fetchSpy)).toHaveLength(0)
	} finally {
		fetchSpy.mockRestore()
	}
})

/** The `seen` posts among the fetches the page made, as their form fields. */
function seenPosts(spy: { mock: { calls: unknown[][] } }) {
	return spy.mock.calls
		.filter(([url]) => String(url) === '/resources/autopilot')
		.map(([, init]) =>
			Object.fromEntries((init as RequestInit).body as FormData),
		)
}

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

test('Bytt økt opens Bibliotek as a picker, and a pick replaces today’s session', async () => {
	const user = userEvent.setup()
	const posts: FormData[] = []
	renderToday({
		ledger: [session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur')],
		onAdjustPost: (form) => posts.push(form),
	})

	const card = await screen.findByRole('region', { name: 'Rolig løpetur' })
	await user.click(
		within(card).getByRole('button', { name: 'Bytt økt: «Rolig løpetur»' }),
	)
	const picker = await screen.findByRole('dialog', { name: 'Bytt økt' })
	expect(within(picker).getByRole('button', { name: 'Katalog' })).toBeTruthy()
	expect(within(picker).getByRole('button', { name: 'Program' })).toBeTruthy()
	expect(within(picker).getByRole('button', { name: 'Øvelser' })).toBeTruthy()
	await user.click(
		await within(picker).findByRole('button', {
			name: 'Ta «Rolig sykkeltur» i dag',
		}),
	)

	await vi.waitFor(() => expect(posts).toHaveLength(1))
	expect(Object.fromEntries(posts[0]!)).toEqual({
		intent: 'swap',
		sessionId: 'today',
		from: 'catalogue',
		pickId: 'stock-ride',
	})
})

test('Avansert leads to the session, the composer and Plan’s Avansert', async () => {
	const user = userEvent.setup()
	renderToday({
		ledger: [session('today', '2030-01-02T07:00:00Z', 'Rolig løpetur')],
	})

	const card = await screen.findByRole('region', { name: 'Rolig løpetur' })
	await user.click(
		within(card).getByRole('button', { name: 'Avansert for «Rolig løpetur»' }),
	)
	const menu = await screen.findByRole('menu')
	expect(
		within(menu).getByRole('menuitem', { name: 'Rediger økta' }),
	).toHaveAttribute('href', '/training/sessions/today')
	expect(
		within(menu).getByRole('menuitem', { name: 'Planens verktøy' }),
	).toHaveAttribute('href', '/training/plan#avansert')
	await user.click(within(menu).getByRole('menuitem', { name: 'Ny økt i dag' }))
	expect(await screen.findByRole('dialog')).toBeInTheDocument()
})
