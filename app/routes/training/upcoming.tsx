import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { SessionCard } from '#app/components/session-card.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getUpcomingSessions } from '#app/utils/training.server.ts'
import { groupSessionsByDay } from '#app/utils/training.ts'
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
				<Card className="max-w-xl">
					<CardContent>
						<p className="text-muted-foreground">
							No upcoming sessions scheduled.
						</p>
					</CardContent>
				</Card>
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
							{group.sessions.map((session) => (
								<SessionCard key={session.id} session={session} />
							))}
						</ul>
					</section>
				))}
			</div>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
