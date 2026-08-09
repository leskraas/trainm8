/**
 * **Season generation's server half** (ADR 0053, #456): read what the six inputs
 * need, put a season through the seam, and — only when the athlete approves —
 * write it.
 *
 * The division of labour is the seam's. Everything that *reads* is here;
 * everything that *decides* is in the pure modules beside it. That is not tidiness:
 * a generator that could query would be reproducible only against one database,
 * and the property this feature turns on is stronger than that.
 *
 * ## Nothing is persisted until approved, and approval regenerates
 *
 * `previewSeason` writes nothing at all — it has no transaction and no create.
 * `approveSeason` takes the same inputs the preview was built from and **runs the
 * generator again**, server-side, rather than accepting a payload the browser
 * posted back. Determinism is what makes that possible, and it buys two things a
 * posted payload cannot: the athlete cannot approve a season the app never
 * produced, and a stale preview cannot land sessions nobody was shown. It is the
 * same rule `fitPlanToEvent` already holds for the **Season Fit** proposal.
 *
 * ## What a placed session is
 *
 * An ordinary **Workout Session** with two marks: `source: 'generated'` — the
 * **Session Source** value ADR 0016 defined and #460 kept — and a `targetEventId`
 * anchoring it to the **Target Event**. Its **Workout** is a **fresh deep copy**
 * of the **Stock Workout**, back-pointing at it through `copiedFromId`, so:
 *
 * - editing week 2's Wednesday cannot edit week 3's (ADR 0044 §6, `Workout.sessions`
 *   is one-to-many, so a shared Workout would make one edit twelve);
 * - the **Citation** is *reached* rather than copied — `resolveCatalogueOrigin`
 *   walks the chain, never one hop — so correcting a mis-cited corpus row corrects
 *   every plan that used it, and `retiredAt` keeps working (ADR 0051 §5);
 * - **Session Adoption** already means what it should: the session stays
 *   `generated` forever and `adoptedAt` records the takeover (#460).
 *
 * The copy goes through `copyWorkout`, the same builder the corpus seed and
 * detection materialization use — **never through the Conform-backed draft/form
 * editor**, which drops the facets #450 added (cadence, grade, vertical, rest
 * form, send-off, series, load) on a round trip. Routing a retrieved corpus row
 * through it would silently strip exactly the fields the Catalogue exists to
 * express.
 */
import { type Prisma } from '@prisma/client'
import { addDays, localTimeUTC, weekMonday } from '../athlete-calendar.ts'
import { DEFAULT_TRAINING_TIME } from '../athlete-schema.ts'
import { catalogueEntrySelect } from '../catalogue.server.ts'
import {
	CATALOGUE_GOAL_EVENTS,
	type CatalogueGoalEvent,
	type CataloguePhase,
} from '../catalogue.ts'
import { prisma } from '../db.server.ts'
import { parseEventDisciplines, parseEventTarget } from '../event-schema.ts'
import { recomputePlannedTssForSession } from '../load/planned-tss.server.ts'
import {
	createPlanOutline,
	type CreateOutlineRefusal,
} from '../plan-outline/authoring.server.ts'
import { type VolumeCurrency } from '../plan-outline/derive.ts'
import { readAnchorContext } from '../plan-outline/history.server.ts'
import {
	PRESET_KEYS,
	presetFor,
	presetWeeks,
	type PresetKey,
} from '../plan-outline/presets.ts'
import {
	proposeTrack,
	trackDisciplinesFor,
	type TrackProposal,
} from '../plan-outline/proposal.ts'
import {
	isCardioDiscipline,
	RACE_ANCHOR_DISTANCE_M,
	type CardioDiscipline,
	type Discipline,
	type RaceAnchor,
} from '../workout-schema.ts'
import { copyWorkout, workoutCopySelect } from '../workout.server.ts'
import { generateSeason, type SeasonGenerator } from './generator.ts'
import { type RetrievableEntry } from './retrieval.ts'
import {
	type GeneratedSeason,
	type GenerationIntent,
	type GenerationTrack,
	type SeasonRequest,
} from './season.ts'

