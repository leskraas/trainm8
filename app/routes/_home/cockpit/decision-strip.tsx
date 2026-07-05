// The permanent decision strip (#184): the Coach card and the Today card merged
// into the page's one focal element. It answers "what do I do today?" in a
// single glance — the Form value with its plain-language label, today's session
// (discipline dot, title, duration, resolved Intensity Target), the coach's
// one-line reasoning, and a single honestly-named action. Everything analytical
// lives behind the Week / Trends / History tabs beneath it.
//
// The Form half keeps the Coach card's honesty rules verbatim:
// - Cold-start (untrustworthy TSB, ADR 0008/0010) never shows a number — it
//   shows "Building baseline — day N/42" (the Unavailable Metric principle).
// - Form (TSB) and sustained Plan Adherence (#120) reconcile into one voice via
//   `reconcileCoach`; the strip never speaks two competing lines.
// - The Session Nudge reason (#157/#158/#187) replaces the raw recommendation
//   when the coach eased/held the next session or the reading is unavailable,
//   and a miss-driven ease is only claimed past-tense once persisted (the
//   presenter's honesty guard hands this strip the acknowledgement otherwise).
//
// The action half is the single session CTA on the whole page (#179): its label
// comes from Session Status via the presenter (`sessionCtaLabel`) and it only
// ever opens the Workout Detail View — in-app recording is a stated non-goal.
import { Link } from 'react-router'
import { LoadLegendLabel } from '#app/components/load-legend.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { formatSigned as signed } from '#app/utils/format.ts'
import {
	type CoachTone,
	reconcileCoach,
	type SustainedDeviation,
} from '#app/utils/load/coach.ts'
import { FORM_LEGEND } from '#app/utils/load/legends.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import { cn } from '#app/utils/misc.tsx'
import { type TodayCard } from './presenter.ts'
import { DiscDot, targetText } from './shared.tsx'

// Single source of truth for the strip's colour (inherited from the Coach
// card, variant B1b): a tone-tinted wash + a thick left rule, with the Form
// number/label in the accent ink. The readiness tones (fresh/neutral/fatigued)
// are joined by the sustained-adherence tones (#120): `under` reads as caution
// like fatigue; `over` gets the strongest warning palette.
const COACH_TONE: Record<
	CoachTone,
	{ accent: string; wash: string; rule: string }
> = {
	fresh: {
		accent: 'text-emerald-600 dark:text-emerald-400',
		wash: 'bg-emerald-500/5',
		rule: 'border-l-emerald-500',
	},
	neutral: {
		accent: 'text-foreground',
		wash: 'bg-muted/40',
		rule: 'border-l-muted-foreground/40',
	},
	fatigued: {
		accent: 'text-amber-600 dark:text-amber-400',
		wash: 'bg-amber-500/5',
		rule: 'border-l-amber-500',
	},
	under: {
		accent: 'text-amber-600 dark:text-amber-400',
		wash: 'bg-amber-500/5',
		rule: 'border-l-amber-500',
	},
	over: {
		accent: 'text-rose-600 dark:text-rose-400',
		wash: 'bg-rose-500/5',
		rule: 'border-l-rose-500',
	},
}

export function DecisionStrip({
	current,
	trust,
	sustained = null,
	nudge,
	today,
}: {
	current: LoadTriad | null
	trust: TsbTrust
	sustained?: SustainedDeviation | null
	nudge?: SessionNudge
	/** Today's (or the next) planned session from `buildTodayCard`; null when none. */
	today: TodayCard | null
}) {
	const tsb = current?.tsb ?? null
	// Cold-start (ADR 0008/0010): below the trustworthiness gate — or with no TSB
	// computed yet — show the honest "building baseline" state, never a number.
	const coldStart = !trust.trustworthy || tsb == null
	const readiness = !coldStart ? readinessFromTsb(tsb) : null
	const coach = reconcileCoach(readiness, sustained)
	const tone = COACH_TONE[coach?.tone ?? 'neutral']
	// During cold-start the reasoning line stays the "building baseline"
	// explainer — unless a sustained deviation (adherence) has something to say.
	const showAdherenceWhileColdStart = coldStart && coach?.source === 'adherence'

	// The Session Nudge reason line (#157/#158) replaces the raw recommendation
	// when the coach *eased* the next session, *held* it, or the reading is
	// *unavailable*. `none` (no upcoming session) keeps the existing line so the
	// strip never talks about a session that doesn't exist.
	const nudgeReason = nudge && nudge.outcome !== 'none' ? nudge.reason : null
	const reason =
		nudgeReason ??
		(coldStart && !showAdherenceWhileColdStart
			? `Your Form reading is reliable after ${trust.requiredDays} days — day ${trust.daysOfHistory}/${trust.requiredDays}.`
			: coach!.recommendation)

	return (
		<section
			aria-label="Today's decision"
			data-testid="decision-strip"
			data-tone={coach?.tone ?? 'neutral'}
			className={cn(
				'border-border/60 rounded-xl border border-l-4 p-5',
				tone.wash,
				tone.rule,
			)}
		>
			<div className="grid gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] sm:items-center lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_auto]">
				{/* Form reading + the coach's one-line reasoning. */}
				<div className="min-w-0">
					<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						<LoadLegendLabel legend={FORM_LEGEND} />
					</p>
					{coldStart ? (
						<p className="text-foreground mt-1 text-2xl font-semibold tracking-tight">
							Building baseline
						</p>
					) : (
						<div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<span
								className={cn(
									'text-4xl leading-none font-semibold tracking-tight tabular-nums',
									tone.accent,
								)}
							>
								{signed(tsb)}
							</span>
							<span className={cn('text-xl font-medium', tone.accent)}>
								{coach!.label}
							</span>
						</div>
					)}
					<p className="text-muted-foreground mt-2 text-sm">{reason}</p>
				</div>

				{/* Today's session. */}
				<div className="border-border/60 min-w-0 sm:border-l sm:pl-6">
					{today ? (
						<>
							<div className="flex items-center gap-2">
								<DiscDot discipline={today.discipline} />
								<span className="text-muted-foreground text-xs font-medium">
									{today.disciplineLabel} ·{' '}
									{today.isToday ? 'today' : today.dateLabel}
								</span>
							</div>
							<p className="text-foreground mt-1 truncate text-lg font-semibold tracking-tight">
								{today.title}
							</p>
							<TodaySessionFacts today={today} />
						</>
					) : (
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
					)}
				</div>

				{/* The single, honestly-named action (#179). */}
				{today ? (
					<div className="sm:col-span-2 lg:col-span-1 lg:justify-self-end">
						<Button
							nativeButton={false}
							render={<Link to={`/training/sessions/${today.id}`} />}
						>
							<Icon name="arrow-right" size="sm" />
							{today.cta}
						</Button>
					</div>
				) : null}
			</div>
		</section>
	)
}

/** Duration · planned TSS · resolved Intensity Target — only what truly exists. */
function TodaySessionFacts({ today }: { today: TodayCard }) {
	const target = targetText(today.target)
	if (today.durationMin == null && today.plannedTss == null && !target) {
		return null
	}
	return (
		<div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
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
	)
}
