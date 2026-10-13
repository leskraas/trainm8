/**
 * **A kilo as an athlete types it** — `62,5` on a Norwegian keyboard, `62.5` on
 * an English one, and the same 62.5 kg either way.
 *
 * Why a text field and this parser rather than `type="number"`: a number input
 * is locale-dependent in ways the page cannot see. Chromium in an English locale
 * drops the comma from a typed `62,5` and posts `625` — ten times the weight, with
 * no error anywhere — and iOS Safari on a Norwegian keyboard offers only the
 * comma. A text field with `inputMode="decimal"` still opens the decimal keypad,
 * posts exactly what was typed, and leaves the reading to one place that accepts
 * both separators and refuses everything else.
 *
 * **Refused, never guessed:** a thousands separator (`1.000,5`), two separators,
 * a sign, an exponent. No kilo field in a lifting app takes a four-digit number,
 * so the ambiguity of `1,000` is not worth resolving; it is a refusal the athlete
 * sees in words.
 */
import { z } from 'zod/v3'

const KILO_PATTERN = /^(\d+)(?:[.,](\d+))?(?:\s*kg)?$/i

/** The number typed, or `null` where what was typed is not one number of
 * kilos. `0` parses: whether zero is allowed is the field's rule, not this one's. */
export function parseKiloInput(typed: string): number | null {
	const match = KILO_PATTERN.exec(typed.trim())
	if (!match) return null
	const value = Number(match[2] == null ? match[1] : `${match[1]}.${match[2]}`)
	return Number.isFinite(value) ? value : null
}

/**
 * The zod field for a required, positive kilo: reads either separator and, where
 * it cannot, refuses with `message` — the sentence the form shows under the field.
 */
export function kiloField(message: string) {
	return z.string().transform((typed, ctx) => {
		const kg = parseKiloInput(typed)
		if (kg == null || kg <= 0) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message })
			return z.NEVER
		}
		return kg
	})
}

/** {@link kiloField} where a blank field is an answer — `null`, "not given" —
 * rather than a refusal. Anything typed is still read or refused in words. */
export function optionalKiloField(message: string) {
	return z.string().transform((typed, ctx) => {
		if (typed.trim() === '') return null
		const kg = parseKiloInput(typed)
		if (kg == null || kg <= 0) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message })
			return z.NEVER
		}
		return kg
	})
}
