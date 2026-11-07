/**
 * **Hjemsted** in _Meg_ (#433, ADR 0112 §2): the athlete's **Home Place**,
 * found by name in Kartverket's place names, used only for the weather on I
 * dag. Picking a match saves it at once; _Fjern_ removes it at once (cheap to
 * undo: search again). Without one, I dag shows no weather at all.
 *
 * Search, choose and remove are this route's own actions, web only: setting
 * the place over MCP is out of scope, and the registry grows slice by slice
 * (ADR 0092 §9). The search is a POST so the text never lands in a URL the
 * access log writes down, and it is never stored.
 *
 * The search is built on `command.tsx` (cmdk) with its filtering off, since
 * the server's matches are the list, inside `input-group.tsx`'s field. No
 * motion on the results: they appear; a row's press is a tint.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Command as CommandPrimitive } from 'cmdk'
import { useEffect, useRef, useState } from 'react'
import { data, useFetcher } from 'react-router'
import { PageHeader } from '#app/components/page-header.tsx'
import {
	Command,
	CommandItem,
	CommandList,
} from '#app/components/ui/command.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { InputGroup, InputGroupAddon } from '#app/components/ui/input-group.tsx'
import { WeatherGlyph } from '#app/components/weather-glyph.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	HomePlaceInputSchema,
	readHomePlace,
	removeHomePlace,
	setHomePlace,
} from '#app/utils/home-place.server.ts'
import { APP_TAB_LABELS, HOME_PLACE_LABELS as L } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	PLACE_SEARCH_MAX_LENGTH,
	type PlaceMatch,
} from '#app/utils/place-search/place-match.ts'
import { searchPlaces } from '#app/utils/place-search/search.server.ts'
import { type Route } from './+types/hjemsted.ts'
import { MegNote } from './__meg-ui.tsx'

export const handle: SEOHandle = { getSitemapEntries: () => null }

export const meta: Route.MetaFunction = () => [
	{ title: `${L.title} | Trainm8` },
]

/** How long typing rests before the search asks Kartverket. */
const SEARCH_DEBOUNCE_MS = 300

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	return { place: await readHomePlace(userId) }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const form = await request.formData()
	const intent = form.get('intent')
	if (intent === 'search') {
		const text = String(form.get('q') ?? '')
			.trim()
			.slice(0, PLACE_SEARCH_MAX_LENGTH)
		return { intent: 'search' as const, text, result: await searchPlaces(text) }
	}
	if (intent === 'set') {
		const parsed = HomePlaceInputSchema.safeParse(Object.fromEntries(form))
		if (!parsed.success) {
			return data(
				{ intent: 'set' as const, ok: false as const, error: L.invalid },
				{ status: 400 },
			)
		}
		const saved = await setHomePlace(userId, parsed.data)
		if (!saved.ok) {
			return data(
				{ intent: 'set' as const, ok: false as const, error: L.outsideArea },
				{ status: 400 },
			)
		}
		return {
			intent: 'set' as const,
			ok: true as const,
			message: L.saved(saved.place.name),
		}
	}
	if (intent === 'remove') {
		await removeHomePlace(userId)
		return { intent: 'remove' as const, ok: true as const, message: L.removed }
	}
	throw new Response('Unknown intent', { status: 400 })
}

