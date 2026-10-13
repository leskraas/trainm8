/**
 * The Event form, shared by `/training/events/new` and its edit page: one
 * schema, read on the client and by both actions, and one layout on the design
 * system's primitives (ADR 0085) in Norwegian (ADR 0081).
 *
 * Every error is a sentence at its own field (`Skriv hva løpet heter` under
 * Navn), never a code and never only at the bottom of the form. The target is
 * typed the way an athlete says it — a finish time as `3:30:00`, a distance as
 * `42,2` km — and stored as `EventTargetSchema` holds it (`__event-target.ts`).
 *
 * Kind and priority are three choices each, so they are radios that show all
 * three at once rather than a select that hides two. The sport is checkboxes
 * (an Event can be a triathlon), and the target kind, with seven options, is a
 * select.
 */
import {
	getFormProps,
	getInputProps,
	type SubmissionResult,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useId, useState } from 'react'
import { Form, useNavigation } from 'react-router'
import { z } from 'zod/v3'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from '#app/components/ui/field.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { RadioGroup, RadioGroupItem } from '#app/components/ui/radio-group.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { DAY_KEY_PATTERN } from '#app/utils/calendar-key-schema.ts'
import {
	EVENT_KINDS,
	EVENT_PRIORITIES,
	EventAuthoringSchema,
	type EventAuthoringInput,
	type EventTarget,
} from '#app/utils/event-schema.ts'
import {
	EVENTS_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_EVENT_KIND_LABELS,
	NB_EVENT_PRIORITY_LABELS,
	NB_TARGET_KIND_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import {
	parseFinishTime,
	parseTargetKm,
	parseTargetPace,
	parseTargetPlacement,
} from './__event-target.ts'

const L = EVENTS_LABELS

/** The longest name, place and notes the Event table takes (`EventAuthoringSchema`). */
export const EVENT_NAME_MAX = 120
export const EVENT_LOCATION_MAX = 120
export const EVENT_NOTES_MAX = 2000

const TARGET_KINDS = Object.keys(NB_TARGET_KIND_LABELS) as Array<
	keyof typeof NB_TARGET_KIND_LABELS
>

/**
 * What the form posts, read and checked: every rule `EventAuthoringSchema`
 * enforces, said in Norwegian at the field it is about, plus the target typed
 * as words. Conform reads an empty field as `undefined`, so "required" is the
 * `required_error`.
 */
const EventFieldsSchema = z.object({
	name: z
		.string({ required_error: L.nameRequired })
		.trim()
		.min(1, L.nameRequired)
		.max(EVENT_NAME_MAX, L.nameTooLong(EVENT_NAME_MAX)),
	kind: z.enum(EVENT_KINDS, {
		errorMap: () => ({ message: L.kindRequired }),
	}),
	priority: z.enum(EVENT_PRIORITIES, {
		errorMap: () => ({ message: L.priorityRequired }),
	}),
	startDate: z
		.string({ required_error: L.startDateRequired })
		.regex(DAY_KEY_PATTERN, L.startDateRequired),
	endDate: z.string().regex(DAY_KEY_PATTERN, L.endDateInvalid).optional(),
	disciplines: z
		.array(z.enum(DISCIPLINES), {
			required_error: L.disciplineRequired,
			invalid_type_error: L.disciplineRequired,
		})
		.min(1, L.disciplineRequired),
	location: z
		.string()
		.trim()
		.max(EVENT_LOCATION_MAX, L.locationTooLong(EVENT_LOCATION_MAX))
		.optional(),
	notes: z
		.string()
		.max(EVENT_NOTES_MAX, L.notesTooLong(EVENT_NOTES_MAX))
		.optional(),
})

/** The last day may not come before the first. */
const EventDaysOrderSchema = z
	.object({ startDate: z.string().optional(), endDate: z.string().optional() })
	.superRefine(({ startDate, endDate }, ctx) => {
		// ISO day keys compare as text, so no Date is needed to order them.
		if (startDate && endDate && endDate < startDate) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['endDate'],
				message: L.endDateBeforeStart,
			})
		}
	})

