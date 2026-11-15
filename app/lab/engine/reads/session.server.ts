/**
 * `session`: one session in full — its structure with targets in the
 * athlete's own zones, planned against actual and the verdict, how it felt,
 * the strength sets prescribed and logged, the recording, and what can be done
 * to it now.
 */
import { runAction } from '#app/actions/run.server.ts'
import { addDays } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { canMarkDone, MARK_DONE_REACH_DAYS } from '#app/utils/import-fit.ts'
import {
	describeStepTarget,
	type DisciplineThresholdMap,
	parseAuthoredIntensity,
} from '#app/utils/intensity-target.ts'
import { shortMinutes } from '#app/utils/juster.ts'
import {
	nbUnavailableReason,
	WORKOUT_DETAIL_LABELS,
} from '#app/utils/labels.ts'
import {
	getStrengthLogView,
	type LogRow,
} from '#app/utils/strength-log.server.ts'
import { getDisciplineThresholds } from '#app/utils/training.server.ts'
import {
	blockSentence,
	deriveWorkoutNotation,
	notationSentence,
	stepSentence,
	workoutToNotationInput,
	loadTargetText,
} from '#app/utils/workout-notation.ts'
import { resolveIntensity } from '#app/utils/zones/resolve.ts'
import { type CapabilityCtx } from '../define.ts'
import { nbBlockName, nbHours, nbLoadValueText } from '../nb.ts'
import {
	type Allowed,
	type RecordingSummary,
	type SessionBlock,
	type SessionCan,
	type SessionCard,
	type SessionOutput,
	type StepTarget,
	type StrengthExercise,
} from '../reads.types.ts'
import {
	actionCtxOf,
	done,
	maybe,
	num,
	readSessionCards,
	sportOf,
	todayOf,
	unknown,
	verdictOf,
	whyOf,
} from './shared.server.ts'

const workoutInclude = {
	blocks: {
		orderBy: { orderIndex: 'asc' as const },
		include: {
			steps: {
				orderBy: { orderIndex: 'asc' as const },
				include: {
					sets: { orderBy: { orderIndex: 'asc' as const } },
					exercise: { select: { id: true, name: true } },
				},
			},
		},
	},
}

/** A step's intensity, as written and as it comes out for this athlete. */
export function stepTarget(
	stored: string | null,
	discipline: string,
	thresholds: DisciplineThresholdMap,
): StepTarget | null {
	const target = parseAuthoredIntensity(stored)
	if (!target) return null
	const profile = thresholds[discipline]
	const display = describeStepTarget(target, profile ?? undefined)
	const resolved = resolveIntensity(
		target,
		profile ?? {
			lthr: null,
			maxHr: null,
			ftp: null,
			runPowerThresholdW: null,
			thresholdPaceSecPerKm: null,
			cssSecPer100m: null,
			zoneSystem: null,
			zoneOverrides: null,
		},
	)
	const range = (min?: number, max?: number) =>
		min == null && max == null ? null : { min: min ?? null, max: max ?? null }
	const pace = range(resolved.paceMin, resolved.paceMax)
	return {
		label: display.label,
		resolvedText: display.resolved,
		heartRate: range(resolved.hrMin, resolved.hrMax),
		power: range(resolved.powerMin, resolved.powerMax),
		pace: pace
			? { ...pace, unit: resolved.paceUnit === 'secPer100m' ? '100m' : 'km' }
			: null,
		approximate: display.approximate,
		why: resolved.unavailable
			? nbUnavailableReason(resolved.unavailable)
			: display.missingThreshold
				? nbUnavailableReason(display.missingThreshold)
				: null,
	}
}

/**
 * The notation marks a number worked out from the athlete's thresholds with
 * `*`; the read says that per target (`resolvedText`), so the line drops it.
 */
function plainNotation(text: string): string {
	return nbHours(
		text
			.replace(/\*/g, '')
			.replace(/\s{2,}/g, ' ')
			.trim(),
	)
}

const yes: Allowed = { allowed: true, why: null }
const no = (why: string): Allowed => ({ allowed: false, why })

