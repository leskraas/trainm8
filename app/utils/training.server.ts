import { type Prisma } from '@prisma/client'
import { type ActivityStream, parseStoredStream } from './activity-stream.ts'
import {
	addDays,
	dayBoundsUTC,
	weekBoundsFromMondayUTC,
	weekBoundsUTC,
	weekMonday,
} from './athlete-calendar.ts'
import { parseTrainableWeekdays } from './athlete-schema.ts'
import { getAthleteTimezone } from './athlete.server.ts'
import { type PlanPhaseSpec } from './dashboard.ts'
import { prisma } from './db.server.ts'
import { type DisciplineThresholdMap } from './intensity-target.ts'
import {
	weeklyAdherence,
	weeklyLoad,
	type WeeklyAdherence,
	type WeeklyLoad,
} from './load/adherence.ts'
import {
	availabilityFitWarnings,
	hoursFitWarnings,
	weeklyEnduranceHours,
	type FitSegment,
	type StrengthFitSegment,
} from './plan-outline/availability-fit.ts'
import { bandFitWarnings } from './plan-outline/band-fit.ts'
import {
	seasonSpanGroups,
	type SeasonSpanGroup,
} from './plan-outline/commensurability.ts'
import {
	isStrengthGoal,
	phaseIndexForWeek,
	totalWeeks,
	weekRole,
	type PhaseSpec,
	type StrengthGoal,
	type StrengthWeekRole,
	type VolumeCurrency,
	type WeekRole,
} from './plan-outline/derive.ts'
import { eventFit, type EventFit } from './plan-outline/event-fit.ts'
import {
	phaseReadings,
	phaseSpecs,
	resolvedTracks,
	type PhaseReading,
	type ResolvedTrack,
	type SegmentReading,
	type WeekTargetReading,
} from './plan-outline/from-rows.ts'
import {
	plannedWeeklyLoad,
	type PlannedLoadBasis,
} from './plan-outline/planned-load.ts'
import { type RampWarning } from './plan-outline/ramp-guard.ts'
import { type SeasonSpanReading } from './plan-outline/season-span.ts'
import { type Pct1RMBand } from './plan-outline/strength-goal.ts'
import {
	UNAVAILABLE_READINGS,
	type UnavailableReading,
} from './plan-outline/unavailable-readings.ts'
import { readConversionContexts } from './plan-outline/volume-conversion.server.ts'
import { weekIndexOf, weekKeyAt } from './plan-outline/week-keys.ts'
import {
	fixedDayVolume,
	isPatternWeekday,
	type PatternDaySpec,
} from './plan-outline/week-pattern.ts'
import {
	DISCIPLINES,
	isCardioDiscipline,
	type Discipline,
} from './workout-schema.ts'

const stepSelect = {
	id: true,
	kind: true,
	notes: true,
	discipline: true,
	intensity: true,
	intensityHrMin: true,
	intensityHrMax: true,
	intensityPowerMin: true,
	intensityPowerMax: true,
	intensityPaceMin: true,
	intensityPaceMax: true,
	orderIndex: true,
	durationSec: true,
	distanceM: true,
	verticalM: true,
	gradePct: true,
	cadenceRpmMin: true,
	cadenceRpmMax: true,
	rest: true,
	exerciseId: true,
	restBetweenSetsSec: true,
	exercise: {
		select: {
			id: true,
			name: true,
			primaryMuscle: true,
			equipment: true,
		},
	},
	sets: {
		orderBy: { orderIndex: 'asc' as const },
		select: {
			id: true,
			kind: true,
			orderIndex: true,
			load: true,
			weightKg: true,
			pct1RM: true,
			effortCap: true,
			tempo: true,
			reps: true,
			durationSec: true,
			terminationRir: true,
			velocityLossPct: true,
		},
	},
} satisfies Prisma.WorkoutStepSelect

/**
 * An Event is still upcoming when it hasn't finished yet: a multi-day Event
 * counts until its end date passes; a single-day Event (no end date) until its
 * start date does.
 */
function notYetPast(now: Date): Prisma.EventWhereInput {
	return {
		OR: [{ endDate: null, startDate: { gte: now } }, { endDate: { gte: now } }],
	}
}

export type ActivePlan = {
	/** The Target Event the plan anchors to; tapping the card opens its detail. */
	eventId: string
	eventName: string
	/** Target Event date — the plan's finish line (arc end). */
	eventDate: Date
	/**
	 * The plan's authored first Training Week, as an instant: that week's Monday in
	 * the Athlete Timezone (ADR 0044 §3). The arc lays the phases forward from here
	 * rather than counting back from the Event, so a plan that ends short of its
	 * Event shows that instead of silently stretching.
	 */
	planStart: Date
	/** Plan Outline phases: the arc essentials, name + week span (ADR 0018). */
	phases: PlanPhaseSpec[]
	/**
	 * Per plan week, earliest first: the week's projectable TSS, or null where any
	 * endurance track's reading is an **Unavailable Metric**. The Fitness Projection
	 * replays this forward to race day (#132) and declines on any null rather than
	 * guessing.
	 *
	 * Read through the **mix-aware Volume Conversion** (ADR 0045), so it responds to
	 * how hard the plan is and not only how much of it there is — the flat
	 * `TSS_PER_PLANNED_HOUR` this replaced was retired with #411 on ADR 0045 §12's
	 * trigger. Accumulated across **every endurance** track, since a plan carries one
	 * track per Discipline (ADR 0043 §1) and TSS is commensurable across them by
	 * construction (ADR 0046 §1). A strength track contributes nothing: projected CTL
	 * falls only as far as the endurance tracks actually fall (ADR 0047 §5).
	 */
	weeklyTss: Array<number | null>
	/**
	 * The one derivation statement the whole curve carries (ADR 0045 §10) — which
	 * tracks fed it, which conventions were stacked, and which tracks fed nothing and
	 * why. Codes only; the surface words them (ADR 0023).
	 */
	loadBasis: PlannedLoadBasis
}

/**
 * The active plan (ADR 0018): a Training Plan is a *view*, not an entity — it's
 * the nearest upcoming Target Event carrying a Plan Outline. Events without an
 * Outline are calendar markers, not plans, and are skipped even when nearer;
 * past/cancelled events don't anchor an active plan either. Returns the arc
 * essentials (event + phases) plus the derived per-week load for the home Plan
 * card, or null when there's no active plan (the card's empty state).
 */
export async function getActivePlan(
	userId: string,
	now: Date = new Date(),
): Promise<ActivePlan | null> {
	const found = await findActiveOutline(userId, now)
	if (!found) return null
	const { event, outline } = found

	const timezone = await getAthleteTimezone(userId)
	const tracks = resolvedTracks(outline)
	// Every track, strength included. Exclusion is the projection's own decision,
	// stated with its reason, rather than a filter here that would leave the
	// surface unable to say why a lifting block moves nothing (ADR 0047 §5).
	const load = plannedWeeklyLoad({
		phases: phaseSpecs(outline),
		tracks,
		contexts: await readConversionContexts(
			userId,
			outline.startWeekKey,
			tracks.map((track) => track.discipline),
		),
	})

	return {
		eventId: event.id,
		eventName: event.name,
		eventDate: event.startDate,
		planStart: dayBoundsUTC(outline.startWeekKey, timezone).start,
		phases: phaseReadings(outline),
		weeklyTss: load.weeklyTss,
		loadBasis: load.basis,
	}
}