/** The target, typed as words, checked against the kind it names. */
const EventTargetEntrySchema = z
	.object({
		targetKind: z.enum(TARGET_KINDS as [string, ...string[]]).optional(),
		targetTime: z.string().optional(),
		targetPace: z.string().optional(),
		targetDistance: z.string().optional(),
		targetPlacement: z.string().optional(),
		targetDescription: z.string().trim().optional(),
	})
	.superRefine((value, ctx) => {
		const refuse = (path: string, message: string) =>
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
		switch (value.targetKind) {
			case 'time':
				if (parseFinishTime(value.targetTime ?? '') == null)
					refuse('targetTime', L.targetTimeInvalid)
				break
			case 'pace':
				if (parseTargetPace(value.targetPace ?? '') == null)
					refuse('targetPace', L.targetPaceInvalid)
				break
			case 'distance':
				if (parseTargetKm(value.targetDistance ?? '') == null)
					refuse('targetDistance', L.targetDistanceInvalid)
				break
			case 'placement':
				if (parseTargetPlacement(value.targetPlacement ?? '') == null)
					refuse('targetPlacement', L.targetPlacementInvalid)
				break
			case 'qualitative':
				if (!value.targetDescription)
					refuse('targetDescription', L.targetDescriptionRequired)
				break
		}
	})

/**
 * Three parts, intersected rather than one object with one refinement: zod
 * runs an object's refinement only once every field has passed, so a bad
 * target time would stay unsaid until the name was filled in. Intersected,
 * every error is said on the same submit, each at its field.
 */
export const EventEntrySchema = EventFieldsSchema.and(EventDaysOrderSchema).and(
	EventTargetEntrySchema,
)

type EventEntry = z.infer<typeof EventEntrySchema>

/** The target the entry names, read from its words; already checked above. */
function targetOf(entry: EventEntry): EventTarget | null {
	switch (entry.targetKind) {
		case 'time':
			return { kind: 'time', seconds: parseFinishTime(entry.targetTime!)! }
		case 'pace':
			return { kind: 'pace', secPerKm: parseTargetPace(entry.targetPace!)! }
		case 'distance':
			return { kind: 'distance', meters: parseTargetKm(entry.targetDistance!)! }
		case 'placement':
			return {
				kind: 'placement',
				position: parseTargetPlacement(entry.targetPlacement!)!,
			}
		case 'finish':
			return { kind: 'finish' }
		case 'qualitative':
			return { kind: 'qualitative', description: entry.targetDescription! }
		default:
			return null
	}
}

/**
 * The posted form, read for an action: either the Event to write, or the
 * reply that puts each error back at its field (status 400).
 */
export function readEventForm(formData: FormData) {
	const submission = parseWithZod(formData, { schema: EventEntrySchema })
	if (submission.status !== 'success') {
		return { ok: false as const, reply: submission.reply() }
	}
	const entry = submission.value
	const authoring = EventAuthoringSchema.safeParse({
		name: entry.name,
		kind: entry.kind,
		priority: entry.priority,
		startDate: new Date(entry.startDate),
		endDate: entry.endDate ? new Date(entry.endDate) : null,
		disciplines: entry.disciplines,
		target: targetOf(entry),
		location: entry.location || null,
		notes: entry.notes || null,
		status: 'planned',
	})
	if (!authoring.success) {
		// Every rule the domain schema holds is checked above in words; one that
		// still slips through is said once, at the top, rather than in English.
		return {
			ok: false as const,
			reply: submission.reply({ formErrors: [L.formInvalid] }),
		}
	}
	return { ok: true as const, input: authoring.data as EventAuthoringInput }
}

/** The form's starting values: empty for a new Event, its own for an edit. */
export type EventFormDefaults = {
	name: string
	kind: string
	priority: string
	startDate: string
	endDate: string
	disciplines: string[]
	location: string
	notes: string
	targetKind: string
	targetTime: string
	targetPace: string
	targetDistance: string
	targetPlacement: string
	targetDescription: string
}

function errorsOf(errors: string[] | undefined) {
	return errors?.map((message) => ({ message }))
}

