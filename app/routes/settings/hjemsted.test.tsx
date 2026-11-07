/**
 * @vitest-environment jsdom
 *
 * _Hjemsted_ on screen (#433): typing asks the server, matches show in a
 * listbox with municipality and county, picking saves, no match keeps the
 * text, a silent search says so, and retyping after a no-match asks again.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { beforeAll, expect, test } from 'vitest'
import HomePlaceRoute from './hjemsted.tsx'

beforeAll(() => {
	if (!('ResizeObserver' in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver
	}
	Element.prototype.scrollIntoView ??= () => {}
})

const PLACES = [
	{
		id: '311824',
		name: 'Lillehammer',
		kind: 'By',
		municipality: 'Lillehammer',
		county: 'Innlandet',
		latitude: 61.11514,
		longitude: 10.46628,
	},
	{
		id: '355893',
		name: 'Lillehammer',
		kind: 'Annen kulturdetalj',
		municipality: 'Marker',
		county: 'Østfold',
		latitude: 59.60456,
		longitude: 11.58673,
	},
	{
		id: '503295',
		name: 'Tromsø',
		kind: 'Kommune',
		municipality: 'Tromsø',
		county: 'Troms',
		latitude: 69.65,
		longitude: 18.96,
	},
]

function renderPage({
	unavailable = false,
	place = null as null | (typeof PLACES)[number],
} = {}) {
	const posts: Record<string, string>[] = []
	let saved = place
	const App = createRoutesStub([
		{
			path: '/settings/hjemsted',
			Component: (props: Record<string, unknown>) => (
				<HomePlaceRoute {...(props as any)} />
			),
			loader: () => ({ place: saved }),
			action: async ({ request }: { request: Request }) => {
				const form = Object.fromEntries(await request.formData()) as Record<
					string,
					string
				>
				posts.push(form)
				if (form.intent === 'search') {
					const text = form.q!.trim()
					return {
						intent: 'search',
						text,
						result: unavailable
							? { status: 'unavailable' }
							: {
									status: 'found',
									places: PLACES.filter((p) =>
										p.name.toLowerCase().startsWith(text.toLowerCase()),
									),
								},
					}
				}
				if (form.intent === 'set') {
					saved = PLACES.find((p) => p.name === form.name) ?? null
					return {
						intent: 'set',
						ok: true,
						message: `Lagret. I dag viser været for ${form.name}.`,
					}
				}
				saved = null
				return { intent: 'remove', ok: true, message: 'Fjernet.' }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/settings/hjemsted']} />)
	return { posts }
}

test('matches carry municipality and county, and picking one saves it at once', async () => {
	const user = userEvent.setup()
	const { posts } = renderPage()
	const field = await screen.findByRole('combobox', {
		name: 'Søk etter et sted',
	})
	expect(field).toHaveAttribute('enterkeyhint', 'search')
	expect(
		screen.getByText('Stedet brukes til å vise værvarselet på I dag.'),
	).toBeInTheDocument()
	await user.type(field, 'Lille')
	const list = await screen.findByRole('listbox', { name: 'Steder' })
	const options = await within(list).findAllByRole('option')
	expect(options.map((o) => o.textContent)).toEqual([
		'LillehammerBy · Lillehammer, Innlandet',
		'LillehammerAnnen kulturdetalj · Marker, Østfold',
	])
	await user.click(options[0]!)
	await screen.findByText('Lagret. I dag viser været for Lillehammer.')
	expect(posts.at(-1)).toMatchObject({
		intent: 'set',
		name: 'Lillehammer',
		municipality: 'Lillehammer',
	})
	// The card now says the place, and the field is empty again.
	await screen.findByRole('region', { name: 'Hjemstedet ditt' })
	expect(field).toHaveValue('')
	// The search text went in a POST body, never a URL.
	expect(posts.every((post) => post.intent)).toBe(true)
})

test('a municipality is not named twice', async () => {
	const user = userEvent.setup()
	renderPage()
	await user.type(
		await screen.findByRole('combobox', { name: 'Søk etter et sted' }),
		'Trom',
	)
	expect(await screen.findByRole('option')).toHaveTextContent(
		'TromsøKommune · Troms',
	)
})

test('no match says so and keeps the text; retyping asks again', async () => {
	const user = userEvent.setup()
	renderPage()
	const field = await screen.findByRole('combobox', {
		name: 'Søk etter et sted',
	})
	await user.type(field, 'Lillx')
	await screen.findByText(/^Fant ingen steder som heter «Lillx»\./)
	expect(field).toHaveValue('Lillx')
	await user.type(field, '{Backspace}')
	expect(await screen.findAllByRole('option')).toHaveLength(2)
})

test('a silent search says it does not answer, and the place stays', async () => {
	const user = userEvent.setup()
	renderPage({ unavailable: true, place: PLACES[0]! })
	await screen.findByRole('region', { name: 'Hjemstedet ditt' })
	await user.type(
		screen.getByRole('combobox', { name: 'Søk etter et sted' }),
		'Tromsø',
	)
	await screen.findByText(
		'Stedssøket svarer ikke akkurat nå. Hjemstedet ditt er uendret.',
	)
	expect(
		within(screen.getByRole('region', { name: 'Hjemstedet ditt' })).getByText(
			'Lillehammer',
		),
	).toBeInTheDocument()
})

test('Fjern removes the place at once', async () => {
	const user = userEvent.setup()
	renderPage({ place: PLACES[0]! })
	await user.click(
		await screen.findByRole('button', {
			name: 'Fjern Lillehammer som hjemsted',
		}),
	)
	await waitFor(() =>
		expect(
			screen.queryByRole('region', { name: 'Hjemstedet ditt' }),
		).toBeNull(),
	)
	expect(
		screen.getByRole('link', { name: 'Stedsnavn fra Kartverket' }),
	).toHaveAttribute('href', 'https://www.kartverket.no/')
})
