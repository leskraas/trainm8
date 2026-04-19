import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getHints } from '#app/utils/client-hints.tsx'
import { getLocaleFromRequest } from '#app/utils/locale.server.ts'
import { getUpcomingSessionByIdForUser } from '#app/utils/training.server.ts'
import {
	formatSessionTime,
	getStatusLabel,
	getStatusVariant,
} from '#app/utils/training.ts'
import { type Route } from './+types/upcoming.$sessionId.ts'

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

	const session = await getUpcomingSessionByIdForUser(userId, params.sessionId)
	invariantResponse(session, 'Upcoming workout session not found', {
		status: 404,
	})

	const hints = getHints(request)
	return {
		session,
		timeZone: hints.timeZone,
		locale: getLocaleFromRequest(request),
	}
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
										<p className="text-body-sm font-semibold">{block.name}</p>
									) : (
										<p className="text-body-sm font-semibold">
											Block {block.orderIndex + 1}
										</p>
									)}
									<ul className="mt-2 space-y-1 pl-4">
										{block.steps.map((step) => (
											<li
												key={step.id}
												className="text-body-sm text-muted-foreground"
											>
												{step.description}
												{step.intensity ? ` — ${step.intensity}` : ''}
											</li>
										))}
									</ul>
								</li>
							))}
						</ul>
					</div>
				</CardContent>
			</Card>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
