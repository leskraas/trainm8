/**
 * **Reading** (ADR 0092 §6–§7): every number trainm8 states to anything
 * outside its own screens is one of these — available with its value, or
 * unavailable with its reason and the athlete's words for it. Never a zero,
 * a blank or an omitted field.
 *
 * And the **provenance gate**: an action never builds a Reading by hand. It
 * calls {@link reading} with the value (or {@link unavailable}) and the value's
 * binding set, and the gate asks `sourceTerms` (ADR 0098) for the caller's
 * surface. For a model caller a closed platform withholds the value
 * (`source-terms`); an open one sends it and puts the platform's credit on the
 * result, worded for what the value is (`origin`). No action decides terms
 * on its own.
 */

import { z } from 'zod/v4'
import {
	ORIGIN_PLATFORMS,
	type OriginPlatform,
} from '#app/integrations/shared/origin-platform.ts'
import {
	READING_UNAVAILABLE_LABELS,
	SOURCE_ATTRIBUTION_LABELS,
} from '#app/utils/labels.ts'
import { recordingSource } from '#app/utils/source-attribution.ts'
import {
	ATTRIBUTIONS,
	type Attribution,
	sourceTerms,
} from '#app/utils/source-terms.ts'
import {
	type Caller,
	isModelCaller,
	UNAVAILABLE_REASONS,
	type UnavailableReason,
} from './vocabulary.ts'

export type Reading<T> =
	| { status: 'available'; value: T }
	| {
			status: 'unavailable'
			reason: UnavailableReason
			/** `labels.ts`, the athlete's words. */
			label: string
			/** Only with `source-terms`: the platforms whose terms closed it. */
			platforms?: OriginPlatform[]
	  }

/** A number's absence, said with its reason. */
export type Unavailable = { readonly unavailable: UnavailableReason }

export function unavailable(reason: UnavailableReason): Unavailable {
	return { unavailable: reason }
}

function isUnavailable(value: unknown): value is Unavailable {
	return (
		typeof value === 'object' &&
		value !== null &&
		'unavailable' in value &&
		Object.keys(value).length === 1
	)
}

/**
 * A credit a result owes for values it carries (ADR 0098 §3), in the
 * platform's own wording.
 */
export type Credit = { platform: Attribution; text: string }

/**
 * The slice of a run's context the gate reads: who is calling, and where the
 * credits a value owes are collected for the result.
 */
export type ReadingContext = {
	caller: Caller
	credit: (credit: Credit) => void
}

/**
 * What a value is, for the credit it owes (ADR 0098 §3): a figure the
 * Recording itself states (its duration, its distance) owes the recording's
 * source line; anything computed from the data owes the derived-data line.
 */
export type ValueOrigin = 'recording' | 'derived'

/**
 * The credit a value of this origin owes this platform, in the platform's own
 * words, through the same helpers the screens use. A recording's line names
 * no device: the device name is provider text, which never crosses to a model
 * (ADR 0092 §7), so it is ADR 0098 §3's plain brand line.
 */
function creditFor(attribution: Attribution, origin: ValueOrigin): Credit {
	const text =
		origin === 'recording'
			? (recordingSource({ originPlatform: attribution, deviceName: null })
					?.text ?? SOURCE_ATTRIBUTION_LABELS.derived[attribution])
			: SOURCE_ATTRIBUTION_LABELS.derived[attribution]
	return { platform: attribution, text }
}

/**
 * Build one Reading through the provenance gate (ADR 0092 §7).
 *
 * `bindingSet` is ADR 0098 §1's: an import's Origin Platform plus its
 * aliases'; for a derived value every import the computation read; empty for
 * plan-side and athlete-entered values. A value that is `null` or not finite
 * is never sent as a number: pass `unavailable(reason)` instead, and a bare
 * `null` throws, so no caller can turn "unknown" into a blank by accident.
 */
export function reading<T>(
	value: T | Unavailable,
	bindingSet: Iterable<OriginPlatform>,
	ctx: ReadingContext,
	{ origin = 'derived' }: { origin?: ValueOrigin } = {},
): Reading<Exclude<T, Unavailable>> {
	if (isUnavailable(value)) return unavailableReading(value.unavailable)
	if (value === null || value === undefined) {
		throw new Error(
			'reading() was given no value: pass unavailable(reason) to say why.',
		)
	}
	if (typeof value === 'number' && !Number.isFinite(value)) {
		throw new Error('reading() was given a number that is not finite.')
	}
	const verdict = sourceTerms(
		bindingSet,
		isModelCaller(ctx.caller) ? 'model' : 'screen',
	)
	if (!verdict.allowed) {
		return {
			status: 'unavailable',
			reason: 'source-terms',
			label: READING_UNAVAILABLE_LABELS['source-terms'],
			platforms: verdict.platforms,
		}
	}
	for (const attribution of verdict.attributions) {
		ctx.credit(creditFor(attribution, origin))
	}
	return { status: 'available', value: value as Exclude<T, Unavailable> }
}

function unavailableReading(reason: UnavailableReason): Reading<never> {
	return {
		status: 'unavailable',
		reason,
		label: READING_UNAVAILABLE_LABELS[reason],
	}
}

// ── schemas ──────────────────────────────────────────────────────────────────

/**
 * Every Reading schema the registry builds, so the schema walk in
 * `parity.test.ts` can tell a Reading's own `value` from a bare number.
 */
export const READING_SCHEMAS = new WeakSet<z.ZodType>()

const UnavailableReadingSchema = z.object({
	status: z.literal('unavailable'),
	reason: z.enum(UNAVAILABLE_REASONS),
	label: z.string(),
	platforms: z.array(z.enum(ORIGIN_PLATFORMS)).optional(),
})

/** The output schema of a `Reading<T>` of `value`. */
export function readingSchema<T extends z.ZodType>(value: T) {
	const schema = z.discriminatedUnion('status', [
		z.object({ status: z.literal('available'), value }),
		UnavailableReadingSchema,
	])
	READING_SCHEMAS.add(schema)
	return schema
}

/** `Reading<number>`, the common case. */
export const NumberReading = () => readingSchema(z.number())

// ── athlete text (§7) ────────────────────────────────────────────────────────

/**
 * Text the athlete wrote — a Session Log, their own workout's title — as it
 * crosses to a model: one field, marked as theirs, length-capped, and never
 * concatenated into a sentence of trainm8's (ADR 0092 §7).
 */
export type AthleteText = { by: 'athlete'; text: string }

export const ATHLETE_TEXT_MAX = 2000

export function athleteText(text: string, max = ATHLETE_TEXT_MAX): AthleteText {
	return {
		by: 'athlete',
		text: text.length > max ? `${text.slice(0, max - 1)}…` : text,
	}
}

export const AthleteTextSchema = z.object({
	by: z.literal('athlete'),
	text: z.string().max(ATHLETE_TEXT_MAX),
})

export const CreditSchema = z.object({
	platform: z.enum(ATTRIBUTIONS),
	text: z.string(),
})
