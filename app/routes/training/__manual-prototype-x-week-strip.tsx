/**
 * PROTOTYPE — throwaway. One Training Week's stamped Week Pattern, scaled to
 * that week's target. Shared by variants E and F. Delete with the route.
 */
import {
	type Currency,
	fromHours,
	patternByKey,
	patternGymHours,
	stampWeek,
	zoneHue,
} from './__manual-prototype-x-model.ts'

/** The stamped Week Pattern for one Training Week, scaled to its target. */
export function StampedWeekStrip({
	patternKey,
	hours,
	currency,
}: {
	patternKey: string
	hours: number
	currency: Currency
}) {
	const pattern = patternByKey(patternKey)
	if (!pattern) return null
	const days = stampWeek(pattern, hours)
	const max = Math.max(...days.map((d) => d.hours), 0.01)
	const gym = patternGymHours(days)
	return (
		<div className="bg-muted/40 mt-2 rounded-xl px-3 py-3">
			<p className="text-muted-foreground mb-2 text-[11px]">
				Stamped from “{pattern.name}” — these become standalone sessions.
			</p>
			<div className="flex items-end gap-1.5">
				{days.map((d, i) => (
					<div key={i} className="flex min-w-0 flex-1 flex-col items-center">
						<span className="text-muted-foreground mb-1 text-[10px] tabular-nums">
							{d.hours === 0
								? ''
								: d.strength
									? // Gym days have no km and no TSS — only clock time.
										`${fromHours(d.hours, 'hours')}h`
									: currency === 'tss'
										? (d.tss ?? '—')
										: fromHours(d.hours, currency)}
						</span>
						{d.hours > 0 ? (
							<span
								className="w-full rounded-sm"
								style={{
									height: `${Math.max(8, (d.hours / max) * 40)}px`,
									background: zoneHue(d.zone),
									opacity: d.strength ? 0.45 : 0.9,
									border: d.strength
										? '1.5px dashed var(--muted-foreground)'
										: undefined,
								}}
							/>
						) : (
							<span className="bg-muted-foreground/25 h-1 w-full rounded-full" />
						)}
						<span className="text-muted-foreground mt-1 truncate text-[9px]">
							{d.label}
						</span>
					</div>
				))}
			</div>
			{gym > 0 ? (
				<p className="text-muted-foreground mt-2 text-[11px]">
					Plus {gym} h in the gym — no TSS, no distance, so the week’s target is
					met by the other{' '}
					{days.filter((d) => !d.strength && d.hours > 0).length} sessions.
				</p>
			) : null}
		</div>
	)
}
