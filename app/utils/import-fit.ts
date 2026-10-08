/**
 * The rules of the import loop (#505 stories 78–82, ADR 0049 as amended), in
 * one place, so the server that links and the home row that asks can never
 * disagree about them. Pure: no database, no clock of its own — callers pass
 * the local days.
 */

/** How many days back "hva var dette?" is asked about an import. */
export const IMPORT_QUESTION_DAYS = 14

/** How far back _Gjort_ is offered: the session's day and the six before it. */
export const MARK_DONE_REACH_DAYS = 6

/**
 * A session that exists only to carry its Recording — `recorded` while
 * structureless, `detected` once Structure Detection materialized a Workout —
 * and that the athlete has not adopted (#460). An adopted one carries their
 * work as well, so it is not an _ekstra_ any more and outlives its Recording.
 */
export function isRecordingOnlySource(session: {
	source: string
	adoptedAt: Date | null
}): boolean {
	if (session.adoptedAt != null) return false
	return session.source === 'recorded' || session.source === 'detected'
}

/**
 * Whether a session is one an import could be: same local day, same sport,
 * a planned session (it carries a Workout and is not itself a recording-only
 * session), holding no Recording. `'other'` (ADR 0015) fits nothing. The rule
 * auto-match links by, "hva var dette?" offers by, and a link is checked by.
 */
export function fitsImport(
	session: {
		source: string
		adoptedAt: Date | null
		hasRecording: boolean
		workoutDiscipline: string | null
		dayKey: string
	},
	imported: { discipline: string; dayKey: string },
): boolean {
	return (
		imported.discipline !== 'other' &&
		session.dayKey === imported.dayKey &&
		session.workoutDiscipline === imported.discipline &&
		!session.hasRecording &&
		!isRecordingOnlySource(session)
	)
}

/** Strength is logged set by set (ADR 0056); no import brings its numbers. */
export function importBringsNumbers(discipline: string): boolean {
	return discipline !== 'strength' && discipline !== 'other'
}

/**
 * Whether a session may be marked _Gjort_ by hand (#505 story 82): not yet
 * done or still open (`scheduled`, or marked `missed`), holding no Recording,
 * carrying a Workout in a sport an import can bring numbers for, on a day that
 * has begun and is at most a week back.
 */
export function canMarkDone(
	session: {
		status: string
		hasRecording: boolean
		workoutDiscipline: string | null
		dayKey: string
	},
	{ todayKey, reachFromKey }: { todayKey: string; reachFromKey: string },
): boolean {
	return (
		(session.status === 'scheduled' || session.status === 'missed') &&
		!session.hasRecording &&
		session.workoutDiscipline != null &&
		importBringsNumbers(session.workoutDiscipline) &&
		session.dayKey <= todayKey &&
		session.dayKey >= reachFromKey
	)
}
