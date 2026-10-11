/**
 * The creation flow's two choice controls, on `ui/radio-group` (ADR 0085,
 * round 2): a whole card that is one answer (a season's shape), and a row of
 * short answers (which sport). Shared by the goal step (`plan.new.tsx`) and the
 * shape step (`plan.new.$eventId.tsx`), which replaced their native, browser-blue
 * radios with these (audit §3).
 *
 * `RadioGroupField` (`forms.tsx`) is the general form of the first; it takes a
 * label and a description. A shape card also carries a picture and the lines
 * that say where it lands, and the sports want a grid of short cards rather
 * than a column of tall ones, so both are composed here from the same parts and
 * the same classes rather than by widening the shared field.
 *
 * Presentation only, like `__plan-chrome.tsx`: neither decides a word.
 */
import { type ReactNode, useId } from 'react'
import { ErrorList, type ListOfErrors } from '#app/components/forms.tsx'
import {
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
	Field as FormField,
} from '#app/components/ui/field.tsx'
import { RadioGroup, RadioGroupItem } from '#app/components/ui/radio-group.tsx'
import { cn } from '#app/utils/misc.tsx'

/**
 * A chosen card is drawn with the primary edge and a faint primary wash — the
 * same as `RadioGroupField`'s — and the change rides the press duration on the
 * app's ease-out, so it answers the tap without a built-in curve (ADR 0085 §4).
 * The radio itself stays visible: colour is never the only carrier.
 */
const CHOICE_CARD =
	'has-data-checked:border-primary has-data-checked:bg-primary/5 dark:has-data-checked:bg-primary/10 duration-press transition-colors ease-out'

/**
 * One answer as a card: the radio, its title and one line, and whatever the
 * answer shows beneath them. The whole card is the target (a `<label>` for the
 * radio), so the tap lands on the card and not on a 16px dot (ADR 0028 §2.2).
 *
 * The radio is named by its **title** alone and described by its line: a card
 * that carries a picture with a data table under it would otherwise give the
 * radio a paragraph for a name.
 */
export function ChoiceCard({
	value,
	title,
	detail,
	children,
	className,
}: {
	value: string
	title: ReactNode
	detail?: ReactNode
	/** What the answer shows under its title — a picture, where it lands. */
	children?: ReactNode
	className?: string
}) {
	const id = useId()
	return (
		<FieldLabel htmlFor={`${id}-radio`} className={cn(CHOICE_CARD, className)}>
			<FormField orientation="horizontal" className="min-h-11 py-3!">
				<RadioGroupItem
					id={`${id}-radio`}
					value={value}
					aria-labelledby={`${id}-title`}
					aria-describedby={detail ? `${id}-detail` : undefined}
					className="mt-0.5"
				/>
				<FieldContent className="min-w-0 gap-3">
					<span className="space-y-0.5">
						<FieldTitle
							id={`${id}-title`}
							className="text-callout [overflow-wrap:anywhere]"
						>
							{title}
						</FieldTitle>
						{detail ? (
							<FieldDescription
								id={`${id}-detail`}
								className="text-footnote text-muted-foreground"
							>
								{detail}
							</FieldDescription>
						) : null}
					</span>
					{children}
				</FieldContent>
			</FormField>
		</FieldLabel>
	)
}

/**
 * Which sport, as a grid of short choice cards: two across on a phone, one row
 * from `sm`. Each card is a 44px target, and the group posts `name` like the
 * native radios it replaced.
 */
export function SportChoice({
	name,
	legend,
	options,
	value,
	defaultValue,
	onValueChange,
	errors,
}: {
	name: string
	legend: ReactNode
	options: ReadonlyArray<{ value: string; label: string }>
	value?: string
	defaultValue?: string
	onValueChange?: (value: string) => void
	errors?: ListOfErrors
}) {
	const id = useId()
	const hasErrors = (errors ?? []).some(Boolean)
	return (
		<FieldSet className="gap-2">
			<FieldLegend variant="label" className="mb-0">
				{legend}
			</FieldLegend>
			<RadioGroup
				name={name}
				value={value}
				defaultValue={defaultValue}
				onValueChange={(next) => onValueChange?.(String(next))}
				aria-invalid={hasErrors ? true : undefined}
				aria-describedby={hasErrors ? `${id}-error` : undefined}
				className={cn(
					'grid-cols-2 gap-2',
					options.length > 3 ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
				)}
			>
				{options.map((option) => (
					<FieldLabel
						key={option.value}
						htmlFor={`${id}-${option.value}`}
						className={CHOICE_CARD}
					>
						<FormField
							orientation="horizontal"
							className="min-h-11 items-center px-3! py-2.5!"
						>
							<RadioGroupItem
								id={`${id}-${option.value}`}
								value={option.value}
							/>
							<FieldTitle className="text-callout">{option.label}</FieldTitle>
						</FormField>
					</FieldLabel>
				))}
			</RadioGroup>
			<ErrorList id={`${id}-error`} errors={errors} />
		</FieldSet>
	)
}
