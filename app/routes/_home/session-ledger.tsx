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
import { formatLoad } from '#app/utils/format.ts'
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