const activeOutlineSelect = {
	id: true,
	name: true,
	startDate: true,
	planOutline: {
		select: {
			id: true,
			startWeekKey: true,
			phases: {
				select: {
					id: true,
					orderIndex: true,
					name: true,
					weeks: true,
					rhythm: true,
					tapers: true,
				},
			},
			tracks: {
				select: {
					// The handle a **Week Pattern** day joins on: a day references its
					// track by foreign key rather than by Discipline (ADR 0044 §7).
					id: true,
					discipline: true,
					currency: true,
					anchors: { select: { fromWeekKey: true, value: true } },
					// Both segment kinds, with everything each carries: since #400 a
					// strength segment is resolved rather than filtered out, and it is
					// positioned by its own dates with a deload tail of its own
					// (ADR 0047 §6).
					segments: {
						select: {
							id: true,
							kind: true,
							phaseId: true,
							ramp: true,
							boundaryStep: true,
							recoveryCut: true,
							taperCut: true,
							startWeekKey: true,
							weeks: true,
							goal: true,
							sessionsPerWeek: true,
							deloadCut: true,
							deloadWeeks: true,
							// The **Quality Session Mix** an endurance segment authors: the
							// second axis beside volume (ADR 0042 §3). The Quality Session
							// Count and the emphasis label are derived from these rows on
							// every read and never stored (§4, §5), and no rows is an *empty*
							// mix rather than an unknown one (§6).
							mix: {
								select: { zone: true, sessionsPerWeek: true },
								orderBy: { zone: 'asc' },
							},
						},
					},
					overrides: { select: { weekKey: true, value: true } },
				},
			},
			/**
			 * The **Week Patterns** this plan holds — the microcycle the athlete
			 * authors once (ADR 0044 §6–§7), with the days each one carries.
			 *
			 * A fixed day's Workout comes with the blocks and steps `fixedDayVolume`
			 * reads, because the prescription *is* that day's volume: `5×1000m Z4` is
			 * 5 km in a 50 km week and in a 65 km week alike, so it is priced off the
			 * stored session rather than off the week. The `title` rides along so the
			 * surface can name the session without a second query.
			 */
			patterns: {
				orderBy: { orderIndex: 'asc' },
				select: {
					id: true,
					name: true,
					orderIndex: true,
					days: {
						// Weekday then position within the day: the order the reading is
						// taken in, so nothing downstream depends on a caller's sort.
						orderBy: [{ weekday: 'asc' }, { orderInDay: 'asc' }],
						select: {
							id: true,
							weekday: true,
							orderInDay: true,
							kind: true,
							weight: true,
							trackId: true,
							// The day's own track, for its **Volume Currency**: a fixed day
							// is priced in the currency of the track it draws from, and a
							// swim day draws swim volume (ADR 0043 §5).
							track: { select: { currency: true } },
							workout: {
								select: {
									id: true,
									title: true,
									blocks: {
										orderBy: { orderIndex: 'asc' },
										select: {
											repeatCount: true,
											seriesRepeatCount: true,
											steps: {
												orderBy: { orderIndex: 'asc' },
												select: { durationSec: true, distanceM: true },
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
} satisfies Prisma.EventSelect

/**
 * The nearest upcoming Target Event carrying a Plan Outline, with the Outline's
 * rows. Shared by the Plan card's reading and the planning surface's, so the two
 * can never disagree about which plan is active or what it says.
 */
async function findActiveOutline(userId: string, now: Date) {
	const event = await prisma.event.findFirst({
		where: {
			athleteId: userId,
			status: { not: 'cancelled' },
			planOutline: { isNot: null },
			...notYetPast(now),
		},
		orderBy: { startDate: 'asc' },
		select: activeOutlineSelect,
	})
	const outline = event?.planOutline
	if (!event || !outline) return null
	// A phaseless Outline draws no arc and projects nothing, so it is not a plan.
	if (outline.phases.length === 0) return null
	return { event, outline }
}

/** One Training Week of the authored season, as the planning surface reads it. */
export type SeasonWeek = {
	/** The week's Monday in the Athlete Timezone (ADR 0044 §3). */
	weekKey: string
	/** 1-based position in the plan — what the athlete counts in. */
	weekInPlan: number
	phaseIndex: number
	/** Loading, recovery or taper, from the phase's own rhythm (ADR 0044 §4). */
	role: WeekRole
	/**
	 * One reading per Training Track, each in **that track's** Volume Currency and
	 * never accumulated across them (ADR 0043 §5). A `null` `value` is an
	 * Unavailable Metric — no anchor in force, or a track whose rule cannot price
	 * the week.
	 *
	 * `overridden` and `derivedValue` are what let the surface **mark** a hand-set
	 * week and offer the revert beside it (ADR 0044 §5): the first says the athlete
	 * typed this number, the second says what the rule would put back.
	 */
	targets: Array<
		WeekTargetReading & {
			/** The track row's id — what a **Week Pattern** day joins its target on. */
			trackId: string
			discipline: Discipline
			currency: VolumeCurrency
			/**
			 * Where this week sits in the **lifting block** that holds it, on a strength
			 * track (ADR 0047 §6):
			 *
			 * - a `StrengthWeekRole` — `loading`, or the `deload` a block's own tail cuts;
			 * - `'gap'` — a week inside the plan and outside every block, which is the
			 *   athlete's own "no lifting these weeks" and never an Unavailable Metric;
			 * - `null` — an endurance track, where a block role is not a thing a week has.
			 *
			 * Read here rather than rebuilt by the surface from the block's `weeks` and
			 * `deloadWeeks`: the deload tail and its clamp are `derive.ts`'s rule, and it
			 * comes off the **same spec** that priced `value`, so the number and the marker
			 * beside it cannot disagree.
			 */
			strengthRole: StrengthWeekRole | 'gap' | null
		}
	>
}

/**
 * One day of a **Week Pattern** as the surfaces read it: exactly the spec the
 * pure resolution takes, plus the Workout's name for the athlete to recognise.
 *
 * The `PatternDaySpec` intersection is deliberate — the reading *is* the input to
 * `resolveWeekPattern`, so a preview cannot be computed from a different shape
 * than the stamp will be. A fixed day arrives **already priced** in its own
 * track's Volume Currency (`fixedDayVolume`), with `null` where that currency
 * cannot read the prescription: an Unavailable Metric with a reason, never a
 * fabricated number (ADR 0043 §5).
 */
export type SeasonPatternDay = PatternDaySpec & {
	/** The Workout a fixed day prescribes, or the shape a share day carries. */
	workout: { id: string; title: string } | null
}

/** One **Week Pattern**: the microcycle, named and positioned (ADR 0044 §6). */
export type SeasonPattern = {
	id: string
	name: string
	/** 0-based authored position; the athlete reorders it, nothing derives it. */
	orderIndex: number
	days: SeasonPatternDay[]
}

/**
 * A stretch of the plan asking for more sessions than the athlete has trainable
 * weekdays — the **days-against-days fit check**, across both tracks (ADR 0047 §4).
 *
 * Weeks rather than a phase, because a strength segment floats free of the phases
 * (ADR 0047 §6), and 1-based to match `SeasonWeek.weekInPlan` and `SeasonPhase` —
 * the surface never sees the derivation's 0-based indices.
 *
 * Carries the two halves separately and no wording: the surface says "3 quality
 * sessions and 3 lifting sessions against 4 trainable weekdays", and the honesty
 * rules stay where the athlete reads them.
 */
export type SeasonAvailabilityWarning = {
	fromWeekInPlan: number
	toWeekInPlan: number
	qualitySessions: number
	strengthSessions: number
	trainableWeekdays: number
}

/**
 * A stretch of the plan whose endurance hours outrun the athlete's **Weekly
 * Capacity** — the **hours-against-hours fit check** (ADR 0045 §8, ADR 0050).
 *
 * Beside `SeasonAvailabilityWarning` and never merged into it: the two checks
 * compare different quantities, decline for different reasons and can disagree about
 * the same week, so one shape carrying both would have to invent a state for "days
 * fit, hours do not" (ADR 0050 §5).
 *
 * `peakHours` is the **worst week** of the run and not what every week in it asks
 * for — see `hoursFitWarnings`, which explains why hours join a span on contiguity
 * where session counts join on equality. 1-based, like every other locator here.
 */
export type SeasonHoursFitWarning = {
	fromWeekInPlan: number
	toWeekInPlan: number
	peakHours: number
	weeklyCapacityHours: number
}

/**
 * A scheduled session whose authored `%1RM` sits outside the band its strength
 * segment's **Strength Goal** derives (ADR 0042 §9, ADR 0047 §3).
 *
 * `scheduledAt` and `weekInPlan` are both locators: the week places it in the season
 * the athlete is reading, the instant lets the surface name the day, and `sessionId`
 * links to it. Carries no wording; `format.ts` renders the percentages (ADR 0023).
 */
export type SeasonBandWarning = {
	sessionId: string
	scheduledAt: Date
	weekInPlan: number
	goal: StrengthGoal
	band: Pct1RMBand
	/** The authored `%1RM`s outside the band, distinct and ascending. */
	outsidePct1RMs: number[]
}

/**
 * One **strength** segment of a Training Track as the planning surface reads it —
 * the dated counterpart to `SegmentReading`.
 *
 * Two readings and not one, because the two kinds author different things: an
 * endurance segment spans a phase 1:1 and carries a **Quality Session Mix**, while a
 * lifting block is *dated*, floats free of the phases, and authors a **Strength
 * Goal**, a **Strength Frequency** and a deload tail instead (ADR 0047 §3, §4, §6).
 * `from-rows.ts` drops a strength row from `SegmentReading` for exactly that reason,
 * so the surface that edits these blocks is handed them here rather than reading the
 * rows itself.
 *
 * `startWeekInPlan` is 1-based like `SeasonWeek.weekInPlan` and `SeasonPhase`'s span,
 * and is `null` for a block whose opening week is no longer one of the plan's: a
 * structural edit can shorten a season under a dated block and nothing cascades to
 * one that floats free of the phases (ADR 0047 §6). That state is *read* rather than
 * hidden, because a block the athlete cannot see is a block they cannot move back in.
 *
 * A row whose own columns contradict its kind — no window, no frequency, or a goal
 * outside the three — yields nothing. The `TrainingTrackSegment` CHECK makes that
 * unreachable from the database, so this is the structural narrowing of nullable
 * columns rather than a validation, the same narrowing `segmentSpec` does: a block
 * shown at a guessed week is worse than a broken row not shown.
 */
export type StrengthSegmentReading = {
	segmentId: string
	/** The week the block opens on, `YYYY-MM-DD` — its own dated position. */
	startWeekKey: string
	/** 1-based opening week, or `null` where the plan no longer covers it. */
	startWeekInPlan: number | null
	weeks: number
	/**
	 * The two rates a block authors, `null` where the athlete left the box blank —
	 * which is them choosing the **documented convention** and must read as that
	 * rather than as the convention's number (ADR 0044 §4).
	 */
	ramp: number | null
	boundaryStep: number | null
	goal: StrengthGoal
	sessionsPerWeek: number
	deloadCut: number | null
	deloadWeeks: number | null
}

/** A phase with the week span derived from the Plan Start Week (ADR 0044 §3). */
export type SeasonPhase = PhaseReading & {
	/** 1-based first and last week of the phase within the plan. */
	fromWeekInPlan: number
	toWeekInPlan: number
	fromWeekKey: string
}

/**
 * The authored season, as `/training/plan` reads it: the phases in order, every
 * Training Week's derived volume target per track, and where the plan's end falls
 * against the Event. Not necessarily the *active* one — `getSeasonForEvent` reads
 * a named Event's season whether or not the athlete is living in it.
 *
 * The same rows the **Plan card** reads, through the same derivation — this
 * returns the season the athlete authored rather than the arc summary, so the two
 * surfaces cannot drift. Nothing here is stored: every target is computed from
 * the anchor and the ramps on each read (ADR 0040 §1).
 */
export type AuthoredSeason = {
	outlineId: string
	eventId: string
	eventName: string
	eventDate: Date
	/** The authored Plan Start Week — the key every week-scoped row hangs off. */
	startWeekKey: string
	timezone: string
	/**
	 * How many weekdays the athlete says they can train on, for the soft mix
	 * warning (ADR 0042 §9). `null` means they never set their availability —
	 * distinct from an explicit empty list, and it yields no warning rather than
	 * a guess.
	 *
	 * A **count**, not the weekdays themselves: ADR 0045 makes the comparison
	 * days-against-days, so which days they are decides nothing here and the
	 * surface is given no weekday identity it could accidentally place a session on.
	 */
	trainableWeekdays: number | null
	/**
	 * The **days-against-days fit check** over the whole plan: each stretch of weeks
	 * whose quality sessions *plus* **Strength Frequency** outrun the trainable
	 * weekdays (ADR 0047 §4). Empty when availability was never set, and empty for a
	 * plan that fits — it warns and never blocks.
	 *
	 * This is the **combined** reading and it replaced the endurance-only per-phase
	 * one outright: a hybrid athlete shown both an endurance-only notice and a
	 * combined one about the same week would be reading two overlapping claims about
	 * one week, so the per-phase reading is gone rather than kept beside this.
	 */
	availabilityWarnings: SeasonAvailabilityWarning[]
	/**
	 * The athlete's **Weekly Capacity** in hours, or `null` where they have never
	 * authored one — which reads as **unavailable, never as passing** (ADR 0050).
	 *
	 * Carried beside the warnings so the surface can say *why* it made only the days
	 * comparison, rather than being silent about a check it did not run.
	 */
	weeklyCapacityHours: number | null
	/**
	 * The **hours-against-hours fit check**: each stretch of weeks whose derived
	 * endurance hours outrun the **Weekly Capacity** (ADR 0045 §8, ADR 0050).
	 *
	 * Empty for three different reasons, all of them honest and none of them "it
	 * fits": no capacity authored, no week the **Volume Conversion** can price in
	 * hours, or a plan that fits. `weeklyCapacityHours` above tells the first apart
	 * from the others.
	 *
	 * Never replaces `availabilityWarnings`, and never gates it: a plan whose hours
	 * are an **Unavailable Metric** still gets the days check (ADR 0050 §5).
	 */
	hoursWarnings: SeasonHoursFitWarning[]
	/**
	 * Scheduled sessions whose authored `%1RM` misses the band their strength
	 * segment's goal derives — a soft warning off already-stored data, needing no
	 * schema change (ADR 0047 §3). Empty when no segment authors a goal.
	 */
	bandWarnings: SeasonBandWarning[]
	/**
	 * Which cross-track readings this plan cannot state, so the surface can give each
	 * its own reason instead of a row of dashes (ADR 0047 §5). Empty for a plan with
	 * no strength track.
	 */
	unavailableReadings: UnavailableReading[]
	phases: SeasonPhase[]
	/**
	 * The **Season Span** headline: one figure per **commensurability group**, in
	 * reading order (ADR 0043 §5).
	 *
	 * One entry for a pure runner, two for a runner who lifts, one accumulated TSS
	 * figure for a triathlete — the headline adapts to what the plan holds, by a
	 * stated rule rather than a special case. Never one entry per track, and never a
	 * single reconciled number: each group is one currency the tracks in it were
	 * *authored* in, so nothing here is converted and no group can be an
	 * **Unavailable Metric**.
	 *
	 * Empty only for a plan whose tracks price no loading week at all, which is an
	 * absent headline rather than a declined one.
	 */
	spanGroups: SeasonSpanGroup[]
	/**
	 * Each track's authored inputs: its currency, its **Season Anchor** segments and
	 * the progression its endurance segments author, plus the two figures read off
	 * that guideline level — the **Season Span** headline and the season total behind
	 * it — and wherever the **ramp guard** has something to say.
	 */
	tracks: Array<{
		/** The stored row's id — a **Week Pattern** day's `trackId` points here. */
		trackId: string
		discipline: Discipline
		currency: VolumeCurrency
		anchors: Array<{ fromWeekKey: string; value: number }>
		segments: SegmentReading[]
		/**
		 * The **dated** blocks this track authors, in opening order — empty for an
		 * endurance track, which positions its segments by phase instead.
		 *
		 * Beside `segments` rather than replacing it or joining it, because the two are
		 * different readings of a discriminated union and a surface consumes exactly
		 * one of them: the phase cards read `segments`, the lifting section reads these
		 * (ADR 0047 §6).
		 */
		strengthSegments: StrengthSegmentReading[]
		span: SeasonSpanReading | null
		total: number | null
		warnings: RampWarning[]
	}>
	weeks: SeasonWeek[]
	/**
	 * The **Week Patterns** authored on this plan, in position order. Read-only
	 * rows: what each day *resolves to* is derived against a chosen week and stored
	 * nowhere (the **Pattern Preview**, ADR 0044 §7).
	 */
	patterns: SeasonPattern[]
	/** Where the season ends relative to the Event — shown, never corrected. */
	fit: EventFit
	/**
	 * The phase this week falls in, **by position**, or null when today is outside
	 * the plan.
	 *
	 * A position and not a name: a season with two A-races carries two phases called
	 * "Base", and comparing names would light up both as current (ADR 0044 §2, the
	 * defect `presenter.ts` had).
	 */
	currentPhaseIndex: number | null
}

export async function getActiveSeason(
	userId: string,
	now: Date = new Date(),
): Promise<AuthoredSeason | null> {
	const found = await findActiveOutline(userId, now)
	return found ? toSeason(userId, found.event, found.outline, now) : null
}

/**
 * One named Event's season, whichever Event it is — the athlete's own, upcoming
 * or not.
 *
 * `getActiveSeason` answers "the plan I am living in", which is the nearest
 * upcoming outlined Event (ADR 0018). That is the wrong answer for an athlete who
 * just authored a plan for a race two seasons out, or who taps a specific Event's
 * plan: both mean *this* plan, not the nearest one. So the surface addresses a
 * season by Event when it is told which, and falls back to the active one.
 */
export async function getSeasonForEvent(
	userId: string,
	eventId: string,
	now: Date = new Date(),
): Promise<AuthoredSeason | null> {
	const event = await prisma.event.findFirst({
		where: { id: eventId, athleteId: userId },
		select: activeOutlineSelect,
	})
	const outline = event?.planOutline
	if (!event || !outline || outline.phases.length === 0) return null
	return toSeason(userId, event, outline, now)
}

type OutlineRowsFor = NonNullable<
	Prisma.EventGetPayload<{ select: typeof activeOutlineSelect }>['planOutline']
>

async function toSeason(
	userId: string,
	event: { id: string; name: string; startDate: Date },
	outline: OutlineRowsFor,
	now: Date,
): Promise<AuthoredSeason> {
	const timezone = await getAthleteTimezone(userId)
	// Both halves of **Training Availability** in one read: the two fit checks are
	// independent but they are the same athlete's statement, and reading them apart
	// would let one surface show a capacity the other's check did not use.
	const { trainableWeekdays, weeklyCapacityHours } =
		await readTrainingAvailability(userId)
	const phases = phaseReadings(outline)
	const specs = phaseSpecs(outline)
	const tracks = resolvedTracks(outline)
	const resolvedByDiscipline = new Map(
		tracks.map((track) => [track.discipline, track]),
	)
	const weekCount = totalWeeks(specs)

	let opening = 0
	const seasonPhases = phases.map((phase) => {
		const fromWeekInPlan = opening + 1
		opening += phase.weeks
		return {
			...phase,
			fromWeekInPlan,
			toWeekInPlan: opening,
			fromWeekKey: weekKeyAt(outline.startWeekKey, fromWeekInPlan - 1),
		}
	})

	// The strength segments, read once and handed to both checks: the fit check needs
	// their **Strength Frequency** and the band check needs their **Strength Goal**,
	// and reading them twice would let the two disagree about which weeks are lifting
	// weeks.
	const strength = strengthFitSegments(outline)

	return {
		outlineId: outline.id,
		eventId: event.id,
		eventName: event.name,
		eventDate: event.startDate,
		startWeekKey: outline.startWeekKey,
		timezone,
		trainableWeekdays,
		// Every track's segments in one list, because the question the check answers is
		// about the **week** and not about a track: a session is a session whichever
		// track prescribes it (ADR 0047 §4). Indices become 1-based here, at the read
		// boundary, exactly as the phases' and the weeks' do.
		availabilityWarnings: availabilityFitWarnings(
			specs,
			[...enduranceFitSegments(tracks), ...strength],
			trainableWeekdays,
		).map(({ fromWeekIndex, toWeekIndex, ...counts }) => ({
			fromWeekInPlan: fromWeekIndex + 1,
			toWeekInPlan: toWeekIndex + 1,
			...counts,
		})),
		// The second check, beside the first and never instead of it (ADR 0050 §5).
		weeklyCapacityHours,
		hoursWarnings: await seasonHoursWarnings(
			userId,
			outline.startWeekKey,
			specs,
			tracks,
			weeklyCapacityHours,
		),
		bandWarnings: await seasonBandWarnings(
			userId,
			outline,
			timezone,
			weekCount,
			strength,
		),
		// A plan with no strength track is owed none of the three: ADR 0046 §3's
		// correction is about what a strength track blocks (ADR 0047 §5).
		unavailableReadings: outline.tracks.some(
			(track) => !isCardioDiscipline(track.discipline as Discipline),
		)
			? [...UNAVAILABLE_READINGS]
			: [],
		phases: seasonPhases,
		// The headline, grouped by commensurability (ADR 0043 §5). `ResolvedTrack`
		// satisfies `SpanTrack` structurally, so the grouping reads the anchor, the
		// loading weeks and the total the **same walk** produced the track's own span
		// from — there is no second derivation here for the two to disagree over.
		//
		// Ordered by the `DISCIPLINES` vocabulary rather than by the query, so the
		// headline reads the same on every load whatever order the rows were written
		// in, and so the strength figure — the one that never joins anything — reads
		// last, as it does in ADR 0043 §5's own table.
		spanGroups: seasonSpanGroups(
			[...tracks].sort(
				(a, b) =>
					DISCIPLINES.indexOf(a.discipline) - DISCIPLINES.indexOf(b.discipline),
			),
		),
		// Joined to `resolvedTracks` by **Discipline**, which is unique per Outline
		// (`@@unique([outlineId, discipline])`), rather than by array position: a
		// track's stored anchors and its derived span then cannot come from different
		// tracks whatever order either list is in.
		tracks: outline.tracks.map((track) => {
			const discipline = track.discipline as Discipline
			const resolved = resolvedByDiscipline.get(discipline)
			return {
				trackId: track.id,
				discipline,
				currency: track.currency as VolumeCurrency,
				anchors: [...track.anchors].sort((a, b) =>
					a.fromWeekKey.localeCompare(b.fromWeekKey),
				),
				segments: [...(resolved?.segments ?? [])].sort(
					(a, b) => a.phaseIndex - b.phaseIndex,
				),
				strengthSegments: strengthSegmentReadings(
					track.segments,
					outline.startWeekKey,
					weekCount,
				),
				span: resolved?.span ?? null,
				total: resolved?.total ?? null,
				warnings: resolved?.warnings ?? [],
			}
		}),
		weeks: Array.from({ length: weekCount }, (_, week) => ({
			weekKey: weekKeyAt(outline.startWeekKey, week),
			weekInPlan: week + 1,
			phaseIndex: phaseIndexForWeek(specs, week) ?? 0,
			role: weekRole(specs, week),
			targets: tracks.map((track) => ({
				trackId: track.trackId,
				discipline: track.discipline,
				currency: track.currency,
				// Every track carries one reading per plan week, so the index is in
				// range; the fallback is an Unavailable week rather than a crash.
				...(track.targets[week] ?? {
					value: null,
					overridden: false,
					derivedValue: null,
				}),
				// A strength track's every week has a reading — a role inside the block
				// holding it, or the gap between blocks — and an endurance track's has
				// none at all, which is the `null` the whole array carries.
				strengthRole:
					track.strengthRoles == null
						? null
						: (track.strengthRoles[week] ?? 'gap'),
			})),
		})),
		patterns: outline.patterns.map(patternReading),
		fit: eventFit(
			outline.startWeekKey,
			weekCount,
			weekMonday(event.startDate, timezone),
		),
		currentPhaseIndex: phaseIndexForWeek(
			specs,
			weekIndexOf(outline.startWeekKey, weekMonday(now, timezone)),
		),
	}
}

/**
 * A strength segment as **both** cross-track checks read it: its window in index
 * space, its **Strength Frequency** and its **Strength Goal**.
 *
 * One shape rather than two, so the fit check and the band check cannot end up
 * disagreeing about which weeks are lifting weeks. It satisfies `FitSegment`'s
 * strength arm and `band-fit.ts`'s `BandFitSegment` structurally.
 */
type StrengthFitReading = StrengthFitSegment & { goal: StrengthGoal | null }

/**
 * Every track's strength segments, in the index space the derivation works in.
 *
 * Read from the rows rather than from `resolvedTracks`, because a `SegmentReading` is
 * the *endurance* reading — it carries a phase and a mix, which a dated segment has
 * neither of. A row whose positioning columns are missing yields nothing rather than
 * a segment positioned at a guess: the migration's per-kind CHECK makes that
 * unreachable from the database, so this is the structural narrowing of two nullable
 * columns and not a validation.
 *
 * The goal is narrowed through `isStrengthGoal` rather than cast, for the reason
 * `from-rows.ts` filters a stored zone through `isQualityZone`: the same column is
 * read here and in `strengthSegmentReadings`, and a cast beside a narrowing is two
 * readings that can disagree about which stored strings are goals.
 */
function strengthFitSegments(outline: OutlineRowsFor): StrengthFitReading[] {
	return outline.tracks.flatMap((track) =>
		track.segments.flatMap((segment) =>
			segment.kind === 'strength' &&
			segment.startWeekKey != null &&
			segment.weeks != null
				? [
						{
							kind: 'strength' as const,
							startWeekIndex: weekIndexOf(
								outline.startWeekKey,
								segment.startWeekKey,
							),
							weeks: segment.weeks,
							sessionsPerWeek: segment.sessionsPerWeek,
							goal: isStrengthGoal(segment.goal) ? segment.goal : null,
						},
					]
				: [],
		),
	)
}

type SegmentRowFor = OutlineRowsFor['tracks'][number]['segments'][number]

/**
 * One track's stored strength rows as `StrengthSegmentReading`s, in opening order.
 *
 * The rows are already selected by `activeOutlineSelect` — every segment column
 * including the strength-only four — so this is a mapping and not a second query,
 * and the blocks reach the surface through the same owner-scoped read the rest of
 * the season does.
 *
 * A block's opening week is placed by matching the plan's own week keys rather than
 * by arithmetic alone: `weekIndexOf` rounds, so a stored key that is not one of this
 * plan's Mondays would otherwise land *near* a week instead of being read as outside
 * it. Ordered by that key, because the surface lays the blocks out along the season.
 *
 * The four narrowings below drop a row rather than guessing at it, and every one of
 * them is **unreachable from the database**: `TrainingTrackSegment_kind_position`
 * requires `startWeekKey`, `weeks`, `goal` and `sessionsPerWeek` on a strength row,
 * and the `goal` column's own CHECK pins the value vocabulary. So this is the
 * structural narrowing of four nullable columns and not a validation. Dropping a row
 * is nevertheless the right defence and not a throw: a segment that vanished from
 * the editor could be neither fixed nor removed, so it must stay unreachable, which
 * is why the constraint has to be real — `constraints.test.ts` is what keeps a later
 * SQLite table rebuild from quietly dropping it.
 */
function strengthSegmentReadings(
	rows: readonly SegmentRowFor[],
	startWeekKey: string,
	weekCount: number,
): StrengthSegmentReading[] {
	return rows
		.flatMap((row) => {
			if (row.kind !== 'strength') return []
			if (row.startWeekKey == null || row.weeks == null) return []
			if (row.sessionsPerWeek == null || !isStrengthGoal(row.goal)) return []
			const index = weekIndexOf(startWeekKey, row.startWeekKey)
			const inPlan =
				index >= 0 &&
				index < weekCount &&
				weekKeyAt(startWeekKey, index) === row.startWeekKey
			return [
				{
					segmentId: row.id,
					startWeekKey: row.startWeekKey,
					startWeekInPlan: inPlan ? index + 1 : null,
					weeks: row.weeks,
					ramp: row.ramp,
					boundaryStep: row.boundaryStep,
					goal: row.goal,
					sessionsPerWeek: row.sessionsPerWeek,
					deloadCut: row.deloadCut,
					deloadWeeks: row.deloadWeeks,
				},
			]
		})
		.sort((a, b) => a.startWeekKey.localeCompare(b.startWeekKey))
}

/**
 * Every track's endurance segments as the fit check reads them — the phase they span
 * and the **Quality Session Mix** the count derives from.
 *
 * Taken off `resolvedTracks`, which has already narrowed each stored zone to the 3–5
 * vocabulary, so the check counts the same mix the surface renders.
 */
function enduranceFitSegments(tracks: ResolvedTrack[]): FitSegment[] {
	return tracks.flatMap((track) =>
		track.segments.map((segment) => ({
			kind: 'endurance' as const,
			phaseIndex: segment.phaseIndex,
			mix: segment.mix,
		})),
	)
}

/**
 * The `%1RM` soft warnings for one season: the plan's own scheduled sessions, priced
 * into plan-week space, against the band each week's strength segment derives
 * (ADR 0042 §9, ADR 0047 §3).
 *
 * The query is skipped entirely when no segment authors a **Strength Goal** — with no
 * goal there is no derived band, so there is nothing any session could be outside of,
 * and reading a season with no strength track costs nothing.
 *
 * Bounded to the plan's own weeks, and each session placed by the Monday of the
 * Training Week its `scheduledAt` falls in, in the Athlete Timezone (ADR 0044 §3) —
 * the same key every week-scoped row hangs off, so a session and the week it is
 * warned about cannot come from two different calendars.
 */
async function seasonBandWarnings(
	userId: string,
	outline: OutlineRowsFor,
	timezone: string,
	weekCount: number,
	segments: StrengthFitReading[],
): Promise<SeasonBandWarning[]> {
	if (!segments.some((segment) => segment.goal != null)) return []

	const { start } = dayBoundsUTC(outline.startWeekKey, timezone)
	const { end } = weekBoundsFromMondayUTC(
		weekKeyAt(outline.startWeekKey, weekCount - 1),
		timezone,
	)
	const rows = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: start, lte: end } },
		orderBy: { scheduledAt: 'asc' },
		select: {
			id: true,
			scheduledAt: true,
			// Only the load column: `ExerciseSet.pct1RM` is the whole subject, and a set
			// priced in `weightKg` carries none, which is a session with nothing on this
			// axis rather than a session at 0%.
			workout: {
				select: {
					blocks: {
						select: {
							steps: { select: { sets: { select: { pct1RM: true } } } },
						},
					},
				},
			},
		},
	})

	const scheduledById = new Map(rows.map((row) => [row.id, row.scheduledAt]))
	const warnings = bandFitWarnings(
		segments,
		rows.map((row) => ({
			sessionId: row.id,
			weekIndex: weekIndexOf(
				outline.startWeekKey,
				weekMonday(row.scheduledAt, timezone),
			),
			pct1RMs: (row.workout?.blocks ?? []).flatMap((block) =>
				block.steps.flatMap((step) =>
					step.sets.flatMap((set) => (set.pct1RM == null ? [] : [set.pct1RM])),
				),
			),
		})),
	)

	return warnings.map(({ weekIndex, ...warning }) => ({
		...warning,
		scheduledAt: scheduledById.get(warning.sessionId)!,
		weekInPlan: weekIndex + 1,
	}))
}

/**
 * The athlete's own **Workouts**, newest first — what a fixed pattern day can
 * point at.
 *
 * Owner-scoped, because a Workout belongs to the athlete who authored it and a
 * pattern day may only prescribe one of those. Deliberately thin: a title and a
 * discipline are what a picker needs to name a session, and the day itself is
 * priced from the stored blocks on read rather than from anything here.
 *
 * The honest state this read exists to expose is the **empty** one: the Catalogue
 * (#448/#451) covers trainm8-authored Stock Workouts, but an athlete has no
 * collection of their own past Workouts yet — Workouts are authored inline with
 * a session — so an athlete may well have none, and the surface has to say that
 * rather than offer a control with nothing in it.
 */
export type AuthoredWorkout = {
	id: string
	title: string
	discipline: string
}

export async function getAuthoredWorkouts(
	userId: string,
): Promise<AuthoredWorkout[]> {
	return prisma.workout.findMany({
		where: { ownerId: userId },
		orderBy: { createdAt: 'desc' },
		select: { id: true, title: true, discipline: true },
	})
}

type PatternRow = OutlineRowsFor['patterns'][number]
type PatternDayRow = PatternRow['days'][number]

/** One stored **Week Pattern** as the surfaces read it, days already priced. */
function patternReading(pattern: PatternRow): SeasonPattern {
	return {
		id: pattern.id,
		name: pattern.name,
		orderIndex: pattern.orderIndex,
		days: pattern.days.flatMap(patternDayReading),
	}
}

/**
 * One stored pattern day as the resolution's input — or nothing, where the row's
 * nullable columns contradict its own kind.
 *
 * The migration's per-kind CHECK makes both of those unreachable from the
 * database (a share day always carries a positive weight, a weekday is always
 * 0–6), so this is the structural narrowing of columns the type system cannot
 * see the constraint on — the same narrowing `segmentSpec` does, for the same
 * reason: a day shown at a guessed weekday or an invented weight is worse than a
 * broken row not shown.
 *
 * A fixed day is priced here rather than at the surface, because pricing needs
 * the day's own track's **Volume Currency** and the surface is handed a reading
 * rather than a currency lookup. `null` survives as `null`: a `tss` or `sets`
 * track cannot read a prescription at all yet, and a guessed price would flow
 * straight into every share day's number.
 */
function patternDayReading(day: PatternDayRow): SeasonPatternDay[] {
	if (!isPatternWeekday(day.weekday)) return []
	const position = {
		dayId: day.id,
		weekday: day.weekday,
		orderInDay: day.orderInDay,
		trackId: day.trackId,
	}
	const workout = day.workout
		? { id: day.workout.id, title: day.workout.title }
		: null

	if (day.kind === 'fixed') {
		return [
			{
				...position,
				kind: 'fixed',
				// No Workout is no prescription, so there is no volume to read — the
				// same Unavailable the unreadable currencies produce, and the surface
				// words both as one thing the shares cannot divide around.
				volume: day.workout
					? fixedDayVolume(
							day.workout.blocks,
							day.track.currency as VolumeCurrency,
						)
					: null,
				workout,
			},
		]
	}
	if (day.kind === 'share' && day.weight != null) {
		return [{ ...position, kind: 'share', weight: day.weight, workout }]
	}
	return []
}

/**
 * The athlete's **Training Availability** as the two fit checks read it: how many
 * weekdays they can train on, and their **Weekly Capacity** in hours. Either is
 * `null` when they have never said (no profile, or the column still unset).
 *
 * A second small read rather than a widened `getAthleteTimezone`, because the
 * answers degrade differently: a missing timezone honestly becomes `'UTC'`, while a
 * missing availability must stay **absent**. `parseTrainableWeekdays` tolerates a
 * null column by returning `[]`, which is the right answer for the settings form —
 * nothing ticked — and the wrong one here, where `0` would read as "cannot train at
 * all" and warn on every mix. So the stored `null` is mapped straight through, and
 * only a stored list is counted; an athlete who explicitly saved an empty list does
 * get `0`, because that is a statement they made.
 *
 * The capacity has no such second state. It is a number or it is absent, and absent
 * makes the hours check **unavailable rather than passing** (ADR 0050).
 */
async function readTrainingAvailability(userId: string): Promise<{
	trainableWeekdays: number | null
	weeklyCapacityHours: number | null
}> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { trainableWeekdays: true, weeklyCapacityHours: true },
	})
	const stored = profile?.trainableWeekdays
	return {
		trainableWeekdays:
			stored == null ? null : parseTrainableWeekdays(stored).length,
		weeklyCapacityHours: profile?.weeklyCapacityHours ?? null,
	}
}

/**
 * The **hours-against-hours fit check** for one season, priced through the same
 * **Volume Conversion** every other planned figure on the page reads (ADR 0045).
 *
 * **Skipped entirely for an athlete with no capacity**, which is why the conversion
 * contexts are read here rather than at the top of `toSeason`: with nothing to
 * compare against there is no comparison to make, and reading an athlete's recipes,
 * thresholds and ride window to derive hours nobody will look at would make the
 * common case pay for the uncommon one. It is the same read `/training/plan` makes
 * for its chart — that one hands the contexts to the *client* as data so the chart
 * can recompute purely as the athlete switches currency (#413), where this one is a
 * server-side check that ships a verdict, so neither can stand in for the other.
 */
async function seasonHoursWarnings(
	userId: string,
	startWeekKey: string,
	specs: PhaseSpec[],
	tracks: ResolvedTrack[],
	weeklyCapacityHours: number | null,
): Promise<SeasonHoursFitWarning[]> {
	if (weeklyCapacityHours == null) return []

	const endurance = tracks.filter((track) =>
		isCardioDiscipline(track.discipline),
	)
	if (endurance.length === 0) return []

	const weeklyHours = weeklyEnduranceHours({
		phases: specs,
		tracks: endurance,
		contexts: await readConversionContexts(
			userId,
			startWeekKey,
			endurance.map((track) => track.discipline),
		),
	})

	// 1-based here, at the read boundary, exactly as the days check's indices are.
	return hoursFitWarnings(weeklyHours, weeklyCapacityHours).map(
		({ fromWeekIndex, toWeekIndex, ...reading }) => ({
			fromWeekInPlan: fromWeekIndex + 1,
			toWeekInPlan: toWeekIndex + 1,
			...reading,
		}),
	)
}

const upcomingSessionSelect = {
	id: true,
	scheduledAt: true,
	status: true,
	source: true,
	workout: {
		select: {
			id: true,
			title: true,
			description: true,
			discipline: true,
			intent: true,
			blocks: {
				orderBy: { orderIndex: 'asc' as const },
				select: {
					id: true,
					name: true,
					orderIndex: true,
					repeatCount: true,
					seriesRepeatCount: true,
					betweenSeriesRestSec: true,
					sendOff: true,
					steps: {
						orderBy: { orderIndex: 'asc' as const },
						select: stepSelect,
					},
				},
			},
		},
	},
	recording: {
		select: {
			id: true,
			discipline: true,
			durationSec: true,
			distanceM: true,
			startedAt: true,
			endedAt: true,
		},
	},
} satisfies Prisma.WorkoutSessionSelect

export type UpcomingSession = Prisma.WorkoutSessionGetPayload<{
	select: typeof upcomingSessionSelect
}>

export async function getUpcomingSessions(
	userId: string,
): Promise<UpcomingSession[]> {
	const now = new Date()
	const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
	return prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: now, lte: horizon },
		},
		orderBy: { scheduledAt: 'asc' },
		select: upcomingSessionSelect,
	})
}