/** What can be done to a session now, read off the domain's own rules. */
export function sessionCan(
	card: SessionCard,
	facts: {
		today: string
		hasWorkout: boolean
		hasStrengthSteps: boolean
		storedStatus: string
		markedDoneAt: Date | null
		hasLog: boolean
		plannedMinutes: number | null
		workoutDiscipline: string | null
	},
): SessionCan {
	const open = card.status === 'planned'
	const notOpen =
		card.status === 'done'
			? 'Økta er gjort.'
			: card.status === 'missed'
				? 'Dagen er passert; en økt som ikke ble gjort, flyttes ikke.'
				: 'En registrert økt uten plan kan ikke endres slik.'
	const isToday = card.date === facts.today
	const plannable = !facts.hasWorkout
		? no('Økta har ingen plan å endre.')
		: open
			? yes
			: no(notOpen)
	const todayOnly = (allowed: Allowed): Allowed =>
		!allowed.allowed
			? allowed
			: !isToday
				? no('Bare dagens økt kan endres slik.')
				: facts.hasLog || card.hasRecording
					? no('Økta er allerede i gang eller registrert.')
					: yes
	const short =
		facts.plannedMinutes == null
			? no('Økta har ingen tid å korte ned fra.')
			: shortMinutes(facts.plannedMinutes) == null
				? no('Økta er allerede kort.')
				: yes
	const markable = canMarkDone(
		{
			status: facts.storedStatus,
			hasRecording: card.hasRecording,
			workoutDiscipline: facts.workoutDiscipline,
			dayKey: card.date,
		},
		{
			todayKey: facts.today,
			reachFromKey: addDays(facts.today, -MARK_DONE_REACH_DAYS),
		},
	)
	return {
		move: plannable,
		swap: plannable,
		skip: plannable,
		shorten: todayOnly(plannable).allowed ? short : todayOnly(plannable),
		makeEasier: todayOnly(plannable),
		markDone: markable
			? yes
			: no(
					card.status === 'done'
						? 'Økta er allerede gjort.'
						: card.hasRecording
							? 'Økta er registrert fra klokka.'
							: facts.workoutDiscipline === 'strength'
								? 'Styrke føres sett for sett.'
								: card.date > facts.today
									? 'Dagen har ikke kommet ennå.'
									: !facts.hasWorkout
										? 'Økta har ingen plan.'
										: `Bare økter de siste ${MARK_DONE_REACH_DAYS} dagene kan merkes som gjort.`,
				),
		undoDone:
			facts.markedDoneAt &&
			facts.storedStatus === 'completed' &&
			!card.hasRecording
				? yes
				: no('Økta er ikke merket som gjort for hånd.'),
		logStrength: !facts.hasStrengthSteps
			? no('Økta har ingen styrkeøvelser.')
			: card.date > facts.today
				? no('Dagen har ikke kommet ennå.')
				: yes,
		rateFeeling:
			card.status === 'done' || card.status === 'recording-only'
				? yes
				: no('Si hvordan det kjentes når økta er gjort.'),
	}
}

function strengthSetOf(row: LogRow, warmup: boolean) {
	const prescribedLoad = row.prescribedLoad
	const resolved = row.resolvedLoad
	return {
		number: row.orderIndex + 1,
		role: row.logged?.role ?? (warmup ? 'warmup' : 'working'),
		prescribed:
			warmup && row.warmupRung
				? {
						reps: row.prescribedReps,
						durationS: row.prescribedDurationSec,
						loadText: `${row.warmupRung.targetKg} kg`,
						kg: maybe(row.warmupRung.targetKg, 'Ingen vekt.'),
					}
				: row.exerciseSetId || prescribedLoad || row.prescribedReps != null
					? {
							reps: row.prescribedReps,
							durationS: row.prescribedDurationSec,
							loadText: prescribedLoad
								? loadTargetText(prescribedLoad, resolved)
								: null,
							kg:
								resolved?.kind === 'resolved'
									? maybe(resolved.kg, 'Ingen vekt.')
									: unknown(
											prescribedLoad
												? 'Ingen referanse for løftet ennå (1RM eller makssett).'
												: 'Ingen vekt foreskrevet.',
										),
						}
					: null,
		logged: row.logged
			? {
					setLogId: row.logged.id,
					reps: row.logged.reps,
					durationS: row.logged.durationSec,
					kg: row.logged.effectiveKg,
					loadText: row.logged.load ? nbLoadValueText(row.logged.load) : null,
					repsInReserve: row.logged.rir,
					outcome: row.logged.outcome,
				}
			: null,
		lastTime: row.ghost
			? `${nbLoadValueText(row.ghost.load)}${row.ghost.reps != null ? ` × ${row.ghost.reps}` : ''}`
			: null,
	} satisfies StrengthExercise['sets'][number]
}

