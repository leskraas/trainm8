import { useSearchParams } from 'react-router'
import { PrototypeSwitcher } from '#app/components/prototype-switcher.tsx'
import { cn } from '#app/utils/misc.tsx'

// PROTOTYPE — three variants of the Form (TSB) hero on /training/load.
// Question: how should the Form number + plain-language label + "building
// baseline" cold-start look, and how does Form sit as the primary daily signal?
// Switch variants with ?variant=A|B|C, force a state with ?state=auto|ready|cold.
// Hidden in production via the NODE_ENV gate in PrototypeSwitcher.
// Delete this file once a variant is folded into load.tsx (issues #57/#58/#59).

const COLD_THRESHOLD = 42

type Current = { ctl: number; atl: number; tsb: number } | null
type Snapshot = { date: string; ctl: number; atl: number; tsb: number }

type Tone = 'emerald' | 'sky' | 'amber' | 'rose'

const toneMap: Record<
	Tone,
	{ tint: string; ring: string; text: string; dot: string; stroke: string }
> = {
	emerald: {
		tint: 'bg-emerald-500/10',
		ring: 'border-emerald-400/40',
		text: 'text-emerald-600 dark:text-emerald-400',
		dot: 'bg-emerald-500',
		stroke: '#10b981',
	},
	sky: {
		tint: 'bg-sky-500/10',
		ring: 'border-sky-400/40',
		text: 'text-sky-600 dark:text-sky-400',
		dot: 'bg-sky-500',
		stroke: '#0ea5e9',
	},
	amber: {
		tint: 'bg-amber-500/10',
		ring: 'border-amber-400/40',
		text: 'text-amber-600 dark:text-amber-400',
		dot: 'bg-amber-500',
		stroke: '#f59e0b',
	},
	rose: {
		tint: 'bg-rose-500/10',
		ring: 'border-rose-400/40',
		text: 'text-rose-600 dark:text-rose-400',
		dot: 'bg-rose-500',
		stroke: '#f43f5e',
	},
}

function readiness(tsb: number): { label: string; rec: string; tone: Tone } {
	if (tsb >= 25)
		return {
			label: 'Very fresh',
			rec: 'Peaked — race or go hard.',
			tone: 'emerald',
		}
	if (tsb >= 5)
		return {
			label: 'Fresh',
			rec: 'Good to push — go for the session.',
			tone: 'emerald',
		}
	if (tsb >= -10)
		return {
			label: 'Balanced',
			rec: 'Steady training zone — keep building.',
			tone: 'sky',
		}
	if (tsb >= -30)
		return {
			label: 'Fatigued',
			rec: 'Productive but tiring — watch your recovery.',
			tone: 'amber',
		}
	return {
		label: 'Very fatigued',
		rec: 'Back off — prioritise rest.',
		tone: 'rose',
	}
}

function fmt(tsb: number) {
	const r = Math.round(tsb)
	return r > 0 ? `+${r}` : `${r}`
}

function buildSnapshots(n: number, baseCtl: number): Snapshot[] {
	const arr: Snapshot[] = []
	for (let i = 0; i < n; i++) {
		const ramp = n > 1 ? i / (n - 1) : 1
		const ctl = baseCtl * (0.45 + 0.55 * ramp)
		const atl = ctl * (0.85 + 0.35 * Math.sin(i / 3))
		arr.push({ date: '', ctl, atl, tsb: ctl - atl })
	}
	return arr
}

function resolveModel(current: Current, snapshots: Snapshot[], state: string) {
	if (state === 'ready') {
		const s = buildSnapshots(90, 62)
		return {
			tsb: 8,
			days: 90,
			current: { ctl: 62, atl: 54, tsb: 8 },
			snapshots: s,
		}
	}
	if (state === 'cold') {
		const s = buildSnapshots(12, 18)
		return {
			tsb: -3,
			days: 12,
			current: { ctl: 14, atl: 17, tsb: -3 },
			snapshots: s,
		}
	}
	return {
		tsb: current?.tsb ?? null,
		days: snapshots.length,
		current,
		snapshots,
	}
}

