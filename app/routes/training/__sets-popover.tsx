/**
 * The strength sets popover — uniform-first (workout-editor spec §5.2, #256),
 * rendered inside the shared retargeting popover instrument (#252).
 *
 * When every set states the same thing (the common case) the popover mirrors
 * the set notation: `sets × reps @ load` as three inline controls — one
 * gesture per value. A kind select swaps the middle control between rep,
 * timed, and AMRAP sets; load is one field with a kg ⇄ %1RM toggle, mutually
 * exclusive as the schema's `weightXorPct` enforces. "Vary sets
 * individually ▸" expands to a per-set grid (quantity, load, ⧉ duplicate,
 * ✕ remove, ＋ add); mixed sets open directly expanded, and "◂ Collapse to
 * uniform" appears only when the sets are already equal — the uniform editor
 * never destroys authored variation (collapsing is a view switch, not a
 * rewrite). Rest-between-sets lives in the footer slot (G10): a stepper +
 * remove when set, "＋ rest between sets" when absent — rest lives with the
 * sets it separates, not in the step ⋮ menu.
 *
 * Two write paths, like the rest of the editor: per-set fields bind through
 * `useInputControl` (the always-mounted hidden inputs in the sentence carry
 * them on submit), while whole-list edits — the uniform mirror, add /
 * duplicate / remove, count resizes — go through the host's atomic `update`
 * intent (`mutate`), which reindexes `orderIndex` to array position. Unlike
 * the step-scoped structure actions, these do NOT close the popover: it is
 * anchored to the step's sets token, whose address the set-list mutations
 * never move.
 */
import { useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { formatDuration, parseDuration } from '#app/utils/format.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	normalizeSetKind,
	resizeUniformSets,
	SET_KIND_LABELS,
	setsAreUniform,
	switchUniformSetKind,
	uniformSetTemplate,
	type SetKind,
	type UniformSetTemplate,
} from '#app/utils/strength-sets.ts'
import { type DraftSetValue } from '#app/utils/workout-notation.ts'
import { EXERCISE_SET_KINDS } from '#app/utils/workout-schema.ts'
import { UnitToggle } from './__intensity-popover.tsx'
import {
	parseCount,
	parseSeconds,
	STEPPERS,
	TypeToEditStepper,
	useFieldControl,
	type FieldMeta,
	type StepperConfig,
} from './__token-editor-controls.tsx'

/** The quiet text-button treatment the popover's view/introduce affordances
 * share — ≥44 px tall, ink-muted until hovered (§2.3's quiet end). Exported
 * for the §6.1 neighbour add-links, which speak in the same register. */
export const QUIET_TEXT_BUTTON_CLASS =
	'text-muted-foreground hover:text-foreground focus-visible:ring-ring min-h-11 cursor-pointer rounded-sm px-1 text-sm outline-none focus-visible:ring-2'

// ——— Uniform-control codecs —————————————————————————————————————————————

const COUNT_STEPPER: StepperConfig = {
	parse: parseCount,
	serialize: String,
	display: String,
	inputMode: 'numeric',
	step: () => 1,
	min: 1,
	max: 99,
	start: 3,
}

const REPS_STEPPER: StepperConfig = {
	parse: parseCount,
	serialize: String,
	display: String,
	inputMode: 'numeric',
	step: () => 1,
	min: 1,
	max: 999,
	start: 5,
}

/** Timed sets store raw seconds but read and type as the humane duration form
 * (`45 s`, `1 min 30 s`) — the restSeconds codec's pattern. */
const TIMED_STEPPER: StepperConfig = {
	parse: parseSeconds,
	serialize: String,
	display: formatDuration,
	parseInput: parseDuration,
	inputMode: 'decimal',
	step: (sec) => (sec < 60 ? 5 : sec < 120 ? 15 : 30),
	min: 5,
	start: 30,
}

const LOAD_NUDGES: Record<
	'kg' | 'pct',
	{ step: number; start: number; max?: number }
> = {
	kg: { step: 2.5, start: 20 },
	pct: { step: 5, start: 70, max: 200 },
}

const parseLoad = (value: string) => {
	const n = Number(value)
	return Number.isFinite(n) && n > 0 ? n : null
}