const ledgerSessionSelect = {
	...upcomingSessionSelect,
	tssValue: true,
	plannedTssValue: true,
	plannedTssConfidence: true,
	// The Replan Note (ADR 0025): rows that carry one get the ledger's small
	// "adjusted" adornment, so softened sessions are spottable at a glance.
	replanReason: true,
	// Carry the derived phase bars so the ledger can draw a recording's intensity
	// profile (recordings have no planned structure to derive one from).
	recording: {
		select: {
			id: true,
			discipline: true,
			durationSec: true,
			distanceM: true,
			startedAt: true,
			endedAt: true,
			phaseBarsJson: true,
		},
	},
	sessionLog: {
		select: {
			id: true,
			rpe: true,
		},
	},
} satisfies Prisma.WorkoutSessionSelect

export type LedgerSession = Prisma.WorkoutSessionGetPayload<{
	select: typeof ledgerSessionSelect
}>

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Chronological session ledger spanning completed (past) and planned (upcoming)
 * sessions, ordered by date. Bounded by a trailing history window plus the
 * planned horizon so the query stays sensible for athletes with long histories.
 */
export async function getSessionLedger(
	userId: string,
	{
		trailingDays = 42,
		horizonDays = 14,
		now = new Date(),
	}: { trailingDays?: number; horizonDays?: number; now?: Date } = {},
): Promise<LedgerSession[]> {
	const from = new Date(now.getTime() - trailingDays * DAY_MS)
	const to = new Date(now.getTime() + horizonDays * DAY_MS)
	return prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: from, lte: to },
		},
		orderBy: { scheduledAt: 'asc' },
		select: ledgerSessionSelect,
	})
}