function MiniSparkline({ snapshots }: { snapshots: Snapshot[] }) {
	if (snapshots.length < 2) return null
	const maxAbs = Math.max(...snapshots.map((s) => Math.max(s.ctl, s.atl)), 1)
	const W = 800
	const H = 64
	const pad = 2
	const x = (i: number) => pad + (i / (snapshots.length - 1)) * (W - pad * 2)
	const y = (v: number) => H - pad - (v / maxAbs) * (H - pad * 2)
	const line = (k: 'ctl' | 'atl') =>
		snapshots.map((s, i) => `${x(i)},${y(s[k])}`).join(' ')
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label="trend"
		>
			<polyline
				points={line('ctl')}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				className="text-sky-500"
			/>
			<polyline
				points={line('atl')}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				className="text-rose-500"
			/>
		</svg>
	)
}

function ProgressBar({ days }: { days: number }) {
	const pct = Math.min(100, Math.round((days / COLD_THRESHOLD) * 100))
	return (
		<div className="mt-4">
			<div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
				<div
					className="bg-foreground/70 h-full rounded-full transition-all"
					style={{ width: `${pct}%` }}
				/>
			</div>
			<p className="text-muted-foreground text-body-2xs mt-2 tabular-nums">
				Day {days} of {COLD_THRESHOLD}
			</p>
		</div>
	)
}

/* ── Variant A ── Big hero band: one number rules the page ────────────── */

function VariantA({
	tsb,
	days,
	current,
	snapshots,
}: {
	tsb: number | null
	days: number
	current: Current
	snapshots: Snapshot[]
}) {
	const cold = days < COLD_THRESHOLD
	const r = tsb != null ? readiness(tsb) : null
	const t = r ? toneMap[r.tone] : null
	return (
		<div className="space-y-4">
			<section
				className={cn(
					'rounded-4xl border p-8 shadow-md sm:p-12',
					cold ? 'border-border/80 bg-card' : cn(t!.ring, t!.tint),
				)}
			>
				<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
					Today's form
				</p>
				{cold || tsb == null ? (
					<>
						<h1 className="font-heading mt-3 text-4xl leading-none font-bold tracking-[-0.04em] sm:text-6xl">
							Building your baseline
						</h1>
						<p className="text-muted-foreground mt-4 max-w-xl text-lg">
							Keep logging sessions. Your form reading unlocks once we've seen
							{` ${COLD_THRESHOLD}`} days of training.
						</p>
						<ProgressBar days={days} />
					</>
				) : (
					<>
						<h1
							className={cn(
								'font-heading mt-3 text-5xl leading-none font-bold tracking-[-0.04em] sm:text-7xl',
								t!.text,
							)}
						>
							{r!.label}
						</h1>
						<div className="mt-6 flex items-end gap-4">
							<span className="font-heading text-8xl leading-none font-bold tracking-[-0.05em] tabular-nums">
								{fmt(tsb)}
							</span>
							<span className="text-muted-foreground text-body-sm mb-2">
								TSB
							</span>
						</div>
						<p className="mt-4 max-w-xl text-lg">{r!.rec}</p>
					</>
				)}
			</section>

			<div className="grid grid-cols-2 gap-4">
				<div className="border-border/80 bg-card rounded-4xl border p-5 shadow-md">
					<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
						Fitness (CTL)
					</p>
					<p className="font-heading mt-2 text-3xl font-bold tabular-nums">
						{current ? Math.round(current.ctl) : '—'}
					</p>
				</div>
				<div className="border-border/80 bg-card rounded-4xl border p-5 shadow-md">
					<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
						Fatigue (ATL)
					</p>
					<p className="font-heading mt-2 text-3xl font-bold tabular-nums">
						{current ? Math.round(current.atl) : '—'}
					</p>
				</div>
			</div>
			<section className="border-border/80 bg-card rounded-4xl border p-5 shadow-md">
				<h2 className="text-body-xs mb-3 font-semibold tracking-[0.12em] uppercase">
					90-Day Trend
				</h2>
				<MiniSparkline snapshots={snapshots} />
			</section>
		</div>
	)
}

/* ── Variant B ── Readiness gauge: a dial is the primary affordance ───── */