/** One field's label, an optional "valgfritt" and a hint, kept together. */
function OptionalMark() {
	return (
		<span className="text-muted-foreground font-normal">
			{' · '}
			{L.optional}
		</span>
	)
}

/**
 * A radio choice laid out as a tile: the whole tile is the label, so the
 * target is the tile (≥44px), not the 16px dot.
 */
function ChoiceTile({
	value,
	title,
	detail,
	invalid,
}: {
	value: string
	title: string
	detail?: string
	invalid: boolean
}) {
	return (
		<FieldLabel
			className={cn(
				'bg-input/50 has-data-checked:bg-primary/10 has-data-checked:ring-primary/40 duration-press active:bg-input flex min-h-11 w-full items-center gap-2.5 rounded-3xl px-3 py-2.5 ring-1 ring-transparent transition-[background-color,box-shadow] ease-out',
			)}
		>
			<RadioGroupItem value={value} aria-invalid={invalid || undefined} />
			<span className="min-w-0">
				<span className="text-callout block">{title}</span>
				{detail ? (
					<span className="text-muted-foreground text-footnote block">
						{detail}
					</span>
				) : null}
			</span>
		</FieldLabel>
	)
}

export function EventForm({
	id,
	defaults,
	lastResult,
	submitLabel,
}: {
	id: string
	defaults: EventFormDefaults
	lastResult: SubmissionResult<string[]> | null | undefined
	submitLabel: string
}) {
	const navigation = useNavigation()
	const submitting = navigation.state === 'submitting'
	const [form, fields] = useForm({
		id,
		constraint: getZodConstraint(EventEntrySchema),
		lastResult,
		defaultValue: defaults,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: EventEntrySchema })
		},
		shouldValidate: 'onSubmit',
		// After a failed submit, a field is checked again as it is typed in, not
		// on blur: an error that vanished on blur moved everything under it up
		// between a finger landing on the next field and lifting, and the tap
		// missed (a checkbox tapped right after fixing the name stayed unticked).
		shouldRevalidate: 'onInput',
	})
	const [targetKind, setTargetKind] = useState(defaults.targetKind)
	const kindLegendId = useId()
	const priorityLegendId = useId()
	const disciplinesLegendId = useId()

	const errorId = (name: string) => `${form.id}-${name}-error`
	const invalidProps = (name: string, errors: string[] | undefined) =>
		errors?.length
			? { 'aria-invalid': true, 'aria-describedby': errorId(name) }
			: {}

	const targetField = (
		name:
			| 'targetTime'
			| 'targetPace'
			| 'targetDistance'
			| 'targetPlacement'
			| 'targetDescription',
		label: string,
		hint: string | null,
		input: React.ComponentProps<'input'>,
	) => {
		const meta = fields[name]
		const errors = meta.errors
		return (
			<Field data-invalid={errors?.length ? true : undefined}>
				<FieldLabel htmlFor={meta.id}>{label}</FieldLabel>
				<Input
					{...getInputProps(meta, { type: 'text' })}
					key={meta.key}
					autoComplete="off"
					enterKeyHint="next"
					{...input}
					{...invalidProps(name, errors)}
				/>
				{hint ? <FieldDescription>{hint}</FieldDescription> : null}
				<FieldError id={errorId(name)} errors={errorsOf(errors)} />
			</Field>
		)
	}

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-6">
			<Card>
				<CardContent className="flex flex-col gap-6">
					<Field data-invalid={fields.name.errors?.length ? true : undefined}>
						<FieldLabel htmlFor={fields.name.id}>{L.name}</FieldLabel>
						<Input
							{...getInputProps(fields.name, { type: 'text' })}
							key={fields.name.key}
							placeholder={L.namePlaceholder}
							autoComplete="off"
							autoCapitalize="words"
							enterKeyHint="next"
							maxLength={EVENT_NAME_MAX}
							{...invalidProps('name', fields.name.errors)}
						/>
						<FieldError
							id={errorId('name')}
							errors={errorsOf(fields.name.errors)}
						/>
					</Field>

					<FieldSet
						aria-labelledby={kindLegendId}
						data-invalid={fields.kind.errors?.length ? true : undefined}
						className="gap-3"
					>
						<FieldLegend id={kindLegendId} variant="label" className="mb-0">
							{L.kind}
						</FieldLegend>
						<RadioGroup
							name={fields.kind.name}
							defaultValue={defaults.kind}
							aria-labelledby={kindLegendId}
							{...invalidProps('kind', fields.kind.errors)}
							className="grid-cols-1 gap-2 min-[400px]:grid-cols-3"
						>
							{EVENT_KINDS.map((kind) => (
								<ChoiceTile
									key={kind}
									value={kind}
									title={NB_EVENT_KIND_LABELS[kind]}
									invalid={Boolean(fields.kind.errors?.length)}
								/>
							))}
						</RadioGroup>
						<FieldError
							id={errorId('kind')}
							errors={errorsOf(fields.kind.errors)}
						/>
					</FieldSet>

					<FieldSet
						aria-labelledby={priorityLegendId}
						data-invalid={fields.priority.errors?.length ? true : undefined}
						className="gap-3"
					>
						<FieldLegend id={priorityLegendId} variant="label" className="mb-0">
							{L.priorityLegend}
						</FieldLegend>
						<RadioGroup
							name={fields.priority.name}
							defaultValue={defaults.priority}
							aria-labelledby={priorityLegendId}
							{...invalidProps('priority', fields.priority.errors)}
							className="grid-cols-1 gap-2 min-[400px]:grid-cols-3"
						>
							{EVENT_PRIORITIES.map((priority) => (
								<ChoiceTile
									key={priority}
									value={priority}
									title={priority}
									detail={NB_EVENT_PRIORITY_LABELS[priority]}
									invalid={Boolean(fields.priority.errors?.length)}
								/>
							))}
						</RadioGroup>
						<FieldError
							id={errorId('priority')}
							errors={errorsOf(fields.priority.errors)}
						/>
					</FieldSet>

					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Field
							data-invalid={fields.startDate.errors?.length ? true : undefined}
						>
							<FieldLabel htmlFor={fields.startDate.id}>
								{L.startDate}
							</FieldLabel>
							<Input
								{...getInputProps(fields.startDate, { type: 'date' })}
								key={fields.startDate.key}
								{...invalidProps('startDate', fields.startDate.errors)}
							/>
							<FieldError
								id={errorId('startDate')}
								errors={errorsOf(fields.startDate.errors)}
							/>
						</Field>
						<Field
							data-invalid={fields.endDate.errors?.length ? true : undefined}
						>
							<FieldLabel htmlFor={fields.endDate.id}>
								{L.endDate}
								<OptionalMark />
							</FieldLabel>
							<Input
								{...getInputProps(fields.endDate, { type: 'date' })}
								key={fields.endDate.key}
								min={fields.startDate.value || undefined}
								{...invalidProps('endDate', fields.endDate.errors)}
							/>
							<FieldDescription>{L.endDateHint}</FieldDescription>
							<FieldError
								id={errorId('endDate')}
								errors={errorsOf(fields.endDate.errors)}
							/>
						</Field>
					</div>

					<FieldSet
						aria-labelledby={disciplinesLegendId}
						data-invalid={fields.disciplines.errors?.length ? true : undefined}
						className="gap-3"
					>
						<FieldLegend
							id={disciplinesLegendId}
							variant="label"
							className="mb-0"
						>
							{L.disciplines}
						</FieldLegend>
						<div
							role="group"
							aria-labelledby={disciplinesLegendId}
							className="grid grid-cols-2 gap-2"
						>
							{DISCIPLINES.map((discipline) => (
								<FieldLabel
									key={discipline}
									className="bg-input/50 has-data-checked:bg-primary/10 has-data-checked:ring-primary/40 duration-press active:bg-input flex min-h-11 w-full items-center gap-2.5 rounded-3xl px-3 ring-1 ring-transparent transition-[background-color,box-shadow] ease-out"
								>
									<Checkbox
										name={fields.disciplines.name}
										value={discipline}
										defaultChecked={defaults.disciplines.includes(discipline)}
										// The checkbox is a button over a hidden input, so the
										// form never sees an input or blur on the field: check
										// it again once the hidden input has the new state, so
										// "Velg minst én idrett" goes as soon as one is ticked.
										onCheckedChange={() => {
											if (!fields.disciplines.errors?.length) return
											requestAnimationFrame(() =>
												form.validate({ name: fields.disciplines.name }),
											)
										}}
										aria-invalid={
											fields.disciplines.errors?.length ? true : undefined
										}
										aria-describedby={
											fields.disciplines.errors?.length
												? errorId('disciplines')
												: undefined
										}
									/>
									<span className="text-callout">
										{NB_DISCIPLINE_LABELS[discipline]}
									</span>
								</FieldLabel>
							))}
						</div>
						<FieldError
							id={errorId('disciplines')}
							errors={errorsOf(fields.disciplines.errors)}
						/>
					</FieldSet>

					<Field
						data-invalid={fields.location.errors?.length ? true : undefined}
					>
						<FieldLabel htmlFor={fields.location.id}>
							{L.location}
							<OptionalMark />
						</FieldLabel>
						<Input
							{...getInputProps(fields.location, { type: 'text' })}
							key={fields.location.key}
							placeholder={L.locationPlaceholder}
							autoComplete="off"
							autoCapitalize="words"
							enterKeyHint="next"
							maxLength={EVENT_LOCATION_MAX}
							{...invalidProps('location', fields.location.errors)}
						/>
						<FieldError
							id={errorId('location')}
							errors={errorsOf(fields.location.errors)}
						/>
					</Field>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="flex flex-col gap-6">
					<Field>
						<FieldLabel htmlFor={fields.targetKind.id}>
							{L.target}
							<OptionalMark />
						</FieldLabel>
						<Select
							name={fields.targetKind.name}
							value={targetKind}
							onValueChange={(value) => setTargetKind((value as string) ?? '')}
							items={TARGET_KINDS.map((kind) => ({
								value: kind,
								label: NB_TARGET_KIND_LABELS[kind],
							}))}
						>
							<SelectTrigger id={fields.targetKind.id} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TARGET_KINDS.map((kind) => (
									<SelectItem key={kind} value={kind}>
										{NB_TARGET_KIND_LABELS[kind]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					{targetKind === 'time'
						? targetField('targetTime', L.targetTime, L.targetTimeHint, {
								inputMode: 'decimal',
								placeholder: '3:30:00',
							})
						: null}
					{targetKind === 'pace'
						? targetField('targetPace', L.targetPace, L.targetPaceHint, {
								inputMode: 'decimal',
								placeholder: '4:15',
							})
						: null}
					{targetKind === 'distance'
						? targetField(
								'targetDistance',
								L.targetDistance,
								L.targetDistanceHint,
								{ inputMode: 'decimal', placeholder: '42,2' },
							)
						: null}
					{targetKind === 'placement'
						? targetField(
								'targetPlacement',
								L.targetPlacement,
								L.targetPlacementHint,
								{ inputMode: 'numeric', placeholder: '3' },
							)
						: null}
					{targetKind === 'qualitative'
						? targetField('targetDescription', L.targetDescription, null, {
								placeholder: L.targetDescriptionPlaceholder,
								autoCapitalize: 'sentences',
							})
						: null}

					<Field data-invalid={fields.notes.errors?.length ? true : undefined}>
						<FieldLabel htmlFor={fields.notes.id}>
							{L.notes}
							<OptionalMark />
						</FieldLabel>
						<Textarea
							{...getInputProps(fields.notes, { type: 'text' })}
							key={fields.notes.key}
							placeholder={L.notesPlaceholder}
							rows={3}
							maxLength={EVENT_NOTES_MAX}
							{...invalidProps('notes', fields.notes.errors)}
						/>
						<FieldError
							id={errorId('notes')}
							errors={errorsOf(fields.notes.errors)}
						/>
					</Field>
				</CardContent>
			</Card>

			<FieldError id={form.errorId} errors={errorsOf(form.errors)} />

			<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
				<Button
					type="submit"
					className="w-full sm:w-auto"
					disabled={submitting}
				>
					{submitLabel}
				</Button>
			</div>
		</Form>
	)
}
