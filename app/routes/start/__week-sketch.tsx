import {
	type Effort,
	type WeekSketch as Sketch, type StartWeekSession 
} from '#app/utils/first-run/start-draft.ts'
import {
	FIRST_RUN_LABELS,
	NB_WEEKDAY_LABELS,
	nbDurationLabel,
	SIMPLE_START_LABELS,
	START_OPTION_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'

const L = SIMPLE_START_LABELS.sketch

/**
 * One mark colour per sport (design-system: track hues are marks); a Simple
 * Activity, which has no track hue, takes the muted one.
 */
const TRACK_MARK: Partial<Record<StartWeekSession['discipline'], string>> = {
	run: 'bg-track-run',
	bike: 'bg-track-bike',
	swim: 'bg-track-swim',
}

/** Solid for a hard session, fainter as it gets easier. */
const EFFORT_OPACITY: Record<Effort, string> = {
	easy: 'opacity-45',
	moderate: 'opacity-75',
	hard: 'opacity-100',
}

function duration(minutes: number): string {
	return nbDurationLabel(minutes * 60)
}

/**
 * _Uka di_, the **Week Sketch** (#563): seven days, Monday first, each a
 * column whose block is the day's session — taller for longer, more solid
 * the harder it is — with the week's session count and total time above. It is the
 * top Start Option's first week (`weekSketch`), so it never shows a week the
 * plan would not lay.
 *
 * A screen reader hears a list of days (`mandag: Rolig økt · Løping, 45 min`,
 * `tirsdag: fri`), or _Uka di er tom ennå_; the blocks are only a picture of
 * the same list. No motion yet: the blocks change in place (#558 S2; S10
 * adds the morphs).
 */
export function WeekSketch({ sketch }: { sketch: Sketch }) {
	const empty = sketch.sessionCount === 0
	const longest = Math.max(
		1,
		...sketch.days.flatMap((day) => day.sessions.map((s) => s.minutes)),
	)
	return (
		<section
			aria-labelledby="week-sketch-title"
			className="bg-card space-y-3 rounded-4xl p-4 shadow-xs"
			data-week-sketch
		>
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<h2
					id="week-sketch-title"
					className="text-overline text-muted-foreground shrink-0 uppercase"
				>
					{L.title}
				</h2>
				<p
					className="text-footnote text-muted-foreground tabular-nums"
					data-week-sketch-summary
				>
					{empty
						? L.empty
						: L.summary(sketch.sessionCount, duration(sketch.minutes))}
				</p>
			</div>
			<ol
				aria-label={L.title}
				aria-hidden={empty ? true : undefined}
				className="grid grid-cols-7 gap-1.5"
			>
				{sketch.days.map((day) => {
					const weekday = NB_WEEKDAY_LABELS[day.weekday]!
					const spoken =
						day.sessions.length === 0
							? L.free
							: day.sessions
									.map((session) =>
										L.session(
											session.effort === 'easy'
												? session.title
												: `${session.title} (${START_OPTION_LABELS.effort[session.effort]})`,
											duration(session.minutes),
										),
									)
									.join('; ')
					return (
						<li key={day.weekday} className="flex min-w-0 flex-col gap-1">
							<span className="sr-only">{L.day(weekday, spoken)}</span>
							<span
								aria-hidden
								className="bg-muted/60 flex h-16 flex-col justify-end gap-0.5 overflow-hidden rounded-2xl"
							>
								{day.sessions.map((session, index) => (
									<span
										key={index}
										className={cn(
											'block w-full rounded-xl',
											TRACK_MARK[session.discipline] ?? 'bg-muted-foreground',
											EFFORT_OPACITY[session.effort],
										)}
										style={{
											height: `${Math.max(14, Math.round((session.minutes / longest) * 100))}%`,
										}}
									/>
								))}
							</span>
							<span
								aria-hidden
								className="text-caption text-muted-foreground text-center"
							>
								{FIRST_RUN_LABELS.dayShort[day.weekday]}
							</span>
						</li>
					)
				})}
			</ol>
		</section>
	)
}
