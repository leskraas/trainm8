// Analyse zone: recent completed sessions as planned-vs-actual TSS, with the
// Plan Adherence band (under / on-target / over). The band only shows when both
// planned and actual TSS exist — otherwise "—", never a fabricated 100%.
import { cn } from '#app/utils/misc.tsx'
import { type RecentCompareRow } from './presenter.ts'
import { BAND, DiscDot } from './shared.tsx'

export function RecentCompare({ rows }: { rows: RecentCompareRow[] }) {
	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No completed sessions yet.</p>
		)
	}
	return (
		<div className="divide-border/50 divide-y">
			{rows.map((row) => (
				<CompareRow key={row.id} row={row} />
			))}
		</div>
	)
}

function CompareRow({ row }: { row: RecentCompareRow }) {
	const max = Math.max(row.plannedTss ?? 0, row.actualTss ?? 0, 1)
	const band = row.band
	return (
		<div className="flex items-center gap-3 py-2.5">
			<div className="flex w-24 items-center gap-2">
				<DiscDot discipline={row.discipline} />
				<span className="text-muted-foreground text-xs tabular-nums">
					{row.dateLabel}
				</span>
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-foreground truncate text-sm font-medium">
					{row.title}
				</p>
				<p className="text-muted-foreground truncate text-xs tabular-nums">
					{row.actualTss != null ? `${row.actualTss} TSS` : '—'}
					{row.plannedTss != null ? ` of ${row.plannedTss} planned` : ''}
				</p>
			</div>
			<div className="hidden w-20 sm:block">
				<div className="bg-muted h-1.5 overflow-hidden rounded-full">
					<div
						className="bg-muted-foreground/40 h-full rounded-full"
						style={{ width: `${((row.plannedTss ?? 0) / max) * 100}%` }}
					/>
				</div>
				<div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
					<div
						className={cn(
							'h-full rounded-full',
							band ? BAND[band.tone].dot : 'bg-sky-500',
						)}
						style={{ width: `${((row.actualTss ?? 0) / max) * 100}%` }}
					/>
				</div>
			</div>
			{band ? (
				<span
					aria-label={`Adherence: ${band.label}`}
					className={cn(
						'inline-flex w-20 shrink-0 items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium',
						BAND[band.tone].wash,
						BAND[band.tone].ink,
					)}
				>
					<span className={cn('size-1.5 rounded-full', BAND[band.tone].dot)} />
					{band.label}
				</span>
			) : (
				<span className="text-muted-foreground w-20 shrink-0 text-center text-[11px]">
					—
				</span>
			)}
		</div>
	)
}
