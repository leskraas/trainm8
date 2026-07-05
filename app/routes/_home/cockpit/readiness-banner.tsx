// Orient zone: the daily "go hard or recover?" answer. The validated Form &
// load card (compact-top winner) stays the hero; when an active plan exists a
// slim context bar rides beneath it with the road-to-race signals — countdown,
// plan phase + week N/M, and this week's load — and the whole bar opens the
// Target Event detail (#178: Events needs no menu item). Without a plan the
// same slot shows the Plan Generation call-to-action, which doubles as the
// Events entry point.
import { Link } from 'react-router'
import {
	FormLoadCard,
	type LoadSnapshot,
	type LoadTriad,
} from '#app/components/form-load-card.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type PlanContext } from './presenter.ts'

export function ReadinessBanner({
	current,
	snapshots,
	trust,
	sustained,
	nudge,
	planContext,
}: {
	current: LoadTriad | null
	snapshots: LoadSnapshot[]
	trust: TsbTrust
	sustained: SustainedDeviation | null
	nudge: SessionNudge
	planContext: PlanContext | null
}) {
	return (
		<div className="space-y-3">
			<FormLoadCard
				current={current}
				snapshots={snapshots}
				trust={trust}
				sustained={sustained}
				nudge={nudge}
			/>
			{planContext ? <PlanContextBar ctx={planContext} /> : <PlanCtaBar />}
		</div>
	)
}

/**
 * The plan slot without an active plan (#178): a Plan Generation
 * call-to-action that also carries the Events entry, so Events stays
 * reachable when there is no plan-arc bar to click through.
 */
function PlanCtaBar() {
	return (
		<div className="bg-card border-border/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
			<div className="min-w-0">
				<p className="text-foreground text-sm font-medium">No active plan</p>
				<p className="text-muted-foreground text-xs">
					Generate a training plan toward your next event.
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Link
					to="/training/events"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Events
				</Link>
				<Link
					to="/training/plan/new"
					className={buttonVariants({ variant: 'default', size: 'sm' })}
				>
					Generate plan
				</Link>
			</div>
		</div>
	)
}

// Plain-language plan arc (#181): the stats spell themselves out — "Week 9" /
// "of 10 · Peak phase" (the presenter's arcLabel split across value and
// caption) and "66%" / "of planned week load" — never "W9 of 10 · Peak" or
// "66% of plan". The whole bar is a Link, so the legends stay inline captions
// rather than nested tooltip buttons.
function PlanContextBar({ ctx }: { ctx: PlanContext }) {
	return (
		<Link
			to={`/training/events/${ctx.eventId}`}
			aria-label={`Plan: ${ctx.eventName}`}
			className="bg-card hover:bg-muted/20 border-border/60 grid grid-cols-3 gap-4 rounded-xl border p-4 transition"
		>
			<PlanStat
				label="To race"
				value={`${ctx.daysToEvent} days`}
				sub={ctx.eventName}
			/>
			<PlanStat
				label="Phase"
				value={`Week ${ctx.weekInPlan}`}
				sub={`of ${ctx.totalWeeks} · ${ctx.phase} phase`}
				title={ctx.arcLabel}
			/>
			<PlanStat
				label="Week load"
				value={ctx.weekLoadPct != null ? `${ctx.weekLoadPct}%` : '—'}
				sub={ctx.weekLoadPct != null ? 'of planned week load' : 'unavailable'}
				title={ctx.weekLoadLabel}
			/>
		</Link>
	)
}

function PlanStat({
	label,
	value,
	sub,
	title,
}: {
	label: string
	value: string
	sub: string
	/** Optional one-line spelled-out reading (#181), e.g. "Week 9 of 10 · Peak phase". */
	title?: string
}) {
	return (
		<div className="min-w-0" title={title}>
			<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
				{label}
			</p>
			<p className="text-foreground text-xl font-semibold tabular-nums">
				{value}
			</p>
			<p className="text-muted-foreground truncate text-[11px]">{sub}</p>
		</div>
	)
}
