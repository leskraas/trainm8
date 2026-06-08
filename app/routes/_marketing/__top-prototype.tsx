// PROTOTYPE — iterating on the "Form-forward" treatment (variant B1) for the
// dashboard's top region (the "Form" Coach card + the "Training load"
// CTL/ATL/TSB section), which currently stack tall above "Today". B1 won; this
// file now explores creative refinements B1a/B1b/B1c that keep Form as the hero
// but attack it differently. Switchable via `?topv=baseline|B1|B1a|B1b|B1c` on
// `/` and the floating TopPrototypeSwitcher (arrow keys cycle).
//
// Filename starts with `__` so react-router-auto-routes ignores it. When a
// refinement wins, fold it into `_marketing/index.tsx` (replacing the CoachCard
// + TrainingLoadSection block) and delete this file + the switcher.

import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { cn } from '#app/utils/misc.tsx'
import { type LoadSnapshot, type LoadTriad } from './training-load-section.tsx'

export const TOP_VARIANTS = ['baseline', 'B1', 'B1a', 'B1b', 'B1c'] as const
export type TopVariant = (typeof TOP_VARIANTS)[number]
export function isTopVariant(v: string | null): v is TopVariant {
	return v != null && (TOP_VARIANTS as readonly string[]).includes(v)
}

const VARIANT_NAMES: Record<TopVariant, string> = {
	baseline: 'Current (card + load grid)',
	B1: 'Form-forward (original)',
	B1a: 'Language-forward',
	B1b: 'Tinted Form panel',
	B1c: 'Trend as baseline',
}

type TopData = {
	current: LoadTriad | null
	snapshots: LoadSnapshot[]
	trust: TsbTrust
}

// ---------------------------------------------------------------------------
// Shared readiness tone (mirrors index.tsx's READINESS_TONE), extended with a
// `wash` (subtle tinted background) and `rule` (accent border colour) for the
// tinted-panel refinement.
// ---------------------------------------------------------------------------
const TONE: Record<
	ReturnType<typeof readinessFromTsb>['tone'],
	{ chip: string; accent: string; dot: string; wash: string; rule: string }
> = {
	fresh: {
		chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
		accent: 'text-emerald-600 dark:text-emerald-400',
		dot: 'bg-emerald-500',
		wash: 'bg-emerald-500/5',
		rule: 'border-l-emerald-500',
	},
	neutral: {
		chip: 'bg-muted text-muted-foreground',
		accent: 'text-foreground',
		dot: 'bg-muted-foreground',
		wash: 'bg-muted/40',
		rule: 'border-l-muted-foreground/40',
	},
	fatigued: {
		chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
		accent: 'text-amber-600 dark:text-amber-400',
		dot: 'bg-amber-500',
		wash: 'bg-amber-500/5',
		rule: 'border-l-amber-500',
	},
}

function signed(n: number) {
	const r = Math.round(n)
	return r > 0 ? `+${r}` : String(r)
}

function useReadiness(data: TopData) {
	const tsb = data.current?.tsb ?? null
	const coldStart = !data.trust.trustworthy || tsb == null
	const readiness = tsb != null ? readinessFromTsb(tsb) : null
	const tone = readiness ? TONE[readiness.tone] : TONE.neutral
	return { tsb, coldStart, readiness, tone }
}

