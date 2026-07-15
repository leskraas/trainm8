/**
 * The intensity popover's editor body (workout-editor spec §7.3, #253) — how
 * any Intensity Target kind is authored and edited from the sentence's chip,
 * inside the shared retargeting popover instrument (#252).
 *
 * The layout is zone-first: the athlete's own zone chips lead (the common
 * case, one tap), a quiet kind row beneath — "or set: pace · watts · heart
 * rate · RPE", ordered discipline-aware (run and swim lead with pace, bike
 * with watts; RPE is deliberately last, §7.4) — swaps the content below in
 * place to that kind's inputs. Watts and heart rate are one field with a
 * unit toggle (W ⇄ %FTP, bpm ⇄ %LTHR/%maxHR — the sets-popover kg ⇄ %1RM
 * pattern): the units are mutually exclusive, and toggling converts the
 * typed value through the athlete's threshold when it is known. When it
 * isn't, watts ⇄ %FTP and bpm ⇄ % restore the other unit's last-authored
 * draft, and %LTHR ⇄ %maxHR clears — those two share one field, and carrying
 * the same number across would silently restate a different physiological
 * target. A number is never invented.
 *
 * Every value is type-to-edit with ± nudges (§2.4, B4) at ≥44 px touch size
 * (§9.2). One provenance line closes the popover, in human words in every
 * state — "≈ zone 3 for you", "can't be placed in a zone — FTP missing in
 * settings" — never enum names or recipe ids (B5). Values serialize through
 * the same draft codec both intensity hosts share (`__intensity-editor.tsx`),
 * so the form field, validation, and the live chip re-derivation are
 * untouched.
 */
import { useId } from 'react'
import { ZONE_CHIP_TINT } from '#app/components/score-stanza.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { formatPaceClock } from '#app/utils/format.ts'
import { cn } from '#app/utils/misc.tsx'
import { type TrainingZone } from '#app/utils/session-profile.ts'
import {
	intensityChipText,
	resolvedRangeText,
	zoneEquivalent,
	zoneEquivalentProvenance,
} from '#app/utils/zone-equivalent.ts'
import {
	type DisciplineProfileForResolver,
	type ZoneRecipe,
} from '#app/utils/zones/index.ts'
import {
	draftTarget,
	editorZoneRecipe,
	numberOrNull,
	parsePaceInput,
	useIntensityDraft,
	type IntensityDraft,
} from './__intensity-editor.tsx'

// ——— The kind row ———————————————————————————————————————————————————————

/** The quiet kind row's entries: watts and heart rate each cover both their
 * absolute and %-of-threshold target kinds (the unit toggle switches within
 * the group). */
type KindGroup = 'pace' | 'watts' | 'heartRate' | 'rpe'

const KIND_GROUP_LABELS: Record<KindGroup, string> = {
	pace: 'pace',
	watts: 'watts',
	heartRate: 'heart rate',
	rpe: 'RPE',
}

function kindGroupOf(kind: IntensityDraft['kind']): KindGroup | null {
	switch (kind) {
		case 'pace':
			return 'pace'
		case 'power':
		case 'powerPct':
			return 'watts'
		case 'hrBpm':
		case 'hrPct':
			return 'heartRate'
		case 'rpe':
			return 'rpe'
		default:
			return null
	}
}

/**
 * The kind row's order follows the step's discipline — run and swim lead
 * with pace, bike with watts — and RPE is always last, by convention (§7.4).
 */
function kindRowOrder(discipline: string): KindGroup[] {
	return discipline === 'bike'
		? ['watts', 'pace', 'heartRate', 'rpe']
		: ['pace', 'watts', 'heartRate', 'rpe']
}

// ——— Unit conversion on toggle ——————————————————————————————————————————

/** An HR value in one unit expressed in another, through the athlete's
 * thresholds; null when a needed threshold is absent — never a guess. */
type HrUnit = 'bpm' | 'lthr' | 'maxHr'

function convertHr(
	value: number,
	from: HrUnit,
	to: HrUnit,
	profile: DisciplineProfileForResolver | null,
): number | null {
	const anchor = (unit: HrUnit) =>
		unit === 'lthr' ? profile?.lthr : unit === 'maxHr' ? profile?.maxHr : 1
	const fromAnchor = from === 'bpm' ? 1 : anchor(from)
	const toAnchor = to === 'bpm' ? 1 : anchor(to)
	if (fromAnchor == null || toAnchor == null) return null
	const bpm = from === 'bpm' ? value : (value * fromAnchor) / 100
	return Math.round(to === 'bpm' ? bpm : (bpm / toAnchor) * 100)
}

