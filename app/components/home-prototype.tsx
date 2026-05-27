import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type CSSProperties, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import { paletteFor } from '#app/utils/dashboard.ts'
import { cn } from '#app/utils/misc.tsx'

// PROTOTYPE — home page = Coach-card Form on top + one dense, virtualized session
// ledger (past + planned) built with TanStack Table + TanStack Virtual on the
// shadcn `table` primitive. Synthetic data; coach state via ?state=ready|cold.
// Render with ?home=1 on /. Hidden in production. Folds into _marketing/index.tsx.

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
type Session = {
	id: string
	dateOffset: number
	discipline: Discipline
	title: string
	durationMin: number
	tss: number
	status: 'completed' | 'planned' | 'missed'
	rpe?: number
	profile: number[]
}

const disciplineLabel: Record<Discipline, string> = {
	run: 'Run',
	bike: 'Ride',
	swim: 'Swim',
	strength: 'Strength',
}

const zoneHex: Record<number, string> = {
	1: '#7dd3fc',
	2: '#34d399',
	3: '#fbbf24',
	4: '#fb923c',
	5: '#f43f5e',
}

const TEMPLATES: Omit<Session, 'id' | 'dateOffset' | 'status'>[] = [
	{
		discipline: 'run',
		title: 'Easy aerobic',
		durationMin: 45,
		tss: 38,
		rpe: 3,
		profile: [2, 2, 2, 2, 2, 2],
	},
	{
		discipline: 'strength',
		title: 'Lower body',
		durationMin: 50,
		tss: 42,
		rpe: 5,
		profile: [3, 4, 3, 4, 3, 4],
	},
	{
		discipline: 'bike',
		title: 'Endurance Z2',
		durationMin: 90,
		tss: 72,
		rpe: 4,
		profile: [2, 2, 2, 2, 2, 2, 2, 2],
	},
	{
		discipline: 'swim',
		title: 'Technique drills',
		durationMin: 40,
		tss: 28,
		rpe: 3,
		profile: [1, 2, 1, 2, 1, 2],
	},
	{
		discipline: 'run',
		title: 'Tempo 4×8 min',
		durationMin: 60,
		tss: 82,
		rpe: 7,
		profile: [1, 3, 4, 3, 4, 3, 4, 3, 4, 1],
	},
	{
		discipline: 'run',
		title: 'Long run',
		durationMin: 110,
		tss: 105,
		rpe: 6,
		profile: [2, 2, 2, 3, 2, 2, 3, 2],
	},
	{
		discipline: 'swim',
		title: 'CSS intervals',
		durationMin: 50,
		tss: 55,
		rpe: 6,
		profile: [2, 4, 4, 4, 4, 2],
	},
	{
		discipline: 'bike',
		title: 'Threshold 3×12',
		durationMin: 75,
		tss: 95,
		rpe: 8,
		profile: [1, 4, 4, 4, 2, 4, 4, 4, 1],
	},
	{
		discipline: 'run',
		title: 'VO2 5×3 min',
		durationMin: 55,
		tss: 88,
		rpe: 9,
		profile: [1, 5, 2, 5, 2, 5, 2, 5, 2, 5, 1],
	},
	{
		discipline: 'strength',
		title: 'Full body',
		durationMin: 55,
		tss: 46,
		rpe: 5,
		profile: [3, 4, 3, 4, 3, 4],
	},
]

const TODAY = new Date('2026-05-27T12:00:00')

function buildSessions(): Session[] {
	const rows: Session[] = []
	let n = 0
	for (let off = -84; off <= 14; off++) {
		const d = new Date(TODAY.getTime() + off * 86400000)
		if (d.getDay() === 1) continue // Mondays = rest
		const tpl = TEMPLATES[(off + 84) % TEMPLATES.length]!
		const planned = off >= 0
		const missed = !planned && (off + 84) % 13 === 0
		rows.push({
			...tpl,
			id: `s${n++}`,
			dateOffset: off,
			status: missed ? 'missed' : planned ? 'planned' : 'completed',
			rpe: !planned && !missed ? tpl.rpe : undefined,
		})
	}
	return rows
}

function fmtDate(offset: number) {
	const d = new Date(TODAY.getTime() + offset * 86400000)
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	}).format(d)
}

function WorkoutProfile({
	profile,
	muted,
}: {
	profile: number[]
	muted?: boolean
}) {
	const bw = 5
	const gap = 1.5
	const h = 22
	const w = profile.length * (bw + gap)
	return (
		<svg
			viewBox={`0 0 ${w} ${h}`}
			className="h-5 w-24"
			preserveAspectRatio="none"
			role="img"
			aria-label="workout intensity profile"
		>
			{profile.map((z, i) => {
				const barH = Math.max(2, (z / 5) * h)
				return (
					<rect
						key={i}
						x={i * (bw + gap)}
						y={h - barH}
						width={bw}
						height={barH}
						rx={1}
						fill={zoneHex[z]}
						opacity={muted ? 0.5 : 1}
					/>
				)
			})}
		</svg>
	)
}

function StatusIcon({ status }: { status: Session['status'] }) {
	if (status === 'completed')
		return <span className="block size-2.5 rounded-full bg-emerald-500" />
	if (status === 'missed')
		return <span className="block text-xs leading-none text-rose-500">×</span>
	return (
		<span className="border-muted-foreground/50 block size-2.5 rounded-full border-2" />
	)
}

