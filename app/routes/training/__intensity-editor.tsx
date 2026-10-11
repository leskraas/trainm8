/**
 * The Intensity Target **draft codec** (ADR 0027, slice 5/9): the raw-string
 * draft the intensity popover (`__intensity-popover.tsx`) edits, and its
 * round-trip to the `IntensityTarget` JSON the server already accepts, written
 * through Conform (`useInputControl`). This replaced the old out-of-Conform
 * pattern (ad-hoc `useState` mirrored to a hidden JSON input), so intensity
 * validation errors map onto the field like any other Conform error instead of
 * being silently dropped.
 *
 * The codec is honest about in-progress edits: a **complete** draft serializes
 * as the canonical Intensity Target JSON; an **incomplete** one (kind picked,
 * values missing or out of range) serializes as a kind-tagged draft JSON blob
 * that deliberately fails `IntensityTargetSchema` — the notation renders it as
 * a placeholder token and the form schema surfaces it as a field error on
 * submit. Raw input strings round-trip through the draft JSON, so half-typed
 * numbers survive re-parsing.
 *
 * The file once also held a kind-picker `IntensityEditor` for the classic step
 * fields. Those fields were deleted with the nested-fieldset form (workout-editor
 * spec §12), the component had no importer left, and it went with them (#505
 * round 2) rather than being translated.
 */
import { useEffect, useRef, useState } from 'react'
import { formatPaceClock, parsePace } from '#app/utils/format.ts'
import {
	INTENSITY_KIND_LABELS,
	IntensityTargetSchema,
	type Discipline,
	type IntensityTarget,
} from '#app/utils/workout-schema.ts'
import {
	defaultRecipeIdFor,
	getRecipe,
	type DisciplineProfileForResolver,
} from '#app/utils/zones/index.ts'

// ——— Draft model ————————————————————————————————————————————————————————

/**
 * The editor's UI draft: one raw string per input so half-typed values are
 * never coerced. Pace values are humane `m:ss` clocks (per km), everything
 * else plain number text. `kind: ''` means "no intensity".
 */
export type IntensityDraft = {
	kind: IntensityTarget['kind'] | ''
	zoneLabel: string
	rpeMin: string
	rpeMax: string
	hrBpmMin: string
	hrBpmMax: string
	hrPctRef: 'max' | 'lthr'
	hrPctMin: string
	hrPctMax: string
	powerMin: string
	powerMax: string
	powerPctRef: 'ftp' | 'map' | 'cp'
	powerPctMin: string
	powerPctMax: string
	paceMin: string
	paceMax: string
	pacePctMin: string
	pacePctMax: string
	lactateMin: string
	lactateMax: string
	// `racePace` has no control on this surface yet — nothing in the app can
	// give an athlete a **Performance Result** to resolve one against, so a
	// picker for it would be a false promise. The draft still carries it so a
	// Catalogue-sourced race-pace target survives an editor round-trip instead
	// of being silently stripped (the same read-only-until-a-control-exists rule
	// #450 applied to `toRir` / `velocityLoss` sets).
	racePaceEvent: string
	racePaceMin: string
	racePaceMax: string
}

export const emptyIntensityDraft: IntensityDraft = {
	kind: '',
	zoneLabel: '',
	rpeMin: '',
	rpeMax: '',
	hrBpmMin: '',
	hrBpmMax: '',
	hrPctRef: 'lthr',
	hrPctMin: '',
	hrPctMax: '',
	powerMin: '',
	powerMax: '',
	powerPctRef: 'ftp',
	powerPctMin: '',
	powerPctMax: '',
	paceMin: '',
	paceMax: '',
	pacePctMin: '',
	pacePctMax: '',
	lactateMin: '',
	lactateMax: '',
	racePaceEvent: '',
	racePaceMin: '',
	racePaceMax: '',
}

/** The draft keys each kind reads/writes — also the draft-JSON payload keys. */
const DRAFT_KEYS: Record<IntensityTarget['kind'], (keyof IntensityDraft)[]> = {
	zoneLabel: ['zoneLabel'],
	rpe: ['rpeMin', 'rpeMax'],
	hrBpm: ['hrBpmMin', 'hrBpmMax'],
	hrPct: ['hrPctRef', 'hrPctMin', 'hrPctMax'],
	power: ['powerMin', 'powerMax'],
	powerPct: ['powerPctRef', 'powerPctMin', 'powerPctMax'],
	pace: ['paceMin', 'paceMax'],
	pacePct: ['pacePctMin', 'pacePctMax'],
	lactate: ['lactateMin', 'lactateMax'],
	racePace: ['racePaceEvent', 'racePaceMin', 'racePaceMax'],
}

function isIntensityKind(value: unknown): value is IntensityTarget['kind'] {
	return typeof value === 'string' && value in INTENSITY_KIND_LABELS
}

// ——— Draft → target ————————————————————————————————————————————————————

export function numberOrNull(raw: string): number | null {
	const trimmed = raw.trim()
	if (!trimmed) return null
	const n = Number(trimmed)
	return Number.isFinite(n) ? n : null
}

