/**
 * Fit the season to its Event (`plan.tsx`, #533): the offer, under Avansert, and
 * the sentence it is offered and reported in (`__fit-to-event.server.ts`).
 */

import { Form } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { nbPhaseName, SESONG_REFUSAL_LABELS } from '#app/utils/labels.ts'
import { type FitProposal } from '#app/utils/plan-outline/fit-proposal.ts'

/**
 * The offer to close that gap, and the whole of what tapping it would do.
 *
 * The sentence is the point. Nothing here resizes a season on its own — a shape
 * is a fixed length and the app never stretches one (ADR 0044 §3) — so what makes
 * this legitimate is that the athlete reads the exact edit *before* they ask for
 * it: every block that changes, from how many weeks to how many. It is offered
 * because "your plan runs 9 weeks past your event" is a true sentence that leaves
 * an athlete who does not plan for a living with no idea which block to shorten.
 *
 * A `null` proposal renders nothing at all rather than a disabled control: the
 * plan already lands on the event, or the trim would cost a whole block, and the
 * refusal for the second case arrives on the action rather than as a greyed-out
 * button nobody can interpret.
 */
export function FitToEventOffer({
	outlineId,
	proposal,
}: {
	outlineId: string
	proposal: FitProposal | null
}) {
	if (!proposal) return null
	const weeks = Math.abs(proposal.delta)
	return (
		<Form method="POST" className="space-y-2">
			<input type="hidden" name="intent" value="fit-to-event" />
			<input type="hidden" name="outlineId" value={outlineId} />
			<p className="text-muted-foreground text-sm">
				{fitProposalSentence(proposal)}
			</p>
			<Button type="submit" variant="outline" size="sm">
				{proposal.delta > 0
					? SESONG_REFUSAL_LABELS.fitAdd(weeks)
					: SESONG_REFUSAL_LABELS.fitRemove(weeks)}
			</Button>
		</Form>
	)
}

/**
 * A proposal as a sentence naming **every** block it touches, used both to offer
 * the edit and to report it afterwards. One wording for both, so what the athlete
 * agreed to and what they are told happened cannot differ by a word.
 */
export function fitProposalSentence(proposal: FitProposal): string {
	const changes = proposal.changes
		.map((change) =>
			SESONG_REFUSAL_LABELS.fitChange(
				nbPhaseName(change.name),
				change.from,
				change.to,
			),
		)
		.join(', ')
	return proposal.delta > 0
		? SESONG_REFUSAL_LABELS.fitLengthens(changes)
		: SESONG_REFUSAL_LABELS.fitShortens(changes)
}