function Gauge({ tsb, cold }: { tsb: number | null; cold: boolean }) {
	const cx = 150
	const cy = 150
	const radius = 120
	const clamped = Math.max(-40, Math.min(40, tsb ?? 0))
	const tNorm = (clamped + 40) / 80
	const theta = Math.PI - tNorm * Math.PI
	const nx = cx + radius * Math.cos(theta)
	const ny = cy - radius * Math.sin(theta)
	return (
		<svg
			viewBox="0 0 300 158"
			className="w-full max-w-sm"
			role="img"
			aria-label="readiness gauge"
		>
			<defs>
				<linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stopColor="#f43f5e" />
					<stop offset="35%" stopColor="#f59e0b" />
					<stop offset="60%" stopColor="#0ea5e9" />
					<stop offset="100%" stopColor="#10b981" />
				</linearGradient>
			</defs>
			<path
				d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
				fill="none"
				stroke={cold ? 'currentColor' : 'url(#gauge-grad)'}
				strokeWidth="16"
				strokeLinecap="round"
				className={cold ? 'text-muted' : undefined}
				strokeDasharray={cold ? '4 10' : undefined}
			/>
			{!cold && (
				<>
					<line
						x1={cx}
						y1={cy}
						x2={nx}
						y2={ny}
						stroke="currentColor"
						strokeWidth="4"
						strokeLinecap="round"
					/>
					<circle cx={cx} cy={cy} r="8" fill="currentColor" />
				</>
			)}
		</svg>
	)
}

function VariantB({
	tsb,
	days,
	current,
	snapshots,
}: {
	tsb: number | null
	days: number
	current: Current
	snapshots: Snapshot[]
}) {
	const cold = days < COLD_THRESHOLD
	const r = tsb != null && !cold ? readiness(tsb) : null
	return (
		<div className="space-y-4">
			<section className="border-border/80 bg-card rounded-4xl border p-6 shadow-md sm:p-8">
				<p className="text-muted-foreground text-body-2xs text-center font-semibold tracking-[0.18em] uppercase">
					Readiness
				</p>
				<div className="mt-4 flex flex-col items-center">
					<Gauge tsb={tsb} cold={cold} />
					<div className="-mt-6 flex flex-col items-center">
						{cold ? (
							<>
								<span className="font-heading text-4xl font-bold tabular-nums">
									{days}/{COLD_THRESHOLD}
								</span>
								<span className="text-muted-foreground text-body-sm">
									days logged
								</span>
							</>
						) : (
							<>
								<span className="font-heading text-5xl font-bold tabular-nums">
									{fmt(tsb!)}
								</span>
								<span
									className={cn('text-lg font-semibold', toneMap[r!.tone].text)}
								>
									{r!.label}
								</span>
							</>
						)}
					</div>
					<p className="mt-4 max-w-sm text-center text-lg">
						{cold
							? `Form unlocks at ${COLD_THRESHOLD} days of training. Keep logging.`
							: r!.rec}
					</p>
				</div>
				<div className="border-border/60 mt-6 grid grid-cols-2 gap-4 border-t pt-5">
					<div className="text-center">
						<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
							Fitness
						</p>
						<p className="font-heading mt-1 text-2xl font-bold text-sky-600 tabular-nums dark:text-sky-400">
							{current ? Math.round(current.ctl) : '—'}
						</p>
					</div>
					<div className="text-center">
						<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
							Fatigue
						</p>
						<p className="font-heading mt-1 text-2xl font-bold text-rose-600 tabular-nums dark:text-rose-400">
							{current ? Math.round(current.atl) : '—'}
						</p>
					</div>
				</div>
			</section>
			<section className="border-border/80 bg-card rounded-4xl border p-5 shadow-md">
				<h2 className="text-body-xs mb-3 font-semibold tracking-[0.12em] uppercase">
					90-Day Trend
				</h2>
				<MiniSparkline snapshots={snapshots} />
			</section>
		</div>
	)
}

/* ── Variant C ── Coach card: the recommendation sentence leads ───────── */

