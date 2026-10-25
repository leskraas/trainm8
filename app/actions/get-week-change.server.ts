import { z } from 'zod/v4'
import {
	addDays,
	dayBoundsUTC,
	localDate,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ACTION_TITLE_LABELS } from '#app/utils/labels.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import {
	proposalTooLate,
	type WeekChangeData,
	type WeekChangeProposal,
} from '#app/utils/load/week-change-card.ts'
import { SESSION_OWNERS } from '#app/utils/session-ownership.ts'
import { readRecordedBindingSet } from '#app/utils/source-terms.server.ts'
import { defineAction } from './define.ts'
import { ATHLETE_YES_PATH } from './paths.ts'
import { NumberReading, reading, unavailable } from './reading.ts'

const PROPOSAL_KINDS = [
	'keep',
	'move',
	'swap',
	'add',
	'scale',
	'add-phase',
] as const

/**
 * Whether a proposal still waits for an answer the athlete can give: pending,
 * not applied, and its session not passed — the card's own rule for "open".
 */
export function isWaiting(
	proposal: WeekChangeProposal,
	todayKey: string,
): boolean {
	return (
		proposal.answer === 'pending' &&
		!proposal.appliedAt &&
		!proposalTooLate(proposal, todayKey)
	)
}

/** How many proposals on the latest closed week's card still wait. */
export function waitingCount(card: WeekChangeData | null, todayKey: string) {
	return card ? card.proposals.filter((p) => isWaiting(p, todayKey)).length : 0
}

/**
 * _Ukeskiftet_ (ADR 0080): the latest closed week's Week Replan and its
 * proposals, as data. Read-only: answering stays the athlete's, in trainm8
 * (`answer_proposal` and the others are `web` only; ADR 0093 §3), so each
 * proposal carries the link to where they answer it.
 *
 * Wraps `readWeekChange`, the reader behind the card. The card's own view
 * model (`buildWeekChangeCard`) is Norwegian presentation for the screen and
 * is not lifted: a model reads the data, not the card's sentences. The stored
 * reasons are such sentences too — composed with measured adherence and form,
 * and with the athlete's session titles — so they never cross: the week's
 * outcome code and its facts, each a gated Reading, do instead (ADR 0092 §7).
 */
export const getWeekChangeAction = defineAction({
	name: 'get_week_change',
	revision: 1,
	kind: 'read',
	callers: ['web', 'mcp', 'agent'],
	title: ACTION_TITLE_LABELS.get_week_change,
	description:
		"The latest week change (Ukeskiftet): the closed week's replan outcome, the adherence and form it read (as Readings), and its proposals for the coming week, whether each still waits for the athlete's answer, and whose session each targets. Only the athlete can answer a proposal, in trainm8; each proposal carries the link to where they do. Null when no week has closed with a replan yet.",
	input: z.object({}),
	output: z
		.object({
			closedWeekKey: z.string(),
			comingWeekKey: z.string(),
			/**
			 * What the week's close decided: `proposed`, `no-change`,
			 * `insufficient-data` or `adjusted` (an older in-place rescale).
			 */
			outcome: z.string(),
			/** The closed week's Weekly Plan Adherence, as a ratio (1 = as planned). */
			adherence: NumberReading(),
			/** The form (TSB) the decision read. */
			tsb: NumberReading(),
			/** Some proposal still waits for the athlete's answer. */
			open: z.boolean(),
			proposals: z.array(
				z.object({
					id: z.string(),
					kind: z.enum(PROPOSAL_KINDS),
					loadDirection: z.enum(['adds', 'keeps-or-reduces']),
					answer: z.enum(['pending', 'accepted', 'declined']),
					applied: z.boolean(),
					waiting: z.boolean(),
					target: z
						.object({
							sessionId: z.string(),
							date: z.string(),
							discipline: z.string().nullable(),
							owner: z.enum(SESSION_OWNERS),
						})
						.nullable(),
					link: z.string(),
				}),
			),
			/** The athlete already made the coming week easier. */
			eased: z.boolean(),
		})
		.nullable(),
	async run(ctx) {
		const card = await readWeekChange(ctx.userId, { now: ctx.now })
		if (!card) return null
		const todayKey = localDate(ctx.now, ctx.timezone)
		const closedWeek = {
			from: dayBoundsUTC(card.closedWeekKey, ctx.timezone).start,
			to: dayBoundsUTC(addDays(card.closedWeekKey, 6), ctx.timezone).end,
		}
		const [replan, closedWeekRecorded, history] = await Promise.all([
			prisma.weekReplan.findUniqueOrThrow({
				where: {
					athleteId_weekKey: {
						athleteId: ctx.userId,
						weekKey: card.closedWeekKey,
					},
				},
				select: { outcome: true, adherenceRatio: true, tsb: true },
			}),
			readRecordedBindingSet(ctx.userId, closedWeek),
			readRecordedBindingSet(ctx.userId),
		])
		return {
			closedWeekKey: card.closedWeekKey,
			comingWeekKey: card.comingWeekKey,
			outcome: replan.outcome,
			// The facts the decision read, each through the gate with what it was
			// measured from: adherence from the closed week's Recordings, form
			// from the whole load history (ADR 0098 §1).
			adherence: reading(
				replan.adherenceRatio ?? unavailable('insufficient-data'),
				closedWeekRecorded,
				ctx,
			),
			tsb: reading(
				replan.tsb ?? unavailable('insufficient-data'),
				history,
				ctx,
			),
			open: card.open,
			proposals: card.proposals.map((proposal) => ({
				id: proposal.id,
				kind: proposal.payload.kind,
				loadDirection: proposal.loadDirection,
				answer: proposal.answer,
				applied: proposal.appliedAt != null,
				waiting: !card.open ? false : isWaiting(proposal, todayKey),
				target: proposal.target
					? {
							sessionId: proposal.target.id,
							date: proposal.target.dayKey,
							discipline: proposal.target.discipline,
							owner: proposal.target.owner,
						}
					: null,
				link: ctx.link(ATHLETE_YES_PATH),
			})),
			eased: card.eased != null,
		}
	},
})
