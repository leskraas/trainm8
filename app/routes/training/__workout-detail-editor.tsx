/**
 * Inline token editing on the Workout Detail View (ADR 0027, R7 — slice 8/9;
 * autosave from workout-editor spec §1, #261).
 *
 * The detail view IS the editor (§1, B9): for a *scheduled* session the detail
 * view's structure card renders the same editable Token Sentence the create
 * route uses (`TokenSentenceEditor`), with no second edit entry point and no
 * "save" chrome. Completed / missed / skipped sessions keep the inert read-only
 * sentence; recorded history is immutable (ADR 0012, ADR 0027 §4).
 *
 * Autosave — save on change (§1): every committed token or structure change
 * posts immediately through the detail route's own action (its `update-workout`
 * branch) via a `useFetcher` — the standalone edit page is gone (§12), so there
 * is no separate edit-page round-trip and no new save path. The save is optimistic
 * and silent: no button, no dirty state, no toast, no spinner. The one and only
 * indicator is a quiet, delayed "saving…" that appears solely when a save
 * actually hangs (~2 s). Because every committed edit lands in the draft
 * `form.value` (token writes through `useInputControl`, structure edits through
 * the `form.update` intent), watching a serialization of that value is the
 * single trigger; a short debounce coalesces rapid ± nudges into one post
 * without feeling deferred.
 *
 * Because the save reuses the workout-update action verbatim (moved from the
 * deleted edit page into the detail route, §12), every existing behaviour
 * applies unchanged: Zod/Conform validation, the resolved range bake, the
 * Planned-TSS recompute, and Generated-Session adoption
 * (`source: authored`). A rejected save (400) lands in §10's error language —
 * painted at its anchor, edit-to-clear — and each subsequent change re-posts,
 * so the server stays the source of truth without a client re-run of its rules.
 *
 * Submission detail: the sentence editor only exposes inputs for the tokens the
 * athlete can tap, so a submit of just the sentence would drop the fields it
 * never renders (block names, step kinds, strength sets). The whole prescription
 * stays in the form because the sentence editor renders the complete Conform
 * field tree as hidden carrier inputs (`HiddenBlockFields`, shared with the
 * create editor) — the sentence's `useInputControl` writes bind to those very
 * fields, so the form posts the full, lossless prescription through the
 * unchanged submission path. Only the top-level workout fields (title,
 * discipline, schedule) are mirrored here, with `HiddenField`.
 */
import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { formatDistance, formatDuration } from '#app/utils/format.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type ResolveContext } from '#app/utils/strength/anchors.ts'
import { type SessionDetail } from '#app/utils/training.server.ts'
import { FormSchema } from '#app/utils/workout-authoring.ts'
import { type ServerErrorRecord } from '#app/utils/workout-server-errors.ts'
import { type ExerciseItem } from './__exercise-combobox.tsx'
import { HiddenField, TokenSentenceEditor } from './__token-sentence-editor.tsx'

type WorkoutDetail = NonNullable<SessionDetail['workout']>

/**
 * The persisted workout as the create route's Conform default value — canonical
 * seconds/metres rendered back into the humane strings the form parses
 * (ADR 0023). Always `structured`: a stored session already has real Block/Step
 * structure to preserve.
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
					// The stored Load Target JSON travels as itself. Without it the save
					// answered `load: null` and the first autosave destroyed every load
					// the legacy pair cannot project — an `8RM`, a bodyweight set, a
					// percentage *range* (ADR 0056's warning, #461).
					load: set.load ?? '',
					weightKg: set.weightKg != null ? String(set.weightKg) : '',
					pct1RM: set.pct1RM != null ? String(set.pct1RM) : '',
					effortCap: set.effortCap ?? '',
					tempo: set.tempo ?? '',
				})),
			})),
		})),
	}
}

export type ScheduledWorkoutSentenceProps = {
	session: {
		id: string
		scheduledAt: Date | string
		workout: WorkoutDetail
	}
	thresholds: DisciplineThresholdMap
	/**
	 * The exercise catalogue, so a strength step's exercise token reads as the
	 * lift's **name**. The combobox names the selected id by finding it in this
	 * list, so an empty catalogue renders every named lift as an unfilled
	 * "Select exercise…" picker — the detail view has to hand it over exactly as
	 * the create route does.
	 */
	exercises: ExerciseItem[]
	/** Recently used exercise ids, grouped on top of that combobox. */
	recentExerciseIds: string[]
	/**
	 * This athlete's strength anchors per exercise id, as of the session's own
	 * day — what an authored `@ 85 % 1RM` resolves against. Resolved by the
	 * loader and handed in; the sentence never queries (ADR 0027).
	 */
	loadContexts: Record<string, ResolveContext>
	/**
	 * How many sets are already logged against each Step id of this prescription
	 * (ADR 0056). Read by {@link LoggedSetNotice}: an exercise slot with logged
	 * sets is **fixed**, and the athlete is told so before they tap rather than
	 * after their sets are gone.
	 */
	loggedSetsByStep: Record<string, number>
}

