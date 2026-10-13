/**
 * Small, pure helpers the Meg sub-pages share (round 2, ADR 0081): Norwegian
 * validation words at the field, and Norwegian figures.
 *
 * **Why translate validation messages here rather than in the schemas.** The
 * username, password, name and e-mail rules live in `user-validation.ts`, and
 * the sign-up and log-in pages still read them in English. Keeping one rule and
 * swapping only the words on Meg's pages means the rule can never drift between
 * the two; `MEG_VALIDATION_LABELS` maps each shared message, and anything Meg
 * wrote itself (already Norwegian) passes through.
 *
 * Zod's *default* messages ("Expected number, received nan") are not written
 * anywhere in the app, so they are replaced at parse time with
 * {@link megZodErrorMap} — a parse option, which changes no rule.
 */
import { type ZodErrorMap, ZodIssueCode } from 'zod/v3'
import {
	MEG_ANALYZE_LABELS,
	MEG_VALIDATION_LABELS,
	MEG_ZOD_ISSUE_LABELS,
} from '#app/utils/labels.ts'

/** The errors to show at a field, in Norwegian, blanks dropped. */
export function nbErrors(
	errors: ReadonlyArray<string | null | undefined> | null | undefined,
): string[] {
	return (errors ?? [])
		.filter((error): error is string => Boolean(error))
		.map((error) => MEG_VALIDATION_LABELS[error] ?? error)
}

/** A number with a decimal comma: `0,97`, `10,2`. */
export function nbDecimal(value: number, fractionDigits?: number): string {
	const text =
		fractionDigits == null ? String(value) : value.toFixed(fractionDigits)
	return text.replace('.', ',')
}

/** An effort's length: `30 s`, `20 min`. */
export function nbSeconds(seconds: number): string {
	return seconds < 60
		? MEG_ANALYZE_LABELS.seconds(seconds)
		: MEG_ANALYZE_LABELS.minutes(Math.round(seconds / 60))
}

/** Zod's default messages, in Norwegian, for the field kinds Meg checks. */
export const megZodErrorMap: ZodErrorMap = (issue) => {
	const labels = MEG_ZOD_ISSUE_LABELS
	switch (issue.code) {
		case ZodIssueCode.invalid_type:
			if (issue.received === 'undefined' || issue.received === 'null')
				return { message: labels.required }
			if (issue.expected === 'integer')
				return { message: labels.notAWholeNumber }
			if (issue.expected === 'number' || issue.received === 'nan')
				return { message: labels.notANumber }
			if (issue.expected === 'date') return { message: labels.invalidDate }
			return { message: labels.invalid }
		case ZodIssueCode.invalid_date:
			return { message: labels.invalidDate }
		case ZodIssueCode.too_small:
			if (issue.type === 'number') {
				return issue.minimum === 0 && !issue.inclusive
					? { message: labels.mustBePositive }
					: { message: labels.tooSmall(nbDecimal(Number(issue.minimum))) }
			}
			if (issue.type === 'string')
				return issue.minimum === 1
					? { message: labels.required }
					: { message: labels.tooShort(String(issue.minimum)) }
			return { message: labels.invalid }
		case ZodIssueCode.too_big:
			if (issue.type === 'number')
				return { message: labels.tooBig(nbDecimal(Number(issue.maximum))) }
			if (issue.type === 'string')
				return { message: labels.tooLong(String(issue.maximum)) }
			return { message: labels.invalid }
		case ZodIssueCode.not_finite:
			return { message: labels.notANumber }
		default:
			// Every other kind (`custom` refinements carry their own words and
			// never reach here) is a message Meg never shows on its own.
			return { message: labels.invalid }
	}
}
