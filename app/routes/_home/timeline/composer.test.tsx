/**
 * @vitest-environment jsdom
 *
 * The session composer on a phone (owner decisions 1, 2, 4, 5, 7 and 11,
 * round 2; ADR 0088): every "+" opens one Drawer, the composer in it writes
 * through one path, and every write comes back with one way to undo it — on
 * the toast and on the row it landed as.
 *
 * The week is handed in directly, as `stream.test.tsx` does, and home's action
 * is a stub that records what the composer posts: the claims here are about
 * what the athlete sees and what one tap sends. The server's half — that a
 * post writes what it says — is `index.writing-line.test.ts` and
 * `index.composer.test.ts`.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { Toaster } from 'sonner'
import { beforeEach, expect, test } from 'vitest'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { parseWorkoutSentence } from '#app/utils/workout-sentence.ts'
import { type ComposerSourceItem } from '../../resources/composer-sources.tsx'
import { ComposerProvider } from './composer-context.tsx'
import { ComposerDrawer } from './composer-drawer.tsx'
import {
	type TimelineDay,
	type TimelineSession,
	type TimelineWeek,
} from './presenter.ts'
import { WeekBlock } from './stream.tsx'

const TODAY = '2030-02-20'

function session(overrides: Partial<TimelineSession> = {}): TimelineSession {
	return {
		id: 'session-1',
		to: '/training/sessions/session-1',
		discipline: 'run',
		disciplineLabel: 'Løping',
		title: '45 min rolig',
		status: 'planned',
		bars: [],
		groups: [],
		externalLoad: null,
		internalLoad: null,
		chips: [],
		owner: 'athlete',
		ownerLabel: 'din økt',
		ownerNote: 'Appen endrer den ikke uten å spørre.',
		volumeLabel: '45 min',
		annet: { inAnnet: false, actionLabel: 'Tell i Annet' },
		release: null,
		strengthLog: null,
		extraLabel: null,
		importLink: null,
		doneNote: null,
		markDone: null,
		...overrides,
	}
}

function day(key: string, overrides: Partial<TimelineDay> = {}): TimelineDay {
	const date = String(Number(key.slice(8, 10)))
	return {
		key,
		dayLabel: 'Fre',
		dateLabel: date,
		dayOfMonth: date,
		isToday: key === TODAY,
		restPrescribed: false,
		sessions: [],
		...overrides,
	}
}

function week(rows: TimelineDay[], key = '2030-02-18'): TimelineWeek {
	return {
		key,
		rangeLabel: '18.–24. feb',
		plannedTss: null,
		doneTss: null,
		imported: false,
		planStart: false,
		isNow: key === '2030-02-18',
		rows,
		tracks: [],
		otherTrack: null,
		relativeName: 'Denne uka',
		phaseName: null,
		role: null,
		roleLabel: null,
		kindLabel: null,
		shape: key < '2030-02-18' ? 'past' : 'open',
		opensHorizon: false,
		summary: null,
		loadLine: '0 av 0 gjort',
	} as TimelineWeek
}

const SIX_BY_THOUSAND = parseWorkoutSentence('6x1000 m terskel p 90 s', {
	discipline: 'run',
}).structure!

const LIBRARY: ComposerSourceItem[] = [
	{
		id: 'workout-terskel',
		title: 'Terskel 6 × 1000 m',
		discipline: 'run',
		label: 'Terskel',
		sentence: '6x1000 m terskel p 90 s',
		notation: { blocks: [] },
		summed: SIX_BY_THOUSAND,
	},
]
const COPY: ComposerSourceItem[] = [
	{
		id: 'session-last-tuesday',
		title: 'Bakkeintervaller',
		discipline: 'run',
		label: 'tirsdag 12. feb',
		// A climb the line has no word for: copied whole.
		sentence: null,
		notation: { blocks: [] },
		summed: SIX_BY_THOUSAND,
	},
]

let posts: Array<Record<string, string>>
let exerciseLoads: number

function renderComposer({
	weeks = [week([day(TODAY), day('2030-02-22')])],
	prefill = 'run',
	reply = (form: Record<string, string>) =>
		form.intent === 'undo-stamp'
			? { undone: true }
			: {
					stampedSessionId: 'new-1',
					weekSumLine: 'Løping denne uka: 0 → 6 km.',
				},
}: {
	weeks?: TimelineWeek[]
	prefill?: Discipline | null
	reply?: (form: Record<string, string>) => unknown
} = {}) {
	const App = createRoutesStub([
		{
			path: '/resources/week-sum',
			loader: ({ request }) => ({
				day: new URL(request.url).searchParams.get('day'),
				week: {
					weekName: 'Denne uka',
					volumes: {
						weekKey: '2030-02-18',
						tracks: [
							{
								trackId: 'run',
								discipline: 'run',
								currency: 'km',
								target: 40,
								planned: 0,
								done: 0,
								plannedUnmeasuredCount: 0,
								doneUnmeasuredCount: 0,
							},
							{
								trackId: 'strength',
								discipline: 'strength',
								currency: 'sets',
								target: 16,
								planned: 6,
								done: 0,
								plannedUnmeasuredCount: 0,
								doneUnmeasuredCount: 0,
							},
						],
						other: null,
					},
				},
			}),
		},
		{
			path: '/resources/sentence-exercises',
			loader: () => {
				exerciseLoads += 1
				return {
					exercises: [
						{ id: 'ex-squat', name: 'Back Squat' },
						{ id: 'ex-bench', name: 'Bench Press' },
						{ id: 'ex-row', name: 'Barbell Row' },
					],
				}
			},
		},
		{
			path: '/resources/composer-sources',
			loader: ({ request }) => ({
				day: new URL(request.url).searchParams.get('day'),
				firstDayKey: '2029-08-01',
				library: LIBRARY,
				copy: { weekKey: '2030-02-11', weeksBack: 1, items: COPY },
			}),
		},
		{
			path: '/',
			action: async ({ request }) => {
				const form = Object.fromEntries(await request.formData()) as Record<
					string,
					string
				>
				posts.push(form)
				return reply(form)
			},
			Component: () => (
				<ComposerProvider
					prefill={prefill}
					thresholds={{}}
					todayKey={TODAY}
					minDayKey="2029-08-01"
					container="drawer"
				>
					{weeks.map((w) => (
						<WeekBlock key={w.key} week={w} anchorDayKey={TODAY} />
					))}
					<ComposerDrawer weeks={weeks} today={null} />
					<Toaster />
				</ComposerProvider>
			),
		},
	])
	render(<App initialEntries={['/']} />)
}

beforeEach(() => {
	posts = []
	exerciseLoads = 0
	Element.prototype.scrollIntoView = () => {}
})

async function openOn(name: RegExp | string) {
	await userEvent.click(screen.getByRole('button', { name }))
	return screen.findByRole('dialog')
}

test('a free day’s “+” opens the composer in a Drawer, on that day, with the stamp as its empty state', async () => {
	renderComposer({ prefill: 'bike' })
	const drawer = await openOn('Legg inn en økt Fre 22')

	expect(drawer).toHaveAccessibleName('Ny økt')
	expect(drawer.querySelector('[data-composer]')).toHaveAttribute(
		'data-composer-day',
		'2030-02-22',
	)
	// The day strip: the week, with the day pressed and today ringed.
	expect(
		within(drawer).getByRole('button', { name: 'fredag 22. feb' }),
	).toHaveAttribute('aria-pressed', 'true')
	// Four sources, the app's shown and not yet working (owner decision 7).
	expect(within(drawer).getByRole('button', { name: /Skriv/ })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	expect(
		within(drawer).getByRole('button', { name: /Appen\s*kommer/ }),
	).toBeDisabled()
	// The sport is the athlete's most-trained, and Annet is one of them.
	expect(
		within(drawer).getByRole('button', { name: 'Sykling' }),
	).toHaveAttribute('aria-pressed', 'true')
	expect(
		within(drawer).getByRole('button', { name: 'Annet' }),
	).toBeInTheDocument()
	// An empty line is the stamp, with what it does to the week.
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Legg til 45 min Z2' }),
	)
	await waitFor(() => expect(posts).toHaveLength(1))
	expect(posts[0]).toEqual({
		intent: 'stamp-day',
		date: '2030-02-22',
		discipline: 'bike',
		landing: 'toast',
	})
})

test('a typed line reads back as tokens and the week sum, and Enter writes it', async () => {
	renderComposer()
	const drawer = await openOn('Legg inn en økt Fre 22')
	const line = within(drawer).getByRole('textbox', { name: 'Skriv økta' })
	expect(line).toHaveAttribute('enterkeyhint', 'done')
	await userEvent.type(line, '6x1000 m terskel p 90 s')

	expect(drawer.querySelector('[data-composer-understood]')).not.toBeNull()
	await waitFor(() =>
		expect(drawer.querySelector('[data-composer-week-sum]')).toHaveTextContent(
			'Løping denne uka: 0 → 6 km, målet står på 40',
		),
	)
	await userEvent.keyboard('{Enter}')
	await waitFor(() => expect(posts).toHaveLength(1))
	expect(posts[0]).toMatchObject({
		intent: 'write-session',
		date: '2030-02-22',
		discipline: 'run',
		sentence: '6x1000 m terskel p 90 s',
		landing: 'toast',
	})
	// The write landed: the Drawer leaves, and the toast says what it did.
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	expect(
		await screen.findByText('Løping denne uka: 0 → 6 km.'),
	).toBeInTheDocument()
})

test('Styrke writes lifts through the line: the nearest name for an unknown lift, the week sum in sets, and no way off I dag (ADR 0089)', async () => {
	renderComposer()
	const drawer = await openOn('Legg inn en økt Fre 22')
	const line = within(drawer).getByRole('textbox', { name: 'Skriv økta' })
	// A run never asks for the exercise catalogue.
	await userEvent.type(line, '45 min rolig')
	expect(exerciseLoads).toBe(0)
	await userEvent.clear(line)

	await userEvent.click(within(drawer).getByRole('button', { name: 'Styrke' }))
	expect(line).toHaveAttribute(
		'placeholder',
		expect.stringMatching(/Knebøy 5×5 @ 80 kg/),
	)
	// Nothing is stamped for strength: a lift has to be named.
	expect(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	).toBeDisabled()
	await waitFor(() => expect(exerciseLoads).toBe(1))

	await userEvent.type(line, 'Knebøj 5×5 @ 82,5 kg · Benkpress 5×5 @ 60 kg')
	expect(
		await within(drawer).findByText('Finner ikke øvelsen «Knebøj»'),
	).toBeInTheDocument()
	expect(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	).toBeDisabled()
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Bytt «Knebøj» med «Knebøy»' }),
	)
	expect(line).toHaveValue('Knebøy 5×5 @ 82,5 kg · Benkpress 5×5 @ 60 kg')

	// The echo names the lifts as the catalogue does, and the week counts sets.
	const understood = drawer.querySelector('[data-composer-understood]')
	expect(understood).toHaveTextContent('Back Squat')
	expect(understood).toHaveTextContent('Bench Press')
	expect(understood).toHaveTextContent('Til sammen 10 sett')
	await waitFor(() =>
		expect(drawer.querySelector('[data-composer-week-sum]')).toHaveTextContent(
			'Styrke denne uka: 6 → 16 sett, målet står på 16',
		),
	)

	// Gjør grundigere lists the lifts and never offers the full editor.
	await userEvent.click(
		within(drawer).getByRole('button', { name: /Gjør grundigere/ }),
	)
	const deep = await waitFor(() => {
		const node = drawer.querySelector('[data-composer-deep]')
		expect(node).not.toBeNull()
		return node as HTMLElement
	})
	expect(
		deep.querySelector('[data-composer-lift="ex-squat"]'),
	).toHaveTextContent('82,5 kg × 5 · 5 · 5 · 5 · 5')
	expect(
		within(deep).queryByRole('link', { name: 'Åpne hele editoren' }),
	).toBeNull()

	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	)
	await waitFor(() => expect(posts).toHaveLength(1))
	expect(posts[0]).toMatchObject({
		intent: 'write-session',
		date: '2030-02-22',
		discipline: 'strength',
		sentence: 'Knebøy 5×5 @ 82,5 kg · Benkpress 5×5 @ 60 kg',
		landing: 'toast',
	})
})

test('a word the reader does not know is said where it stands, with a fix, and writes nothing', async () => {
	renderComposer()
	const drawer = await openOn('Legg inn en økt Fre 22')
	await userEvent.type(
		within(drawer).getByRole('textbox', { name: 'Skriv økta' }),
		'45 min rolgi',
	)
	expect(within(drawer).getByText('Kjenner ikke «rolgi»')).toBeInTheDocument()
	expect(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	).toBeDisabled()
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Bytt «rolgi» med «rolig»' }),
	)
	expect(
		within(drawer).getByRole('textbox', { name: 'Skriv økta' }),
	).toHaveValue('45 min rolig')
	expect(within(drawer).getByRole('button', { name: 'Legg til' })).toBeEnabled()
})

test('Annet is chosen when writing, and the session counts in no track (owner decision 4)', async () => {
	renderComposer()
	const drawer = await openOn('Legg inn en økt Fre 22')
	await userEvent.click(within(drawer).getByRole('button', { name: 'Annet' }))
	const line = within(drawer).getByRole('textbox', { name: 'Skriv økta' })
	await userEvent.type(line, '25 min')
	expect(
		within(drawer).getByText(
			'Si hvilken idrett i linja: «25 min sykkel til jobb».',
		),
	).toBeInTheDocument()
	await userEvent.type(line, ' sykkel')
	await waitFor(() =>
		expect(drawer.querySelector('[data-composer-week-sum]')).toHaveTextContent(
			'Teller i Annet — ingen ukesum flytter seg',
		),
	)
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	)
	await waitFor(() => expect(posts).toHaveLength(1))
	expect(posts[0]).toMatchObject({
		intent: 'write-session',
		discipline: '',
		sentence: '25 min sykkel',
		annet: 'true',
	})
})

test('a past day offers “Allerede gjort”, on, and the write says done (owner decision 5)', async () => {
	renderComposer({
		weeks: [week([day('2030-01-07', { dayLabel: 'Man' })], '2030-01-07')],
	})
	const drawer = await openOn('Legg inn en økt Man 7')
	const done = within(drawer).getByRole('switch', { name: 'Allerede gjort' })
	expect(done).toBeChecked()
	await userEvent.type(
		within(drawer).getByRole('textbox', { name: 'Skriv økta' }),
		'10 km rolig',
	)
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	)
	await waitFor(() => expect(posts).toHaveLength(1))
	expect(posts[0]).toMatchObject({ date: '2030-01-07', done: 'true' })
})

test('today and ahead have no “Allerede gjort”', async () => {
	renderComposer()
	const drawer = await openOn('Legg inn en økt Fre 22')
	expect(within(drawer).queryByRole('switch')).toBeNull()
})

test('Bibliotek fills the line with the session as tokens; untouched, it is placed from the Catalogue', async () => {
	renderComposer()
	const drawer = await openOn('Legg inn en økt Fre 22')
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Bibliotek' }),
	)
	await userEvent.click(
		await within(drawer).findByRole('button', {
			name: 'Bruk Terskel 6 × 1000 m',
		}),
	)
	expect(
		within(drawer).getByRole('textbox', { name: 'Skriv økta' }),
	).toHaveValue('6x1000 m terskel p 90 s')
	expect(
		within(drawer).getByText('Fra biblioteket — blir din når du endrer den'),
	).toBeInTheDocument()
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	)
	await waitFor(() => expect(posts).toHaveLength(1))
	expect(posts[0]).toEqual({
		intent: 'place-session',
		date: '2030-02-22',
		workoutId: 'workout-terskel',
	})
})

test('Kopier picks last week’s session; one the line cannot say is copied whole', async () => {
	renderComposer()
	const drawer = await openOn('Legg inn en økt Fre 22')
	await userEvent.click(within(drawer).getByRole('button', { name: 'Kopier' }))
	await userEvent.click(
		await within(drawer).findByRole('button', {
			name: 'Bruk Bakkeintervaller',
		}),
	)
	expect(
		within(drawer).getByText(/Linja kan ikke si hele økta/),
	).toBeInTheDocument()
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	)
	await waitFor(() => expect(posts).toHaveLength(1))
	expect(posts[0]).toEqual({
		intent: 'copy-session',
		date: '2030-02-22',
		sessionId: 'session-last-tuesday',
	})
})

test('a write that comes back with nothing keeps the composer open on what was written, and says so', async () => {
	renderComposer({ reply: () => ({ oops: true }) })
	const drawer = await openOn('Legg inn en økt Fre 22')
	const line = within(drawer).getByRole('textbox', { name: 'Skriv økta' })
	await userEvent.type(line, '45 min rolig')
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	)
	expect(
		await within(drawer).findByText(
			'Det ble ikke lagret. Ingenting ble skrevet — prøv igjen.',
		),
	).toBeInTheDocument()
	expect(line).toHaveValue('45 min rolig')
	expect(within(drawer).getByRole('button', { name: 'Legg til' })).toBeEnabled()
})

test('the landed row carries Angre, and so does the toast — one way back (ADR 0088)', async () => {
	renderComposer({
		weeks: [
			week([
				day(TODAY),
				day('2030-02-22', { sessions: [session({ id: 'new-1' })] }),
			]),
		],
	})
	// A day with a session offers one more, through the same composer.
	const drawer = await openOn('Legg til en økt til Fre 22')
	await userEvent.type(
		within(drawer).getByRole('textbox', { name: 'Skriv økta' }),
		'45 min rolig',
	)
	await userEvent.click(
		within(drawer).getByRole('button', { name: 'Legg til' }),
	)

	const row = await waitFor(() => {
		const el = document.querySelector('[data-session-row="new-1"]')!
		expect(el).toHaveAttribute('data-landed')
		return el as HTMLElement
	})
	const toast = await screen.findByText('Løping denne uka: 0 → 6 km.')
	expect(toast.closest('[data-sonner-toast]')).toHaveTextContent('Angre')

	await userEvent.click(
		within(row).getByRole('button', { name: 'Angre 45 min rolig' }),
	)
	await waitFor(() =>
		expect(posts.at(-1)).toEqual({ intent: 'undo-stamp', sessionId: 'new-1' }),
	)
	// One undo: the row lets go of its Angre and the toast leaves.
	await waitFor(() => expect(row).not.toHaveAttribute('data-landed'))
})

test('a session row and its glyph open the same Drawer at full, as the session’s details', async () => {
	renderComposer({
		weeks: [week([day('2030-02-22', { sessions: [session()] }), day(TODAY)])],
	})
	await userEvent.click(
		screen.getByRole('button', {
			name: /din økt.*45 min rolig|45 min rolig.*din økt/i,
		}),
	)
	const drawer = await screen.findByRole('dialog')
	expect(drawer).toHaveAccessibleName('45 min rolig')
	expect(drawer).toHaveTextContent('din økt')
	expect(
		within(drawer).getByRole('link', { name: 'Rediger 45 min rolig' }),
	).toHaveAttribute('href', '/training/sessions/session-1')
	expect(
		within(drawer).getByRole('button', { name: 'Tell i Annet' }),
	).toBeInTheDocument()
	// No popover is stacked over the Drawer: the details are in it.
	expect(document.querySelector('[data-owner-popover]')).toBeNull()
})

test('Avbryt closes the composer and writes nothing', async () => {
	renderComposer()
	const drawer = await openOn('Legg inn en økt Fre 22')
	await userEvent.click(within(drawer).getByRole('button', { name: 'Avbryt' }))
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	expect(posts).toHaveLength(0)
})
