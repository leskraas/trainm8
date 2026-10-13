/**
 * **The publish flow** (#452, ADR 0052) — where an athlete's own session becomes a
 * **Shared Workout**, and where they are told what that means before it does.
 *
 * The screen is built around three sentences it owes the athlete, in order:
 *
 * 1. **What becomes public** — the session, and the name they choose to publish
 *    under. The name is a field with their profile name pre-filled rather than a
 *    silent default, because a default that discloses a real name nobody was asked
 *    about is a disclosure and not a default.
 * 2. **What trainm8 is not doing** — the non-vouch, shown here as well as on the
 *    Catalogue, so it is not a surprise the reader sees and the author never does.
 * 3. **What can happen next** — anybody can report it, and a moderator can remove
 *    it permanently.
 *
 * It is also the **author's side of the moderation gate**: a session a moderator
 * took down says so here, with the reason and the date, and the publish control is
 * gone rather than disabled-with-a-shrug.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod/v3'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	CATALOGUE_LEVELS,
	SESSION_ARCHETYPES,
	formatCitation,
} from '#app/utils/catalogue.ts'
import {
	defaultDisplayName,
	publishWorkout,
	readPublishTarget,
	resolveSharedProvenance,
	unpublishWorkout,
} from '#app/utils/community.server.ts'
import { publishBlockedReason, readPublishState } from '#app/utils/community.ts'
import { formatNbDate } from '#app/utils/format.ts'
import {
	CATALOGUE_PUBLISH_LABELS as L,
	LIBRARY_LABELS,
	NB_CATALOGUE_LEVEL_LABELS,
	NB_PROVENANCE_LABELS,
	NB_SESSION_ARCHETYPE_LABELS,
	nbDisciplineLabel,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Route } from './+types/catalogue.publish.$workoutId.ts'
import { catalogueBlurb } from './__catalogue-card.ts'

export const meta: Route.MetaFunction = () => [{ title: L.metaTitle }]

/**
 * The publish form. `archetype` is required because the Catalogue is a
 * **retrieval** corpus rather than a list: a row nobody can filter to is a row
 * nobody finds. `level` is a **floor** and optional — no level means the row is not
 * level-scoped, which is a positive statement rather than a blank (ADR 0051 §3).
 */
