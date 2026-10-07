/**
 * _Legg til et løp_: an open-ended plan gains an Event and becomes a plan toward
 * it (#505 stories 7–8, ADR 0079 §4).
 *
 * Split out of `plan.tsx` like the other editors: the route owns the loader and
 * the action (`attach-event`), this module owns the control. It stays closed
 * until asked for — a plan with no race is a whole plan, and the way to a race is
 * an offer, not a prompt. Inside: the athlete's upcoming Events that have no plan
 * of their own, or a name and a date for a race not on the calendar yet. What it
 * does is said before the tap: the round ends after this week, the weeks trained
 * and the athlete's own sessions stay.
 */
import { Form } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { formatDate } from '#app/utils/format.ts'
import { ATTACH_EVENT_LABELS } from '#app/utils/labels.ts'

export type AttachableEvent = { id: string; name: string; startDate: Date }

export function AttachEventOffer({
	outlineId,
	events,
	error,
}: {
	outlineId: string
	events: AttachableEvent[]
	error: string | undefined
}) {
	return (
		<details
			className="border-border/70 w-full rounded-xl border px-4 py-2 text-left"
			open={error != null}
		>
			<summary className="flex min-h-11 cursor-pointer items-center justify-center text-sm font-medium">
				{ATTACH_EVENT_LABELS.open}
			</summary>
			<Form
				method="POST"
				className="space-y-4 pt-2 pb-2"
				aria-label={ATTACH_EVENT_LABELS.open}
			>
				<input type="hidden" name="intent" value="attach-event" />
				<input type="hidden" name="outlineId" value={outlineId} />
				<p className="text-muted-foreground text-sm">
					{ATTACH_EVENT_LABELS.intro}
				</p>
				{events.length > 0 ? (
					<fieldset className="space-y-1">
						<legend className="text-sm font-medium">
							{ATTACH_EVENT_LABELS.choose}
						</legend>
						{events.map((event) => (
							<label
								key={event.id}
								className="flex min-h-11 cursor-pointer items-center gap-2"
							>
								<input
									type="radio"
									name="eventId"
									value={event.id}
									className="size-4"
								/>
								<span className="text-sm">
									{event.name} · {formatDate(event.startDate, 'UTC')}
								</span>
							</label>
						))}
					</fieldset>
				) : null}
				<fieldset className="space-y-3">
					<legend className="text-sm font-medium">
						{events.length > 0
							? ATTACH_EVENT_LABELS.orNew
							: ATTACH_EVENT_LABELS.newRace}
					</legend>
					<div className="space-y-1">
						<Label htmlFor="attach-event-name">
							{ATTACH_EVENT_LABELS.name}
						</Label>
						<Input
							id="attach-event-name"
							name="name"
							maxLength={120}
							className="text-base"
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="attach-event-date">
							{ATTACH_EVENT_LABELS.date}
						</Label>
						<Input
							id="attach-event-date"
							name="date"
							type="date"
							className="text-base"
						/>
					</div>
				</fieldset>
				{error ? (
					<p role="alert" className="text-destructive text-sm">
						{error}
					</p>
				) : null}
				<Button type="submit" className="w-full">
					{ATTACH_EVENT_LABELS.submit}
				</Button>
			</Form>
		</details>
	)
}
