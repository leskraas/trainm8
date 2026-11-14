/**
 * **The typed payload one boundary produces** — what a season generation returns,
 * whoever generated it (ADR 0016's model-client seam, carried forward by ADR
 * 0053, #456).
 *
 * This file is the seam's contract and holds no logic. That separation is the
 * whole point of the seam: the review surface, the approval step and the
 * provenance rendering read *these* types, so the thing that produced them can be
 * replaced without any of the three changing. Today the producer is
 * `deterministic.ts`; a model later is a second implementation of
 * {@link import('./generator.ts').SeasonGenerator} returning the same payload.
 *
 * Three properties are visible in the shape rather than promised in prose:
 *
 * - **Nothing is persisted.** There is not an id in here that the app minted —
 *   only the ids of rows that already exist (a **Catalogue Entry**, its Workout).
 *   A payload cannot be mistaken for a written plan because it has nothing
 *   written to point at.
 * - **Absences are members.** {@link GeneratedSeason.unavailable} and
 *   {@link GeneratedSeason.unfilled} are part of the payload, not omissions from
 *   it, so a surface that renders the plan renders the holes in it too.
 * - **Every placed session carries where it came from.** `provenance` is
 *   non-optional on {@link GeneratedSession}, so a session with nothing truthful
 *   to say about its source is unrepresentable rather than merely discouraged.
 */
import {
	type CatalogueGoalEvent,
	type CataloguePhase,
	type CatalogueLevel,
	type SessionArchetype,
} from '../catalogue.ts'
import { type DisciplineThresholdMap } from '../intensity-target.ts'
import {
	type PhaseSpec,
	type Rhythm,
	type VolumeCurrency,
	type WeekRole,
} from '../plan-outline/derive.ts'
import { type PresetKey } from '../plan-outline/presets.ts'
import {
	type QualitySessionMixEntry,
	type QualityZone,
} from '../plan-outline/quality-mix.ts'
import { type ConversionContext } from '../plan-outline/volume-conversion.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { type PrescribedDuration } from '../prescribed-duration.ts'
import { type CardioDiscipline, type Discipline } from '../workout-schema.ts'
import { type CapacityFit } from './capacity.ts'
import { type PlacedFit } from './placed-hours.ts'
import { type SessionProvenance } from './provenance.ts'

/**
 * **The one thing nothing in the model can read** — what the athlete says about
 * themselves before a plan exists (#436). Everything else among the six inputs is
 * proposed, pre-filled or derived; this is asked outright.
 *
 * It is a closed set of three because those are the three the map named, and
 * because a free-text intent would be a field generation could only ignore.
 */
export const GENERATION_INTENTS = [
	'first-season',
	'returning-from-injury',
	'deliberately-building',
] as const
export type GenerationIntent = (typeof GENERATION_INTENTS)[number]

/**
 * The intent approval uses when none was asked, and a Generation Record without
 * one is read as (ADR 0120 §5).
 */
export const DEFAULT_GENERATION_INTENT: GenerationIntent =
	'deliberately-building'

/**
 * The **level floor** each intent retrieves at — a **stated convention**, worded
 * as one wherever it is shown, in the same register as the presets' `+5 %` ramp.
 *
 * It is a convention rather than a reading because nothing in this app measures an
 * athlete onto the three-band ladder: there is no level column, no test that
 * assigns one, and the only thing the athlete has said is which of three sentences
 * describes them. So this maps a sentence to *how far up the corpus's dose ladder
 * generation may reach*, and it is never a claim about the athlete.
 *
 * **Nothing maps to `advanced`.** A `level` on a **Catalogue Entry** is a floor —
 * the lowest athlete the row suits — so retrieving at `intermediate` already
 * admits every unscoped row and every beginner-floored one, and reaching the
 * advanced-floored rows would mean asserting a band about somebody who only told
 * us they are building deliberately. Those rows stay reachable the way they always
 * were: the athlete browses the **Catalogue** and picks one.
 */
export const INTENT_LEVEL_FLOOR: Record<GenerationIntent, CatalogueLevel> = {
	'first-season': 'beginner',
	'returning-from-injury': 'beginner',
	'deliberately-building': 'intermediate',
}

/** One endurance **Training Track** the season is asked to lay down. */
export type GenerationTrack = {
	discipline: CardioDiscipline
	/** Locked for the life of the track once written (ADR 0043 §2). */
	currency: VolumeCurrency
	/**
	 * The **Season Anchor**'s first value — the athlete's, pre-filled from their own
	 * history with the derivation shown, then authored (ADR 0040 §6).
	 *
	 * `null` where there is nothing to pre-fill it from and the athlete has not yet
	 * typed one. That is not a defect in the payload: every week of such a track
	 * prices as `null`, which is the **Unavailable Metric** the derivation already
	 * produces when no anchor is in force, and the sessions are retrieved regardless
	 * because retrieval reads archetype and phase rather than volume. A season
	 * cannot be *approved* on a null anchor — a **Training Track** with no size is
	 * not a track — and the surface asks for the number before it writes anything.
	 */
	anchorValue: number | null
}

