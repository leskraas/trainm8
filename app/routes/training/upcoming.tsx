import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getHints } from '#app/utils/client-hints.tsx'
import { getLocaleFromRequest } from '#app/utils/locale.server.ts'
import { getUpcomingSessions } from '#app/utils/training.server.ts'
import { groupSessionsByDay } from '#app/utils/training.ts'
import { type Route } from './+types/upcoming.ts'
import { UpcomingLedgerRow } from './upcoming-ledger-row.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'Upcoming Workouts | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const sessions = await getUpcomingSessions(userId)
	const hints = getHints(request)
	return {
		sessions,
		timeZone: hints.timeZone,
		locale: getLocaleFromRequest(request),
	}
}

export default function UpcomingRoute({ loaderData }: Route.ComponentProps) {
	const { sessions, timeZone, locale } = loaderData

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

	const groups = groupSessionsByDay(sessions, { timeZone, locale })
	const formatOptions = { locale, timeZone }

	return (
		<main className="container py-10">
			<h1 className="text-h1 mb-6">Upcoming Workouts</h1>
			<div className="overflow-hidden rounded-lg border border-border">
				<div className="text-body-sm text-muted-foreground hidden bg-muted/40 font-medium sm:grid sm:grid-cols-[6.5rem_4.5rem_1fr_auto] sm:gap-3 sm:px-3 sm:py-2">
					<span>Time</span>
					<span>Activity</span>
					<span>Workout</span>
					<span className="text-right">Status</span>
				</div>
				{groups.map((group, groupIndex) => (
					<section
						key={group.dateLabel}
						className={groupIndex > 0 ? 'border-t border-border' : undefined}
					>
						<h2 className="text-body-sm text-foreground bg-muted/30 px-3 py-1.5 font-medium">
							{group.dateLabel}
						</h2>
						<ul className="divide-y divide-border/80">
							{group.sessions.map((session) => (
								<UpcomingLedgerRow
									key={session.id}
									session={session}
									formatOptions={formatOptions}
								/>
							))}
						</ul>
					</section>
				))}
			</div>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
