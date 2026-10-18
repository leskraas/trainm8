/**
 * Bibliotek, as a section of Plan (ADR 0101 §1): workouts to take rather than
 * to plan. It was a tab of its own (spec #505 story 58, ADR 0083); its inside is
 * unchanged. The catalogue, the strength programs and the exercises each keep
 * their own pages and URLs; this names them in one place, and lists the lifts
 * the athlete has actually put in a session, each opening its history. The
 * whole exercise bank is one tap further, searchable (`library_.exercises.tsx`),
 * so an athlete with no lifts still finds the exercises.
 *
 * The section carries the anchor every old Bibliotek address forwards to
 * (`routes/library.tsx`).
 *
 * Every row answers the press on pointer-down: the three hub cards with the
 * house `pressable` (scale 0.97, 160 ms on `--ease-out`), the lift rows with an
 * instant tint, because a list row that shrinks reads as a button, not a row.
 */
import { Link } from 'react-router'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import { LIBRARY_SECTION_ID } from '#app/utils/app-tabs.ts'
import { LIBRARY_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type LibraryLift } from './__library-section.server.ts'

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
			<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
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

export function LibrarySection({
	lifts,
	className,
}: {
	lifts: readonly LibraryLift[]
	className?: string
}) {
	return (
		<section
			id={LIBRARY_SECTION_ID}
			aria-labelledby="library-title"
			// A little air above the heading when the forward scrolls it to the top.
			className={cn('scroll-mt-4', className)}
		>
			<h2 id="library-title" className="text-heading mb-3">
				{LIBRARY_LABELS.title}
			</h2>

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

			<section aria-labelledby="library-lifts" className="mt-6">
				<h3 id="library-lifts" className="text-callout mb-3 font-semibold">
					{LIBRARY_LABELS.recentLifts}
				</h3>
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
		</section>
	)
}
