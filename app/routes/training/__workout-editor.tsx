/**
 * The shared workout structure editor (ADR 0027, R5; workout-editor spec §0).
 * The **Token Sentence is the sole authoring surface** — the classic
 * nested-fieldset step form that once lived beside it is deleted (spec §12).
 * One component owns the whole Block/Step authoring card so the create route
 * (and, through `TokenSentenceEditor`, the detail view) render exactly the same
 * editor and can never drift.
 *
 * The card is just two things now: the editable Token Sentence, and beneath it
 * the live Workout Shape strip derived from the same draft. The route keeps its
 * loader/action framing and the top-level workout fields (title, discipline,
 * intent, schedule); everything structural lives here. A new session starts
 * from the honest-empty composition (§11), so there is no simple/structured
 * toggle. The Zod `FormSchema` still accepts the legacy simple shape for
 * compatibility, but the UI no longer produces it.
 */
import { useMemo } from 'react'
import { ShapeStrip } from '#app/components/shape-strip.tsx'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { deriveShapeStrip } from '#app/utils/shape-strip.ts'
import {
	type DraftBlockValue,
	draftToNotationInput,
} from '#app/utils/workout-notation.ts'
import { type ServerErrorRecord } from '#app/utils/workout-server-errors.ts'
import { type ExerciseItem } from './__exercise-combobox.tsx'
import { TokenSentenceEditor } from './__token-sentence-editor.tsx'

// Conform metadata is typed loosely here, matching the sibling form modules
// (`__token-sentence-editor.tsx`, `__workout-detail-editor.tsx`): the editor
// only reads names/keys/values and dispatches intents, so the generics add
// noise without safety.
type FieldMeta = any
type FormMeta = any

/**
 * The athlete's per-discipline profile as the editor consumes it — enough for
 * the intensity resolver to derive zone/bpm/pace facets. Mirrors the loader's
 * `athleteProfile.disciplineProfiles` row shape.
 */
export type DisciplineProfileShape = {
	discipline: string
	zoneSystem: string | null
	zoneOverrides: string | null
	lthr: number | null
	maxHr: number | null
	ftp: number | null
	runPowerThresholdW: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
}

export type WorkoutStructureEditorProps = {
	/** The Conform form metadata — dispatches list/structure intents. */
	form: FormMeta
	/** The `blocks` array field metadata from the same form. */
	blocksField: FieldMeta
	/** The workout discipline, so steps that inherit it resolve facets. */
	workoutDiscipline: string
	/** The header discipline field — the §11 strength seed flips it. */
	disciplineMeta?: FieldMeta
	/** The exercise catalog for the strength step combobox / name tokens. */
	exercises: ExerciseItem[]
	/** Recently used exercise ids, grouped on top of the combobox. */
	recentExerciseIds?: string[]
	/** Athlete discipline profiles — feed the intensity picker and facets. */
	disciplineProfiles?: DisciplineProfileShape[]
	/** The last rejected save's error record (`SubmissionResult['error']`) —
	 * paints spec §10's markings and summary line on the Token Sentence. */
	serverErrors?: ServerErrorRecord | null
}

/**
 * The whole Block/Step editing surface for the create route: the editable Token
 * Sentence over the live Workout Shape strip. The sentence's `useInputControl`
 * writes and Conform field-list intents drive the same field tree the action
 * reads, so the submitted form data is lossless.
 */
export function WorkoutStructureEditor({
	form,
	blocksField,
	workoutDiscipline,
	disciplineMeta,
	exercises,
	recentExerciseIds = [],
	disciplineProfiles = [],
	serverErrors,
}: WorkoutStructureEditorProps) {
	// The Token Sentence editor derives the notation live from the draft form
	// values; exercise names and thresholds keep strength/intensity tokens
	// truthful. Memoized: loader data is stable per navigation.
	const exerciseNames = useMemo(
		() =>
			Object.fromEntries(
				exercises.map((exercise) => [exercise.id, exercise.name]),
			),
		[exercises],
	)
	const thresholds = useMemo<DisciplineThresholdMap>(
		() =>
			Object.fromEntries(
				disciplineProfiles.map((profile) => [profile.discipline, profile]),
			),
		[disciplineProfiles],
	)

	// The live Workout Shape strip (spec §8): the draft form values feed the
	// shared notation adapter straight into the honest strip derivation, so the
	// preview re-renders on every token edit and never paints anything the
	// draft doesn't state — no intent fallback, no fabricated bar. Reading
	// `blocksField.value` (not the field list) is what keeps it live — Conform
	// re-renders on every write.
	const draftBlocks = (blocksField.value ?? []) as DraftBlockValue[]
	const shapeSegments = deriveShapeStrip(
		draftToNotationInput(draftBlocks, { exerciseNames, workoutDiscipline }),
		{ thresholds },
	)

	return (
		<div className="space-y-4">
			{/* The editable Token Sentence: the draft rendered as tappable notation —
			    the sole authoring surface (§0). */}
			<div className="border-border/70 bg-muted/20 rounded-lg border p-3">
				<TokenSentenceEditor
					form={form}
					blocksField={blocksField}
					exercises={exercises}
					recentExerciseIds={recentExerciseIds}
					exerciseNames={exerciseNames}
					thresholds={thresholds}
					workoutDiscipline={workoutDiscipline}
					disciplineMeta={disciplineMeta}
					serverErrors={serverErrors}
				/>
			</div>

			{/* The live Workout Shape strip, derived from the draft above. Lean and
			    honest (§8.1): no axis, legend, captions or bracket rail, and with
			    zero paintable steps the region is entirely absent. */}
			{shapeSegments.length > 0 ? (
				<div
					data-testid="editor-workout-shape"
					className="border-border/70 bg-muted/20 rounded-lg border p-3"
				>
					<ShapeStrip segments={shapeSegments} />
				</div>
			) : null}
		</div>
	)
}
