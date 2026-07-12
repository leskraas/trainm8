/**
 * Step kind switching with set-aside reconciliation (workout-editor spec §4,
 * from #237 variant A — issue #255).
 *
 * A step changes kind (cardio ↔ strength ↔ rest) without ever feeling
 * destructive: the note always carries; a time quantity carries cardio ↔
 * rest (a distance doesn't fit rest, so it's set aside and rest seeds
 * 1 min); every other **authored** value is set aside in-session under the
 * step's `setAside` stash and restored on switch-back. Untouched seed values
 * are not worth remembering and are forgotten.
 *
 * The stash rides the draft step value only — no form input ever renders it,
 * so it dies with the editing session and never reaches the server; on save
 * `buildStepInput` writes only the active kind's fields.
 *
 * Pure functions throughout, shared by every kind-switch surface (the step ⋮
 * menu's Kind section and the block editor sheet's Kind select), so both
 * produce identical outcomes (§4.3).
 */
import {
	describeStepTarget,
	parseAuthoredIntensity,
} from '#app/utils/intensity-target.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { emptySet } from '#app/utils/workout-authoring.ts'
import {
	draftSetsSummary,
	type DraftBlockValue,
	type DraftSetValue,
	type DraftStepValue,
} from '#app/utils/workout-notation.ts'
import { STEP_KINDS, type StepKind } from '#app/utils/workout-schema.ts'

/** The in-session stash: per former kind, the authored values a switch away
 * set aside. Rides the draft step value, never a form input. */
export type StepKindStash = Partial<Record<StepKind, Partial<DraftStepValue>>>

export type SwitchableStep = DraftStepValue & { setAside?: StepKindStash }

/**
 * Which draft fields each kind owns — the values a switch away from that
 * kind must reconcile. `notes` is deliberately absent: the note always
 * carries (§4.2). `discipline` belongs to cardio and strength alike, but
 * rest has none (§6.1), so it reconciles per kind rather than carrying.
 */
const KIND_FIELDS: Record<StepKind, (keyof DraftStepValue)[]> = {
	cardio: ['duration', 'distance', 'intensity', 'discipline'],
	strength: ['exerciseId', 'sets', 'restBetweenSetsSec', 'discipline'],
	rest: ['duration'],
}

/** The quantity a freshly chosen kind seeds (§4.1) — one source of truth for
 * the ＋ kind chooser's seeds and the untouched-seed detection here. */
export const KIND_SEED_DURATIONS = {
	cardio: '10 min',
	rest: '1 min',
} as const

export function normalizeKind(kind: string | null | undefined): StepKind {
	return STEP_KINDS.includes(kind as StepKind) ? (kind as StepKind) : 'cardio'
}

const isBlank = (value: string | null | undefined) => !value?.trim()

/** Whether a set list is still the fresh-strength-step seed (one default
 * set, nothing typed) — such sets aren't worth setting aside. */
function setsAreSeed(sets: DraftSetValue[] | undefined): boolean {
	if (!sets || sets.length === 0) return true
	if (sets.length > 1) return false
	const set = sets[0]!
	const seed = emptySet()
	return (
		(set.kind || seed.kind) === seed.kind &&
		(isBlank(set.reps) || set.reps === seed.reps) &&
		isBlank(set.weightKg) &&
		isBlank(set.pct1RM) &&
		isBlank(set.durationSec)
	)
}

/** Whether a kind-owned field carries an athlete-authored value — non-empty
 * and different from what the kind seeds (untouched seeds are forgotten). */
function fieldAuthored(
	kind: StepKind,
	field: keyof DraftStepValue,
	step: SwitchableStep,
): boolean {
	if (field === 'sets') return !setsAreSeed(step.sets)
	const value = step[field] as string | undefined
	if (isBlank(value)) return false
	if (field === 'duration' && kind !== 'strength') {
		return value!.trim() !== KIND_SEED_DURATIONS[kind]
	}
	return true
}

