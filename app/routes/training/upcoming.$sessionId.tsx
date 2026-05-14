import { invariantResponse } from '@epic-web/invariant'
import { getFormProps, getTextareaProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link, useActionData } from 'react-router'
import { z } from 'zod'
import { ErrorList, TextareaField } from '#app/components/forms.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getHints } from '#app/utils/client-hints.tsx'
import { getLocaleFromRequest } from '#app/utils/locale.server.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	formatDuration,
	formatDistance,
} from '#app/utils/workout-formatting.ts'
import { upsertSessionLog } from '#app/utils/session-log.server.ts'
import {
	type SessionDetail,
	getSessionByIdForUser,
} from '#app/utils/training.server.ts'
import {
	formatSessionTime,
	getStatusLabel,
	getStatusVariant,
} from '#app/utils/training.ts'
import { type Route } from './+types/upcoming.$sessionId.ts'

const SessionLogSchema = z.object({
	content: z.string().min(1, 'Reflection is required'),
	rpe: z
		.string()
		.optional()
		.transform((val) => (val ? Number(val) : null))
		.pipe(
			z
				.number()
				.int('RPE must be a whole number')
				.min(1, 'RPE must be between 1 and 10')
				.max(10, 'RPE must be between 1 and 10')
				.nullable(),
		),
})

export const meta: Route.MetaFunction = ({ data }) => [
	{
		title: data?.session
			? `${data.session.workout.title} | Workout Details | Trainm8`
			: 'Workout Details | Trainm8',
	},
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const session = await getSessionByIdForUser(userId, params.sessionId)
	invariantResponse(session, 'Workout session not found', { status: 404 })

	const hints = getHints(request)
	return {
		session,
		timeZone: hints.timeZone,
		locale: getLocaleFromRequest(request),
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const session = await getSessionByIdForUser(userId, params.sessionId)
	invariantResponse(session, 'Workout session not found', { status: 404 })

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: SessionLogSchema })

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { content, rpe } = submission.value
	await upsertSessionLog({ sessionId: params.sessionId, content, rpe })

	return { result: submission.reply() }
}

export default function UpcomingSessionDetailRoute({
	loaderData,
}: Route.ComponentProps) {
	const { session, timeZone, locale } = loaderData

	return (
		<main className="container py-10">
			<div className="mb-6">
				<Link
					to="/training/upcoming"
					prefetch="intent"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Back to upcoming workouts
				</Link>
			</div>

			<Card className="bg-muted">
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<CardTitle>{session.workout.title}</CardTitle>
						<CardDescription className="capitalize">
							{session.workout.activityType}
						</CardDescription>
						<p className="text-body-sm text-muted-foreground">
							{formatSessionTime(session.scheduledAt, { locale, timeZone })}
						</p>
					</div>
					<Badge variant={getStatusVariant(session.status)}>
						{getStatusLabel(session.status)}
					</Badge>
				</CardHeader>

				<CardContent className="space-y-4">
					{session.workout.description ? (
						<p className="text-body-sm">{session.workout.description}</p>
					) : null}

					<div className="space-y-3">
						<h2 className="text-h5">Workout structure</h2>
						<ul className="space-y-3">
							{session.workout.blocks.map((block) => (
								<li key={block.id} className="rounded-md border p-3">
									{block.name ? (
										<p className="text-body-sm font-semibold">
											{block.repeatCount > 1
												? `${block.repeatCount} × ${block.name}`
												: block.name}
										</p>
									) : (
										<p className="text-body-sm font-semibold">
											{block.repeatCount > 1
												? `${block.repeatCount} × Block ${block.orderIndex + 1}`
												: `Block ${block.orderIndex + 1}`}
										</p>
									)}
									<ul className="mt-2 space-y-1 pl-4">
										{block.steps.map((step) => {
											const parts: string[] = []
											if (step.durationSec != null)
												parts.push(formatDuration(step.durationSec))
											if (step.distanceM != null)
												parts.push(formatDistance(step.distanceM))
											if (step.description) parts.push(step.description)
											if (step.intensity) parts.push(`— ${step.intensity}`)
											return (
												<li
													key={step.id}
													className="text-body-sm text-muted-foreground"
												>
													{parts.join(' ')}
												</li>
											)
										})}
									</ul>
								</li>
							))}
						</ul>
					</div>
				</CardContent>
			</Card>

			<SessionLogSection sessionLog={session.sessionLog} />
		</main>
	)
}