// ---------------------------------------------------------------------------
// Mini sparkline. `subtle` dims it for supporting/backdrop use.
// ---------------------------------------------------------------------------
function MiniSparkline({
	snapshots,
	className,
	subtle,
}: {
	snapshots: LoadSnapshot[]
	className?: string
	subtle?: boolean
}) {
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
			className={cn('w-full', className)}
			role="img"
			aria-label="90-day CTL/ATL trend"
		>
			<polyline
				points={line('ctl')}
				fill="none"
				stroke="currentColor"
				strokeWidth={subtle ? 1.5 : 2}
				vectorEffect="non-scaling-stroke"
				className={cn('text-sky-500', subtle && 'opacity-40')}
			/>
			<polyline
				points={line('atl')}
				fill="none"
				stroke="currentColor"
				strokeWidth={subtle ? 1.5 : 2}
				vectorEffect="non-scaling-stroke"
				className={cn('text-rose-500', subtle && 'opacity-40')}
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

// ===========================================================================
// B1 (original) — Form-forward. Big signed number + readiness chip as hero,
// recommendation underneath; a subtle supporting trend strip on the right.
// Kept as the reference point.
// ===========================================================================
function VariantB1({ data }: { data: TopData }) {
	const { tsb, coldStart, readiness, tone } = useReadiness(data)
	return (
		<section
			aria-label="Form and training load"
			className="bg-card border-border/60 grid gap-6 rounded-xl border p-5 sm:grid-cols-[1fr_auto] sm:items-center"
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
							{signed(tsb!)}
						</span>
						<span
							className={cn(
								'rounded-full px-2.5 py-0.5 text-sm font-medium',
								tone.chip,
							)}
						>
							{readiness!.label}
						</span>
					</div>
				)}
				<p className="text-muted-foreground mt-2 text-sm">
					{coldStart
						? `Reliable after ${data.trust.requiredDays} days — day ${data.trust.daysOfHistory}.`
						: readiness!.recommendation}
				</p>
			</div>

			<div className="sm:border-border/60 sm:w-48 sm:border-l sm:pl-6">
				<MiniSparkline snapshots={data.snapshots} className="h-8" subtle />
				<div className="text-muted-foreground mt-2 flex justify-between text-xs">
					<MiniStat label="Fit" value={data.current?.ctl} />
					<MiniStat label="Fat" value={data.current?.atl} />
					<MiniStat label="Form" value={data.current?.tsb} />
				</div>
			</div>
		</section>
	)
}

// ===========================================================================
// B1a — Language-forward. The readiness *word* ("Fresh") is the hero; the
// signed number rides alongside as a coloured accent. Bets on the plain-
// language reading first, the metric second. Trend stays subtle on the right.
// ===========================================================================
function VariantB1a({ data }: { data: TopData }) {
	const { tsb, coldStart, readiness, tone } = useReadiness(data)
	return (
		<section
			aria-label="Form and training load"
			className="bg-card border-border/60 grid gap-6 rounded-xl border p-5 sm:grid-cols-[1fr_auto] sm:items-center"
		>
			<div>
				<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
					Form
				</p>
				{coldStart ? (
					<p className="text-foreground mt-1 text-3xl font-semibold tracking-tight">
						Building baseline
					</p>
				) : (
					<div className="mt-1 flex items-baseline gap-3">
						<span className="text-foreground text-4xl font-semibold tracking-tight">
							{readiness!.label}
						</span>
						<span
							className={cn(
								'text-2xl font-semibold tracking-tight tabular-nums',
								tone.accent,
							)}
						>
							{signed(tsb!)}
						</span>
					</div>
				)}
				<p className="text-muted-foreground mt-2 text-sm">
					{coldStart
						? `Reliable after ${data.trust.requiredDays} days — day ${data.trust.daysOfHistory}.`
						: readiness!.recommendation}
				</p>
			</div>

			<div className="sm:border-border/60 sm:w-48 sm:border-l sm:pl-6">
				<MiniSparkline snapshots={data.snapshots} className="h-8" subtle />
				<div className="text-muted-foreground mt-2 flex justify-between text-xs">
					<MiniStat label="Fit" value={data.current?.ctl} />
					<MiniStat label="Fat" value={data.current?.atl} />
					<MiniStat label="Form" value={data.current?.tsb} />
				</div>
			</div>
		</section>
	)
}

// ===========================================================================
// B1b — Tinted Form panel. The Form side gets a tone-coloured wash + a thick
// accent rule on the left edge, so the state reads on colour before you parse
// the number. Big number hero. Trend subtle on the right.
// ===========================================================================
function VariantB1b({ data }: { data: TopData }) {
	const { tsb, coldStart, readiness, tone } = useReadiness(data)
	return (
		<section
			aria-label="Form and training load"
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
							{signed(tsb!)}
						</span>
						<span className={cn('text-2xl font-medium', tone.accent)}>
							{readiness!.label}
						</span>
					</div>
				)}
				<p className="text-muted-foreground mt-2 text-sm">
					{coldStart
						? `Reliable after ${data.trust.requiredDays} days — day ${data.trust.daysOfHistory}.`
						: readiness!.recommendation}
				</p>
			</div>

			<div className="border-border/60 sm:w-48 sm:border-l sm:pl-6">
				<MiniSparkline snapshots={data.snapshots} className="h-8" subtle />
				<div className="text-muted-foreground mt-2 flex justify-between text-xs">
					<MiniStat label="Fit" value={data.current?.ctl} />
					<MiniStat label="Fat" value={data.current?.atl} />
					<MiniStat label="Form" value={data.current?.tsb} />
				</div>
			</div>
		</section>
	)
}

