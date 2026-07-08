/**
 * Inline token editing on the Workout Detail View (ADR 0027, R7 — slice 8/9).
 *
 * Read = write: for a *scheduled* session the detail view's structure card
 * renders the same editable Token Sentence the create/edit routes use (slice
 * 4/9–6/9's `TokenSentenceEditor`), and saving posts through the EXISTING edit
 * action via a `useFetcher` — no separate edit-page round-trip and no new save
 * path. Completed / missed / skipped sessions keep the inert read-only
 * sentence; recorded history is immutable (ADR 0012, ADR 0027 §4).
 *
 * Because the save reuses `upcoming.$sessionId.edit`'s action verbatim, every
 * existing behaviour applies unchanged: Zod/Conform validation, the resolved
 * range bake, the Planned-TSS recompute, and Generated-Session adoption
 * (`source: authored`). Failed saves surface the server's field errors inline
 * (fed back through Conform's `lastResult`) without losing the athlete's draft.
 *
 * Submission detail: the sentence editor only exposes inputs for the tokens the
 * athlete can tap, so a native submit of just the sentence would drop the
 * fields it never renders (block names, step kinds, strength sets). We keep the
 * whole prescription in the form by rendering the complete Conform field tree
 * as hidden inputs beside the sentence — the sentence's `useInputControl` writes
 * bind to the very same fields (as they do beside the classic editor), so the
 * form posts the full, lossless prescription through the unchanged submission
 * path.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useMemo } from 'react'
import { useFetcher } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { formatDistance, formatDuration } from '#app/utils/format.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type SessionDetail } from '#app/utils/training.server.ts'
import { FormSchema } from '#app/utils/workout-authoring.ts'
import { TokenSentenceEditor } from './__token-sentence-editor.tsx'

// Conform metadata is typed loosely here, matching the sibling form modules
// (`__workout-editor.tsx`, `__token-sentence-editor.tsx`): these helpers only
// read field names/keys and hand them to `getInputProps`.
type FieldMeta = any

type WorkoutDetail = NonNullable<SessionDetail['workout']>

/**
 * The persisted workout as the create/edit routes' Conform default value —
 * canonical seconds/metres rendered back into the humane strings the form
 * parses (ADR 0023), mirroring `upcoming.$sessionId.edit`'s
 * `sessionToFormDefaults`. Always `structured`: a stored session already has
 * real Block/Step structure to preserve.
 */
function workoutToFormDefaults(session: {
	scheduledAt: Date | string
	workout: WorkoutDetail
}) {
	const scheduledAt = new Date(session.scheduledAt)
	const { workout } = session
	return {
		title: workout.title,
		discipline: workout.discipline,
		intent: workout.intent,
		scheduledAtDate: scheduledAt.toISOString().slice(0, 10),
		scheduledAtTime: scheduledAt.toISOString().slice(11, 16),
		structure: 'structured' as const,
		blocks: workout.blocks.map((block) => ({
			name: block.name ?? '',
			repeatCount: String(block.repeatCount),
			steps: block.steps.map((step) => ({
				kind: step.kind,
				discipline: step.discipline ?? '',
				intensity: step.intensity ?? '',
				duration:
					step.durationSec != null ? formatDuration(step.durationSec) : '',
				distance: step.distanceM != null ? formatDistance(step.distanceM) : '',
				exerciseId: step.exerciseId ?? '',
				restBetweenSetsSec:
					step.restBetweenSetsSec != null
						? String(step.restBetweenSetsSec)
						: '',
				notes: step.notes ?? '',
				sets: step.sets.map((set) => ({
					kind: set.kind,
					orderIndex: String(set.orderIndex),
					reps: set.reps != null ? String(set.reps) : '',
					durationSec: set.durationSec != null ? String(set.durationSec) : '',
					weightKg: set.weightKg != null ? String(set.weightKg) : '',
					pct1RM: set.pct1RM != null ? String(set.pct1RM) : '',
				})),
			})),
		})),
	}
}

/** One field as a hidden input carrying its current Conform value. */
function HiddenField({ meta }: { meta: FieldMeta }) {
	return (
		<input
			{...getInputProps(meta, { type: 'text' })}
			className="sr-only"
			tabIndex={-1}
			aria-hidden
		/>
	)
}

/**
 * The whole Block/Step/Set field tree rendered as hidden inputs, so the form
 * posts the complete prescription even though only tapped tokens have visible
 * controls. The sentence editor's `useInputControl` writes bind to these same
 * fields by name — exactly as the token popovers bind beside the classic editor
 * — so an edited token updates its hidden input in place. Iterating the live
 * field lists keeps the mirror in step with add/remove/reorder.
 */