export async function readSession(
	ctx: CapabilityCtx,
	sessionId: string,
): Promise<SessionOutput | null> {
	const { rows, cards } = await readSessionCards(ctx, { id: sessionId })
	const row = rows[0]
	const card = cards[0]
	if (!row || !card) return null

	const actx = actionCtxOf(ctx)
	const [full, vsPlan, workout, recording, thresholds] = await Promise.all([
		runAction(actx, 'get_session', { sessionId }),
		runAction(actx, 'get_session_vs_plan', { sessionId }),
		row.workout?.id
			? prisma.workout.findUnique({
					where: { id: row.workout.id },
					include: workoutInclude,
				})
			: null,
		row.recording
			? prisma.activityImport.findUnique({
					where: { id: row.recording.id },
					select: {
						id: true,
						originPlatform: true,
						startedAt: true,
						durationSec: true,
						distanceM: true,
						hrAvg: true,
						hrMax: true,
						powerAvg: true,
						powerWeightedAvg: true,
						paceAvgSecPerKm: true,
						elevationGainM: true,
						tssValue: true,
					},
				})
			: null,
		getDisciplineThresholds(ctx.userId),
	])
	const detail = done(full)
	const vs = done(vsPlan)
	const hasStrengthSteps =
		workout?.blocks.some((b) => b.steps.some((s) => s.kind === 'strength')) ??
		false
	const strengthView = hasStrengthSteps
		? await getStrengthLogView(ctx.userId, sessionId)
		: null

	let structure: SessionBlock[] | null = null
	let summary: string | null = null
	if (workout) {
		// Block names the domain wrote in English (`Warm-up`, `Main set`) read
		// in Norwegian in the line and the name alike; the author's own stay.
		const named = {
			...workout,
			blocks: workout.blocks.map((block) => ({
				...block,
				name: nbBlockName(block.name, workout.discipline),
			})),
		}
		const notation = deriveWorkoutNotation(workoutToNotationInput(named), {
			thresholds,
		})
		summary = plainNotation(notationSentence(notation)) || null
		structure = named.blocks.map((block, bi) => {
			const nBlock = notation.blocks[bi]
			return {
				name: block.name,
				repeat: block.repeatCount,
				series: block.seriesRepeatCount ?? 1,
				restBetweenSeriesS:
					(block.seriesRepeatCount ?? 1) > 1
						? block.betweenSeriesRestSec
						: null,
				text: nBlock ? plainNotation(blockSentence(nBlock)) : '',
				steps: block.steps.map((step, si) => {
					const discipline = step.discipline ?? workout.discipline
					const nStep = nBlock?.steps[si]
					return {
						kind:
							step.kind === 'rest'
								? 'rest'
								: step.kind === 'strength'
									? 'strength'
									: 'work',
						sport: step.kind === 'rest' ? null : sportOf(discipline),
						durationS: step.durationSec,
						distanceM: step.distanceM,
						climbM: step.verticalM,
						target:
							step.kind === 'cardio'
								? stepTarget(step.intensity, discipline, thresholds)
								: null,
						exercise: step.exercise
							? { id: step.exercise.id, name: step.exercise.name }
							: null,
						sets: step.kind === 'strength' ? step.sets.length : null,
						restBetweenSetsS: step.restBetweenSetsSec,
						note: step.notes,
						text: nStep ? plainNotation(stepSentence(nStep)) : '',
					}
				}),
			}
		})
	}

	const strength: SessionOutput['strength'] = strengthView
		? (() => {
				const exercises: StrengthExercise[] = strengthView.exercises.map(
					(ex) => ({
						stepId: ex.stepId,
						exerciseId: ex.exerciseId,
						name: ex.name,
						restBetweenSetsS: ex.restBetweenSetsSec,
						oneSideAtATime: ex.unilateral,
						sets: [
							...ex.warmupRows.map((r) => strengthSetOf(r, true)),
							...ex.rows.map((r) => strengthSetOf(r, false)),
						],
					}),
				)
				const working = strengthView.exercises.flatMap((e) => e.rows)
				return {
					exercises,
					loggedSets: working.filter((r) => r.logged != null).length,
					prescribedSets: working.filter((r) => r.exerciseSetId != null).length,
				}
			})()
		: null

	const recordingSummary: RecordingSummary | null = recording
		? {
				id: recording.id,
				from: recording.originPlatform,
				startedAt: recording.startedAt.toISOString(),
				durationS: maybe(recording.durationSec, whyOf('not-resolved')),
				distanceM: maybe(recording.distanceM, 'Ingen distanse i opptaket.'),
				avgHeartRate: maybe(recording.hrAvg, 'Ingen puls i opptaket.'),
				maxHeartRate: maybe(recording.hrMax, 'Ingen puls i opptaket.'),
				avgPower: maybe(recording.powerAvg, 'Ingen watt i opptaket.'),
				normalizedPower: maybe(
					recording.powerWeightedAvg,
					'Ingen watt i opptaket.',
				),
				avgPace: maybe(recording.paceAvgSecPerKm, 'Ingen fart i opptaket.'),
				climbM: maybe(recording.elevationGainM, 'Ingen høydemeter i opptaket.'),
				load: maybe(recording.tssValue, whyOf('not-resolved')),
			}
		: null

	const plannedMinutes =
		card.planned.durationS.value != null
			? Math.round(card.planned.durationS.value / 60)
			: null
	const structureCall = vs?.structure
	const structureLabel = (
		key: 'as-prescribed' | 'diverged' | 'not-verifiable',
	) => WORKOUT_DETAIL_LABELS.structure[key].label

	return {
		...card,
		source: 'athlete',
		description: workout?.description ?? null,
		summary,
		structure,
		comparison: {
			load: { planned: num(vs?.tss.planned), actual: num(vs?.tss.actual) },
			durationS: {
				planned: num(vs?.durationS.planned),
				actual: num(vs?.durationS.actual),
			},
			distanceM: {
				planned: num(vs?.distanceM.planned),
				actual: num(vs?.distanceM.actual),
			},
			verdict:
				vs?.band.status === 'available'
					? verdictOf(vs.band.value, null)
					: card.verdict,
			structure:
				structureCall?.status === 'available'
					? {
							call:
								structureCall.value === 'as-prescribed'
									? 'as-planned'
									: 'diverged',
							label: structureLabel(structureCall.value),
							why: null,
						}
					: {
							call: null,
							label:
								structureCall?.status === 'unavailable' &&
								structureCall.reason === 'structure-not-verifiable'
									? structureLabel('not-verifiable')
									: null,
							why: structureCall
								? structureCall.status === 'unavailable'
									? whyOf(structureCall.reason)
									: null
								: whyOf('not-resolved'),
						},
			sinceLast: vs?.vsLast
				? {
						sessionId: vs.vsLast.sessionId,
						date: vs.vsLast.date,
						load: num(vs.vsLast.deltas.tss),
						durationS: num(vs.vsLast.deltas.durationS),
					}
				: null,
		},
		feeling: {
			rpe: detail?.rpe.status === 'available' ? detail.rpe.value : null,
			note: detail?.log?.text ?? null,
		},
		strength,
		recording: recordingSummary,
		can: sessionCan(card, {
			today: todayOf(ctx),
			hasWorkout: workout != null,
			hasStrengthSteps,
			storedStatus: row.status,
			markedDoneAt: row.markedDoneAt,
			hasLog: row.sessionLog != null,
			plannedMinutes,
			workoutDiscipline: workout?.discipline ?? null,
		}),
	}
}
