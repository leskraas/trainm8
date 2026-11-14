/**
 * What I dag says about imports, row by row (#505 stories 78–82, ADR 0049 as
 * amended). Pure: ledger rows in, words and offers out — the Seam 2 half of
 * the import loop, whose server half is `autoSaveImport` and
 * `import-link.server.ts`.
 *
 * - **ekstra** — a session that exists only because an activity was recorded
 *   (Session Source `recorded` / `detected`): no plan stood behind it.
 * - **"hva var dette?"** — asked only when the app is unsure: an ekstra session
 *   nobody has answered for, on a day that still has a planned session the
 *   import fits (`fitsImportByHand`). Auto-save links when exactly one fits
 *   (`fitsImport`), so this is the day two fitted, the plan was written after
 *   the run landed, or an import on `'other'` sits on a day with a planned
 *   Simple Activity — which auto-save never links (ADR 0015 §A), so the athlete
 *   links it by hand here. Never asked about Annet, an answered import, or one
 *   older than `IMPORT_QUESTION_DAYS` — the athlete is not asked about last
 *   spring the day this ships.
 * - **Angre kobling** — on a planned session holding an import.
 * - **Koble igjen** — on the ekstra session an Angre kobling made, while the
 *   session it came from is still on I dag and still has no Recording.
 * - **"tallene kommer fra importen"** — a done session with no numbers, when an
 *   import is connected to bring them; an honest "uten tall" otherwise.
 */

import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import {
	canMarkDone,
	fitsImportByHand,
	IMPORT_QUESTION_DAYS,
	importBringsNumbers,
	isRecordingOnlySource,
	MARK_DONE_REACH_DAYS,
} from '#app/utils/import-fit.ts'
import {
	IMPORT_LINK_LABELS,
	MARK_DONE_LABELS,
	SIMPLE_ACTIVITY_LABELS,
} from '#app/utils/labels.ts'
import { type SessionRow } from '#app/utils/session-ledger-rows.ts'

/** The offer on an import's row. One at a time: the row has one question. */
export type TimelineImportLink =
	| {
			kind: 'ask'
			importId: string
			/** The group's heading, which also names it. */
			question: string
			note: string
			/**
			 * "Det var <title>", one per planned session that fits; `title` is
			 * what the link's toast quotes (ADR 0088).
			 */
			options: Array<{ sessionId: string; label: string; title: string }>
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
	/**
	 * The one small mark the row carries itself (audit PR D, #505 stories 79
	 * and 82: the athlete should *see* it, not find it behind the glyph):
	 * `ekstra`, or for a done session with no numbers `tallene kommer fra
	 * importen` / `uten tall`. The details say the whole of it.
	 */
	rowMark: string | null
	/** _Gjort_ by hand, where `canMarkDone` allows it; else null. */
	markDone: { actionLabel: string; label: string } | null
}

/** An ekstra: a session that exists only to carry its Recording. */
function isEkstra(row: SessionRow): boolean {
	return row.session.recording != null && isRecordingOnlySource(row.session)
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
	const askFrom = addDays(todayKey, -IMPORT_QUESTION_DAYS)
	const markDoneFrom = addDays(todayKey, -MARK_DONE_REACH_DAYS)

	const facts = new Map<string, TimelineImportFacts>()
	for (const row of rows) {
		const { session, entry } = row
		const dayKey = dayOf(row)
		const ekstra = isEkstra(row)
		const title = entry.title ?? ''
		const recording = session.recording

		let importLink: TimelineImportLink | null = null
		if (recording && !ekstra) {
			importLink = {
				kind: 'undo',
				importId: recording.id,
				actionLabel: IMPORT_LINK_LABELS.undo,
				label: IMPORT_LINK_LABELS.undoFor(title),
				note: IMPORT_LINK_LABELS.undoNote,
			}
		} else if (recording && ekstra) {
			const from = recording.unlinkedFromSessionId
				? byId.get(recording.unlinkedFromSessionId)
				: undefined
			// An ekstra stands on its import's start (`promoteToNewSession`), so
			// its own day is the import's.
			const importDay = dayKey
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
				importDay >= askFrom
			) {
				const candidates = (byDay.get(importDay) ?? []).filter((other) =>
					fitsImportByHand(
						{
							source: other.session.source,
							adoptedAt: other.session.adoptedAt,
							hasRecording: other.session.recording != null,
							workoutDiscipline: other.session.workout?.discipline ?? null,
							dayKey: dayOf(other),
						},
						{ discipline: recording.discipline, dayKey: importDay },
					),
				)
				if (candidates.length > 0) {
					importLink = {
						kind: 'ask',
						importId: recording.id,
						question: IMPORT_LINK_LABELS.question,
						note:
							recording.discipline === 'other'
								? SIMPLE_ACTIVITY_LABELS.linkQuestionNote
								: IMPORT_LINK_LABELS.questionNote(candidates.length),
						options: candidates.map((candidate) => ({
							sessionId: candidate.session.id,
							label: IMPORT_LINK_LABELS.linkTo(candidate.entry.title ?? ''),
							title: candidate.entry.title ?? '',
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
			importBringsNumbers(entry.discipline)
		const markable = canMarkDone(
			{
				status: session.status,
				hasRecording: recording != null,
				workoutDiscipline: session.workout?.discipline ?? null,
				dayKey,
			},
			{ todayKey, reachFromKey: markDoneFrom },
		)

		facts.set(session.id, {
			extraLabel: ekstra ? IMPORT_LINK_LABELS.extra : null,
			importLink,
			doneNote: noNumbers
				? importConnected
					? MARK_DONE_LABELS.fromImport
					: MARK_DONE_LABELS.noImport
				: null,
			rowMark: ekstra
				? IMPORT_LINK_LABELS.extra
				: noNumbers
					? importConnected
						? MARK_DONE_LABELS.rowFromImport
						: MARK_DONE_LABELS.rowNoImport
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
	rowMark: null,
	markDone: null,
}
