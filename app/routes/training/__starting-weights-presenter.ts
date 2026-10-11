/**
 * **Where a starting weight came from, as one sentence per lift.**
 *
 * The start screen asks one number per lift and pre-fills it with the program's
 * own published default. A pre-filled number the athlete cannot account for is a
 * number they cannot accept, so every field carries a hint naming its source —
 * the handoff's copy rule: *every number the program produced says where it came
 * from* (`docs/design/strength-program-handoff/README.md` §2).
 *
 * The **numbers** here are never restated: they are compared against and
 * rendered from `app/utils/strength/program.constants.ts`, so a change to
 * StrongLifts' empty bar moves the field and its sentence together. Only the
 * **prose** lives here, because prose is what the constants file does not carry.
 */
import { formatNbKg } from '#app/utils/format.ts'
import { PROGRAM_START_LABELS } from '#app/utils/labels.ts'
import {
	STRONGLIFTS_EMPTY_BAR_START_KG,
	STRONGLIFTS_PULL_START_KG,
	STRONGLIFTS_PULL_START_RANGE_TOP_KG,
} from '#app/utils/strength/program.constants.ts'

export type StartingWeightLift = {
	/** The program's own published starting weight, or `null` where it publishes
	 * a *seeding instruction* instead of a kilo. */
	defaultStartKg: number | null
	/** *"a weight you could lift for 10 reps"* — a rep count, not a weight. */
	startSeedRepMaxReps: number | null
}

/**
 * The sentence under a starting-weight field. Five cases, in the order the
 * athlete meets them:
 *
 * 1. StrongLifts' **empty bar** — a fixed absolute weight, which is the whole
 *    reason the program needs no 1RM.
 * 2. StrongLifts' **row and deadlift**, published as a range with the low end
 *    taken; the surface says it is the low end rather than presenting it as
 *    *the* published figure.
 * 3. Any other program that publishes a default kilo.
 * 4. A program that publishes a **seeding instruction** and no kilo — the field
 *    stays empty because inventing a number there would answer a question only
 *    the athlete can answer.
 * 5. A lift the program says nothing about, which is left blank and not started.
 */
export function startingWeightHint({
	programKey,
	programName,
	lift,
}: {
	programKey: string | null | undefined
	programName: string
	lift: StartingWeightLift
}): string {
	const { defaultStartKg, startSeedRepMaxReps } = lift
	const H = PROGRAM_START_LABELS.hints

	if (programKey === 'stronglifts-5x5' && defaultStartKg != null) {
		if (defaultStartKg === STRONGLIFTS_EMPTY_BAR_START_KG) {
			return H.emptyBar(programName, formatNbKg(defaultStartKg))
		}
		if (defaultStartKg === STRONGLIFTS_PULL_START_KG) {
			return H.pullRange(
				formatNbKg(STRONGLIFTS_PULL_START_KG),
				formatNbKg(STRONGLIFTS_PULL_START_RANGE_TOP_KG),
			)
		}
	}

	if (defaultStartKg != null) {
		return H.published(programName, formatNbKg(defaultStartKg))
	}
	if (startSeedRepMaxReps != null) {
		return H.repMax(programName, startSeedRepMaxReps)
	}
	return H.none(programName)
}

/** `5×5`, `1×5` — the scheme, on the label row beside the lift's name. */
export function schemeLabel(lift: {
	setCount: number
	repsPerSet: number
}): string {
	return `${lift.setCount}×${lift.repsPerSet}`
}
