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
import { Form, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type ProgramSummary,
	listProgramInstances,
	listPrograms,
} from '#app/utils/strength-program.server.ts'
import { type Route } from './+types/programs.ts'
import {
	liftDetail,
	liftKey,
	runningInstanceIds,
	shapeText,
} from './__programs-list-presenter.ts'

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
	const activeByProgram = runningInstanceIds(instances)

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			{/* Back to Home, not `/training`: `/training` is a URL namespace and
			    Home is the training hub, so the back link names where the athlete
			    actually came from. (`/training` itself redirects here — see
			    `training/index.tsx` — so the guessed prefix is not a 404 either.) */}
			<PageHeader
				title="Strength programs"
				back={{ to: '/', label: 'Home' }}
				className="mb-2"
			/>
			<p className="text-body-2xs text-muted-foreground mb-6 leading-relaxed">
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
				<div className="space-y-4">
					{programs.map((program) => (
						<ProgramCard
							key={program.id}
							program={program}
							runningInstanceId={activeByProgram.get(program.id) ?? null}
						/>
					))}
				</div>
			)}
		</main>
	)
}

/**
 * One program, stated in full: what its week looks like, what each lift does
 * every session, where those numbers come from, and the one action the athlete
 * has here.
 */
function ProgramCard({
	program,
	runningInstanceId,
}: {
	program: ProgramSummary
	runningInstanceId: string | null
}) {
	return (
		<Card className="gap-3.5">
			<CardHeader className="flex-row items-start justify-between gap-4">
				<div className="min-w-0">
					<CardTitle className="text-lg leading-tight font-bold">
						{program.name}
					</CardTitle>
					<p className="text-body-2xs text-muted-foreground mt-1">
						{shapeText(program.dayIds)}
					</p>
				</div>
				{runningInstanceId ? (
					<Badge className="bg-muted text-primary text-button h-6 shrink-0 rounded-2xl px-2.5">
						Running
					</Badge>
				) : null}
			</CardHeader>
			<CardContent className="space-y-3.5">
				<ul className="space-y-1.5">
					{program.lifts.map((lift) => (
						<li
							key={liftKey(lift)}
							className="text-body-2xs text-muted-foreground leading-snug"
						>
							<span className="text-foreground font-bold">{lift.name}</span>{' '}
							{liftDetail(lift)}
						</li>
					))}
				</ul>

				{/* Required, not decoration: an athlete about to run twelve weeks of a
				    rule is entitled to know which of its numbers are published and
				    which are program convention with nothing behind them. */}
				{program.provenanceNote || program.citation.work ? (
					<div className="border-border text-muted-foreground/85 space-y-1 border-t pt-3.5">
						{program.provenanceNote ? (
							<p className="text-body-2xs leading-relaxed">
								{program.provenanceNote}
							</p>
						) : null}
						{program.citation.work ? (
							<p className="text-body-2xs leading-relaxed">
								Source: {program.citation.author ?? 'Unattributed'} —{' '}
								{program.citation.work}
								{program.citation.year ? `, ${program.citation.year}` : ''}
								{program.citation.locator
									? ` (${program.citation.locator})`
									: ''}
							</p>
						) : null}
					</div>
				) : null}

				{runningInstanceId ? (
					<div className="space-y-3">
						{/* The primary action opens *today's session*, not a summary of
						    it: the athlete is standing in the gym. It posts the overview's
						    own `open-session` intent, so the session is resolved and
						    created by the one piece of code that knows how — this screen
						    owns none of that logic. */}
						<Form
							method="post"
							action={`/training/programs/run/${runningInstanceId}`}
						>
							<input type="hidden" name="intent" value="open-session" />
							<Button type="submit" className="h-12 w-full rounded-2xl">
								Open your run
							</Button>
						</Form>
						{/* The overview keeps the two things nothing else offers, so it
						    stays one tap away rather than disappearing behind the runner. */}
						<Link
							to={`/training/programs/run/${runningInstanceId}`}
							className="text-body-2xs text-muted-foreground block text-center underline underline-offset-4"
						>
							Correct a weight or end this program
						</Link>
					</div>
				) : (
					<Link
						to={`/training/programs/${program.id}/start`}
						className={cn(
							buttonVariants({ variant: 'outline' }),
							'h-12 w-full rounded-2xl',
						)}
					>
						Start {program.name}
					</Link>
				)}
			</CardContent>
		</Card>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