/** A load number in the form the notation renders — `82.5`, never `82.50`. */
const displayLoad = (value: number) => String(value)

// ——— The editor ————————————————————————————————————————————————————————

export type StrengthSetsEditorProps = {
	/** The step's `sets` array field metadata — the per-set grid binds rows to
	 * its field list. */
	setsField: FieldMeta
	/** The step's `restBetweenSetsSec` field metadata — the footer slot. */
	restMeta: FieldMeta
	/** The live draft set values (from the form's `blocks` value tree). */
	draftSets: DraftSetValue[]
	/** The host's atomic set-list mutation (Conform `update` intent); it
	 * reindexes `orderIndex` and keeps the popover open. */
	mutate: (mutator: (sets: DraftSetValue[]) => void) => void
	/** The polite live region — committed changes announce in human words. */
	announce: (message: string) => void
}

export function StrengthSetsEditor({
	setsField,
	restMeta,
	draftSets,
	mutate,
	announce,
}: StrengthSetsEditorProps) {
	const template = uniformSetTemplate(draftSets)
	// Mixed sets open directly expanded (§5.2); the athlete's expand choice
	// then sticks for this popover visit (the body remounts per step address).
	const [varied, setVaried] = useState(() => template == null)

	return (
		<div className="flex flex-col gap-3" data-slot="sets-popover-editor">
			{!varied && template != null ? (
				<UniformSetsControls
					count={draftSets.length}
					template={template}
					mutate={mutate}
					announce={announce}
					onVary={() => setVaried(true)}
				/>
			) : (
				<VariedSetsGrid
					setsField={setsField}
					mutate={mutate}
					announce={announce}
					// The collapse affordance appears only when the sets are already
					// equal — it never destroys authored variation (§5.2).
					onCollapse={
						setsAreUniform(draftSets) ? () => setVaried(false) : undefined
					}
				/>
			)}
			<RestBetweenSetsFooter restMeta={restMeta} announce={announce} />
		</div>
	)
}

// ——— Uniform mirror — sets × reps @ load ————————————————————————————————

