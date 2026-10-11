import React from 'react'
import { useFetcher } from 'react-router'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '#app/components/ui/command.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import { Toggle } from '#app/components/ui/toggle.tsx'
import {
	EXERCISE_PICKER_LABELS,
	nbEquipmentLabel,
	nbMuscleLabel,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { MUSCLE_GROUPS } from '#app/utils/workout-schema.ts'

const L = EXERCISE_PICKER_LABELS

export type ExerciseItem = {
	id: string
	name: string
	primaryMuscle: string
	equipment: string | null
}

/** A primary muscle's name in the picker (`labels.ts`). */
export function formatMuscleLabel(muscle: string) {
	return nbMuscleLabel(muscle)
}

/**
 * A filter chip: the design system's `Toggle` (`pressable`, an `after:` hit
 * area to ~44px, `aria-pressed`) as a pill. It was a hand-rolled 20px button
 * with `transition-colors` on the browser's curve (#505 round 2).
 */
function FilterChip({
	label,
	pressed,
	onToggle,
}: {
	label: string
	pressed: boolean
	onToggle: () => void
}) {
	return (
		<Toggle
			variant="outline"
			size="sm"
			pressed={pressed}
			onPressedChange={onToggle}
			className="text-caption aria-pressed:border-foreground/20 aria-pressed:text-foreground text-muted-foreground h-7 rounded-full px-2.5"
		>
			{label}
		</Toggle>
	)
}

/**
 * The closed picker looks and behaves like the shared select trigger
 * (`components/ui/select.tsx`, deviations D2/D5/D10): a real 44px, 16px text
 * on a phone so iOS never zooms, the luma control radius, and colour on the
 * app's press curve. It was `h-8` with `transition-[color,box-shadow]
 * duration-200` on the built-in curve — the same defect #505 S8 fixed in the
 * select. No scale: it owns a popup (`pressable`'s `aria-haspopup` rule).
 */
const TRIGGER_CLASS =
	'bg-input/50 focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 duration-press flex h-11 w-full items-center justify-between gap-1.5 rounded-3xl border border-transparent px-3 py-2 text-base whitespace-nowrap transition-[color,box-shadow,background-color] ease-out outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm'

/**
 * Searchable exercise picker for strength steps (ADR 0027 §8, PRD R8):
 * type-ahead over the exercise catalog, filter chips for primary muscle and
 * equipment, a "Recent" group derived by the route loader from the athlete's
 * recent strength steps, and an inline "Create …" row that posts to the
 * existing custom-exercise action and selects the result.
 *
 * Purely presentational with respect to form state: the selected exercise id
 * flows through `value`/`onChange`, which the caller binds to the Conform
 * `exerciseId` field via `useInputControl` — the submitted payload is
 * unchanged from the old flat Select.
 */
export function ExerciseCombobox({
	exercises,
	recentExerciseIds = [],
	value,
	onChange,
	id,
	invalid,
	onFocus,
	onBlur,
}: {
	exercises: ExerciseItem[]
	recentExerciseIds?: string[]
	value: string
	onChange: (exerciseId: string) => void
	id?: string
	invalid?: boolean
	onFocus?: () => void
	onBlur?: () => void
}) {
	const [open, setOpen] = React.useState(false)
	const [query, setQuery] = React.useState('')
	const [muscleFilter, setMuscleFilter] = React.useState<string | null>(null)
	const [equipmentFilter, setEquipmentFilter] = React.useState<string | null>(
		null,
	)
	// Inline create is a two-step flow inside the popover: the "Create …" row
	// captures the typed name, then the list swaps to a primary-muscle picker
	// (the action requires one — never guessed on the athlete's behalf).
	const [createName, setCreateName] = React.useState<string | null>(null)
	// Exercises created inline this visit — appended to the catalog client-side
	// so the new exercise is selectable without a reload.
	const [createdExercises, setCreatedExercises] = React.useState<
		ExerciseItem[]
	>([])
	const createFetcher = useFetcher<{
		exercise?: { id: string; name: string }
		error?: string
	}>()
	const pendingCreateRef = React.useRef<{
		name: string
		primaryMuscle: string
	} | null>(null)
	const onChangeRef = React.useRef(onChange)
	onChangeRef.current = onChange

	const allExercises = React.useMemo(() => {
		const extras = createdExercises.filter(
			(created) => !exercises.some((ex) => ex.id === created.id),
		)
		return [...exercises, ...extras]
	}, [exercises, createdExercises])

	React.useEffect(() => {
		const created = createFetcher.data?.exercise
		const pending = pendingCreateRef.current
		if (!created || !pending) return
		pendingCreateRef.current = null
		setCreatedExercises((prev) =>
			prev.some((ex) => ex.id === created.id)
				? prev
				: [
						...prev,
						{
							id: created.id,
							name: created.name,
							primaryMuscle: pending.primaryMuscle,
							equipment: null,
						},
					],
		)
		onChangeRef.current(created.id)
		setOpen(false)
	}, [createFetcher.data])

	const selected = allExercises.find((ex) => ex.id === value) ?? null

	const muscleOptions = React.useMemo(
		() =>
			[...new Set(allExercises.map((ex) => ex.primaryMuscle))].sort((a, b) =>
				a.localeCompare(b),
			),
		[allExercises],
	)
	const equipmentOptions = React.useMemo(
		() =>
			[
				...new Set(
					allExercises
						.map((ex) => ex.equipment)
						.filter((eq): eq is string => Boolean(eq)),
				),
			].sort((a, b) => a.localeCompare(b)),
		[allExercises],
	)

	const normalizedQuery = query.trim().toLowerCase()
	const filtered = allExercises.filter(
		(ex) =>
			(!normalizedQuery || ex.name.toLowerCase().includes(normalizedQuery)) &&
			(!muscleFilter || ex.primaryMuscle === muscleFilter) &&
			(!equipmentFilter || ex.equipment === equipmentFilter),
	)

	const recentExercises = recentExerciseIds
		.map((recentId) => filtered.find((ex) => ex.id === recentId))
		.filter((ex): ex is ExerciseItem => Boolean(ex))
	const otherExercises = filtered.filter(
		(ex) => !recentExercises.some((recent) => recent.id === ex.id),
	)

	const hasExactMatch = allExercises.some(
		(ex) => ex.name.toLowerCase() === normalizedQuery,
	)
	const showCreateRow = normalizedQuery.length > 0 && !hasExactMatch

	function resetTransientState() {
		setQuery('')
		setCreateName(null)
	}

	function selectExercise(exerciseId: string) {
		onChange(exerciseId)
		setOpen(false)
	}

	function submitCreate(primaryMuscle: string) {
		if (!createName) return
		pendingCreateRef.current = { name: createName, primaryMuscle }
		void createFetcher.submit(
			{ name: createName, primaryMuscle },
			{ method: 'post', action: '/training/exercises' },
		)
	}

	const creating = createFetcher.state !== 'idle'

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen)
				if (!nextOpen) resetTransientState()
			}}
		>
			<PopoverTrigger
				id={id}
				aria-invalid={invalid}
				onFocus={onFocus}
				onBlur={onBlur}
				className={cn(TRIGGER_CLASS, !selected && 'text-muted-foreground')}
			>
				<span className="line-clamp-1 flex-1 text-left">
					{selected ? selected.name : L.placeholder}
				</span>
				<Icon
					name="selector"
					className="text-muted-foreground pointer-events-none size-4"
					aria-hidden="true"
				/>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-0">
				{createName == null ? (
					<Command key="exercise-search" shouldFilter={false} loop>
						<CommandInput
							autoFocus
							placeholder={L.searchPlaceholder}
							value={query}
							onValueChange={setQuery}
							aria-label={L.search}
							enterKeyHint="search"
						/>
						{muscleOptions.length > 0 || equipmentOptions.length > 0 ? (
							<div
								role="group"
								aria-label={L.filters}
								className="flex flex-wrap gap-x-1.5 gap-y-2.5 px-2 py-2"
							>
								{muscleOptions.map((muscle) => (
									<FilterChip
										key={muscle}
										label={formatMuscleLabel(muscle)}
										pressed={muscleFilter === muscle}
										onToggle={() =>
											setMuscleFilter((current) =>
												current === muscle ? null : muscle,
											)
										}
									/>
								))}
								{equipmentOptions.map((equipment) => (
									<FilterChip
										key={equipment}
										label={nbEquipmentLabel(equipment)}
										pressed={equipmentFilter === equipment}
										onToggle={() =>
											setEquipmentFilter((current) =>
												current === equipment ? null : equipment,
											)
										}
									/>
								))}
							</div>
						) : null}
						<CommandList>
							{!showCreateRow ? (
								<CommandEmpty>{L.empty}</CommandEmpty>
							) : null}
							{recentExercises.length > 0 ? (
								<CommandGroup heading={L.recent}>
									{recentExercises.map((ex) => (
										<CommandItem
											key={ex.id}
											value={`recent-${ex.id}`}
											data-checked={ex.id === value || undefined}
											onSelect={() => selectExercise(ex.id)}
										>
											<span className="flex-1">{ex.name}</span>
											<span className="text-caption text-muted-foreground">
												{formatMuscleLabel(ex.primaryMuscle)}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
							) : null}
							{recentExercises.length > 0 && otherExercises.length > 0 ? (
								<CommandSeparator />
							) : null}
							{otherExercises.length > 0 ? (
								<CommandGroup
									heading={
										recentExercises.length > 0 ? L.all : undefined
									}
								>
									{otherExercises.map((ex) => (
										<CommandItem
											key={ex.id}
											value={ex.id}
											data-checked={ex.id === value || undefined}
											onSelect={() => selectExercise(ex.id)}
										>
											<span className="flex-1">{ex.name}</span>
											<span className="text-caption text-muted-foreground">
												{formatMuscleLabel(ex.primaryMuscle)}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
							) : null}
							{showCreateRow ? (
								<CommandGroup forceMount>
									<CommandItem
										value={`create-${normalizedQuery}`}
										forceMount
										onSelect={() => setCreateName(query.trim())}
									>
										<Icon name="plus" aria-hidden="true" />
										<span className="flex-1">{L.create(query.trim())}</span>
									</CommandItem>
								</CommandGroup>
							) : null}
						</CommandList>
					</Command>
				) : (
					<Command key="muscle-pick" loop>
						<div className="text-caption text-muted-foreground px-3 pt-2">
							{L.muscleFor(createName)}
						</div>
						<CommandInput
							autoFocus
							placeholder={L.muscleSearchPlaceholder}
							aria-label={L.muscleSearch}
							enterKeyHint="search"
						/>
						<CommandList>
							<CommandEmpty>{L.muscleEmpty}</CommandEmpty>
							<CommandGroup>
								{MUSCLE_GROUPS.map((muscle) => (
									<CommandItem
										key={muscle}
										value={muscle}
										disabled={creating}
										onSelect={() => submitCreate(muscle)}
									>
										{formatMuscleLabel(muscle)}
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
						<div className="flex items-center justify-between px-1 py-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setCreateName(null)}
							>
								{L.back}
							</Button>
							{creating ? (
								<span className="text-caption text-muted-foreground px-2">
									{L.saving}
								</span>
							) : createFetcher.data?.error ? (
								<span className="text-caption text-destructive px-2">
									{createFetcher.data.error}
								</span>
							) : null}
						</div>
					</Command>
				)}
			</PopoverContent>
		</Popover>
	)
}