/**
 * What the athlete has said, where they have said anything.
 *
 * Every field is optional because **only one of the six inputs is asked** (#436):
 * the shape is pre-selected by fit, the **Season Anchor** arrives pre-filled from
 * the athlete's own history, and the **Plan Start Week** stops being a question.
 * A surface that has to send all four before it can show a season would be the
 * blank form generation exists to remove — so an empty `GenerationAnswers` is a
 * complete request, and {@link resolveChoice} is where the defaults come from.
 */
export type GenerationAnswers = {
	presetKey?: PresetKey
	startWeekKey?: string
	intent?: GenerationIntent
	/** Per **Discipline**, the anchor the athlete typed over the pre-fill. */
	anchors?: Partial<Record<string, number | null>>
}

/**
 * What the athlete chose, resolved — pre-fills and defaults filled in. Preview and
 * approval both run through {@link resolveChoice}, so the season an athlete
 * approves is built from the same answers as the one they were shown.
 */
export type GenerationChoice = {
	presetKey: PresetKey
	startWeekKey: string
	intent: GenerationIntent
	/**
	 * One per cardio **Discipline** the Event names, pre-filled from the athlete's
	 * own history and theirs to change before approving.
	 */
	tracks: Array<{
		discipline: CardioDiscipline
		currency: VolumeCurrency
		anchorValue: number | null
	}>
}

/** Why a generation could not be produced or approved. Each is an athlete-visible state. */
export type GenerationRefusal =
	| 'event-not-found'
	| 'no-cardio-discipline'
	| 'anchor-missing'
	| CreateOutlineRefusal

export type PreviewResult =
	| { ok: true; preview: SeasonPreview }
	| { ok: false; reason: GenerationRefusal }

export type ApproveResult =
	| { ok: true; outlineId: string; sessions: number }
	| { ok: false; reason: GenerationRefusal }

/** Everything the generation screen renders: the season, and what it was built from. */
export type SeasonPreview = {
	event: {
		id: string
		name: string
		startDate: Date
		disciplines: Discipline[]
	}
	season: GeneratedSeason
	/** The answers the season was built from, with every default already filled in. */
	choice: GenerationChoice
	/** The Monday the plan is proposed to start on, and the Event's own week. */
	currentWeekKey: string
	eventWeekKey: string
	timezone: string
	/** Per cardio Discipline, what its own history proposes — unit and pre-fill. */
	proposals: TrackProposal[]
	/** Hours per Training Week the athlete authored, or null where they never did. */
	weeklyCapacityHours: number | null
}

/**
 * The corpus, as retrieval reads it.
 *
 * **Stock rows only**, and that is enforced in the query rather than left to the
 * pure filter that also asserts it. Two gates rather than one because they answer
 * different failures: the query keeps a hundred community rows out of the seam's
 * argument entirely, and `matchesCriteria` keeps a stock-only rule true for any
 * caller that assembles a corpus some other way.
 *
 * Retired entries are excluded — `retiredAt` exists so a row later found mis-cited
 * stops being *retrievable* without vanishing from the plans that already used it.
 */
export async function readGenerationCorpus(): Promise<RetrievableEntry[]> {
	const entries = await prisma.catalogueEntry.findMany({
		where: { retiredAt: null, workout: { authorship: 'system' } },
		select: {
			...catalogueEntrySelect,
			workout: {
				select: {
					id: true,
					title: true,
					description: true,
					discipline: true,
					authorship: true,
				},
			},
		},
	})
	return entries.map((entry) => ({
		entryId: entry.id,
		workoutId: entry.workoutId,
		title: entry.workout.title,
		description: entry.workout.description,
		discipline: entry.workout.discipline,
		authorship: entry.workout.authorship,
		archetype: entry.archetype,
		level: entry.level,
		phases: entry.phases.map((row) => row.phase as CataloguePhase),
		goalEvents: entry.goalEvents.map(
			(row) => row.goalEvent as CatalogueGoalEvent,
		),
		citationAuthor: entry.citationAuthor,
		citationWork: entry.citationWork,
		citationYear: entry.citationYear,
		citationLocator: entry.citationLocator,
	}))
}

/**
 * The **Catalogue** goal event an Event names, or `null`.
 *
 * Only an **Event Target** of kind `distance` says a distance at all, and it is
 * matched **exactly** against the race anchors' metres — nothing rounds, so a
 * 4.8 km parkrun is not a 5k, on the rule `RACE_ANCHOR_DISTANCE_M` already states.
 * `trail` and `ultra` are in the vocabulary and are not produced here: no field on
 * an Event says a race is a trail race, and reading one off a distance would be a
 * guess wearing a filter's clothes.
 *
 * `null` does not narrow retrieval (see `matchesCriteria`), which is what keeps a
 * bike season — whose rows are unscoped by goal event — retrievable at all.
 */