export default function HomePlaceRoute({ loaderData }: Route.ComponentProps) {
	const { place } = loaderData
	const search = useFetcher<typeof action>()
	const write = useFetcher<typeof action>()
	const [query, setQuery] = useState('')
	const text = query.trim()

	// Every query is asked again, a no-match's retyping too (design #433 note
	// 11), once the typing rests; the answer shown is the one for this text.
	const submitSearch = useRef(search.submit)
	submitSearch.current = search.submit
	const askNow = (value: string) =>
		void submitSearch.current(
			{ intent: 'search', q: value },
			{ method: 'POST' },
		)
	useEffect(() => {
		if (!text) return
		const timer = setTimeout(() => askNow(text), SEARCH_DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [text])

	const answer =
		search.data?.intent === 'search' && search.data.text === text
			? search.data.result
			: null
	const places = answer?.status === 'found' ? answer.places : []
	const pending = text !== '' && !answer

	// A saved place clears the search: the card above now says it.
	const written = write.data
	useEffect(() => {
		if (written?.intent === 'set' && written.ok) setQuery('')
	}, [written])

	const choose = (match: PlaceMatch) =>
		void write.submit(
			{
				intent: 'set',
				name: match.name,
				kind: match.kind,
				municipality: match.municipality,
				county: match.county,
				latitude: String(match.latitude),
				longitude: String(match.longitude),
			},
			{ method: 'POST' },
		)

	return (
		<div className="container mx-auto max-w-md py-6 md:py-8">
			<PageHeader
				title={L.title}
				back={{ to: '/me', label: APP_TAB_LABELS.me }}
			/>
			<main className="mt-6 flex flex-col gap-6">
				{place ? (
					<section
						aria-label={L.current}
						data-home-place
						className="bg-card ring-foreground/5 dark:ring-foreground/10 flex items-center gap-3 rounded-4xl p-4 shadow-xs ring-1"
					>
						<WeatherGlyph
							glyph="map-pin"
							className="text-muted-foreground size-5"
						/>
						<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
							<span className="text-callout block font-semibold">
								{place.name}
							</span>
							<span className="text-footnote text-muted-foreground block">
								{L.matchLine(place.kind, place.municipality, place.county)}
							</span>
						</span>
						<write.Form method="POST">
							<button
								type="submit"
								name="intent"
								value="remove"
								aria-label={L.removeFor(place.name)}
								className="text-footnote text-primary pressable min-h-11 min-w-11 rounded-full px-3 font-semibold"
							>
								{L.remove}
							</button>
						</write.Form>
					</section>
				) : null}

				{/* Live regions stay in the accessibility tree while empty (out of
				    the layout, not hidden), so a screen reader announces them when
				    they fill. */}
				<p role="status" className="text-footnote empty:sr-only">
					{written?.ok ? written.message : null}
				</p>
				{written && 'error' in written ? (
					<p role="alert" className="text-footnote text-destructive">
						{written.error}
					</p>
				) : null}

				<Command
					shouldFilter={false}
					label={L.searchLabel}
					className="gap-2 overflow-visible bg-transparent p-0"
				>
					<span aria-hidden className="text-footnote font-medium">
						{L.searchLabel}
					</span>
					<InputGroup className="h-11">
						<InputGroupAddon>
							<Icon
								name="magnifying-glass"
								aria-hidden="true"
								className="size-4 opacity-60"
							/>
						</InputGroupAddon>
						<CommandPrimitive.Input
							data-slot="input-group-control"
							value={query}
							onValueChange={(value) =>
								setQuery(value.slice(0, PLACE_SEARCH_MAX_LENGTH))
							}
							onKeyDown={(event) => {
								// With nothing to pick yet, Enter asks at once.
								if (event.key === 'Enter' && text && places.length === 0) {
									askNow(text)
								}
							}}
							inputMode="search"
							enterKeyHint="search"
							aria-describedby="home-place-helper"
							className="h-full min-w-0 flex-1 bg-transparent pr-3 text-base outline-none"
						/>
					</InputGroup>
					<MegNote id="home-place-helper">{L.helper}</MegNote>

					<CommandList
						label={L.results}
						className={cn('max-h-none', places.length === 0 && 'hidden')}
					>
						{places.map((match) => (
							<CommandItem
								key={match.id}
								value={match.id}
								onSelect={() => choose(match)}
								data-home-place-match={match.id}
								className="duration-press min-h-14 rounded-2xl px-3 py-2 transition-colors ease-out"
							>
								<span className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
									<span className="text-callout">{match.name}</span>
									<span className="text-footnote text-muted-foreground font-normal">
										{L.matchLine(match.kind, match.municipality, match.county)}
									</span>
								</span>
							</CommandItem>
						))}
					</CommandList>
				</Command>

				<div aria-live="polite" className="text-footnote empty:sr-only">
					{pending && search.state !== 'idle' ? (
						<p className="text-muted-foreground">{L.searching}</p>
					) : answer?.status === 'unavailable' ? (
						<p data-home-place-unavailable>{L.unavailable}</p>
					) : answer?.status === 'found' && places.length === 0 ? (
						<p data-home-place-no-match>{L.noMatch(text)}</p>
					) : null}
				</div>

				<footer className="text-caption text-muted-foreground flex flex-col gap-1">
					<a
						href={L.creditHref}
						target="_blank"
						rel="noreferrer"
						// A caption-high link: an invisible hit area brings it to 44px.
						className="relative self-start underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3.5 hover:underline"
					>
						{L.credit}
					</a>
					<p>{L.privacy}</p>
				</footer>
			</main>
		</div>
	)
}
