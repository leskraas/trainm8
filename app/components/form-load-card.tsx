import {
	type CoachTone,
	reconcileCoach,
	type SustainedDeviation,
} from '#app/utils/load/coach.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
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

// Single source of truth for Coach-card colour. B1b reads the state on colour
// before you parse the number: a tone-tinted `wash` background + a thick left
// `rule` accent, with the number/label in the `accent` ink. The Form readiness
// tones (fresh/neutral/fatigued) are joined by the two sustained-adherence tones
// (#120): `under` (drifting) reads as caution like fatigue; `over` (overreaching)
// gets the strongest warning palette, since it is the riskier failure mode.
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

// The Form & load card folds the readiness "Form" reading and the CTL/ATL/TSB
// numbers into one compact, Form-forward card at the top of home (winner of the
// compact-top prototype, variant B1b). The signed TSB + readiness label is the
// hero; a subtle trend sparkline and three small numbers support on the side.
//
// During cold-start (untrustworthy TSB, ADR 0008/0010) it never shows a number
// — it shows "Building baseline — day N/42" (the Unavailable Metric principle).
//
// Form (TSB) and sustained Plan Adherence (#120) are reconciled into one voice
// by `reconcileCoach`: the card never shows two competing lines. Adherence is
// independent of TSB trust, so a sustained deviation can still speak during
// cold-start, when Form itself has no number to show.
//
// The Session Nudge (#157) is the coach→plan decision on the next planned
// session. When it *held* or is *unavailable*, its reason line replaces the raw
// recommendation (naming the session and real numbers). For an *eased* decision
// this slice keeps the existing recommendation line untouched — nothing has been
// eased yet, and the card must never claim an ease that didn't happen (Slice 2
// applies the ease and switches the card to the eased reason).
export function FormLoadCard({
	current,
	snapshots,
	trust,
	sustained = null,
	nudge,
}: {
	current: LoadTriad | null
	snapshots: LoadSnapshot[]
	trust: TsbTrust
	sustained?: SustainedDeviation | null
	nudge?: SessionNudge
}) {
	const tsb = current?.tsb ?? null
	// Cold-start (ADR 0008/0010): below the trustworthiness gate — or with no TSB
	// computed yet — show the honest "building baseline" state, never a number.
	const coldStart = !trust.trustworthy || tsb == null
	const readiness = !coldStart ? readinessFromTsb(tsb) : null
	const coach = reconcileCoach(readiness, sustained)
	const tone = COACH_TONE[coach?.tone ?? 'neutral']
	// During cold-start the recommendation line stays the "building baseline"
	// explainer — unless a sustained deviation (adherence) has something to say.
	const showAdherenceWhileColdStart = coldStart && coach?.source === 'adherence'

	// The Session Nudge reason line (#157/#158) replaces the raw recommendation
	// when the coach *eased* the next session, *held* it, or the reading is
	// *unavailable* — each names the session with real numbers, and (for `eased`,
	// #158) the softened prescription it describes is the session's real persisted
	// one. `none` (no upcoming session) keeps the existing line so the card never
	// talks about a session that doesn't exist.
	const nudgeReason = nudge && nudge.outcome !== 'none' ? nudge.reason : null

	return (
		<section
			aria-label="Form and training load"
			data-tone={coach?.tone ?? 'neutral'}
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
							{coach!.label}
						</span>
					</div>
				)}
				<p className="text-muted-foreground mt-2 text-sm">
					{nudgeReason ??
						(coldStart && !showAdherenceWhileColdStart
							? `Your Form reading is reliable after ${trust.requiredDays} days — day ${trust.daysOfHistory}/${trust.requiredDays}.`
							: coach!.recommendation)}
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
