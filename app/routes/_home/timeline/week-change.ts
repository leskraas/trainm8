/**
 * _Ukeskiftet_ on I dag (#505 stories 4–6, 42–55, ADR 0080): the card's view
 * model, put together from the stored Week Replan and its proposals
 * (`readWeekChange`) and the week model home already built.
 *
 * It decides three things the card itself must not:
 *
 * - **Which proposals are answerable.** A pending proposal nothing has applied
 *   asks for Ok or Nei takk; one the morning's silence applied reads as done
 *   ("Gjort i morges"); an answered one says what the answer did — what
 *   changed, and that the Week Target did not.
 * - **Whose session a proposal is aimed at.** One on the athlete's own session
 *   says so, because only their yes may change it.
 * - **What the week that went looked like**: plan against done per track,
 *   read off the closed week's own header model (`week-volumes.ts`, graded
 *   through Sunday once the week has closed), and the sessions that were not
 *   done or were done beyond the plan.
 *
 * Pure: no clock, no DB. Words come from `labels.ts`.
 */

import { localDate, weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { formatNbVolumeFigure } from '#app/utils/format.ts'
import {
	easePlannedLabel,
	NB_VOLUME_UNITS,
	RELATIVE_WEEK_LABELS,
	quotedSession,
	roundPeakLabel,
	silencedLabel,
	weekChangeWaitingLabel,
	WEEK_CHANGE_DONE_LABELS,
	WEEK_CHANGE_LABELS,
	WEEK_CHANGE_PROPOSAL_LABELS,
} from '#app/utils/labels.ts'
import {
	proposalTooLate,
	type WeekChangeData,
	type WeekChangeProposal,
} from '#app/utils/load/week-change-card.ts'
import {
	ROUND_FACTOR_MAX,
	ROUND_FACTOR_MIN,
	ROUND_FACTOR_STEP,
} from '#app/utils/load/week-change-schema.ts'
import {
	type ProposalScope,
	type WeekVolume,
} from '#app/utils/load/week-replan-proposal.ts'
import { type VolumeCurrency } from '#app/utils/plan-outline/derive.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { isRecordingOnly } from '#app/utils/training.ts'
import { type TimelineTrackWeek, type TimelineWeek } from './presenter.ts'
import { leadTrack } from './week-words.ts'

/** Where a proposal stands, from the card's side. */
export type ProposalState =
	/** Pending, and nothing has applied it: Ok or Nei takk. */
	| 'answerable'
	/** Applied by the morning's silence, unanswered. */
	| 'silenced'
	| 'accepted'
	| 'declined'
	/** Pending, but its session has passed: an Ok would do nothing now. */
	| 'too-late'

export type WeekChangeProposalView = {
	id: string
	kind: WeekChangeProposal['payload']['kind']
	/** What is proposed: `Flytt «Terskel» fra tirsdag til torsdag`. */
	headline: string
	/** Why, in plain Norwegian — the proposal's own reason, verbatim. */
	reason: string
	/** `din økt` when the proposal is aimed at the athlete's own session. */
	ownLabel: string | null
	/** It puts more training on the athlete, so it waits for a yes. */
	addsLoad: boolean
	state: ProposalState
	/** `Du sa ok`, `Gjort i morges`, … ; null while answerable. */
	stateLabel: string | null
	/** What the answer (or silence) did, once there is one. */
	confirmation: string | null
	/**
	 * A move's reach, asked with the Ok: `bare denne gangen` / `fra nå av`.
	 * Null where there is nothing to choose — any other kind, and a make-up,
	 * which is a copy on a free day rather than a slot that moves onward.
	 */
	scope: { options: Array<{ value: ProposalScope; label: string }> } | null
	/**
	 * An open-ended plan's next round: the factor the athlete may change, and
	 * the last round's peak week in the lead track's unit, which the factor
	 * moves (`roundVolumeLine`) — null without a target to read it from.
	 */
	round: {
		factor: number
		min: number
		max: number
		step: number
		peak: { value: number; currency: VolumeCurrency } | null
	} | null
}

export type WeekChangeReview = {
	/** `Forrige uke`, `Denne uka` — the closed week's own name. */
	weekName: string
	/** `28. sep – 4. okt`; empty for a week the timeline holds nothing of. */
	rangeLabel: string
	/** Plan against done per track, in each track's unit. */
	tracks: TimelineTrackWeek[]
	/** The week's sessions and load, where no track reads it. */
	loadLine: string | null
	missed: Array<{ id: string; title: string; dayLabel: string }>
	extras: Array<{ id: string; title: string; dayLabel: string }>
	/** How many sessions the week planned — none, and "alt ble gjort" is not said. */
	plannedCount: number
}

export type WeekChangeEase = {
	weekKey: string
	state: 'offered' | 'done'
	/** `Neste uke: 44 km planlagt` — the number the tap would move, or null. */
	plannedLabel: string | null
	/** The unit the before → after line is said in. */
	currency: VolumeCurrency
	/** `Uka: 44 → 37,4 km planlagt. Ukemålet står.` once eased, or null. */
	resultLabel: string | null
}

export type WeekChangeCard = {
	closedWeekKey: string
	/** The Week Replan's own sentence. */
	summary: string
	/** Some proposal still waits for an answer. */
	open: boolean
	/**
	 * `Forslag for neste uke`, or `Forslag for denne uka` once the week the
	 * proposals land in has begun.
	 */
	proposalsHeading: string
	/**
	 * `Ukeskiftet: 3 forslag venter` — the line at the top of I dag that leads
	 * to the card, while any proposal can still be answered; else null.
	 */
	waitingLabel: string | null
	/** How many proposals can still be answered — the top line's badge. */
	waitingCount: number
	review: WeekChangeReview
	proposals: WeekChangeProposalView[]
	ease: WeekChangeEase
}

/** The bounds `acceptRoundWithFactor` holds a round's factor to. */
const ROUND_FACTOR_BOUNDS = {
	min: ROUND_FACTOR_MIN,
	max: ROUND_FACTOR_MAX,
	step: ROUND_FACTOR_STEP,
} as const

export function buildWeekChangeCard({
	data,
	weeks,
	ledger,
	activePlan,
	now,
	timezone,
}: {
	data: WeekChangeData | null
	weeks: readonly TimelineWeek[]
	ledger: readonly LedgerSession[]
	activePlan: ActivePlan | null
	now: Date
	timezone: string
}): WeekChangeCard | null {
	if (!data) return null
	const closed = weeks.find((week) => week.key === data.closedWeekKey) ?? null
	const coming = weeks.find((week) => week.key === data.comingWeekKey) ?? null
	const todayKey = localDate(now, timezone)
	const peak = lastRoundPeak(activePlan)
	const proposals = data.proposals.map((proposal) =>
		buildProposal(proposal, todayKey, timezone, peak),
	)
	const waiting = proposals.filter((p) => p.state === 'answerable').length
	return {
		closedWeekKey: data.closedWeekKey,
		summary: data.reason,
		open: data.open,
		proposalsHeading:
			data.comingWeekKey <= todayKey
				? WEEK_CHANGE_LABELS.proposalsThisWeek
				: WEEK_CHANGE_LABELS.proposalsNextWeek,
		waitingLabel: waiting > 0 ? weekChangeWaitingLabel(waiting) : null,
		waitingCount: waiting,
		review: buildReview(closed, ledger),
		proposals,
		ease: buildEase(data, coming),
	}
}

/**
 * The last round's peak week in the plan's lead track — the number a next
 * round's factor scales: the most the round asked for in one week, in km or
 * hours. Null without a plan, a phase or a target to read.
 */
function lastRoundPeak(
	plan: ActivePlan | null,
): NonNullable<WeekChangeProposalView['round']>['peak'] {
	const last = plan?.phases.at(-1)
	const lead = plan ? leadTrack(plan.tracks) : null
	if (!last || !lead || lead.currency === 'sets') return null
	const peak = Math.max(
		0,
		...lead.targets.slice(-last.weeks).map((target) => target ?? 0),
	)
	return peak > 0 ? { value: peak, currency: lead.currency } : null
}

/**
 * The round's peak week before → after a factor, as the card says it beside
 * the percentage: `Toppuka: 4,5 → 5 t`. Exported so the card can say it again
 * as the athlete changes the factor.
 */
export function roundVolumeLine(
	peak: NonNullable<NonNullable<WeekChangeProposalView['round']>['peak']>,
	factor: number,
): string {
	return roundPeakLabel(
		formatNbVolumeFigure(peak.value, peak.currency),
		formatNbVolumeFigure(peak.value * factor, peak.currency),
		NB_VOLUME_UNITS[peak.currency],
	)
}

function buildReview(
	week: TimelineWeek | null,
	ledger: readonly LedgerSession[],
): WeekChangeReview {
	// A week the timeline holds nothing of — before the plan and before any
	// history — is still the week that went: an empty one, said as such.
	if (!week) {
		return {
			weekName: RELATIVE_WEEK_LABELS.previous,
			rangeLabel: '',
			tracks: [],
			loadLine: null,
			missed: [],
			extras: [],
			plannedCount: 0,
		}
	}
	const recordingOnly = new Set(
		ledger.filter((session) => isRecordingOnly(session)).map((s) => s.id),
	)
	const missed: WeekChangeReview['missed'] = []
	const extras: WeekChangeReview['extras'] = []
	let plannedCount = 0
	for (const day of week.rows) {
		const dayLabel = day.dayLabel
		for (const session of day.sessions) {
			if (!recordingOnly.has(session.id)) plannedCount += 1
			if (session.status === 'missed') {
				missed.push({ id: session.id, title: session.title, dayLabel })
			} else if (
				session.status === 'completed' &&
				recordingOnly.has(session.id)
			) {
				extras.push({ id: session.id, title: session.title, dayLabel })
			}
		}
	}
	const tracks = week.tracks.filter((track) => track.hasFigures)
	return {
		weekName: week.relativeName,
		rangeLabel: week.rangeLabel,
		tracks,
		loadLine: tracks.length === 0 ? week.loadLine : null,
		missed,
		extras,
		plannedCount,
	}
}

function buildEase(
	data: WeekChangeData,
	coming: TimelineWeek | null,
): WeekChangeEase {
	const lead = coming ? leadTrack(coming.tracks) : null
	// The lead track's unit; hours where there is none to read the week in — a
	// prescription's minutes are always there, its Planned TSS not (it is
	// re-priced after the ease, and may not price at all).
	const currency: VolumeCurrency =
		lead && lead.currency !== 'sets' ? lead.currency : 'hours'
	const plannedValue =
		lead && lead.currency !== 'sets' ? (lead.planned ?? 0) : 0
	const planned =
		lead && plannedValue > 0
			? easePlannedLabel(
					coming!.relativeName,
					formatNbVolumeFigure(plannedValue, currency),
					lead.unit,
				)
			: null
	const volumes = data.eased?.volumes ?? null
	return {
		weekKey: data.comingWeekKey,
		state: data.eased ? 'done' : 'offered',
		plannedLabel: planned,
		currency,
		resultLabel: volumes ? easedLine(volumes.before, volumes.after) : null,
	}
}

function buildProposal(
	proposal: WeekChangeProposal,
	todayKey: string,
	timezone: string,
	peak: NonNullable<WeekChangeProposalView['round']>['peak'],
): WeekChangeProposalView {
	const { payload } = proposal
	const state: ProposalState =
		proposal.answer === 'accepted'
			? 'accepted'
			: proposal.answer === 'declined'
				? 'declined'
				: proposal.appliedAt
					? 'silenced'
					: proposalTooLate(proposal, todayKey)
						? 'too-late'
						: 'answerable'
	const own =
		proposal.target?.owner === 'athlete' || proposal.other?.owner === 'athlete'
	return {
		id: proposal.id,
		kind: payload.kind,
		headline: headlineOf(proposal),
		reason: proposal.reason,
		ownLabel: own ? WEEK_CHANGE_LABELS.own : null,
		addsLoad: proposal.loadDirection === 'adds',
		state,
		stateLabel: stateLabelOf(proposal, state, todayKey, timezone),
		confirmation: confirmationOf(proposal, state),
		scope:
			payload.kind === 'move' && !payload.makeUp
				? {
						options: [
							{ value: 'this-time', label: WEEK_CHANGE_LABELS.thisTime },
							{ value: 'from-now-on', label: WEEK_CHANGE_LABELS.fromNowOn },
						],
					}
				: null,
		round:
			payload.kind === 'add-phase'
				? { factor: payload.factor, ...ROUND_FACTOR_BOUNDS, peak }
				: null,
	}
}

function stateLabelOf(
	proposal: WeekChangeProposal,
	state: ProposalState,
	todayKey: string,
	timezone: string,
): string | null {
	switch (state) {
		case 'answerable':
			return null
		case 'too-late':
			return WEEK_CHANGE_LABELS.tooLate
		case 'accepted':
			return WEEK_CHANGE_LABELS.answeredOk
		case 'declined':
			return WEEK_CHANGE_LABELS.answeredNo
		case 'silenced': {
			const day = localDate(new Date(proposal.appliedAt!), timezone)
			return silencedLabel(day === todayKey, weekdayIndex(day))
		}
	}
}

function sessionName(proposal: WeekChangeProposal): string {
	return quotedSession(proposal.target?.title ?? null)
}

function headlineOf(proposal: WeekChangeProposal): string {
	const { payload, target } = proposal
	const L = WEEK_CHANGE_PROPOSAL_LABELS
	const name = sessionName(proposal)
	switch (payload.kind) {
		case 'keep':
			// A keep on a session lets a missed one go; without one it is the
			// week-level "this week stands" — "keep" is a real proposal (story 50).
			return target ? L.letGo(name) : L.keepWeek
		case 'move':
			return payload.makeUp
				? L.makeUp(name, weekdayIndex(payload.toDate))
				: L.move(
						name,
						weekdayIndex(payload.fromDate),
						weekdayIndex(payload.toDate),
					)
		case 'scale':
			return payload.scope === 'week'
				? L.scaleWeek(payload.factor)
				: L.scale(
						name,
						target ? weekdayIndex(target.dayKey) : null,
						payload.factor,
					)
		case 'swap':
			return L.swap(name, quotedSession(proposal.other?.title ?? null))
		case 'add':
			return L.add(weekdayIndex(payload.date))
		case 'add-phase':
			return L.round(payload.name, payload.weeks, payload.factor)
	}
}

function confirmationOf(
	proposal: WeekChangeProposal,
	state: ProposalState,
): string | null {
	if (state === 'answerable') return null
	if (state === 'too-late') return WEEK_CHANGE_DONE_LABELS.tooLateToAnswer
	const { payload } = proposal
	const D = WEEK_CHANGE_DONE_LABELS
	const name = sessionName(proposal)
	if (state === 'declined') {
		switch (payload.kind) {
			case 'keep':
				return proposal.target ? D.letGo(name) : D.declinedWeek
			case 'add':
				return D.declinedAdd
			case 'add-phase':
				return D.declinedRound
			case 'scale':
				return payload.scope === 'week' ? D.declinedWeek : D.declined(name)
			case 'move':
				return payload.makeUp ? D.declinedMakeUp(name) : D.declined(name)
			case 'swap':
				return D.declined(name)
		}
	}
	// Accepted or silenced: what it wrote — unless an Ok found nothing to write.
	if (!proposal.appliedAt) {
		return payload.kind === 'add-phase' ? D.roundNotApplied : D.tooLate
	}
	switch (payload.kind) {
		case 'keep':
			return proposal.target ? D.letGo(name) : D.keepWeek
		case 'move':
			if (payload.makeUp) return D.makeUp(name, weekdayIndex(payload.toDate))
			return proposal.scope === 'from-now-on'
				? D.moveFromNowOn(name, weekdayIndex(payload.toDate))
				: D.moveThisTime(name, weekdayIndex(payload.toDate))
		case 'scale':
			return payload.scope === 'week'
				? D.scaleWeek(payload.factor)
				: D.scale(name, payload.factor)
		case 'swap':
			return D.swap(name, quotedSession(proposal.other?.title ?? null))
		case 'add':
			return D.add(weekdayIndex(payload.date))
		case 'add-phase':
			return D.round(payload.name, payload.factor)
	}
}

/**
 * "Gjør uka lettere" done: the lead track's Planned Volume before and after,
 * the very number its week header holds (`week-volumes.ts`), in the track's
 * unit — or that nothing was left to ease. Strength sets are never eased, so
 * the lead is the first track the ease could move; null on a plan with none.
 */
export function easedLine(
	before: WeekVolume,
	after: WeekVolume,
): string | null {
	const lead = leadTrack(
		before.tracks.filter((track) => track.currency !== 'sets'),
	)
	if (!lead) return null
	const from = lead.planned ?? 0
	const to =
		after.tracks.find((track) => track.trackId === lead.trackId)?.planned ?? 0
	if (from === to) return WEEK_CHANGE_LABELS.easeNothing
	return WEEK_CHANGE_DONE_LABELS.eased(
		formatNbVolumeFigure(from, lead.currency),
		formatNbVolumeFigure(to, lead.currency),
		NB_VOLUME_UNITS[lead.currency],
	)
}
