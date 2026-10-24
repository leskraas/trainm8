/**
 * The quick strength log under a gym day's row on I dag (#505 stories 83–84):
 * the planned lifts, pre-filled, with _Som planlagt_ — one tap logs every set —
 * and _Endre_ for the sets that went differently.
 *
 * _Som planlagt_ posts only the session: the server reads the plan, so the tap
 * works before the plan has loaded here and cannot post a number that
 * disagrees with it. _Endre_ edits reps (or a hold's seconds) per set, and an
 * empty field is a set not done. **There is no weight field** (ADR 0064 §2):
 * every set is logged at the weight the prescription resolved, as a tap on the
 * runner's circle is, and the panel says so where a weight field would be.
 *
 * Both forms are conform forms posting to the owner-scoped resource route.
 * Home revalidates after a log, so the row itself is the confirmation: it
 * turns done with its sets counted, the week header's numbers move, and this
 * panel goes. The toast says how many sets went in and carries **Angre**
 * (ADR 0088), which takes exactly those sets back and puts the session back to
 * planned — so a mistap on _Som planlagt_ is one tap from undone, on I dag.
 *
 * The lifts are named in Norwegian (`Knebøy`: the server names a lift by its Norwegian alias, `liftDisplayName`) and the kilos
 * with a decimal comma (`82,5 kg`, `formatNbKg` on the server), as every
 * other surface of I dag writes them (audit PR D).
 */
