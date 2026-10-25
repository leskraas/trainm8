/**
 * Where in trainm8 a reader's deep links point (ADR 0092 §5, ADR 0093 §3).
 */

/** Where the athlete answers what only they can answer: I dag. */
export const ATHLETE_YES_PATH = '/'

export const sessionPath = (sessionId: string) =>
	`/training/sessions/${sessionId}`
