import { dayBoundsUTC, localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { computeSessionTss } from './compute.ts'
import { buildLoadCurve, type DailyTss } from './load-curve.ts'
import {
	assessTsbTrust,
	daysOfLoadHistory,
	type TsbTrust,
} from './trustworthiness.ts'

// NOTE: Synchronous recompute — suitable for SQLite/hobby project (ADR 0008).
// Recomputing forwards from a changed date is O(days since change).
//
// Day attribution (which local calendar day an instant belongs to, and the UTC
// bounds of a local day) is owned by the Athlete Calendar module (#122) — the
// canonical, DST-correct timezone math, shared with Weekly Plan Adherence.

type DisciplineProfile = {
	discipline: string
	lthr: number | null
	maxHr: number | null
	ftp: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
	preferCogganTss: boolean
	preferRTSS: boolean
}

async function getAthleteContext(athleteId: string): Promise<{
	timezone: string
	disciplineProfiles: DisciplineProfile[]
} | null> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: athleteId },
		select: {
			timezone: true,
			disciplineProfiles: {
				select: {
					discipline: true,
					lthr: true,
					maxHr: true,
					ftp: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
					preferCogganTss: true,
					preferRTSS: true,
				},
			},
		},
	})
	if (!profile) return null
	return profile
}

type DayContribution = {
	tss: number
	formula: string
	discipline: string
}

/** Compute TSS contributions for all sessions/imports on a given calendar day. */
async function computeDayContributions(
	athleteId: string,
	dateStr: string,
	timezone: string,
	athleteContext: { disciplineProfiles: DisciplineProfile[] },
): Promise<DayContribution[]> {
	const { start, end } = dayBoundsUTC(dateStr, timezone)
	const contributions: DayContribution[] = []

	// WorkoutSessions with a SessionLog (has RPE) or with a recording (has HR/power/pace)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId: athleteId,
			scheduledAt: { gte: start, lte: end },
			status: 'completed',
		},
		select: {
			id: true,
			tssValue: true,
			tssFormula: true,
			tssConfidence: true,
			workout: { select: { discipline: true } },
			recording: {
				select: {
					discipline: true,
					durationSec: true,
					hrAvg: true,
					powerAvg: true,
					paceAvgSecPerKm: true,
				},
			},
			sessionLog: { select: { rpe: true } },
		},
	})

	for (const session of sessions) {
		const discipline =
			session.workout?.discipline ?? session.recording?.discipline
		if (!discipline) continue

		const recording = session.recording
		const rpe = session.sessionLog?.rpe ?? null
		const result = computeSessionTss(
			{
				discipline,
				durationSec: recording?.durationSec ?? 0,
				rpe,
			},
			{
				hrAvg: recording?.hrAvg ?? null,
				powerAvg: recording?.powerAvg ?? null,
				paceAvgSecPerKm: recording?.paceAvgSecPerKm ?? null,
			},
			athleteContext,
		)

		// Persist TSS provenance on the session row
		await prisma.workoutSession.update({
			where: { id: session.id },
			data: {
				tssValue: result?.tss ?? null,
				tssFormula: result?.formula ?? null,
				tssConfidence: result?.confidence ?? null,
			},
		})

		if (result) {
			contributions.push({
				tss: result.tss,
				formula: result.formula,
				discipline,
			})
		}
	}

	// Promoted ActivityImports whose session isn't already counted above
	// (recording-only imports not linked to a WorkoutSession directly)
	const imports = await prisma.activityImport.findMany({
		where: {
			athleteId,
			startedAt: { gte: start, lte: end },
			promotedSessionId: { not: null },
		},
		select: {
			id: true,
			discipline: true,
			durationSec: true,
			hrAvg: true,
			powerAvg: true,
			paceAvgSecPerKm: true,
			promotedSession: {
				select: {
					id: true,
					sessionLog: { select: { rpe: true } },
				},
			},
		},
	})

	const countedSessionIds = new Set(sessions.map((s) => s.id))
	for (const imp of imports) {
		// Skip if the promoted session was already processed above
		if (imp.promotedSession && countedSessionIds.has(imp.promotedSession.id)) {
			continue
		}

		const rpe = imp.promotedSession?.sessionLog?.rpe ?? null
		const result = computeSessionTss(
			{ discipline: imp.discipline, durationSec: imp.durationSec, rpe },
			{
				hrAvg: imp.hrAvg,
				powerAvg: imp.powerAvg,
				paceAvgSecPerKm: imp.paceAvgSecPerKm,
			},
			athleteContext,
		)

		await prisma.activityImport.update({
			where: { id: imp.id },
			data: {
				tssValue: result?.tss ?? null,
				tssFormula: result?.formula ?? null,
				tssConfidence: result?.confidence ?? null,
			},
		})

		if (result) {
			contributions.push({
				tss: result.tss,
				formula: result.formula,
				discipline: imp.discipline,
			})
		}
	}

	return contributions
}

/**
 * Recompute LoadSnapshot for the athlete starting from `fromDate` (YYYY-MM-DD)
 * through today (in athlete timezone). Called when a Session Log, ActivityImport
 * promotion, or ThresholdEvent changes.
 */
