/**
 * Copying a week onto another week of the plan (#415, #533): the action behind
 * `__copy-week.tsx`, which the route's action dispatches to.
 */

import { data } from 'react-router'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { SESONG_COPY_LABELS, SESONG_REFUSAL_LABELS } from '#app/utils/labels.ts'
import {
	copyWeek,
	type CopyWeekRefusal,
	type CopyWeekReport,
} from '#app/utils/plan-outline/copy-week.server.ts'
import {
	WeekCopySchema,
	type CopySkipReason,
} from '#app/utils/plan-outline/copy-week.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	checked,
	OUTLINE_GONE,
	refuse,
	firstIssue,
} from './__plan-action.server.ts'

/** An open-ended plan resting behind a plan toward a race (ADR 0079). */
const PLAN_RESTING = SESONG_REFUSAL_LABELS.planResting

const WEEK_OUTSIDE_PLAN = SESONG_REFUSAL_LABELS.weekOutside

/**
 * Copy one week of this plan onto another week of it (#415).
 *
 * The shape the retired stamp had (decision 14): a target week that already
 * holds sessions comes back as a question carrying the counts rather than as an
 * error, and a success redirects because the calendar changed in a way the page
 * cannot state by itself.
 *
 * What is *different* is the one sentence the toast has to carry: a copy is copied as
 * authored. It is not stretched to meet the target week's derived figure, so an
 * athlete who copies a 40 km week onto a 55 km week gets 40 km and the Weeks reading
 * shows it against the 55 (ADR 0040 §1).
 */
export async function copyWeekOnto(
	userId: string,
	request: Request,
	formData: FormData,
) {
	const submitted = WeekCopySchema.safeParse({
		outlineId: formData.get('outlineId'),
		sourceWeekKey: formData.get('sourceWeekKey'),
		targetWeekKey: formData.get('targetWeekKey'),
		replace: checked(formData, 'replace'),
	})
	if (!submitted.success) return refuse(firstIssue(submitted.error))

	const copied = await copyWeek(userId, submitted.data)
	if (!copied.ok) {
		if (copied.reason !== 'target-week-filled') {
			return refuse(copyRefusalMessage(copied.reason))
		}
		// No `error` key: this is a question, not a refusal to word at the top of the
		// reading. The panel that renders it is the answer.
		return data(
			{
				copy: {
					sourceWeekKey: submitted.data.sourceWeekKey,
					targetWeekKey: submitted.data.targetWeekKey,
					conflict: copied.conflict,
				},
			},
			{ status: 400 },
		)
	}

	const url = new URL(request.url)
	return redirectWithToast(`${url.pathname}${url.search}`, {
		type: 'success',
		title: SESONG_COPY_LABELS.done,
		description: copySentence(
			copied.report,
			submitted.data.sourceWeekKey,
			submitted.data.targetWeekKey,
		),
	})
}

/**
 * What a copy did, in one sentence — the counts, then the two things the athlete has
 * to know: the weeks are independent, and the copy was not scaled to the week it
 * landed on.
 */
function copySentence(
	report: CopyWeekReport,
	sourceWeekKey: string,
	targetWeekKey: string,
): string {
	const skipped = copySkippedSentence(report.skipped)
	// The ISO weeks, as every Sesong surface numbers them (audit B6).
	return `${SESONG_COPY_LABELS.sentence(
		report.sessions,
		isoWeekNumber(sourceWeekKey),
		isoWeekNumber(targetWeekKey),
		report.replaced,
	)}${skipped}`
}

/**
 * The sessions that produced no copy, named by reason — an absence with its cause
 * rather than a silent gap in the count (ADR 0008).
 */
function copySkippedSentence(skipped: CopyWeekReport['skipped']): string {
	const reasons = new Set(skipped.map((skip) => skip.reason))
	const clauses = [...reasons].map((reason) => COPY_SKIP_COPY[reason])
	return clauses.length === 0 ? '' : ` ${clauses.join(' ')}`
}

const COPY_SKIP_COPY: Record<CopySkipReason, string> = {
	'no-prescription': SESONG_COPY_LABELS.noPrescription,
}

function copyRefusalMessage(
	reason: Exclude<CopyWeekRefusal, 'target-week-filled'>,
): string {
	switch (reason) {
		case 'plan-resting':
			return PLAN_RESTING
		case 'plan-gone':
			return OUTLINE_GONE
		case 'week-outside-plan':
			return WEEK_OUTSIDE_PLAN
		case 'same-week':
			return SESONG_REFUSAL_LABELS.sameWeek
		case 'source-week-empty':
			return SESONG_REFUSAL_LABELS.sourceEmpty
		case 'nothing-to-copy':
			// The week holds sessions, but every one of them is a recording with no
			// prescription behind it. Named rather than reported as a copy of nothing.
			return SESONG_REFUSAL_LABELS.nothingToCopy
	}
}