export type KindSwitchPlan = {
	from: StepKind
	to: StepKind
	/** The time quantity that rides across cardio ↔ rest (§4.2), or null. */
	carriedDuration: string | null
	/** The stash entry the switch brings back, or null. */
	restored: Partial<DraftStepValue> | null
	/** The authored from-kind values the switch sets aside, or null. */
	setAside: Partial<DraftStepValue> | null
	/** Seeds the target kind starts with when nothing carries or returns. */
	seeded: Partial<DraftStepValue>
}

/**
 * What switching `step` to `to` would do — computed once, used by both the
 * preview line and the switch itself so the preview can never lie.
 *
 * One refinement over the prototype: a time quantity does NOT carry when the
 * target's stash is about to restore its own quantity — the authored time is
 * set aside instead, so the restore never silently destroys it (and a
 * restored distance never coexists with a carried duration).
 */
export function planKindSwitch(
	step: SwitchableStep,
	to: StepKind,
): KindSwitchPlan {
	const from = normalizeKind(step.kind)
	const restored = step.setAside?.[to] ?? null
	const restoresQuantity =
		!isBlank(restored?.duration) || !isBlank(restored?.distance)
	const timePair =
		(from === 'cardio' && to === 'rest') || (from === 'rest' && to === 'cardio')
	const carriedDuration =
		timePair && !isBlank(step.duration) && !restoresQuantity
			? step.duration!
			: null

	// The set-aside group: all non-empty from-kind values, stashed together so
	// a switch back restores a coherent step — but only when at least one of
	// them was actually authored (untouched seeds are forgotten).
	const candidate: Partial<DraftStepValue> = {}
	let authored = false
	for (const field of KIND_FIELDS[from]) {
		if (field === 'duration' && carriedDuration != null) continue
		if (field === 'sets') {
			if ((step.sets?.length ?? 0) > 0) candidate.sets = step.sets
		} else {
			const value = step[field] as string | undefined
			if (isBlank(value)) continue
			candidate[field as Exclude<keyof DraftStepValue, 'sets'>] = value
		}
		if (fieldAuthored(from, field, step)) authored = true
	}
	const setAside =
		authored && Object.keys(candidate).length > 0 ? candidate : null

	const seeded: Partial<DraftStepValue> = {}
	if (to === 'cardio' && carriedDuration == null && !restoresQuantity) {
		seeded.duration = KIND_SEED_DURATIONS.cardio
	}
	if (to === 'rest' && carriedDuration == null && isBlank(restored?.duration)) {
		seeded.duration = KIND_SEED_DURATIONS.rest
	}
	if (
		to === 'strength' &&
		!restored?.sets?.length &&
		(step.sets?.length ?? 0) === 0
	) {
		seeded.sets = [emptySet()]
	}

	return { from, to, carriedDuration, restored, setAside, seeded }
}

/**
 * Switch a draft step's kind through the §4.2 reconciliation. Pure — returns
 * the reconciled step; the caller writes it back through its own atomic
 * draft update. From-kind fields clear to the empty-string form values the
 * form carriers expect (sets reset to the single default set).
 */
export function switchStepKind(
	step: SwitchableStep,
	to: StepKind,
): SwitchableStep {
	const from = normalizeKind(step.kind)
	if (from === to) return step
	const plan = planKindSwitch(step, to)

	const next: SwitchableStep = { ...step, kind: to }
	for (const field of KIND_FIELDS[from]) {
		if (field === 'duration' && plan.carriedDuration != null) continue
		if (field === 'sets') next.sets = [emptySet()]
		else next[field as Exclude<keyof DraftStepValue, 'sets'>] = ''
	}

	const stash: StepKindStash = { ...step.setAside }
	if (plan.setAside) stash[from] = plan.setAside
	else delete stash[from]
	if (plan.restored) {
		Object.assign(next, plan.restored)
		delete stash[to]
	}
	Object.assign(next, plan.seeded)

	if (Object.keys(stash).length > 0) next.setAside = stash
	else delete next.setAside
	return next
}

