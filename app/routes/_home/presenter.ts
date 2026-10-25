// The home surface's presenters: pure builders that map the loader's domain data
// onto the view-models the screen renders, so the presentation stays dumb and
// the mapping is unit-testable.
//
// They were written for the Cockpit (PR #128), which read top-to-bottom Orient →
// Act → Week → Analyse → History. That composition is gone — `/` is the **Home
// Timeline** — and #499 retired the presenters whose only reader was a Cockpit
// zone (the week filmstrip, the recent-compare strip, the weekly-build chart,
// the discipline mix and the Fitness Projection curve). What is left is what the
// Home Timeline and the Session Nudge applier actually read: today's card and
// its lift lines, the nudge, the plan context and phase bands, and the Load
// Recompute Notice line. (The Proof Strip went with the hero, ADR 0086:
// Rekorder lives on Meg, built by `__me-form-records-presenter.ts`.) The file moved up a directory with them —
// there is no Cockpit folder to live in any more.
//
// Every builder honours the Unavailable Metric principle (GLOSSARY.md, ADR 0008):
// a value the model can't truthfully produce is surfaced as `null`, never a
// fabricated number.

import { dayBoundsUTC, localDate } from '#app/utils/athlete-calendar.ts'
import { planArc } from '#app/utils/dashboard.ts'
import {
	formatDayMonth,
	formatLoad,
	formatNbKg,
	formatNbWeekday,
	roundLoad,
} from '#app/utils/format.ts'
import {
	type DisciplineThresholdMap,
	type DisplayTarget,
	sessionMetricTarget,
} from '#app/utils/intensity-target.ts'
import {
	openEndedBlockLabel,
	RECOMPUTE_NOTICE_LABELS,
} from '#app/utils/labels.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import {
	type CoachRecommendation,
	reconcileCoach,
	type SustainedDeviation,
} from '#app/utils/load/coach.ts'
import { buildEasedPrescription } from '#app/utils/load/eased-prescription.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { isLoadRecomputeKind } from '#app/utils/load/recompute-notice.ts'
import {
	type SessionNudge,
	decideSessionNudge,
	missEasePendingReason,
	selectQualifyingMiss,
} from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
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
	getDisciplineLabel,
	toSessionLedgerEntry,
} from '#app/utils/training.ts'
import {
	blockRepeatTotal,
	type IntensityTarget,
	IntensityTargetSchema,
} from '#app/utils/workout-schema.ts'

const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Today (Act) — the next planned session, today's prescription when it's today.
// ---------------------------------------------------------------------------

export type SessionCtaLabel = 'View session' | 'Log session'

/**
 * The strength track's CTA, and why it is a third label rather than a reuse of
 * the two above.
 *
 * A cardio session is *read* — the link opens the Workout Detail View and the
 * page records nothing (#179). A strength session is *run*: ADR 0060 gives it a
 * session runner where every tap is a write, so the honest promise is the one
 * the session detail page already makes for the same destination — `Log your
 * sets`. Named here rather than inlined in the strip so the wording has one
 * home on this surface and the strip stays markup.
 */
export const STRENGTH_CTA_LABEL = 'Log your sets'

export type TodayCtaLabel = SessionCtaLabel | typeof STRENGTH_CTA_LABEL

/**
 * The honest CTA label for a session's detail-view link, derived from Session
 * Status (GLOSSARY.md: scheduled | completed | skipped | missed). In-app
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

/**
 * One lift of a due strength session, as the decision strip states it.
 *
 * Only what the stamped session actually says: the exercise's own name, the
 * scheme read off its working sets, and the resolved weight when every set
 * agrees on one. Sets that disagree get a set count and no weight — a strip
 * that averaged two different kilos would name a load nobody is lifting (the
 * Unavailable Metric principle, ADR 0008).
 */
export type TodayLiftLine = {
	name: string
	/** The working sets, and their reps where every set agrees on one — the
	 * scheme as numbers, worded by the surface that shows it (`5×5`, `3 sett`). */
	setCount: number
	reps: number | null
	/** The resolved working weight, e.g. `82,5 kg`; null when the sets carry no
	 * single weight (mixed, or no load prescribed at all). */
	loadLabel: string | null
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
	/** The session's own title, or null when `title` is the fallback. */
	ownTitle: string | null
	durationMin: number | null
	plannedTss: number | null
	/** Zone profile bars derived from the workout's real steps (may be empty). */
	profile: ProfileBar[]
	/** Headline Intensity Target resolved against the athlete's thresholds; null when none. */
	target: DisplayTarget | null
	/** Honest CTA label: derived from Session Status via `sessionCtaLabel` (#179)
	 * for a cardio session; `Log your sets` for a strength one. */
	cta: TodayCtaLabel
	/** Where the single action goes: the Workout Detail View, or — for a strength
	 * session — the session runner (ADR 0060). */
	ctaTo: string
	/**
	 * The lifts a due strength session will ask for; **null on the cardio
	 * branch**, so there is never an empty strength half.
	 *
	 * This is also the track discriminant the strip branches on — read from the
	 * workout's Discipline, never guessed. A separate `kind` field beside it would
	 * be a second copy of the same fact that the two could disagree on; the shapes
	 * differ only by these lines, so the lines themselves say which shape it is.
	 */
	lifts: TodayLiftLine[] | null
}