/**
 * Weekly Plan Adherence (ADR 0019, #119): roll the current training week —
 * calendar Monday–Sunday in the Athlete Timezone (see `weekBoundsUTC`)
 * — up to a single banded ratio of summed actual to summed Planned TSS.
 *
 * Display only; it never enters any Load Snapshot / CTL / ATL / TSB. Sessions
 * missing either side of the comparison are excluded from both sums by
 * `weeklyAdherence`, and a week with no resolvable planned load returns null
 * (the caller renders "—", never a fabricated ratio).
 */
export async function getWeeklyAdherence(
	userId: string,
	now: Date = new Date(),
): Promise<WeeklyAdherence | null> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	const { start, end } = weekBoundsUTC(now, profile?.timezone ?? 'UTC')
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: start, lte: end } },
		select: { tssValue: true, plannedTssValue: true },
	})
	return weeklyAdherence(
		sessions.map((s) => ({
			plannedTss: s.plannedTssValue,
			actualTss: s.tssValue,
		})),
	)
}

/** The stored Week Replan decision the Week tab's decision line renders (ADR 0025). */
export type WeekReplanSummary = {
	/** 'adjusted' | 'no-change' | 'insufficient-data' — the stored outcome. */
	outcome: string
	/** Plain-language reason composed by `decideWeekReplan`, rendered verbatim. */
	reason: string
}