/**
 * Rapid ± nudges and keystrokes coalesce into one post: a committed change
 * schedules the autosave this far out, and a fresh change resets the timer, so
 * "5→10→15 min" in quick succession saves once, at 15 — immediate to the eye,
 * gentle on the server.
 */
export const AUTOSAVE_DEBOUNCE_MS = 600

/**
 * How long a save must be in flight before the quiet "saving…" indicator
 * appears (§1). A save that returns faster than this is silent — feedback is
 * the norm only when the network actually makes the athlete wait.
 */
const SAVE_HANG_MS = 2000

/**
 * The editable Token Sentence for a scheduled session, autosaving inline
 * through the detail route's workout-update action (§1). Token and structure
 * edits mutate the Conform draft; each committed change posts the whole
 * prescription to the detail route via a fetcher, so validation and
 * Generated-Session adoption come for free and the prescription re-renders from
 * the revalidated loader without a navigation.
 */
export function ScheduledWorkoutSentence({
	session,
	thresholds,
	exercises,
	recentExerciseIds,
	loadContexts,
	loggedSetsByStep,
}: ScheduledWorkoutSentenceProps) {
	const fetcher = useFetcher<{
		result: Parameters<typeof useForm>[0]['lastResult']
	}>()
	// Autosave posts to the detail route's own action — the standalone edit page
	// is gone (§1, §12), so the detail view saves through the route it already
	// lives on, tagged with the `update-workout` intent.
	const editAction = `/training/sessions/${session.id}`
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

	// Autosave-on-change (§1). The whole draft prescription serialized: a
	// committed token or structure edit is the only thing that changes it, so a
	// change here is exactly a change worth persisting. Revalidation after a
	// save leaves the draft untouched (Conform keeps form state by id, ignoring
	// the recomputed `defaultValue`), so a saved value never re-posts itself.
	const formRef = useRef<HTMLFormElement>(null)
	const snapshot = JSON.stringify(form.value ?? {})
	// Seeded with the persisted baseline so mount is not a change.
	const lastPosted = useRef(snapshot)
	useEffect(() => {
		if (snapshot === lastPosted.current) return
		const timer = setTimeout(() => {
			lastPosted.current = snapshot
			// Submit the form element itself so the full hidden field tree posts,
			// exactly as the removed Save button did — the fetcher carries it to
			// the edit action.
			if (formRef.current) void fetcher.submit(formRef.current)
		}, AUTOSAVE_DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [snapshot, fetcher])

	// The delayed "saving…" indicator (§1): silence until a save has actually
	// hung for ~2 s, then a quiet word — never a per-save spinner.
	const pending = fetcher.state !== 'idle'
	const [showSaving, setShowSaving] = useState(false)
	useEffect(() => {
		if (!pending) {
			setShowSaving(false)
			return
		}
		const timer = setTimeout(() => setShowSaving(true), SAVE_HANG_MS)
		return () => clearTimeout(timer)
	}, [pending])

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

	return (
		<fetcher.Form
			ref={formRef}
			{...getFormProps(form)}
			method="POST"
			action={editAction}
			className="relative"
		>
			{/* Routes the post to the detail action's workout-update branch (§1).
			    A dedicated control field — the form already carries the domain
			    `intent` (training intent), so the two must not share a name. */}
			<input type="hidden" name="saveWorkout" value="1" />
			{/* Top-level workout fields aren't token-editable here, but must still
			    round-trip so the action rebuilds the same workout. The Block/Step
			    field tree's hidden carriers are rendered by the sentence editor
			    itself (shared with the create editor). */}
			<HiddenField meta={fields.title} />
			<HiddenField meta={fields.discipline} />
			<HiddenField meta={fields.intent} />
			<HiddenField meta={fields.scheduledAtDate} />
			<HiddenField meta={fields.scheduledAtTime} />
			<HiddenField meta={fields.structure} />

			<div className="text-body-sm">
				<TokenSentenceEditor
					form={form}
					blocksField={fields.blocks}
					exercises={exercises}
					recentExerciseIds={recentExerciseIds}
					exerciseNames={exerciseNames}
					thresholds={thresholds}
					loadContexts={loadContexts}
					workoutDiscipline={
						(fields.discipline.value as string | undefined) ||
						workout.discipline
					}
					disciplineMeta={fields.discipline}
					// A rejected inline save paints §10's markings and summary on
					// the sentence; each subsequent save returns the full truth.
					// (The fetcher's data type loses the SubmissionResult shape in
					// serialization, so the error record is re-asserted here.)
					serverErrors={
						(
							fetcher.data?.result as
								| { error?: ServerErrorRecord | null }
								| null
								| undefined
						)?.error
					}
				/>
			</div>
			{/* Feedback is silence (§1): a successful autosave is not an event.
			    The single indicator is this quiet, delayed "saving…", shown only
			    once a save has actually hung ~2 s — announced politely for screen
			    readers, never a per-save spinner. Rejected saves render through the
			    sentence's own §10 validation summary — one error system on the
			    card, never two. Taken out of flow (mobile UI standard, #292): an
			    always-mounted reserve for a rare, transient message left a stray
			    empty region between the editor and the Workout Shape strip below,
			    making the strip read as detached; positioned, it stays aria-live
			    without holding a permanent gap. */}
			<p
				aria-live="polite"
				role="status"
				className="text-muted-foreground pointer-events-none absolute right-0 -bottom-5 text-xs"
			>
				{showSaving ? 'Saving…' : ''}
			</p>
			<LoggedSetNotice workout={workout} loggedSetsByStep={loggedSetsByStep} />
		</fetcher.Form>
	)
}

/**
 * What will happen to the sets already logged here, said **before** the athlete
 * changes anything.
 *
 * An exercise slot with logged sets against it is fixed: the save is refused
 * rather than allowed to delete the sets (the defect this replaced destroyed five
 * of them silently) and rather than allowed to re-point them at a lift the
 * athlete never did. Everything else about the step — its load, its reps, its
 * rest — stays editable, which is why this is one sentence about one token and
 * not a lock on the card.
 *
 * Absent when nothing is logged, which is the ordinary case for a scheduled
 * session: a warning nobody needs is chrome.
 */
function LoggedSetNotice({
	workout,
	loggedSetsByStep,
}: {
	workout: WorkoutDetail
	loggedSetsByStep: Record<string, number>
}) {
	const locked = workout.blocks.flatMap((block) =>
		block.steps.flatMap((step) => {
			const count = loggedSetsByStep[step.id] ?? 0
			if (count === 0) return []
			return [
				{
					id: step.id,
					count,
					name: step.exercise?.name ?? 'this exercise',
				},
			]
		}),
	)
	if (locked.length === 0) return null

	return (
		<ul className="text-muted-foreground text-body-xs mt-3 flex flex-col gap-1">
			{locked.map((step) => (
				<li key={step.id}>
					{step.count === 1 ? '1 set is' : `${step.count} sets are`} logged
					against {step.name}, so which exercise this is stays fixed — the
					numbers are still yours to edit. To make it a different lift, delete
					those sets first.
				</li>
			))}
		</ul>
	)
}
