/**
 * **Report a Shared Workout** — the athlete-facing half of the moderation gate
 * (#452, ADR 0052).
 *
 * The screen states the rule rather than implying it, because a reporter who does
 * not know what reporting does either over-uses it or gives up on it:
 *
 * - **It hides the session from you straight away.** That part is yours and takes
 *   effect the moment you submit.
 * - **It does not remove it for anybody else.** A moderator reads it. If one
 *   report removed a session for everyone, any athlete would hold a takedown
 *   button over every other athlete's work.
 *
 * A reason is required and comes from a closed vocabulary, because the queue is
 * triaged by it; free text is the detail beside it, and `other` demands one.
 */
import { getFormProps, getTextareaProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	ErrorList,
	RadioGroupField,
	TextareaField,
} from '#app/components/forms.tsx'
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
	attributionsFor,
	hasReported,
	reportWorkout,
} from '#app/utils/community.server.ts'
import { REPORT_REASONS, readAttribution } from '#app/utils/community.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	CATALOGUE_REPORT_LABELS as L,
	LIBRARY_LABELS,
	NB_PROVENANCE_LABELS,
	NB_REPORT_REASON_HINTS,
	NB_REPORT_REASON_LABELS,
	nbDisciplineLabel,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type Route } from './+types/catalogue.report.$workoutId.ts'

export const meta: Route.MetaFunction = () => [{ title: L.metaTitle }]

const ReportSchema = z
	.object({
		reason: z.enum(REPORT_REASONS, {
			errorMap: () => ({ message: L.errors.reason }),
		}),
		detail: z.string().trim().max(1000).optional(),
	})
	.superRefine((value, ctx) => {
		// "Something else" with nothing else said is a report a moderator cannot act
		// on, so it is the one reason that requires the words.
		if (value.reason === 'other' && !value.detail) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['detail'],
				message: L.errors.detail,
			})
		}
	})

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)

	const workout = await prisma.workout.findUnique({
		where: { id: params.workoutId },
		select: {
			id: true,
			title: true,
			discipline: true,
			ownerId: true,
			visibility: true,
		},
	})
	if (!workout || workout.visibility !== 'public') {
		throw new Response('Not found', { status: 404 })
	}
	if (workout.ownerId === userId) {
		// The author has a better verb than reporting themselves.
		throw redirect(`/training/catalogue/publish/${workout.id}`)
	}

	const attributions = await attributionsFor([workout.id])

	return {
		workout: {
			id: workout.id,
			title: workout.title,
			discipline: workout.discipline,
		},
		attribution: readAttribution(attributions.get(workout.id)),
		alreadyReported: await hasReported(userId, workout.id),
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const submission = parseWithZod(formData, { schema: ReportSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const result = await reportWorkout({
		reporterId: userId,
		workoutId: params.workoutId,
		reason: submission.value.reason,
		detail: submission.value.detail ?? null,
	})

	if (!result.ok) {
		const message =
			result.reason === 'your-own'
				? L.errors.yourOwn
				: result.reason === 'not-public'
					? L.errors.notPublic
					: L.errors.gone
		return data(
			{ result: submission.reply({ formErrors: [message] }) },
			{ status: 400 },
		)
	}

	throw redirect('/training/catalogue?reported=1')
}

export default function ReportRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { workout, attribution, alreadyReported } = loaderData

	const [form, fields] = useForm({
		id: 'report-workout',
		constraint: getZodConstraint(ReportSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ReportSchema })
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
						{attribution
							? ` · ${NB_PROVENANCE_LABELS.publishedBy(attribution.displayName)}`
							: ''}
					</p>
				</CardHeader>
				<CardContent>
					<p className="text-footnote text-muted-foreground" data-non-vouch>
						{NB_PROVENANCE_LABELS.nonVouch}
					</p>
				</CardContent>
			</Card>

			{alreadyReported ? (
				<Card className="mb-6">
					<CardContent className="text-footnote text-muted-foreground space-y-3">
						<p>{L.already}</p>
						<Link
							to="/training/catalogue"
							className={cn(
								buttonVariants({ variant: 'outline', size: 'sm' }),
								'rounded-full',
							)}
						>
							{L.backToCatalogue}
						</Link>
					</CardContent>
				</Card>
			) : (
				<Form method="POST" {...getFormProps(form)} className="space-y-6">
					<RadioGroupField
						name={fields.reason.name}
						legend={L.whatIsWrong}
						legendClassName="text-heading"
						options={REPORT_REASONS.map((reason) => ({
							value: reason,
							label: NB_REPORT_REASON_LABELS[reason],
							description: NB_REPORT_REASON_HINTS[reason],
						}))}
						errorId={fields.reason.errorId}
						errors={fields.reason.errors}
					/>

					<TextareaField
						labelProps={{ children: L.detail }}
						textareaProps={{
							...getTextareaProps(fields.detail),
							rows: 4,
						}}
						errors={fields.detail.errors}
					/>

					<div className="bg-muted text-footnote text-muted-foreground space-y-2 rounded-3xl p-4">
						<p className="text-callout text-foreground">
							{L.whatReportingDoes}
						</p>
						<p>{L.hides}</p>
						<p>{L.notForOthers}</p>
					</div>

					<ErrorList id={form.errorId} errors={form.errors} />

					<div className="flex flex-wrap gap-2">
						<Button
							type="submit"
							variant="destructive"
							className="rounded-full"
						>
							{L.send}
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