import {
	getFormProps,
	getInputProps,
	useForm,
	type FieldMetadata,
} from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { useEffect, useRef, useState } from 'react'
import { Link, useFetcher, useSubmit } from 'react-router'
import { toast } from 'sonner'
import { type z } from 'zod/v3'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	type action as strengthLogAction,
	type loader as strengthLogLoader,
} from '#app/routes/resources/strength-log.tsx'
import { formatNbKg } from '#app/utils/format.ts'
import { QUICK_LOG_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { LANDED_MS } from '#app/utils/motion.ts'
import { parseKiloInput } from '#app/utils/strength/kilo-input.ts'
import {
	type QuickLog,
	QUICK_LOG_MAX_COUNT,
	QUICK_LOG_MAX_KG,
	quickLogKg,
	stepKilo,
	STRENGTH_LOG_ACTION,
	StrengthLogAsPlannedSchema,
	StrengthLogEditSchema,
} from '#app/utils/strength-quick-log.ts'
import { TITLE_INSET_BOX } from './row-inset.ts'
import { type TimelineStrengthLog } from './strength-log.ts'

export function StrengthLogPanel({
	sessionId,
	words,
}: {
	sessionId: string
	words: TimelineStrengthLog
}) {
	const reader = useFetcher<typeof strengthLogLoader>()
	const [editing, setEditing] = useState(false)
	useEffect(() => {
		if (reader.state === 'idle' && reader.data == null) {
			void reader.load(
				`${STRENGTH_LOG_ACTION}?sessionId=${encodeURIComponent(sessionId)}`,
			)
		}
		// Once per session: the plan does not change under an open row.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId])
	const quickLog = reader.data?.quickLog ?? null

	return (
		<section
			aria-label={words.label}
			data-strength-log
			className={cn(
				'bg-muted/60 mr-4 mb-3 flex flex-col gap-2.5 rounded-3xl px-3.5 py-3',
				TITLE_INSET_BOX,
			)}
		>
			<h3 className="text-overline text-muted-foreground uppercase">
				{words.heading}
			</h3>
			{quickLog ? (
				// While editing, each lift heads its own set fields instead.
				editing ? null : (
					<PlanLines quickLog={quickLog} />
				)
			) : (
				<p aria-live="polite" className="text-footnote text-muted-foreground">
					{reader.data ? null : QUICK_LOG_LABELS.loading}
				</p>
			)}
			{quickLog && !quickLog.loggable ? (
				<p className="text-footnote text-muted-foreground [text-wrap:pretty]">
					{QUICK_LOG_LABELS.notLoggable}{' '}
					<Link
						to={quickLog.runnerTo}
						className="text-primary font-semibold underline underline-offset-2"
					>
						{QUICK_LOG_LABELS.runnerLink}
					</Link>
				</p>
			) : editing && quickLog ? (
				<EditForm quickLog={quickLog} onCancel={() => setEditing(false)} />
			) : (
				<AsPlannedForm
					sessionId={sessionId}
					words={words}
					canEdit={quickLog != null}
					onEdit={() => setEditing(true)}
				/>
			)}
		</section>
	)
}

/** `Knebøy · 3×5 · 100 kg`, one line per lift. */
function PlanLines({ quickLog }: { quickLog: QuickLog }) {
	return (
		<ul className="flex flex-col gap-1">
			{quickLog.lifts.map((lift) => (
				<li
					key={lift.stepId}
					data-quick-log-lift={lift.stepId}
					className="text-callout text-foreground [text-wrap:pretty]"
				>
					<span className="font-semibold">{lift.name}</span>
					<span className="text-muted-foreground tabular-nums">
						{` · ${lift.scheme}`}
						{lift.loadLabel ? ` · ${lift.loadLabel}` : null}
					</span>
				</li>
			))}
		</ul>
	)
}

/**
 * The log's toast, once the server has written it (ADR 0088): how many sets
 * went in and what that did to the week — and _Angre_, which posts exactly
 * the set logs this log wrote back to the resource route. The panel itself is
 * gone by then (home revalidated the row to done), so the way back is a
 * router-level submit, not this panel's fetcher.
 */
function useLoggedToast(
	data: Awaited<ReturnType<typeof strengthLogAction>>['data'] | undefined,
	sessionId: string,
) {
	const submit = useSubmit()
	const shown = useRef<string | null>(null)
	const line = data?.toast ?? null
	const result = data?.result
	const ids = result?.ok ? result.setLogIds : []
	const undoable = result?.ok === true && result.undoable && ids.length > 0
	const key = ids.join(',')
	useEffect(() => {
		if (!line || shown.current === key) return
		shown.current = key
		toast.success(line, {
			id: `quick-log-${sessionId}`,
			duration: LANDED_MS,
			action: undoable
				? {
						label: QUICK_LOG_LABELS.undo,
						onClick: () =>
							void submit(
								{ intent: 'undo', sessionId, setLogIds: key },
								{
									method: 'POST',
									action: STRENGTH_LOG_ACTION,
									navigate: false,
									fetcherKey: `quick-log-undo-${sessionId}`,
								},
							),
					}
				: undefined,
		})
	}, [key, line, sessionId, submit, undoable])
}

/** _Som planlagt_ and the way into _Endre_. */
function AsPlannedForm({
	sessionId,
	words,
	canEdit,
	onEdit,
}: {
	sessionId: string
	words: TimelineStrengthLog
	canEdit: boolean
	onEdit: () => void
}) {
	const fetcher = useFetcher<typeof strengthLogAction>()
	const [form, fields] = useForm({
		id: `strength-log-${sessionId}`,
		lastResult: fetcher.data?.submission,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: StrengthLogAsPlannedSchema })
		},
		defaultValue: { intent: 'as-planned', sessionId },
	})
	useLoggedToast(fetcher.data, sessionId)
	// In flight, and after the server agreed until home's revalidation takes the
	// panel away: a second tap has nothing to press.
	const sent = fetcher.state !== 'idle' || fetcher.data?.result?.ok === true
	return (
		<fetcher.Form
			method="post"
			action={STRENGTH_LOG_ACTION}
			{...getFormProps(form)}
			className="flex flex-col gap-2"
		>
			<input {...getInputProps(fields.intent, { type: 'hidden' })} />
			<input {...getInputProps(fields.sessionId, { type: 'hidden' })} />
			{sent ? (
				<p
					aria-live="polite"
					className="text-footnote text-muted-foreground flex min-h-11 items-center"
				>
					{QUICK_LOG_LABELS.saving}
				</p>
			) : (
				<div className="flex flex-wrap gap-2">
					<Button
						type="submit"
						aria-label={words.asPlannedLabel}
						className="min-w-0 flex-1 rounded-full whitespace-nowrap"
					>
						{QUICK_LOG_LABELS.asPlanned}
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={!canEdit}
						onClick={onEdit}
						className="min-w-0 flex-1 rounded-full whitespace-nowrap"
					>
						{QUICK_LOG_LABELS.edit}
					</Button>
				</div>
			)}
			<ErrorList id={form.errorId} errors={form.errors} />
		</fetcher.Form>
	)
}