export function goalEventFor(target: string | null): CatalogueGoalEvent | null {
	const parsed = parseEventTarget(target)
	if (parsed?.kind !== 'distance') return null
	for (const anchor of Object.keys(RACE_ANCHOR_DISTANCE_M) as RaceAnchor[]) {
		if (RACE_ANCHOR_DISTANCE_M[anchor] === parsed.meters) {
			return (CATALOGUE_GOAL_EVENTS as readonly string[]).includes(anchor)
				? (anchor as CatalogueGoalEvent)
				: null
		}
	}
	return null
}

/** The shape the request needs, read once and shared by preview and approve. */
type GenerationContext = {
	event: {
		id: string
		name: string
		startDate: Date
		disciplines: Discipline[]
		target: string | null
	}
	timezone: string
	currentWeekKey: string
	eventWeekKey: string
	proposals: TrackProposal[]
	trainableWeekdays: number[] | null
	weeklyCapacityHours: number | null
	corpus: RetrievableEntry[]
}

async function readContext(
	athleteId: string,
	eventId: string,
	now: Date,
): Promise<GenerationContext | null> {
	const event = await prisma.event.findFirst({
		where: { id: eventId, athleteId, status: { not: 'cancelled' } },
		select: {
			id: true,
			name: true,
			startDate: true,
			disciplines: true,
			target: true,
		},
	})
	if (!event) return null

	const { timezone, currentWeekKey, volumes } = await readAnchorContext(
		athleteId,
		now,
	)
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: athleteId },
		select: { trainableWeekdays: true, weeklyCapacityHours: true },
	})
	const disciplines = parseEventDisciplines(event.disciplines)
	const proposals = trackDisciplinesFor(disciplines, volumes).map(
		(discipline) =>
			proposeTrack(volumes.find((entry) => entry.discipline === discipline)!),
	)

	return {
		event: { ...event, disciplines },
		timezone,
		currentWeekKey,
		eventWeekKey: weekMonday(event.startDate, timezone),
		proposals,
		trainableWeekdays: parseWeekdays(profile?.trainableWeekdays ?? null),
		weeklyCapacityHours: profile?.weeklyCapacityHours ?? null,
		corpus: await readGenerationCorpus(),
	}
}

/**
 * The athlete's **Training Availability**, or `null` where they never set it —
 * which `proposeStarterPattern` answers with its stated default, and which is a
 * different state from an explicit empty list.
 */
function parseWeekdays(raw: string | null): number[] | null {
	if (raw == null) return null
	try {
		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) return null
		return parsed.filter((day): day is number => typeof day === 'number')
	} catch {
		return null
	}
}

/**
 * The request the seam takes, assembled from the context and the athlete's answers.
 *
 * Exported so the preview and the approval build it the *same* way — the point of
 * regenerating on approve is lost if the two assemble different requests.
 */
export function buildRequest(
	context: GenerationContext,
	choice: GenerationChoice,
): SeasonRequest {
	const tracks: GenerationTrack[] = choice.tracks.map((track) => ({
		discipline: track.discipline,
		currency: track.currency,
		anchorValue: track.anchorValue,
	}))
	return {
		presetKey: choice.presetKey,
		startWeekKey: choice.startWeekKey,
		eventWeekKey: context.eventWeekKey,
		tracks,
		// Every Discipline the Event names that no track was laid for. Today that is
		// strength, and the payload declines it by name rather than by absence.
		strengthDisciplines: context.event.disciplines.filter(
			(discipline) => !isCardioDiscipline(discipline),
		),
		trainableWeekdays: context.trainableWeekdays,
		goalEvent: goalEventFor(context.event.target),
		intent: choice.intent,
		weeklyCapacityHours: context.weeklyCapacityHours,
	}
}

/**
 * The **default Volume Currency** for a Discipline whose history says nothing.
 *
 * `km` for every cardio Discipline, because distance is the least-derived unit an
 * endurance week can be stated in (`proposal.ts`). It is a *unit* and never a
 * *size*: the anchor stays null, the athlete is asked outright, and every week
 * prices as an **Unavailable Metric** until they answer (ADR 0040 §6).
 */
