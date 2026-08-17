/**
 * **Browse the programs** — a short list of real, named programs, each saying
 * what it actually is.
 *
 * A program card states its day shapes, its per-lift sets and reps, its
 * increment and its **Stall Response** in the program's own numbers, plus where
 * those numbers came from. The provenance line is not decoration: *"three fails
 * then cut 10 %"* has no trial behind it, and an athlete reading a card is
 * entitled to know that before they run twelve weeks of it.
 */
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	listProgramInstances,
	listPrograms,
} from '#app/utils/strength-program.server.ts'
import { type Route } from './+types/programs.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Strength programs | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [programs, instances] = await Promise.all([
		listPrograms(),
		listProgramInstances(userId),
	])
	return { programs, instances }
}

export default function ProgramsRoute({ loaderData }: Route.ComponentProps) {
	const { programs, instances } = loaderData
	const activeByProgram = new Map(
		instances
			.filter((instance) => instance.status === 'active')
			.map((instance) => [instance.programId, instance.id]),
	)

	return (
		<main className="container mx-auto max-w-3xl py-6 md:py-8">
			{/* Back to Home, not `/training`: there is no training index route, so
			    the obvious-looking back link landed on the catch-all 404. */}
			<PageHeader
				title="Strength programs"
				back={{ to: '/', label: 'Home' }}
				className="mb-2"
			/>
			<p className="text-body-sm text-muted-foreground mb-6">
				Each one runs on the last weight you lifted — never on the calendar.
			</p>

			{programs.length === 0 ? (
				/* An honest dead end rather than a blank screen: this is a database
				   state, not something the athlete did, and the sentence says so and
				   then points at the way to train that is still open. */
				<p className="text-body-sm text-muted-foreground">
					No programs are published in this database yet, so there is nothing to
					start here — nothing you did. You can still{' '}
					<Link to="/training/catalogue" className="underline">
						take a session from the Catalogue
					</Link>{' '}
					or{' '}
					<Link to="/training/sessions/new" className="underline">
						write one yourself
					</Link>
					.
				</p>
			) : (
				<div className="space-y-6">
					{programs.map((program) => {
						const runningId = activeByProgram.get(program.id)
						return (
							<Card key={program.id}>
								<CardHeader className="flex-row items-start justify-between gap-4">
									<div>
										<CardTitle>{program.name}</CardTitle>
										<p className="text-body-xs text-muted-foreground mt-1">
											{program.dayIds.length} day shapes ·{' '}
											{program.dayIds
												.map((dayId) => `Workout ${dayId}`)
												.join(' / ')}
										</p>
									</div>
									{runningId ? (
										<Badge variant="secondary">Running</Badge>
									) : null}
								</CardHeader>
								<CardContent className="space-y-4">
									<ul className="text-body-sm space-y-1">
										{program.lifts.map((lift) => (
											<li key={`${lift.exerciseId}-${lift.equipment ?? ''}`}>
												<span className="font-medium">{lift.name}</span>{' '}
												{lift.setCount}×{lift.repsPerSet} · {lift.incrementText}{' '}
												·{' '}
												<span className="text-muted-foreground">
													{lift.stallResponseText}
												</span>
											</li>
										))}
									</ul>

									{program.provenanceNote ? (
										<p className="text-body-xs text-muted-foreground">
											{program.provenanceNote}
										</p>
									) : null}
									{program.citation.work ? (
										<p className="text-body-xs text-muted-foreground">
											Source: {program.citation.author ?? 'Unattributed'} —{' '}
											{program.citation.work}
											{program.citation.year
												? `, ${program.citation.year}`
												: ''}
											{program.citation.locator
												? ` (${program.citation.locator})`
												: ''}
										</p>
									) : null}

									<div className="flex gap-3">
										{runningId ? (
											<Link
												to={`/training/programs/run/${runningId}`}
												className={buttonVariants({ variant: 'default' })}
											>
												Open your run
											</Link>
										) : (
											<Link
												to={`/training/programs/${program.id}/start`}
												className={buttonVariants({ variant: 'default' })}
											>
												Start {program.name}
											</Link>
										)}
									</div>
								</CardContent>
							</Card>
						)
					})}
				</div>
			)}
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