/**
 * Zip per-step stashes (kept outside the form, indexed
 * [blockIndex][stepIndex]) onto cloned draft blocks, so structural splices
 * move, copy, and delete a stash with its step.
 */
export function attachStashes(
	blocks: DraftBlockValue[],
	stashes: (StepKindStash | undefined)[][],
): void {
	blocks.forEach((block, blockIndex) => {
		block.steps?.forEach((step, stepIndex) => {
			const stash = stashes[blockIndex]?.[stepIndex]
			if (stash) (step as SwitchableStep).setAside = stash
		})
	})
}

/**
 * Strip the stashes back out of a mutated draft — the form must never see
 * them — returning the realigned [blockIndex][stepIndex] structure.
 */
export function extractStashes(
	blocks: DraftBlockValue[],
): (StepKindStash | undefined)[][] {
	return blocks.map((block) =>
		(block.steps ?? []).map((step) => {
			const { setAside } = step as SwitchableStep
			delete (step as SwitchableStep).setAside
			return setAside
		}),
	)
}

/** The set notation a fresh strength step seeds — derived from the seed
 * itself so the preview can never drift from what actually lands. */
const STRENGTH_SEED_SUMMARY = draftSetsSummary([emptySet()]) ?? '1 × 5'

function capitalize(text: string): string {
	return text ? text[0]!.toUpperCase() + text.slice(1) : text
}

export type KindSwitchPreviewOptions = {
	/** id → name for the exercise catalog, so a stashed strength step reads
	 * as its exercise name. */
	exerciseNames?: Record<string, string>
}

/** A stashed (or set-aside) value group in the notation's own words. */
function summarizeValues(
	kind: StepKind,
	values: Partial<DraftStepValue>,
	options: KindSwitchPreviewOptions,
): string {
	if (kind === 'strength') {
		const name =
			(values.exerciseId && options.exerciseNames?.[values.exerciseId]) ||
			'exercise'
		const sets = draftSetsSummary(values.sets)
		return sets ? `${name} ${sets}` : name
	}
	const bits: string[] = []
	if (!isBlank(values.duration)) bits.push(values.duration!.trim())
	if (!isBlank(values.distance)) bits.push(values.distance!.trim())
	const target = parseAuthoredIntensity(values.intensity)
	if (target) {
		bits.push(
			target.kind === 'zoneLabel'
				? capitalize(target.label)
				: describeStepTarget(target).label,
		)
	}
	if (!isBlank(values.discipline)) {
		// The athlete's word for the discipline, never the stored identifier
		// (CONTEXT.md's copy rule).
		bits.push(getDisciplineLabel(values.discipline!.trim()))
	}
	return bits.join(' · ') || 'its values'
}

/**
 * The one-line consequence preview a "⇄ Make …" row carries (§4.1) —
 * *brings back … / keeps … / sets aside …* — computed from the same plan the
 * switch executes, for the step's actual values.
 */
export function previewKindSwitch(
	step: SwitchableStep,
	to: StepKind,
	options: KindSwitchPreviewOptions = {},
): string {
	const plan = planKindSwitch(step, to)
	const parts: string[] = []
	if (plan.restored) {
		parts.push(`brings back ${summarizeValues(to, plan.restored, options)}`)
	} else if (to === 'strength') {
		parts.push(`starts as an exercise, ${STRENGTH_SEED_SUMMARY}`)
	} else if (!isBlank(plan.seeded.duration)) {
		parts.push(
			`starts as ${plan.seeded.duration}${to === 'rest' ? ' of recovery' : ''}`,
		)
	}
	const keeps: string[] = []
	if (plan.carriedDuration != null) keeps.push(plan.carriedDuration)
	if (!isBlank(step.notes)) keeps.push('note')
	if (keeps.length > 0) parts.push(`keeps ${keeps.join(', ')}`)
	if (plan.setAside) {
		parts.push(
			`sets aside ${summarizeValues(plan.from, plan.setAside, options)}`,
		)
	}
	return parts.join(' — ') || 'nothing to carry'
}
