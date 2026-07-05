import {
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import { formatLoad, formatTss } from '#app/utils/format.ts'
import {
	type AdherenceBand,
	type AdherenceTone,
} from '#app/utils/load/adherence.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	buildLedgerRows,
	type LedgerRow,
	type SessionRow,
} from '#app/utils/session-ledger-rows.ts'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import { type LedgerSession } from '#app/utils/training.server.ts'
import {
	getDisciplineLabel,
	type LedgerStatus,
	type SessionLedgerEntry,
} from '#app/utils/training.ts'

const ROW_HEIGHT = 44
// Card-variant size estimates (px) for the virtualizer; actual heights are
// measured per element, so these only shape the initial layout.
const CARD_ESTIMATE = 108
const NOW_DIVIDER_ESTIMATE = 36

const columnHelper = createColumnHelper<LedgerRow>()

function session(row: LedgerRow): SessionRow {
	// Column cells only render for session rows; the "now" divider short-circuits.
	return row as SessionRow
}

const columns = [
	columnHelper.display({
		id: 'status',
		header: '',
		meta: { className: 'w-9 pr-0' },
		cell: ({ row }) => (
			<StatusMark status={session(row.original).entry.status} />
		),
	}),
	columnHelper.display({
		id: 'date',
		header: 'Date',
		meta: { className: 'w-28 text-muted-foreground tabular-nums' },
		cell: ({ row }) => <DateCell session={session(row.original).session} />,
	}),
	columnHelper.display({
		id: 'type',
		header: 'Type',
		meta: { className: 'w-20 text-muted-foreground' },
		cell: ({ row }) =>
			getDisciplineLabel(session(row.original).entry.discipline),
	}),
	columnHelper.display({
		id: 'session',
		header: 'Session',
		meta: { className: 'min-w-0' },
		cell: ({ row }) => {
			const r = session(row.original)
			return (
				<Link
					to={`/training/sessions/${r.id}`}
					prefetch="intent"
					className="text-foreground block truncate font-medium hover:underline"
				>
					{r.entry.title ??
						`${getDisciplineLabel(r.entry.discipline)} recording`}
				</Link>
			)
		},
	}),
	columnHelper.display({
		id: 'profile',
		header: 'Profile',
		meta: { className: 'w-32' },
		cell: ({ row }) => <ProfileBars bars={session(row.original).bars} />,
	}),
	columnHelper.display({
		id: 'duration',
		header: 'Dur',
		meta: { className: 'w-16 text-right text-muted-foreground tabular-nums' },
		cell: ({ row }) => {
			const min = session(row.original).entry.durationMin
			return min != null ? `${min}m` : '—'
		},
	}),
	columnHelper.display({
		id: 'load',
		header: 'Load',
		meta: { className: 'w-20 text-right text-muted-foreground tabular-nums' },
		cell: ({ row }) => <LoadCell entry={session(row.original).entry} />,
	}),
	columnHelper.display({
		id: 'rpe',
		header: 'RPE',
		meta: { className: 'w-14 text-right text-muted-foreground tabular-nums' },
		cell: ({ row }) => {
			const rpe = session(row.original).entry.rpe
			return rpe != null ? rpe : '—'
		},
	}),
]

export function SessionLedger({
	sessions,
	now: nowProp,
}: {
	sessions: LedgerSession[]
	now?: Date
}) {
	// Hold `now` stable across renders. Evaluating `new Date()` as a default
	// parameter would produce a fresh Date on every render, invalidating
	// `rows` and the `useReactTable({ data: rows })` instance each time —
	// which in turn breaks React Router 7's client-side transitions (the URL
	// updates but the Outlet stays rendering the previous route's element).
	const nowRef = useRef<Date>(nowProp ?? new Date())
	const now = nowProp ?? nowRef.current
	const rows = useMemo<LedgerRow[]>(
		() => buildLedgerRows(sessions, now),
		[sessions, now],
	)

	const nowIndex = useMemo(
		() => rows.findIndex((r) => r.kind === 'now'),
		[rows],
	)

	if (sessions.length === 0) {
		return (
			<div className="bg-card border-border/60 rounded-xl border p-12 text-center">
				<p className="text-foreground text-base font-medium">No sessions yet</p>
				<p className="text-muted-foreground mt-1 text-sm">
					Plan a session and it will show up on your ledger.
				</p>
			</div>
		)
	}

	// Mobile fit (#182): a table clips off a 390px viewport, so below the
	// tablet breakpoint the same rows render as cards instead. Both variants
	// share the presenter data (`rows`); only presentation differs. The card
	// list is exported so the History tab (#184) can adopt it wholesale.
	return (
		<>
			<div className="hidden md:block" data-testid="session-ledger-table">
				<SessionLedgerTable rows={rows} nowIndex={nowIndex} />
			</div>
			<div className="md:hidden" data-testid="session-ledger-cards">
				<SessionLedgerCards rows={rows} nowIndex={nowIndex} />
			</div>
		</>
	)
}

