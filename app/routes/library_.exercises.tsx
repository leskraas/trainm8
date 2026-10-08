/**
 * Every exercise, in Bibliotek (spec #505 story 58, ADR 0083): the exercise
 * bank an athlete can put in a session — the shared corpus and their own — each
 * opening its history. Bibliotek's hub lists only the lifts the athlete has
 * used, so an athlete with none still finds the exercises here.
 *
 * Searched on the server with a plain GET form (`?q=`), so it works before
 * hydration and a search is a URL that can be shared or reloaded.
 */
import { Form, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	APP_TAB_LABELS,
	EXERCISE_LIST_LABELS,
	LIBRARY_LABELS,
} from '#app/utils/labels.ts'
import { getExerciseCatalog } from '#app/utils/workout.server.ts'
import { type Route } from './+types/library_.exercises.ts'

export const meta: Route.MetaFunction = () => [
	{ title: `${LIBRARY_LABELS.allExercises} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const query = (new URL(request.url).searchParams.get('q') ?? '').trim()
	const needle = query.toLocaleLowerCase('nb')
	// The catalogue is a few hundred rows at most, so the match is made here in
	// JS rather than with SQLite's `LIKE`, which folds only ASCII case.
	const exercises = (await getExerciseCatalog(userId))
		.filter(
			(exercise) =>
				needle === '' || exercise.name.toLocaleLowerCase('nb').includes(needle),
		)
		.map((exercise) => ({
			id: exercise.id,
			name: exercise.name,
			own: exercise.createdByAthleteId === userId,
		}))
	return { query, exercises }
}

export default function LibraryExercisesRoute({
	loaderData,
}: Route.ComponentProps) {
	const { query, exercises } = loaderData
	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={LIBRARY_LABELS.allExercises}
				back={{ to: '/library', label: APP_TAB_LABELS.library }}
				className="mb-4"
			/>

			<Form method="GET" role="search" className="mb-4 flex gap-2">
				<Input
					type="search"
					name="q"
					defaultValue={query}
					aria-label={EXERCISE_LIST_LABELS.search}
					placeholder={EXERCISE_LIST_LABELS.search}
					className="flex-1"
				/>
				<Button type="submit" variant="outline">
					{EXERCISE_LIST_LABELS.searchButton}
				</Button>
			</Form>

			<p className="text-muted-foreground mb-2 text-sm" aria-live="polite">
				{exercises.length === 0 && query
					? EXERCISE_LIST_LABELS.none(query)
					: EXERCISE_LIST_LABELS.count(exercises.length)}
			</p>

			<ul className="divide-border/70 divide-y">
				{exercises.map((exercise) => (
					<li key={exercise.id}>
						<Link
							to={`/training/exercises/${exercise.id}`}
							prefetch="intent"
							className="flex min-h-11 items-center justify-between gap-3 py-2 hover:underline"
						>
							<span className="min-w-0">
								{exercise.name}
								{exercise.own ? (
									<span className="text-muted-foreground ml-2 text-xs">
										{EXERCISE_LIST_LABELS.own}
									</span>
								) : null}
							</span>
							<Icon
								name="chevron-right"
								size="sm"
								className="text-muted-foreground"
								aria-hidden="true"
							/>
						</Link>
					</li>
				))}
			</ul>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