function HiddenBlockFields({ blocksField }: { blocksField: FieldMeta }) {
	return (
		<>
			{blocksField.getFieldList().map((blockField: FieldMeta) => {
				const block = blockField.getFieldset()
				return (
					<div key={blockField.key} hidden>
						<HiddenField meta={block.name} />
						<HiddenField meta={block.repeatCount} />
						{block.steps.getFieldList().map((stepField: FieldMeta) => {
							const step = stepField.getFieldset()
							return (
								<div key={stepField.key}>
									<HiddenField meta={step.kind} />
									<HiddenField meta={step.discipline} />
									<HiddenField meta={step.intensity} />
									<HiddenField meta={step.duration} />
									<HiddenField meta={step.distance} />
									<HiddenField meta={step.exerciseId} />
									<HiddenField meta={step.restBetweenSetsSec} />
									<HiddenField meta={step.notes} />
									{(step.sets?.getFieldList?.() ?? []).map(
										(setField: FieldMeta) => {
											const set = setField.getFieldset()
											return (
												<div key={setField.key}>
													<HiddenField meta={set.kind} />
													<HiddenField meta={set.orderIndex} />
													<HiddenField meta={set.reps} />
													<HiddenField meta={set.durationSec} />
													<HiddenField meta={set.weightKg} />
													<HiddenField meta={set.pct1RM} />
												</div>
											)
										},
									)}
								</div>
							)
						})}
					</div>
				)
			})}
		</>
	)
}

export type ScheduledWorkoutSentenceProps = {
	session: {
		id: string
		scheduledAt: Date | string
		workout: WorkoutDetail
	}
	thresholds: DisciplineThresholdMap
}

/**
 * The editable Token Sentence for a scheduled session, saving inline through
 * the existing edit action. Token edits mutate the Conform draft; Save posts
 * the whole prescription to `upcoming/:id/edit` via a fetcher, so validation
 * and Generated-Session adoption come for free and the prescription re-renders
 * from the revalidated loader without a navigation.
 */
export function ScheduledWorkoutSentence({
	session,
	thresholds,
}: ScheduledWorkoutSentenceProps) {
	const fetcher = useFetcher<{
		result: Parameters<typeof useForm>[0]['lastResult']
	}>()
	const editAction = `/training/upcoming/${session.id}/edit`
	const { workout } = session

	const [form, fields] = useForm({
		id: `inline-edit-${session.id}`,
		constraint: getZodConstraint(FormSchema),
		lastResult: fetcher.data?.result,
		defaultValue: workoutToFormDefaults(session),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	// Draft steps carry only an `exerciseId`, so the sentence needs id → name to
	// render strength exercise tokens. The names already ride along on the
	// session's own steps (no extra query), so map straight off the workout.
	const exerciseNames = useMemo(() => {
		const names: Record<string, string> = {}
		for (const block of workout.blocks) {
			for (const step of block.steps) {
				if (step.exerciseId && step.exercise) {
					names[step.exerciseId] = step.exercise.name
				}
			}
		}
		return names
	}, [workout])

	const pending = fetcher.state !== 'idle'

	return (
		<fetcher.Form {...getFormProps(form)} method="POST" action={editAction}>
			{/* Top-level workout fields aren't token-editable here, but must still
			    round-trip so the edit action rebuilds the same workout. */}
			<HiddenField meta={fields.title} />
			<HiddenField meta={fields.discipline} />
			<HiddenField meta={fields.intent} />
			<HiddenField meta={fields.scheduledAtDate} />
			<HiddenField meta={fields.scheduledAtTime} />
			<HiddenField meta={fields.structure} />
			<HiddenBlockFields blocksField={fields.blocks} />

			<div className="text-body-sm rounded-md border p-3">
				<TokenSentenceEditor
					form={form}
					blocksField={fields.blocks}
					exerciseNames={exerciseNames}
					thresholds={thresholds}
					workoutDiscipline={
						(fields.discipline.value as string | undefined) ||
						workout.discipline
					}
				/>
			</div>
			<div className="mt-3 flex items-center gap-3">
				<StatusButton
					type="submit"
					size="sm"
					status={
						pending ? 'pending' : form.status === 'error' ? 'error' : 'idle'
					}
				>
					Save changes
				</StatusButton>
				<p className="text-muted-foreground text-xs">
					Tap a token to adjust it, then save — no need to open the edit page.
				</p>
			</div>
			<ErrorList errors={form.errors as string[] | undefined} />
		</fetcher.Form>
	)
}
