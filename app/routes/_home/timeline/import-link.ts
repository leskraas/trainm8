/**
 * What I dag says about imports, row by row (#505 stories 78–82, ADR 0049 as
 * amended). Pure: ledger rows in, words and offers out — the Seam 2 half of
 * the import loop, whose server half is `autoSaveImport` and
 * `import-link.server.ts`.
 *
 * - **ekstra** — a session that exists only because an activity was recorded
 *   (Session Source `recorded` / `detected`): no plan stood behind it.
 * - **"hva var dette?"** — asked only when the app is unsure: an ekstra session
 *   nobody has answered for, on a day that still has a planned session of the
 *   same sport with no Recording. Auto-save links when exactly one plan fits,
 *   so this is the day two fitted, or the plan was written after the run
 *   landed. Never asked about Annet, `'other'`, or an answered import.
 * - **Angre kobling** — on a planned session holding an import.
 * - **Koble igjen** — on the ekstra session an Angre kobling made, while the
 *   session it came from is still on I dag and still has no Recording.
 * - **"tallene kommer fra importen"** — a done session with no numbers, when an
 *   import is connected to bring them; an honest "uten tall" otherwise.
 */

import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import { IMPORT_LINK_LABELS, MARK_DONE_LABELS } from '#app/utils/labels.ts'
import { type SessionRow } from '#app/utils/session-ledger-rows.ts'

/** The offer on an import's row. One at a time: the row has one question. */
export type TimelineImportLink =
	| {
			kind: 'ask'
			importId: string
			question: string
			note: string
			/** The group's accessible name. */
			label: string
			/** "Det var <title>", one per planned session that fits. */
			options: Array<{ sessionId: string; label: string }>
			keepLabel: string
			/** Null where Annet changes nothing: the sport has no track anyway. */
			annetLabel: string | null
	  }
	| {
			kind: 'undo'
			importId: string
			actionLabel: string
			label: string
			note: string
	  }
	| {
			kind: 'relink'
			importId: string
			actionLabel: string
			label: string
			note: string
	  }

export type TimelineImportFacts = {
	/** `ekstra` on a recorded session with no plan behind it; else null. */
	extraLabel: string | null
	importLink: TimelineImportLink | null
	/** A done session with no numbers says where they will come from. */
	doneNote: string | null
	/** _Gjort_ by hand, on a session of a day that has begun; else null. */
	markDone: { actionLabel: string; label: string } | null
}

/** How far back _Gjort_ is offered: this day and the six before it. */
const MARK_DONE_REACH_DAYS = 6

/** A session that exists only to carry its Recording — no plan behind it. */
function isRecordedOnly(row: SessionRow): boolean {
	const { session } = row
	return (
		session.recording != null &&
		(session.source === 'recorded' || session.source === 'detected')
	)
}

/** Strength is logged set by set (ADR 0056); no import brings its numbers. */
function bringsNumbers(discipline: string): boolean {
	return discipline !== 'strength' && discipline !== 'other'
}

/**
 * The import facts for every session in the ledger, keyed by session id. One
 * pass over all rows, because a row's question reads its day's other rows and
 * Koble igjen reads a session that may be anywhere on I dag.
 */
export function buildImportFacts(
	rows: readonly SessionRow[],
	{
		timezone,
		todayKey,
		importConnected,
		trackDisciplines,
	}: {
		timezone: string
		todayKey: string
		/** Whether an import source (intervals.icu, Strava) is connected. */
		importConnected: boolean
		/** The plan's tracks' sports: where Annet takes a session out of. */
		trackDisciplines: ReadonlySet<string>
	},
): Map<string, TimelineImportFacts> {
	const dayOf = (row: SessionRow) =>
		localDate(new Date(row.session.scheduledAt), timezone)
	const byId = new Map(rows.map((row) => [row.session.id, row]))
	const byDay = new Map<string, SessionRow[]>()
	for (const row of rows) {
		const key = dayOf(row)
		byDay.set(key, [...(byDay.get(key) ?? []), row])
	}
	const markDoneFrom = addDays(todayKey, -MARK_DONE_REACH_DAYS)

	const facts = new Map<string, TimelineImportFacts>()
	for (const row of rows) {
		const { session, entry } = row
		const dayKey = dayOf(row)
		const recordedOnly = isRecordedOnly(row)
		const title = entry.title ?? ''

		let importLink: TimelineImportLink | null = null
		const recording = session.recording
		if (recording && !recordedOnly) {
			importLink = {
				kind: 'undo',
				importId: recording.id,
				actionLabel: IMPORT_LINK_LABELS.undo,
				label: IMPORT_LINK_LABELS.undoFor(title),
				note: IMPORT_LINK_LABELS.undoNote,
			}
		} else if (recording && recordedOnly) {
			const from = recording.unlinkedFromSessionId
				? byId.get(recording.unlinkedFromSessionId)
				: undefined
			if (from && from.session.recording == null) {
				const fromTitle = from.entry.title ?? ''
				importLink = {
					kind: 'relink',
					importId: recording.id,
					actionLabel: IMPORT_LINK_LABELS.relink,
					label: IMPORT_LINK_LABELS.relinkFor(fromTitle),
					note: IMPORT_LINK_LABELS.relinkNote(fromTitle),
				}
			} else if (
				recording.linkAnsweredAt == null &&
				!session.countsInNoTrack &&
				recording.discipline !== 'other'
			) {
				const candidates = (byDay.get(dayKey) ?? []).filter(
					(other) =>
						other !== row &&
						!isRecordedOnly(other) &&
						other.session.recording == null &&
						other.session.workout?.discipline === recording.discipline,
				)
				if (candidates.length > 0) {
					importLink = {
						kind: 'ask',
						importId: recording.id,
						question: IMPORT_LINK_LABELS.question,
						note: IMPORT_LINK_LABELS.questionNote(candidates.length),
						label: IMPORT_LINK_LABELS.questionFor(title),
						options: candidates.map((candidate) => ({
							sessionId: candidate.session.id,
							label: IMPORT_LINK_LABELS.linkTo(candidate.entry.title ?? ''),
						})),
						keepLabel: IMPORT_LINK_LABELS.keep,
						annetLabel: trackDisciplines.has(recording.discipline)
							? IMPORT_LINK_LABELS.annet
							: null,
					}
				}
			}
		}

		// Nothing at all says how much: no Recording, no sets, no TSS (an RPE
		// alone prices one, ADR 0008) — only the athlete's word that it was done.
		const noNumbers =
			entry.status === 'completed' &&
			recording == null &&
			session.setLogs.length === 0 &&
			session.tssValue == null &&
			bringsNumbers(entry.discipline)
		const markable =
			recording == null &&
			session.workout != null &&
			(session.status === 'scheduled' || session.status === 'missed') &&
			dayKey <= todayKey &&
			dayKey >= markDoneFrom &&
			bringsNumbers(entry.discipline)

		facts.set(session.id, {
			extraLabel: recordedOnly ? IMPORT_LINK_LABELS.extra : null,
			importLink,
			doneNote: noNumbers
				? importConnected
					? MARK_DONE_LABELS.fromImport
					: MARK_DONE_LABELS.noImport
				: null,
			markDone: markable
				? {
						actionLabel: MARK_DONE_LABELS.action,
						label: MARK_DONE_LABELS.actionFor(title),
					}
				: null,
		})
	}
	return facts
}

/** What a session not in the ledger pass reads: nothing to say. */
export const NO_IMPORT_FACTS: TimelineImportFacts = {
	extraLabel: null,
	importLink: null,
	doneNote: null,
	markDone: null,
}
