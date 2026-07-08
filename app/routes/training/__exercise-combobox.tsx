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
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import { cn } from '#app/utils/misc.tsx'
import { MUSCLE_GROUPS } from '#app/utils/workout-schema.ts'

export type ExerciseItem = {
	id: string
	name: string
	primaryMuscle: string
	equipment: string | null
}

export function formatMuscleLabel(muscle: string) {
	return muscle.charAt(0).toUpperCase() + muscle.slice(1).replace('-', ' ')
}

function formatEquipmentLabel(equipment: string) {
	return equipment.charAt(0).toUpperCase() + equipment.slice(1)
}

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
		<button
			type="button"
			aria-pressed={pressed}
			onClick={onToggle}
			className={cn(
				'rounded-full border px-2 py-0.5 text-xs transition-colors',
				pressed
					? 'border-foreground/20 bg-foreground/10 text-foreground'
					: 'border-border text-muted-foreground hover:text-foreground',
			)}
		>
			{label}
		</button>
	)
}

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
				className={cn(
					'bg-input/50 focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] duration-200 outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
					!selected && 'text-muted-foreground',
				)}
			>
				<span className="line-clamp-1 flex-1 text-left">
					{selected ? selected.name : 'Select exercise…'}
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
							placeholder="Search exercises…"
							value={query}
							onValueChange={setQuery}
							aria-label="Search exercises"
						/>
						{muscleOptions.length > 0 || equipmentOptions.length > 0 ? (
							<div className="flex flex-wrap gap-1 px-2 py-1.5">
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
										label={formatEquipmentLabel(equipment)}
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
								<CommandEmpty>No exercises found.</CommandEmpty>
							) : null}
							{recentExercises.length > 0 ? (
								<CommandGroup heading="Recent">
									{recentExercises.map((ex) => (
										<CommandItem
											key={ex.id}
											value={`recent-${ex.id}`}
											data-checked={ex.id === value || undefined}
											onSelect={() => selectExercise(ex.id)}
										>
											<span className="flex-1">{ex.name}</span>
											<span className="text-muted-foreground text-xs">
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
										recentExercises.length > 0 ? 'All exercises' : undefined
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
											<span className="text-muted-foreground text-xs">
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
										<span className="flex-1">Create "{query.trim()}"…</span>
									</CommandItem>
								</CommandGroup>
							) : null}
						</CommandList>
					</Command>
				) : (
					<Command key="muscle-pick" loop>
						<div className="text-muted-foreground px-3 pt-2 text-xs font-medium">
							Primary muscle for "{createName}"
						</div>
						<CommandInput
							autoFocus
							placeholder="Search muscle groups…"
							aria-label="Search muscle groups"
						/>
						<CommandList>
							<CommandEmpty>No muscle groups found.</CommandEmpty>
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
						<div className="flex items-center justify-between px-3 py-1.5">
							<button
								type="button"
								onClick={() => setCreateName(null)}
								className="text-muted-foreground hover:text-foreground text-xs underline"
							>
								Back to search
							</button>
							{creating ? (
								<span className="text-muted-foreground text-xs">Saving…</span>
							) : createFetcher.data?.error ? (
								<span className="text-destructive text-xs">
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