function SessionLedgerTable({
	rows,
	nowIndex,
}: {
	rows: LedgerRow[]
	nowIndex: number
}) {
	const table = useReactTable({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.id,
	})

	const scrollRef = useRef<HTMLDivElement>(null)
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
		initialRect: { width: 1024, height: 640 },
	})

	// Open centered on today: the boundary between past and planned.
	const didCenter = useRef(false)
	useEffect(() => {
		if (didCenter.current || nowIndex < 0) return
		didCenter.current = true
		virtualizer.scrollToIndex(nowIndex, { align: 'center' })
	}, [virtualizer, nowIndex])

	const virtualRows = virtualizer.getVirtualItems()
	const totalSize = virtualizer.getTotalSize()
	const paddingTop = virtualRows[0]?.start ?? 0
	const paddingBottom =
		virtualRows.length > 0
			? totalSize - (virtualRows[virtualRows.length - 1]!.end ?? 0)
			: 0
	const headerGroup = table.getHeaderGroups()[0]!

	return (
		<div
			ref={scrollRef}
			className="bg-card border-border/60 max-h-[60vh] overflow-auto rounded-xl border"
		>
			<Table>
				<TableHeader className="bg-card sticky top-0 z-10">
					<TableRow className="hover:bg-transparent">
						{headerGroup.headers.map((header) => (
							<TableHead
								key={header.id}
								className={cn(
									'bg-card',
									(header.column.columnDef.meta as { className?: string })
										?.className,
								)}
							>
								{flexRender(
									header.column.columnDef.header,
									header.getContext(),
								)}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{paddingTop > 0 ? (
						<tr aria-hidden style={{ height: paddingTop }}>
							<td colSpan={columns.length} />
						</tr>
					) : null}
					{virtualRows.map((virtualRow) => {
						const row = table.getRowModel().rows[virtualRow.index]!
						if (row.original.kind === 'now') {
							return <NowMarker key={row.id} colSpan={columns.length} />
						}
						const isPast = (row.original as SessionRow).isPast
						return (
							<TableRow
								key={row.id}
								data-status={(row.original as SessionRow).entry.status}
								style={{ height: ROW_HEIGHT }}
								className={cn('text-sm', isPast ? '' : 'text-muted-foreground')}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell
										key={cell.id}
										className={cn(
											'py-0',
											(cell.column.columnDef.meta as { className?: string })
												?.className,
										)}
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						)
					})}
					{paddingBottom > 0 ? (
						<tr aria-hidden style={{ height: paddingBottom }}>
							<td colSpan={columns.length} />
						</tr>
					) : null}
				</TableBody>
			</Table>
		</div>
	)
}

/**
 * The Session Ledger as a virtualized card list — the below-tablet-breakpoint
 * presentation (#182), and the ledger the History tab adopts wholesale (#184).
 * Same rows as the table (`buildLedgerRows`), no fetching of its own; card
 * heights vary (profile bars are optional) so each element is measured.
 */
export function SessionLedgerCards({
	rows,
	nowIndex,
	className,
}: {
	rows: LedgerRow[]
	nowIndex: number
	className?: string
}) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: (index) =>
			rows[index]?.kind === 'now' ? NOW_DIVIDER_ESTIMATE : CARD_ESTIMATE,
		overscan: 8,
		initialRect: { width: 390, height: 640 },
	})

	// Open centered on today: the boundary between past and planned.
	const didCenter = useRef(false)
	useEffect(() => {
		if (didCenter.current || nowIndex < 0) return
		didCenter.current = true
		virtualizer.scrollToIndex(nowIndex, { align: 'center' })
	}, [virtualizer, nowIndex])

	const virtualRows = virtualizer.getVirtualItems()

	return (
		<div
			ref={scrollRef}
			className={cn(
				'max-h-[60vh] overflow-y-auto overscroll-contain',
				className,
			)}
		>
			<div
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualRows.map((virtualRow) => {
					const row = rows[virtualRow.index]!
					return (
						<div
							key={row.id}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							className="absolute top-0 left-0 w-full pb-2"
							style={{ transform: `translateY(${virtualRow.start}px)` }}
						>
							{row.kind === 'now' ? (
								<NowDivider />
							) : (
								<LedgerSessionCard row={row} />
							)}
						</div>
					)
				})}
			</div>
		</div>
	)
}

/**
 * One ledger card: title + status up top, date on the right, then the same
 * fields the table columns carry (type, duration, load, RPE), and the intensity
 * profile beneath. Planned (upcoming) sessions read dashed + muted, mirroring
 * the table's past/future ink split.
 */