/**
 * The lift lines of a strength session, read off its own stamped rows.
 *
 * A program session carries the resolved kilo on every `ExerciseSet`
 * (`openNextProgramSession` stamps it), so this is a read and not a
 * recomputation: the strip can never name a weight the runner disagrees with.
 * Steps are walked in authored order; a step with no exercise is not a lift and
 * is skipped.
 */
export function buildTodayLiftLines(
	workout: LedgerSession['workout'],
): TodayLiftLine[] {
	if (!workout) return []
	return workout.blocks
		.slice()
		.sort((a, b) => a.orderIndex - b.orderIndex)
		.flatMap((block) =>
			block.steps
				.slice()
				.sort((a, b) => a.orderIndex - b.orderIndex)
				.filter((step) => step.kind === 'strength' && step.exercise != null)
				.map((step) => {
					const sets = step.sets
					const reps = sets[0]?.reps ?? null
					const sameReps =
						reps != null && sets.every((set) => set.reps === reps)
					const kg = sets[0]?.weightKg ?? null
					const sameKg = kg != null && sets.every((set) => set.weightKg === kg)
					return {
						name: step.exercise!.name,
						setCount: sets.length,
						reps: sameReps ? reps : null,
						loadLabel: sameKg ? `${formatNbKg(kg)} kg` : null,
					}
				}),
		)
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
		.map((session) => ({
			session,
			entry: toSessionLedgerEntry(session, now, undefined, thresholds),
		}))
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
	const isStrength = session.workout?.discipline === 'strength'
	return {
		id: session.id,
		isToday: localDate(date, timezone) === todayKey,
		date,
		dateLabel: formatDayMonth(date, timezone),
		discipline: entry.discipline,
		disciplineLabel: getDisciplineLabel(entry.discipline),
		title: sessionTitle(entry.discipline, entry.title),
		ownTitle: entry.title ?? null,
		durationMin: entry.durationMin,
		plannedTss: entry.plannedTss != null ? roundLoad(entry.plannedTss) : null,
		profile: deriveSessionProfile(session.workout).bars,
		target: sessionMetricTarget(session.workout, thresholds),
		// The strength branch (#477). A lifting session is run rather than read, so
		// its action opens the session runner ADR 0060 designed for it; everything
		// else keeps the Workout Detail View and the Session-Status label verbatim,
		// which is what makes "no strength session due" mean "the strip is
		// unchanged" and not "an empty strength card".
		...(isStrength
			? {
					ctaTo: `/training/sessions/${session.id}/log`,
					cta: STRENGTH_CTA_LABEL,
					lifts: buildTodayLiftLines(session.workout),
				}
			: {
					ctaTo: `/training/sessions/${session.id}`,
					cta: sessionCtaLabel({
						status: session.status,
						hasSessionLog: session.sessionLog != null,
					}),
					lifts: null,
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
	const recentMiss = selectQualifyingMiss(
		input.ledger,
		now,
		timezone,
		thresholds,
	)

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
					label: formatNbWeekday(today.date, timezone),
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

/** How many steps blocks execute — each block's steps times its repeats —
 * without expanding them. */
function executedStepCount(
	blocks: ReadonlyArray<{
		repeatCount: number
		seriesRepeatCount?: number | null
		steps: ReadonlyArray<unknown>
	}>,
): number {
	return blocks.reduce(
		(sum, block) => sum + blockRepeatTotal(block) * block.steps.length,
		0,
	)
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
	// Count the executed steps per block before expanding any: the target is a
	// step or two, so a session whose count differs (`100 × 100 × 10 s`) is
	// answered without walking its reps, and one whose count matches is as
	// small as the target (#638).
	if (
		executedStepCount(session.workout.blocks) !==
		executedStepCount(eased.blocks)
	)
		return false
	const persisted = expandWorkoutSteps(session.workout)
	const target = eased.blocks.flatMap((block) =>
		Array.from({ length: blockRepeatTotal(block) }, () => block.steps).flat(),
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
// Plan context (Orient) — the road-to-race signals beside the Form hero. Null
// when there's no active plan (the "road to race" frame collapses; the page
// falls back to the plan-less surface).
// ---------------------------------------------------------------------------
export type PlanContext = {
	/** Null, with the name and the countdown, for an open-ended plan (ADR 0079). */
	eventId: string | null
	eventName: string | null
	daysToEvent: number | null
	/**
	 * `blokk 2 av ∞` — where an open-ended plan stands, counted by phase position
	 * (#505 story 9). Null for a plan toward an Event, which counts weeks instead.
	 */
	blockLabel: string | null
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
	 * Spelled-out Week Load reading (#181): "66% of planned endurance load" —
	 * this week's actual load as a share of the load the plan prescribed (Weekly
	 * Plan Adherence). Honest when the ratio is unresolvable: "Planned endurance
	 * load unavailable", never a fabricated percentage.
	 *
	 * **It says which track.** ADR 0046 §4 found the defect and named the fix a
	 * name rather than an algorithm: the ratio is a TSS ratio, strength has no
	 * TSS by decision, so this figure was never the week's — it was endurance's,
	 * presented as the week's. Its arithmetic is untouched; only its claim is.
	 * The strength companion is a Summary Count, not a second ratio.
	 */
	weekLoadLabel: string
}

export function buildPlanContext(
	activePlan: ActivePlan | null,
	weeklyAdherence: WeeklyAdherence | null,
	now: Date = new Date(),
): PlanContext | null {
	if (!activePlan) return null
	const eventDate = activePlan.eventDate ? new Date(activePlan.eventDate) : null
	const arc = planArc(
		activePlan.phases,
		new Date(activePlan.planStart),
		eventDate,
		now,
	)
	// No Event, no countdown: an open-ended plan has no race day to count to, and
	// a number here would be one invented for it (ADR 0079).
	const daysToEvent = eventDate
		? Math.max(0, Math.ceil((eventDate.getTime() - now.getTime()) / DAY_MS))
		: null
	const weekLoadPct = weeklyAdherence
		? Math.round(weeklyAdherence.ratio * 100)
		: null
	// The round comes from the server, which counts it in the Athlete Timezone
	// exactly as the plan page does (`ActivePlan.round`).
	const blockLabel =
		activePlan.round == null ? null : openEndedBlockLabel(activePlan.round)
	const arcLabel =
		blockLabel ??
		`Week ${arc.weekInPlan} of ${arc.totalWeeks} · ${arc.phase} phase`
	return {
		eventId: activePlan.eventId,
		eventName: activePlan.eventName,
		daysToEvent,
		blockLabel,
		phase: arc.phase,
		weekInPlan: arc.weekInPlan,
		totalWeeks: arc.totalWeeks,
		weekLoadPct,
		arcLabel,
		arcChipLabel:
			daysToEvent == null
				? arcLabel
				: `${daysToEvent} ${daysToEvent === 1 ? 'day' : 'days'} to race · ${arcLabel}`,
		weekLoadLabel:
			weekLoadPct != null
				? `${weekLoadPct}% of planned endurance load`
				: 'Planned endurance load unavailable',
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
	// The bands lay forward from the plan's authored start (ADR 0044 §3), so they
	// stay put when a phase is added rather than sliding to meet the Event.
	const planStart = new Date(activePlan.planStart)
	const currentPhaseIndex = planArc(
		activePlan.phases,
		planStart,
		activePlan.eventDate ? new Date(activePlan.eventDate) : null,
		now,
	).phaseIndex
	let cumulativeWeeks = 0
	return activePlan.phases.map((phase, index) => {
		const start = new Date(planStart.getTime() + cumulativeWeeks * 7 * DAY_MS)
		cumulativeWeeks += phase.weeks
		const end = new Date(planStart.getTime() + cumulativeWeeks * 7 * DAY_MS)
		return {
			name: phase.name,
			start,
			end,
			// Compared by position, never by name: a season with two A-races runs
			// Base twice, and matching on the name lights both up (ADR 0044 §2).
			isCurrent: index === currentPhaseIndex,
		}
	})
}

// ---------------------------------------------------------------------------
// Load Recompute Notice (ADR 0046 §2) — the one-time explanation for a Training
// Load correction that moved a number the athlete had already read. The
// backfill writes the row; this maps it to copy. Two rules:
//
//   1. The movement is named in the same rounded units the triad shows, so the
//      sentence and the chart agree.
//   2. A `kind` this builder has no words for renders nothing. Copy is written
//      per correction, never generated from a template — a vague "some numbers
//      changed" line explains nothing and is worse than saying nothing.
// ---------------------------------------------------------------------------
export type LoadRecomputeNotice = {
	kind: string
	ctlBefore: number
	ctlAfter: number
}

export type LoadRecomputeLine = {
	/** Echoed back on acknowledgement so one "got it" dismisses one notice. */
	kind: string
	/** Eyebrow naming what happened, e.g. "Fitness recalculated". */
	kicker: string
	/** Why it happened, in the athlete's terms. */
	explanation: string
	/** The movement, e.g. "Fitness fell by up to 15 (62 → 48 at the widest)". */
	movement: string
}

export function buildLoadRecomputeLine(
	notice: LoadRecomputeNotice | null,
): LoadRecomputeLine | null {
	if (!notice) return null
	if (!isLoadRecomputeKind(notice.kind)) return null
	const copy = RECOMPUTE_NOTICE_LABELS.copy[notice.kind]
	// "by up to … at the widest point": the stored pair is the day the recompute
	// moved CTL most, which for a past gym block is a historical chart point and
	// not today's figure. A present-tense "moved from A to B" would be false there.
	const before = formatLoad(notice.ctlBefore)
	const after = formatLoad(notice.ctlAfter)
	const drop = formatLoad(notice.ctlBefore - notice.ctlAfter)
	return {
		kind: notice.kind,
		...copy,
		movement: RECOMPUTE_NOTICE_LABELS.movement(drop, before, after),
	}
}