// ——— Zone chips ——————————————————————————————————————————————————————————

/** Generic five-step labels when no zone recipe applies — the shared label
 * heuristic still reads them, so the chip tints without a profile. */
const FALLBACK_ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']

function zoneChipLabels(recipe: ZoneRecipe | undefined): string[] {
	return recipe ? recipe.zones.map((z) => z.label) : FALLBACK_ZONE_LABELS
}

/** A chip's ladder step by its band position; Z6/Z7 clamp to the top (§7.1). */
function chipStep(index: number): TrainingZone {
	return Math.min(index + 1, 5) as TrainingZone
}

// ——— The editor ————————————————————————————————————————————————————————

type IntensityPopoverEditorProps = {
	/** The intensity field's current serialized value. */
	value: string
	/** Receives every serialization — wire to `useInputControl(...).change`. */
	onChange: (serialized: string) => void
	/** The athlete's thresholds for the step's discipline, or null. */
	profile: DisciplineProfileForResolver | null
	/** The step's effective discipline (step override or workout discipline). */
	effectiveDiscipline: string
	/** The polite live region — committed targets announce in human words. */
	announce?: (message: string) => void
	/** The quiet footer removal (§6.1); the host closes the popover first. */
	onRemove?: () => void
}

export function IntensityPopoverEditor({
	value,
	onChange,
	profile,
	effectiveDiscipline,
	announce,
	onRemove,
}: IntensityPopoverEditorProps) {
	const [draft, updateDraft] = useIntensityDraft(value, onChange)

	function update(fields: Partial<IntensityDraft>) {
		const next = { ...draft, ...fields }
		updateDraft(next)
		const target = draftTarget(next)
		if (target) announce?.(`Intensity set to ${intensityChipText(target)}`)
	}

	// The athlete's own recipe names the zone chips; without one, the step's
	// discipline's first built-in recipe stands in, then generic Z1–Z5.
	const chipLabels = zoneChipLabels(
		editorZoneRecipe(profile, effectiveDiscipline),
	)

	const activeGroup = kindGroupOf(draft.kind)

	function selectGroup(group: KindGroup) {
		if (group === activeGroup) return
		switch (group) {
			case 'pace':
				return update({ kind: 'pace' })
			case 'rpe':
				return update({ kind: 'rpe' })
			// The group reopens on the unit it was last authored in, so switching
			// kinds and back restores the athlete's own statement.
			case 'watts':
				return update({
					kind:
						draft.powerPctMin.trim() && !draft.powerMin.trim()
							? 'powerPct'
							: 'power',
				})
			case 'heartRate':
				return update({
					kind:
						draft.hrPctMin.trim() && !draft.hrBpmMin.trim() ? 'hrPct' : 'hrBpm',
				})
		}
	}

	const target = draftTarget(draft)

	return (
		<div className="flex flex-col gap-3" data-slot="intensity-popover-editor">
			<ZoneChips
				labels={chipLabels}
				selected={draft.kind === 'zoneLabel' ? draft.zoneLabel : null}
				onSelect={(label) => update({ kind: 'zoneLabel', zoneLabel: label })}
			/>

			<div
				className="text-muted-foreground flex flex-wrap items-center gap-x-1"
				data-slot="intensity-kind-row"
			>
				<span className="text-body-2xs">or set:</span>
				{kindRowOrder(effectiveDiscipline).map((group, index) => (
					<span key={group} className="inline-flex items-center">
						{index > 0 ? (
							<span aria-hidden className="text-muted-foreground/50 px-0.5">
								·
							</span>
						) : null}
						<button
							type="button"
							aria-pressed={group === activeGroup}
							onClick={() => selectGroup(group)}
							className={cn(
								'hover:text-foreground focus-visible:ring-ring min-h-11 cursor-pointer rounded-sm px-1 text-sm outline-none focus-visible:ring-2',
								group === activeGroup && 'text-foreground font-medium',
							)}
						>
							{KIND_GROUP_LABELS[group]}
						</button>
					</span>
				))}
			</div>

			{activeGroup === 'pace' ? (
				<RangeFields
					minLabel="Min pace"
					maxLabel="Max pace (optional)"
					minValue={draft.paceMin}
					maxValue={draft.paceMax}
					onMin={(paceMin) => update({ paceMin })}
					onMax={(paceMax) => update({ paceMax })}
					placeholder="4:40"
					nudge={PACE_NUDGE}
				/>
			) : activeGroup === 'watts' ? (
				<PowerFields draft={draft} profile={profile} update={update} />
			) : activeGroup === 'heartRate' ? (
				<HeartRateFields draft={draft} profile={profile} update={update} />
			) : activeGroup === 'rpe' ? (
				<RangeFields
					minLabel="Min RPE"
					maxLabel="Max RPE (optional)"
					minValue={draft.rpeMin}
					maxValue={draft.rpeMax}
					onMin={(rpeMin) => update({ rpeMin })}
					onMax={(rpeMax) => update({ rpeMax })}
					nudge={{ step: () => 1, min: 1, max: 10, start: 7 }}
				/>
			) : null}

			<p
				data-slot="intensity-provenance"
				className="text-muted-foreground border-border/60 border-t pt-2 text-xs"
			>
				{target
					? zoneEquivalentProvenance(
							target,
							zoneEquivalent(target, profile),
							resolvedRangeText(target, profile),
						)
					: draft.kind
						? 'not placed in a zone yet — finish the value'
						: 'no intensity set'}
			</p>

			{onRemove ? (
				<div className="flex justify-center">
					<Button type="button" variant="ghost" size="xs" onClick={onRemove}>
						Remove intensity
					</Button>
				</div>
			) : null}
		</div>
	)
}