/**
 * `parsePace` plus keypad-friendly forms: touch keypads have no ":" key, so
 * "4.40" / "4,40" read as the same 4:40 clock (§9.2).
 */
export function parsePaceInput(raw: string): number | null {
	const direct = parsePace(raw)
	if (direct != null) return direct
	const match = /^(\d{1,2})[.,]([0-5]\d)$/.exec(raw.trim())
	if (!match) return null
	const total = Number(match[1]) * 60 + Number(match[2])
	return total > 0 ? total : null
}

/**
 * Assemble the candidate target for a draft, or null when required parts are
 * missing/unparseable. An optional max that is present but unparseable also
 * yields null — a typed bound is never silently discarded.
 */
function candidateFor(draft: IntensityDraft): Record<string, unknown> | null {
	const range = (
		kind: IntensityTarget['kind'],
		minKey: string,
		maxKey: string,
		minRaw: string,
		maxRaw: string,
		parse: (raw: string) => number | null,
		extra: Record<string, unknown> = {},
	) => {
		const min = parse(minRaw)
		if (min == null) return null
		if (!maxRaw.trim()) return { kind, ...extra, [minKey]: min }
		const max = parse(maxRaw)
		if (max == null) return null
		return { kind, ...extra, [minKey]: min, [maxKey]: max }
	}

	switch (draft.kind) {
		case '':
			return null
		case 'zoneLabel': {
			const label = draft.zoneLabel.trim()
			return label ? { kind: 'zoneLabel', label } : null
		}
		case 'rpe':
			return range(
				'rpe',
				'min',
				'max',
				draft.rpeMin,
				draft.rpeMax,
				numberOrNull,
			)
		case 'hrBpm':
			return range(
				'hrBpm',
				'min',
				'max',
				draft.hrBpmMin,
				draft.hrBpmMax,
				numberOrNull,
			)
		case 'hrPct':
			return range(
				'hrPct',
				'minPct',
				'maxPct',
				draft.hrPctMin,
				draft.hrPctMax,
				numberOrNull,
				{ ref: draft.hrPctRef },
			)
		case 'power':
			return range(
				'power',
				'minW',
				'maxW',
				draft.powerMin,
				draft.powerMax,
				numberOrNull,
			)
		case 'powerPct':
			return range(
				'powerPct',
				'minPct',
				'maxPct',
				draft.powerPctMin,
				draft.powerPctMax,
				numberOrNull,
				// `ftp` is what an absent `ref` means, so the default authors the
				// same JSON it always did and no stored row grows a field.
				draft.powerPctRef === 'ftp' ? {} : { ref: draft.powerPctRef },
			)
		case 'pace':
			return range(
				'pace',
				'minSecPerKm',
				'maxSecPerKm',
				draft.paceMin,
				draft.paceMax,
				parsePaceInput,
			)
		case 'pacePct':
			return range(
				'pacePct',
				'minPct',
				'maxPct',
				draft.pacePctMin,
				draft.pacePctMax,
				numberOrNull,
			)
		case 'lactate':
			return range(
				'lactate',
				'minMmol',
				'maxMmol',
				draft.lactateMin,
				draft.lactateMax,
				numberOrNull,
			)
		case 'racePace': {
			// The event is the required part; both percentages are optional, since
			// `@ 5k pace` is the common authored form.
			const event = draft.racePaceEvent.trim()
			if (!event) return null
			const out: Record<string, unknown> = { kind: 'racePace', event }
			for (const [key, raw] of [
				['minPct', draft.racePaceMin],
				['maxPct', draft.racePaceMax],
			] as const) {
				if (!raw.trim()) continue
				const value = numberOrNull(raw)
				if (value == null) return null
				out[key] = value
			}
			return out
		}
	}
}

/**
 * The valid Intensity Target a draft describes, or undefined while it is
 * incomplete or out of range — validated through the same schema the server
 * uses, so "complete" here always means "the server accepts it".
 */
export function draftTarget(
	draft: IntensityDraft,
): IntensityTarget | undefined {
	const candidate = candidateFor(draft)
	if (!candidate) return undefined
	const parsed = IntensityTargetSchema.safeParse(candidate)
	return parsed.success ? parsed.data : undefined
}

// ——— Draft ⇄ field value ————————————————————————————————————————————————

/**
 * Serialize a draft to the intensity form-field value: canonical Intensity
 * Target JSON when complete, `''` when no kind is picked, and otherwise a
 * kind-tagged draft JSON carrying the raw input strings — parseable back into
 * the same draft, but never a valid target, so validation catches it.
 */
export function serializeIntensityDraft(draft: IntensityDraft): string {
	const target = draftTarget(draft)
	if (target) return JSON.stringify(target)
	if (!draft.kind) return ''
	const out: Record<string, string> = { kind: draft.kind }
	for (const key of DRAFT_KEYS[draft.kind]) {
		const raw = draft[key]
		if (raw.trim()) out[key] = raw
	}
	return JSON.stringify(out)
}

