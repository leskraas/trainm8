import { ErrorList } from '#app/components/forms.tsx'
import {
	SegmentedControl,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import {
	STRENGTH_PER_WEEK_CHOICES,
	type StrengthPerWeek,
} from '#app/utils/first-run/start-draft.ts'
import { SIMPLE_START_LABELS } from '#app/utils/labels.ts'

const L = SIMPLE_START_LABELS.strength

/**
 * _Styrke_ on the activities screen (#574, ADR 0103): once its chip in the
 * activity list is pressed (`trening.tsx`, #584), the one tap it asks — _1_,
 * _2_ or _3_ strength sessions a week — pre-set from the lifting history or
 * the level, with a line saying which. The tapped number posts as
 * `strength`; an unpressed chip renders nothing here and posts nothing, so
 * the answers carry no strength at all.
 */
export function StrengthField({
	name,
	value,
	fromHistory,
	onValueChange,
	errorId,
	errors,
}: {
	name: string
	/** The tapped frequency, or null while _styrke_ is not picked. */
	value: StrengthPerWeek | null
	/** The history's sessions a week, where the preset came from it. */
	fromHistory: number | null
	onValueChange: (value: StrengthPerWeek) => void
	errorId?: string
	errors?: string[]
}) {
	if (value == null) return null
	return (
		<fieldset className="space-y-2" data-start-strength>
			<legend className="text-callout mb-2">{L.legend}</legend>
			<SegmentedControl
				value={String(value)}
				onValueChange={(next) => {
					const picked = STRENGTH_PER_WEEK_CHOICES.find(
						(count) => String(count) === next,
					)
					if (picked) onValueChange(picked)
				}}
				aria-label={L.legend}
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
		</fieldset>
	)
}
