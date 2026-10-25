/**
 * _Legg til et løp_: an open-ended plan gains an Event and becomes a plan toward
 * it (#505 stories 7–8, #518, ADR 0079 §4).
 *
 * Split out of `plan.tsx` like the other editors: the route dispatches the
 * action (`__attach-event.server.ts`), this module owns the control. It stays
 * closed until asked for — a plan with no race is a whole plan, and the way to
 * a race is an offer, not a prompt. Inside: the athlete's upcoming Events that
 * have no plan of their own, or a name and a date for a race not on the
 * calendar yet — one or the other, as `AttachEventFormSchema` holds on both
 * sides.
 *
 * Two steps on purpose, as _Bytt filosofi_'s are: the first posts the choice
 * for a _Forhåndsvisning_ and writes nothing — not even the race named on the
 * spot; only the confirm under that preview adds the race, and the server
 * recomputes the very preview it showed (its digest) rather than trusting it
 * back from the form. The confirm posts the choice the preview was made for,
 * so a field edited after the preview cannot slip in unseen. A refusal opens
 * it again with what was typed.
 */
import {
	getFormProps,
	getInputProps,
	type SubmissionResult,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useEffect, useState } from 'react'
import { Form, useNavigation } from 'react-router'
import { ErrorList, Field, RadioGroupField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { formatNbDate } from '#app/utils/format.ts'
import {
	ATTACH_EVENT_LABELS,
	attachEndsSentence,
	attachKeptSessionsSentence,
	attachRemovedSentence,
	attachTowardSentence,
	attachWeeksSummary,
} from '#app/utils/labels.ts'
import { AttachEventFormSchema } from '#app/utils/plan-outline/attach-event-schema.ts'
import { type ReadAttachEventResult } from '#app/utils/plan-outline/open-ended.server.ts'
import { seasonEditWarningMessage } from '#app/utils/plan-outline/season-edit-words.ts'
import { dayOf, PhaseList, PreviewWeekTable } from './__philosophy-switch.tsx'
import { CollapsibleSection } from './__plan-chrome.tsx'
import { RiseWarningNotice } from './__season-edits.tsx'

export type AttachableEvent = { id: string; name: string; startDate: Date }

/**
 * The preview as the page shows it: the diff, its digest and the athlete's
 * sessions it keeps — not the rows or the edit — and the choice the confirm
 * posts back.
 */
export type AttachEventPreviewView = Omit<
	Extract<ReadAttachEventResult, { ok: true }>,
	'rows' | 'edit' | 'ok'
> & {
	confirm: { eventId?: string; name?: string; startDate?: string }
}

/** What the action answers: under the form, under the confirm, the preview. */
export type AttachEventReply = {
	result: SubmissionResult<string[]> | null
	confirmResult: SubmissionResult<string[]> | null
	preview: AttachEventPreviewView | null
}

/**
 * The week table opens by itself up to this many weeks; a race further out
 * says how many weeks there are and keeps them one tap away, so a race two
 * years out does not bury the confirm under a hundred rows.
 */
const WEEKS_OPEN_UP_TO = 12

export function AttachEventOffer({
	outlineId,
	events,
	reply,
}: {
	outlineId: string
	events: AttachableEvent[]
	reply: AttachEventReply | null
}) {
	const preview = reply?.preview ?? null
	const submitting = useNavigation().state === 'submitting'
	const [form, fields] = useForm({
		id: 'attach-event',
		constraint: getZodConstraint(AttachEventFormSchema),
		lastResult: reply?.result,
		// On a fresh mount (the page loaded under a stale confirm's answer), the
		// fields read the choice the preview is for.
		defaultValue: preview?.confirm,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: AttachEventFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const eventErrorId = `${fields.eventId.id}-error`
	// Opened by an answer — a refusal under what was typed, a preview to read —
	// and the athlete's to close after that. Controlled rather than re-keyed, as
	// _Bytt filosofi_ is, so the form is never remounted under its answer and
	// what was typed stays in the fields.
	const [open, setOpen] = useState(reply != null)
	useEffect(() => {
		if (reply) setOpen(true)
	}, [reply])

	return (
		<CollapsibleSection
			summary={ATTACH_EVENT_LABELS.open}
			open={open}
			onOpenChange={setOpen}
			className="w-full text-left"
			contentClassName="pt-2"
		>
			<Form
				method="POST"
				preventScrollReset
				className="space-y-4 pt-2 pb-2"
				aria-label={ATTACH_EVENT_LABELS.open}
				{...getFormProps(form)}
			>
				<input type="hidden" name="intent" value="preview-attach-event" />
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
				{/* The outline button asks; the filled one under the preview acts. */}
				<Button
					type="submit"
					variant="outline"
					className="w-full"
					disabled={submitting}
				>
					{ATTACH_EVENT_LABELS.showPreview}
				</Button>
			</Form>
			{preview ? (
				<AttachEventPreview
					key={preview.digest}
					outlineId={outlineId}
					preview={preview}
					lastResult={reply?.confirmResult ?? null}
				/>
			) : null}
		</CollapsibleSection>
	)
}

/**
 * The attach's _Forhåndsvisning_ and its confirm (#518): the round that ends
 * after this week, the run-up laid to the race, what stays, the warnings, and
 * the weeks before and after — then _Legg til løpet_.
 */
function AttachEventPreview({
	outlineId,
	preview,
	lastResult,
}: {
	outlineId: string
	preview: AttachEventPreviewView
	lastResult: SubmissionResult<string[]> | null
}) {
	// The confirm is a form of its own: it posts the preview's digest, so the
	// attach that lands is the one shown, and a refusal is said under it.
	const [form] = useForm({
		id: 'attach-event-confirm',
		lastResult,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: AttachEventFormSchema })
		},
	})
	const submitting = useNavigation().state === 'submitting'
	const removed = attachRemovedSentence(preview.removed)
	const { confirm } = preview
	return (
		<section
			aria-labelledby="attach-event-preview-title"
			className="border-border/70 space-y-4 border-t pt-4 pb-2"
			data-attach-event-preview
		>
			<h3
				id="attach-event-preview-title"
				className="text-callout font-semibold"
			>
				{ATTACH_EVENT_LABELS.preview}
			</h3>
			<div className="text-footnote space-y-1 [overflow-wrap:anywhere]">
				<p data-attach-ends>
					{attachEndsSentence(preview.ended)}
					{removed ? ` ${removed}` : null}
				</p>
				<p data-attach-toward>
					{attachTowardSentence(
						formatNbDate(dayOf(preview.fromWeekKey), 'UTC'),
						preview.event.name,
						formatNbDate(dayOf(preview.event.dayKey), 'UTC'),
					)}
				</p>
			</div>
			<RiseWarningNotice
				warnings={preview.warnings.map(seasonEditWarningMessage)}
			/>
			<div className="grid gap-3 sm:grid-cols-2">
				<PhaseList
					title={ATTACH_EVENT_LABELS.before}
					phases={preview.phases.before}
				/>
				<PhaseList
					title={ATTACH_EVENT_LABELS.after}
					phases={preview.phases.after}
				/>
			</div>
			<ul className="text-footnote space-y-1" data-attach-kept>
				<li>{ATTACH_EVENT_LABELS.livedStay}</li>
				<li>{attachKeptSessionsSentence(preview.keptSessions)}</li>
			</ul>
			<CollapsibleSection
				summary={attachWeeksSummary(preview.weeks.length)}
				defaultOpen={preview.weeks.length <= WEEKS_OPEN_UP_TO}
				contentClassName="pt-1"
			>
				<PreviewWeekTable
					afterLabel={ATTACH_EVENT_LABELS.after}
					weeks={preview.weeks}
				/>
				<p className="text-muted-foreground text-caption pt-2">
					{ATTACH_EVENT_LABELS.aroundYours}
				</p>
			</CollapsibleSection>
			<Form
				method="POST"
				preventScrollReset
				className="space-y-2"
				{...getFormProps(form)}
				aria-describedby={form.errors ? form.errorId : undefined}
			>
				<input type="hidden" name="intent" value="attach-event" />
				<input type="hidden" name="outlineId" value={outlineId} />
				<input type="hidden" name="digest" value={preview.digest} />
				{confirm.eventId ? (
					<input type="hidden" name="eventId" value={confirm.eventId} />
				) : (
					<>
						<input type="hidden" name="name" value={confirm.name ?? ''} />
						<input
							type="hidden"
							name="startDate"
							value={confirm.startDate ?? ''}
						/>
					</>
				)}
				{form.errors ? (
					<div role="alert">
						<ErrorList
							id={form.errorId}
							errors={form.errors as string[] | undefined}
						/>
					</div>
				) : null}
				<Button type="submit" className="w-full" disabled={submitting}>
					{ATTACH_EVENT_LABELS.submit}
				</Button>
			</Form>
		</section>
	)
}