const PublishSchema = z.object({
	displayName: z.string().trim().min(1, L.errors.name).max(60),
	archetype: z.enum(SESSION_ARCHETYPES, {
		errorMap: () => ({ message: L.errors.kind }),
	}),
	level: z.enum(CATALOGUE_LEVELS).optional(),
})

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const workout = await readPublishTarget(userId, params.workoutId)
	if (!workout) {
		throw new Response('Not found', { status: 404 })
	}

	// The publish flow reads provenance by **walking `copiedFrom`** (never one
	// hop), so an athlete publishing a fork of a cited **Stock Workout** is shown
	// whose source that is — and told, here, that it stays that session's and does
	// not travel onto theirs.
	const provenance = await resolveSharedProvenance(workout.id)

	return {
		workout: {
			id: workout.id,
			title: workout.title,
			description: workout.description,
			discipline: workout.discipline,
		},
		state: readPublishState(workout, workout.attribution),
		provenance,
		defaultName: workout.owner ? defaultDisplayName(workout.owner) : '',
		currentArchetype: workout.catalogueEntry?.archetype ?? '',
		currentLevel: workout.catalogueEntry?.level ?? '',
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	if (formData.get('intent') === 'withdraw') {
		await unpublishWorkout(userId, params.workoutId)
		throw redirect(`/training/catalogue/publish/${params.workoutId}`)
	}

	const submission = parseWithZod(formData, { schema: PublishSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const result = await publishWorkout({
		userId,
		workoutId: params.workoutId,
		displayName: submission.value.displayName,
		archetype: submission.value.archetype,
		level: submission.value.level ?? null,
	})

	if (!result.ok) {
		// Every refusal is a sentence, never a generic failure. The takedown one in
		// particular has to reach the author: it is the only permanent state here.
		const message =
			result.reason === 'taken-down'
				? L.errors.takenDown
				: result.reason === 'not-yours'
					? L.errors.notYours
					: result.reason === 'not-athlete-authored'
						? L.errors.stock
						: L.errors.gone
		return data(
			{ result: submission.reply({ formErrors: [message] }) },
			{ status: 400 },
		)
	}

	throw redirect('/training/catalogue')
}

export default function PublishRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const {
		workout,
		state,
		provenance,
		defaultName,
		currentArchetype,
		currentLevel,
	} = loaderData
	const timeZone = useAthleteTimezone()
	const blocked = publishBlockedReason(state)

	const [form, fields] = useForm({
		id: 'publish-workout',
		constraint: getZodConstraint(PublishSchema),
		lastResult: actionData?.result,
		defaultValue: {
			displayName: defaultName,
			archetype: currentArchetype,
			level: currentLevel,
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PublishSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={L.title}
				back={{ to: '/training/catalogue', label: LIBRARY_LABELS.catalogue }}
				className="mb-6"
			/>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-callout [overflow-wrap:anywhere]">
						{workout.title}
					</CardTitle>
					<p className="text-footnote text-muted-foreground">
						{nbDisciplineLabel(workout.discipline)}
					</p>
				</CardHeader>
				{catalogueBlurb(workout.description) ? (
					<CardContent>
						<p className="text-footnote text-muted-foreground">
							{catalogueBlurb(workout.description)}
						</p>
					</CardContent>
				) : null}
			</Card>

			{provenance.adaptedFrom ? (
				<Card className="mb-6">
					<CardHeader>
						<CardTitle className="text-heading">{L.whereFrom}</CardTitle>
					</CardHeader>
					<CardContent className="text-footnote text-muted-foreground space-y-1">
						<p>{L.forkedFrom(formatCitation(provenance.adaptedFrom))}</p>
						<p>{L.sourceStays}</p>
					</CardContent>
				</Card>
			) : null}

			{state.kind === 'taken-down' ? (
				<Card className="ring-destructive/40 mb-6" data-takedown-notice>
					<CardHeader>
						<CardTitle className="text-heading">{L.removed}</CardTitle>
					</CardHeader>
					<CardContent className="text-footnote space-y-1">
						<p>{L.removedOn(formatNbDate(state.at, timeZone))}</p>
						<p className="text-muted-foreground">{L.reason(state.reason)}</p>
						<p className="text-muted-foreground">{L.removedNote}</p>
					</CardContent>
				</Card>
			) : null}

			{state.kind === 'published' ? (
				<Card className="mb-6">
					<CardHeader>
						<CardTitle className="text-heading">{L.inCatalogue}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-footnote text-muted-foreground">
							{L.publishedAs(
								state.attribution.displayName,
								formatNbDate(state.attribution.publishedAt, timeZone),
							)}
						</p>
						<Form method="POST">
							<input type="hidden" name="intent" value="withdraw" />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								className="rounded-full"
							>
								{L.withdraw}
							</Button>
						</Form>
					</CardContent>
				</Card>
			) : null}

			{blocked ? (
				<p className="text-footnote">
					<Link to="/training/catalogue" className="underline">
						{L.backToCatalogue}
					</Link>
				</p>
			) : (
				<Form method="POST" {...getFormProps(form)} className="space-y-4">
					<Field
						labelProps={{ children: L.nameLabel }}
						inputProps={{
							...getInputProps(fields.displayName, { type: 'text' }),
							autoComplete: 'off',
						}}
						errors={fields.displayName.errors}
					/>
					<SelectField
						meta={fields.archetype}
						labelProps={{ children: L.kindLabel }}
						placeholder={L.pickOne}
						items={SESSION_ARCHETYPES.map((archetype) => ({
							value: archetype,
							label: NB_SESSION_ARCHETYPE_LABELS[archetype],
						}))}
						errors={fields.archetype.errors}
					/>
					<SelectField
						meta={fields.level}
						labelProps={{ children: L.levelLabel }}
						placeholder={L.anyLevel}
						items={CATALOGUE_LEVELS.map((level) => ({
							value: level,
							label: NB_CATALOGUE_LEVEL_LABELS[level],
						}))}
						errors={fields.level.errors}
					/>

					<div className="bg-muted text-footnote text-muted-foreground space-y-2 rounded-3xl p-4">
						<p className="text-callout text-foreground">{L.beforeYouPublish}</p>
						<p data-non-vouch>{NB_PROVENANCE_LABELS.nonVouch}</p>
						<p>{L.everyAthlete}</p>
					</div>

					<ErrorList id={form.errorId} errors={form.errors} />

					<div className="flex flex-wrap gap-2">
						<Button type="submit" className="rounded-full">
							{state.kind === 'published' ? L.update : L.publish}
						</Button>
						<Link
							to="/training/catalogue"
							className={cn(
								buttonVariants({ variant: 'ghost' }),
								'rounded-full',
							)}
						>
							{L.cancel}
						</Link>
					</div>
				</Form>
			)}
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
