import { Fragment } from 'react'
import { useSearchParams } from 'react-router'
import { paletteFor } from '#app/utils/dashboard.ts'
import { cn } from '#app/utils/misc.tsx'

// PROTOTYPE — home page = Coach-card Form on top + one dense chronological
// session ledger (past + planned), no week grid, everything on one page.
// Synthetic session data so the dense layout reads; coach state via ?state=ready|cold.
// Render with ?home=1 on /. Hidden in production. Folds into _marketing/index.tsx
// once approved (placement decision from issue #59).

type Tone = 'emerald' | 'sky' | 'amber' | 'rose'
const toneText: Record<Tone, string> = {
	emerald: 'text-emerald-600 dark:text-emerald-400',
	sky: 'text-sky-600 dark:text-sky-400',
	amber: 'text-amber-600 dark:text-amber-400',
	rose: 'text-rose-600 dark:text-rose-400',
}
const toneTint: Record<Tone, string> = {
	emerald: 'bg-emerald-500/10',
	sky: 'bg-sky-500/10',
	amber: 'bg-amber-500/10',
	rose: 'bg-rose-500/10',
}
const toneDot: Record<Tone, string> = {
	emerald: 'bg-emerald-500',
	sky: 'bg-sky-500',
	amber: 'bg-amber-500',
	rose: 'bg-rose-500',
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

function CoachCard({ state }: { state: string }) {
	const cold = state === 'cold'
	const tsb = 8
	const r = readiness(tsb)
	return (
		<section className="border-border/80 bg-card rounded-4xl border p-6 shadow-md sm:p-8">
			<div className="flex items-center gap-2">
				<span
					className={cn(
						'inline-block size-2.5 rounded-full',
						cold ? 'bg-muted-foreground' : toneDot[r.tone],
					)}
				/>
				<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
					Your coach
				</p>
			</div>
			{cold ? (
				<p className="font-heading mt-4 text-2xl leading-snug font-semibold tracking-[-0.02em] sm:text-3xl">
					I'm still getting to know you — 12 of 42 days logged. Keep logging and
					I'll start guiding your form.
				</p>
			) : (
				<>
					<p className="font-heading mt-4 text-2xl leading-snug font-semibold tracking-[-0.02em] sm:text-3xl">
						{r.rec}
					</p>
					<div className="mt-5 flex items-center gap-3">
						<span
							className={cn(
								'text-body-sm rounded-full px-3 py-1 font-semibold',
								toneTint[r.tone],
								toneText[r.tone],
							)}
						>
							{r.label}
						</span>
						<span className="text-muted-foreground text-body-sm tabular-nums">
							TSB +{tsb}
						</span>
					</div>
				</>
			)}
		</section>
	)
}

type Discipline = 'run' | 'bike' | 'swim' | 'strength'
type Row = {
	offset: number
	discipline: Discipline
	title: string
	durationMin: number
	tss: number
	status: 'completed' | 'planned' | 'missed'
	rpe?: number
}

const ROWS: Row[] = [
	{
		offset: -11,
		discipline: 'run',
		title: 'Easy aerobic',
		durationMin: 45,
		tss: 38,
		status: 'completed',
		rpe: 3,
	},
	{
		offset: -10,
		discipline: 'strength',
		title: 'Lower body',
		durationMin: 50,
		tss: 42,
		status: 'completed',
		rpe: 5,
	},
	{
		offset: -9,
		discipline: 'bike',
		title: 'Endurance Z2',
		durationMin: 90,
		tss: 72,
		status: 'completed',
		rpe: 4,
	},
	{
		offset: -8,
		discipline: 'swim',
		title: 'Technique drills',
		durationMin: 40,
		tss: 28,
		status: 'completed',
		rpe: 3,
	},
	{
		offset: -7,
		discipline: 'run',
		title: 'Tempo 4×8 min',
		durationMin: 60,
		tss: 82,
		status: 'completed',
		rpe: 7,
	},
	{
		offset: -6,
		discipline: 'bike',
		title: 'Recovery spin',
		durationMin: 30,
		tss: 18,
		status: 'missed',
	},
	{
		offset: -5,
		discipline: 'run',
		title: 'Long run',
		durationMin: 110,
		tss: 105,
		status: 'completed',
		rpe: 6,
	},
	{
		offset: -3,
		discipline: 'strength',
		title: 'Full body',
		durationMin: 55,
		tss: 46,
		status: 'completed',
		rpe: 5,
	},
	{
		offset: -2,
		discipline: 'swim',
		title: 'CSS intervals',
		durationMin: 50,
		tss: 55,
		status: 'completed',
		rpe: 6,
	},
	{
		offset: -1,
		discipline: 'run',
		title: 'Easy + strides',
		durationMin: 40,
		tss: 35,
		status: 'completed',
		rpe: 3,
	},
	{
		offset: 0,
		discipline: 'bike',
		title: 'Threshold 3×12',
		durationMin: 75,
		tss: 95,
		status: 'planned',
	},
	{
		offset: 1,
		discipline: 'run',
		title: 'Recovery jog',
		durationMin: 35,
		tss: 28,
		status: 'planned',
	},
	{
		offset: 2,
		discipline: 'swim',
		title: 'Endurance swim',
		durationMin: 45,
		tss: 40,
		status: 'planned',
	},
	{
		offset: 4,
		discipline: 'run',
		title: 'VO2 5×3 min',
		durationMin: 55,
		tss: 88,
		status: 'planned',
	},
	{
		offset: 5,
		discipline: 'strength',
		title: 'Upper body',
		durationMin: 45,
		tss: 38,
		status: 'planned',
	},
]

const disciplineLabel: Record<Discipline, string> = {
	run: 'Run',
	bike: 'Ride',
	swim: 'Swim',
	strength: 'Strength',
}

function fmtDate(offset: number) {
	const today = new Date('2026-05-27T12:00:00')
	const d = new Date(today.getTime() + offset * 86400000)
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	}).format(d)
}