function LedgerSessionCard({ row }: { row: SessionRow }) {
	const { entry, bars } = row
	const planned = entry.status === 'planned'
	return (
		<article
			data-status={entry.status}
			className={cn(
				'bg-card border-border/60 rounded-xl border px-3.5 py-3',
				planned && 'border-dashed',
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-2">
					<StatusMark status={entry.status} />
					<Link
						to={`/training/sessions/${row.id}`}
						prefetch="intent"
						className={cn(
							'truncate text-sm font-semibold hover:underline',
							planned ? 'text-muted-foreground' : 'text-foreground',
						)}
					>
						{entry.title ?? `${getDisciplineLabel(entry.discipline)} recording`}
					</Link>
				</span>
				<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
					<DateCell session={row.session} />
				</span>
			</div>
			<div className="text-muted-foreground mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
				<span>{getDisciplineLabel(entry.discipline)}</span>
				<span className="tabular-nums">
					{entry.durationMin != null ? (
						<>
							<span className="text-foreground font-medium">
								{entry.durationMin}
							</span>{' '}
							min
						</>
					) : (
						'—'
					)}
				</span>
				<CardLoad entry={entry} />
				<span className="tabular-nums">
					RPE{' '}
					<span
						className={cn(entry.rpe != null && 'text-foreground font-medium')}
					>
						{entry.rpe ?? '—'}
					</span>
				</span>
			</div>
			{bars.length > 0 ? (
				<div className="mt-2.5" data-testid="ledger-card-profile">
					<ProfileBars bars={bars} />
				</div>
			) : null}
		</article>
	)
}

/**
 * The card's load field. Completed sessions show actual TSS with the Plan
 * Adherence dot (same rule as the table's `LoadCell`); a planned session with
 * only a prescription shows "planned N TSS" — labelled, never passed off as an
 * actual. Neither present renders "—".
 */
function CardLoad({ entry }: { entry: SessionLedgerEntry }) {
	if (entry.load != null) {
		return (
			<span className="inline-flex items-center gap-1.5 tabular-nums">
				{entry.adherence ? <AdherenceDot adherence={entry.adherence} /> : null}
				<span className="text-foreground font-medium">
					{formatTss(entry.load)}
				</span>
			</span>
		)
	}
	if (entry.plannedTss != null) {
		return (
			<span className="tabular-nums">
				planned {formatTss(entry.plannedTss)}
			</span>
		)
	}
	return <span aria-label="Load unavailable">—</span>
}

function NowDivider() {
	return (
		<div className="flex items-center gap-3 py-2">
			<span className="text-primary text-xs font-semibold tracking-wide uppercase">
				Now
			</span>
			<span className="bg-primary/40 h-px flex-1" />
		</div>
	)
}

function NowMarker({ colSpan }: { colSpan: number }) {
	return (
		<tr style={{ height: ROW_HEIGHT }} className="bg-background/40">
			<td colSpan={colSpan} className="px-3">
				<div className="flex items-center gap-3">
					<span className="text-primary text-xs font-semibold tracking-wide uppercase">
						Now
					</span>
					<span className="bg-primary/40 h-px flex-1" />
				</div>
			</td>
		</tr>
	)
}

const STATUS_MARK: Record<LedgerStatus, { label: string; node: ReactNode }> = {
	completed: {
		label: 'Completed',
		node: <span className="size-2.5 rounded-full bg-emerald-500" />,
	},
	planned: {
		label: 'Planned',
		node: (
			<span className="border-muted-foreground/50 size-2.5 rounded-full border-2" />
		),
	},
	missed: {
		label: 'Missed',
		node: <Icon name="cross-1" className="text-destructive size-3.5" />,
	},
}

const ADHERENCE_COLOR: Record<AdherenceTone, string> = {
	under: 'bg-sky-400 dark:bg-sky-500',
	'on-target': 'bg-emerald-500',
	over: 'bg-rose-500 dark:bg-rose-600',
}

/**
 * The Load cell: actual TSS plus a Plan Adherence band adornment (ADR 0019). The
 * band is a small tone-coloured dot when both Planned and actual TSS are known;
 * a muted "—" otherwise — never a fabricated 100%.
 */
function LoadCell({ entry }: { entry: SessionLedgerEntry }) {
	const { load, adherence } = entry
	return (
		<span className="inline-flex items-center justify-end gap-1.5">
			{adherence ? (
				<AdherenceDot adherence={adherence} />
			) : (
				<span aria-hidden className="text-muted-foreground/40 text-xs">
					—
				</span>
			)}
			<span>{load != null ? formatLoad(load) : '—'}</span>
		</span>
	)
}

function AdherenceDot({ adherence }: { adherence: AdherenceBand }) {
	const description = `Adherence: ${adherence.label} — ${adherence.recommendation}`
	return (
		<span
			role="img"
			aria-label={description}
			title={description}
			className={cn('size-2 rounded-full', ADHERENCE_COLOR[adherence.tone])}
		/>
	)
}

function StatusMark({ status }: { status: LedgerStatus }) {
	const mark = STATUS_MARK[status]
	return (
		<span
			className="flex items-center justify-center"
			role="img"
			aria-label={mark.label}
			title={mark.label}
		>
			{mark.node}
		</span>
	)
}

function DateCell({ session: s }: { session: LedgerSession }) {
	const presenter = useSessionPresenter()
	const { shortDate } = presenter.presentSession(s)
	return (
		<time dateTime={new Date(s.scheduledAt).toISOString()}>{shortDate}</time>
	)
}
