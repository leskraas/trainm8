import {
	ToggleGroup,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import {
	MEG_WEEKDAY_SHORT_LABELS,
	NB_WEEKDAY_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	calendarWeekdayOf,
	PATTERN_WEEKDAYS,
	patternWeekdaysOf,
	type PatternWeekday,
} from '#app/utils/plan-outline/week-pattern.ts'

/**
 * A track's **Pinned days** as weekday pills (ADR 0104 §4): a multiple
 * `ToggleGroup`, as `ToggleGroupField` lays the first run's training days,
 * Monday first, posting each pressed day as a hidden `name` input. A day
 * outside the athlete's **Training Availability** is struck through and
 * cannot be chosen; past `max`, the unchosen days rest. Used by the strength
 * days in Meg (#597) and every other track's days under _Plan → Avansert_
 * (#598).
 */
export function WeekdayChips({
	chosen,
	onChange,
	available,
	max = PATTERN_WEEKDAYS.length,
	name = 'day',
	'aria-labelledby': labelledBy,
}: {
	chosen: readonly PatternWeekday[]
	onChange: (days: PatternWeekday[]) => void
	/** Training Availability, Monday first; `null` where never set. */
	available: readonly PatternWeekday[] | null
	max?: number
	name?: string
	'aria-labelledby'?: string
}) {
	const full = chosen.length >= max
	return (
		<>
			<ToggleGroup
				multiple
				variant="outline"
				spacing={2}
				value={chosen.map(String)}
				onValueChange={(next) =>
					onChange(patternWeekdaysOf((next as string[]).map(Number)))
				}
				aria-labelledby={labelledBy}
				className="w-full flex-wrap"
			>
				{PATTERN_WEEKDAYS.map((weekday) => {
					const checked = chosen.includes(weekday)
					const unavailable = available != null && !available.includes(weekday)
					return (
						<ToggleGroupItem
							key={weekday}
							value={String(weekday)}
							aria-label={NB_WEEKDAY_LABELS[weekday]}
							// A chosen day outside availability can still be let go of.
							disabled={!checked && (unavailable || full)}
							className={cn(
								'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground text-callout h-11 min-w-12 rounded-full px-3',
								unavailable && 'line-through',
							)}
						>
							{MEG_WEEKDAY_SHORT_LABELS[calendarWeekdayOf(weekday)]}
						</ToggleGroupItem>
					)
				})}
			</ToggleGroup>
			{chosen.map((weekday) => (
				<input key={weekday} type="hidden" name={name} value={weekday} />
			))}
		</>
	)
}
