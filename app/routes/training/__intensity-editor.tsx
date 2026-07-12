/**
 * The shared Intensity Target editor (ADR 0027, slice 5/9): a kind picker plus
 * per-kind inputs that serialize to the `IntensityTarget` JSON the server
 * already accepts, written through Conform (`useInputControl`) by both hosts —
 * the Token Sentence's intensity popover and the classic step fields. This
 * replaces the old out-of-Conform pattern (ad-hoc `useState` mirrored to a
 * hidden JSON input), so intensity validation errors map onto the field like
 * any other Conform error instead of being silently dropped.
 *
 * The codec is honest about in-progress edits: a **complete** draft serializes
 * as the canonical Intensity Target JSON; an **incomplete** one (kind picked,
 * values missing or out of range) serializes as a kind-tagged draft JSON blob
 * that deliberately fails `IntensityTargetSchema` — the notation renders it as
 * a placeholder token and the form schema surfaces it as a field error on
 * submit. Raw input strings round-trip through the draft JSON, so half-typed
 * numbers survive re-parsing.
 *
 * Derived facets (zone chip, resolved range) are display-only and live: the
 * sentence re-derives them per keystroke from the written JSON via the
 * existing resolver; this editor additionally previews the resolved range
 * in place. Missing thresholds → no preview, never an invented number.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { formatPaceClock, parsePace } from '#app/utils/format.ts'
import {
	INTENSITY_KIND_LABELS,
	IntensityTargetSchema,
	type CardioDiscipline,
	type IntensityTarget,
} from '#app/utils/workout-schema.ts'
import {
	getRecipe,
	listRecipesForDiscipline,
	resolveIntensity,
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
	powerPctMin: string
	powerPctMax: string
	paceMin: string
	paceMax: string
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
	powerPctMin: '',
	powerPctMax: '',
	paceMin: '',
	paceMax: '',
}

/** The draft keys each kind reads/writes — also the draft-JSON payload keys. */
const DRAFT_KEYS: Record<IntensityTarget['kind'], (keyof IntensityDraft)[]> = {
	zoneLabel: ['zoneLabel'],
	rpe: ['rpeMin', 'rpeMax'],
	hrBpm: ['hrBpmMin', 'hrBpmMax'],
	hrPct: ['hrPctRef', 'hrPctMin', 'hrPctMax'],
	power: ['powerMin', 'powerMax'],
	powerPct: ['powerPctMin', 'powerPctMax'],
	pace: ['paceMin', 'paceMax'],
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
 * The zone recipe an intensity host offers: the athlete's configured recipe,
 * falling back to the discipline's first built-in one; undefined → no recipe
 * (free-text / generic labels).
 */
export function editorZoneRecipe(
	profile: DisciplineProfileForResolver | null,
	effectiveDiscipline: string,
) {
	return profile?.zoneSystem
		? getRecipe(profile.zoneSystem)
		: listRecipesForDiscipline(effectiveDiscipline as CardioDiscipline)[0]
}

// ——— Resolved-range preview ————————————————————————————————————————————

/**
 * The concrete ranges a target resolves to against the athlete's thresholds,
 * for the in-editor preview. Null when nothing truthful resolves (missing
 * threshold, RPE) — the preview is simply omitted.
 */
export function formatResolvedRange(
	profile: DisciplineProfileForResolver,
	target: IntensityTarget,
): string | null {
	const resolved = resolveIntensity(target, profile)
	if (resolved.unavailable) return null
	const parts: string[] = []
	if (resolved.hrMin != null) {
		parts.push(
			`HR: ${resolved.hrMin}${resolved.hrMax != null ? `–${resolved.hrMax}` : '+'} bpm`,
		)
	}
	if (resolved.powerMin != null) {
		parts.push(
			`Power: ${resolved.powerMin}${resolved.powerMax != null ? `–${resolved.powerMax}` : '+'} W`,
		)
	}
	if (resolved.paceMin != null) {
		parts.push(
			`Pace: ${formatPaceClock(resolved.paceMin)}${
				resolved.paceMax != null ? `–${formatPaceClock(resolved.paceMax)}` : '+'
			} /km`,
		)
	}
	return parts.length > 0 ? parts.join(' · ') : null
}

// ——— The editor component ———————————————————————————————————————————————

export type IntensityEditorProps = {
	/** The intensity field's current serialized value. */
	value: string
	/** Receives every serialization — wire to `useInputControl(...).change`. */
	onChange: (serialized: string) => void
	/** The athlete's thresholds for the step's discipline, or null. */
	profile: DisciplineProfileForResolver | null
	/** The step's effective discipline (step override or workout discipline). */
	effectiveDiscipline: string
	/** Accessible label for the kind picker (hosts disambiguate). */
	kindLabel?: string
}

/**
 * The per-kind Intensity Target inputs, fully inside Conform: every change
 * serializes through the draft codec and is written via `onChange`. Local
 * state holds only the raw strings being typed; an external write to the same
 * field (e.g. the other host editing it) resets the draft from the new value.
 */
export function IntensityEditor({
	value,
	onChange,
	profile,
	effectiveDiscipline,
	kindLabel = 'Intensity',
}: IntensityEditorProps) {
	const [draft, update] = useIntensityDraft(value, onChange)
	const patch = (fields: Partial<IntensityDraft>) =>
		update({ ...draft, ...fields })

	const target = draftTarget(draft)
	const resolvedLabel =
		target && profile ? formatResolvedRange(profile, target) : null

	// Zone labels come from the athlete's configured recipe, falling back to
	// the discipline's first built-in recipe; no recipe → free-text label.
	const recipe = editorZoneRecipe(profile, effectiveDiscipline)

	const kindId = useId()
	const hrPctRefId = useId()

	return (
		<div className="space-y-2">
			<label
				htmlFor={kindId}
				className="text-body-2xs text-muted-foreground font-medium"
			>
				{kindLabel}
			</label>

			<Select
				value={draft.kind}
				onValueChange={(value) =>
					update({
						...emptyIntensityDraft,
						kind: value as IntensityDraft['kind'],
					})
				}
			>
				<SelectTrigger id={kindId} className="w-full">
					<SelectValue placeholder="None" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="">None</SelectItem>
					{(
						Object.entries(INTENSITY_KIND_LABELS) as [
							IntensityTarget['kind'],
							string,
						][]
					).map(([k, label]) => (
						<SelectItem key={k} value={k}>
							{label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{draft.kind === 'zoneLabel' ? (
				<div>
					{recipe ? (
						<Select
							value={draft.zoneLabel}
							onValueChange={(value) => patch({ zoneLabel: value ?? '' })}
						>
							<SelectTrigger aria-label="Zone" className="w-full">
								<SelectValue placeholder="Select zone…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="">Select zone…</SelectItem>
								{recipe.zones.map((z) => (
									<SelectItem key={z.label} value={z.label}>
										{z.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<Input
							type="text"
							aria-label="Zone"
							value={draft.zoneLabel}
							onChange={(e) => patch({ zoneLabel: e.target.value })}
							placeholder="e.g. Z2, threshold"
						/>
					)}
					{recipe ? (
						<p className="text-body-2xs text-muted-foreground mt-1">
							Recipe: {recipe.id}
						</p>
					) : null}
				</div>
			) : draft.kind === 'rpe' ? (
				<RangeInputs
					minLabel="Min RPE (1-10)"
					maxLabel="Max RPE (optional)"
					minValue={draft.rpeMin}
					maxValue={draft.rpeMax}
					onMin={(rpeMin) => patch({ rpeMin })}
					onMax={(rpeMax) => patch({ rpeMax })}
					inputProps={{ type: 'number', min: 1, max: 10 }}
				/>
			) : draft.kind === 'hrBpm' ? (
				<RangeInputs
					minLabel="Min HR (bpm)"
					maxLabel="Max HR (optional)"
					minValue={draft.hrBpmMin}
					maxValue={draft.hrBpmMax}
					onMin={(hrBpmMin) => patch({ hrBpmMin })}
					onMax={(hrBpmMax) => patch({ hrBpmMax })}
					inputProps={{ type: 'number', min: 40 }}
				/>
			) : draft.kind === 'hrPct' ? (
				<div className="space-y-2">
					<div className="space-y-1">
						<label
							htmlFor={hrPctRefId}
							className="text-body-2xs text-muted-foreground"
						>
							Reference
						</label>
						<Select
							value={draft.hrPctRef}
							onValueChange={(value) =>
								patch({ hrPctRef: value as 'max' | 'lthr' })
							}
						>
							<SelectTrigger id={hrPctRefId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="lthr">LTHR</SelectItem>
								<SelectItem value="max">Max HR</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<RangeInputs
						minLabel="Min %"
						maxLabel="Max % (optional)"
						minValue={draft.hrPctMin}
						maxValue={draft.hrPctMax}
						onMin={(hrPctMin) => patch({ hrPctMin })}
						onMax={(hrPctMax) => patch({ hrPctMax })}
						inputProps={{ type: 'number', min: 1, max: 200 }}
					/>
				</div>
			) : draft.kind === 'power' ? (
				<RangeInputs
					minLabel="Min (W)"
					maxLabel="Max W (optional)"
					minValue={draft.powerMin}
					maxValue={draft.powerMax}
					onMin={(powerMin) => patch({ powerMin })}
					onMax={(powerMax) => patch({ powerMax })}
					inputProps={{ type: 'number', min: 1 }}
				/>
			) : draft.kind === 'powerPct' ? (
				<RangeInputs
					minLabel="Min %FTP"
					maxLabel="Max %FTP (optional)"
					minValue={draft.powerPctMin}
					maxValue={draft.powerPctMax}
					onMin={(powerPctMin) => patch({ powerPctMin })}
					onMax={(powerPctMax) => patch({ powerPctMax })}
					inputProps={{ type: 'number', min: 1, max: 300 }}
				/>
			) : draft.kind === 'pace' ? (
				<RangeInputs
					minLabel="Min pace"
					maxLabel="Max pace (optional)"
					minValue={draft.paceMin}
					maxValue={draft.paceMax}
					onMin={(paceMin) => patch({ paceMin })}
					onMax={(paceMax) => patch({ paceMax })}
					inputProps={{
						type: 'text',
						placeholder: '4:40',
						inputMode: 'numeric',
					}}
				/>
			) : null}

			{resolvedLabel ? (
				<p className="text-body-2xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
					→ {resolvedLabel}
				</p>
			) : null}
		</div>
	)
}

function RangeInputs({
	minLabel,
	maxLabel,
	minValue,
	maxValue,
	onMin,
	onMax,
	inputProps,
}: {
	minLabel: string
	maxLabel: string
	minValue: string
	maxValue: string
	onMin: (value: string) => void
	onMax: (value: string) => void
	inputProps?: React.ComponentProps<typeof Input>
}) {
	const minId = useId()
	const maxId = useId()
	return (
		<div className="grid grid-cols-2 gap-2">
			<div className="space-y-1">
				<label htmlFor={minId} className="text-body-2xs text-muted-foreground">
					{minLabel}
				</label>
				<Input
					id={minId}
					{...inputProps}
					value={minValue}
					onChange={(e) => onMin(e.target.value)}
				/>
			</div>
			<div className="space-y-1">
				<label htmlFor={maxId} className="text-body-2xs text-muted-foreground">
					{maxLabel}
				</label>
				<Input
					id={maxId}
					{...inputProps}
					placeholder={inputProps?.placeholder ?? '—'}
					value={maxValue}
					onChange={(e) => onMax(e.target.value)}
				/>
			</div>
		</div>
	)
}
