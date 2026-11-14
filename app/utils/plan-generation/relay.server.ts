/**
 * **Laying a generated plan's weeks again** (ADR 0117 §3–§5).
 *
 * A plan **Plan Generation** made has no **Week Pattern**; its weeks are laid by
 * the generator its **Generation Record** names, through the seam
 * (`SeasonGenerator.placeWeeks`), from the plan as it now stands and on the days
 * stored at approval. In each week, one transaction:
 *
 * 1. every session outside `REPLACEABLE_SESSION` stays; one the plan laid
 *    (adopted, or trained) fills its weekday's slot for its Discipline
 *    (`fillKeptSlots`); one the athlete wrote fills none;
 * 2. a replaceable session the plan laid stays, on the day it is on, while its
 *    **Stock Workout** still meets an unfilled slot of its Discipline
 *    (`matchesCriteria`), its own weekday's slot first;
 * 3. the other replaceable sessions the plan laid go, and each slot still
 *    unfilled gets the generator's session through the writer approval uses. A
 *    slot the corpus has nothing for stays empty.
 *
 * So an edit that changes only targets writes nothing, and a phase edit
 * replaces exactly the sessions whose slots changed.
 */
import { Prisma } from '@prisma/client'
import {
	localDate,
	weekBoundsFromMondayUTC,
	weekdayIndex,
	weekMonday,
} from '../athlete-calendar.ts'
import { type SessionArchetype } from '../catalogue.ts'
import { prisma } from '../db.server.ts'
import { totalWeeks } from '../plan-outline/derive.ts'
import { phaseSpecs } from '../plan-outline/from-rows.ts'
import { storedPlaceWeeksRequest } from '../plan-outline/generation-request.ts'
import { fillKeptSlots } from '../plan-outline/kept-slots.ts'
import { outlinePreviewSelect } from '../plan-outline/outline-preview.ts'
import { weekIndexOf, weekKeyAt } from '../plan-outline/week-keys.ts'
import {
	clearPlanWeek,
	deletePlanSessions,
	readKeptSlots,
	REPLACEABLE_SESSION,
} from '../plan-outline/week-sessions.server.ts'
import { readGenerationCorpus } from './generate.server.ts'
import { generatorFor } from './generator.ts'
import { matchesCriteria, type RetrievableEntry } from './retrieval.ts'
import {
	placedSessions,
	type PlacedSlot,
	type PlaceWeeksRequest,
} from './season.ts'
import {
	defaultTrainingTime,
	readStockWorkouts,
	recomputeWrittenSessions,
	writeGeneratedSessions,
	type GeneratedSessionTarget,
} from './write-sessions.server.ts'

/** What laying one week did. */
export type GeneratedWeekLaid = {
	weekKey: string
	/** Sessions written. */
	sessions: number
	/** Sessions the plan laid that went. */
	removed: number
	/** True when the week is outside the plan (before its start, past its end). */
	outside: boolean
}

const generatedOutlineSelect = {
	...outlinePreviewSelect,
	athleteId: true,
	eventId: true,
	event: { select: { target: true } },
	generationRecord: {
		select: {
			id: true,
			generatorId: true,
			intent: true,
			days: { select: { discipline: true, weekday: true, role: true } },
		},
	},
} as const

/**
 * Lay a generated plan's weeks again from `fromWeekKey` to the plan's end
 * (narrowed by `onlyWeekKeys`), including weeks holding none of its sessions
 * yet; a week past a shortened plan's end that still holds its sessions has
 * the machine's untrained ones cleared (ADR 0117 §3). The caller passes the
 * first unbegun week or later: a lived week is never laid again.
 */
export async function relayGeneratedPlan(
	userId: string,
	outlineId: string,
	fromWeekKey: string,
	timezone: string,
	{ onlyWeekKeys }: { onlyWeekKeys?: readonly string[] } = {},
): Promise<GeneratedWeekLaid[]> {
	const outline = await readGeneratedOutline(userId, outlineId)
	if (!outline) return []
	const weekCount = totalWeeks(phaseSpecs(outline))
	const planWeeks = Array.from({ length: weekCount }, (_, index) =>
		weekKeyAt(outline.startWeekKey, index),
	)
	const laid = await prisma.workoutSession.findMany({
		where: { userId, planOutlineId: outlineId, source: { not: 'authored' } },
		select: { scheduledAt: true },
	})
	const weekKeys = [
		...new Set([
			...planWeeks,
			...laid.map((session) => weekMonday(session.scheduledAt, timezone)),
		]),
	]
		.filter((weekKey) => weekKey >= fromWeekKey)
		.filter((weekKey) => !onlyWeekKeys || onlyWeekKeys.includes(weekKey))
		.sort()
	return layWeeks(outline, weekKeys, timezone)
}

/**
 * Lay one week of a generated plan (the horizon fill's unlaid week). Null when
 * the plan has no Generation Record or names a generator this build lacks.
 */
