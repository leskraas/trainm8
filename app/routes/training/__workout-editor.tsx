/**
 * The shared workout structure editor (ADR 0027, R5 — slice 6/9). One
 * component owns the entire Block/Step authoring surface — the editable Token
 * Sentence plus the classic per-step field groups and the block/step
 * add/remove/reorder controls — so the create route and the edit route render
 * exactly the same editor and can never drift. Previously this was ~540 lines
 * of JSX duplicated between `sessions.new.tsx` and `upcoming.$sessionId.edit.tsx`.
 *
 * The routes keep only their loader/action framing and the top-level workout
 * fields (title, discipline, intent, schedule); everything structural lives
 * here. The simple/structured toggle is gone: a new session starts as a single
 * one-step sentence, so the editor is always the structured one. The Zod
 * `FormSchema` still accepts the legacy simple shape for compatibility, but the
 * UI no longer produces it.
 */
import { getInputProps } from '@conform-to/react'
import { useMemo } from 'react'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { ShapeStrip } from '#app/components/shape-strip.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { deriveShapeStrip } from '#app/utils/shape-strip.ts'
import {
	type DraftBlockValue,
	draftToNotationInput,
} from '#app/utils/workout-notation.ts'
import { STEP_KINDS, type StepKind } from '#app/utils/workout-schema.ts'
import { type ServerErrorRecord } from '#app/utils/workout-server-errors.ts'
import { TokenSentenceEditor } from './__token-sentence-editor.tsx'
import {
	CardioStepFields,
	type DisciplineProfileShape,
	emptyBlock,
	emptyStep,
	type ExerciseItem,
	RestStepFields,
	STEP_KIND_LABELS,
	StrengthStepFields,
} from './__workout-step-fields.tsx'

