/**
 * _Legg til et løp_: an open-ended plan gains an Event and becomes a plan toward
 * it (#505 stories 7–8, ADR 0079 §4).
 *
 * Split out of `plan.tsx` like the other editors: the route owns the loader and
 * the action (`attach-event`), this module owns the control. It stays closed
 * until asked for — a plan with no race is a whole plan, and the way to a race is
 * an offer, not a prompt. Inside: the athlete's upcoming Events that have no plan
 * of their own, or a name and a date for a race not on the calendar yet — one or
 * the other, as `AttachEventFormSchema` holds on both sides. What it does is said
 * before the tap: the round ends after this week, the weeks trained and the
 * athlete's own sessions stay. A refusal opens it again with what was typed.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Form } from 'react-router'
import { ErrorList, Field, RadioGroupField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { formatNbDate } from '#app/utils/format.ts'
import { ATTACH_EVENT_LABELS } from '#app/utils/labels.ts'
import { AttachEventFormSchema } from '#app/utils/plan-outline/attach-event-schema.ts'
import { CollapsibleSection } from './__plan-chrome.tsx'

export type AttachableEvent = { id: string; name: string; startDate: Date }

export function AttachEventOffer({
	outlineId,
	events,
	lastResult,
}: {
	outlineId: string
	events: AttachableEvent[]
	lastResult: Parameters<typeof useForm>[0]['lastResult']
}) {
	const [form, fields] = useForm({
		id: 'attach-event',
		constraint: getZodConstraint(AttachEventFormSchema),
		lastResult,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: AttachEventFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const eventErrorId = `${fields.eventId.id}-error`

	return (
		<CollapsibleSection
			// Opened by an answer (a refusal under what was typed), keyed so a
			// second answer opens it again.
			key={lastResult ? 'answered' : 'quiet'}
			summary={ATTACH_EVENT_LABELS.open}
			defaultOpen={lastResult != null}
			className="w-full text-left"
			contentClassName="pt-2"
		>
			<Form
				method="POST"
				className="space-y-4 pt-2 pb-2"
				aria-label={ATTACH_EVENT_LABELS.open}
				{...getFormProps(form)}
			>
				<input type="hidden" name="intent" value="attach-event" />
				<input type="hidden" name="outlineId" value={outlineId} />
				<p className="text-muted-foreground text-footnote">
					{ATTACH_EVENT_LABELS.intro}
				</p>
				{events.length > 0 ? (
					// `ui/radio-group` choice cards: Base UI's radio posts under the
					// field's name as a native one would, never in browser blue.
					<RadioGroupField
						name={fields.eventId.name}
						legend={ATTACH_EVENT_LABELS.choose}
						legendClassName="text-callout font-semibold"
						defaultValue={
							typeof fields.eventId.initialValue === 'string'
								? fields.eventId.initialValue
								: undefined
						}
						options={events.map((event) => ({
							value: event.id,
							label: event.name,
							description: formatNbDate(event.startDate, 'UTC'),
						}))}
						errorId={eventErrorId}
						errors={fields.eventId.errors as string[] | undefined}
					/>
				) : null}
				<fieldset className="space-y-3">
					<legend className="text-callout font-semibold">
						{events.length > 0
							? ATTACH_EVENT_LABELS.orNew
							: ATTACH_EVENT_LABELS.newRace}
					</legend>
					<Field
						labelProps={{ children: ATTACH_EVENT_LABELS.name }}
						inputProps={{
							...getInputProps(fields.name, { type: 'text' }),
							className: 'text-base',
						}}
						errors={fields.name.errors as string[] | undefined}
					/>
					<Field
						labelProps={{ children: ATTACH_EVENT_LABELS.date }}
						inputProps={{
							...getInputProps(fields.startDate, { type: 'date' }),
							className: 'text-base',
						}}
						errors={fields.startDate.errors as string[] | undefined}
					/>
				</fieldset>
				<div role="alert">
					<ErrorList
						id={form.errorId}
						errors={form.errors as string[] | undefined}
					/>
				</div>
				<Button type="submit" className="w-full">
					{ATTACH_EVENT_LABELS.submit}
				</Button>
			</Form>
		</CollapsibleSection>
	)
}
