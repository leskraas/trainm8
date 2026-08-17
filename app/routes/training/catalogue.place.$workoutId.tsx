/**
 * **Put one Catalogue session on the calendar** (#470).
 *
 * Until now the corpus could place a whole season and could not place a single
 * session. This is the one-session path, and it is the athlete's act rather than
 * generation's: `source: 'authored'`, no Target Event, and a **community** row is
 * placeable here even though generation retrieves stock-only. Generation may only
 * place what trainm8 can source; an athlete who has read the non-vouch is
 * choosing for their own week (ADR 0053 §4).
 *
 * The screen asks one question — which day — and shows what it is about to copy.
 * The mechanics live in `placeCatalogueSession`, which is `writeSessions`'
 * mechanics and not a second copy of them: the Conform-backed session editor
 * would drop the facets #450 added on the round trip (ADR 0053 §7).
 */
import { data, Form, Link, redirect, useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	placeCatalogueSession,
	readRetrievableEntry,
} from '#app/utils/catalogue.server.ts'
import { catalogueTier, type SessionArchetype } from '#app/utils/catalogue.ts'
import { SESSION_ARCHETYPE_LABELS } from '#app/utils/labels.ts'
import {
	provenanceNonVouch,
	provenanceSentence,
	readSessionProvenance,
} from '#app/utils/plan-generation/provenance.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { type Route } from './+types/catalogue.place.$workoutId.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Add to my calendar | Trainm8' },
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const entry = await readRetrievableEntry(userId, params.workoutId)
	if (!entry) throw new Response('Not found', { status: 404 })

	const timezone = await getAthleteTimezone(userId)

	return {
		workoutId: entry.workout.id,
		title: entry.workout.title,
		description: entry.workout.description,
		discipline: entry.workout.discipline,
		archetype: entry.archetype,
		tier: catalogueTier(entry.workout, userId),
		sourcing: readSessionProvenance({
			authorship: entry.workout.authorship,
			description: entry.workout.description,
			citationAuthor: entry.citationAuthor,
			citationWork: entry.citationWork,
			citationYear: entry.citationYear,
			citationLocator: entry.citationLocator,
			attribution: entry.workout.attribution,
		}),
		// Today in the athlete's own zone, so the pre-filled day is the one they
		// are actually living in rather than the server's.
		today: localDate(new Date(), timezone),
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const result = await placeCatalogueSession({
		athleteId: userId,
		workoutId: params.workoutId,
		date: String(formData.get('date') ?? ''),
	})

	if (!result.ok) {
		return data(
			{
				error:
					result.reason === 'bad-date'
						? 'Pick a day.'
						: 'That session is no longer in the Catalogue.',
			},
			{ status: 400 },
		)
	}

	throw redirect(`/training/sessions/${result.sessionId}`)
}

export default function PlaceRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const row = loaderData
	const nonVouch = provenanceNonVouch(row.sourcing)
	// The list the athlete came from, filters and page intact: the card's link
	// carried them here, so back and cancel hand them straight back.
	const [searchParams] = useSearchParams()
	const search = searchParams.toString()
	const back = `/training/catalogue${search ? `?${search}` : ''}`

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="Add to my calendar"
				back={{ to: back, label: 'the Catalogue' }}
				className="mb-6"
			/>

			<div className="mb-6 space-y-1">
				<h2 className="text-base font-bold tracking-tight">{row.title}</h2>
				<p className="text-body-xs text-muted-foreground">
					{getDisciplineLabel(row.discipline)} ·{' '}
					{SESSION_ARCHETYPE_LABELS[row.archetype as SessionArchetype] ??
						row.archetype}
				</p>
				{row.description ? (
					<p className="text-body-sm text-muted-foreground">
						{row.description}
					</p>
				) : null}
				<p className="text-body-xs text-muted-foreground">
					{provenanceSentence(row.sourcing)}
				</p>
				{nonVouch ? (
					<p className="text-body-xs text-muted-foreground" data-non-vouch>
						{nonVouch}
					</p>
				) : null}
			</div>

			<Form method="POST" className="space-y-4">
				<div className="space-y-1">
					<label htmlFor="place-date" className="text-body-sm font-medium">
						Which day?
					</label>
					<Input
						id="place-date"
						type="date"
						name="date"
						defaultValue={row.today}
						required
					/>
					{/* The default states that it is a default, in a phrase. */}
					<p className="text-body-xs text-muted-foreground">
						Scheduled at your default training time.
					</p>
				</div>

				{actionData?.error ? (
					<p className="text-destructive text-body-sm" role="alert">
						{actionData.error}
					</p>
				) : null}

				<div className="flex flex-wrap gap-2">
					<Button type="submit">Add to my calendar</Button>
					<Link to={back} className={buttonVariants({ variant: 'ghost' })}>
						Cancel
					</Link>
				</div>
			</Form>

			<p className="text-body-xs text-muted-foreground mt-6">
				You get your own copy. Editing it never changes the Catalogue's.
			</p>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
