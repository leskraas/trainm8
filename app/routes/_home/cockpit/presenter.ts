// The Cockpit home (PR #128 "road to race" redesign) reads top-to-bottom the
// way an athlete opens the app: Orient → Act → Week → Analyse → History. These
// pure builders map the loader's domain data onto the view-models each zone
// renders, so the presentation stays dumb and the mapping is unit-testable.
//
// Every builder honours the Unavailable Metric principle (CONTEXT.md, ADR 0008):
// a value the model can't truthfully produce is surfaced as `null`, never a
// fabricated number. The fitness *projection* and pace/HR/power targets the
// prototype mocked are deliberately absent here — they need modelling first
// (tracked as follow-up issues). Personal Records (the Proof strip, #134) are
// real: derived in `personal-records.ts`, formatted for display by
// `buildProofStrip` below.

import {
	addDays,
	dayBoundsUTC,
	localDate,
	weekBoundsUTC,
} from '#app/utils/athlete-calendar.ts'
import { planArc } from '#app/utils/dashboard.ts'
import {
	formatDayMonth,
	formatDayOfMonth,
	formatDistance,
	formatMeters,
	formatWeekday,
	formatWeekdayShort,
	roundLoad,
} from '#app/utils/format.ts'
import {
	type DisciplineThresholdMap,
	type DisplayTarget,
	sessionMetricTarget,
} from '#app/utils/intensity-target.ts'
import {
	type AdherenceBand,
	type WeeklyAdherence,
} from '#app/utils/load/adherence.ts'
import {
	type CoachRecommendation,
	reconcileCoach,
	type SustainedDeviation,
} from '#app/utils/load/coach.ts'
import { buildEasedPrescription } from '#app/utils/load/eased-prescription.ts'
import {
	type FitnessProjectionPoint,
	projectFitnessToRace,
} from '#app/utils/load/fitness-projection.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import {
	type SessionNudge,
	decideSessionNudge,
	missEasePendingReason,
	selectQualifyingMiss,
} from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadSnapshot } from '#app/utils/load/types.ts'
import {
	type BenchmarkKind,
	type PersonalRecord,
} from '#app/utils/personal-records.ts'
import {
	type ProfileBar,
	deriveSessionProfile,
	expandWorkoutSteps,
} from '#app/utils/session-profile.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import {
	type LedgerStatus,
	getDisciplineLabel,
	toSessionLedgerEntry,
} from '#app/utils/training.ts'
import {
	type IntensityTarget,
	IntensityTargetSchema,
} from '#app/utils/workout-schema.ts'

const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Today (Act) — the next planned session, today's prescription when it's today.
// ---------------------------------------------------------------------------

export type SessionCtaLabel = 'View session' | 'Log session'

/**
 * The honest CTA label for a session's detail-view link, derived from Session
 * Status (CONTEXT.md: scheduled | completed | skipped | missed). In-app
 * recording is a stated non-goal, so the label never promises to start or
 * record anything (#179) — clicking it always opens the Workout Detail View:
 *
 * - `completed` without a Session Log yet → "Log session": it's time to
 *   reflect, and the Workout Detail View hosts the Session Log form.
 * - everything else (scheduled, skipped, missed, or completed with its log
 *   already written) → "View session": the detail page shows the prescription
 *   or the record, nothing more.
 *
 * Deliberately a tiny pure mapping: the #184 decision-strip Dashboard derives
 * its single action from Session Status through this same function, so the
 * two surfaces can never disagree about what the button honestly does.
 */
export function sessionCtaLabel(session: {
	status: string
	hasSessionLog: boolean
}): SessionCtaLabel {
	return session.status === 'completed' && !session.hasSessionLog
		? 'Log session'
		: 'View session'
}

export type TodayCard = {
	id: string
	/** True when the session falls on today's date; otherwise it's the next one up. */
	isToday: boolean
	date: Date
	/** Display date via the shared formatting layer, e.g. `4 Jul`. */
	dateLabel: string
	discipline: string
	disciplineLabel: string
	title: string
	durationMin: number | null
	plannedTss: number | null
	/** Zone profile bars derived from the workout's real steps (may be empty). */
	profile: ProfileBar[]
	/** Headline Intensity Target resolved against the athlete's thresholds; null when none. */
	target: DisplayTarget | null
	/** Honest CTA label derived from Session Status via `sessionCtaLabel` (#179). */
	cta: SessionCtaLabel
}