function UniformSetsControls({
	count,
	template,
	mutate,
	announce,
	onVary,
}: {
	count: number
	template: UniformSetTemplate
	mutate: StrengthSetsEditorProps['mutate']
	announce: (message: string) => void
	onVary: () => void
}) {
	function applyToAll(field: 'reps' | 'durationSec', serialized: string) {
		mutate((sets) => {
			for (const set of sets) set[field] = serialized
		})
	}

	function resize(serialized: string) {
		const next = Number(serialized)
		mutate((sets) => {
			sets.splice(0, sets.length, ...resizeUniformSets(sets, next))
		})
	}

	function switchKind(kind: SetKind) {
		mutate((sets) => {
			sets.splice(0, sets.length, ...switchUniformSetKind(sets, kind))
		})
		announce(`Sets are now ${SET_KIND_LABELS[kind].toLowerCase()}`)
	}

	return (
		<div className="flex flex-col gap-2">
			{/* The notation mirror: count × quantity — one gesture per value. */}
			<div className="flex items-center gap-1.5">
				<TypeToEditStepper
					label="sets"
					config={COUNT_STEPPER}
					rawValue={String(count)}
					announce={announce}
					onChange={resize}
					className="flex min-w-0 flex-1 items-center gap-1"
				/>
				<span aria-hidden className="text-muted-foreground shrink-0 px-0.5">
					×
				</span>
				{template.kind === 'reps' ? (
					<TypeToEditStepper
						key="reps"
						label="reps"
						config={REPS_STEPPER}
						rawValue={template.reps}
						announce={announce}
						onChange={(serialized) => applyToAll('reps', serialized)}
						className="flex min-w-0 flex-1 items-center gap-1"
					/>
				) : template.kind === 'timed' ? (
					<TypeToEditStepper
						key="timed"
						label="time per set"
						config={TIMED_STEPPER}
						rawValue={template.durationSec}
						announce={announce}
						onChange={(serialized) => applyToAll('durationSec', serialized)}
						className="flex min-w-0 flex-1 items-center gap-1"
					/>
				) : (
					<span className="text-foreground flex-1 text-center text-base font-semibold">
						AMRAP
					</span>
				)}
			</div>

			<div className="flex items-center gap-2">
				<span className="text-muted-foreground text-xs">of</span>
				<Select
					value={template.kind}
					onValueChange={(kind) =>
						switchKind(normalizeSetKind(kind ?? undefined))
					}
				>
					<SelectTrigger aria-label="Set kind" className="flex-1">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{EXERCISE_SET_KINDS.map((kind) => (
							<SelectItem key={kind} value={kind}>
								{SET_KIND_LABELS[normalizeSetKind(kind)]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<UniformLoadField
				template={template}
				mutate={mutate}
				announce={announce}
			/>

			<button
				type="button"
				onClick={onVary}
				className={cn(QUIET_TEXT_BUTTON_CLASS, 'self-start')}
			>
				Vary sets individually ▸
			</button>
		</div>
	)
}

/**
 * The uniform load: one field with the kg ⇄ %1RM toggle (§5.2). The units
 * are mutually exclusive — committing a value in one clears the other on
 * every set; toggling alone rewrites nothing (a kg number is never silently
 * restated as a percentage). Clearing the field removes the load honestly.
 */
function UniformLoadField({
	template,
	mutate,
	announce,
}: {
	template: UniformSetTemplate
	mutate: StrengthSetsEditorProps['mutate']
	announce: (message: string) => void
}) {
	const [unit, setUnit] = useState<'kg' | 'pct'>(() =>
		template.pct1RM && !template.weightKg ? 'pct' : 'kg',
	)
	const committed = unit === 'kg' ? template.weightKg : template.pct1RM
	const [text, setText] = useState(committed)
	const parsed = parseLoad(text)
	const nudges = LOAD_NUDGES[unit]

	function commit(raw: string) {
		mutate((sets) => {
			for (const set of sets) {
				set.weightKg = unit === 'kg' ? raw : ''
				set.pct1RM = unit === 'pct' ? raw : ''
			}
		})
		announce(
			raw
				? `Load set to ${raw}${unit === 'kg' ? ' kg' : '% 1RM'}`
				: 'Load removed',
		)
	}

	function handleTyped(nextText: string) {
		setText(nextText)
		if (!nextText.trim()) return commit('')
		const value = parseLoad(nextText)
		if (value == null) return
		if (nudges.max != null && value > nudges.max) return
		commit(displayLoad(value))
	}

	function nudgeTo(value: number) {
		setText(displayLoad(value))
		commit(displayLoad(value))
	}

	return (
		<div className="flex items-center gap-1.5">
			<span aria-hidden className="text-muted-foreground shrink-0 px-0.5">
				@
			</span>
			<Button
				type="button"
				variant="outline"
				aria-label="Decrease load"
				disabled={parsed == null || parsed <= nudges.step}
				onClick={() =>
					parsed != null && nudgeTo(Math.max(nudges.step, parsed - nudges.step))
				}
				className="size-11 shrink-0 rounded-lg text-lg"
			>
				−
			</Button>
			<input
				type="text"
				inputMode="decimal"
				aria-label={unit === 'kg' ? 'Load kg' : 'Load %1RM'}
				placeholder="—"
				value={text}
				onChange={(event) => handleTyped(event.target.value)}
				className="border-input bg-background focus-visible:ring-ring h-11 w-full min-w-0 flex-1 rounded-lg border px-2 text-center text-base font-medium tabular-nums outline-none focus-visible:ring-2"
			/>
			<Button
				type="button"
				variant="outline"
				aria-label="Increase load"
				disabled={nudges.max != null && parsed != null && parsed >= nudges.max}
				onClick={() =>
					nudgeTo(
						parsed == null
							? nudges.start
							: nudges.max != null
								? Math.min(nudges.max, parsed + nudges.step)
								: parsed + nudges.step,
					)
				}
				className="size-11 shrink-0 rounded-lg text-lg"
			>
				+
			</Button>
			<UnitToggle
				label="Load unit"
				options={[
					{ id: 'kg', label: 'kg' },
					{ id: 'pct', label: '%1RM' },
				]}
				active={unit}
				onSelect={(id) => {
					if (id === unit) return
					setUnit(id as 'kg' | 'pct')
					// Show the other unit's own last-authored value; nothing rewrites
					// until the athlete commits a number in the new unit.
					setText(id === 'kg' ? template.weightKg : template.pct1RM)
				}}
			/>
		</div>
	)
}

// ——— The per-set grid ———————————————————————————————————————————————————

function VariedSetsGrid({
	setsField,
	mutate,
	announce,
	onCollapse,
}: {
	setsField: FieldMeta
	mutate: StrengthSetsEditorProps['mutate']
	announce: (message: string) => void
	onCollapse?: () => void
}) {
	const setList = setsField.getFieldList() as FieldMeta[]

	return (
		<div className="flex flex-col gap-2">
			{onCollapse ? (
				<button
					type="button"
					onClick={onCollapse}
					className={cn(QUIET_TEXT_BUTTON_CLASS, 'self-start')}
				>
					◂ Collapse to uniform
				</button>
			) : null}
			<div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
				{setList.map((setField, index) => (
					<SetGridRow
						key={setField.key}
						setField={setField}
						index={index}
						onDuplicate={() => {
							mutate((sets) => {
								const source = sets[index]
								if (!source) return
								sets.splice(index + 1, 0, { ...source })
							})
							announce(`Set ${index + 1} duplicated`)
						}}
						onRemove={
							setList.length > 1
								? () => {
										mutate((sets) => {
											sets.splice(index, 1)
										})
										announce(`Set ${index + 1} removed`)
									}
								: undefined
						}
					/>
				))}
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="self-start"
				onClick={() => {
					mutate((sets) => {
						const last = sets[sets.length - 1]
						sets.push(last ? { ...last } : { kind: 'reps', reps: '5' })
					})
					announce('Set added')
				}}
			>
				＋ add set
			</Button>
		</div>
	)
}

function SetGridRow({
	setField,
	index,
	onDuplicate,
	onRemove,
}: {
	setField: FieldMeta
	index: number
	onDuplicate: () => void
	onRemove?: () => void
}) {
	const setFs = setField.getFieldset()
	const kind = useFieldControl(setFs.kind)
	const reps = useFieldControl(setFs.reps)
	const durationSec = useFieldControl(setFs.durationSec)
	const weightKg = useFieldControl(setFs.weightKg)
	const pct1RM = useFieldControl(setFs.pct1RM)
	const setKind = normalizeSetKind(
		typeof kind.value === 'string' ? kind.value : undefined,
	)
	const num = (c: ReturnType<typeof useFieldControl>) =>
		typeof c.value === 'string' ? c.value : ''
	const inputClass =
		'border-input bg-background focus-visible:ring-ring h-11 w-full min-w-0 rounded-lg border px-2 text-center text-base font-medium tabular-nums outline-none focus-visible:ring-2'

	// kg and %1RM are mutually exclusive per set (schema `weightXorPct`): the UI
	// enforces it by clearing the other field the moment one is given a value,
	// so the athlete can never author both. Server Zod stays the safety net.
	function changeWeight(value: string) {
		weightKg.change(value)
		if (value.trim()) pct1RM.change('')
	}
	function changePct(value: string) {
		pct1RM.change(value)
		if (value.trim()) weightKg.change('')
	}

	return (
		<div
			data-slot="set-grid-row"
			className="border-border/70 flex flex-col gap-1.5 rounded-lg border p-2"
		>
			<div className="flex items-center gap-1.5">
				<span className="text-body-2xs text-muted-foreground w-4 shrink-0 font-mono font-semibold tabular-nums">
					{index + 1}
				</span>
				<Select value={setKind} onValueChange={(value) => kind.change(value)}>
					<SelectTrigger
						aria-label={`Set ${index + 1} kind`}
						className="flex-1"
						onFocus={() => kind.focus()}
						onBlur={() => kind.blur()}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{EXERCISE_SET_KINDS.map((k) => (
							<SelectItem key={k} value={k}>
								{SET_KIND_LABELS[normalizeSetKind(k)]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					type="button"
					variant="ghost"
					aria-label={`Duplicate set ${index + 1}`}
					title="Duplicate"
					onClick={onDuplicate}
					className="size-11 shrink-0"
				>
					⧉
				</Button>
				<Button
					type="button"
					variant="ghost"
					aria-label={`Remove set ${index + 1}`}
					title="Remove"
					disabled={onRemove == null}
					onClick={onRemove}
					className="text-destructive size-11 shrink-0 disabled:opacity-30"
				>
					✕
				</Button>
			</div>
			<div className="flex items-center gap-1.5 pl-[calc(--spacing(4)+--spacing(1.5))]">
				{setKind === 'reps' ? (
					<input
						type="number"
						min={1}
						inputMode="numeric"
						aria-label={`Set ${index + 1} reps`}
						placeholder="reps"
						value={num(reps)}
						onChange={(event) => reps.change(event.target.value)}
						className={cn(inputClass, 'flex-1')}
					/>
				) : setKind === 'timed' ? (
					<input
						type="number"
						min={1}
						inputMode="numeric"
						aria-label={`Set ${index + 1} seconds`}
						placeholder="secs"
						value={num(durationSec)}
						onChange={(event) => durationSec.change(event.target.value)}
						className={cn(inputClass, 'flex-1')}
					/>
				) : (
					<span className="text-muted-foreground flex-1 text-center text-sm">
						AMRAP
					</span>
				)}
				<span aria-hidden className="text-muted-foreground/70">
					@
				</span>
				<input
					type="number"
					min={0}
					step={0.5}
					inputMode="decimal"
					placeholder="kg"
					aria-label={`Set ${index + 1} kg`}
					value={num(weightKg)}
					onChange={(event) => changeWeight(event.target.value)}
					className={cn(inputClass, 'flex-1')}
				/>
				<input
					type="number"
					min={0}
					max={200}
					inputMode="numeric"
					placeholder="%1RM"
					aria-label={`Set ${index + 1} %1RM`}
					value={num(pct1RM)}
					onChange={(event) => changePct(event.target.value)}
					className={cn(inputClass, 'flex-1')}
				/>
			</div>
		</div>
	)
}

// ——— Rest-between-sets — the footer slot (G10) ——————————————————————————

/**
 * Rest lives with the sets it separates: a stepper + remove when set, a quiet
 * "＋ rest between sets" when absent. Writes go straight to the step's
 * `restBetweenSetsSec` field (raw seconds) — the same field the line's
 * `· … rest` token edits through the shared popover.
 */
function RestBetweenSetsFooter({
	restMeta,
	announce,
}: {
	restMeta: FieldMeta
	announce: (message: string) => void
}) {
	const control = useFieldControl(restMeta)
	const rawValue = typeof restMeta.value === 'string' ? restMeta.value : ''
	const isSet = parseSeconds(rawValue) != null

	return (
		<div
			data-slot="rest-between-sets-footer"
			className="border-border/60 border-t pt-2"
		>
			{isSet ? (
				<div className="flex flex-col gap-1">
					<span className="text-muted-foreground text-xs">
						rest between sets
					</span>
					<div className="flex items-center gap-1.5">
						<TypeToEditStepper
							// The line's `· … rest` token and this footer edit the same
							// field with the same codec, so they always agree.
							key={rawValue === '' ? 'empty' : 'set'}
							label="rest between sets"
							config={STEPPERS.restSeconds}
							rawValue={rawValue}
							announce={announce}
							onChange={(value) => control.change(value)}
							className="flex min-w-0 flex-1 items-center gap-1.5"
						/>
						<Button
							type="button"
							variant="ghost"
							aria-label="Remove rest between sets"
							title="Remove rest"
							onClick={() => {
								control.change('')
								announce('Rest between sets removed')
							}}
							className="text-destructive size-11 shrink-0"
						>
							✕
						</Button>
					</div>
				</div>
			) : (
				<button
					type="button"
					onClick={() => {
						control.change(String(STEPPERS.restSeconds.start))
						announce(
							`Rest between sets set to ${STEPPERS.restSeconds.display(
								STEPPERS.restSeconds.start,
							)}`,
						)
					}}
					className={QUIET_TEXT_BUTTON_CLASS}
				>
					＋ rest between sets
				</button>
			)}
		</div>
	)
}