/**
 * **The six inputs #436 settled**, as one value.
 *
 * Event date arrives as `eventWeekKey` (the Event's own **Training Week**) rather
 * than as a date, because every other week here is a week key and a season is
 * measured in weeks; disciplines arrive as the tracks they became; the shape is
 * `presetKey`; **Weekly Capacity** and **Season Anchor** arrive pre-filled;
 * `intent` is the asked one.
 *
 * `strengthDisciplines` is separate from `tracks` on purpose, and is the request's
 * half of the honesty rule: a **Discipline** the athlete's Event names that
 * generation cannot lay a track for still has to arrive, or the plan could not say
 * it declined to generate one.
 */
export type SeasonRequest = {
	presetKey: PresetKey
	/** The **Plan Start Week** — authored, never counted back from the Event. */
	startWeekKey: string
	/** The Event's own Monday, so the payload can state its **Season Fit**. */
	eventWeekKey: string
	tracks: GenerationTrack[]
	/** Disciplines the Event names that no track was laid for. Today: strength. */
	strengthDisciplines: Discipline[]
	/** The athlete's **Training Availability**, or null where they never set it. */
	trainableWeekdays: number[] | null
	/** The Event's distance where the corpus scopes by one, else null. */
	goalEvent: CatalogueGoalEvent | null
	intent: GenerationIntent
	/** Hours per **Training Week** the athlete has room for, or null if unset. */
	weeklyCapacityHours: number | null
	/**
	 * Per Discipline, what the **Volume Conversion** needs to read a week in hours
	 * (`readConversionContexts`). Data, not a query, so the generator stays pure.
	 * Missing for a Discipline means its weeks may not price in hours, and the
	 * capacity check then says it did not run (ADR 0110).
	 */
	conversionContexts: Partial<Record<Discipline, ConversionContext>>
	/**
	 * The athlete's thresholds as a session row reads them
	 * (`getDisciplineThresholds`, with Race Anchor paces), read on every preview
	 * and approval. What a placed session's distance steps are timed through
	 * (ADR 0116 §1). Never the Volume Conversion's contexts.
	 */
	thresholds: DisciplineThresholdMap
}

/** One block of the generated season, and the corpus facet it retrieves under. */
export type GeneratedPhase = {
	name: string
	weeks: number
	rhythm: Rhythm
	tapers: boolean
	/**
	 * Which **Catalogue Entry** phase facet this block's sessions are retrieved
	 * under — derived from the block's *position and shape*, never from its name.
	 * Phase names are free text (ADR 0044), so a season named "Grunntrening →
	 * Spesifikk" must retrieve as base → build exactly as an English one does.
	 */
	cataloguePhase: CataloguePhase
}

/** One **Training Week** of the season, priced. */
export type GeneratedWeek = {
	/** 0-based, counted from the **Plan Start Week**. */
	weekIndex: number
	weekKey: string
	phaseIndex: number
	role: WeekRole
	/** The last week of the plan, which retrieves as `race-week`. */
	isFinalWeek: boolean
	targets: Array<{
		discipline: CardioDiscipline
		currency: VolumeCurrency
		/** The derived weekly volume, or `null` — an **Unavailable Metric**. */
		value: number | null
	}>
}

/**
 * Why a day holds the session it holds. Carried on the payload rather than
 * recomputed by the surface, because "this is your **Quality Session Mix**'s zone-4
 * session" is the sentence that makes a generated week reviewable at all.
 */
export type SessionSlot = 'quality' | 'long' | 'ordinary' | 'race-week'

/** One session the generator placed, with the corpus row it was retrieved from. */
export type GeneratedSession = {
	weekIndex: number
	weekKey: string
	/** Monday-first, the **Training Week**'s own order (ADR 0019). */
	weekday: PatternWeekday
	discipline: CardioDiscipline
	archetype: SessionArchetype
	slot: SessionSlot
	/** The mix zone this slot came from, or null on a non-quality slot. */
	zone: QualityZone | null
	/** The **Catalogue Entry** retrieved. Stable across regenerations. */
	entryId: string
	/** The **Stock Workout** the entry offers — what a placed session copies. */
	workoutId: string
	title: string
	provenance: SessionProvenance
	/**
	 * How long the Stock Workout takes as placed, through the athlete's
	 * thresholds (`prescribedDuration`), or null when no step could be timed.
	 * Never rescaled to fit anything (ADR 0053 §6).
	 */
	prescribed: PrescribedDuration | null
}

/**
 * A slot the corpus had nothing for, stated rather than filled with a substitute.
 *
 * A generated week that is one session short and says which one is honest; a week
 * silently backfilled with an easy run in place of the threshold session the mix
 * asked for is a plan that lies about its own intensity distribution.
 */
