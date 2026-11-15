/**
 * `proposals`: what the plan wants to change after the last week closed, and
 * what it changed by itself. The domain's own week-change read, with each
 * proposal said the way the domain says it (headline, reason, state).
 */
import { buildProposal } from '#app/routes/_home/timeline/week-change.ts'
import { leadTrack } from '#app/routes/_home/timeline/week-words.ts'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { nbStoredReplanReason } from '#app/utils/labels.ts'
import { readAutopilotNotice } from '#app/utils/load/autopilot-notice.server.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import {
	type WeekChangeData,
	type WeekChangeProposal,
	type WeekChangeSession,
} from '#app/utils/load/week-change-card.ts'
import { type ActivePlan } from '#app/utils/training.server.ts'
import { type CapabilityCtx } from '../define.ts'
import {
	type ProposalItem,
	type ProposalsOutput,
	type VolumeUnit,
} from '../reads.types.ts'
import { maybe, sportOf, whyOf } from './shared.server.ts'

function sessionOf(s: WeekChangeSession | null): ProposalItem['session'] {
	return s
		? {
				id: s.id,
				date: s.dayKey,
				sport: s.discipline ? sportOf(s.discipline) : null,
				title: s.title,
				whose: s.owner === 'athlete' ? 'athlete' : 'plan',
			}
		: null
}

function changeOf(p: WeekChangeProposal): ProposalItem['change'] {
	const { payload } = p
	switch (payload.kind) {
		case 'keep':
			return { kind: 'keep' }
		case 'move':
			return {
				kind: 'move',
				fromDate: payload.fromDate,
				toDate: payload.toDate,
				makeUp: payload.makeUp,
			}
		case 'swap':
			return { kind: 'swap' }
		case 'add':
			return { kind: 'add', date: payload.date, time: payload.time }
		case 'scale':
			return {
				kind: 'scale',
				factor: payload.factor,
				wholeWeek: payload.scope === 'week',
			}
		case 'add-phase':
			return {
				kind: 'add-phase',
				name: payload.name,
				weeks: payload.weeks,
				factor: payload.factor,
			}
	}
}

/** The week change's proposals as items, the domain's state and words. */
export function proposalItems(
	ctx: CapabilityCtx,
	data: WeekChangeData,
	plan: ActivePlan | null,
): ProposalItem[] {
	const todayKey = localDate(ctx.now, ctx.timezone)
	// The last block's peak week in the plan's lead sport: what a next
	// block's factor scales (the domain's own `lastRoundPeak`).
	const lead = plan ? leadTrack(plan.tracks) : null
	const last = plan?.phases.at(-1)
	const peakValue =
		lead && last && lead.currency !== 'sets'
			? Math.max(0, ...lead.targets.slice(-last.weeks).map((t) => t ?? 0))
			: 0
	const peak =
		lead && peakValue > 0 ? { value: peakValue, currency: lead.currency } : null
	return data.proposals.map((p) => {
		const view = buildProposal(p, todayKey, ctx.timezone, peak)
		const state: ProposalItem['state'] =
			view.state === 'answerable'
				? data.open
					? 'waiting'
					: 'too-late'
				: view.state === 'silenced'
					? 'applied-silently'
					: view.state
		return {
			id: p.id,
			kind: p.payload.kind,
			headline: view.headline,
			reason: view.reason,
			addsLoad: view.addsLoad,
			touchesOwnSession: view.ownLabel != null,
			state,
			stateLabel: view.stateLabel,
			weekKey: p.targetWeekKey,
			session: sessionOf(p.target),
			otherSession: sessionOf(p.other),
			asksScope: view.scope != null,
			block: view.round
				? {
						factor: view.round.factor,
						min: view.round.min,
						max: view.round.max,
						step: view.round.step,
						peak: view.round.peak
							? {
									value: view.round.peak.value,
									unit: view.round.peak.currency as VolumeUnit,
								}
							: null,
					}
				: null,
			change: changeOf(p),
		}
	})
}

export async function readProposals(
	ctx: CapabilityCtx,
	plan: ActivePlan | null,
): Promise<ProposalsOutput> {
	const [data, notice, profile] = await Promise.all([
		readWeekChange(ctx.userId, { now: ctx.now }),
		readAutopilotNotice(ctx.userId, { now: ctx.now }),
		prisma.athleteProfile.findUnique({
			where: { userId: ctx.userId },
			select: { autopilot: true },
		}),
	])
	const proposals = data ? proposalItems(ctx, data, plan) : []
	const weekLevelKeep = data?.proposals.some(
		(p) => p.payload.kind === 'keep' && p.target == null,
	)
	const eased = data?.eased?.volumes ?? null
	return {
		source: 'athlete',
		adjustMode: profile?.autopilot === false ? 'ask-first' : 'autopilot',
		waiting: proposals.filter((p) => p.state === 'waiting').length,
		closedWeek: data?.closedWeekKey ?? null,
		forWeek: data?.comingWeekKey ?? null,
		summary: data && !weekLevelKeep ? nbStoredReplanReason(data.reason) : null,
		proposals,
		changesMade: notice
			? {
					heading: notice.heading,
					weekKey: notice.comingWeekKey,
					changes: notice.lines.map((line) => ({
						proposalId: line.proposalId,
						kind: line.kind,
						text: line.volumeLine
							? `${line.text} ${line.volumeLine}`
							: line.text,
						about: line.subject,
						undo: line.undo,
					})),
					undoable: notice.undoable,
				}
			: null,
		easedWeek:
			data && eased
				? {
						weekKey: data.comingWeekKey,
						sports: eased.before.tracks.map((before) => {
							const after = eased.after.tracks.find(
								(t) => t.trackId === before.trackId,
							)
							return {
								sport: sportOf(before.discipline),
								unit: before.currency as VolumeUnit,
								before: maybe(before.planned, whyOf('not-resolved')),
								after: maybe(after?.planned, whyOf('not-resolved')),
							}
						}),
					}
				: null,
	}
}
