/**
 * _Meg_ → _Nivå og økter_'s activities (#587, ADR 0109), on the server: what
 * the page shows of the plan's activities — the editor's pre-fill, or the
 * read-only list and why — and the preview (_Vis ny uke_) and confirm
 * (_Bekreft_) behind the editor, every word from the labels module.
 */
import { z } from 'zod/v3'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import {
	applyActivitiesEdit,
	readActivitiesEdit,
	type ActivitiesEditRefusal,
	type ActivitiesEditResult,
} from '#app/utils/first-run/activities-edit.server.ts'
import {
	activitiesOf,
	type ActivitiesChoice,
} from '#app/utils/first-run/activities-edit.ts'
import { type PlanStartAnswersReading } from '#app/utils/first-run/plan-start-options.server.ts'
import {
	levelDefaults,
	startStrengthPerWeek,
	STRENGTH_PER_WEEK_CHOICES,
} from '#app/utils/first-run/start-draft.ts'
import {
	ACTIVITIES_EDIT_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_WEEKDAY_LABELS,
	nbDurationLabel,
	nbHoursWords,
	nbLongDay,
	nbTrackName,
	PHILOSOPHY_LABELS,
	PLAN_LEAD_LABELS,
	SESSION_PREFERENCE_LABELS,
	SIMPLE_START_LABELS,
	START_OPTION_LABELS,
} from '#app/utils/labels.ts'
import { trackRetiredAt } from '#app/utils/plan-outline/from-rows.ts'
import { ACTIVITY_KINDS } from '#app/utils/simple-activity.ts'
import { type AuthoredSeason } from '#app/utils/training.server.ts'
import {
	CARDIO_DISCIPLINES,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import {
	weekCardOf,
	type StartWeekCard,
} from '../start/__start-option-card.tsx'

const W = ACTIVITIES_EDIT_LABELS

/** What the page shows of the plan's activities. */
export type ActivitiesView =
	| { kind: 'none'; text: string }
	| {
			kind: 'read-only'
			names: string[]
			/** Why the edit cannot lay this plan, and where it changes. */
			why: string
	  }
	| {
			kind: 'editable'
			current: ActivitiesChoice
			/** _Styrke_ is offered: there is a session for a lifting day to copy. */
			lifting: {
				preset: number
				fromHistory: number | null
				/** The frequency the athlete gave last, where they did. */
				answered: number | null
			} | null
			/** `Timene og dagene blir som før: …`. */
			stands: string
	  }

/**
 * The plan's activities as _Meg_ shows them: the editor, pre-filled with the
 * plan's activities now, where the edit can lay the plan; else the plan's
 * activities read-only, retired tracks left out, and why; else nothing.
 */
export function activitiesViewOf(
	season: Pick<AuthoredSeason, 'tracks'> | null,
	reading: PlanStartAnswersReading,
	fromWeekKey: string,
): ActivitiesView {
	if (!season || (!reading.ok && reading.reason === 'no-plan')) {
		return { kind: 'none', text: SESSION_PREFERENCE_LABELS.meg.activitiesNone }
	}
	if (!reading.ok || reading.readOnly) {
		const names = [
			...new Set(
				season.tracks
					.filter((track) => !trackRetiredAt(track, fromWeekKey))
					.map((track) => nbTrackName(track.discipline)),
			),
		]
		const why = reading.ok
			? reading.readOnly === 'event'
				? W.readOnly.event(reading.eventName ?? '')
				: W.readOnly.currency
			: reading.reason === 'currency'
				? W.readOnly.currency
				: reading.reason === 'lifting-only'
					? W.readOnly.liftingOnly
					: W.readOnly.noDays
		return { kind: 'read-only', names, why }
	}
	const { answers, lifting } = reading
	return {
		kind: 'editable',
		current: activitiesOf(answers, lifting?.perWeek ?? null),
		lifting: lifting
			? {
					preset:
						lifting.perWeek ??
						startStrengthPerWeek(answers.level, lifting.fromHistory),
					fromHistory: lifting.fromHistory,
					answered: lifting.perWeek,
				}
			: null,
		stands: W.stands(
			nbHoursWords(answers.hours),
			answers.days.map((day) => NB_WEEKDAY_LABELS[day]!),
		),
	}
}

/** The preview as the page shows it, every word from the labels module. */
export type ActivitiesPreviewView = {
	digest: string
	/** The choice the preview was laid for: a confirm posts it back. */
	choice: ActivitiesChoice
	overline: string
	title: string
	/** The boundary, and the family kept or taken. */
	lead: string
	card: StartWeekCard
	notes: string[]
	/** Said where the week holds sessions marked _Din_. */
	yoursNote: string | null
	kept: string | null
	pinned: string[]
	overrides: string[]
}

function minutesLabel(minutes: number): string {
	return nbDurationLabel(minutes * 60)
}

/** A preview as the page shows it. */
export function previewViewOf(
	result: Extract<ActivitiesEditResult, { ok: true }>,
): ActivitiesPreviewView {
	const { preview } = result
	const { splice, start, choice } = preview
	const option = { ...start.options[0]!, week: preview.week }
	const from = splice.boundaryWeekKey
	const card = weekCardOf(option, result.hours, choice.strength)
	if (preview.keptMinutes > 0) {
		card.total = W.totalSplit(
			minutesLabel(preview.plannedMinutes),
			minutesLabel(preview.keptMinutes),
		)
	}
	const familyName = PHILOSOPHY_LABELS[preview.family]
	const notes: string[] = []
	if (start.sportsLeftOut.length > 0) {
		notes.push(
			START_OPTION_LABELS.sportsLeftOut(
				start.daysUsed,
				start.sportsLeftOut.map((sport) =>
					NB_DISCIPLINE_LABELS[sport].toLowerCase(),
				),
			),
		)
	}
	const { sessionCap } = levelDefaults(result.level)
	if (start.strengthCapped != null) {
		notes.push(
			START_OPTION_LABELS.strengthTakesDays(sessionCap, start.strengthCapped),
		)
	} else if (start.capped) {
		notes.push(SIMPLE_START_LABELS.activities.beginnerCap(sessionCap))
	}
	const hasKept = preview.week.days.some(
		(day) =>
			day.sessions.some((session) => session.kept) ||
			day.lifting.some((lift) => lift.kept),
	)
	const { keptFromBoundary } = preview
	const removedNames = preview.removed.map((discipline) =>
		nbTrackName(discipline).toLowerCase(),
	)
	return {
		digest: preview.digest,
		choice,
		overline: W.overline(isoWeekNumber(from)),
		title: W.title(nbLongDay(from)),
		lead: `${result.boundaryThisWeek ? W.boundaryThis : W.boundaryNext} ${
			preview.familyTaken
				? W.familyNone(PLAN_LEAD_LABELS.plainName[preview.family], familyName)
				: W.family(familyName)
		}`,
		card,
		notes,
		yoursNote: hasKept ? W.yoursNote : null,
		kept:
			keptFromBoundary.count > 0
				? [
						W.kept(
							keptFromBoundary.count,
							nbLongDay(from).replace(/^\S+ /, ''),
						),
						...(keptFromBoundary.onRemoved > 0
							? [
									W.keptRemoved(
										keptFromBoundary.onRemoved,
										keptFromBoundary.count,
										removedNames,
									),
								]
							: []),
					].join(' ')
				: null,
		pinned: splice.pinned.map((one) =>
			W.pinnedRow(
				nbTrackName(one.discipline),
				one.days.map((day) => NB_WEEKDAY_LABELS[day]!),
			),
		),
		overrides: [...new Set(splice.overrides.map((one) => one.discipline))].map(
			(discipline) =>
				`${nbTrackName(discipline)}: ${splice.overrides
					.filter((one) => one.discipline === discipline)
					.map((one) =>
						W.overrideWeek(
							isoWeekNumber(one.weekKey),
							nbLongDay(one.weekKey).replace(/^\S+ /, ''),
						),
					)
					.join(', ')}`,
		),
	}
}

/** The editor's form, as posted: the choice, and the confirm's digest. */
const ActivitiesFormSchema = z.object({
	intent: z.enum(['preview-activities', 'confirm-activities']),
	sports: z
		.array(z.enum(CARDIO_DISCIPLINES))
		.optional()
		.transform((sports) => [...new Set(sports ?? [])]),
	activities: z
		.array(z.enum(ACTIVITY_KINDS))
		.optional()
		.transform((kinds) => [...new Set(kinds ?? [])]),
	strength: z.coerce
		.number()
		.int()
		.refine((value) =>
			(STRENGTH_PER_WEEK_CHOICES as readonly number[]).includes(value),
		)
		.optional(),
	digest: z.string().min(1).optional(),
})

/** The editor's last answer, under its own key. */
export type ActivitiesReply =
	| { kind: 'preview'; preview: ActivitiesPreviewView; stale: boolean }
	| { kind: 'refused'; message: string }
	| { kind: 'done'; message: string }

function refusalMessage(reason: ActivitiesEditRefusal): string {
	switch (reason) {
		case 'same':
			return W.same
		case 'no-activity':
			return W.none
		case 'lifting-only':
			return W.liftingOnly
		case 'preview-stale':
			return W.stale
		case 'outline-not-found':
		case 'not-editable':
		case 'nothing-to-lay':
			return W.refusal[reason]
	}
}

/**
 * `preview-activities` and `confirm-activities`: the preview, which writes
 * nothing, and the edit behind it. A confirm the plan changed under writes
 * nothing and answers with the new preview, the stale line at its top.
 */
export async function activitiesAction(
	userId: string,
	formData: FormData,
): Promise<{ activities: ActivitiesReply }> {
	const parsed = ActivitiesFormSchema.safeParse({
		intent: formData.get('intent'),
		sports: formData.getAll('sports'),
		activities: formData.getAll('activities'),
		strength: formData.get('strength') || undefined,
		digest: formData.get('digest') || undefined,
	})
	if (!parsed.success) {
		return {
			activities: { kind: 'refused', message: W.refusal['not-editable'] },
		}
	}
	// A confirm carries the preview it confirms: without its digest there is
	// nothing to hold the edit to the week shown (made = shown), so nothing
	// is written, as the philosophy switch refuses (`previewFirst`).
	if (parsed.data.intent === 'confirm-activities' && !parsed.data.digest) {
		return { activities: { kind: 'refused', message: W.previewFirst } }
	}
	const choice: ActivitiesChoice = {
		sports: parsed.data.sports,
		activities: parsed.data.activities,
		strength: parsed.data.strength ?? null,
	}
	if (parsed.data.intent === 'preview-activities') {
		const read = await readActivitiesEdit(userId, choice)
		return {
			activities: read.ok
				? { kind: 'preview', preview: previewViewOf(read), stale: false }
				: { kind: 'refused', message: refusalMessage(read.reason) },
		}
	}
	const applied = await applyActivitiesEdit(userId, choice, new Date(), {
		digest: parsed.data.digest,
	})
	if (applied.ok) {
		return {
			activities: {
				kind: 'done',
				message: W.done(nbLongDay(applied.preview.splice.boundaryWeekKey)),
			},
		}
	}
	if (applied.reason === 'preview-stale') {
		const fresh = await readActivitiesEdit(userId, choice)
		if (fresh.ok) {
			return {
				activities: {
					kind: 'preview',
					preview: previewViewOf(fresh),
					stale: true,
				},
			}
		}
	}
	return {
		activities: { kind: 'refused', message: refusalMessage(applied.reason) },
	}
}
