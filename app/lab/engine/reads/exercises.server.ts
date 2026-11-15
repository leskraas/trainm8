/**
 * `exercises` and `exercise`: the strength exercise library (the shared
 * corpus and the athlete's own), searched by any name a lift answers to, and
 * one exercise with the athlete's history, records and maxima on it.
 */
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { searchExercises } from '#app/utils/exercise-search.ts'
import { STRENGTH_RECORD_LABELS } from '#app/utils/labels.ts'
import { listExerciseAnchors } from '#app/utils/strength-anchors.server.ts'
import { getExerciseHistoryView } from '#app/utils/strength-records.server.ts'
import { type CapabilityCtx } from '../define.ts'
import { type ExerciseOutput, type ExercisesOutput } from '../reads.types.ts'
import { known, maybe, unknown } from './shared.server.ts'

export async function readExercises(
	ctx: CapabilityCtx,
	{ query, offset, limit }: { query: string; offset: number; limit: number },
): Promise<ExercisesOutput> {
	const [catalog, used] = await Promise.all([
		prisma.exercise.findMany({
			where: {
				OR: [{ authorship: 'system' }, { createdByAthleteId: ctx.userId }],
			},
			select: {
				id: true,
				name: true,
				primaryMuscle: true,
				equipment: true,
				createdByAthleteId: true,
				aliases: {
					where: { variantId: null },
					select: { text: true, locale: true },
					orderBy: { text: 'asc' },
				},
			},
			orderBy: [{ name: 'asc' }],
		}),
		prisma.exerciseSetLog.groupBy({
			by: ['exerciseId', 'sessionId'],
			where: { session: { userId: ctx.userId }, exerciseId: { not: null } },
		}),
	])
	const timesLogged = new Map<string, number>()
	for (const row of used) {
		if (!row.exerciseId) continue
		timesLogged.set(row.exerciseId, (timesLogged.get(row.exerciseId) ?? 0) + 1)
	}
	const hits = searchExercises(catalog, query.trim())
	const page = hits.slice(offset, offset + limit)
	return {
		query,
		total: hits.length,
		nextCursor: offset + limit < hits.length ? String(offset + limit) : null,
		exercises: page.map(({ exercise, alias }) => ({
			id: exercise.id,
			name: exercise.name,
			alias,
			ownExercise: exercise.createdByAthleteId === ctx.userId,
			primaryMuscle: exercise.primaryMuscle,
			equipment: exercise.equipment,
			timesLogged: timesLogged.get(exercise.id) ?? 0,
		})),
	}
}

export async function readExercise(
	ctx: CapabilityCtx,
	exerciseId: string,
): Promise<ExerciseOutput | null> {
	const [row, view, anchors] = await Promise.all([
		prisma.exercise.findFirst({
			where: {
				id: exerciseId,
				OR: [{ authorship: 'system' }, { createdByAthleteId: ctx.userId }],
			},
			select: {
				id: true,
				name: true,
				primaryMuscle: true,
				equipment: true,
				unilateral: true,
				createdByAthleteId: true,
			},
		}),
		getExerciseHistoryView(ctx.userId, exerciseId, { now: ctx.now }),
		listExerciseAnchors(ctx.userId, exerciseId),
	])
	if (!row || !view) return null
	const day = (d: Date) => localDate(d, ctx.timezone)
	const e1rm = view.records.find((r) => r.kind === 'e1RM' && r.unit === 'kg')
	return {
		id: row.id,
		name: row.name,
		primaryMuscle: row.primaryMuscle,
		equipment: row.equipment,
		oneSideAtATime: row.unilateral,
		ownExercise: row.createdByAthleteId === ctx.userId,
		anchors: anchors.map((a) => ({
			kind: a.construct,
			kg: a.valueKg,
			reps: a.reps,
			at: a.effectiveAtISO,
		})),
		history: view.sessions.map((s) => ({
			sessionId: s.sessionId,
			date: day(s.performedAt),
			workingSets: s.workingSetCount,
			topSetKg: maybe(
				s.topSetKg,
				'Ikke en vekt på stang (kroppsvekt, strikk eller nivå).',
			),
			topSetText: s.topSetText,
		})),
		lastTime: view.lastTime
			? {
					sessionId: view.lastTime.sessionId,
					date: day(view.lastTime.performedAt),
					topSetText: view.lastTime.topSetText,
				}
			: null,
		records: view.records.map((r) => ({
			label:
				r.kind === 'repMax' && r.reps != null
					? STRENGTH_RECORD_LABELS.repMax(r.reps, null)
					: r.kind === 'e1RM'
						? STRENGTH_RECORD_LABELS.estimatedOneRm
						: STRENGTH_RECORD_LABELS.heaviest,
			text: `${r.value.toLocaleString('nb-NO')} ${r.unit === 'kg' ? 'kg' : 'nivå'}`,
			date: day(r.achievedAt),
		})),
		estimatedOneRepMax: e1rm
			? known(e1rm.value)
			: unknown(
					view.sessions.length === 0
						? 'Ingen sett logget ennå.'
						: 'Ikke anslått: ingen sett egner seg til å regne ut 1RM.',
				),
	}
}
