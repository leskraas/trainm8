import { Badge } from '#app/components/ui/badge.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Link } from 'react-router'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import {
	formatSessionTime,
	getStatusLabel,
	getStatusVariant,
} from '#app/utils/training.ts'

type SessionCardProps = {
	session: UpcomingSession
}

export function SessionCard({ session }: SessionCardProps) {
	return (
		<li>
			<Card className="bg-muted">
				<CardHeader className="flex items-start justify-between gap-3">
					<div className="flex flex-col gap-1">
						<CardTitle>{session.workout.title}</CardTitle>
						<CardDescription className="capitalize">
							{session.workout.activityType}
						</CardDescription>
					</div>
					<Badge variant={getStatusVariant(session.status)}>
						{getStatusLabel(session.status)}
					</Badge>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<p className="text-body-sm text-muted-foreground">
						{formatSessionTime(session.scheduledAt)}
					</p>
					{session.workout.description ? (
						<p className="text-body-sm">{session.workout.description}</p>
					) : null}
					<Link
						to={`/training/upcoming/${session.id}`}
						prefetch="intent"
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						View details
					</Link>
					<ul className="flex flex-col gap-2">
						{session.workout.blocks.map((block) => (
							<li key={block.id} className="flex flex-col gap-1">
								{block.name ? (
									<p className="text-body-sm font-semibold">{block.name}</p>
								) : null}
								<ul className="flex flex-col gap-1 pl-4">
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
				</CardContent>
			</Card>
		</li>
	)
}
