/**
 * **What a program card says**, worked out once and away from the JSX.
 *
 * The card is a claim about twelve weeks of somebody's training, so every line
 * on it is a restatement of the seeded **Program Definition** and never a
 * sentence this module invented: the scheme, the increment and the **Stall
 * Response** all arrive on `ProgramSummary`, which is built from
 * `app/utils/strength/program.constants.ts`. What this module does is *shorten*
 * them to the phone-width phrasing the design asks for — `5×5 · +2.5 kg ·
 * −10 % after 3 stalls` rather than the long-form prose the summary carries —
 * and it refuses to shorten anything it does not recognise, falling back to the
 * summary's own words rather than guessing.
 *
 * Nothing here knows a program by name. A fourth program seeded tomorrow gets a
 * card without this file changing.
 */
import { type ProgramLiftSummary } from '#app/utils/strength-program.server.ts'

/**
 * The long forms `strength-program.server.ts` produces, and the short forms the
 * card wants. Each pattern is anchored, so an unrecognised sentence falls
 * through to itself rather than being half-rewritten.
 */
const STALL_CUT = /^Stall Cut of ([\d.]+) % /
const WEIGHT_ROLLBACK = /^Weight Rollback (\d+) sessions /
const ANCHOR_RE_ESTIMATE = /^Anchor Re-estimate \((.+)\) /
const DOUBLED_INCREMENT =
	/^\+([\d.]+) kg, doubled at (\d+)\+ reps on the last set$/

/** `after 3 stalls` — or, where one miss is enough, the miss itself. */
function stallCount(stallsBeforeResponse: number): string {
	return stallsBeforeResponse === 1
		? 'on the first miss'
		: `after ${stallsBeforeResponse} stalls`
}

/**
 * The **Stall Response** in the width a phone has: `−10 % after 3 stalls`.
 *
 * The minus sign is a real minus (U+2212), not a hyphen — the design's own
 * copy — because a cut is the one number on the card an athlete must not
 * misread.
 */
function shortStallResponse(lift: ProgramLiftSummary): string {
	const after = stallCount(lift.stallsBeforeResponse)
	const cut = STALL_CUT.exec(lift.stallResponseText)
	if (cut) return `−${cut[1]} % ${after}`
	const rollback = WEIGHT_ROLLBACK.exec(lift.stallResponseText)
	if (rollback) return `rollback ${rollback[1]} sessions ${after}`
	const reEstimate = ANCHOR_RE_ESTIMATE.exec(lift.stallResponseText)
	if (reEstimate) return `re-estimate (${reEstimate[1]}) ${after}`
	return lift.stallResponseText
}

/** GreySkull's doubling rule, said as a rule and not as a table. */
function shortIncrement(lift: ProgramLiftSummary): string {
	const doubled = DOUBLED_INCREMENT.exec(lift.incrementText)
	return doubled
		? `+${doubled[1]} kg, doubled at ≥${doubled[2]} reps`
		: lift.incrementText
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