export async function layGeneratedWeek(
	userId: string,
	outlineId: string,
	weekKey: string,
	timezone: string,
): Promise<GeneratedWeekLaid | null> {
	const outline = await readGeneratedOutline(userId, outlineId)
	if (!outline) return null
	const [laid] = await layWeeks(outline, [weekKey], timezone)
	return laid ?? null
}

type GeneratedOutline = NonNullable<
	Awaited<ReturnType<typeof readGeneratedOutline>>
>

async function readGeneratedOutline(userId: string, outlineId: string) {
	const outline = await prisma.planOutline.findFirst({
		where: { id: outlineId, athleteId: userId },
		select: generatedOutlineSelect,
	})
	if (!outline?.generationRecord) return null
	const generator = generatorFor(outline.generationRecord.generatorId)
	if (!generator) return null
	return { ...outline, generationRecord: outline.generationRecord, generator }
}

async function layWeeks(
	outline: GeneratedOutline,
	weekKeys: readonly string[],
	timezone: string,
): Promise<GeneratedWeekLaid[]> {
	if (weekKeys.length === 0) return []
	const record = outline.generationRecord
	const generator = outline.generator
	const corpus = await readGenerationCorpus()
	const days =
		record.days.length > 0
			? record.days
			: await freezeRecordDays(outline, corpus, timezone)

	const weekCount = totalWeeks(phaseSpecs(outline))
	const indexOf = (weekKey: string) =>
		weekIndexOf(outline.startWeekKey, weekKey)
	const request = storedPlaceWeeksRequest(
		outline,
		{ intent: record.intent, days },
		outline.event?.target ?? null,
		weekKeys.map(indexOf),
	)
	const placed = generator.placeWeeks(request, corpus)
	const sources = await readStockWorkouts(placedSessions(placed))
	const target: GeneratedSessionTarget = {
		athleteId: outline.athleteId,
		eventId: outline.eventId,
		planOutlineId: outline.id,
		timezone,
		trainingTime: await defaultTrainingTime(outline.athleteId),
	}
	const byWorkoutId = new Map(corpus.map((entry) => [entry.workoutId, entry]))

	const result: GeneratedWeekLaid[] = []
	for (const weekKey of weekKeys) {
		const weekIndex = indexOf(weekKey)
		const outside = weekIndex < 0 || weekIndex >= weekCount
		const slots = placed.slots.filter((slot) => slot.weekKey === weekKey)
		const written = await prisma.$transaction(async (tx) => {
			if (outside) {
				const removed = await clearPlanWeek(
					tx,
					outline.athleteId,
					outline.id,
					weekKey,
					timezone,
				)
				return { ids: [] as string[], removed }
			}
			const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
			const replaceable = await tx.workoutSession.findMany({
				where: {
					userId: outline.athleteId,
					planOutlineId: outline.id,
					scheduledAt: { gte: start, lte: end },
					...REPLACEABLE_SESSION,
				},
				select: {
					id: true,
					scheduledAt: true,
					workoutId: true,
					workout: { select: { discipline: true, copiedFromId: true } },
				},
				orderBy: { scheduledAt: 'asc' },
			})
			// The slots the kept sessions leave open (step 1).
			let open: PlacedSlot[] = fillKeptSlots(
				slots,
				await readKeptSlots(
					tx,
					outline.athleteId,
					outline.id,
					weekKey,
					timezone,
				),
			)
			// A replaceable session its week still asks for stays (step 2): its
			// own weekday's slot first, then any open slot of its Discipline, but
			// only once its own weekday holds no open slot of that Discipline: a
			// session kept on its day while that day's slot is laid would put two
			// sessions on one day and leave the other empty (AC 5).
			const pending = replaceable.map((session) => ({
				...session,
				weekday: weekdayIndex(localDate(session.scheduledAt, timezone)),
				entry: session.workout?.copiedFromId
					? (byWorkoutId.get(session.workout.copiedFromId) ?? null)
					: null,
			}))
			const keptIds = new Set<string>()
			for (const sameDay of [true, false]) {
				for (const session of pending) {
					if (keptIds.has(session.id) || !session.entry) continue
					const entry = session.entry
					if (
						!sameDay &&
						open.some(
							(slot) =>
								slot.weekday === session.weekday &&
								slot.discipline === entry.discipline,
						)
					) {
						continue
					}
					const at = open.findIndex(
						(slot) =>
							(!sameDay || slot.weekday === session.weekday) &&
							stillAsksFor(slot, entry, request),
					)
					if (at < 0) continue
					keptIds.add(session.id)
					open = open.filter((_, index) => index !== at)
				}
			}
			const doomed = pending.filter((session) => !keptIds.has(session.id))
			await deletePlanSessions(tx, doomed)
			// The generator's session in each slot still open (step 3).
			const ids = await writeGeneratedSessions(
				tx,
				target,
				placedSessions({ slots: open }),
				sources,
			)
			return { ids, removed: doomed.length }
		})
		await recomputeWrittenSessions(outline.athleteId, written.ids)
		result.push({
			weekKey,
			sessions: written.ids.length,
			removed: written.removed,
			outside,
		})
	}
	return result
}