function VariantC({
	tsb,
	days,
	current,
	snapshots,
}: {
	tsb: number | null
	days: number
	current: Current
	snapshots: Snapshot[]
}) {
	const cold = days < COLD_THRESHOLD
	const r = tsb != null && !cold ? readiness(tsb) : null
	const t = r ? toneMap[r.tone] : null
	return (
		<div className="space-y-4">
			<section className="border-border/80 bg-card rounded-4xl border p-6 shadow-md sm:p-8">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							'inline-block size-2.5 rounded-full',
							cold ? 'bg-muted-foreground' : t!.dot,
						)}
					/>
					<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
						Your coach
					</p>
				</div>
				{cold || tsb == null ? (
					<p className="font-heading mt-4 text-2xl leading-snug font-semibold tracking-[-0.02em] sm:text-3xl">
						I'm still getting to know you — {days} of {COLD_THRESHOLD} days
						logged. Keep logging and I'll start guiding your form.
					</p>
				) : (
					<>
						<p className="font-heading mt-4 text-2xl leading-snug font-semibold tracking-[-0.02em] sm:text-3xl">
							{r!.rec}
						</p>
						<div className="mt-5 flex items-center gap-3">
							<span
								className={cn(
									'text-body-sm rounded-full px-3 py-1 font-semibold',
									t!.tint,
									t!.text,
								)}
							>
								{r!.label}
							</span>
							<span className="text-muted-foreground text-body-sm tabular-nums">
								TSB {fmt(tsb)}
							</span>
						</div>
					</>
				)}
			</section>
			<section className="border-border/80 bg-card rounded-4xl border p-5 shadow-md">
				<div className="text-body-2xs mb-3 flex gap-4">
					<span className="text-muted-foreground">
						Fitness{' '}
						<span className="text-foreground font-semibold tabular-nums">
							{current ? Math.round(current.ctl) : '—'}
						</span>
					</span>
					<span className="text-muted-foreground">
						Fatigue{' '}
						<span className="text-foreground font-semibold tabular-nums">
							{current ? Math.round(current.atl) : '—'}
						</span>
					</span>
				</div>
				<MiniSparkline snapshots={snapshots} />
			</section>
		</div>
	)
}

/* ── State toggle (auto / ready / cold) so both states are previewable ── */

function StateToggle({ current }: { current: string }) {
	const [searchParams, setSearchParams] = useSearchParams()
	if (process.env.NODE_ENV === 'production') return null
	const options = ['auto', 'ready', 'cold']
	function set(s: string) {
		const params = new URLSearchParams(searchParams)
		params.set('state', s)
		setSearchParams(params, { replace: true, preventScrollReset: true })
	}
	return (
		<div className="pointer-events-none fixed bottom-4 left-4 z-50 flex">
			<div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/90 p-1 text-zinc-100 shadow-2xl ring-1 ring-black/20 backdrop-blur-md">
				{options.map((o) => (
					<button
						key={o}
						type="button"
						onClick={() => set(o)}
						className={cn(
							'rounded-full px-3 py-1 text-xs font-medium capitalize',
							(current || 'auto') === o ? 'bg-white/20' : 'hover:bg-white/10',
						)}
					>
						{o}
					</button>
				))}
			</div>
		</div>
	)
}

export function LoadFormPrototype({
	current,
	snapshots,
}: {
	current: Current
	snapshots: Snapshot[]
}) {
	const [params] = useSearchParams()
	const variant = params.get('variant') ?? 'A'
	const state = params.get('state') ?? 'auto'
	const props = resolveModel(current, snapshots, state)

	return (
		<main className="container py-6 sm:py-10">
			<header className="mb-6">
				<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
					Prototype · /training/load
				</p>
				<h1 className="font-heading mt-1 text-2xl font-bold tracking-[-0.03em]">
					Form hero — pick a look
				</h1>
			</header>

			{variant === 'A' && <VariantA {...props} />}
			{variant === 'B' && <VariantB {...props} />}
			{variant === 'C' && <VariantC {...props} />}

			<PrototypeSwitcher
				variants={[
					{ key: 'A', name: 'Hero band' },
					{ key: 'B', name: 'Readiness gauge' },
					{ key: 'C', name: 'Coach card' },
				]}
				current={variant}
			/>
			<StateToggle current={state} />
		</main>
	)
}