/**
 * The stored `WeekReplan` decision for the most recently closed Training Week
 * (ADR 0025): the same (athlete, closed week's Monday) key the recompute-path
 * applier writes, resolved in the Athlete Timezone. Read-only — display never
 * re-derives the decision, so what was applied and what is said can never
 * disagree. Returns `null` when no decision row exists yet (nothing has closed
 * a week since the feature landed, or no recompute has run this week); the
 * Week tab then shows nothing rather than inventing a status.
 */
export async function getLatestWeekReplan(
	userId: string,
	now: Date = new Date(),
): Promise<WeekReplanSummary | null> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	const weekKey = addDays(weekMonday(now, profile?.timezone ?? 'UTC'), -7)
	return prisma.weekReplan.findUnique({
		where: { athleteId_weekKey: { athleteId: userId, weekKey } },
		select: { outcome: true, reason: true },
	})
}

/**
 * The trailing `weeks` of Weekly Plan Adherence (#120), oldest first with the
 * current week last — the history `sustainedAdherence` walks to decide whether
 * a deviation has held long enough to shift the Coach card's narrative.
 *
 * Each week is rolled exactly like `getWeeklyAdherence` (calendar Mon–Sun in the
 * Athlete Timezone, same honesty rules); a week with no resolvable planned load
 * is `null`, which `sustainedAdherence` treats as a break in the streak. Prior
 * weeks are reached by stepping `now` back a week at a time, then snapping to
 * that week's Monday via `weekBoundsUTC`.
 */