function sessionTitle(discipline: string, title: string | null): string {
	return title ?? `${getDisciplineLabel(discipline)} session`
}

export function buildTodayCard(
	ledger: LedgerSession[],
	now: Date = new Date(),
	thresholds: DisciplineThresholdMap = {},
	timezone: string = 'UTC',
): TodayCard | null {
	const todayKey = localDate(now, timezone)
	const todayStart = dayBoundsUTC(todayKey, timezone).start.getTime()
	const next = ledger
		.map((session) => ({ session, entry: toSessionLedgerEntry(session, now) }))
		.filter(
			({ session, entry }) =>
				entry.status === 'planned' &&
				new Date(session.scheduledAt).getTime() >= todayStart,
		)
		.sort(
			(a, b) =>
				new Date(a.session.scheduledAt).getTime() -
				new Date(b.session.scheduledAt).getTime(),
		)[0]
	if (!next) return null
	const { session, entry } = next
	const date = new Date(session.scheduledAt)
	return {
		id: session.id,
		isToday: localDate(date, timezone) === todayKey,
		date,
		dateLabel: formatDayMonth(date, timezone),
		discipline: entry.discipline,
		disciplineLabel: getDisciplineLabel(entry.discipline),
		title: sessionTitle(entry.discipline, entry.title),
		durationMin: entry.durationMin,
		plannedTss: entry.plannedTss != null ? roundLoad(entry.plannedTss) : null,
		profile: deriveSessionProfile(session.workout).bars,
		target: sessionMetricTarget(session.workout, thresholds),
		cta: sessionCtaLabel({
			status: session.status,
			hasSessionLog: session.sessionLog != null,
		}),
	}
}

// ---------------------------------------------------------------------------
// Session Nudge (Orient) — the read-only coach→plan decision on the next
// planned session (#157). Reuses the SAME next-session selection the Today card
// uses (`buildTodayCard`), the SAME cold-start / reconcile logic the Coach card
// uses, and the SAME qualifying-miss selection the applier uses
// (`selectQualifyingMiss`, #185/#186/#187), so what is decided, what is said
// and what is applied can never disagree. Read-only: this composes a decision
// for display; no session is mutated here (the applier persists any ease on
// the load-recompute path).
// ---------------------------------------------------------------------------
export function buildSessionNudge(input: {
	ledger: LedgerSession[]
	current: { tsb: number } | null
	trust: TsbTrust
	sustained: SustainedDeviation | null
	now?: Date
	thresholds?: DisciplineThresholdMap
	timezone?: string
}): SessionNudge {
	const now = input.now ?? new Date()
	const thresholds = input.thresholds ?? {}
	const timezone = input.timezone ?? 'UTC'
	const today = buildTodayCard(input.ledger, now, thresholds, timezone)

	const tsb = input.current?.tsb ?? null
	// Cold-start (ADR 0008/0010): below the trust gate — or with no TSB yet —
	// there is no trustworthy Form number, so Form readiness is unavailable.
	const coldStart = !input.trust.trustworthy || tsb == null
	const recommendation: CoachRecommendation | null = reconcileCoach(
		coldStart ? null : readinessFromTsb(tsb),
		input.sustained,
	)
	// The miss signal is structural, from the same ledger — never assembled by
	// callers, so the miss the card names is the miss the applier acts on
	// (#185/#186); the display and the applier can't drift.
	const recentMiss = selectQualifyingMiss(input.ledger, now, timezone)

	// `decisionInput` deliberately excludes the miss: the honesty guard below
	// re-runs the decision on it to learn whether an ease is miss-driven.
	const decisionInput = {
		recommendation,
		trust: input.trust,
		tsb,
		sustained: input.sustained,
		nextSession: today
			? {
					discipline: today.discipline,
					label: formatWeekday(today.date, timezone),
					durationMin: today.durationMin,
				}
			: null,
	}
	const nudge = decideSessionNudge({ ...decisionInput, recentMiss })

	// Display honesty guard (#187): a miss materialises passively with time, so
	// a miss-driven `eased` decision can appear on a GET before the applier has
	// persisted anything (no background job in v1). Until the next session's
	// persisted prescription equals the canonical eased target, the card says
	// what is happening ("easing your next session") — never a past-tense claim
	// of an ease that didn't happen. A Form/adherence back-off ease is untouched:
	// it is decided and applied on the same load-recompute path (and subsumes a
	// co-occurring miss, A5), so it is already persisted when displayed.
	if (nudge.outcome === 'eased' && recentMiss && today) {
		// Miss-driven ⇔ the ease exists only because of the miss.
		const missDriven = decideSessionNudge(decisionInput).outcome !== 'eased'
		const nextSession = input.ledger.find((s) => s.id === today.id) ?? null
		const easePersisted =
			nextSession != null &&
			easedPrescriptionPersisted(nextSession, {
				discipline: today.discipline,
				durationMin: today.durationMin,
				profile: thresholds[today.discipline] ?? null,
			})
		if (missDriven && !easePersisted) {
			return { ...nudge, reason: missEasePendingReason(recentMiss) }
		}
	}
	return nudge
}