function StatusCell({ row }: { row: Row }) {
	if (row.status === 'planned')
		return <span className="text-muted-foreground">Planned</span>
	if (row.status === 'missed')
		return <span className="text-rose-600 dark:text-rose-400">Missed</span>
	return (
		<span className="text-foreground">
			Done{' '}
			{row.rpe != null ? (
				<span className="text-muted-foreground">· RPE {row.rpe}</span>
			) : null}
		</span>
	)
}

function DenseLedger() {
	const todayIndex = ROWS.findIndex((r) => r.offset >= 0)
	return (
		<section className="border-border/80 bg-card overflow-hidden rounded-4xl border shadow-md">
			<div className="flex items-baseline justify-between p-5 pb-3">
				<h2 className="text-body-xs font-semibold tracking-[0.12em] uppercase">
					Sessions
				</h2>
				<span className="text-muted-foreground text-body-2xs">
					Past &amp; planned
				</span>
			</div>
			<table className="w-full border-collapse text-left">
				<thead>
					<tr className="text-muted-foreground text-body-2xs border-border/60 border-y [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold [&>th]:tracking-[0.08em] [&>th]:uppercase">
						<th className="w-28">Date</th>
						<th>Session</th>
						<th className="w-20 text-right">Dur</th>
						<th className="w-20 text-right">Load</th>
						<th className="w-32">Status</th>
					</tr>
				</thead>
				<tbody className="text-body-sm">
					{ROWS.map((row, i) => {
						const pal = paletteFor(row.discipline)
						const isPlanned = row.status === 'planned'
						return (
							<Fragment key={i}>
								{i === todayIndex ? (
									<tr className="bg-primary/5">
										<td
											colSpan={5}
											className="text-primary text-body-2xs px-3 py-1 font-semibold tracking-[0.12em] uppercase"
										>
											Today
										</td>
									</tr>
								) : null}
								<tr
									className={cn(
										'border-border/40 hover:bg-muted/30 border-b transition [&>td]:px-3 [&>td]:py-2.5',
										isPlanned && 'text-muted-foreground',
									)}
								>
									<td className="text-muted-foreground whitespace-nowrap tabular-nums">
										{fmtDate(row.offset)}
									</td>
									<td>
										<span className="flex items-center gap-2">
											<span
												className={cn(
													'size-1.5 shrink-0 rounded-full',
													pal.chip,
												)}
											/>
											<span className="text-foreground/90 truncate">
												{row.title}
											</span>
											<span className="text-muted-foreground text-body-2xs">
												{disciplineLabel[row.discipline]}
											</span>
										</span>
									</td>
									<td className="text-right whitespace-nowrap tabular-nums">
										{row.durationMin}m
									</td>
									<td
										className={cn(
											'text-right tabular-nums',
											isPlanned ? 'text-muted-foreground' : 'text-foreground',
										)}
									>
										{row.tss}
									</td>
									<td className="text-body-xs whitespace-nowrap">
										<StatusCell row={row} />
									</td>
								</tr>
							</Fragment>
						)
					})}
				</tbody>
			</table>
		</section>
	)
}

function StateToggle({ current }: { current: string }) {
	const [searchParams, setSearchParams] = useSearchParams()
	if (process.env.NODE_ENV === 'production') return null
	const options = ['ready', 'cold']
	function set(s: string) {
		const params = new URLSearchParams(searchParams)
		params.set('state', s)
		setSearchParams(params, { replace: true, preventScrollReset: true })
	}
	return (
		<div className="pointer-events-none fixed bottom-4 left-4 z-50 flex">
			<div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/90 p-1 text-zinc-100 shadow-2xl ring-1 ring-black/20 backdrop-blur-md">
				<span className="px-2 text-[10px] text-zinc-400 uppercase">coach</span>
				{options.map((o) => (
					<button
						key={o}
						type="button"
						onClick={() => set(o)}
						className={cn(
							'rounded-full px-3 py-1 text-xs font-medium capitalize',
							(current || 'ready') === o ? 'bg-white/20' : 'hover:bg-white/10',
						)}
					>
						{o}
					</button>
				))}
			</div>
		</div>
	)
}

export function HomePrototype() {
	const [params] = useSearchParams()
	const state = params.get('state') ?? 'ready'
	return (
		<main className="container py-6 sm:py-10">
			<header className="mb-6">
				<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
					Prototype · home
				</p>
				<h1 className="font-heading mt-1 text-2xl font-bold tracking-[-0.03em]">
					Coach card + dense ledger
				</h1>
			</header>
			<div className="space-y-4">
				<CoachCard state={state} />
				<DenseLedger />
			</div>
			<StateToggle current={state} />
		</main>
	)
}
