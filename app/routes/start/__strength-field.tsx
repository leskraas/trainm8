import { ErrorList } from '#app/components/forms.tsx'
import {
	SegmentedControl,
	ToggleGroup,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import {
	STRENGTH_PER_WEEK_CHOICES,
	type StrengthPerWeek,
} from '#app/utils/first-run/start-draft.ts'
import { SIMPLE_START_LABELS } from '#app/utils/labels.ts'

const L = SIMPLE_START_LABELS.strength

/**
 * _Styrke_ on the activities screen (#574, ADR 0103): a chip, and once it is
 * pressed the one tap it asks — _1_, _2_ or _3_ strength sessions a week —
 * pre-set from the lifting history or the level, with a line saying which.
 * The tapped number posts as `strength`; an unpressed chip posts nothing, so
 * the answers carry no strength at all.
 */
export function StrengthField({
	name,
	value,
	preset,
	fromHistory,
	onValueChange,
	errorId,
	errors,
}: {
	name: string
	/** The tapped frequency, or null while _styrke_ is not picked. */
	value: StrengthPerWeek | null
	/** What the tap starts on when the chip is pressed. */
	preset: StrengthPerWeek
	/** The history's sessions a week, where the preset came from it. */
	fromHistory: number | null
	onValueChange: (value: StrengthPerWeek | null) => void
	errorId?: string
	errors?: string[]
}) {
	return (
		<fieldset className="space-y-3" data-start-strength>
			<legend className="text-callout mb-2">{L.chipLabel}</legend>
			<ToggleGroup
				multiple
				variant="outline"
				value={value == null ? [] : ['strength']}
				onValueChange={(next) =>
					onValueChange((next as string[]).length > 0 ? preset : null)
				}
			>
				<ToggleGroupItem
					value="strength"
					className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground text-callout h-11 rounded-full px-5"
				>
					{L.chip}
				</ToggleGroupItem>
			</ToggleGroup>
			{value != null ? (
				<div className="space-y-2">
					<p className="text-callout" id="start-strength-legend">
						{L.legend}
					</p>
					<SegmentedControl
						value={String(value)}
						onValueChange={(next) => {
							const picked = STRENGTH_PER_WEEK_CHOICES.find(
								(count) => String(count) === next,
							)
							if (picked) onValueChange(picked)
						}}
						aria-labelledby="start-strength-legend"
						className="w-full"
					>
						{STRENGTH_PER_WEEK_CHOICES.map((count) => (
							<ToggleGroupItem
								key={count}
								value={String(count)}
								aria-label={L.choiceLabel(count)}
								className="text-callout h-11 flex-1 tabular-nums"
							>
								{count}
							</ToggleGroupItem>
						))}
					</SegmentedControl>
					<input type="hidden" name={name} value={value} />
					<p className="text-footnote text-muted-foreground" aria-live="polite">
						{fromHistory != null
							? L.fromHistory(Math.round(fromHistory))
							: L.fromLevel}{' '}
						{L.notInHours}
					</p>
					<ErrorList id={errorId} errors={errors} />
				</div>
			) : null}
		</fieldset>
	)
}