const FALLBACK_CURRENCY: VolumeCurrency = 'km'

/**
 * Fill in what the athlete did not say.
 *
 * This is the function that makes "only one input is asked" true. The shape is
 * pre-selected by fit against the Event; the **Plan Start Week** is this week; each
 * track's unit and **Season Anchor** come from that Discipline's own history; and
 * the intent defaults to the middle of the three so a season exists before the
 * athlete has answered anything at all.
 *
 * Preview and approval both call it, which is what stops the approved season being
 * built from different answers than the reviewed one.
 */
export function resolveChoice(
	context: GenerationContext,
	answers: GenerationAnswers,
): GenerationChoice {
	const startWeekKey = answers.startWeekKey ?? context.currentWeekKey
	return {
		presetKey:
			answers.presetKey ??
			defaultPresetFor(startWeekKey, context.eventWeekKey, PRESET_KEYS),
		startWeekKey,
		intent: answers.intent ?? 'deliberately-building',
		tracks: context.proposals.flatMap((proposal) => {
			if (!isCardioDiscipline(proposal.discipline)) return []
			const currency = proposal.currency ?? FALLBACK_CURRENCY
			const prefill = proposal.anchors[currency]?.value ?? null
			const answered = answers.anchors?.[proposal.discipline]
			return [
				{
					discipline: proposal.discipline,
					currency,
					anchorValue: answered === undefined ? prefill : answered,
				},
			]
		}),
	}
}

/**
 * Produce a season for review. **Writes nothing.**
 *
 * `generator` is injectable for the same reason the seam exists: a test — or a
 * model, later — supplies a different implementation and every caller below this
 * line is unchanged.
 */
export async function previewSeason(
	athleteId: string,
	eventId: string,
	answers: GenerationAnswers = {},
	options: { now?: Date; generator?: SeasonGenerator } = {},
): Promise<PreviewResult> {
	const context = await readContext(
		athleteId,
		eventId,
		options.now ?? new Date(),
	)
	if (!context) return { ok: false, reason: 'event-not-found' }
	const choice = resolveChoice(context, answers)
	if (choice.tracks.length === 0) {
		return { ok: false, reason: 'no-cardio-discipline' }
	}

	const season = generateSeason(
		buildRequest(context, choice),
		context.corpus,
		options.generator,
	)

	return {
		ok: true,
		preview: {
			event: {
				id: context.event.id,
				name: context.event.name,
				startDate: context.event.startDate,
				disciplines: context.event.disciplines,
			},
			season,
			choice,
			currentWeekKey: context.currentWeekKey,
			eventWeekKey: context.eventWeekKey,
			timezone: context.timezone,
			proposals: context.proposals,
			weeklyCapacityHours: context.weeklyCapacityHours,
		},
	}
}

/**
 * The default preset for an Event: the shape whose length lands nearest the
 * Event's week from the current one.
 *
 * A **default and never a label** — no shape is marked "recommended", because
 * fitting the calendar is not evidence that a season is right for this athlete
 * (ADR 0048 §2). Nearest in **absolute** weeks, ties to the earlier shipped shape,
 * the same measure the shape step uses so the two cannot disagree.
 */
export function defaultPresetFor(
	startWeekKey: string,
	eventWeekKey: string,
	keys: readonly PresetKey[],
): PresetKey {
	const runIn = Math.round(
		(Date.parse(`${eventWeekKey}T00:00:00Z`) -
			Date.parse(`${startWeekKey}T00:00:00Z`)) /
			(7 * 24 * 60 * 60 * 1000),
	)
	let best: { key: PresetKey; gap: number } | null = null
	for (const key of keys) {
		const gap = Math.abs(presetWeeks(presetFor(key)) - (runIn + 1))
		if (best == null || gap < best.gap) best = { key, gap }
	}
	return best!.key
}

/**
 * **Approve**: regenerate the same season server-side and write it.
 *
 * Two writes, in order. The **Plan Outline** goes through `createPlanOutline` —
 * the same service the manual shape step calls, reading the same `presets.ts`
 * constants — so a generated season and a hand-picked shape produce the *same*
 * rows and nothing downstream can tell which act made them. The sessions then land
 * in one transaction, so a failure part-way cannot leave a plan with half a season
 * under it.
 */
