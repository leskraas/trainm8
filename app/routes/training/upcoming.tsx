import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getUpcomingSessions } from '#app/utils/training.server.ts'
import {
	groupSessionsByDay,
	formatSessionTime,
	getStatusStyle,
} from '#app/utils/training.ts'
import { type Route } from './+types/upcoming.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Upcoming Workouts | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const sessions = await getUpcomingSessions(userId)
	return { sessions }
}

export default function UpcomingRoute({ loaderData }: Route.ComponentProps) {
	const { sessions } = loaderData

	if (sessions.length === 0) {
		return (
			<main className="container py-10">
				<h1 className="text-h1 mb-6">Upcoming Workouts</h1>
				<p className="text-muted-foreground">
					No upcoming sessions scheduled.
				</p>
			</main>
		)
	}

	const groups = groupSessionsByDay(sessions)

	return (
		<main className="container py-10">
			<h1 className="text-h1 mb-6">Upcoming Workouts</h1>
			<div className="flex flex-col gap-8">
				{groups.map((group) => (
					<section key={group.dateLabel}>
						<h2 className="text-h5 text-muted-foreground mb-3">
							{group.dateLabel}
						</h2>
						<ul className="flex flex-col gap-4">
							{group.sessions.map((session) => {
								const statusStyle = getStatusStyle(session.status)
								return (
								<li
									key={session.id}
									className="bg-muted rounded-3xl p-6"
								>
									<div className="mb-2 flex items-center gap-3">
										<span className="text-body-lg font-bold">
											{session.workout.title}
										</span>
										<span className="text-muted-foreground text-body-sm capitalize">
											{session.workout.activityType}
										</span>
										<span
											className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.className}`}
										>
											{statusStyle.label}
										</span>
									</div>
									<p className="text-body-sm text-muted-foreground mb-4">
										{formatSessionTime(session.scheduledAt)}
									</p>
									{session.workout.description ? (
										<p className="text-body-sm mb-4">
											{session.workout.description}
										</p>
									) : null}
									<ul className="flex flex-col gap-2">
										{session.workout.blocks.map((block) => (
											<li key={block.id}>
												{block.name ? (
													<p className="text-body-sm font-semibold mb-1">
														{block.name}
													</p>
												) : null}
												<ul className="flex flex-col gap-1 pl-4">
													{block.steps.map((step) => (
														<li
															key={step.id}
															className="text-body-sm text-muted-foreground"
														>
															{step.description}
															{step.intensity
																? ` — ${step.intensity}`
																: ''}
														</li>
													))}
												</ul>
											</li>
										))}
									</ul>
								</li>
								)
							})}
						</ul>
					</section>
				))}
			</div>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
