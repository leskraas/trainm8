/**
 * Pure helpers behind the uniform-first sets popover (workout-editor spec
 * §5.2, #256). A strength step's set list is always materialized as
 * individual draft sets in the form; *uniform* is a view over them — when
 * every set states the same thing, the popover mirrors the compact notation
 * (`5 × 5 @ 80 kg`) and edits write through to every set. These helpers
 * decide when that view is honest and reshape the list for its controls.
 *
 * Uniformity compares only the fields a set's kind actually reads: a kind
 * switch sets the other quantity aside without clearing it (like the step
 * kind reconciliation, §4.2), so a stale `reps` draft on a timed set must
 * not break the uniform view — the sets still *say* the same thing.
 */
import {
	normalizeSetKind,
	type DraftSetValue,
	type NotationSet,
} from './workout-notation.ts'

export type SetKind = NotationSet['kind']

export { normalizeSetKind }

export const SET_KIND_LABELS: Record<SetKind, string> = {
	reps: 'Reps',
	timed: 'Timed',
	amrap: 'AMRAP',
}

/** The quantity seed a kind starts from when nothing is authored yet —
 * matching `emptySet()`'s 5 reps and `buildStepInput`'s 30 s timed default. */
const KIND_QUANTITY_SEEDS: Record<SetKind, Partial<DraftSetValue>> = {
	reps: { reps: '5' },
	timed: { durationSec: '30' },
	amrap: {},
}

const trimmed = (value: string | undefined) => value?.trim() ?? ''

/** What one set states, reduced to the fields its kind reads. */
function setStatement(set: DraftSetValue) {
	const kind = normalizeSetKind(set.kind)
	return {
		kind,
		quantity:
			kind === 'reps'
				? trimmed(set.reps)
				: kind === 'timed'
					? trimmed(set.durationSec)
					: '',
		weightKg: trimmed(set.weightKg),
		pct1RM: trimmed(set.pct1RM),
	}
}

/**
 * True when every set states the same kind, quantity, and load — the state
 * in which the uniform mirror edits honestly and "◂ Collapse to uniform" may
 * appear (it never destroys authored variation). An empty list has nothing
 * to mirror.
 */
export function setsAreUniform(sets: DraftSetValue[]): boolean {
	if (sets.length === 0) return false
	const first = setStatement(sets[0]!)
	return sets.every((set) => {
		const s = setStatement(set)
		return (
			s.kind === first.kind &&
			s.quantity === first.quantity &&
			s.weightKg === first.weightKg &&
			s.pct1RM === first.pct1RM
		)
	})
}

export type UniformSetTemplate = {
	kind: SetKind
	reps: string
	durationSec: string
	weightKg: string
	pct1RM: string
}

/** The shared values the uniform controls edit, or null when the sets
 * diverge (the popover then opens on the per-set grid). */
export function uniformSetTemplate(
	sets: DraftSetValue[],
): UniformSetTemplate | null {
	if (!setsAreUniform(sets)) return null
	const first = sets[0]!
	return {
		kind: normalizeSetKind(first.kind),
		reps: trimmed(first.reps),
		durationSec: trimmed(first.durationSec),
		weightKg: trimmed(first.weightKg),
		pct1RM: trimmed(first.pct1RM),
	}
}

/**
 * The uniform count control: grow by cloning the last set, shrink by
 * truncating. Pure — returns fresh clones so callers can splice the result
 * into the draft without aliasing. Count clamps to at least one set.
 */
export function resizeUniformSets(
	sets: DraftSetValue[],
	count: number,
): DraftSetValue[] {
	const target = Math.max(1, Math.round(count))
	const template = sets[sets.length - 1] ?? { kind: 'reps', reps: '5' }
	return Array.from({ length: target }, (_, index) => ({
		...(sets[index] ?? template),
	}))
}

/**
 * The uniform kind select: every set takes the new kind, and the new kind's
 * quantity becomes ONE shared value — the first set's authored value (so a
 * quantity survives the round-trip back, §4.2's carry principle) or the
 * kind's seed. Homogenizing is deliberate: the old kind may have left
 * differing stale drafts in the fields it ignored, and a uniform-view swap
 * that resurfaced them would silently eject the athlete into the per-set
 * grid mid-gesture.
 */
export function switchUniformSetKind(
	sets: DraftSetValue[],
	kind: SetKind,
): DraftSetValue[] {
	const seeds = KIND_QUANTITY_SEEDS[kind]
	const first = sets[0]
	return sets.map((set) => {
		const next: DraftSetValue = { ...set, kind }
		for (const [field, seed] of Object.entries(seeds) as [
			keyof DraftSetValue,
			string,
		][]) {
			next[field] = trimmed(first?.[field]) || seed
		}
		return next
	})
}
