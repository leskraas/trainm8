/**
 * **What a program card says**, worked out once and away from the JSX.
 *
 * The card is a claim about twelve weeks of somebody's training, so every line
 * on it is a restatement of the seeded **Program Definition** and never a
 * sentence this module invented: the scheme, the increment and the **Stall
 * Response** all arrive on `ProgramSummary`, which is built from
 * `app/utils/strength/program.constants.ts`. They arrive **typed** — an
 * `Increment` and a `StallResponse`, not sentences — and what this module does
 * is say them in the phone-width phrasing the design asks for: `5×5 · +2.5 kg ·
 * −10 % after 3 stalls`. It renders and never parses, so no wording anywhere is
 * load-bearing, and every case of both unions is answered here rather than a
 * pattern being matched and the rest falling through.
 *
 * Nothing here knows a program by name. A fourth program seeded tomorrow gets a
 * card without this file changing.
 */
import {
	type Increment,
	type StallResponse,
} from '#app/utils/strength/program-rules.ts'
import { formatKg } from '#app/utils/strength/program.constants.ts'
import { type ProgramLiftSummary } from '#app/utils/strength-program.server.ts'

/**
 * `after 3 stalls` — or, where one is enough, the first one.
 *
 * **Stall** is the word `CONTEXT.md` fixes for this counter (*Stall Count*,
 * which explicitly declines "misses"), so it is the word used here and the word
 * every other surface in the module uses.
 */
function stallCount(stallsBeforeResponse: number): string {
	return stallsBeforeResponse === 1
		? 'on the first stall'
		: `after ${stallsBeforeResponse} stalls`
}

/**
 * The **Stall Response** in the width a phone has: `−10 % after 3 stalls`.
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
			return `−${formatKg(response.pct)} % ${after}`
		case 'weightRollback':
			return `rollback ${response.sessionsBack} sessions ${after}`
		case 'anchorReEstimate':
			return `re-estimate (${response.estimator}) ${after}`
	}
}

/**
 * What the increment does, in the program's own basis. The four bases are not
 * interchangeable and none is flattened to "+2.5 kg" — GreySkull's doubling is
 * said as the rule it is, and never as a table.
 */
function shortIncrement(lift: ProgramLiftSummary): string {
	const increment: Increment = lift.increment
	switch (increment.kind) {
		case 'absolute':
			return `+${formatKg(increment.deltaKg)} kg`
		case 'pctOfLastTopSet':
			return `+${formatKg(increment.pct)} % of the last top set`
		case 'byAmrapReps':
			return `by the reps on the last set (${increment.table
				.map((row) => `${row.minReps}+ → +${formatKg(row.deltaKg)} kg`)
				.join(', ')})`
		case 'multipliedOnAmrap':
			return `+${formatKg(increment.baseDeltaKg)} kg, doubled at ≥${increment.atOrAboveReps} reps`
	}
}

/** `5×5 · +2.5 kg · −10 % after 3 stalls` — everything the lift promises. */
export function liftDetail(lift: ProgramLiftSummary): string {
	return [
		`${lift.setCount}×${lift.repsPerSet}`,
		shortIncrement(lift),
		shortStallResponse(lift),
	].join(' · ')
}

/**
 * `2 day shapes · Workout A / Workout B` — the week's shape, counted from the
 * definition's own day ids rather than described.
 */
export function shapeText(dayIds: string[]): string {
	const shapes =
		dayIds.length === 1 ? '1 day shape' : `${dayIds.length} day shapes`
	return `${shapes} · ${dayIds.map((dayId) => `Workout ${dayId}`).join(' / ')}`
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