/** Parse a persisted step's Intensity Target JSON; null when absent/malformed. */
function parseStepIntensity(raw: string | null): IntensityTarget | null {
	if (!raw) return null
	try {
		const parsed = IntensityTargetSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/**
 * Whether the session's persisted prescription already equals the canonical
 * eased target the applier writes (`buildEasedPrescription`): endurance intent
 * and exactly the target's executed steps — same kind, discipline, duration and
 * authored endurance-zone label. Structural, never prose-parsed; the target is
 * absolute (ADR 0006/0019), so a persisted match is exactly "the ease
 * happened" and anything else is honestly "not yet".
 */
function easedPrescriptionPersisted(
	session: LedgerSession,
	source: Parameters<typeof buildEasedPrescription>[0],
): boolean {
	const eased = buildEasedPrescription(source)
	if (!eased.blocks || !session.workout) return false
	if (session.workout.intent !== eased.intent) return false
	const persisted = expandWorkoutSteps(session.workout)
	const target = eased.blocks.flatMap((block) =>
		Array.from({ length: block.repeatCount }, () => block.steps).flat(),
	)
	if (persisted.length !== target.length) return false
	return persisted.every(({ step }, i) => {
		const want = target[i]!
		if (step.kind !== want.kind) return false
		if (step.discipline !== want.discipline) return false
		if ((step.durationSec ?? null) !== want.durationSec) return false
		const intensity = parseStepIntensity(step.intensity)
		return (
			intensity?.kind === 'zoneLabel' &&
			want.intensity.kind === 'zoneLabel' &&
			intensity.label === want.intensity.label
		)
	})
}

// ---------------------------------------------------------------------------
// Week (Mon→Sun timeline) — one cell per day, status-aware.
// ---------------------------------------------------------------------------
export type WeekDayCell = {
	date: Date
	/** Display label via the shared formatting layer, e.g. `Fri 4`. */
	dayLabel: string
	isToday: boolean
	/** `rest` when the day has no session; otherwise the ledger status. */
	state: LedgerStatus | 'rest'
	session: {
		id: string
		discipline: string
		disciplineLabel: string
		title: string
		durationMin: number | null
		/** Actual TSS for a completed day, else the planned TSS; null when neither. */
		tss: number | null
		profile: ProfileBar[]
		/** Headline Intensity Target resolved against the athlete's thresholds; null when none. */
		target: DisplayTarget | null
	} | null
}

export function buildWeekTimeline(
	ledger: LedgerSession[],
	now: Date = new Date(),
	thresholds: DisciplineThresholdMap = {},
	timezone: string = 'UTC',
): WeekDayCell[] {
	// Days are bucketed by the Athlete Calendar (Athlete Timezone), the same
	// windows Weekly Plan Adherence uses — and identically on server and client,
	// so the timeline can never hydrate differently from its SSR markup.
	const monday = localDate(weekBoundsUTC(now, timezone).start, timezone)
	const todayKey = localDate(now, timezone)

	const byDay = new Map<string, LedgerSession[]>()
	for (const session of ledger) {
		const key = localDate(new Date(session.scheduledAt), timezone)
		const bucket = byDay.get(key) ?? []
		bucket.push(session)
		byDay.set(key, bucket)
	}

	return Array.from({ length: 7 }, (_, i) => {
		const key = addDays(monday, i)
		const date = dayBoundsUTC(key, timezone).start
		const dayLabel = `${formatWeekdayShort(date, timezone)} ${formatDayOfMonth(date, timezone)}`
		const isToday = key === todayKey
		const sessions = (byDay.get(key) ?? []).sort(
			(a, b) =>
				new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
		)
		const first = sessions[0]
		if (!first) {
			return { date, dayLabel, isToday, state: 'rest' as const, session: null }
		}
		const entry = toSessionLedgerEntry(first, now)
		const tss = entry.status === 'completed' ? entry.load : entry.plannedTss
		return {
			date,
			dayLabel,
			isToday,
			state: entry.status,
			session: {
				id: first.id,
				discipline: entry.discipline,
				disciplineLabel: getDisciplineLabel(entry.discipline),
				title: sessionTitle(entry.discipline, entry.title),
				durationMin: entry.durationMin,
				tss: tss != null ? roundLoad(tss) : null,
				profile: deriveSessionProfile(first.workout).bars,
				target: sessionMetricTarget(first.workout, thresholds),
			},
		}
	})
}

/**
 * Plain-language progress line for the "This week" zone (#181): "2 of 4
 * sessions done", never the expert shorthand "2/4 done". Counts completed
 * Workout Sessions against the week's scheduled ones — a truthful Summary
 * Count over the same cells the timeline renders, kept on the presenter so
 * the #184 re-composition says the same words.
 */
export function weekProgressLabel(cells: WeekDayCell[]): string {
	const done = cells.filter((c) => c.state === 'completed').length
	const planned = cells.filter((c) => c.session !== null).length
	return `${done} of ${planned} ${planned === 1 ? 'session' : 'sessions'} done`
}

// ---------------------------------------------------------------------------
// Recent (Analyse) — completed sessions, planned vs actual with adherence band.
// ---------------------------------------------------------------------------
export type RecentCompareRow = {
	id: string
	date: Date
	/** Display date via the shared formatting layer, e.g. `4 Jul`. */
	dateLabel: string
	discipline: string
	disciplineLabel: string
	title: string
	plannedTss: number | null
	actualTss: number | null
	/** null unless both planned & actual TSS exist — never a fabricated band. */
	band: AdherenceBand | null
}

export function buildRecentCompare(
	ledger: LedgerSession[],
	now: Date = new Date(),
	limit = 4,
	timezone: string = 'UTC',
): RecentCompareRow[] {
	return ledger
		.map((session) => ({ session, entry: toSessionLedgerEntry(session, now) }))
		.filter(({ entry }) => entry.status === 'completed')
		.sort(
			(a, b) =>
				new Date(b.session.scheduledAt).getTime() -
				new Date(a.session.scheduledAt).getTime(),
		)
		.slice(0, limit)
		.map(({ session, entry }) => ({
			id: session.id,
			date: new Date(session.scheduledAt),
			dateLabel: formatDayMonth(new Date(session.scheduledAt), timezone),
			discipline: entry.discipline,
			disciplineLabel: getDisciplineLabel(entry.discipline),
			title: sessionTitle(entry.discipline, entry.title),
			plannedTss: entry.plannedTss != null ? roundLoad(entry.plannedTss) : null,
			actualTss: entry.load != null ? roundLoad(entry.load) : null,
			band: entry.adherence,
		}))
}

// ---------------------------------------------------------------------------
// The build (Analyse) — trailing weekly planned-vs-actual TSS. Honest about the
// window: only weeks up to and including the current one (future planned load
// isn't modelled, so we don't draw it). A week with no resolvable planned load
// comes back null and renders as a gap, never a zero.
// ---------------------------------------------------------------------------
export type WeeklyBuildBar = {
	weekStart: Date
	/** Display label for the week's Monday, e.g. `29 Jun`. */
	weekLabel: string
	isCurrent: boolean
	plannedTss: number | null
	actualTss: number | null
}

export function buildWeeklyBuild(
	weeks: Array<WeeklyAdherence | null>,
	now: Date = new Date(),
	timezone: string = 'UTC',
): WeeklyBuildBar[] {
	// `getRecentWeeklyAdherence` returns oldest-first with the current week last,
	// windowed by the Athlete Calendar — so the Mondays here are derived the same
	// way (never local-runtime week math, which drifts between server and client).
	const currentMonday = localDate(weekBoundsUTC(now, timezone).start, timezone)
	const n = weeks.length
	return weeks.map((week, i) => {
		const monday = addDays(currentMonday, -7 * (n - 1 - i))
		const weekStart = dayBoundsUTC(monday, timezone).start
		return {
			weekStart,
			weekLabel: formatDayMonth(weekStart, timezone),
			isCurrent: i === n - 1,
			plannedTss: week ? roundLoad(week.totalPlanned) : null,
			actualTss: week ? roundLoad(week.totalActual) : null,
		}
	})
}

// ---------------------------------------------------------------------------
// Plan context (Orient) — the road-to-race signals beside the Form hero. Null
// when there's no active plan (the "road to race" frame collapses; the page
// falls back to the plan-less surface).
// ---------------------------------------------------------------------------
export type PlanContext = {
	eventId: string
	eventName: string
	daysToEvent: number
	phase: string
	weekInPlan: number
	totalWeeks: number
	/** This week's actual/planned load as a percentage; null when unavailable. */
	weekLoadPct: number | null
	/**
	 * Spelled-out plan-arc position (#181), e.g. "Week 9 of 10 · Peak phase" —
	 * never the expert shorthand "W9 of 10 · Peak". Lives on the presenter so
	 * every Dashboard composition (#184 tabs included) renders the same words.
	 */
	arcLabel: string
	/**
	 * The header plan-arc chip's full text (#184): countdown + `arcLabel`,
	 * spelled out — e.g. "14 days to race · Week 9 of 10 · Peak phase", never
	 * "14d · Peak · W9/10". The chip replaces the 3-stat plan bar and keeps its
	 * #178 contract: it links to the Target Event detail.
	 */
	arcChipLabel: string
	/**
	 * Spelled-out Week Load reading (#181): "66% of planned week load" — this
	 * week's actual load as a share of the load the plan prescribed (Weekly Plan
	 * Adherence). Honest when the ratio is unresolvable: "Planned week load
	 * unavailable", never a fabricated percentage.
	 */
	weekLoadLabel: string
}

export function buildPlanContext(
	activePlan: ActivePlan | null,
	weeklyAdherence: WeeklyAdherence | null,
	now: Date = new Date(),
): PlanContext | null {
	if (!activePlan) return null
	const eventDate = new Date(activePlan.eventDate)
	const arc = planArc(activePlan.phases, eventDate, now)
	const daysToEvent = Math.max(
		0,
		Math.ceil((eventDate.getTime() - now.getTime()) / DAY_MS),
	)
	const weekLoadPct = weeklyAdherence
		? Math.round(weeklyAdherence.ratio * 100)
		: null
	const arcLabel = `Week ${arc.weekInPlan} of ${arc.totalWeeks} · ${arc.phase} phase`
	return {
		eventId: activePlan.eventId,
		eventName: activePlan.eventName,
		daysToEvent,
		phase: arc.phase,
		weekInPlan: arc.weekInPlan,
		totalWeeks: arc.totalWeeks,
		weekLoadPct,
		arcLabel,
		arcChipLabel: `${daysToEvent} ${daysToEvent === 1 ? 'day' : 'days'} to race · ${arcLabel}`,
		weekLoadLabel:
			weekLoadPct != null
				? `${weekLoadPct}% of planned week load`
				: 'Planned week load unavailable',
	}
}

// ---------------------------------------------------------------------------
// Fitness phase bands (Act) — the periodized phases as absolute date ranges so
// the FitnessJourney can position them on its time axis. Empty without a plan.
// ---------------------------------------------------------------------------
export type PhaseBand = {
	name: string
	start: Date
	end: Date
	isCurrent: boolean
}

export function buildPhaseBands(
	activePlan: ActivePlan | null,
	now: Date = new Date(),
): PhaseBand[] {
	if (!activePlan) return []
	const eventDate = new Date(activePlan.eventDate)
	const totalWeeks = activePlan.phases.reduce((sum, p) => sum + p.weeks, 0)
	const planStart = new Date(eventDate.getTime() - totalWeeks * 7 * DAY_MS)
	const currentPhase = planArc(activePlan.phases, eventDate, now).phase
	let cumulativeWeeks = 0
	return activePlan.phases.map((phase) => {
		const start = new Date(planStart.getTime() + cumulativeWeeks * 7 * DAY_MS)
		cumulativeWeeks += phase.weeks
		const end = new Date(planStart.getTime() + cumulativeWeeks * 7 * DAY_MS)
		return {
			name: phase.name,
			start,
			end,
			isCurrent: phase.name === currentPhase,
		}
	})
}

// ---------------------------------------------------------------------------
// Proof (Personal Records) — the derived best-efforts that show training is
// working (#134). The detection lives in `personal-records.ts`; this builder
// only turns each record into display strings (label, value, the gain over the
// previous best), so the strip component stays dumb. Empty array ⇒ the strip
// renders its empty/Unavailable state, never a fabricated zero.
// ---------------------------------------------------------------------------
export type ProofRecord = {
	discipline: string
	disciplineLabel: string
	/** Chip eyebrow, e.g. "Longest run". */
	label: string
	/** Formatted record value, e.g. "21.1 km" or "1,500 m". */
	value: string
	/** Formatted gain over the previous best, e.g. "+11.1 km"; null when first. */
	delta: string | null
}

const BENCHMARK_VERB: Record<BenchmarkKind, string> = { farthest: 'Longest' }

// Swims read in metres (a swimmer thinks "1,500 m", not "1.5 km"); run and bike
// reuse the shared distance formatter so the strip matches the kilometres shown
// everywhere else in the app.
function formatRecordDistance(discipline: string, meters: number): string {
	return discipline === 'swim' ? formatMeters(meters) : formatDistance(meters)
}

export function buildProofStrip(records: PersonalRecord[]): ProofRecord[] {
	return records.map((record) => {
		const disciplineLabel = getDisciplineLabel(record.discipline)
		return {
			discipline: record.discipline,
			disciplineLabel,
			label: `${BENCHMARK_VERB[record.kind]} ${disciplineLabel.toLowerCase()}`,
			value: formatRecordDistance(record.discipline, record.value),
			delta:
				record.delta != null
					? `+${formatRecordDistance(record.discipline, record.delta)}`
					: null,
		}
	})
}

// ---------------------------------------------------------------------------
// Fitness Projection (Act) — the dashed CTL curve from today to race day,
// replaying the active Plan Outline's weekly-load pattern (#132). Display-only:
// null without a plan (the curve simply ends at today), and an explicit
// `unavailable` state — never a guessed curve — when the CTL anchor can't be
// trusted or the Outline carries no weekly-load pattern (Unavailable Metric, ADR
// 0008).
// ---------------------------------------------------------------------------
export type FitnessProjection =
	| { status: 'projected'; points: FitnessProjectionPoint[] }
	| { status: 'unavailable'; reason: string }

export function buildFitnessProjection(
	activePlan: ActivePlan | null,
	snapshots: LoadSnapshot[],
	tsbTrust: TsbTrust,
): FitnessProjection | null {
	if (!activePlan) return null

	// Anchor on the most recent measured Load Snapshot so the dashed projection
	// begins exactly where the solid history ends.
	const anchor = snapshots
		.filter(
			(s) => Number.isFinite(Date.parse(s.date)) && Number.isFinite(s.ctl),
		)
		.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
		.at(-1)

	// Without a trustworthy CTL baseline the anchor is still climbing from a cold
	// start (ADR 0008); projecting from it would mislead, so surface why instead.
	if (!anchor || !tsbTrust.trustworthy) {
		return {
			status: 'unavailable',
			reason: `Building baseline · day ${tsbTrust.daysOfHistory}/${tsbTrust.requiredDays}`,
		}
	}

	const points = projectFitnessToRace({
		phases: activePlan.phases,
		anchorCtl: anchor.ctl,
		anchorDate: new Date(Date.parse(anchor.date)),
		eventDate: new Date(activePlan.eventDate),
	})
	if (!points) {
		return { status: 'unavailable', reason: 'Plan has no weekly-load pattern' }
	}
	return { status: 'projected', points }
}
