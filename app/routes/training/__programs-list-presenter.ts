/**
 * **What a program card says**, worked out once and away from the JSX.
 *
 * The card is a claim about twelve weeks of somebody's training, so every line
 * on it is a restatement of the seeded **Program Definition** and never a
 * sentence this module invented: the scheme, the increment and the **Stall
 * Response** all arrive on `ProgramSummary`, which is built from
 * `app/utils/strength/program.constants.ts`. They arrive **typed** — an
 * `Increment` and a `StallResponse`, not sentences — and what this module does
 * is say them in the phone-width phrasing the design asks for, in Norwegian
 * (ADR 0081, words in `labels.ts`) and in the two pieces the card sets at
 * different weights: the scheme (`5×5`) and the rules that move it
 * (`+2,5 kg · −10 % etter 3 stopp`). It renders and never parses, so no wording
 * anywhere is load-bearing, and every case of both unions is answered here
 * rather than a pattern being matched and the rest falling through.
 *
 * Nothing here knows a program by name. A fourth program seeded tomorrow gets a
 * card without this file changing.
 */
import { formatNbKg } from '#app/utils/format.ts'
import {
	NB_PROGRAM_PROVENANCE_NOTES,
	PROGRAM_RULE_LABELS as R,
	PROGRAMS_LABELS,
} from '#app/utils/labels.ts'
import {
	type Increment,
	type StallResponse,
} from '#app/utils/strength/program-rules.ts'
import { type ProgramLiftSummary } from '#app/utils/strength-program.server.ts'

/**
 * `etter 3 stopp` — or, where one is enough, `ved første stopp`.
 *
 * **Stall** is the word `GLOSSARY.md` fixes for this counter (*Stall Count*,
 * which explicitly declines "misses"); `stopp` is its word on the card.
 */
function stallCount(stallsBeforeResponse: number): string {
	return stallsBeforeResponse === 1
		? R.firstStall
		: R.afterStalls(stallsBeforeResponse)
}

/**
 * The **Stall Response** in the width a phone has: `−10 % etter 3 stopp`.
 *
 * Read off the typed union — which of the three remedies fires is a `kind`, not
 * a sentence to be re-read — so rewording anything cannot change a number.
 *
 * The minus sign is a real minus (U+2212), not a hyphen — the design's own
 * copy — because a cut is the one number on the card an athlete must not
 * misread.
 */
function shortStallResponse(lift: ProgramLiftSummary): string {
	const after = stallCount(lift.stallsBeforeResponse)
	const response: StallResponse = lift.stallResponse
	switch (response.kind) {
		case 'stallCut':
			return R.stallCut(formatNbKg(response.pct), after)
		case 'weightRollback':
			return R.rollback(response.sessionsBack, after)
		case 'anchorReEstimate':
			return R.reEstimate(response.estimator, after)
	}
}

/**
 * What the increment does, in the program's own basis — `+2,5 kg`. The four
 * bases are not interchangeable and none is flattened to "+2,5 kg": GreySkull's
 * doubling is said as the rule it is, and never as a table. The program
 * overview reads it too, as Arket M's `neste: +2,5 kg`.
 */
export function incrementText(increment: Increment): string {
	switch (increment.kind) {
		case 'absolute':
			return R.absolute(formatNbKg(increment.deltaKg))
		case 'pctOfLastTopSet':
			return R.pctOfLastTopSet(formatNbKg(increment.pct))
		case 'byAmrapReps':
			return R.byAmrapReps(
				increment.table
					.map((row) => R.amrapRow(row.minReps, formatNbKg(row.deltaKg)))
					.join(', '),
			)
		case 'multipliedOnAmrap':
			return R.multipliedOnAmrap(
				formatNbKg(increment.baseDeltaKg),
				increment.atOrAboveReps,
			)
	}
}

/**
 * The program's provenance note in Norwegian where one is written, else the
 * stored note as it is. Display only: the stored note stays the record.
 */
export function programProvenanceNote(program: {
	key: string
	variantId: string
	provenanceNote: string | null
}): string | null {
	if (!program.provenanceNote) return null
	return (
		NB_PROGRAM_PROVENANCE_NOTES[`${program.key}:${program.variantId}`] ??
		program.provenanceNote
	)
}

/**
 * `5×5` — what the athlete does tonight.
 *
 * Split from the rules below it because the two answer different questions. The
 * scheme is what you walk to the rack and do; the increment and the **Stall
 * Response** are what the program will do to the weight over weeks. Rendering
 * them as one run-on sentence made a card of five lifts read as one grey
 * paragraph, so the card states them at two different weights.
 */
export function liftScheme(lift: ProgramLiftSummary): string {
	return `${lift.setCount}×${lift.repsPerSet}`
}

/**
 * `+2,5 kg · −10 % etter 3 stopp` — what the program does to the weight over
 * time. Real, and quieter than the scheme: it matters in week six, not tonight.
 */
export function liftRules(lift: ProgramLiftSummary): string {
	return [incrementText(lift.increment), shortStallResponse(lift)].join(' · ')
}

/**
 * `2 dagsoppsett · Økt A / Økt B` — the week's shape, counted from the
 * definition's own day ids rather than described.
 */
export function shapeText(dayIds: string[]): string {
	return PROGRAMS_LABELS.shape(dayIds)
}

/** A stable React key for a lift: a program may run the same movement with two
 * pieces of equipment, so the exercise id alone is not unique. */
export function liftKey(lift: ProgramLiftSummary): string {
	return `${lift.exerciseId}-${lift.equipment ?? ''}`
}

/**
 * The instance id of the run an athlete has going for each program, if any.
 * Only an `active` run counts: a paused or ended one is history, and history
 * does not get the primary button.
 */
export function runningInstanceIds(
	instances: ReadonlyArray<{ id: string; programId: string; status: string }>,
): Map<string, string> {
	return new Map(
		instances
			.filter((instance) => instance.status === 'active')
			.map((instance) => [instance.programId, instance.id]),
	)
}
