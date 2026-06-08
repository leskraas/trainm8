// PROTOTYPE — iterating on the "merged card + sparkline" treatment (variant B)
// for the dashboard's top region (the "Form" Coach card + the "Training load"
// CTL/ATL/TSB section), which currently stack tall above "Today". B won; this
// file now explores refinements B1/B2/B3 of that single-card concept.
// Switchable via `?topv=baseline|B|B1|B2|B3` on `/` and the floating
// TopPrototypeSwitcher (arrow keys cycle).
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

export const TOP_VARIANTS = ['baseline', 'B', 'B1', 'B2', 'B3'] as const
export type TopVariant = (typeof TOP_VARIANTS)[number]
export function isTopVariant(v: string | null): v is TopVariant {
	return v != null && (TOP_VARIANTS as readonly string[]).includes(v)
}

const VARIANT_NAMES: Record<TopVariant, string> = {
	baseline: 'Current (card + load grid)',
	B: 'Merged card (original)',
	B1: 'Form-forward',
	B2: 'Sparkline backdrop',
	B3: 'Trend-forward, 3 zones',
}

type TopData = {
	current: LoadTriad | null
	snapshots: LoadSnapshot[]
	trust: TsbTrust
}

// ---------------------------------------------------------------------------
// Shared readiness tone (mirrors index.tsx's READINESS_TONE)
// ---------------------------------------------------------------------------
const TONE: Record<
	ReturnType<typeof readinessFromTsb>['tone'],
	{ chip: string; accent: string; dot: string }
