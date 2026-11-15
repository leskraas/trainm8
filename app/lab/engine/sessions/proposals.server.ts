/**
 * Which of the plan's proposals still wait for the athlete's answer, read
 * through the same reader the week's own card uses (`readWeekChange`) and
 * its one rule for a proposal that has passed (`proposalTooLate`).
 */
import { localDate } from '#app/utils/athlete-calendar.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import { proposalTooLate } from '#app/utils/load/week-change-card.ts'

/** The ids of the proposals the athlete can still answer, oldest first. */
export async function answerableProposalIds(
	userId: string,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<string[]> {
	const card = await readWeekChange(userId, { now })
	if (!card?.open) return []
	const todayKey = localDate(now, timezone)
	return card.proposals
		.filter(
			(proposal) =>
				proposal.answer === 'pending' &&
				!proposal.appliedAt &&
				!proposalTooLate(proposal, todayKey),
		)
		.map((proposal) => proposal.id)
}
