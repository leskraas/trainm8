/**
 * **Browse the programs** — a short list of real, named programs, each saying
 * what it actually is.
 *
 * A program card states its day shapes, its per-lift sets and reps, its
 * increment and its **Stall Response** in the program's own numbers, plus where
 * those numbers came from. The provenance line is not decoration: *"three fails
 * then cut 10 %"* has no trial behind it, and an athlete reading a card is
 * entitled to know that before they run twelve weeks of it.
 *
 * **All of it being required does not make all of it equal.** Everything on the
 * card used to render at one size in one grey, which is the same as saying
 * nothing: five lift rows, a provenance note and a citation all read as one
 * paragraph, and the athlete had to parse the card to find the thing they came
 * for. So the body is three tiers — the lift rows, then what the program does
 * to the weight over weeks, then the footnote — and the citation, the one line
 * here nobody reads in the gym, sits behind a disclosure. Nothing was dropped;
 * the card just says which part is loudest. The quieter tiers are a step down
 * in size, never in contrast: `muted-foreground` is already the floor that
 * passes AA, and the `/70` this page used was 3:1.
 */
import { Form, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	APP_TAB_LABELS,
	LIBRARY_LABELS,
	PROGRAMS_LABELS as L,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type ProgramLiftSummary,
	type ProgramSummary,
	listProgramInstances,
	listPrograms,
} from '#app/utils/strength-program.server.ts'
import { type Route } from './+types/programs.ts'
import {
	liftKey,
	liftRules,
	liftScheme,
	programProvenanceNote,
	runningInstanceIds,
	shapeText,
} from './__programs-list-presenter.ts'

export const meta: Route.MetaFunction = () => [{ title: L.metaTitle }]

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
			{/* Back to Bibliotek, the tab this page lives under (ADR 0083 §4).
			    (`/training` itself redirects here — see `training/index.tsx` — so
			    the guessed prefix is not a 404 either.) */}
			<PageHeader
				title={LIBRARY_LABELS.programs}
				back={{ to: '/library', label: APP_TAB_LABELS.library }}
				className="mb-2"
			/>
			<p className="text-footnote text-muted-foreground mb-6">{L.intro}</p>

			{programs.length === 0 ? (
				/* An honest dead end rather than a blank screen: this is a database
				   state, not something the athlete did, and the sentence says so and
				   then points at the way to train that is still open. */
				<p className="text-footnote text-muted-foreground">
					{L.empty}{' '}
					<Link to="/training/catalogue" className="text-foreground underline">
						{L.emptyCatalogue}
					</Link>{' '}
					{L.emptyOr}{' '}
					<Link
						to="/training/sessions/new"
						className="text-foreground underline"
					>
						{L.emptyWrite}
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
			{/* `CardAction` and not a flex row: `CardHeader` is a grid, and it grows
			    its second column only for a child in that slot. */}
			<CardHeader className="gap-4">
				<div className="min-w-0">
					<CardTitle className="text-heading [overflow-wrap:anywhere]">
						{program.name}
					</CardTitle>
					<p className="text-footnote text-muted-foreground mt-1">
						{shapeText(program.dayIds)}
					</p>
				</div>
				{runningInstanceId ? (
					<CardAction>
						<Badge variant="secondary" className="shrink-0">
							{L.running}
						</Badge>
					</CardAction>
				) : null}
			</CardHeader>
			<CardContent className="space-y-3.5">
				{/* The loudest thing in the card body, and the reason an athlete opened
				    it: what they lift, how many times. Every lift is one row, and the
				    row itself is two tiers — see `LiftRow`. */}
				<ul className="space-y-2">
					{program.lifts.map((lift) => (
						<LiftRow key={liftKey(lift)} lift={lift} />
					))}
				</ul>

				<ProvenanceFootnote
					note={programProvenanceNote(program)}
					citation={program.citation}
				/>

				{runningInstanceId ? (
					<div className="space-y-1">
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
							<Button type="submit" className="w-full rounded-full">
								{L.openRun}
							</Button>
						</Form>
						{/* The overview keeps the two things nothing else offers, so it
						    stays one tap away rather than disappearing behind the runner. */}
						<Link
							to={`/training/programs/run/${runningInstanceId}`}
							className="text-footnote text-muted-foreground flex min-h-11 items-center justify-center underline underline-offset-4"
						>
							{L.manageRun}
						</Link>
					</div>
				) : (
					<Link
						to={`/training/programs/${program.id}/start`}
						className={cn(
							buttonVariants({ variant: 'outline' }),
							'w-full rounded-full',
						)}
					>
						{L.start(program.name)}
					</Link>
				)}
			</CardContent>
		</Card>
	)
}

/**
 * One lift, at two weights, because it answers two questions.
 *
 * `Back Squat 5×5` is tonight, so it is the larger text in the card body and
 * the name carries the weight. `+2,5 kg · −10 % etter 3 stopp` is week six, so
 * it is a step smaller, and it sits to the right where a phone has room and
 * wraps under the name where it does not. Both are AA: the step down is size,
 * not a dimmer grey.
 */
function LiftRow({ lift }: { lift: ProgramLiftSummary }) {
	return (
		<li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
			<span className="text-callout">
				<span className="text-foreground">{lift.name}</span>{' '}
				<span className="text-muted-foreground tabular-nums">
					{liftScheme(lift)}
				</span>
			</span>
			<span className="text-footnote text-muted-foreground tabular-nums">
				{liftRules(lift)}
			</span>
		</li>
	)
}

/**
 * Where the numbers came from — **required, not decoration**. An athlete about
 * to run twelve weeks of a rule is entitled to know which of its numbers are
 * published and which are program convention with nothing behind them, so the
 * note itself stays on the face of the card and is never a tap away.
 *
 * It is, however, a footnote: below a hairline, a step down in size from the
 * lift rows it qualifies. The **citation** goes one step further and sits behind
 * the shared `Collapsible` (`motion-collapse`), because it is the one line here
 * nobody reads in the gym — it is checked once, by somebody deciding whether to
 * trust the card at all. Its trigger is a 44px row, not a 20px word.
 */
function ProvenanceFootnote({
	note,
	citation,
}: {
	note: string | null
	citation: ProgramSummary['citation']
}) {
	if (!note && !citation.work) return null
	return (
		<div className="border-border/60 space-y-1 border-t pt-3.5">
			{note ? (
				<p className="text-footnote text-muted-foreground">{note}</p>
			) : null}
			{citation.work ? (
				<Collapsible>
					<CollapsibleTrigger className="text-footnote text-muted-foreground group flex min-h-11 items-center gap-1">
						{L.source}
						<Icon
							name="chevron-right"
							className="duration-collapse size-3 transition-transform ease-out group-data-panel-open:rotate-90 motion-reduce:transition-none"
						/>
					</CollapsibleTrigger>
					{/* `hiddenUntilFound`: closed, the citation is still in the page, so
					    the browser's find-in-page reaches it and opens the panel. */}
					<CollapsibleContent hiddenUntilFound>
						<p className="text-footnote text-muted-foreground pb-1">
							{citation.author ?? L.unattributed} — {citation.work}
							{citation.year ? `, ${citation.year}` : ''}
							{citation.locator ? ` (${citation.locator})` : ''}
						</p>
					</CollapsibleContent>
				</Collapsible>
			) : null}
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