function targetToDraft(target: IntensityTarget): IntensityDraft {
	const base = { ...emptyIntensityDraft, kind: target.kind }
	switch (target.kind) {
		case 'zoneLabel':
			return { ...base, zoneLabel: target.label }
		case 'rpe':
			return {
				...base,
				rpeMin: String(target.min),
				rpeMax: target.max != null ? String(target.max) : '',
			}
		case 'hrBpm':
			return {
				...base,
				hrBpmMin: String(target.min),
				hrBpmMax: target.max != null ? String(target.max) : '',
			}
		case 'hrPct':
			return {
				...base,
				hrPctRef: target.ref,
				hrPctMin: String(target.minPct),
				hrPctMax: target.maxPct != null ? String(target.maxPct) : '',
			}
		case 'power':
			return {
				...base,
				powerMin: String(target.minW),
				powerMax: target.maxW != null ? String(target.maxW) : '',
			}
		case 'powerPct':
			return {
				...base,
				powerPctRef: target.ref ?? 'ftp',
				powerPctMin: String(target.minPct),
				powerPctMax: target.maxPct != null ? String(target.maxPct) : '',
			}
		case 'pace':
			return {
				...base,
				paceMin: formatPaceClock(target.minSecPerKm),
				paceMax:
					target.maxSecPerKm != null ? formatPaceClock(target.maxSecPerKm) : '',
			}
		case 'pacePct':
			return {
				...base,
				pacePctMin: String(target.minPct),
				pacePctMax: target.maxPct != null ? String(target.maxPct) : '',
			}
		case 'lactate':
			return {
				...base,
				lactateMin: String(target.minMmol),
				lactateMax: target.maxMmol != null ? String(target.maxMmol) : '',
			}
		case 'racePace':
			return {
				...base,
				racePaceEvent: target.event,
				racePaceMin: target.minPct != null ? String(target.minPct) : '',
				racePaceMax: target.maxPct != null ? String(target.maxPct) : '',
			}
	}
}

/**
 * Parse an intensity field value into the editor draft. Accepts canonical
 * target JSON, the incomplete-draft JSON this module writes, and a legacy
 * plain zone-label string; anything else is the empty draft.
 */
export function parseIntensityDraft(
	value: string | null | undefined,
): IntensityDraft {
	if (!value?.trim()) return { ...emptyIntensityDraft }
	let parsed: unknown
	try {
		parsed = JSON.parse(value)
	} catch {
		// Legacy persisted intensity: a bare zone-label string.
		return {
			...emptyIntensityDraft,
			kind: 'zoneLabel',
			zoneLabel: value.trim(),
		}
	}
	const target = IntensityTargetSchema.safeParse(parsed)
	if (target.success) return targetToDraft(target.data)
	if (parsed && typeof parsed === 'object' && 'kind' in parsed) {
		const kind = (parsed as { kind: unknown }).kind
		if (isIntensityKind(kind)) {
			const draft = { ...emptyIntensityDraft, kind }
			for (const key of DRAFT_KEYS[kind]) {
				const raw = (parsed as Record<string, unknown>)[key]
				if (key === 'hrPctRef') {
					if (raw === 'max' || raw === 'lthr') draft.hrPctRef = raw
				} else if (typeof raw === 'string') {
					;(draft as Record<string, string>)[key] = raw
				}
			}
			return draft
		}
	}
	return { ...emptyIntensityDraft }
}

// ——— Shared host wiring —————————————————————————————————————————————————

/**
 * The draft ⇄ field synchronisation both intensity hosts share (this editor
 * and the sentence's intensity popover): local state holds the raw strings
 * being typed; every update serializes through the codec and is written via
 * `onChange`; an external write to the same field resets the draft from the
 * new value.
 */
export function useIntensityDraft(
	value: string,
	onChange: (serialized: string) => void,
) {
	const [draft, setDraft] = useState<IntensityDraft>(() =>
		parseIntensityDraft(value),
	)
	const lastEmitted = useRef(value)
	useEffect(() => {
		if (value !== lastEmitted.current) {
			lastEmitted.current = value
			setDraft(parseIntensityDraft(value))
		}
	}, [value])

	function update(next: IntensityDraft) {
		setDraft(next)
		const serialized = serializeIntensityDraft(next)
		lastEmitted.current = serialized
		onChange(serialized)
	}

	return [draft, update] as const
}

/**
 * The zone recipe an intensity host offers: the athlete's stored recipe, falling
 * back to the discipline's **default** one; undefined → no recipe (free-text /
 * generic labels, and every strength host).
 *
 * The fallback is the same default the app stamps onto a **Discipline Profile**
 * (#454) rather than `listRecipesForDiscipline(d)[0]`, so a profile the editor
 * has not been handed cannot offer one ladder while the athlete's settings show
 * another. It is now a rare path — every cardio profile carries a recipe — and
 * exists for hosts rendered without a profile at all.
 */
export function editorZoneRecipe(
	profile: DisciplineProfileForResolver | null,
	effectiveDiscipline: string,
) {
	const id =
		profile?.zoneSystem ?? defaultRecipeIdFor(effectiveDiscipline as Discipline)
	return id ? getRecipe(id) : undefined
}
