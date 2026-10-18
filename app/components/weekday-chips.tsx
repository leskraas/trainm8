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
 * A track's **Pinned days** as weekday chips (ADR 0104 §4), the way Meg's
 * training days read: a real checkbox under a 44px pill per day, Monday
 * first, the focus ring on the box. A day outside the athlete's **Training
 * Availability** is struck through and cannot be chosen; past `max`, the
 * unchosen days rest. Used by the strength days in Meg (#597) and every other
 * track's days under _Plan → Avansert_ (#598).
 */
export function WeekdayChips({
	idPrefix,
	chosen,
	onChange,
	available,
	max = PATTERN_WEEKDAYS.length,
	name = 'day',
}: {
	idPrefix: string
	chosen: readonly PatternWeekday[]
	onChange: (days: PatternWeekday[]) => void
	/** Training Availability, Monday first; `null` where never set. */
	available: readonly PatternWeekday[] | null
	max?: number
	name?: string
}) {
	const full = chosen.length >= max
	return (
		<div className="flex flex-wrap gap-2">
			{PATTERN_WEEKDAYS.map((weekday) => {
				const id = `${idPrefix}-${weekday}`
				const checked = chosen.includes(weekday)
				const unavailable = available != null && !available.includes(weekday)
				// A chosen day outside availability can still be let go of.
				const disabled = !checked && (unavailable || full)
				return (
					<label
						key={weekday}
						htmlFor={id}
						aria-label={NB_WEEKDAY_LABELS[weekday]}
						className={cn(
							'border-border bg-background text-callout has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring/50 flex h-11 min-w-12 items-center justify-center rounded-full border px-3 select-none has-[:focus-visible]:ring-3 dark:bg-transparent dark:has-[:checked]:bg-primary',
							disabled
								? 'text-muted-foreground cursor-not-allowed opacity-50'
								: // Only a chip that answers a tap presses.
									'pressable cursor-pointer',
							unavailable && 'line-through',
						)}
					>
						<input
							type="checkbox"
							id={id}
							name={name}
							value={weekday}
							checked={checked}
							disabled={disabled}
							onChange={(event) =>
								onChange(
									event.target.checked
										? patternWeekdaysOf([...chosen, weekday])
										: chosen.filter((day) => day !== weekday),
								)
							}
							className="sr-only"
						/>
						{MEG_WEEKDAY_SHORT_LABELS[calendarWeekdayOf(weekday)]}
					</label>
				)
			})}
		</div>
	)
}
