// Analyse zone: the build — trailing weekly load, planned (dashed outline) vs
// actual (filled bar), current week marked "Now". Honest window: only weeks up
// to the current one, because future planned weekly load isn't modelled yet. A
// week with no resolvable planned load is a gap, never a fabricated zero.
import { useDisplayTimeZone } from '#app/utils/client-hints.tsx'
import { formatMonthDay } from '#app/utils/format.ts'
import { cn } from '#app/utils/misc.tsx'
import { type WeeklyBuildBar } from './presenter.ts'

export function WeeklyBuild({ bars }: { bars: WeeklyBuildBar[] }) {
	const timeZone = useDisplayTimeZone()
	if (bars.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">Not enough history yet.</p>
		)
	}
	const max = Math.max(
		1,
		...bars.flatMap((b) => [b.plannedTss ?? 0, b.actualTss ?? 0]),
	)
	return (
		<div>
			<div className="flex h-36 items-end gap-1.5">
				{bars.map((b) => {
					const plannedH = ((b.plannedTss ?? 0) / max) * 100
					const actualH = ((b.actualTss ?? 0) / max) * 100
					return (
						<div
							key={b.weekStart.toISOString()}
							className="flex flex-1 flex-col items-center gap-1"
						>
							<div className="relative flex h-28 w-full items-end justify-center">
								{b.plannedTss != null ? (
									<div
										className="border-muted-foreground/30 absolute bottom-0 w-full rounded-t border border-dashed"
										style={{ height: `${plannedH}%` }}
									/>
								) : null}
								{b.actualTss != null ? (
									<div
										className={cn(
											'relative w-full rounded-t',
											b.isCurrent ? 'bg-primary' : 'bg-sky-500/70',
										)}
										style={{ height: `${actualH}%` }}
									/>
								) : null}
								{b.isCurrent ? (
									<span className="text-primary absolute -top-4 text-[9px] font-semibold tracking-wide uppercase">
										Now
									</span>
								) : null}
							</div>
							<span
								className={cn(
									'text-[10px] tabular-nums',
									b.isCurrent
										? 'text-foreground font-semibold'
										: 'text-muted-foreground',
								)}
							>
								{formatMonthDay(b.weekStart, timeZone)}
							</span>
						</div>
					)
				})}
			</div>
			<div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
				<span className="inline-flex items-center gap-1.5">
					<span className="size-2 rounded-full bg-sky-500/70" />
					Actual TSS
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="border-muted-foreground/40 size-2 rounded-[2px] border border-dashed" />
					Planned
				</span>
			</div>
		</div>
	)
}
