// Orient zone: the daily "go hard or recover?" answer. The validated Form &
// load card (compact-top winner) stays the hero; when an active plan exists a
// slim context bar rides beneath it with the road-to-race signals — countdown,
// plan phase + week N/M, and this week's load. Without a plan the bar is gone
// and only the Form reading remains (the "road to race" frame collapses).
import { Link } from 'react-router'
import {
	FormLoadCard,
	type LoadSnapshot,
	type LoadTriad,
} from '#app/components/form-load-card.tsx'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type PlanContext } from './presenter.ts'

export function ReadinessBanner({
	current,
	snapshots,
	trust,
	sustained,
	planContext,
}: {
	current: LoadTriad | null
	snapshots: LoadSnapshot[]
	trust: TsbTrust
	sustained: SustainedDeviation | null
	planContext: PlanContext | null
}) {
	return (
		<div className="space-y-3">
			<FormLoadCard
				current={current}
				snapshots={snapshots}
				trust={trust}
				sustained={sustained}
			/>
			{planContext ? <PlanContextBar ctx={planContext} /> : null}
		</div>
	)
}

function PlanContextBar({ ctx }: { ctx: PlanContext }) {
	return (
		<Link
			to={`/training/events/${ctx.eventId}`}
			aria-label={`Plan: ${ctx.eventName}`}
			className="bg-card hover:bg-muted/20 border-border/60 grid grid-cols-3 gap-4 rounded-xl border p-4 transition"
		>
			<PlanStat label="To race" value={`${ctx.daysToEvent}d`} sub={ctx.eventName} />
			<PlanStat
				label="Phase"
				value={`W${ctx.weekInPlan}`}
				sub={`of ${ctx.totalWeeks} · ${ctx.phase}`}
			/>
			<PlanStat
				label="Week load"
				value={ctx.weekLoadPct != null ? `${ctx.weekLoadPct}%` : '—'}
				sub={ctx.weekLoadPct != null ? 'of plan' : 'unavailable'}
			/>
		</Link>
	)
}

function PlanStat({
	label,
	value,
	sub,
}: {
	label: string
	value: string
	sub: string
}) {
	return (
		<div className="min-w-0">
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
