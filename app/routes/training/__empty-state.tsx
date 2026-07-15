/**
 * The empty state — honest-empty with canonical seeds (workout-editor spec
 * §11, #260). A session with zero steps renders this dedicated composition
 * instead of the stanza: nothing is fabricated (no implicit default workout,
 * no stanza chrome anchored to nothing, no strip), and the way in is an
 * explicit choice — one of three fixed archetype seeds lying in the open as
 * tappable ghost-notation lines, or "or start from scratch ＋" opening §4.1's
 * three-row kind chooser.
 *
 * The seeds are hardcoded — not templates, no data-model touch, never the
 * athlete's own Workout Templates (Direction 3 stays out of scope). Their
 * quantities are fixed; discipline inherits from the session header, except
 * the strength seed, which sets the header to strength. The composition is a
 * pure function of "zero steps": a brand-new session and one emptied out by
 * deleting everything render exactly the same thing.
 */
import { type ReactNode } from 'react'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx'
import { cn } from '#app/utils/misc.tsx'
import { emptySet, emptyStep } from '#app/utils/workout-authoring.ts'
import { type DraftBlockValue } from '#app/utils/workout-notation.ts'
import {
	STEP_KIND_LABELS,
	STEP_KINDS,
	type StepKind,
} from '#app/utils/workout-schema.ts'

/** The seed hint each kind-chooser row carries (§4.1) — shared by the line's
 * ＋ chooser, the ⠿ Add-step submenu, and the scratch chooser here. */
export const STEP_KIND_HINTS: Record<StepKind, string> = {
	cardio: 'starts as 10 min',
	strength: 'starts as an exercise, 1 × 5',
	rest: 'starts as 1 min of recovery',
}

/**
 * The three-row kind chooser's rows (§4.1, G5): Cardio · Strength · Rest,
 * each with its seed hint, so a step kind is always chosen, never assumed.
 */
export function KindChooserItems({
	onChoose,
}: {
	onChoose: (kind: StepKind) => void
}) {
	return (
		<>
			{STEP_KINDS.map((kind) => (
				<DropdownMenuItem key={kind} onClick={() => onChoose(kind)}>
					<span className="flex flex-col">
						<span className="font-medium">{STEP_KIND_LABELS[kind]}</span>
						<span className="text-muted-foreground text-xs">
							{STEP_KIND_HINTS[kind]}
						</span>
					</span>
				</DropdownMenuItem>
			))}
		</>
	)
}

// ——— The archetype seeds —————————————————————————————————————————————————

/** The intensity field's canonical authored form for a zone label. */
function zoneIntensity(label: string): string {
	return JSON.stringify({ kind: 'zoneLabel', label })
}

function cardioStep(duration: string, intensity = '') {
	return { ...emptyStep(), duration, intensity }
}

/** `count` uniform rep sets — collapses to `count × reps` in set notation. */
function repsSets(count: number, reps: number) {
	return Array.from({ length: count }, (_, index) => ({
		...emptySet(),
		orderIndex: String(index),
		reps: String(reps),
	}))
}

/** One ghost-notation line, mirroring the stanza line the seed materializes:
 * an optional gutter badge (`4×`) and the notation text. */
export type GhostLine = { badge?: string; text: string }

export type ArchetypeSeed = {
	id: 'easy' | 'intervals' | 'strength'
	/** The quiet human name above the ghost notation. */
	name: string
	lines: GhostLine[]
	/** Choosing this seed sets the header discipline (the strength seed). */
	discipline?: 'strength'
	/** The draft blocks the seed materializes — fresh objects per call. */
	blocks: () => DraftBlockValue[]
}

/**
 * The three fixed archetype seeds (§11.3), teaching the notation before the
 * first tap. Quantities are fixed; cardio seeds inherit the header
 * discipline by leaving the step discipline blank.
 */
export const ARCHETYPE_SEEDS: ArchetypeSeed[] = [
	{
		id: 'easy',
		name: 'Easy session',
		lines: [{ text: '45 min @ easy' }],
		blocks: () => [
			{
				name: '',
				repeatCount: '1',
				steps: [cardioStep('45 min', zoneIntensity('easy'))],
			},
		],
	},
	{
		id: 'intervals',
		name: 'Intervals',
		lines: [
			{ text: '15 min' },
			{ badge: '4×', text: '4 min @ threshold ( 2 min rest )' },
			{ text: '10 min' },
		],
		blocks: () => [
			{ name: 'Warm-up', repeatCount: '1', steps: [cardioStep('15 min')] },
			{
				name: '',
				repeatCount: '4',
				steps: [
					cardioStep('4 min', zoneIntensity('threshold')),
					{ ...emptyStep(), kind: 'rest', duration: '2 min' },
				],
			},
			{ name: 'Cool-down', repeatCount: '1', steps: [cardioStep('10 min')] },
		],
	},
	{
		id: 'strength',
		name: 'Strength session',
		discipline: 'strength',
		lines: [{ text: 'exercise 3 × 8 → exercise 3 × 5' }],
		blocks: () => [
			{
				name: '',
				repeatCount: '1',
				steps: [
					{ ...emptyStep(), kind: 'strength', sets: repsSets(3, 8) },
					{ ...emptyStep(), kind: 'strength', sets: repsSets(3, 5) },
				],
			},
		],
	},
]

// ——— The composition —————————————————————————————————————————————————————

const SCRATCH_TRIGGER_CLASS =
	'text-muted-foreground hover:bg-accent hover:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground focus-visible:ring-ring cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-2'

/**
 * The zero-step composition (§11.2): three seed buttons — native tab stops
 * whose accessible names read the human name plus the notation they
 * materialize (§9) — and the scratch chooser beneath. No ⠿/⋮ marks, no
 * strip: nothing here pretends a workout exists.
 */
export function WorkoutEmptyState({
	onSeed,
	onStartFromScratch,
}: {
	onSeed: (seed: ArchetypeSeed) => void
	onStartFromScratch: (kind: StepKind) => void
}) {
	return (
		<div data-workout-empty-state className="flex flex-col items-start gap-1">
			{ARCHETYPE_SEEDS.map((seed) => (
				<button
					key={seed.id}
					type="button"
					data-seed={seed.id}
					onClick={() => onSeed(seed)}
					className="hover:bg-accent/40 focus-visible:ring-ring group flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2"
				>
					<span className="text-muted-foreground group-hover:text-foreground text-xs font-medium">
						{seed.name}
					</span>
					{seed.lines.map((line, index) => (
						<GhostNotationLine key={index} line={line} />
					))}
				</button>
			))}
			<DropdownMenu>
				<DropdownMenuTrigger
					data-start-from-scratch
					className={cn(SCRATCH_TRIGGER_CLASS, 'mt-1')}
				>
					or start from scratch ＋
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-auto min-w-44">
					<KindChooserItems onChoose={onStartFromScratch} />
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

/** Ghost notation: the stanza's weight-and-ink typography at ghost opacity —
 * teaching the real notation, not inventing a new one. */
function GhostNotationLine({ line }: { line: GhostLine }): ReactNode {
	return (
		<span className="text-muted-foreground/70 flex items-baseline gap-1.5 font-medium tabular-nums">
			{line.badge ? (
				<span className="bg-muted rounded-sm px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums">
					{line.badge}
				</span>
			) : null}
			{line.text}
		</span>
	)
}