export async function recomputeLoadFrom(
	athleteId: string,
	fromDateStr: string,
): Promise<void> {
	const athleteContext = await getAthleteContext(athleteId)
	if (!athleteContext) return

	const { timezone, disciplineProfiles } = athleteContext

	const todayStr = localDate(new Date(), timezone)

	// Gather all dates from fromDate to today
	const dates: string[] = []
	let current = new Date(`${fromDateStr}T12:00:00.000Z`)
	const todayRef = new Date(`${todayStr}T12:00:00.000Z`)
	while (current <= todayRef) {
		dates.push(localDate(current, timezone))
		current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
	}

	if (dates.length === 0) return

	// Load the snapshot just before fromDate to get initial CTL/ATL
	const prevDate = new Date(`${fromDateStr}T12:00:00.000Z`)
	prevDate.setUTCDate(prevDate.getUTCDate() - 1)
	const prevDateStr = localDate(prevDate, timezone)

	const prevSnapshot = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId, date: prevDateStr } },
		select: { ctl: true, atl: true },
	})

	const anchor = {
		ctl: prevSnapshot?.ctl ?? 0,
		atl: prevSnapshot?.atl ?? 0,
	}

	// Fetch: TSS contributions per day (also persists per-row TSS provenance).
	const dailyTss: DailyTss[] = []
	for (const dateStr of dates) {
		const contributions = await computeDayContributions(
			athleteId,
			dateStr,
			timezone,
			{ disciplineProfiles },
		)

		const tssTotal = contributions.reduce((sum, c) => sum + c.tss, 0)
		const tssByDiscipline: Record<string, number> = {}
		for (const c of contributions) {
			tssByDiscipline[c.discipline] =
				(tssByDiscipline[c.discipline] ?? 0) + c.tss
		}

		dailyTss.push({ date: dateStr, tssTotal, tssByDiscipline })
	}

	// Build: the pure Load Curve — daily TSS + anchor in, snapshot series out.
	const curve = buildLoadCurve(dailyTss, anchor)

	// Persist: write the snapshot series.
	for (const point of curve) {
		const row = {
			tssTotal: point.tssTotal,
			tssByDiscipline: JSON.stringify(point.tssByDiscipline),
			ctl: point.ctl,
			atl: point.atl,
			tsb: point.tsb,
			computedAt: new Date(),
		}
		await prisma.loadSnapshot.upsert({
			where: { athleteId_date: { athleteId, date: point.date } },
			create: { athleteId, date: point.date, ...row },
			update: row,
		})
	}
}

/** Get recent LoadSnapshots for display (last N days). */
export async function getLoadSnapshots(
	athleteId: string,
	days = 90,
): Promise<
	Array<{
		date: string
		tssTotal: number
		tssByDiscipline: Record<string, number>
		ctl: number
		atl: number
		tsb: number
	}>
> {
	const timezone =
		(
			await prisma.athleteProfile.findUnique({
				where: { userId: athleteId },
				select: { timezone: true },
			})
		)?.timezone ?? 'UTC'

	const todayStr = localDate(new Date(), timezone)
	const cutoffDate = new Date(`${todayStr}T12:00:00.000Z`)
	cutoffDate.setUTCDate(cutoffDate.getUTCDate() - days + 1)
	const cutoffStr = localDate(cutoffDate, timezone)

	const rows = await prisma.loadSnapshot.findMany({
		where: {
			athleteId,
			date: { gte: cutoffStr },
		},
		orderBy: { date: 'asc' },
		select: {
			date: true,
			tssTotal: true,
			tssByDiscipline: true,
			ctl: true,
			atl: true,
			tsb: true,
		},
	})

	return rows.map((r) => ({
		...r,
		tssByDiscipline: JSON.parse(r.tssByDiscipline) as Record<string, number>,
	}))
}

/**
 * Determine whether the athlete's Form (TSB) is trustworthy yet, based on how
 * many days of load history they've accumulated since their first Load
 * Snapshot. Page-agnostic: callers render the "building baseline" progress
 * when not trustworthy, and the real TSB number once at/above the threshold.
 */
export async function getTsbTrust(athleteId: string): Promise<TsbTrust> {
	const [firstSnapshot, profile] = await Promise.all([
		prisma.loadSnapshot.findFirst({
			where: { athleteId },
			orderBy: { date: 'asc' },
			select: { date: true },
		}),
		prisma.athleteProfile.findUnique({
			where: { userId: athleteId },
			select: { timezone: true },
		}),
	])
	const todayStr = localDate(new Date(), profile?.timezone ?? 'UTC')
	return assessTsbTrust(
		daysOfLoadHistory(firstSnapshot?.date ?? null, todayStr),
	)
}

/** Get the most recent snapshot (today's fitness/fatigue/form). */
export async function getCurrentLoad(athleteId: string): Promise<{
	ctl: number
	atl: number
	tsb: number
	date: string
} | null> {
	const row = await prisma.loadSnapshot.findFirst({
		where: { athleteId },
		orderBy: { date: 'desc' },
		select: { ctl: true, atl: true, tsb: true, date: true },
	})
	return row ?? null
}
