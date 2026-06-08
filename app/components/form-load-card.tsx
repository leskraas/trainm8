import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { cn } from '#app/utils/misc.tsx'

export type LoadTriad = { ctl: number; atl: number; tsb: number }
export type LoadSnapshot = {
	date: string
	ctl: number
	atl: number
	tsb: number
}

function signed(n: number): string {
	const r = Math.round(n)
	return r > 0 ? `+${r}` : String(r)
}

// Single source of truth for readiness colour. B1b reads the state on colour
// before you parse the number: a tone-tinted `wash` background + a thick left
// `rule` accent, with the number/label in the `accent` ink.
const READINESS_TONE: Record<
	ReturnType<typeof readinessFromTsb>['tone'],
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
}

// The Form & load card folds the readiness "Form" reading and the CTL/ATL/TSB
// numbers into one compact, Form-forward card at the top of home (winner of the
// compact-top prototype, variant B1b). The signed TSB + readiness label is the
// hero; a subtle trend sparkline and three small numbers support on the side.
//
// During cold-start (untrustworthy TSB, ADR 0008/0010) it never shows a number
// — it shows "Building baseline — day N/42" (the Unavailable Metric principle).
export function FormLoadCard({
	current,
	snapshots,
	trust,
}: {
	current: LoadTriad | null
	snapshots: LoadSnapshot[]
	trust: TsbTrust
}) {
	const tsb = current?.tsb ?? null
	// Cold-start (ADR 0008/0010): below the trustworthiness gate — or with no TSB
	// computed yet — show the honest "building baseline" state, never a number.
	const coldStart = !trust.trustworthy || tsb == null
	const readiness = !coldStart ? readinessFromTsb(tsb) : null
	const tone = READINESS_TONE[readiness?.tone ?? 'neutral']

	return (
		<section
			aria-label="Form and training load"
			data-tone={readiness?.tone ?? 'neutral'}
			className={cn(
				'border-border/60 grid gap-6 overflow-hidden rounded-xl border border-l-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center',
				tone.wash,
				tone.rule,
			)}
		>
			<div>
				<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
					Form
				</p>
				{coldStart ? (
					<p className="text-foreground mt-1 text-2xl font-semibold tracking-tight">
						Building baseline
					</p>
				) : (
					<div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<span
							className={cn(
								'text-5xl leading-none font-semibold tracking-tight tabular-nums',
								tone.accent,
							)}
						>
							{signed(tsb)}
						</span>
						<span className={cn('text-2xl font-medium', tone.accent)}>
							{readiness!.label}
						</span>
					</div>
				)}
				<p className="text-muted-foreground mt-2 text-sm">
					{coldStart
						? `Your Form reading is reliable after ${trust.requiredDays} days — day ${trust.daysOfHistory}/${trust.requiredDays}.`
						: readiness!.recommendation}
				</p>
			</div>

			<div className="border-border/60 sm:w-48 sm:border-l sm:pl-6">
				<MiniSparkline snapshots={snapshots} />
				<div className="text-muted-foreground mt-2 flex justify-between text-xs">
					<MiniStat label="Fit" value={current?.ctl} />
					<MiniStat label="Fat" value={current?.atl} />
					<MiniStat label="Form" value={current?.tsb} />
				</div>
			</div>
		</section>
	)
}

// Subtle supporting trend: CTL (sky) over ATL (rose), dimmed so the hero number
// stays dominant. Hidden when there's no history yet.
function MiniSparkline({ snapshots }: { snapshots: LoadSnapshot[] }) {
	if (snapshots.length === 0) return null
	const maxAbs = Math.max(
		...snapshots.map((s) => s.ctl),
		...snapshots.map((s) => s.atl),
		1,
	)
	const W = 240
	const H = 40
	const pad = 2
	const x = (i: number) =>
		pad + (i / Math.max(snapshots.length - 1, 1)) * (W - pad * 2)
	const y = (v: number) => H - pad - (v / maxAbs) * (H - pad * 2)
	const line = (k: 'ctl' | 'atl') =>
		snapshots.map((s, i) => `${x(i)},${y(s[k])}`).join(' ')
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			className="h-8 w-full"
			role="img"
			aria-label="90-day CTL/ATL trend"
		>
			<polyline
				points={line('ctl')}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
				className="text-sky-500 opacity-40"
			/>
			<polyline
				points={line('atl')}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
				className="text-rose-500 opacity-40"
			/>
		</svg>
	)
}

function MiniStat({ label, value }: { label: string; value?: number | null }) {
	return (
		<span className="flex items-baseline gap-1.5">
			<span className="text-xs">{label}</span>
			<span className="text-foreground text-sm font-semibold tabular-nums">
				{value != null ? Math.round(value) : '—'}
			</span>
		</span>
	)
}