function SessionLogSection({
	sessionLog,
}: {
	sessionLog: SessionDetail['sessionLog']
}) {
	const actionData = useActionData<typeof action>()

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle className="text-h5">Session Log</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{sessionLog ? <SessionLogDisplay sessionLog={sessionLog} /> : null}
				<SessionLogForm
					defaultContent={sessionLog?.content}
					defaultRpe={sessionLog?.rpe}
					actionData={actionData}
				/>
			</CardContent>
		</Card>
	)
}

function SessionLogDisplay({
	sessionLog,
}: {
	sessionLog: NonNullable<SessionDetail['sessionLog']>
}) {
	return (
		<div className="bg-muted rounded-lg p-4">
			<p className="text-body-sm whitespace-pre-wrap">{sessionLog.content}</p>
			{sessionLog.rpe != null ? (
				<p className="text-muted-foreground mt-2 text-sm">
					RPE: {sessionLog.rpe}/10
				</p>
			) : null}
		</div>
	)
}

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function SessionLogForm({
	defaultContent,
	defaultRpe,
	actionData,
}: {
	defaultContent?: string
	defaultRpe?: number | null
	actionData?: { result: Parameters<typeof useForm>[0]['lastResult'] }
}) {
	const [form, fields] = useForm({
		id: 'session-log',
		constraint: getZodConstraint(SessionLogSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SessionLogSchema })
		},
		defaultValue: {
			content: defaultContent ?? '',
			rpe: defaultRpe?.toString() ?? '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Form method="POST" {...getFormProps(form)}>
			<fieldset className="space-y-4">
				<legend className="text-body-sm font-semibold">
					{defaultContent ? 'Update your reflection' : 'Log your reflection'}
				</legend>

				<TextareaField
					labelProps={{ children: 'Reflection' }}
					textareaProps={{
						...getTextareaProps(fields.content),
						placeholder: 'How did the session go?',
					}}
					errors={fields.content.errors as string[] | undefined}
				/>

				<div className="space-y-2">
					<label className="text-body-xs text-muted-foreground font-medium">
						RPE (Rate of Perceived Exertion)
					</label>
					<div
						className="flex flex-wrap gap-1.5"
						role="group"
						aria-label="RPE selector"
					>
						{RPE_VALUES.map((value) => (
							<Button
								key={value}
								type="button"
								variant={
									fields.rpe.value === String(value) ? 'default' : 'outline'
								}
								size="sm"
								className={cn(
									'h-9 w-9 p-0',
									fields.rpe.value === String(value) && 'ring-ring/30 ring-2',
								)}
								onClick={() => {
									const input = document.querySelector<HTMLInputElement>(
										`input[name="${fields.rpe.name}"]`,
									)
									if (input) {
										const newValue =
											input.value === String(value) ? '' : String(value)
										input.value = newValue
										input.dispatchEvent(new Event('input', { bubbles: true }))
										input.dispatchEvent(new Event('change', { bubbles: true }))
									}
								}}
								aria-pressed={fields.rpe.value === String(value)}
							>
								{value}
							</Button>
						))}
					</div>
					<input
						type="hidden"
						name={fields.rpe.name}
						value={fields.rpe.value ?? ''}
					/>
					<ErrorList errors={fields.rpe.errors as string[] | undefined} />
				</div>

				<StatusButton
					type="submit"
					status={form.status === 'error' ? 'error' : 'idle'}
				>
					{defaultContent ? 'Update Session Log' : 'Save Session Log'}
				</StatusButton>
				<ErrorList errors={form.errors as string[] | undefined} />
			</fieldset>
		</Form>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
