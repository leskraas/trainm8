/**
 * The **Day Stamp** — the minimal one-step block a tapped empty day writes, and
 * the words the cell uses to offer it (ADR 0065 §5).
 *
 * Nothing here parses anything. ADR 0027 §1 decides *render, never parse* and
 * rejects free-text authoring with live parsing by name; this path stamps a
 * structure and lets the Token Sentence render it, which is the same rule seen
 * from the other side. The athlete then edits **values** through the editing
 * instrument that already exists — they never supply structure, and there is no
 * grammar anywhere on this path to be invalid against.
 *
 * **Why a stamp and not a typed title.** A typed title makes a session with no
 * shape: no profile bars, no expanded steps, no Planned TSS, nothing for
 * adherence to compare an import against. It would put a class of session on the
 * calendar that every derived number in the app is blind to. One step of a known
 * duration at a known intensity is a real prescription from the first tap.
 */
import { deriveWorkoutTitle } from './session-title.ts'
import {
	type CardioDiscipline,
	type Discipline,
	isCardioDiscipline,
	type WorkoutAuthoringInput,
} from './workout-schema.ts'
import {
	parseWorkoutSentence,
	type SentenceExercise,
} from './workout-sentence.ts'
import { ZONE_WORDS } from './zones/words.ts'

/**
 * The stamped step's duration. Three quarters of an hour is the shape of an
 * ordinary session in every endurance discipline — long enough to be a real
 * prescription, short enough that nobody is surprised by it — and it is a token
 * the athlete retypes in one tap if it is wrong.
 */
export const STAMP_DURATION_SEC = 45 * 60

/**
 * The stamped step's intensity, as an authored **Zone Label**. A zone is the
 * one intensity statement that needs nothing of the athlete to be legible: a
 * pace or a power target would either fabricate a number or refuse to render,
 * where `rolig` reads as itself and *additionally* resolves to concrete
 * bpm/watts for an athlete whose Discipline Profile can say so.
 *
 * Zone 2's word and never the code `Z2`: a code is a recipe's band label, and
 * Stryd's `Z2` is zone 3 (#627). The word reads through the band the athlete's
 * recipe declares for zone 2.
 */
export const STAMP_ZONE_LABEL = ZONE_WORDS[2]

/**
 * The stamped session's **Workout Intent**. `endurance` is not a guess about the
 * athlete — it is the reading of the prescription that was just stamped: 45
 * minutes in zone 2 *is* an endurance session, and the intent moves with the
 * intensity token the moment the athlete changes it on the full route.
 */
export const STAMP_INTENT = 'endurance' as const

/**
 * What the cell offers, in the notation's own words — so the button says the
 * sentence the row is about to render rather than a description of it.
 */
export const STAMP_SENTENCE = `45 min ${STAMP_ZONE_LABEL}`

/**
 * Whether a Discipline is one the line can say. A cardio step states a duration
 * and an intensity and is complete; a **strength** step is required to name a
 * lift (`exerciseId`), and no lift can be derived from a tap on a Thursday. So
 * strength is offered on the chip row and taken to the full route — the **More**
 * escape doing exactly the job it exists for — rather than stamped as a
 * half-made session or silently dropped from the athlete's own vocabulary.
 */
export function isStampableDiscipline(
	discipline: Discipline,
): discipline is CardioDiscipline {
	return isCardioDiscipline(discipline)
}

/**
 * The stamped prescription, as the very same {@link WorkoutAuthoringInput} the
 * full authoring route posts. Same shape, same validation, same
 * `createWorkoutSession` — which is what makes a session authored from a cell
 * indistinguishable from one authored on the full route, deliberately (ADR 0065).
 *
 * The title is **derived** from the structure by the shared deriver, not typed
 * and not invented: `45 min rolig` is what the session is.
 */
export function buildDayStamp({
	discipline,
	scheduledAt,
}: {
	discipline: CardioDiscipline
	scheduledAt: Date
}): WorkoutAuthoringInput {
	const structure = {
		discipline,
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio' as const,
						discipline,
						durationSec: STAMP_DURATION_SEC,
						intensity: {
							kind: 'zoneLabel' as const,
							label: STAMP_ZONE_LABEL,
						},
					},
				],
			},
		],
	}
	return {
		...structure,
		title: deriveWorkoutTitle(structure),
		intent: STAMP_INTENT,
		scheduledAt,
	}
}

/** The longest title a Workout takes (`WorkoutAuthoringSchema`). */
const TITLE_MAX = 120

/**
 * A **written** session (#505 stories 35–40): the sentence the athlete typed on
 * the writing line, read into structure by `parseWorkoutSentence` and handed
 * to the same `createWorkoutSession` a stamp goes through. Null when the reader
 * is unsure of anything in it — the server reads the sentence again rather
 * than trusting the client's preview, and writes nothing it could not read.
 *
 * The title is the sentence itself: the athlete's own words name the session
 * (`3x10 min terskel`), as a name is content and not chrome (ADR 0027 A3).
 */
export function buildWrittenSession({
	sentence,
	discipline,
	scheduledAt,
	exercises,
}: {
	sentence: string
	/** The chip; `strength` is allowed, since a lift names its own sport. */
	discipline: Discipline | null
	scheduledAt: Date
	/** The athlete's exercise catalogue, for a sentence that names lifts (ADR 0089). */
	exercises?: readonly SentenceExercise[]
}): WorkoutAuthoringInput | null {
	const parsed = parseWorkoutSentence(sentence, { discipline, exercises })
	if (!parsed.structure || !parsed.intent) return null
	return {
		...parsed.structure,
		title: sentence.trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX),
		intent: parsed.intent,
		scheduledAt,
	}
}