const columns: ColumnDef<Session>[] = [
	{
		id: 'status',
		header: '',
		size: 36,
		cell: ({ row }) => <StatusIcon status={row.original.status} />,
	},
	{
		id: 'date',
		header: 'Date',
		size: 108,
		cell: ({ row }) => {
			const s = row.original
			return (
				<span
					className={cn(
						'tabular-nums',
						s.status === 'planned'
							? 'text-muted-foreground'
							: 'text-foreground/70',
					)}
				>
					{fmtDate(s.dateOffset)}
				</span>
			)
		},
	},
	{
		id: 'type',
		header: 'Type',
		size: 92,
		cell: ({ row }) => {
			const pal = paletteFor(row.original.discipline)
			return (
				<span className="flex items-center gap-1.5">
					<span className={cn('size-1.5 shrink-0 rounded-full', pal.chip)} />
					<span className="text-muted-foreground text-body-xs">
						{disciplineLabel[row.original.discipline]}
					</span>
				</span>
			)
		},
	},
	{
		id: 'session',
		header: 'Session',
		cell: ({ row }) => (
			<span
				className={cn(
					'truncate',
					row.original.status === 'planned'
						? 'text-foreground/70'
						: 'text-foreground',
				)}
			>
				{row.original.title}
			</span>
		),
	},
	{
		id: 'profile',
		header: 'Profile',
		size: 104,
		cell: ({ row }) => (
			<WorkoutProfile
				profile={row.original.profile}
				muted={row.original.status === 'planned'}
			/>
		),
	},
	{
		id: 'dur',
		header: 'Dur',
		size: 56,
		cell: ({ row }) => (
			<span className="text-muted-foreground tabular-nums">
				{row.original.durationMin}m
			</span>
		),
	},
	{
		id: 'load',
		header: 'Load',
		size: 56,
		cell: ({ row }) => (
			<span
				className={cn(
					'tabular-nums',
					row.original.status === 'planned'
						? 'text-muted-foreground'
						: 'text-foreground',
				)}
			>
				{row.original.tss}
			</span>
		),
	},
	{
		id: 'rpe',
		header: 'RPE',
		size: 48,
		cell: ({ row }) => (
			<span className="text-muted-foreground tabular-nums">
				{row.original.rpe ?? '—'}
			</span>
		),
	},
]

const RIGHT = new Set(['dur', 'load', 'rpe'])

function colStyle(columnId: string, size: number): CSSProperties {
	const right = RIGHT.has(columnId)
	const base: CSSProperties = {
		display: 'flex',
		alignItems: 'center',
		justifyContent: right ? 'flex-end' : 'flex-start',
	}
	if (columnId === 'session') return { ...base, flex: '1 1 auto', minWidth: 0 }
	return { ...base, flex: `0 0 ${size}px` }
}

function VirtualLedger() {
	const data = useRef(buildSessions()).current
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	})
	const rows = table.getRowModel().rows
	const todayIndex = rows.findIndex((r) => r.original.dateOffset >= 0)

	const scrollRef = useRef<HTMLDivElement>(null)
	const rowVirtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 44,
		overscan: 12,
	})

	useEffect(() => {
		if (todayIndex >= 0) {
			rowVirtualizer.scrollToIndex(todayIndex, { align: 'center' })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const virtualRows = rowVirtualizer.getVirtualItems()

	return (
		<section className="border-border/80 bg-card overflow-hidden rounded-4xl border shadow-md">
			<div className="flex items-baseline justify-between px-5 py-4">
				<h2 className="text-body-xs font-semibold tracking-[0.12em] uppercase">
					Sessions
				</h2>
				<span className="text-muted-foreground text-body-2xs tabular-nums">
					{data.length} sessions · virtualized
				</span>
			</div>
			<div ref={scrollRef} className="max-h-[520px] overflow-auto">
				<table
					className="w-full caption-bottom text-sm"
					style={{ display: 'grid' }}
				>
					<TableHeader
						className="bg-card border-border/60 sticky top-0 z-10 border-b"
						style={{ display: 'grid' }}
					>
						{table.getHeaderGroups().map((hg) => (
							<TableRow
								key={hg.id}
								className="hover:bg-transparent"
								style={{ display: 'flex', width: '100%' }}
							>
								{hg.headers.map((header) => (
									<TableHead
										key={header.id}
										className="text-body-2xs tracking-[0.08em] uppercase"
										style={colStyle(header.column.id, header.column.getSize())}
									>
										{flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody
						style={{
							display: 'grid',
							height: rowVirtualizer.getTotalSize(),
							position: 'relative',
						}}
					>
						{virtualRows.map((vi) => {
							const row = rows[vi.index]!
							const s = row.original
							const isPlanned = s.status === 'planned'
							const isToday = vi.index === todayIndex
							return (
								<TableRow
									key={row.id}
									className={cn(
										'text-body-sm absolute h-11 w-full',
										isPlanned && 'bg-muted/15',
										isToday && 'border-primary/50 border-t-2',
									)}
									style={{
										display: 'flex',
										transform: `translateY(${vi.start}px)`,
									}}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className="h-11"
											style={colStyle(cell.column.id, cell.column.getSize())}
										>
											{isToday && cell.column.id === 'date' ? (
												<span className="bg-primary/10 text-primary mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
													Today
												</span>
											) : null}
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							)
						})}
					</TableBody>
				</table>
			</div>
			<div className="text-muted-foreground border-border/60 text-body-2xs flex flex-wrap items-center gap-3 border-t px-5 py-3">
				<span className="font-semibold tracking-[0.08em] uppercase">Zones</span>
				{[1, 2, 3, 4, 5].map((z) => (
					<span key={z} className="flex items-center gap-1">
						<span
							className="inline-block size-2 rounded-sm"
							style={{ background: zoneHex[z] }}
						/>
						Z{z}
					</span>
				))}
			</div>
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
					Coach card + virtualized ledger
				</h1>
			</header>
			<div className="space-y-4">
				<CoachCard state={state} />
				<VirtualLedger />
			</div>
			<StateToggle current={state} />
		</main>
	)
}