// Conform metadata is typed loosely here, matching the existing form modules
// (`__workout-step-fields.tsx`, `__token-sentence-editor.tsx`): the editor only
// reads names/keys/values and dispatches intents, so the generics add noise
// without safety.
type FieldMeta = any
type FormMeta = any

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
 * The full Block/Step editing surface, shared by the create and edit routes.
 * Renders the editable Token Sentence over the classic field editor; both
 * mutate the same Conform field tree, so a token edit and the equivalent field
 * edit submit identical form data.
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
	const blockList = blocksField.getFieldList()

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
			{/* The editable Token Sentence: the draft rendered as tappable
			    notation, above the classic field editor that edits the same fields. */}
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

			<h2 className="text-body-sm font-semibold">Blocks</h2>
			{blockList.map((blockField: FieldMeta, blockIndex: number) => {
				const blockFields = blockField.getFieldset()
				const stepList = blockFields.steps.getFieldList()

				return (
					<div
						key={blockField.key}
						className="border-border/70 space-y-4 rounded-lg border p-4"
					>
						<div className="flex items-center justify-between gap-2">
							<span className="text-body-xs text-muted-foreground font-medium">
								Block {blockIndex + 1}
							</span>
							<div className="flex gap-1">
								{blockIndex > 0 ? (
									<Button
										type="submit"
										variant="outline"
										size="sm"
										{...form.reorder.getButtonProps({
											name: blocksField.name,
											from: blockIndex,
											to: blockIndex - 1,
										})}
										aria-label={`Move block ${blockIndex + 1} up`}
									>
										↑
									</Button>
								) : null}
								{blockIndex < blockList.length - 1 ? (
									<Button
										type="submit"
										variant="outline"
										size="sm"
										{...form.reorder.getButtonProps({
											name: blocksField.name,
											from: blockIndex,
											to: blockIndex + 1,
										})}
										aria-label={`Move block ${blockIndex + 1} down`}
									>
										↓
									</Button>
								) : null}
								{blockList.length > 1 ? (
									<Button
										type="submit"
										variant="outline"
										size="sm"
										{...form.remove.getButtonProps({
											name: blocksField.name,
											index: blockIndex,
										})}
										aria-label={`Remove block ${blockIndex + 1}`}
									>
										Remove block
									</Button>
								) : null}
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<Field
								labelProps={{ children: 'Block name (optional)' }}
								inputProps={{
									...getInputProps(blockFields.name, {
										type: 'text',
									}),
									placeholder: 'e.g. Warm-up',
									maxLength: 60,
								}}
								errors={blockFields.name.errors as string[] | undefined}
							/>
							<Field
								labelProps={{ children: 'Repeat count' }}
								inputProps={{
									...getInputProps(blockFields.repeatCount, {
										type: 'number',
									}),
									min: 1,
								}}
								errors={blockFields.repeatCount.errors as string[] | undefined}
							/>
						</div>

						<div className="space-y-3">
							{stepList.map((stepField: FieldMeta, stepIndex: number) => {
								const sf = stepField.getFieldset()
								const currentKind = (sf.kind.value || 'cardio') as StepKind

								return (
									<fieldset
										key={stepField.key}
										className="border-border/70 bg-muted/30 rounded-lg border p-4"
									>
										<legend className="text-body-2xs text-muted-foreground px-1 font-medium">
											Step {stepIndex + 1}
										</legend>
										<div className="space-y-3">
											<SelectField
												meta={sf.kind}
												labelProps={{
													children: 'Kind',
													className:
														'text-body-2xs text-muted-foreground font-medium',
												}}
												items={STEP_KINDS.map((k) => ({
													value: k,
													label: STEP_KIND_LABELS[k],
												}))}
												errors={sf.kind.errors as string[] | undefined}
											/>

											{currentKind === 'cardio' ? (
												<CardioStepFields
													sf={sf}
													disciplineProfiles={disciplineProfiles}
													workoutDiscipline={workoutDiscipline}
												/>
											) : currentKind === 'strength' ? (
												<StrengthStepFields sf={sf} />
											) : (
												<RestStepFields sf={sf} />
											)}

											<div className="flex items-center gap-2">
												{stepIndex > 0 ? (
													<Button
														type="submit"
														variant="outline"
														size="sm"
														{...form.reorder.getButtonProps({
															name: blockFields.steps.name,
															from: stepIndex,
															to: stepIndex - 1,
														})}
														aria-label={`Move step ${stepIndex + 1} up`}
													>
														↑
													</Button>
												) : null}
												{stepIndex < stepList.length - 1 ? (
													<Button
														type="submit"
														variant="outline"
														size="sm"
														{...form.reorder.getButtonProps({
															name: blockFields.steps.name,
															from: stepIndex,
															to: stepIndex + 1,
														})}
														aria-label={`Move step ${stepIndex + 1} down`}
													>
														↓
													</Button>
												) : null}
												{stepList.length > 1 ? (
													<Button
														type="submit"
														variant="outline"
														size="sm"
														{...form.remove.getButtonProps({
															name: blockFields.steps.name,
															index: stepIndex,
														})}
														aria-label={`Remove step ${stepIndex + 1}`}
													>
														Remove
													</Button>
												) : null}
											</div>
										</div>
									</fieldset>
								)
							})}
							<div className="flex gap-2">
								<Button
									type="submit"
									variant="outline"
									size="sm"
									{...form.insert.getButtonProps({
										name: blockFields.steps.name,
										defaultValue: emptyStep(),
									})}
								>
									+ Add Step
								</Button>
							</div>
							<ErrorList
								errors={blockFields.steps.errors as string[] | undefined}
							/>
						</div>
					</div>
				)
			})}
			<div className="flex gap-2">
				<Button
					type="submit"
					variant="outline"
					size="sm"
					{...form.insert.getButtonProps({
						name: blocksField.name,
						defaultValue: emptyBlock(),
					})}
				>
					+ Add Block
				</Button>
			</div>
			<ErrorList errors={blocksField.errors as string[] | undefined} />
		</div>
	)
}