> = {
	fresh: {
		chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
		accent: 'text-emerald-600 dark:text-emerald-400',
		dot: 'bg-emerald-500',
	},
	neutral: {
		chip: 'bg-muted text-muted-foreground',
		accent: 'text-foreground',
		dot: 'bg-muted-foreground',
	},
	fatigued: {
		chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
		accent: 'text-amber-600 dark:text-amber-400',
		dot: 'bg-amber-500',
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
// Mini sparkline (compact version of training-load-section's Sparkline).
// `subtle` dims it for backdrop use.
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

function MiniStat({
	label,
	value,
	stacked,
}: {
	label: string
	value?: number | null
	stacked?: boolean
}) {
	if (stacked) {
		return (
			<span className="flex flex-col">
				<span className="text-muted-foreground text-[10px] tracking-wide uppercase">
					{label}
				</span>
				<span className="text-foreground text-lg font-semibold tabular-nums">
					{value != null ? Math.round(value) : '—'}
				</span>
			</span>
		)
	}
	return (
		<span className="flex items-baseline gap-1.5">
			<span className="text-xs">{label}</span>
			<span className="text-foreground text-sm font-semibold tabular-nums">
				{value != null ? Math.round(value) : '—'}
			</span>
		</span>
	)
}

function TrendLegend() {
	return (
		<span className="flex gap-3">
			<span className="flex items-center gap-1">
				<span className="inline-block h-0.5 w-3 rounded bg-sky-500" />
				CTL
			</span>
			<span className="flex items-center gap-1">
				<span className="inline-block h-0.5 w-3 rounded bg-rose-500" />
				ATL
			</span>
		</span>
	)
}

// ===========================================================================
// B (original) — single card, two columns. Form headline left (divider), the
// load trend (sparkline + 3 numbers) right. Kept as the reference point.
// ===========================================================================
function VariantB({ data }: { data: TopData }) {
	const { tsb, coldStart, readiness, tone } = useReadiness(data)
	return (
		<section
			aria-label="Form and training load"
			className="bg-card border-border/60 grid gap-6 rounded-xl border p-5 sm:grid-cols-[auto_1fr] sm:items-center"
		>
			<div className="sm:border-border/60 sm:border-r sm:pr-6">
				<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
					Form
				</p>
				{coldStart ? (
					<p className="text-foreground mt-1 text-lg font-semibold">
						Building baseline
					</p>
				) : (
					<div className="mt-1 flex items-baseline gap-2">
						<span
							className={cn(
								'text-4xl font-semibold tracking-tight tabular-nums',
								tone.accent,
							)}
						>
							{signed(tsb!)}
						</span>
						<span
							className={cn(
								'rounded-full px-2 py-0.5 text-xs font-medium',
								tone.chip,
							)}
						>
							{readiness!.label}
						</span>
					</div>
				)}
				<p className="text-muted-foreground mt-1 text-xs">
					{coldStart
						? `day ${data.trust.daysOfHistory}/${data.trust.requiredDays}`
						: readiness!.recommendation}
				</p>
			</div>

			<div>
				<div className="text-muted-foreground mb-2 flex items-center justify-between text-xs">
					<span>Training load · 90 days</span>
					<TrendLegend />
				</div>
				<MiniSparkline snapshots={data.snapshots} className="h-10" />
				<div className="text-muted-foreground mt-2 flex gap-x-5 text-sm">
					<MiniStat label="Fitness" value={data.current?.ctl} />
					<MiniStat label="Fatigue" value={data.current?.atl} />
					<MiniStat label="Form" value={data.current?.tsb} />
				</div>
			</div>
		</section>
	)
}

// ===========================================================================
// B1 — Form-forward. The Form reading dominates: big readiness label + signed
// number as the hero, recommendation underneath. The trend retreats to a
// calmer supporting strip on the right with the three numbers in a tidy row.
// ===========================================================================
function VariantB1({ data }: { data: TopData }) {
	const { tsb, coldStart, readiness, tone } = useReadiness(data)
	return (
		<section
			aria-label="Form and training load"
			className="bg-card border-border/60 grid gap-6 rounded-xl border p-5 sm:grid-cols-[1fr_auto] sm:items-center"
		>
			{/* Form hero */}
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

			{/* Supporting trend */}
			<div className="sm:border-border/60 sm:w-48 sm:border-l sm:pl-6">
				<MiniSparkline
					snapshots={data.snapshots}
					className="h-8"
					subtle
				/>
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
// B2 — Sparkline backdrop. The trend spans the full card as a faint background
// graphic; the foreground holds Form (top-left) and the three numbers as a
// bottom baseline row. One integrated visual plane, no internal divider.
// ===========================================================================
function VariantB2({ data }: { data: TopData }) {
	const { tsb, coldStart, readiness, tone } = useReadiness(data)
	return (
		<section
			aria-label="Form and training load"
			className="bg-card border-border/60 relative overflow-hidden rounded-xl border p-5"
		>
			{/* backdrop trend */}
			<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20">
				<MiniSparkline
					snapshots={data.snapshots}
					className="h-full"
					subtle
				/>
			</div>

			<div className="relative flex items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						Form
					</p>
					{coldStart ? (
						<p className="text-foreground mt-1 text-2xl font-semibold tracking-tight">
							Building baseline
						</p>
					) : (
						<div className="mt-1 flex items-baseline gap-2">
							<span
								className={cn(
									'text-4xl font-semibold tracking-tight tabular-nums',
									tone.accent,
								)}
							>
								{signed(tsb!)}
							</span>
							<span
								className={cn(
									'rounded-full px-2 py-0.5 text-xs font-medium',
									tone.chip,
								)}
							>
								{readiness!.label}
							</span>
						</div>
					)}
					<p className="text-muted-foreground mt-1 text-xs">
						{coldStart
							? `day ${data.trust.daysOfHistory}/${data.trust.requiredDays}`
							: readiness!.recommendation}
					</p>
				</div>
				<TrendLegend />
			</div>

			<div className="text-muted-foreground relative mt-8 flex gap-x-6 text-sm">
				<MiniStat label="Fitness" value={data.current?.ctl} />
				<MiniStat label="Fatigue" value={data.current?.atl} />
				<MiniStat label="Form" value={data.current?.tsb} />
			</div>
		</section>
	)
}

// ===========================================================================
// B3 — Trend-forward, three zones. Form (compact) · a larger central sparkline
// that gets star billing · the three numbers stacked as a mini readout on the
// right. For athletes who read the curve, not the digits.
// ===========================================================================
function VariantB3({ data }: { data: TopData }) {
	const { tsb, coldStart, readiness, tone } = useReadiness(data)
	return (
		<section
			aria-label="Form and training load"
			className="bg-card border-border/60 grid gap-6 rounded-xl border p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center"
		>
			{/* Form */}
			<div className="sm:border-border/60 sm:border-r sm:pr-6">
				<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
					Form
				</p>
				{coldStart ? (
					<p className="text-foreground mt-1 text-base font-semibold">
						Building
					</p>
				) : (
					<>
						<p
							className={cn(
								'mt-1 text-3xl font-semibold tracking-tight tabular-nums',
								tone.accent,
							)}
						>
							{signed(tsb!)}
						</p>
						<span
							className={cn(
								'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium',
								tone.chip,
							)}
						>
							{readiness!.label}
						</span>
					</>
				)}
			</div>

			{/* Trend — star of the card */}
			<div>
				<div className="text-muted-foreground mb-1.5 flex items-center justify-between text-xs">
					<span>Training load · 90 days</span>
					<TrendLegend />
				</div>
				<MiniSparkline snapshots={data.snapshots} className="h-14" />
			</div>

			{/* Numbers */}
			<div className="flex gap-6 sm:flex-col sm:gap-2 sm:border-border/60 sm:border-l sm:pl-6">
				<MiniStat label="Fitness" value={data.current?.ctl} stacked />
				<MiniStat label="Fatigue" value={data.current?.atl} stacked />
			</div>
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
	if (variant === 'B') return <VariantB data={data} />
	if (variant === 'B1') return <VariantB1 data={data} />
	if (variant === 'B2') return <VariantB2 data={data} />
	if (variant === 'B3') return <VariantB3 data={data} />
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
