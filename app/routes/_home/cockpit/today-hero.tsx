// Act zone: today's prescription (or the next one up). Title, the volume/TSS it
// asks for, the concrete Intensity Target (pace/power/HR resolved from the
// athlete's thresholds, #130), and the intensity shape from the workout's real
// steps.
import { Link } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { type TodayCard } from './presenter.ts'
import { DiscDot, SessionStructure, targetText } from './shared.tsx'

export function TodayHero({ today }: { today: TodayCard | null }) {
	const target = today ? targetText(today.target) : null
	if (!today) {
		return (
			<div>
				<p className="text-foreground text-base font-medium">
					Nothing scheduled
				</p>
				<p className="text-muted-foreground mt-1 text-sm">
					No upcoming session on the calendar.{' '}
					<Link
						to="/training/sessions/new"
						className="text-primary hover:underline"
					>
						Plan one →
					</Link>
				</p>
			</div>
		)
	}
	return (
		<div>
			<div className="flex items-center gap-2">
				<DiscDot discipline={today.discipline} />
				<span className="text-muted-foreground text-xs font-medium">
					{today.disciplineLabel} ·{' '}
					{today.isToday ? 'today' : today.dateLabel}
				</span>
			</div>
			<h3 className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight">
				{today.title}
			</h3>
			{today.durationMin != null || today.plannedTss != null || target ? (
				<div className="text-muted-foreground mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
					{today.durationMin != null ? (
						<span>
							<span className="text-foreground font-medium tabular-nums">
								{today.durationMin}
							</span>{' '}
							min
						</span>
					) : null}
					{today.plannedTss != null ? (
						<span>
							<span className="text-foreground font-medium tabular-nums">
								{today.plannedTss}
							</span>{' '}
							TSS
						</span>
					) : null}
					{target ? (
						<span className="text-foreground font-medium tabular-nums">
							{target}
						</span>
					) : null}
				</div>
			) : null}
			{today.profile.length > 0 ? (
				<div className="mt-4">
					<SessionStructure bars={today.profile} />
				</div>
			) : null}
			<div className="mt-5">
				<Button
					nativeButton={false}
					render={<Link to={`/training/sessions/${today.id}`} />}
				>
					<Icon name="arrow-right" size="sm" />
					{today.isToday ? 'Start session' : 'Open session'}
				</Button>
			</div>
		</div>
	)
}
