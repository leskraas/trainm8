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
import { ErrorList, TextareaField } from '#app/components/forms.tsx'
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
import {
	COMMUNITY_NON_VOUCH,
	REPORT_REASONS,
	REPORT_REASON_HINTS,
	REPORT_REASON_LABELS,
	formatAttribution,
	readAttribution,
} from '#app/utils/community.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { type Route } from './+types/catalogue.report.$workoutId.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Report a session | Trainm8' },
]

const ReportSchema = z
	.object({
		reason: z.enum(REPORT_REASONS, {
			errorMap: () => ({ message: 'Pick what is wrong with it' }),
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
				message: 'Tell us what is wrong — "something else" needs a description',
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
				? 'This is your own session — withdraw it instead.'
				: result.reason === 'not-public'
					? 'That session is not in the Catalogue.'
					: 'That session no longer exists.'
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
				title="Report this session"
				back={{ to: '/training/catalogue', label: 'the Catalogue' }}
				className="mb-6"
			/>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-base font-bold tracking-tight">
						{workout.title}
					</CardTitle>
					<p className="text-body-xs text-muted-foreground">
						{getDisciplineLabel(workout.discipline)}
						{attribution ? ` · ${formatAttribution(attribution)}` : ''}
					</p>
				</CardHeader>
				<CardContent>
					<p className="text-body-xs text-muted-foreground" data-non-vouch>
						{COMMUNITY_NON_VOUCH}
					</p>
				</CardContent>
			</Card>

			{alreadyReported ? (
				<Card className="mb-6">
					<CardContent className="text-body-sm text-muted-foreground pt-6">
						<p>
							You have already reported this session. It is hidden from your
							Catalogue and a moderator has it.
						</p>
						<Link
							to="/training/catalogue"
							className={buttonVariants({ variant: 'outline', size: 'sm' })}
						>
							Back to the Catalogue
						</Link>
					</CardContent>
				</Card>
			) : (
				<Form method="POST" {...getFormProps(form)} className="space-y-6">
					<fieldset className="space-y-3">
						<legend className="text-h6 mb-2">What is wrong with it?</legend>
						{REPORT_REASONS.map((reason) => (
							<label
								key={reason}
								className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"
							>
								<input
									type="radio"
									name={fields.reason.name}
									value={reason}
									className="mt-1"
								/>
								<span>
									<span className="text-body-sm block font-medium">
										{REPORT_REASON_LABELS[reason]}
									</span>
									<span className="text-body-xs text-muted-foreground block">
										{REPORT_REASON_HINTS[reason]}
									</span>
								</span>
							</label>
						))}
						<ErrorList
							id={fields.reason.errorId}
							errors={fields.reason.errors}
						/>
					</fieldset>

					<TextareaField
						labelProps={{ children: 'Anything else a moderator should know?' }}
						textareaProps={{
							...getTextareaProps(fields.detail),
							rows: 4,
						}}
						errors={fields.detail.errors}
					/>

					<div className="text-body-sm text-muted-foreground space-y-2 rounded-xl border p-4">
						<p className="font-medium">What reporting does</p>
						<p>
							It hides this session from your Catalogue straight away, and sends
							it to a moderator.
						</p>
						<p>
							It does not remove it for anybody else — that is a moderator's
							decision, so no one athlete can take another's session down.
						</p>
					</div>

					<ErrorList id={form.errorId} errors={form.errors} />

					<div className="flex flex-wrap gap-2">
						<Button type="submit" variant="destructive">
							Send report
						</Button>
						<Link
							to="/training/catalogue"
							className={buttonVariants({ variant: 'ghost' })}
						>
							Cancel
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
