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
 * panel goes.
 */
import {
	getFormProps,
	getInputProps,
	useForm,
	type FieldMetadata,
} from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { useEffect, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { type z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import {
	type action as strengthLogAction,
	type loader as strengthLogLoader,
} from '#app/routes/resources/strength-log.tsx'
import { QUICK_LOG_LABELS } from '#app/utils/labels.ts'
import {
	type QuickLog,
	QUICK_LOG_MAX_COUNT,
	STRENGTH_LOG_ACTION,
	StrengthLogAsPlannedSchema,
	StrengthLogEditSchema,
} from '#app/utils/strength-quick-log.ts'
import { type TimelineStrengthLog } from './strength-log.ts'

const PRIMARY =
	'bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-60 min-h-11 flex-1 rounded-[10px] px-4 text-[13px]/[1] font-bold'
const SECONDARY =
	'border-border text-foreground hover:border-primary disabled:opacity-60 min-h-11 flex-1 rounded-[10px] border px-4 text-[13px]/[1] font-semibold'

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
			className="border-border bg-card mt-[-6px] mr-[18px] mb-3 ml-[76px] flex flex-col gap-2.5 rounded-[12px] border px-3 py-3"
		>
			<h3 className="text-primary text-[11px]/[1.2] font-bold tracking-[0.04em] uppercase">
				{words.heading}
			</h3>
			{quickLog ? (
				// While editing, each lift heads its own set fields instead.
				editing ? null : (
					<PlanLines quickLog={quickLog} />
				)
			) : (
				<p aria-live="polite" className="text-muted-foreground text-[12px]/[1.35]">
					{reader.data ? null : QUICK_LOG_LABELS.loading}
				</p>
			)}
			{quickLog && !quickLog.loggable ? (
				<p className="text-muted-foreground text-[12px]/[1.4] [text-wrap:pretty]">
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

/** `Back Squat · 3×5 · 100 kg`, one line per lift. */
function PlanLines({ quickLog }: { quickLog: QuickLog }) {
	return (
		<ul className="flex flex-col gap-1">
			{quickLog.lifts.map((lift) => (
				<li
					key={lift.stepId}
					className="text-foreground text-[13px]/[1.35] [text-wrap:pretty]"
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
					className="text-muted-foreground flex min-h-11 items-center text-[12px]/[1.35]"
				>
					{QUICK_LOG_LABELS.saving}
				</p>
			) : (
				<div className="flex gap-2">
					<button
						type="submit"
						aria-label={words.asPlannedLabel}
						className={PRIMARY}
					>
						{QUICK_LOG_LABELS.asPlanned}
					</button>
					<button
						type="button"
						disabled={!canEdit}
						onClick={onEdit}
						className={SECONDARY}
					>
						{QUICK_LOG_LABELS.edit}
					</button>
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
	const [form, fields] = useForm<EditFields>({
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
	const setFields = fields.sets.getFieldList()
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
			{quickLog.lifts.map((lift) => (
				<fieldset key={lift.stepId} className="flex flex-col gap-1.5">
					<legend className="text-foreground mb-1.5 text-[12.5px]/[1.3] font-semibold">
						{lift.name}
						{lift.loadLabel ? (
							<span className="text-muted-foreground font-normal tabular-nums">
								{` · ${lift.loadLabel}`}
							</span>
						) : null}
					</legend>
					<div className="flex flex-wrap gap-2">
						{lift.sets.map((set, position) => {
							const field = setFields[index++]
							return field ? (
								<SetInput
									key={set.orderIndex}
									field={field}
									label={QUICK_LOG_LABELS.setInput(
										lift.name,
										position + 1,
										set.unit,
									)}
								/>
							) : null
						})}
					</div>
				</fieldset>
			))}
			<p className="text-muted-foreground text-[11.5px]/[1.4] [text-wrap:pretty]">
				{QUICK_LOG_LABELS.notDoneNote} {QUICK_LOG_LABELS.weightNote}
			</p>
			{sent ? (
				<p
					aria-live="polite"
					className="text-muted-foreground flex min-h-11 items-center text-[12px]/[1.35]"
				>
					{QUICK_LOG_LABELS.saving}
				</p>
			) : (
				<div className="flex gap-2">
					<button type="submit" className={PRIMARY}>
						{QUICK_LOG_LABELS.save}
					</button>
					<button type="button" onClick={onCancel} className={SECONDARY}>
						{QUICK_LOG_LABELS.cancel}
					</button>
				</div>
			)}
			<ErrorList id={form.errorId} errors={form.errors} />
		</fetcher.Form>
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
			<input
				{...getInputProps(set.count, { type: 'number' })}
				aria-label={label}
				inputMode="numeric"
				min={0}
				max={QUICK_LOG_MAX_COUNT}
				className="border-border bg-background focus-visible:ring-ring aria-[invalid]:border-destructive h-11 w-14 rounded-[10px] border text-center text-[16px] tabular-nums focus-visible:ring-2 focus-visible:outline-none"
			/>
		</span>
	)
}
