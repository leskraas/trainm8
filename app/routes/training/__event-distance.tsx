/**
 * The **Event Distance** choice (#670, ADR 0112 §1): a row of pills for the six
 * Race Anchors and _Annen_, which opens a km field. One component behind the
 * Event form and the result section's _Lagre distansen_, posting the same two
 * fields (`distance`, `distanceKm`) to the same reader
 * (`eventDistanceFromChoice`), so a km equal to an anchor is stored as that
 * anchor wherever it is typed.
 *
 * Set once per Event, so every choice stays in view rather than behind a
 * select. A second tap on the pressed pill clears it. The km field opens and
 * closes with `motion-collapse`.
 */
import { useState } from 'react'
import {
	Collapsible,
	CollapsibleContent,
} from '#app/components/ui/collapsible.tsx'
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from '#app/components/ui/field.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	ToggleGroup,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import {
	EVENT_DISTANCE_CHOICES,
	type EventDistanceChoice,
} from '#app/utils/event-result.ts'
import { EVENTS_LABELS } from '#app/utils/labels.ts'

const L = EVENTS_LABELS

export type EventDistanceValue = {
	choice: EventDistanceChoice | ''
	km: string
}

export function EventDistancePicker({
	id,
	labelledBy,
	defaultValue,
	kmError,
	onChange,
}: {
	id: string
	/** The id of the legend or label that names the row. */
	labelledBy: string
	defaultValue: EventDistanceValue
	kmError?: string | null
	onChange?: (value: EventDistanceValue) => void
}) {
	const [value, setValue] = useState(defaultValue)
	const update = (next: EventDistanceValue) => {
		setValue(next)
		onChange?.(next)
	}
	const kmId = `${id}-km`
	const kmErrorId = `${id}-km-error`
	return (
		<div className="flex flex-col">
			<ToggleGroup
				aria-labelledby={labelledBy}
				spacing={2}
				value={value.choice ? [value.choice] : []}
				onValueChange={(next) =>
					update({
						...value,
						choice: (next[0] as EventDistanceChoice | undefined) ?? '',
					})
				}
				className="flex-wrap"
			>
				{EVENT_DISTANCE_CHOICES.map((choice) => (
					<ToggleGroupItem
						key={choice}
						value={choice}
						className="bg-input/50 aria-pressed:bg-primary/10 aria-pressed:text-primary aria-pressed:ring-primary/45 text-callout h-11 rounded-full px-4 tabular-nums ring-1 ring-transparent"
					>
						{L.distanceNames[choice]}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<input type="hidden" name="distance" value={value.choice} />
			<Collapsible open={value.choice === 'other'}>
				<CollapsibleContent>
					<Field data-invalid={kmError ? true : undefined} className="pt-3">
						<FieldLabel htmlFor={kmId}>{L.distanceKm}</FieldLabel>
						<Input
							id={kmId}
							name="distanceKm"
							value={value.km}
							onChange={(event) =>
								update({ ...value, km: event.currentTarget.value })
							}
							// The decimal pad carries the comma Norwegians write.
							inputMode="decimal"
							autoComplete="off"
							enterKeyHint="done"
							placeholder="7,5"
							className="w-[8.5em] tabular-nums"
							aria-invalid={kmError ? true : undefined}
							aria-describedby={kmError ? kmErrorId : undefined}
						/>
						{kmError ? null : (
							<FieldDescription>{L.distanceKmHint}</FieldDescription>
						)}
						<FieldError
							id={kmErrorId}
							errors={kmError ? [{ message: kmError }] : undefined}
						/>
					</Field>
				</CollapsibleContent>
			</Collapsible>
		</div>
	)
}
