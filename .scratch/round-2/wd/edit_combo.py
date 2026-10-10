import sys

p = sys.argv[1]
s = open(p).read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:80], s.count(old))
    s = s.replace(old, new)


rep("""import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import { cn } from '#app/utils/misc.tsx'
import { MUSCLE_GROUPS } from '#app/utils/workout-schema.ts'
""", """import {
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
""")
rep("""export function formatMuscleLabel(muscle: string) {
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
""", """/** A primary muscle's name in the picker (`labels.ts`). */
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
""")
rep("""				className={cn(
					'bg-input/50 focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] duration-200 outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
					!selected && 'text-muted-foreground',
				)}
			>
				<span className="line-clamp-1 flex-1 text-left">
					{selected ? selected.name : 'Select exercise…'}
				</span>""", """				className={cn(TRIGGER_CLASS, !selected && 'text-muted-foreground')}
			>
				<span className="line-clamp-1 flex-1 text-left">
					{selected ? selected.name : L.placeholder}
				</span>""")
rep("""						<CommandInput
							autoFocus
							placeholder="Search exercises…"
							value={query}
							onValueChange={setQuery}
							aria-label="Search exercises"
						/>
						{muscleOptions.length > 0 || equipmentOptions.length > 0 ? (
							<div className="flex flex-wrap gap-1 px-2 py-1.5">""", """						<CommandInput
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
							>""")
rep("""										label={formatEquipmentLabel(equipment)}""", """										label={nbEquipmentLabel(equipment)}""")
rep("""								<CommandEmpty>No exercises found.</CommandEmpty>""", """								<CommandEmpty>{L.empty}</CommandEmpty>""")
rep("""								<CommandGroup heading="Recent">""", """								<CommandGroup heading={L.recent}>""")
rep("""											<span className="text-muted-foreground text-xs">
												{formatMuscleLabel(ex.primaryMuscle)}
											</span>""", """											<span className="text-caption text-muted-foreground">
												{formatMuscleLabel(ex.primaryMuscle)}
											</span>""", count=2)
rep("""										recentExercises.length > 0 ? 'All exercises' : undefined""", """										recentExercises.length > 0 ? L.all : undefined""")
rep("""										<span className="flex-1">Create "{query.trim()}"…</span>""", """										<span className="flex-1">{L.create(query.trim())}</span>""")
rep("""						<div className="text-muted-foreground px-3 pt-2 text-xs font-medium">
							Primary muscle for "{createName}"
						</div>
						<CommandInput
							autoFocus
							placeholder="Search muscle groups…"
							aria-label="Search muscle groups"
						/>
						<CommandList>
							<CommandEmpty>No muscle groups found.</CommandEmpty>""", """						<div className="text-caption text-muted-foreground px-3 pt-2">
							{L.muscleFor(createName)}
						</div>
						<CommandInput
							autoFocus
							placeholder={L.muscleSearchPlaceholder}
							aria-label={L.muscleSearch}
							enterKeyHint="search"
						/>
						<CommandList>
							<CommandEmpty>{L.muscleEmpty}</CommandEmpty>""")
rep("""						<div className="flex items-center justify-between px-3 py-1.5">
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
							) : null}""", """						<div className="flex items-center justify-between px-1 py-1">
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
							) : null}""")
rep("""import { Icon } from '#app/components/ui/icon.tsx'
""", """import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
""")
open(p, 'w').write(s)