export async function getRecentWeeklyAdherence(
	userId: string,
	weeks: number,
	now: Date = new Date(),
): Promise<Array<WeeklyAdherence | null>> {
	const perWeek = await recentWeeklySessions(userId, weeks, now)
	return perWeek.map(weeklyAdherence)
}

/**
 * The same trailing window as `getRecentWeeklyAdherence`, rolled up for the
 * home build chart (`WeeklyLoad`): Planned and actual TSS summed independently
 * so a planned-but-unrecorded week keeps its Planned bar with the actual
 * honestly Unavailable (ADR 0008 / ADR 0030), plus the comparable-sessions
 * adherence the coach reads. Deriving the sustained-deviation series from this
 * (`weeklyBuild.map((w) => w.adherence)`) keeps the chart and the coach on one
 * query and one source of truth.
 */
export async function getRecentWeeklyBuild(
	userId: string,
	weeks: number,
	now: Date = new Date(),
): Promise<WeeklyLoad[]> {
	const perWeek = await recentWeeklySessions(userId, weeks, now)
	return perWeek.map(weeklyLoad)
}

/**
 * The trailing `weeks` of a user's sessions, bucketed calendar Mon–Sun in the
 * Athlete Timezone, oldest first with the current week last — the raw shape
 * both weekly rollups map over. Prior weeks are reached by stepping `now` back
 * a week at a time, then snapping to that week's Monday via `weekBoundsUTC`.
 *
 * The bounds are resolved first and the sessions fetched in **one** range query
 * over `[userId, scheduledAt]`, then bucketed in memory. Querying inside the
 * step-back loop cost one round trip per week, which is survivable at the eight
 * weeks the build chart asks for and is not at a season's length.
 */
