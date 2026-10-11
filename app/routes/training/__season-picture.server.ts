/**
 * Sesong's season picture, read (round-2 decision 12, ADR 0090): I dag's
 * compact curve and season table (ADR 0087 §2), for the plan the page shows.
 *
 * Read the way I dag reads them, not beside it: the plan through
 * `getPlanForOutline` (the same reading as `getActivePlan`, for any of the
 * athlete's plans), the ledger over the same reach, `buildTimelineSeason`, and
 * then `buildSeasonTable` / `buildSeasonCurve` — so a week reads the same
 * `mål · gjort` on I dag and on Sesong, and nothing here is a second opinion
 * about a week. Built on the server and handed over as data: the client gets
 * the table and the curve, never the season's day rows (which only I dag's
 * list draws).
 */
import {
	buildTimelineSeason,
	TIMELINE_TRAILING_DAYS,
} from '#app/routes/_home/timeline/presenter.ts'
import {
	buildSeasonCurve,
	buildSeasonTable,
	type SeasonCurve,
	type SeasonTable,
} from '#app/routes/_home/timeline/season-table.ts'
import { prisma } from '#app/utils/db.server.ts'
import { parseProposalPayload } from '#app/utils/load/week-replan-proposal.ts'
import { type VolumeCurrency } from '#app/utils/plan-outline/derive.ts'
import {
	getPlanForOutline,
	getSessionLedger,
} from '#app/utils/training.server.ts'

const DAY_MS = 24 * 60 * 60 * 1000

export type SeasonPicture = {
	table: SeasonTable
	/** The curve, without its formatter (a function does not travel). */
	curve: Omit<SeasonCurve, 'figure'>
	/** The lead track's currency, for the curve's figures; null reads load. */
	currency: VolumeCurrency | null
	/** The lead track's id: the track a row's week-target edit opens on. */
	leadTrackId: string | null
	/** No Event and no end: the table's last row says the plan carries on. */
	openEnded: boolean
	/**
	 * The next round of an open-ended plan, proposed in Ukeskiftet and not yet
	 * answered (ADR 0079 S6) — shown read-only on Sesong, which never answers
	 * it: the proposal has one surface (ADR 0080).
	 */
	pendingRound: { name: string } | null
}

export async function readSeasonPicture(
	userId: string,
	outlineId: string,
	timezone: string,
	now: Date = new Date(),
): Promise<SeasonPicture | null> {
	const plan = await getPlanForOutline(userId, outlineId, now)
	if (!plan) return null

	// The ledger as I dag reaches it behind today, and ahead to the plan's last
	// week (a day past its Sunday, so a late session on it is in).
	const planWeeks = plan.phases.reduce((sum, phase) => sum + phase.weeks, 0)
	const planEnd = plan.planStart.getTime() + planWeeks * 7 * DAY_MS
	const horizonDays = Math.max(14, Math.ceil((planEnd - now.getTime()) / DAY_MS) + 1)
	const [ledger, pendingRound] = await Promise.all([
		getSessionLedger(userId, {
			trailingDays: TIMELINE_TRAILING_DAYS,
			horizonDays,
			now,
		}),
		plan.eventId == null ? readPendingRound(userId, outlineId) : null,
	])

	const season = buildTimelineSeason({ ledger, now, timezone, activePlan: plan })
	const { figure: _figure, ...curve } = buildSeasonCurve(season)
	const lead = plan.tracks.find((track) => track.trackId === season.leadTrackId)
	return {
		table: buildSeasonTable(season.weeks, season.leadTrackId),
		curve,
		currency: lead?.currency ?? null,
		leadTrackId: season.leadTrackId,
		openEnded: plan.eventId == null,
		pendingRound,
	}
}

/** The open-ended plan's next round, waiting for a yes in Ukeskiftet. */
async function readPendingRound(
	userId: string,
	outlineId: string,
): Promise<{ name: string } | null> {
	const rows = await prisma.weekReplanProposal.findMany({
		where: {
			athleteId: userId,
			kind: 'add-phase',
			answer: 'pending',
			appliedAt: null,
		},
		select: { payload: true },
		orderBy: { createdAt: 'desc' },
	})
	for (const row of rows) {
		const payload = parseProposalPayload(row.payload)
		if (payload.kind === 'add-phase' && payload.outlineId === outlineId) {
			return { name: payload.name }
		}
	}
	return null
}