type EditFields = z.input<typeof StrengthLogEditSchema>

/**
 * _Endre_: every planned set as a number, pre-filled with its target, grouped
 * by lift. Reps (or seconds for a hold) only — the weight is the plan's.
 */
function EditForm({
	quickLog,
	onCancel,
}: {
	quickLog: QuickLog
	onCancel: () => void
}) {
	const fetcher = useFetcher<typeof strengthLogAction>()
	const planned = quickLog.lifts.flatMap((lift) =>
		lift.sets.map((set) => ({
			stepId: lift.stepId,
			orderIndex: set.orderIndex,
			count: set.target,
		})),
	)
	const [form, fields] = useForm<
		EditFields,
		z.output<typeof StrengthLogEditSchema>
	>({
		id: `strength-log-edit-${quickLog.sessionId}`,
		lastResult: fetcher.data?.submission,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: StrengthLogEditSchema })
		},
		defaultValue: {
			intent: 'edited',
			sessionId: quickLog.sessionId,
			sets: planned,
		},
		shouldRevalidate: 'onBlur',
	})
	useLoggedToast(fetcher.data, quickLog.sessionId)
	const setFields = fields.sets.getFieldList()
	const weighted = quickLog.lifts.filter((lift) => lift.weight != null)
	const liftFields = fields.lifts.getFieldList()
	const sent = fetcher.state !== 'idle' || fetcher.data?.result?.ok === true
	let index = 0
	return (
		<fetcher.Form
			method="post"
			action={STRENGTH_LOG_ACTION}
			{...getFormProps(form)}
			className="flex flex-col gap-3"
		>
			<input {...getInputProps(fields.intent, { type: 'hidden' })} />
			<input {...getInputProps(fields.sessionId, { type: 'hidden' })} />
			{quickLog.lifts.map((lift) => {
				const name = lift.name
				return (
					<fieldset key={lift.stepId} className="flex flex-col gap-1.5">
						<legend className="text-callout text-foreground mb-1.5 font-semibold">
							{name}
							{lift.loadLabel ? (
								<span className="text-muted-foreground font-normal tabular-nums">
									{` · ${lift.loadLabel}`}
								</span>
							) : null}
						</legend>
						{lift.weight ? (
							<WeightStepper
								name={`lifts[${weighted.indexOf(lift)}]`}
								stepId={lift.stepId}
								lift={name}
								planned={lift.weight.kg}
								stepKg={lift.weight.stepKg}
								errors={
									liftFields.at(weighted.indexOf(lift))?.getFieldset().kg.errors
								}
							/>
						) : null}
						<div className="flex flex-wrap gap-2">
							{lift.sets.map((set, position) => {
								const field = setFields[index++]
								return field ? (
									<SetInput
										key={set.orderIndex}
										field={field}
										label={QUICK_LOG_LABELS.setInput(
											name,
											position + 1,
											set.unit,
										)}
									/>
								) : null
							})}
						</div>
					</fieldset>
				)
			})}
			<p className="text-footnote text-muted-foreground [text-wrap:pretty]">
				{QUICK_LOG_LABELS.notDoneNote}
			</p>
			{sent ? (
				<p
					aria-live="polite"
					className="text-footnote text-muted-foreground flex min-h-11 items-center"
				>
					{QUICK_LOG_LABELS.saving}
				</p>
			) : (
				<div className="flex flex-wrap gap-2">
					<Button type="submit" className="min-w-0 flex-1 rounded-full">
						{QUICK_LOG_LABELS.save}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						className="min-w-0 flex-1 rounded-full"
					>
						{QUICK_LOG_LABELS.cancel}
					</Button>
				</div>
			)}
			<ErrorList id={form.errorId} errors={form.errors} />
		</fetcher.Form>
	)
}