/**
 * Whether a slot still asks for a session copied from `entry`: of the
 * archetype the generator retrieves for the slot (the first of its archetypes
 * the corpus answers, not any fallback it lists), meeting the slot's criteria.
 * So an easy session left in a week that became race week goes, and the race
 * week's own session is placed (#686 AC 3).
 */
function stillAsksFor(
	slot: PlacedSlot,
	entry: RetrievableEntry,
	request: Pick<PlaceWeeksRequest, 'goalEvent' | 'level'>,
): boolean {
	if (slot.session?.archetype !== entry.archetype) return false
	return matchesCriteria(entry, {
		discipline: slot.discipline,
		archetype: entry.archetype as SessionArchetype,
		cataloguePhase: slot.cataloguePhase,
		goalEvent: request.goalEvent,
		level: request.level,
	})
}

/**
 * The days of a plan generated before its record kept them (ADR 0117 §5), read
 * off its own laid sessions in the athlete's timezone and written to the
 * record: per Discipline, the weekday set most of its weeks hold, the long day
 * the one its long-archetype sessions sat on most, else the last.
 */
async function freezeRecordDays(
	outline: GeneratedOutline,
	corpus: readonly RetrievableEntry[],
	timezone: string,
): Promise<Array<{ discipline: string; weekday: number; role: string }>> {
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId: outline.athleteId,
			planOutlineId: outline.id,
			source: 'generated',
		},
		select: {
			scheduledAt: true,
			workout: { select: { discipline: true, copiedFromId: true } },
		},
	})
	const byWorkoutId = new Map(corpus.map((entry) => [entry.workoutId, entry]))
	// discipline → week → weekdays
	const weeks = new Map<string, Map<string, Set<number>>>()
	const longDays = new Map<string, Map<number, number>>()
	for (const session of sessions) {
		if (!session.workout) continue
		const discipline = session.workout.discipline
		const weekday = weekdayIndex(localDate(session.scheduledAt, timezone))
		const week = weekMonday(session.scheduledAt, timezone)
		const perWeek = weeks.get(discipline) ?? new Map<string, Set<number>>()
		perWeek.set(week, (perWeek.get(week) ?? new Set()).add(weekday))
		weeks.set(discipline, perWeek)
		const entry = session.workout.copiedFromId
			? byWorkoutId.get(session.workout.copiedFromId)
			: undefined
		if (entry && entry.archetype === 'long') {
			const counts = longDays.get(discipline) ?? new Map<number, number>()
			counts.set(weekday, (counts.get(weekday) ?? 0) + 1)
			longDays.set(discipline, counts)
		}
	}

	const days: Array<{ discipline: string; weekday: number; role: string }> = []
	for (const [discipline, perWeek] of [...weeks].sort(([a], [b]) =>
		a < b ? -1 : 1,
	)) {
		const tally = new Map<string, { count: number; first: string }>()
		for (const [week, set] of perWeek) {
			const key = [...set].sort((a, b) => a - b).join(',')
			const seen = tally.get(key)
			tally.set(key, {
				count: (seen?.count ?? 0) + 1,
				first: seen && seen.first < week ? seen.first : week,
			})
		}
		// Most weeks first; a tie goes to the set the plan held earliest.
		const [setKey] = [...tally].sort(
			([, a], [, b]) => b.count - a.count || (a.first < b.first ? -1 : 1),
		)[0]!
		const weekdays = setKey.split(',').map(Number)
		const longCounts = longDays.get(discipline)
		const longDay =
			[...(longCounts ?? [])]
				.filter(([weekday]) => weekdays.includes(weekday))
				.sort(([a, ac], [b, bc]) => bc - ac || b - a)[0]?.[0] ??
			weekdays.at(-1)!
		for (const weekday of weekdays) {
			days.push({
				discipline,
				weekday,
				role: weekday === longDay ? 'long' : 'ordinary',
			})
		}
	}

	try {
		await prisma.generationRecordDay.createMany({
			data: days.map((day) => ({
				recordId: outline.generationRecord.id,
				...day,
			})),
		})
	} catch (error) {
		// Two re-lays of one legacy plan can both find no days and both freeze
		// them; the unique (record, discipline, weekday) key turns the second
		// away. The days the first wrote are the plan's: read them back.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === 'P2002'
		) {
			return prisma.generationRecordDay.findMany({
				where: { recordId: outline.generationRecord.id },
				select: { discipline: true, weekday: true, role: true },
			})
		}
		throw error
	}
	return days
}
