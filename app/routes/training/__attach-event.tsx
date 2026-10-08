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
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { formatDate } from '#app/utils/format.ts'
import { ATTACH_EVENT_LABELS } from '#app/utils/labels.ts'
import { AttachEventFormSchema } from '#app/utils/plan-outline/attach-event-schema.ts'

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
		<details
			className="border-border/70 w-full rounded-xl border px-4 py-2 text-left"
			open={lastResult != null}
		>
			<summary className="flex min-h-11 cursor-pointer items-center justify-center text-sm font-medium">
				{ATTACH_EVENT_LABELS.open}
			</summary>
			<Form
				method="POST"
				className="space-y-4 pt-2 pb-2"
				aria-label={ATTACH_EVENT_LABELS.open}
				{...getFormProps(form)}
			>
				<input type="hidden" name="intent" value="attach-event" />
				<input type="hidden" name="outlineId" value={outlineId} />
				<p className="text-muted-foreground text-sm">
					{ATTACH_EVENT_LABELS.intro}
				</p>
				{events.length > 0 ? (
					<fieldset
						className="space-y-1"
						aria-describedby={fields.eventId.errors ? eventErrorId : undefined}
					>
						<legend className="text-sm font-medium">
							{ATTACH_EVENT_LABELS.choose}
						</legend>
						{events.map((event) => (
							<label
								key={event.id}
								className="flex min-h-11 cursor-pointer items-center gap-2"
							>
								<input
									{...getInputProps(fields.eventId, {
										type: 'radio',
										value: event.id,
									})}
									className="size-4"
								/>
								<span className="text-sm">
									{event.name} · {formatDate(event.startDate, 'UTC')}
								</span>
							</label>
						))}
						<ErrorList
							id={eventErrorId}
							errors={fields.eventId.errors as string[] | undefined}
						/>
					</fieldset>
				) : null}
				<fieldset className="space-y-3">
					<legend className="text-sm font-medium">
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
		</details>
	)
}