// ===========================================================================
// B1c — Trend as baseline. Form hero + recommendation up top; the sparkline
// becomes a thin full-width strip running edge-to-edge across the bottom of the
// card (a "ground line"), with the three numbers floating above its start.
// Editorial; the trend is integrated rather than boxed in a side column.
// ===========================================================================
function VariantB1c({ data }: { data: TopData }) {
	const { tsb, coldStart, readiness, tone } = useReadiness(data)
	return (
		<section
			aria-label="Form and training load"
			className="bg-card border-border/60 overflow-hidden rounded-xl border"
		>
			<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 pt-5 pb-3">
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
								{signed(tsb!)}
							</span>
							<span
								className={cn(
									'rounded-full px-2.5 py-0.5 text-sm font-medium',
									tone.chip,
								)}
							>
								{readiness!.label}
							</span>
						</div>
					)}
					<p className="text-muted-foreground mt-2 text-sm">
						{coldStart
							? `Reliable after ${data.trust.requiredDays} days — day ${data.trust.daysOfHistory}.`
							: readiness!.recommendation}
					</p>
				</div>
				<div className="text-muted-foreground flex gap-x-5 text-xs">
					<MiniStat label="Fitness" value={data.current?.ctl} />
					<MiniStat label="Fatigue" value={data.current?.atl} />
					<MiniStat label="Form" value={data.current?.tsb} />
				</div>
			</div>

			{/* ground-line trend */}
			<MiniSparkline snapshots={data.snapshots} className="h-10 w-full" />
		</section>
	)
}

// ===========================================================================
// Entry point — `baseline` returns null so index.tsx falls back to the live
// CoachCard + TrainingLoadSection.
// ===========================================================================
export function TopVariantRegion({
	variant,
	data,
}: {
	variant: TopVariant
	data: TopData
}) {
	if (variant === 'B1') return <VariantB1 data={data} />
	if (variant === 'B1a') return <VariantB1a data={data} />
	if (variant === 'B1b') return <VariantB1b data={data} />
	if (variant === 'B1c') return <VariantB1c data={data} />
	return null
}

// ===========================================================================
// Floating switcher — bottom-centre pill, arrow keys cycle. Hidden in prod.
// ===========================================================================
export function TopPrototypeSwitcher({ current }: { current: TopVariant }) {
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()

	function go(next: TopVariant) {
		const params = new URLSearchParams(searchParams)
		params.set('topv', next)
		navigate(`?${params.toString()}`, {
			replace: true,
			preventScrollReset: true,
		})
	}

	const idx = TOP_VARIANTS.indexOf(current)
	const prev = () =>
		go(TOP_VARIANTS[(idx - 1 + TOP_VARIANTS.length) % TOP_VARIANTS.length]!)
	const nextV = () => go(TOP_VARIANTS[(idx + 1) % TOP_VARIANTS.length]!)

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const t = e.target as HTMLElement | null
			if (
				t &&
				(t.tagName === 'INPUT' ||
					t.tagName === 'TEXTAREA' ||
					t.isContentEditable)
			) {
				return
			}
			if (e.key === 'ArrowLeft') prev()
			if (e.key === 'ArrowRight') nextV()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})

	if (process.env.NODE_ENV === 'production') return null

	return (
		<div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
			<div className="flex items-center gap-2 rounded-full bg-neutral-900 px-2 py-1.5 text-neutral-50 shadow-lg ring-1 ring-white/10">
				<button
					type="button"
					onClick={prev}
					aria-label="Previous variant"
					className="rounded-full px-2 py-1 hover:bg-white/10"
				>
					←
				</button>
				<span className="px-1 text-xs font-medium tabular-nums">
					{current} — {VARIANT_NAMES[current]}
				</span>
				<button
					type="button"
					onClick={nextV}
					aria-label="Next variant"
					className="rounded-full px-2 py-1 hover:bg-white/10"
				>
					→
				</button>
			</div>
		</div>
	)
}