async function recentWeeklySessions(
	userId: string,
	weeks: number,
	now: Date,
): Promise<
	Array<Array<{ plannedTss: number | null; actualTss: number | null }>>
> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	const timezone = profile?.timezone ?? 'UTC'

	const bounds = Array.from({ length: Math.max(weeks, 0) }, (_, index) => {
		const back = weeks - 1 - index
		return weekBoundsUTC(new Date(now.getTime() - back * 7 * DAY_MS), timezone)
	})
	const buckets: Array<
		Array<{ plannedTss: number | null; actualTss: number | null }>
	> = bounds.map(() => [])
	const first = bounds.at(0)
	const last = bounds.at(-1)
	if (!first || !last) return buckets

	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: first.start, lte: last.end } },
		select: { scheduledAt: true, tssValue: true, plannedTssValue: true },
	})

	for (const session of sessions) {
		// The weeks are contiguous and ascending, so the first one the session
		// does not run past is its own. A session that matches none is dropped
		// rather than folded into week zero: the range query already bounded it,
		// so landing outside every week means the bounds disagree with the query
		// and a silent misattribution would be worse than a missing bar.
		const index = bounds.findIndex(({ end }) => session.scheduledAt <= end)
		buckets[index]?.push({
			plannedTss: session.plannedTssValue,
			actualTss: session.tssValue,
		})
	}
	return buckets
}

