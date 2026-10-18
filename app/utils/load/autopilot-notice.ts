/**
 * The Autopilot Notice (UI _Neste uke er lagt ut_; #576, ADR 0100 §5): what
 * the autopilot wrote at a week's close, as lines the athlete reads on I dag.
 *
 * One line per proposal of the week's decision, in the author's order: a
 * change it made, with its stored reason and _Angre_; a session it left alone
 * because it is the athlete's; a missed session it let go; a step the guards
 * held. It states; it never asks — that is the Week Change Card's, under
 * _Spør meg først_.
 *
 * Its lifecycle (#580): it stays on I dag until it has been seen and the week
 * it laid has begun — neither alone removes it (`isNoticeOnToday`). Once that
 * week has begun it is this week: the heading says so, and _Gjør uka lettere_
 * is no longer offered. Every notice stays at its week in _Se hele sesongen_.
 * A horizon week the close could not lay is said under the lines, with why.
 *
 * Pure: no clock, no DB. The server reader is `autopilot-notice.server.ts`.
 */

import { weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { formatNbVolumeFigure } from '#app/utils/format.ts'
import {
	AUTOPILOT_NOTICE_LABELS as L,
	NB_VOLUME_UNITS,
	NB_WEEKDAY_LABELS,
	nbLongDay,
	roundPeakLabel,
} from '#app/utils/labels.ts'
import { type VolumeCurrency } from '#app/utils/plan-outline/derive.ts'
import { type SessionOwner } from '#app/utils/session-ownership.ts'
import { AUTOPILOT_STEP_UP_MAX, type AutopilotOutcome } from './autopilot.ts'
import { type WeekChangeData } from './week-change-card.ts'
import { type UnlaidReason } from './week-change.ts'
import { type ProposalPayload } from './week-replan-proposal.ts'

/** One proposal of the decision, as the reader hands it in. */
export type AutopilotNoticeProposal = {
	id: string
	payload: ProposalPayload
	/** The stored Norwegian reason — worded as done, for a week closed under autopilot. */
	reason: string
	outcome: AutopilotOutcome
	undone: boolean
	/** The session it is aimed at, as it stands; null for a week-wide one. */
	target: { title: string | null; dayKey: string; owner: SessionOwner } | null
	/**
	 * A next round's: the peak week of the round it follows, in the plan's lead
	 * track — what its factor scaled (#583). Null or absent otherwise, or when
	 * the plan has no number to read it from.
	 */
	roundPeak?: RoundPeak | null
}

/** A round's peak week, in its track's unit. */
export type RoundPeak = { value: number; currency: VolumeCurrency }

export type AutopilotNoticeLine = {
	proposalId: string
	/**
	 * `changed`: written, and can be undone; `kept`: the week stands as planned;
	 * `left-alone`: the athlete's own session stands; `let-go`: a missed
	 * session stays _ikke gjort_; `held`: nothing written (the guards, or nothing
	 * left to change).
	 */
	kind: 'changed' | 'kept' | 'left-alone' | 'let-go' | 'held'
	/** What the line is about, when the reason does not name it. */
	subject: string | null
	text: string
	/**
	 * A next round's peak week before → after, under its reason (#583):
	 * `Toppuka: 4 → 4,2 t`. Null for any other line, a round that keeps its
	 * volume, or one that has been undone.
	 */
	volumeLine: string | null
	/** A change's way back: offered, already taken, or past its window. */
	undo: 'offered' | 'undone' | 'closed' | null
}

export type AutopilotNotice = {
	closedWeekKey: string
	/** The week the changes landed in, and the one _Gjør uka lettere_ eases. */
	comingWeekKey: string
	/** _Neste uke er lagt ut_, or _Denne uka …_ from that week's Monday. */
	heading: string
	/** Whether the week the changes landed in has begun (ADR 0100 §4). */
	begun: boolean
	/**
	 * Whether _Gjør uka lettere_ shows: offered until the week begins, and its
	 * result kept once made.
	 */
	showEase: boolean
	/** Whether the athlete has seen it on I dag yet (#580). */
	seen: boolean
	lines: AutopilotNoticeLine[]
	/** A week the close could not lay, with why (#580); null when none. */
	unlaidLine: string | null
	/**
	 * The one-time line about the switch to autopilot and where _Spør meg
	 * først_ is (#583) — on one notice only, the first after the switch.
	 */
	introLine: string | null
	/** How many changes can still be undone — _Angre alt_ shows from two. */
	undoable: number
	/** Said once under the lines when the window has closed on a change. */
	closedLine: string | null
	/** The athlete's own _Gjør uka lettere −15 %_, once made (ADR 0100 §5). */
	eased: WeekChangeData['eased']
}

function weekdayOf(dayKey: string): string {
	return NB_WEEKDAY_LABELS[weekdayIndex(dayKey)]!
}

function subjectOf(target: AutopilotNoticeProposal['target']): string | null {
	return target?.title
		? L.subject(target.title, weekdayOf(target.dayKey))
		: null
}

function percent(fraction: number): string {
	return `${Math.round(fraction * 100)} %`
}

function lineOf(
	proposal: AutopilotNoticeProposal,
	undoOpen: boolean,
): AutopilotNoticeLine {
	const { id, payload, reason, outcome, target } = proposal
	const line = (
		kind: AutopilotNoticeLine['kind'],
		text: string,
		subject: string | null = null,
		undo: AutopilotNoticeLine['undo'] = null,
	): AutopilotNoticeLine => ({
		proposalId: id,
		kind,
		subject,
		text,
		volumeLine: null,
		undo,
	})

	switch (outcome) {
		case 'applied': {
			if (payload.kind === 'keep') {
				return target ? line('let-go', reason) : line('kept', reason)
			}
			const undo = proposal.undone ? 'undone' : undoOpen ? 'offered' : 'closed'
			// A slot move's and a round's reasons name what they moved; a scale
			// on one session says only "økta", so the line names it.
			const subject = payload.kind === 'scale' ? subjectOf(target) : null
			return {
				...line('changed', reason, subject, undo),
				volumeLine:
					payload.kind === 'add-phase' && undo !== 'undone'
						? roundVolumeLine(proposal.roundPeak ?? null, payload.factor)
						: null,
			}
		}
		case 'left-alone':
			return line(
				'left-alone',
				target?.title
					? L.leftAlone(weekdayOf(target.dayKey), target.title)
					: L.leftAloneUnnamed,
			)
		case 'not-placed':
			// A make-up's stored reason already says it was let go; an extra
			// session has no reason of the autopilot's own.
			return payload.kind === 'move'
				? line('let-go', reason)
				: line('let-go', L.notPlacedExtra)
		case 'over-guard':
			return line(
				'held',
				L.overGuard(percent(AUTOPILOT_STEP_UP_MAX - 1)),
				subjectOf(target),
			)
		case 'gone':
			return line('held', target?.title ? L.gone(target.title) : L.goneUnnamed)
	}
}

/**
 * A next round's peak week before → after its factor, as the Week Change Card
 * says it beside the percentage (`Toppuka: 4 → 4,2 t`). Nothing for a round
 * that keeps the volume — its reason already says so — or without a peak.
 */
function roundVolumeLine(peak: RoundPeak | null, factor: number) {
	if (!peak || factor === 1) return null
	const before = formatNbVolumeFigure(peak.value, peak.currency)
	const after = formatNbVolumeFigure(peak.value * factor, peak.currency)
	return before === after
		? null
		: roundPeakLabel(before, after, NB_VOLUME_UNITS[peak.currency])
}

/**
 * Whether the notice still belongs on I dag (#580, spec #558 story 87): until
 * it has been seen **and** the week it laid has begun — neither alone removes
 * it. Begun is ADR 0100 §4's (`readFirstUnbegunWeekKey`: its Monday past, or
 * a session in it trained), the same instant _Angre_ closes, so the notice
 * never leaves while a change can still be undone. Seen counts from the day
 * after: a notice first seen on a begun week stays the rest of that day, so
 * it never vanishes under the athlete's thumb when the page reloads after a
 * tap.
 */
export function isNoticeOnToday({
	begun,
	seenDayKey,
	todayKey,
}: {
	begun: boolean
	/** The local day it was first seen on I dag; null when not yet. */
	seenDayKey: string | null
	todayKey: string
}): boolean {
	return !(begun && seenDayKey != null && seenDayKey < todayKey)
}

export function buildAutopilotNotice({
	closedWeekKey,
	comingWeekKey,
	proposals,
	undoOpen,
	eased,
	todayWeekKey = null,
	seen = false,
	unlaid = null,
	intro = false,
}: {
	closedWeekKey: string
	comingWeekKey: string
	proposals: AutopilotNoticeProposal[]
	/** Whether the week the changes landed in is still not begun (ADR 0100 §4). */
	undoOpen: boolean
	eased: AutopilotNotice['eased']
	/**
	 * The Monday of the week `now` is in. From the coming week's Monday the
	 * heading says _Denne uka_ — even on a Monday whose week is not yet begun
	 * in ADR 0100 §4's sense (nothing trained yet, so _Angre_ still stands).
	 */
	todayWeekKey?: string | null
	seen?: boolean
	/** The horizon week the close could not lay, and why (#580). */
	unlaid?: { weekKey: string; reason: UnlaidReason } | null
	/** Whether this is the one notice that carries the switch's line (#583). */
	intro?: boolean
}): AutopilotNotice {
	const lines = proposals.map((proposal) => lineOf(proposal, undoOpen))
	const arrived =
		!undoOpen || (todayWeekKey != null && comingWeekKey <= todayWeekKey)
	return {
		closedWeekKey,
		comingWeekKey,
		heading: arrived ? L.headingThisWeek : L.heading,
		begun: !undoOpen,
		showEase: undoOpen || eased != null,
		seen,
		lines,
		unlaidLine: unlaid
			? L.unlaid(unlaid.reason, nbLongDay(unlaid.weekKey))
			: null,
		introLine: intro ? L.intro : null,
		undoable: lines.filter((line) => line.undo === 'offered').length,
		closedLine: lines.some((line) => line.undo === 'closed') ? L.closed : null,
		eased,
	}
}
