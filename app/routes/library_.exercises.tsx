/**
 * Every exercise, in Bibliotek (spec #505 story 58, ADR 0083): the exercise
 * bank an athlete can put in a session — the shared corpus and their own — each
 * opening its history. Bibliotek's hub lists only the lifts the athlete has
 * used, so an athlete with none still finds the exercises here.
 *
 * Searched on the server with a plain GET form (`?q=`), so it works before
 * hydration and a search is a URL that can be shared or reloaded. The search
 * reads every name a lift answers to, the Norwegian ones included (owner
 * decision 9): `knebøy` finds the Back Squat (`exercise-search.ts`).
 *
 * **Eight hundred rows, and cheap ones.** Unfiltered the list is the whole
 * corpus. Each row is a plain `<a href>` rather than a router `Link`, and the
 * list carries one click handler that hands a plain left click to the router:
 * 800 `Link`s were 800 components to hydrate, each with its own hooks and
 * listeners, which was the 300–500 ms long task on a throttled phone. The rows
 * also skip rendering while off screen (`content-visibility: auto`), so the
 * browser lays out what is visible. Find-in-page, the URL in the status bar,
 * middle-click and "open in new tab" keep working, because they are anchors.
 * Virtualising was the other option (`@tanstack/react-virtual` is installed);
 * it would drop off-screen rows from the server-rendered page and from
 * find-in-page, for a list that is now cheap without it.
 */
import { type MouseEvent } from 'react'
import { Form, useNavigate } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { LIBRARY_SECTION_HREF } from '#app/utils/app-tabs.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { searchExercises } from '#app/utils/exercise-search.ts'
import {
	APP_TAB_LABELS,
	EXERCISE_LIST_LABELS,
	EXERCISE_SEARCH_LABELS,
	LIBRARY_LABELS,
} from '#app/utils/labels.ts'
import { type Route } from './+types/library_.exercises.ts'

export const meta: Route.MetaFunction = () => [
	{ title: `${LIBRARY_LABELS.allExercises} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const query = (new URL(request.url).searchParams.get('q') ?? '').trim()
	// The catalogue `getExerciseCatalog` serves — trainm8's rows and this
	// athlete's own, by asserted authorship (#469) — with every alias that names
	// the movement. A variant's alias (`DB bench`) is left out, as the writing
	// line leaves it out: it names one realization, not the lift.
	const catalog = await prisma.exercise.findMany({
		where: { OR: [{ authorship: 'system' }, { createdByAthleteId: userId }] },
		select: {
			id: true,
			name: true,
			createdByAthleteId: true,
			aliases: {
				where: { variantId: null },
				select: { text: true, locale: true },
				orderBy: { text: 'asc' },
			},
		},
		orderBy: [{ name: 'asc' }],
	})
	const exercises = searchExercises(catalog, query).map(
		({ exercise, alias }) => ({
			id: exercise.id,
			name: exercise.name,
			alias,
			own: exercise.createdByAthleteId === userId,
		}),
	)
	return { query, exercises }
}

/**
 * A plain left click on a row goes through the router, so the page changes
 * without a reload. Everything else — a modifier, the middle button, a
 * keyboard's own "open in new tab" — is left to the browser, which is what an
 * anchor is for.
 */
function useRowNavigation() {
	const navigate = useNavigate()
	return (event: MouseEvent<HTMLUListElement>) => {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return
		}
		const anchor = (event.target as HTMLElement).closest('a')
		const href = anchor?.getAttribute('href')
		if (!anchor || !href || anchor.target) return
		event.preventDefault()
		void navigate(href)
	}
}

export default function LibraryExercisesRoute({
	loaderData,
}: Route.ComponentProps) {
	const { query, exercises } = loaderData
	const onRowClick = useRowNavigation()
	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={LIBRARY_LABELS.allExercises}
				back={{ to: LIBRARY_SECTION_HREF, label: APP_TAB_LABELS.plan }}
				className="mb-4"
			/>

			<Form method="GET" role="search" className="mb-4 flex gap-2">
				<Input
					type="search"
					name="q"
					defaultValue={query}
					aria-label={EXERCISE_LIST_LABELS.search}
					placeholder={EXERCISE_LIST_LABELS.search}
					enterKeyHint="search"
					autoCapitalize="none"
					autoCorrect="off"
					className="flex-1"
				/>
				<Button type="submit" variant="outline" className="rounded-full">
					{EXERCISE_LIST_LABELS.searchButton}
				</Button>
			</Form>

			<p
				className="text-footnote text-muted-foreground mb-2 tabular-nums"
				aria-live="polite"
			>
				{exercises.length === 0 && query
					? EXERCISE_LIST_LABELS.none(query)
					: EXERCISE_LIST_LABELS.count(exercises.length)}
			</p>

			{/* One handler for the list, not one per row (see the header). The
			    rows are anchors, so the handler only upgrades a plain click, and the
			    keyboard's Enter on a focused anchor is a click like any other. */}
			<ul
				className="bg-card divide-border/60 divide-y overflow-hidden rounded-4xl shadow-xs"
				onClick={onRowClick}
			>
				{exercises.map((exercise) => (
					<li
						key={exercise.id}
						// Off-screen rows are not rendered; 44px is the row's own height, so
						// the scrollbar does not jump as rows come into view.
						className="[contain-intrinsic-size:auto_44px] [content-visibility:auto]"
					>
						<a
							href={`/training/exercises/${exercise.id}`}
							className="active:bg-muted flex min-h-11 items-center justify-between gap-3 px-4 py-2.5"
						>
							<span className="text-callout min-w-0 [overflow-wrap:anywhere]">
								{exercise.name}
								{exercise.alias ? (
									<span className="text-footnote text-muted-foreground ml-2 font-normal">
										{EXERCISE_SEARCH_LABELS.alias(exercise.alias)}
									</span>
								) : null}
								{exercise.own ? (
									<span className="text-caption text-muted-foreground ml-2">
										{EXERCISE_LIST_LABELS.own}
									</span>
								) : null}
							</span>
							<Icon
								name="chevron-right"
								size="sm"
								className="text-muted-foreground shrink-0"
								aria-hidden="true"
							/>
						</a>
					</li>
				))}
			</ul>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