/**
 * One lift's weight (#530, ADR 0064 amended): − and + step by what the rack can
 * make, and the number between them takes a typed `82,5` too. It posts only
 * when it differs from the plan — a blank is "as planned" — so a plan that
 * moved under an open form is not overwritten by the number it showed.
 * 44 px buttons, a 16 px field so iOS does not zoom, `tabular-nums` so the
 * figure does not shift as it changes; no motion beyond the buttons' press.
 */
function WeightStepper({
	name,
	stepId,
	lift,
	planned,
	stepKg,
	errors,
}: {
	name: string
	stepId: string
	lift: string
	planned: number
	stepKg: number
	errors: string[] | undefined
}) {
	const [text, setText] = useState(formatNbKg(planned))
	const read = parseKiloInput(text)
	const kg = read == null ? null : quickLogKg(read)
	const changed = text.trim() !== '' && kg !== planned
	const step = formatNbKg(stepKg)
	const errorId = `${name}-kg-error`
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<input type="hidden" name={`${name}.stepId`} value={stepId} />
				<input type="hidden" name={`${name}.kg`} value={changed ? text : ''} />
				<Button
					type="button"
					variant="outline"
					aria-label={QUICK_LOG_LABELS.lighter(lift, step)}
					disabled={kg != null && kg <= stepKg}
					onClick={() =>
						setText(formatNbKg(stepKilo(kg ?? planned, stepKg, -1)))
					}
					className="size-11 shrink-0 rounded-full text-lg"
				>
					−
				</Button>
				<span className="relative flex items-center">
					<Input
						type="text"
						inputMode="decimal"
						autoComplete="off"
						aria-label={QUICK_LOG_LABELS.weightFor(lift)}
						aria-invalid={errors?.length ? true : undefined}
						aria-describedby={errors?.length ? errorId : undefined}
						value={text}
						onChange={(event) => setText(event.target.value)}
						className="bg-background w-24 pr-8 pl-2 text-center text-[16px] tabular-nums md:text-[16px]"
					/>
					<span
						aria-hidden
						className="text-muted-foreground text-footnote pointer-events-none absolute right-2.5"
					>
						kg
					</span>
				</span>
				<Button
					type="button"
					variant="outline"
					aria-label={QUICK_LOG_LABELS.heavier(lift, step)}
					disabled={kg != null && kg >= QUICK_LOG_MAX_KG}
					onClick={() =>
						setText(formatNbKg(stepKilo(kg ?? planned, stepKg, 1)))
					}
					className="size-11 shrink-0 rounded-full text-lg"
				>
					+
				</Button>
				{changed && kg != null ? (
					<span className="text-footnote text-muted-foreground min-w-0 truncate tabular-nums">
						{QUICK_LOG_LABELS.weightWas(`${formatNbKg(planned)} kg`)}
					</span>
				) : null}
			</div>
			<ErrorList id={errorId} errors={errors} />
		</div>
	)
}

/** One set's count: 16 px so iOS does not zoom, 44 px to a thumb. */
function SetInput({
	field,
	label,
}: {
	field: FieldMetadata<EditFields['sets'][number]>
	label: string
}) {
	const set = field.getFieldset()
	return (
		<span className="flex flex-col">
			<input {...getInputProps(set.stepId, { type: 'hidden' })} />
			<input {...getInputProps(set.orderIndex, { type: 'hidden' })} />
			<Input
				{...getInputProps(set.count, { type: 'number' })}
				aria-label={label}
				inputMode="numeric"
				min={0}
				max={QUICK_LOG_MAX_COUNT}
				className="bg-background w-16 px-2 text-center text-[16px] tabular-nums md:text-[16px]"
			/>
		</span>
	)
}
