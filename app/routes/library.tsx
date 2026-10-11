/**
 * Bibliotek: the tab for workouts to take rather than to plan (spec #505 story
 * 58, ADR 0083). The catalogue, the strength programs and the exercises each
 * keep their own pages and URLs; this is the hub that names them in one place.
 *
 * The hub lists the lifts the athlete has actually put in a session, most
 * recent first, each opening its history; the whole exercise bank is one tap
 * further, searchable (`library_.exercises.tsx`), so an athlete with no lifts
 * still finds the exercises.
 *
 * Every row answers the press on pointer-down: the three hub cards with the
 * house `pressable` (scale 0.97, 160 ms on `--ease-out`), the lift rows with an
 * instant tint, because a list row that shrinks reads as a button, not a row.
 */
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { APP_TAB_LABELS, LIBRARY_LABELS } from '#app/utils/labels.ts'
import { getRecentExerciseIds } from '#app/utils/workout.server.ts'
import { type Route } from './+types/library.ts'

export const meta: Route.MetaFunction = () => [
	{ title: `${APP_TAB_LABELS.library} | Trainm8` },
]

/** How many of the athlete's own lifts the hub lists. */
const RECENT_LIFTS = 12

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const ids = await getRecentExerciseIds(userId, RECENT_LIFTS)
	const rows = await prisma.exercise.findMany({
		where: { id: { in: ids } },
		select: { id: true, name: true },
	})
	// Back into recency order: `findMany` returns its own.
	const byId = new Map(rows.map((row) => [row.id, row]))
	const lifts = ids.flatMap((id) => {
		const row = byId.get(id)
		return row ? [row] : []
	})
	return { lifts }
}

function HubLink({
	to,
	icon,
	title,
	description,
}: {
	to: string
	icon: IconName
	title: string
	description: string
}) {
	return (
		<Link
			to={to}
			prefetch="intent"
			className="bg-card pressable flex min-h-11 items-center gap-4 rounded-4xl p-4 shadow-xs"
		>
			<span className="bg-muted flex size-10 flex-none items-center justify-center rounded-full">
				<Icon name={icon} size="md" aria-hidden="true" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="text-callout block">{title}</span>
				<span className="text-footnote text-muted-foreground block">
					{description}
				</span>
			</span>
			<Icon
				name="chevron-right"
				size="md"
				className="text-muted-foreground shrink-0"
				aria-hidden="true"
			/>
		</Link>
	)
}

export default function LibraryRoute({ loaderData }: Route.ComponentProps) {
	const { lifts } = loaderData
	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader title={APP_TAB_LABELS.library} className="mb-6" />

			<div className="space-y-3">
				<HubLink
					to="/training/catalogue"
					icon="books"
					title={LIBRARY_LABELS.catalogue}
					description={LIBRARY_LABELS.catalogueDetail}
				/>
				<HubLink
					to="/training/programs"
					icon="barbell"
					title={LIBRARY_LABELS.programs}
					description={LIBRARY_LABELS.programsDetail}
				/>
				<HubLink
					to="/library/exercises"
					icon="magnifying-glass"
					title={LIBRARY_LABELS.allExercises}
					description={LIBRARY_LABELS.allExercisesDetail}
				/>
			</div>

			<section aria-labelledby="library-exercises" className="mt-8">
				<h2 id="library-exercises" className="text-heading mb-3">
					{LIBRARY_LABELS.recentLifts}
				</h2>
				{lifts.length > 0 ? (
					<ul className="bg-card divide-border/60 divide-y overflow-hidden rounded-4xl shadow-xs">
						{lifts.map((lift) => (
							<li key={lift.id}>
								<Link
									to={`/training/exercises/${lift.id}`}
									prefetch="intent"
									className="active:bg-muted flex min-h-11 items-center justify-between gap-3 px-4 py-2.5"
								>
									<span className="text-callout min-w-0 [overflow-wrap:anywhere]">
										{lift.name}
									</span>
									<Icon
										name="chevron-right"
										size="sm"
										className="text-muted-foreground shrink-0"
										aria-hidden="true"
									/>
								</Link>
							</li>
						))}
					</ul>
				) : (
					<p className="text-footnote text-muted-foreground">
						{LIBRARY_LABELS.noExercises}
					</p>
				)}
			</section>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