// ——— Zone chips row ——————————————————————————————————————————————————————

function ZoneChips({
	labels,
	selected,
	onSelect,
}: {
	labels: string[]
	selected: string | null
	onSelect: (label: string) => void
}) {
	return (
		<div
			className="flex flex-wrap gap-1.5"
			role="group"
			aria-label="Zone"
			data-slot="intensity-zone-chips"
		>
			{labels.map((label, index) => {
				const active = selected === label
				return (
					<button
						key={label}
						type="button"
						aria-pressed={active}
						onClick={() => onSelect(label)}
						className={cn(
							'min-h-11 min-w-11 flex-1 cursor-pointer rounded-md px-2 text-sm font-semibold outline-none [font-variant-caps:small-caps]',
							ZONE_CHIP_TINT[chipStep(index)],
							'focus-visible:ring-ring text-foreground focus-visible:ring-2',
							active
								? 'ring-foreground/60 ring-2'
								: 'opacity-70 hover:opacity-100',
						)}
					>
						{label}
					</button>
				)
			})}
		</div>
	)
}

// ——— Watts — one field, W ⇄ %FTP ————————————————————————————————————————

function PowerFields({
	draft,
	profile,
	update,
}: {
	draft: IntensityDraft
	profile: DisciplineProfileForResolver | null
	update: (fields: Partial<IntensityDraft>) => void
}) {
	const unit = draft.kind === 'powerPct' ? 'pct' : 'w'

	function toggleTo(next: 'w' | 'pct') {
		if (next === unit) return
		const ftp = profile?.ftp
		if (next === 'pct') {
			const fields: Partial<IntensityDraft> = { kind: 'powerPct' }
			// Convert through FTP when it is known; otherwise the %FTP draft keeps
			// whatever was last authored there — a number is never invented.
			if (ftp) {
				const min = numberOrNull(draft.powerMin)
				const max = numberOrNull(draft.powerMax)
				fields.powerPctMin =
					min != null ? String(Math.round((min / ftp) * 100)) : ''
				fields.powerPctMax =
					max != null ? String(Math.round((max / ftp) * 100)) : ''
			}
			update(fields)
		} else {
			const fields: Partial<IntensityDraft> = { kind: 'power' }
			if (ftp) {
				const min = numberOrNull(draft.powerPctMin)
				const max = numberOrNull(draft.powerPctMax)
				fields.powerMin =
					min != null ? String(Math.round((min / 100) * ftp)) : ''
				fields.powerMax =
					max != null ? String(Math.round((max / 100) * ftp)) : ''
			}
			update(fields)
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<UnitToggle
				label="Power unit"
				options={[
					{ id: 'w', label: 'W' },
					{ id: 'pct', label: '%FTP' },
				]}
				active={unit}
				onSelect={(id) => toggleTo(id as 'w' | 'pct')}
			/>
			{unit === 'w' ? (
				<RangeFields
					minLabel="Min W"
					maxLabel="Max W (optional)"
					minValue={draft.powerMin}
					maxValue={draft.powerMax}
					onMin={(powerMin) => update({ powerMin })}
					onMax={(powerMax) => update({ powerMax })}
					nudge={{ step: () => 5, min: 1, start: 200 }}
				/>
			) : (
				<RangeFields
					minLabel="Min %FTP"
					maxLabel="Max %FTP (optional)"
					minValue={draft.powerPctMin}
					maxValue={draft.powerPctMax}
					onMin={(powerPctMin) => update({ powerPctMin })}
					onMax={(powerPctMax) => update({ powerPctMax })}
					nudge={{ step: () => 5, min: 1, max: 300, start: 90 }}
				/>
			)}
		</div>
	)
}

// ——— Heart rate — one field, bpm ⇄ %LTHR ⇄ %maxHR ———————————————————————

function HeartRateFields({
	draft,
	profile,
	update,
}: {
	draft: IntensityDraft
	profile: DisciplineProfileForResolver | null
	update: (fields: Partial<IntensityDraft>) => void
}) {
	const unit: HrUnit =
		draft.kind === 'hrPct'
			? draft.hrPctRef === 'max'
				? 'maxHr'
				: 'lthr'
			: 'bpm'

	function toggleTo(next: HrUnit) {
		if (next === unit) return
		const sourceMin = unit === 'bpm' ? draft.hrBpmMin : draft.hrPctMin
		const sourceMax = unit === 'bpm' ? draft.hrBpmMax : draft.hrPctMax
		const convert = (raw: string) => {
			const n = numberOrNull(raw)
			if (n == null) return null
			return convertHr(n, unit, next, profile)
		}
		const min = convert(sourceMin)
		const max = convert(sourceMax)
		const converted = min != null || max != null
		if (next === 'bpm') {
			const fields: Partial<IntensityDraft> = { kind: 'hrBpm' }
			// As with watts: convert through the threshold when known, otherwise
			// restore the bpm draft's own last-authored value.
			if (converted) {
				fields.hrBpmMin = min != null ? String(min) : ''
				fields.hrBpmMax = max != null ? String(max) : ''
			}
			update(fields)
		} else {
			const fields: Partial<IntensityDraft> = {
				kind: 'hrPct',
				hrPctRef: next === 'maxHr' ? 'max' : 'lthr',
			}
			if (converted) {
				fields.hrPctMin = min != null ? String(min) : ''
				fields.hrPctMax = max != null ? String(max) : ''
			} else if (unit !== 'bpm' && (sourceMin.trim() || sourceMax.trim())) {
				// %LTHR ⇄ %maxHR share one draft field. With no thresholds to
				// convert through, carrying the number across would silently turn
				// "90% LTHR" into "90% max HR" — a different physiological target —
				// so the field clears instead (never a reinterpreted value).
				fields.hrPctMin = ''
				fields.hrPctMax = ''
			}
			update(fields)
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<UnitToggle
				label="Heart rate unit"
				options={[
					{ id: 'bpm', label: 'bpm' },
					{ id: 'lthr', label: '%LTHR' },
					{ id: 'maxHr', label: '%maxHR' },
				]}
				active={unit}
				onSelect={(id) => toggleTo(id as HrUnit)}
			/>
			{unit === 'bpm' ? (
				<RangeFields
					minLabel="Min bpm"
					maxLabel="Max bpm (optional)"
					minValue={draft.hrBpmMin}
					maxValue={draft.hrBpmMax}
					onMin={(hrBpmMin) => update({ hrBpmMin })}
					onMax={(hrBpmMax) => update({ hrBpmMax })}
					nudge={{ step: () => 5, min: 40, start: 150 }}
				/>
			) : (
				<RangeFields
					minLabel={unit === 'maxHr' ? 'Min %maxHR' : 'Min %LTHR'}
					maxLabel={
						unit === 'maxHr' ? 'Max %maxHR (optional)' : 'Max %LTHR (optional)'
					}
					minValue={draft.hrPctMin}
					maxValue={draft.hrPctMax}
					onMin={(hrPctMin) => update({ hrPctMin })}
					onMax={(hrPctMax) => update({ hrPctMax })}
					nudge={{ step: () => 5, min: 1, max: 200, start: 90 }}
				/>
			)}
		</div>
	)
}

/** The mutually exclusive unit toggle — one segmented row, exactly one unit
 * pressed. Shared with the sets popover's kg ⇄ %1RM toggle (§5.2). */
export function UnitToggle({
	label,
	options,
	active,
	onSelect,
}: {
	label: string
	options: { id: string; label: string }[]
	active: string
	onSelect: (id: string) => void
}) {
	return (
		<div
			role="group"
			aria-label={label}
			className="border-input bg-muted/40 inline-flex w-fit rounded-lg border p-0.5"
		>
			{options.map((option) => (
				<button
					key={option.id}
					type="button"
					aria-pressed={option.id === active}
					onClick={() => onSelect(option.id)}
					className={cn(
						'focus-visible:ring-ring min-h-10 cursor-pointer rounded-md px-2.5 text-sm outline-none focus-visible:ring-2',
						option.id === active
							? 'bg-background text-foreground font-medium shadow-sm'
							: 'text-muted-foreground hover:text-foreground',
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	)
}

// ——— Range inputs with ± nudges —————————————————————————————————————————

/**
 * How a field's raw draft string nudges (§2.4 — every value is type-to-edit
 * with ± nudges, never stepper-only). Plain numbers by default; pace supplies
 * its own codec (clock text ⇄ sec/km). `start` seeds the first increase on an
 * empty field.
 */
type NudgeConfig = {
	step: (value: number) => number
	min: number
	max?: number
	start: number
	parse?: (raw: string) => number | null
	display?: (value: number) => string
}

const PACE_NUDGE: NudgeConfig = {
	// 5 s/km per nudge — the granularity pace targets are written in.
	step: () => 5,
	min: 60,
	start: 300,
	parse: parsePaceInput,
	display: formatPaceClock,
}

/**
 * The kind's min/max pair: 16 px text and a numeric keypad so mobile never
 * zooms (§9.2; pace also reads the keypad-friendly "4.40" form), 44 px
 * controls, type-to-edit with ± nudges. Raw text writes through the draft
 * codec — incomplete values serialize as the honest draft JSON, never a
 * coerced number.
 */
function RangeFields({
	minLabel,
	maxLabel,
	minValue,
	maxValue,
	onMin,
	onMax,
	placeholder,
	nudge,
}: {
	minLabel: string
	maxLabel: string
	minValue: string
	maxValue: string
	onMin: (value: string) => void
	onMax: (value: string) => void
	placeholder?: string
	nudge: NudgeConfig
}) {
	return (
		<div className="grid grid-cols-2 gap-2">
			<NudgeField
				label={minLabel}
				value={minValue}
				onChange={onMin}
				placeholder={placeholder}
				nudge={nudge}
			/>
			<NudgeField
				label={maxLabel}
				value={maxValue}
				onChange={onMax}
				placeholder={placeholder ?? '—'}
				nudge={nudge}
			/>
		</div>
	)
}

function NudgeField({
	label,
	value,
	onChange,
	placeholder,
	nudge,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	placeholder?: string
	nudge: NudgeConfig
}) {
	const id = useId()
	const parse = nudge.parse ?? numberOrNull
	const display = nudge.display ?? String
	const parsed = parse(value)

	function commit(next: number) {
		onChange(display(next))
	}

	function decrease() {
		if (parsed == null) return
		commit(Math.max(nudge.min, parsed - nudge.step(parsed)))
	}

	function increase() {
		const next = parsed == null ? nudge.start : parsed + nudge.step(parsed)
		commit(nudge.max != null ? Math.min(nudge.max, next) : next)
	}

	return (
		<div className="space-y-1">
			<label htmlFor={id} className="text-muted-foreground text-xs">
				{label}
			</label>
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="outline"
					aria-label={`Decrease ${label}`}
					disabled={parsed == null || parsed <= nudge.min}
					onClick={decrease}
					className="size-11 shrink-0 rounded-lg text-lg"
				>
					−
				</Button>
				<input
					id={id}
					type="text"
					inputMode="decimal"
					placeholder={placeholder ?? '—'}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="border-input bg-background focus-visible:ring-ring h-11 w-full min-w-0 flex-1 rounded-lg border px-1 text-center text-base font-medium tabular-nums outline-none focus-visible:ring-2"
				/>
				<Button
					type="button"
					variant="outline"
					aria-label={`Increase ${label}`}
					disabled={nudge.max != null && parsed != null && parsed >= nudge.max}
					onClick={increase}
					className="size-11 shrink-0 rounded-lg text-lg"
				>
					+
				</Button>
			</div>
		</div>
	)
}