export async function approveSeason(
	athleteId: string,
	eventId: string,
	answers: GenerationAnswers = {},
	options: { now?: Date; generator?: SeasonGenerator } = {},
): Promise<ApproveResult> {
	const now = options.now ?? new Date()
	const context = await readContext(athleteId, eventId, now)
	if (!context) return { ok: false, reason: 'event-not-found' }
	const choice = resolveChoice(context, answers)
	if (choice.tracks.length === 0) {
		return { ok: false, reason: 'no-cardio-discipline' }
	}
	// A Training Track with no Season Anchor has no size, and the derivation prices
	// every one of its weeks as Unavailable. That is a fine thing to *preview* and
	// not a thing to write: `createPlanOutline` requires a positive value, and
	// substituting one here is exactly the fabrication the feature forbids.
	const anchored = choice.tracks.map((track) => ({
		discipline: track.discipline,
		currency: track.currency,
		anchorValue: track.anchorValue,
	}))
	if (anchored.some((track) => track.anchorValue == null)) {
		return { ok: false, reason: 'anchor-missing' }
	}

	const season = generateSeason(
		buildRequest(context, choice),
		context.corpus,
		options.generator,
	)

	const created = await createPlanOutline(
		athleteId,
		{
			eventId,
			startWeekKey: choice.startWeekKey,
			structure: { presetKey: choice.presetKey },
			tracks: anchored.map((track) => ({
				discipline: track.discipline,
				currency: track.currency,
				anchorValue: track.anchorValue!,
			})),
		},
		now,
	)
	if (!created.ok) return { ok: false, reason: created.reason }

	const sessionIds = await writeSessions(
		athleteId,
		eventId,
		season,
		context.timezone,
		await defaultTrainingTime(athleteId),
	)

	// Planned TSS is materialized per session (ADR 0019), and a retrieved corpus
	// row resolves against *this* athlete's thresholds — so a runner with none gets
	// an honest `null` rather than a figure computed from a threshold nobody set.
	for (const sessionId of sessionIds) {
		await recomputePlannedTssForSession(athleteId, sessionId)
	}

	return { ok: true, outlineId: created.outlineId, sessions: sessionIds.length }
}

/** The athlete's default training time, or the documented default. */
async function defaultTrainingTime(athleteId: string): Promise<string> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: athleteId },
		select: { defaultTrainingTime: true },
	})
	return profile?.defaultTrainingTime ?? DEFAULT_TRAINING_TIME
}

/**
 * Write the placed sessions, each on a fresh copy of its **Stock Workout**.
 *
 * A row the corpus no longer has is skipped rather than failing the whole
 * approval: the corpus can be re-seeded between a preview and its approval, and an
 * athlete losing a whole season because one row was retired mid-review would be a
 * worse answer than a season one session short.
 */
async function writeSessions(
	athleteId: string,
	eventId: string,
	season: GeneratedSeason,
	timezone: string,
	trainingTime: string,
): Promise<string[]> {
	const workoutIds = [...new Set(season.sessions.map((s) => s.workoutId))]
	const sources = await prisma.workout.findMany({
		where: { id: { in: workoutIds } },
		select: workoutCopySelect,
	})
	const byId = new Map(sources.map((source) => [source.id, source]))

	return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		const ids: string[] = []
		for (const session of season.sessions) {
			const source = byId.get(session.workoutId)
			if (!source) continue
			// A fresh Workout per session, back-pointing at the corpus row. Never a
			// reference to the stock row itself: `Workout.sessions` is one-to-many, so
			// a shared Workout would make editing one week edit every other.
			const copy = await copyWorkout(tx, source, athleteId, {
				copiedFromId: source.id,
			})
			const created = await tx.workoutSession.create({
				data: {
					userId: athleteId,
					workoutId: copy.id,
					// A pattern weekday is Monday-first and so is the Training Week, so
					// the weekday *is* the offset from the week's own Monday (ADR 0019).
					scheduledAt: localTimeUTC(
						addDays(session.weekKey, session.weekday),
						trainingTime,
						timezone,
					),
					status: 'scheduled',
					source: 'generated',
					targetEventId: eventId,
				},
				select: { id: true },
			})
			ids.push(created.id)
		}
		return ids
	})
}