const sessionDetailSelect = {
	...upcomingSessionSelect,
	// The detail view leads with a planned-vs-actual summary (ADR 0019), so it
	// needs the materialized actual and Planned TSS the lists carry too.
	tssValue: true,
	plannedTssValue: true,
	plannedTssConfidence: true,
	// The Replan Note (ADR 0025): shown with the prescription so the "why"
	// travels with the session.
	replanReason: true,
	// Session Adoption (#460). Origin and adoption are two axes, and `source`
	// alone stopped answering "is this still the machine's?" the moment adoption
	// stopped overwriting it — so the detail view, which is the only surface that
	// asks (the badge, the "Detected" label, the re-detect control and Structure
	// Adherence), needs both columns. The lists ask nothing of provenance and are
	// left alone.
	adoptedAt: true,
	// The lists only need a thumbnail of the recording; the detail view shows the
	// full metric panel, so override with the richer recording select here.
	recording: {
		select: {
			id: true,
			discipline: true,
			startedAt: true,
			endedAt: true,
			durationSec: true,
			distanceM: true,
			hrAvg: true,
			hrMax: true,
			powerAvg: true,
			powerMax: true,
			powerWeightedAvg: true,
			cadenceAvg: true,
			paceAvgSecPerKm: true,
			speedMaxMps: true,
			elevationGainM: true,
			kilojoules: true,
			polyline: true,
			phaseBarsJson: true,
			tssValue: true,
			externalProvider: true,
			// The Structure Detection (ADR 0033): its grade for the "detected ·
			// (confidence)" badge, and its structure for the display-derived
			// Structure Adherence verdict a matched planned session shows beside the
			// Adherence Band (ADR 0034, #345). Absent when detection found no
			// structure (the recording stays `recorded`, structureless).
			detection: { select: { confidence: true, structureJson: true } },
			// Per-sample telemetry for the overlay (ADR 0020). Selected as the raw
			// JSON columns and parsed into the read-time `ActivityStream` shape below;
			// absent for recordings without a stream (manual uploads, older imports).
			stream: {
				select: {
					resolutionSec: true,
					timeSec: true,
					power: true,
					heartrate: true,
					pace: true,
				},
			},
		},
	},
	sessionLog: {
		select: {
			id: true,
			content: true,
			rpe: true,
			createdAt: true,
			updatedAt: true,
		},
	},
} satisfies Prisma.WorkoutSessionSelect

type SessionDetailRow = Prisma.WorkoutSessionGetPayload<{
	select: typeof sessionDetailSelect
}>

type RecordingRow = NonNullable<SessionDetailRow['recording']>

/**
 * The session-detail read model. Identical to the queried row except the
 * Recording's raw `stream` columns are replaced by the parsed read-time
 * `ActivityStream` (or `null` when the Recording has no usable stream), so the
 * route never touches stored JSON.
 */
export type SessionDetail = Omit<SessionDetailRow, 'recording'> & {
	recording:
		| (Omit<RecordingRow, 'stream'> & { stream: ActivityStream | null })
		| null
}

export async function getSessionByIdForUser(
	userId: string,
	sessionId: string,
): Promise<SessionDetail | null> {
	const row = await prisma.workoutSession.findFirst({
		where: {
			id: sessionId,
			userId,
		},
		select: sessionDetailSelect,
	})
	if (!row) return null
	if (!row.recording) return { ...row, recording: null }
	const { stream, ...recording } = row.recording
	return {
		...row,
		recording: { ...recording, stream: parseStoredStream(stream) },
	}
}

/**
 * The athlete's per-discipline thresholds (ADR 0005), keyed by discipline, for
 * resolving authored Intensity Targets into concrete metric targets
 * (pace/power/HR) on the home surface and session detail. A discipline with no
 * profile is simply absent from the map, so its %-based targets degrade to an
 * Unavailable Metric rather than a fabricated value (the Unavailable Metric
 * principle, CONTEXT.md).
 */
export async function getDisciplineThresholds(
	userId: string,
): Promise<DisciplineThresholdMap> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: {
			disciplineProfiles: {
				select: {
					discipline: true,
					lthr: true,
					maxHr: true,
					ftp: true,
					runPowerThresholdW: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
					zoneSystem: true,
					zoneOverrides: true,
				},
			},
		},
	})
	const map: DisciplineThresholdMap = {}
	for (const dp of profile?.disciplineProfiles ?? []) {
		const { discipline, ...thresholds } = dp
		map[discipline] = thresholds
	}
	return map
}

// The "vs last time" delta only needs each prior session's truthful actual
// metrics — its TSS and recorded moving time — plus enough to link back to it.
// (Pace/power/HR widen this once metric Intensity Targets land, per #129.)
const similarSessionSelect = {
	id: true,
	scheduledAt: true,
	tssValue: true,
	recording: { select: { durationSec: true } },
} satisfies Prisma.WorkoutSessionSelect

export type SimilarSession = Prisma.WorkoutSessionGetPayload<{
	select: typeof similarSessionSelect
}>

/**
 * The most recent *completed* Workout Session of the same discipline and Workout
 * intent scheduled strictly before `before`, or null when the athlete has no
 * prior similar session (the first of its kind). Powers the "vs last time"
 * delta on the Workout Detail View — how a completed session compares to the
 * last time the athlete did something similar (PRD #129).
 *
 * "Similar" is discipline + Workout intent: a threshold run compares to the last
 * threshold run, not a recovery jog. Only completed sessions count (the athlete
 * must actually have done it), and only ones carrying a Workout — recording-only
 * sessions have no intent to match. Honesty over guessing (ADR 0008): a null
 * result surfaces an Unavailable state, never a fabricated delta.
 */
export async function getLastSimilarSession(
	userId: string,
	{ discipline, intent }: { discipline: string; intent: string },
	before: Date,
): Promise<SimilarSession | null> {
	return prisma.workoutSession.findFirst({
		where: {
			userId,
			status: 'completed',
			scheduledAt: { lt: before },
			workout: { discipline, intent },
		},
		orderBy: { scheduledAt: 'desc' },
		select: similarSessionSelect,
	})
}