export type UnfilledSlot = {
	weekIndex: number
	weekKey: string
	weekday: PatternWeekday
	discipline: CardioDiscipline
	slot: SessionSlot
	zone: QualityZone | null
	/** The archetypes tried, in preference order — so the gap names itself. */
	archetypes: SessionArchetype[]
	cataloguePhase: CataloguePhase
}

/**
 * The readings a generated season cannot state, each its own token for its own
 * reason — the idiom `plan-outline/unavailable-readings.ts` already holds.
 *
 * **`strength-track`** is the one this ticket exists around. No **Periodization
 * Preset** carries a strength segment (`presets.ts` has no strength arm at all),
 * and `TrainingTrackSegment`'s strength arm requires a `startWeekKey`, a `weeks`,
 * a **Strength Goal** and a **Strength Frequency** (ADR 0047 §3, §4, §6) that no
 * preset supplies and nothing else in the request implies. Four numbers with no
 * source is four fabrications, so the track is **declined and named** — never a
 * `sessionsPerWeek` invented to fill the arm.
 */
export const GENERATION_UNAVAILABLE_READINGS = ['strength-track'] as const
export type GenerationUnavailableReading =
	(typeof GENERATION_UNAVAILABLE_READINGS)[number]

/** One **Unavailable Metric** the generated season carries, with what it is about. */
export type GeneratedUnavailable = {
	reading: GenerationUnavailableReading
	discipline: Discipline
}

/** The whole season, as one boundary produces it. */
export type GeneratedSeason = {
	/** Which implementation behind the seam produced this. */
	generatorId: string
	presetKey: PresetKey
	startWeekKey: string
	eventWeekKey: string
	phases: GeneratedPhase[]
	/**
	 * The tracks the weeks were priced from — the request's, with each **Season
	 * Anchor** lowered where `capacity` says it was. What approval writes.
	 */
	tracks: GenerationTrack[]
	/** What the **Weekly Capacity** check did to the season (ADR 0110). */
	capacity: CapacityFit
	/**
	 * Each week's **Placed Hours** against the **Weekly Capacity** (ADR 0110
	 * §4, ADR 0116): stated where over, never fixed.
	 */
	placed: PlacedFit
	weeks: GeneratedWeek[]
	/** Every placed session, in season order: week, then weekday, then discipline. */
	sessions: GeneratedSession[]
	unfilled: UnfilledSlot[]
	/**
	 * The days the season was placed on, per Discipline with their role: what
	 * approval keeps on the plan's **Generation Record** (ADR 0120 §1).
	 */
	days: GeneratedDay[]
	unavailable: GeneratedUnavailable[]
	/** Where the athlete's availability came from — their own, or the default. */
	weekdaySource: 'availability' | 'default'
	/** The level floor retrieval ran at, so the surface can say it is a convention. */
	levelFloor: CatalogueLevel
	goalEvent: CatalogueGoalEvent | null
}

/** One weekday a Discipline's sessions are placed on, and its role there. */
export type GeneratedDay = {
	discipline: CardioDiscipline
	weekday: PatternWeekday
	role: 'long' | 'ordinary'
}

/**
 * What placing weeks needs (ADR 0120 §2): the plan's phases, each track's
 * **Quality Session Mix** per phase and its days, the goal event, the level
 * floor, and which weeks. Built from a preset at approval, and from the stored
 * plan and its **Generation Record** on a re-lay (`generation-request.ts`).
 */
export type PlaceWeeksRequest = {
	startWeekKey: string
	phases: PhaseSpec[]
	tracks: ReadonlyArray<{
		discipline: CardioDiscipline
		/** The track's mix in each phase, by phase index. */
		mixes: ReadonlyArray<readonly QualitySessionMixEntry[]>
		days: ReadonlyArray<{ weekday: PatternWeekday; role: 'long' | 'ordinary' }>
	}>
	goalEvent: CatalogueGoalEvent | null
	level: CatalogueLevel
	/** 0-based from the plan's first week; one outside the plan places nothing. */
	weekIndices: readonly number[]
	/**
	 * The athlete's thresholds, to time each placed session (ADR 0116 §1).
	 * Left out where Placed Hours are not read, as on a re-lay: `prescribed` is
	 * then null.
	 */
	thresholds?: DisciplineThresholdMap
}

/**
 * One slot of a placed week: what it asks of the corpus, and the session placed
 * in it, or null when the corpus had nothing for it.
 */
export type PlacedSlot = UnfilledSlot & { session: GeneratedSession | null }

/** The slots of the weeks asked for, in season order. */
export type PlacedWeeks = { slots: PlacedSlot[] }

/** The placed sessions of a placement, in its order. */
export function placedSessions(placed: PlacedWeeks): GeneratedSession[] {
	return placed.slots.flatMap((slot) => (slot.session ? [slot.session] : []))
}

/** The slots a placement found nothing in the corpus for, in its order. */
export function unfilledSlots(placed: PlacedWeeks): UnfilledSlot[] {
	return placed.slots.flatMap(({ session, ...slot }) => (session ? [] : [slot]))
}
