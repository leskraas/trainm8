/**
 * The token editors' shared controls (workout-editor spec §2.4 + §9.2/§9.3):
 * the type-to-edit-with-±-nudges stepper every numeric token uses, its value
 * codecs, and the `useInputControl` binding helper. Extracted from the Token
 * Sentence editor so its popover bodies (`__sets-popover.tsx`,
 * `__token-sentence-editor.tsx`) share one instrument without a cycle.
 */
import { useInputControl } from '@conform-to/react'
import { useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import {
	formatDistance,
	formatDuration,
	parseDistance,
	parseDuration,
} from '#app/utils/format.ts'

// Conform metadata is typed loosely here, matching the editor modules: only
// names/keys/values are read, so the generics add noise without safety.
type FieldMeta = any

/** A `useInputControl` seeded from a field's metadata — the popover editors
 * all bind their Conform field this way. */
export function useFieldControl(meta: FieldMeta) {
	return useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue:
			typeof meta.initialValue === 'string' ? meta.initialValue : undefined,
	})
}

export function capitalize(text: string): string {
	return text ? text[0]!.toUpperCase() + text.slice(1) : text
}

// ——— Stepper value codecs ———————————————————————————————————————————————

/**
 * A numeric token editor: how the form field's string becomes a number, how a
 * stepped number is written back (always a string the schema accepts), and
 * the step curve. `start` seeds the first increase when the field is empty
 * (only rest can be empty — a bare `(rest)` token still renders).
 * `parseInput` covers fields whose form value isn't what the athlete types
 * (`restSeconds` stores raw seconds, edits as a duration). `min`/`max` bound
 * the ± nudges; typed values only honor `max` — the stepper floor is a nudge
 * convention, not a schema bound, and the athlete may author any value the
 * format layer parses (the schema is the truth).
 */
export type StepperConfig = {
	parse: (value: string) => number | null
	serialize: (value: number) => string
	display: (value: number) => string
	/** Parse athlete-typed text (defaults to `parse`). */
	parseInput?: (text: string) => number | null
	/** The touch keypad for the type-to-edit input (§9.2). */
	inputMode: 'decimal' | 'numeric'
	/** Step size at `value` — increments use `step(value)`, decrements `step(value - 1)`. */
	step: (value: number) => number
	min: number
	max?: number
	start: number
}

export const parseSeconds = (value: string) => {
	const n = Number(value)
	return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export const parseCount = (value: string) => {
	const n = Number(value)
	return Number.isInteger(n) && n > 0 ? n : null
}

const durationStep = (sec: number) => (sec < 120 ? 15 : sec < 1200 ? 60 : 300)

/** The stepper kinds the shared token popover routes to a plain stepper. */
export type StepperKind =
	| 'duration'
	| 'distance'
	| 'repeat'
	| 'rest'
	| 'restSeconds'

export const STEPPERS: Record<StepperKind, StepperConfig> = {
	duration: {
		parse: parseDuration,
		serialize: formatDuration,
		display: formatDuration,
		inputMode: 'decimal',
		step: durationStep,
		min: 15,
		start: 300,
	},
	rest: {
		parse: parseDuration,
		serialize: formatDuration,
		display: formatDuration,
		inputMode: 'decimal',
		step: (sec) => (sec < 120 ? 15 : 30),
		min: 15,
		start: 60,
	},
	restSeconds: {
		parse: parseSeconds,
		serialize: String,
		display: formatDuration,
		// The form value is raw seconds, but the athlete reads and types the
		// humane duration form (`1 min 30 s`).
		parseInput: parseDuration,
		inputMode: 'decimal',
		step: (sec) => (sec < 120 ? 15 : 30),
		min: 15,
		start: 60,
	},
	distance: {
		parse: (value) => parseDistance(value, { defaultUnit: 'm' }),
		serialize: formatDistance,
		display: formatDistance,
		inputMode: 'decimal',
		// Steps must land on values `formatDistance` renders losslessly (0.1 km
		// resolution above 1 km), or the round-trip would drift.
		step: (m) => (m < 1000 ? 100 : 500),
		min: 100,
		start: 1000,
	},
	repeat: {
		parse: parseCount,
		serialize: String,
		display: String,
		inputMode: 'numeric',
		step: () => 1,
		min: 1,
		max: 99,
		start: 2,
	},
}

/**
 * Type-to-edit with ± nudges — never stepper-only (§2.4, B4). The input is
 * the value: the athlete types in the same humane form the token renders
 * (`6 min`, `1.5 km`), and only text the format layer parses is written back
 * to the form — an unparseable draft stays local to the input, so the token
 * (this popover's anchor) never vanishes mid-edit and the athlete can never
 * author a red value from here. Nudges clamp to the config's range; controls
 * meet the ≥44 px touch target and the input the 16 px / keypad rules (§9.2).
 */
export function TypeToEditStepper({
	label,
	config,
	rawValue,
	announce,
	onChange,
	className,
}: {
	label: string
	config: StepperConfig
	rawValue: string
	announce: (message: string) => void
	onChange: (serialized: string) => void
	className?: string
}) {
	const fieldValue = rawValue.trim() ? config.parse(rawValue) : null
	const [text, setText] = useState(
		fieldValue != null ? config.display(fieldValue) : '',
	)

	function commit(next: number) {
		onChange(config.serialize(next))
		announce(`${capitalize(label)} set to ${config.display(next)}`)
	}

	function nudge(next: number) {
		setText(config.display(next))
		commit(next)
	}

	function decrease() {
		if (fieldValue == null) return
		nudge(Math.max(config.min, fieldValue - config.step(fieldValue - 1)))
	}

	function increase() {
		const next =
			fieldValue == null ? config.start : fieldValue + config.step(fieldValue)
		nudge(config.max != null ? Math.min(config.max, next) : next)
	}

	function handleTyped(nextText: string) {
		setText(nextText)
		const parsed = nextText.trim()
			? (config.parseInput ?? config.parse)(nextText)
			: null
		if (parsed == null) return
		if (config.max != null && parsed > config.max) return
		commit(parsed)
	}

	return (
		<div className={className ?? 'flex items-center gap-2'}>
			<Button
				type="button"
				variant="outline"
				aria-label={`Decrease ${label}`}
				disabled={fieldValue == null || fieldValue <= config.min}
				onClick={decrease}
				className="size-11 shrink-0 rounded-lg text-lg"
			>
				−
			</Button>
			<input
				type="text"
				inputMode={config.inputMode}
				aria-label={`${capitalize(label)} value`}
				value={text}
				onChange={(event) => handleTyped(event.target.value)}
				className="border-input bg-background focus-visible:ring-ring h-11 w-full min-w-0 flex-1 rounded-lg border px-3 text-center text-base font-medium tabular-nums outline-none focus-visible:ring-2"
			/>
			<Button
				type="button"
				variant="outline"
				aria-label={`Increase ${label}`}
				disabled={
					config.max != null && fieldValue != null && fieldValue >= config.max
				}
				onClick={increase}
				className="size-11 shrink-0 rounded-lg text-lg"
			>
				+
			</Button>
		</div>
	)
}
