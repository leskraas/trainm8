import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import { recomputePlannedTssForSession } from './load/planned-tss.server.ts'
import { triggerRecomputeForSession } from './session-log.server.ts'
import { deriveWorkoutTitle } from './session-title.ts'
import {
	type ExerciseSet,
	type IntensityTarget,
	type WorkoutAuthoringInput,
	type WorkoutStep,
	type WorkoutStructure,
	WorkoutStructureSchema,
	restSpecDurationSec,
	restStepSpec,
} from './workout-schema.ts'
import {
	resolveIntensity,
	type DisciplineProfileForResolver,
	type ResolvedIntensity,
} from './zones/index.ts'

/**
 * The legacy `weightKg`/`pct1RM` projection of an authored **Load Target**.
 * Two of the six load kinds have a scalar column to land in; the other four —
 * a rep-max reference, bodyweight, % bodyweight, a bar velocity — have none,
 * and leaving them null is the honest answer rather than converting them into
 * a kilo nobody stated (#450).
 */
function legacyLoadColumns(set: ExerciseSet) {
	if (set.load == null) {
		return { weightKg: set.weightKg ?? null, pct1RM: set.pct1RM ?? null }
	}
	if (set.load.kind === 'absolute') {
		return { weightKg: set.load.kg, pct1RM: null }
	}
	if (set.load.kind === 'pct1RM') {
		return { weightKg: null, pct1RM: set.load.minPct }
	}
	return { weightKg: null, pct1RM: null }
}

function buildSetCreate(set: ExerciseSet) {
	return {
		orderIndex: set.orderIndex,
		kind: set.kind,
		load: set.load != null ? JSON.stringify(set.load) : null,
		...legacyLoadColumns(set),
		effortCap: set.effortCap != null ? JSON.stringify(set.effortCap) : null,
		tempo: set.tempo ?? null,
		reps: set.kind === 'reps' ? set.reps : null,
		durationSec: set.kind === 'timed' ? set.durationSec : null,
		terminationRir: set.kind === 'toRir' ? set.terminationRir : null,
		velocityLossPct: set.kind === 'velocityLoss' ? set.velocityLossPct : null,
	}
}

function buildStepCreate(step: WorkoutStep, stepIndex: number) {
	const base = { orderIndex: stepIndex }

	if (step.kind === 'cardio') {
		return {
			...base,
			kind: 'cardio',
			discipline: step.discipline,
			intensity: step.intensity != null ? JSON.stringify(step.intensity) : null,
			durationSec: step.durationSec ?? null,
			distanceM: step.distanceM ?? null,
			verticalM: step.verticalM ?? null,
			gradePct: step.gradePct ?? null,
			cadenceRpmMin: step.cadenceRpmMin ?? null,
			cadenceRpmMax: step.cadenceRpmMax ?? null,
			notes: step.notes ?? null,
		}
	}

	if (step.kind === 'strength') {
		return {
			...base,
			kind: 'strength',
			discipline: step.discipline ?? null,
			exerciseId: step.exerciseId,
			restBetweenSetsSec: step.restBetweenSetsSec ?? null,
			notes: step.notes ?? null,
			sets: { create: step.sets.map(buildSetCreate) },
		}
	}

	// rest. `durationSec` is the projection of a `time` Rest Spec and nothing
	// else: a send-off, an HR recovery, a distance or an act has no duration to
	// put there, and writing a guess into the column every duration reader
	// trusts is exactly the fabrication ADR 0008 forbids.
	const spec = restStepSpec(step)
	return {
		...base,
		kind: 'rest',
		rest: spec != null ? JSON.stringify(spec) : null,
		durationSec: restSpecDurationSec(spec),
		notes: step.notes ?? null,
	}
}

/**
 * Build the nested Prisma `blocks.create` payload from a workout's structural
 * blocks. Shared by the authoring paths (which pass `WorkoutAuthoringInput`
 * blocks) and detection materialization (which passes the identically-shaped
 * `WorkoutStructure` blocks), so a detected structure persists into a real
 * Workout with no translation (ADR 0032).
 */
export function buildBlocksCreate(blocks: WorkoutStructure['blocks']) {
	return blocks.map((block, blockIndex) => ({
		name: block.name ?? null,
		orderIndex: blockIndex,
		repeatCount: block.repeatCount,
		seriesRepeatCount: block.seriesRepeatCount ?? 1,
		betweenSeriesRestSec: block.betweenSeriesRestSec ?? null,
		sendOff: block.sendOff != null ? JSON.stringify(block.sendOff) : null,
		steps: {
			create: block.steps.map(buildStepCreate),
		},
	}))
}

/**
 * Everything a **Workout deep copy** has to carry: the envelope, its blocks, their
 * steps and each strength step's sets. Exported so a caller can select a source
 * once and copy it many times — stamping a pattern across twelve weeks reads each
 * fixed day's Workout once and writes twelve copies of it.
 *
 * `exerciseId` is a **shared reference and not copied**: an Exercise is a catalog
 * entry, so two sessions pressing the same barbell press point at the same row.
 * The six resolved `intensity*` columns travel with the copy because they are a
 * cache of the athlete's thresholds at write time, and a copy that dropped them
 * would read as "unresolvable" until the next threshold change refilled it.
 */
export const workoutCopySelect = {
	id: true,
	title: true,
	description: true,
	discipline: true,
	intent: true,
	visibility: true,
	blocks: {
		orderBy: { orderIndex: 'asc' as const },
		select: {
			name: true,
			orderIndex: true,
			repeatCount: true,
			seriesRepeatCount: true,
			betweenSeriesRestSec: true,
			sendOff: true,
			steps: {
				orderBy: { orderIndex: 'asc' as const },
				select: {
					kind: true,
					notes: true,
					orderIndex: true,
					discipline: true,
					intensity: true,
					durationSec: true,
					distanceM: true,
					verticalM: true,
					gradePct: true,
					cadenceRpmMin: true,
					cadenceRpmMax: true,
					rest: true,
					exerciseId: true,
					restBetweenSetsSec: true,
					intensityHrMin: true,
					intensityHrMax: true,
					intensityPowerMin: true,
					intensityPowerMax: true,
					intensityPaceMin: true,
					intensityPaceMax: true,
					sets: {
						orderBy: { orderIndex: 'asc' as const },
						select: {
							orderIndex: true,
							kind: true,
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
				},
			},
		},
	},
} satisfies Prisma.WorkoutSelect

export type CopyableWorkout = Prisma.WorkoutGetPayload<{
	select: typeof workoutCopySelect
}>

/**
 * The nested `blocks.create` payload for a **copy** — the row-level counterpart to
 * {@link buildBlocksCreate}.
 *
 * A second builder rather than a reuse, and the difference is the direction of
 * travel. `buildBlocksCreate` takes the *authoring* shape, where `intensity` is a
 * parsed `IntensityTarget` and the resolved columns do not exist yet. A copy starts
 * from **stored rows**, so routing it through the authoring shape would mean
 * re-parsing `intensity` out of JSON and writing it back — which silently drops any
 * value the current schema cannot parse (a legacy plain-string target, say) and
 * loses the resolved cache besides. A copy that quietly differs from its source is
 * the one thing this function may not do, so it copies columns.
 */
export function buildBlocksCopy(blocks: CopyableWorkout['blocks']) {
	return blocks.map((block) => ({
		name: block.name,
		orderIndex: block.orderIndex,
		repeatCount: block.repeatCount,
		seriesRepeatCount: block.seriesRepeatCount,
		betweenSeriesRestSec: block.betweenSeriesRestSec,
		sendOff: block.sendOff,
		steps: {
			create: block.steps.map((step) => ({
				kind: step.kind,
				notes: step.notes,
				orderIndex: step.orderIndex,
				discipline: step.discipline,
				intensity: step.intensity,
				durationSec: step.durationSec,
				distanceM: step.distanceM,
				verticalM: step.verticalM,
				gradePct: step.gradePct,
				cadenceRpmMin: step.cadenceRpmMin,
				cadenceRpmMax: step.cadenceRpmMax,
				rest: step.rest,
				// A reference, never a copy: the Exercise catalog is shared.
				exerciseId: step.exerciseId,
				restBetweenSetsSec: step.restBetweenSetsSec,
				intensityHrMin: step.intensityHrMin,
				intensityHrMax: step.intensityHrMax,
				intensityPowerMin: step.intensityPowerMin,
				intensityPowerMax: step.intensityPowerMax,
				intensityPaceMin: step.intensityPaceMin,
				intensityPaceMax: step.intensityPaceMax,
				sets: {
					create: step.sets.map((set) => ({
						orderIndex: set.orderIndex,
						kind: set.kind,
						load: set.load,
						weightKg: set.weightKg,
						pct1RM: set.pct1RM,
						effortCap: set.effortCap,
						tempo: set.tempo,
						reps: set.reps,
						durationSec: set.durationSec,
						terminationRir: set.terminationRir,
						velocityLossPct: set.velocityLossPct,
					})),
				},
			})),
		},
	}))
}

/**
 * Write a **fresh, independent Workout** with the same content as `source`.
 *
 * This is the fact stamping rests on (ADR 0044 §6). `Workout.sessions` is
 * one-to-many, so sharing one Workout across stamped weeks would make editing
 * Wednesday in week 2 edit weeks 1, 3 and 4 with it. A copy per session is what
 * makes "editing one week never touches its siblings" true rather than
 * aspirational — and it is why a stamped session is an *ordinary* session
 * afterwards, with nothing pointing back at the pattern that produced it.
 *
 * Takes the already-read `source` rather than an id so one read can fund many
 * copies, and takes a transaction client so the copy and whatever hangs off it
 * commit together. `overrides` exists for the two cases where a copy is not
 * verbatim: a **scaled** shape, whose title would otherwise name a distance the
 * copy no longer prescribes, and a **fork**, which records where it came from.
 *
 * `authorship` is never copied. A copy is written by the athlete who asked for
 * it, so it takes the column's `'athlete'` default even when its source is a
 * **Stock Workout** — which is the whole point of forking rather than editing in
 * place (ADR 0051 §5).
 */
export async function copyWorkout(
	tx: Prisma.TransactionClient,
	source: CopyableWorkout,
	ownerId: string,
	overrides: {
		title?: string
		blocks?: CopyableWorkout['blocks']
		/**
		 * The **fork-on-write back-pointer** (ADR 0051 §5) — the row this copy was
		 * taken from. Left unset by stamping and copy-week, whose copies are not
		 * forks of anything an athlete can navigate back to.
		 */
		copiedFromId?: string
	} = {},
): Promise<{ id: string }> {
	return tx.workout.create({
		data: {
			title: overrides.title ?? source.title,
			description: source.description,
			discipline: source.discipline,
			intent: source.intent,
			// `visibility` is **not** copied, and since #452 that is load-bearing
			// rather than tidy. Publishing is an act with an **Attribution** attached
			// (ADR 0052); a copy that inherited `public` would be a community row
			// nobody published, credited to nobody, that no moderator could find by
			// the report on the row it was forked from. So a copy is `private` and
			// its owner publishes it themselves or not at all — which also closes
			// #440's propagation half for the one value that could do harm.
			ownerId,
			copiedFromId: overrides.copiedFromId,
			blocks: { create: buildBlocksCopy(overrides.blocks ?? source.blocks) },
		},
		select: { id: true },
	})
}

/**
 * How far a lineage walk will follow `copiedFromId` before giving up. The cap
 * guards against a cycle the schema cannot forbid — SQLite's CHECK can only rule
 * out a row pointing at itself, never a longer loop. Lives here, with the writes
 * that create lineage, and is read by `catalogue.server.ts` for the walk that
 * resolves a Citation.
 */
export const MAX_LINEAGE_HOPS = 16

/**
 * The `copiedFromId` chain above `workoutId`, nearest ancestor first — the
 * preserved pre-edit Workout an adoption left behind (#460), then whatever *it*
 * was forked from (a **Catalogue** row, ADR 0051 §5), and so on.
 *
 * Read before anything is deleted: the head of the chain holds the only pointer
 * to the first ancestor, so deleting it first would strand the rest.
 */
async function lineageAncestorIds(
	tx: Prisma.TransactionClient,
	workoutId: string,
): Promise<string[]> {
	const ids: string[] = []
	const seen = new Set<string>([workoutId])
	let currentId: string | null = workoutId

	for (let hop = 0; hop < MAX_LINEAGE_HOPS && currentId != null; hop++) {
		const row: { copiedFromId: string | null } | null =
			await tx.workout.findUnique({
				where: { id: currentId },
				select: { copiedFromId: true },
			})
		const next: string | null = row?.copiedFromId ?? null
		if (next == null || seen.has(next)) break
		seen.add(next)
		ids.push(next)
		currentId = next
	}
	return ids
}

/**
 * Delete the Workouts a just-deleted session's lineage leaves orphaned.
 *
 * The preserved pre-edit Workout an adoption forks away from (#460) is
 * deliberately **not** the session's own `workoutId`, and `copiedFromId` is
 * `SetNull` rather than `Cascade` — so nothing reaches it once the session is
 * gone. The retention rule this implements: *the preserved row survives every
 * later edit and dies with the session it belonged to.*
 *
 * Each ancestor is deleted only when it is genuinely orphaned **and** genuinely
 * the athlete's. The guards are not paranoia — `copiedFromId` is the same field
 * a **Catalogue** fork uses (ADR 0051 §5), so an unguarded walk up the chain
 * would delete corpus content out from under every other athlete the moment one
 * of them deleted one session.
 */
async function deleteOrphanedLineage(
	tx: Prisma.TransactionClient,
	ancestorIds: readonly string[],
	userId: string,
) {
	for (const id of ancestorIds) {
		const row = await tx.workout.findUnique({
			where: { id },
			select: {
				ownerId: true,
				authorship: true,
				catalogueEntry: { select: { id: true } },
				_count: {
					select: {
						sessions: true,
						patternDays: true,
						copies: true,
						catalogueSaves: true,
					},
				},
			},
		})
		if (!row) continue
		// In the Catalogue, or trainm8's own, or somebody else's: not ours to
		// collect. A Catalogue Entry is retired, never deleted.
		if (row.catalogueEntry || row.authorship !== 'athlete') break
		if (row.ownerId !== userId) break
		// Still referenced by anything at all — a sibling session, a Week Pattern
		// slot, another fork, somebody's list — so it is not an orphan.
		const { sessions, patternDays, copies, catalogueSaves } = row._count
		if (sessions + patternDays + copies + catalogueSaves > 0) break

		await tx.workout.delete({ where: { id } })
	}
}

export async function deleteWorkoutSession(userId: string, sessionId: string) {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, workoutId: true },
	})

	if (!session) return null

	return prisma.$transaction(async (tx) => {
		await tx.workoutSession.delete({ where: { id: session.id } })
		if (session.workoutId) {
			const ancestorIds = await lineageAncestorIds(tx, session.workoutId)
			await tx.workout.delete({ where: { id: session.workoutId } })
			await deleteOrphanedLineage(tx, ancestorIds, userId)
		}
		return { id: session.id }
	})
}

/**
 * Record a miss: mark a planned session `missed` — the minimal athlete-facing
 * Session Status transition (#186, PRD #163). Owner-scoped and non-destructive:
 * only the stored status changes (the prescription and any Session Log stay
 * untouched). Only valid while the session is still `scheduled`: a completed
 * session can never be marked, and re-marking an already-missed/skipped one is
 * rejected rather than re-firing the recompute. Recording the miss fires the
 * same load-recompute path logging a session does (ADR 0008), which runs the
 * Session Nudge applier — so a recorded key miss eases the next planned cardio
 * session at the moment it is recorded, never on a GET.
 *
 * Returns `null` when the session doesn't exist (or isn't the caller's), and
 * `{ marked: false }` when its status can't take the transition.
 */
export async function markSessionMissed(userId: string, sessionId: string) {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, status: true },
	})
	if (!session) return null
	if (session.status !== 'scheduled') return { marked: false as const }

	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { status: 'missed' },
	})
	await triggerRecomputeForSession(session.id, { clampFutureToToday: true })
	return { marked: true as const }
}

export async function getWorkoutSessionForEdit(
	userId: string,
	sessionId: string,
) {
	return prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			id: true,
			scheduledAt: true,
			status: true,
			source: true,
			workout: {
				select: {
					id: true,
					title: true,
					discipline: true,
					intent: true,
					blocks: {
						orderBy: { orderIndex: 'asc' as const },
						select: {
							id: true,
							name: true,
							repeatCount: true,
							orderIndex: true,
							steps: {
								orderBy: { orderIndex: 'asc' as const },
								select: {
									id: true,
									kind: true,
									discipline: true,
									intensity: true,
									durationSec: true,
									distanceM: true,
									exerciseId: true,
									restBetweenSetsSec: true,
									notes: true,
									orderIndex: true,
									sets: {
										orderBy: { orderIndex: 'asc' as const },
										select: {
											id: true,
											kind: true,
											orderIndex: true,
											weightKg: true,
											pct1RM: true,
											reps: true,
											durationSec: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
}

/**
 * The two **Session Source** values that mark a machine-written prescription:
 * Plan Generation's output and Structure Detection's. These are the sessions
 * **Session Adoption** is about — an `authored` session was the athlete's from
 * the start and a `recorded` one has no prescription to take over.
 */
function isMachineWritten(source: string): boolean {
	return source === 'generated' || source === 'detected'
}

/**
 * A positional, order-insensitive-to-nothing fingerprint of a prescription's
 * blocks — the thing **Session Adoption** compares, so a save that changes
 * nothing structural is not a takeover (#459).
 *
 * Both sides are normalized through the *builders* rather than compared field by
 * field: `buildBlocksCreate` for what a save would write, `buildBlocksCopy` for
 * what is stored. That is what makes the comparison total. Every facet the
 * writers carry is in the fingerprint by construction, including the ones the
 * Conform-backed editor cannot round-trip (cadence, grade, vertical, rest form,
 * send-off, series, load) — and those are exactly the ones that matter, because
 * a save that silently drops a send-off *has* changed the prescription and
 * should preserve the row that still has it.
 *
 * `orderIndex` is deliberately absent: position in the array already carries the
 * order on both sides, and comparing the stored integers would report a change
 * for a gap that renders identically. The six resolved `intensity*` columns are
 * absent too — they are a cache of the athlete's thresholds at write time, not
 * part of what was prescribed.
 */
type FingerprintSet = {
	kind?: string
	load?: string | null
	weightKg?: number | null
	pct1RM?: number | null
	effortCap?: string | null
	tempo?: string | null
	reps?: number | null
	durationSec?: number | null
	terminationRir?: number | null
	velocityLossPct?: number | null
}

type FingerprintStep = {
	kind?: string
	notes?: string | null
	discipline?: string | null
	intensity?: string | null
	durationSec?: number | null
	distanceM?: number | null
	verticalM?: number | null
	gradePct?: number | null
	cadenceRpmMin?: number | null
	cadenceRpmMax?: number | null
	rest?: string | null
	exerciseId?: string | null
	restBetweenSetsSec?: number | null
	sets?: { create: readonly FingerprintSet[] }
}

type FingerprintBlock = {
	name?: string | null
	repeatCount?: number
	seriesRepeatCount?: number
	betweenSeriesRestSec?: number | null
	sendOff?: string | null
	steps: { create: readonly FingerprintStep[] }
}

export function prescriptionFingerprint(
	blocks: readonly FingerprintBlock[],
): string {
	return JSON.stringify(
		blocks.map((block) => [
			block.name ?? null,
			block.repeatCount ?? 1,
			block.seriesRepeatCount ?? 1,
			block.betweenSeriesRestSec ?? null,
			block.sendOff ?? null,
			block.steps.create.map((step) => [
				step.kind ?? null,
				step.notes ?? null,
				step.discipline ?? null,
				step.intensity ?? null,
				step.durationSec ?? null,
				step.distanceM ?? null,
				step.verticalM ?? null,
				step.gradePct ?? null,
				step.cadenceRpmMin ?? null,
				step.cadenceRpmMax ?? null,
				step.rest ?? null,
				step.exerciseId ?? null,
				step.restBetweenSetsSec ?? null,
				(step.sets?.create ?? []).map((set) => [
					set.kind ?? null,
					set.load ?? null,
					set.weightKg ?? null,
					set.pct1RM ?? null,
					set.effortCap ?? null,
					set.tempo ?? null,
					set.reps ?? null,
					set.durationSec ?? null,
					set.terminationRir ?? null,
					set.velocityLossPct ?? null,
				]),
			]),
		]),
	)
}

/**
 * Did this save actually change the **prescription** — the blocks, the
 * Discipline, or the Workout intent?
 *
 * Title and **Scheduled At (UTC)** are deliberately outside it. Moving a
 * detected session from Sunday to Saturday, or renaming it, is not taking over
 * what the engine read from the recording, and treating it as one is the whole
 * of #459 — an athlete lost re-detection on their own recording by rescheduling
 * it. A rename does write the new title onto the machine-written row in place;
 * that is the one envelope field the engine itself rewrites on every
 * re-detection (`deriveWorkoutTitle`), so preserving a pre-rename copy would
 * preserve nothing an athlete could ever diff.
 */
function prescriptionChanged(
	previous: CopyableWorkout,
	input: WorkoutAuthoringInput,
): boolean {
	if (previous.discipline !== input.discipline) return true
	if (previous.intent !== input.intent) return true
	return (
		prescriptionFingerprint(buildBlocksCopy(previous.blocks)) !==
		prescriptionFingerprint(buildBlocksCreate(input.blocks))
	)
}

/**
 * Save an edit to a Workout Session, forking the prescription on **first
 * adoption** rather than overwriting it.
 *
 * Two axes, not one (#460, resolving #458). **Origin** — the Session Source —
 * never changes; **adoption** is `adoptedAt`, and it is stamped the first time a
 * save actually changes a machine-written prescription. A reschedule, a rename
 * and a no-op save all leave both alone, which is the fix for #459: re-detection
 * eligibility (`detected` and unadopted) survives moving a session to Saturday.
 *
 * **Fork-on-write.** The machine's Workout is never edited in place. The first
 * adopting save writes a *new* athlete-owned Workout from the athlete's input,
 * points the session at it, and records `copiedFromId` back at the row the
 * engine wrote — which is left exactly as it was found. That preserved row is
 * what makes the drawer's `90 min → 75 min` diff possible, and it diffs with the
 * same code that renders a workout, where a JSON snapshot would be a second
 * representation free to drift from the schema it mirrors.
 *
 * The direction matters: the *descendant* points at its source, so
 * `resolveCatalogueOrigin` walks one chain for both jobs the field does (ADR
 * 0051 §5) — a fork of a Catalogue row reaches its **Citation**, and an adopted
 * session reaches whatever its machine-written predecessor was itself copied
 * from. Copying the old row aside and editing the original in place would put
 * the preserved row *off* that chain, unreachable from the session.
 *
 * Every later edit of an adopted session is an ordinary in-place rewrite: the
 * Workout it now points at is the athlete's own, and forking again would grow a
 * chain of intermediate drafts nothing reads.
 */
export async function updateWorkoutSession(
	userId: string,
	sessionId: string,
	input: WorkoutAuthoringInput,
) {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: {
			id: true,
			source: true,
			adoptedAt: true,
			workout: { select: workoutCopySelect },
		},
	})

	if (!session) return null

	const previous = session.workout
	const adopting =
		previous != null &&
		session.adoptedAt == null &&
		isMachineWritten(session.source) &&
		prescriptionChanged(previous, input)

	const updated = await prisma.$transaction(async (tx) => {
		let workoutId = previous?.id ?? null

		if (previous && adopting) {
			const forked = await tx.workout.create({
				data: {
					title: input.title,
					// The envelope the authoring input has no field for travels across
					// unchanged: a fork that dropped the description would read as the
					// athlete having deleted it.
					description: previous.description,
					discipline: input.discipline,
					intent: input.intent,
					// `visibility` is not carried either, for the reason `copyWorkout`
					// gives: publishing is an act, and an adopted session is not one
					// (ADR 0052).
					// `authorship` is not carried: the fork is the athlete's own writing
					// and takes the column's `'athlete'` default (ADR 0051 §5).
					ownerId: userId,
					copiedFromId: previous.id,
					blocks: { create: buildBlocksCreate(input.blocks) },
				},
				select: { id: true },
			})
			workoutId = forked.id
		} else if (previous) {
			await tx.workoutBlock.deleteMany({ where: { workoutId: previous.id } })
			await tx.workout.update({
				where: { id: previous.id },
				data: {
					title: input.title,
					discipline: input.discipline,
					intent: input.intent,
					blocks: { create: buildBlocksCreate(input.blocks) },
				},
			})
		}

		return tx.workoutSession.update({
			where: { id: session.id },
			data: {
				scheduledAt: input.scheduledAt,
				// The athlete rewrote the prescription, so a Replan Note explaining
				// the old one is stale — cleared (ADR 0025 §4). The WeekReplan row
				// stands untouched: at-most-once lives there, not in the notes.
				replanReason: null,
				// Session Adoption, and nothing else. `source` keeps its origin value
				// for the life of the session: a Generated Session stays `generated`
				// and is protected from regeneration by `adoptedAt` instead (ADR
				// 0016), and a `detected` session stays `detected` while its retained
				// Structure Detection keeps feeding Structure Adherence (ADR 0033/0034).
				...(adopting && workoutId != null
					? { workoutId, adoptedAt: new Date() }
					: {}),
			},
			select: { id: true },
		})
	})

	// The prescription changed, so the Planned TSS it implies did too (ADR 0019).
	await recomputePlannedTssForSession(userId, session.id)

	return updated
}

export async function createWorkoutSession(
	userId: string,
	input: WorkoutAuthoringInput,
) {
	const session = await prisma.$transaction(async (tx) => {
		const workout = await tx.workout.create({
			data: {
				title: input.title,
				discipline: input.discipline,
				intent: input.intent,
				ownerId: userId,
				blocks: { create: buildBlocksCreate(input.blocks) },
			},
			select: { id: true },
		})

		return tx.workoutSession.create({
			data: {
				userId,
				workoutId: workout.id,
				scheduledAt: input.scheduledAt,
				status: 'scheduled',
			},
			select: { id: true },
		})
	})

	// Materialize the new session's Planned TSS up front (ADR 0019).
	await recomputePlannedTssForSession(userId, session.id)

	return session
}

/**
 * Parse a stored `WorkoutDetection.structureJson` back into the validated
 * `WorkoutStructure` shape. Tolerant of a malformed/legacy blob — degrades to
 * `null` (no materialization), never throws.
 */
export function parseStoredWorkoutStructure(
	structureJson: string,
): WorkoutStructure | null {
	try {
		const parsed = WorkoutStructureSchema.safeParse(JSON.parse(structureJson))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/**
 * Materialize a Structure Detection onto a recording-only session as its
 * Workout, marking the Session Source `detected` (ADR 0032/0033). Called by the
 * structure-detection job when a detection clears the honesty gate and its
 * import is already promoted to a recording-only session.
 *
 * The authoring envelope the structural schema omits (`title`, `intent`) is
 * synthesized: it carries no analytic weight — a `detected` session never
 * computes Planned TSS (ADR 0034), so `intent` never feeds load — and the
 * "detected · (confidence)" badge, not the intent label, is the provenance
 * signal on the Workout Detail View.
 *
 * Idempotent and non-destructive: a session that already carries a Workout is
 * left untouched (a re-run of the detection job never double-materializes, and
 * an athlete's adopted edits are never overwritten). Deliberately does NOT
 * recompute Planned TSS — the guard in `planned-tss.server.ts` keeps it null
 * for `detected` sessions regardless, but skipping the call avoids the churn.
 */
export async function materializeDetectedStructure(
	ownerId: string,
	sessionId: string,
	structure: WorkoutStructure,
): Promise<{ materialized: boolean }> {
	return prisma.$transaction(async (tx) => {
		const session = await tx.workoutSession.findFirst({
			where: { id: sessionId, userId: ownerId },
			select: { id: true, workoutId: true },
		})
		if (!session || session.workoutId) return { materialized: false }

		const workout = await tx.workout.create({
			data: {
				title: deriveWorkoutTitle(structure),
				discipline: structure.discipline,
				intent: 'endurance',
				ownerId,
				blocks: { create: buildBlocksCreate(structure.blocks) },
			},
			select: { id: true },
		})

		// Compare-and-swap the attach: only claim a session that is still
		// structureless. If a concurrent materialize (the job racing the promotion
		// path, or an overlapping retry) already attached a Workout, we lost — roll
		// back our now-orphaned Workout rather than clobbering theirs.
		const { count } = await tx.workoutSession.updateMany({
			where: { id: session.id, workoutId: null },
			data: { workoutId: workout.id, source: 'detected' },
		})
		if (count === 0) {
			await tx.workout.delete({ where: { id: workout.id } })
			return { materialized: false }
		}

		return { materialized: true }
	})
}

/**
 * Replace a `detected` session's materialized Workout with a freshly re-detected
 * structure (#357 — ADR 0032's engine-version re-detection). Called by the
 * structure-detection job when a re-run over an already-`detected` session yields
 * new structure: the version-aware backfill after an `analyze` change, or the
 * manual "Re-run detection" control.
 *
 * Strictly guarded so the athlete's edits stay sacred — it only ever touches a
 * session that is still `detected` **and still unadopted**. Adoption is the
 * guard, not the origin (#460): a `detected` session that the athlete has taken
 * over keeps its origin value, so a guard on `source` alone would now rebuild the
 * very edits it used to protect. Any `generated`/`recorded` session is likewise
 * left untouched. The swap repoints the session to the new Workout first, then
 * deletes the superseded one (whose blocks/steps/sets cascade): deleting the old
 * Workout while the session still referenced it would take the session down with
 * it (the `workoutId` FK is `onDelete: Cascade`).
 */
export async function replaceDetectedStructure(
	ownerId: string,
	sessionId: string,
	structure: WorkoutStructure,
): Promise<{ replaced: boolean }> {
	return prisma.$transaction(async (tx) => {
		const session = await tx.workoutSession.findFirst({
			where: {
				id: sessionId,
				userId: ownerId,
				source: 'detected',
				adoptedAt: null,
			},
			select: { id: true, workoutId: true },
		})
		if (!session) return { replaced: false }

		const workout = await tx.workout.create({
			data: {
				title: deriveWorkoutTitle(structure),
				discipline: structure.discipline,
				intent: 'endurance',
				ownerId,
				blocks: { create: buildBlocksCreate(structure.blocks) },
			},
			select: { id: true },
		})

		// Compare-and-swap on origin *and* adoption: only claim a session that is
		// still `detected` and still untaken. If it adopted between the read and
		// here, we lost the race — roll back the now-orphaned Workout rather than
		// clobber the edit.
		const { count } = await tx.workoutSession.updateMany({
			where: { id: session.id, source: 'detected', adoptedAt: null },
			data: { workoutId: workout.id },
		})
		if (count === 0) {
			await tx.workout.delete({ where: { id: workout.id } })
			return { replaced: false }
		}

		// The session now points at the new Workout, so the old one is unreferenced
		// and safe to delete (blocks/steps/sets cascade). Order matters: the FK is
		// `onDelete: Cascade`, so deleting it before the repoint would delete the
		// session too.
		if (session.workoutId && session.workoutId !== workout.id) {
			await tx.workout.delete({ where: { id: session.workoutId } })
		}

		return { replaced: true }
	})
}

/**
 * Revert a `detected` session to a structureless `recorded` one, removing its
 * materialized Workout (#357). Called when a re-detect over an already-`detected`
 * session now reads below the honesty gate — the stale structure must not outlive
 * the signal that justified it (mirroring the re-snapshot clear in the detection
 * job). Guarded to `detected` **and unadopted** sessions so an adopted one is
 * never stripped (#460); the Workout delete runs only after the session is
 * repointed to null, so the `onDelete: Cascade` FK never removes the session.
 *
 * This is the one place a Session Source is still rewritten, and it is not a
 * takeover: `detected` ⇄ `recorded` is the engine restating what it found about
 * its own recording as the structure materializes and is retracted. The athlete
 * never moves this column.
 */
export async function dematerializeDetectedStructure(
	ownerId: string,
	sessionId: string,
): Promise<{ cleared: boolean }> {
	return prisma.$transaction(async (tx) => {
		const session = await tx.workoutSession.findFirst({
			where: {
				id: sessionId,
				userId: ownerId,
				source: 'detected',
				adoptedAt: null,
			},
			select: { id: true, workoutId: true },
		})
		if (!session) return { cleared: false }

		const { count } = await tx.workoutSession.updateMany({
			where: { id: session.id, source: 'detected', adoptedAt: null },
			data: { workoutId: null, source: 'recorded' },
		})
		if (count === 0) return { cleared: false }

		if (session.workoutId) {
			await tx.workout.delete({ where: { id: session.workoutId } })
		}
		return { cleared: true }
	})
}

export async function getExerciseCatalog(userId: string) {
	return prisma.exercise.findMany({
		where: {
			OR: [{ createdByAthleteId: null }, { createdByAthleteId: userId }],
		},
		select: {
			id: true,
			name: true,
			primaryMuscle: true,
			equipment: true,
			isCompound: true,
			createdByAthleteId: true,
		},
		orderBy: [{ name: 'asc' }],
	})
}

/**
 * The exercise ids behind the athlete's most recent strength steps, most
 * recent first — the "Recent" group of the exercise combobox (ADR 0027 §8).
 * Purely derived at load time from the sessions the athlete already owns
 * (ordered by Scheduled At, newest first); no new stored state.
 */
export async function getRecentExerciseIds(userId: string, limit = 5) {
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			workout: {
				blocks: {
					some: {
						steps: { some: { kind: 'strength', exerciseId: { not: null } } },
					},
				},
			},
		},
		orderBy: { scheduledAt: 'desc' },
		// A window of recent sessions is plenty to fill the group; keeps the
		// traversal bounded for athletes with long histories.
		take: 25,
		select: {
			workout: {
				select: {
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: { kind: true, exerciseId: true },
							},
						},
					},
				},
			},
		},
	})

	const ids: string[] = []
	for (const session of sessions) {
		for (const block of session.workout?.blocks ?? []) {
			for (const step of block.steps) {
				if (
					step.kind === 'strength' &&
					step.exerciseId &&
					!ids.includes(step.exerciseId)
				) {
					ids.push(step.exerciseId)
					if (ids.length >= limit) return ids
				}
			}
		}
	}
	return ids
}

export async function createCustomExercise(
	userId: string,
	data: {
		name: string
		primaryMuscle: string
		equipment?: string
		isCompound?: boolean
	},
) {
	return prisma.exercise.create({
		data: {
			name: data.name,
			primaryMuscle: data.primaryMuscle,
			equipment: data.equipment ?? null,
			isCompound: data.isCompound ?? false,
			createdByAthleteId: userId,
		},
		select: { id: true, name: true },
	})
}

const EMPTY_INTENSITY_RANGES = {
	intensityHrMin: null as number | null,
	intensityHrMax: null as number | null,
	intensityPowerMin: null as number | null,
	intensityPowerMax: null as number | null,
	intensityPaceMin: null as number | null,
	intensityPaceMax: null as number | null,
}

function mapResolvedIntensity(
	r: ResolvedIntensity,
): typeof EMPTY_INTENSITY_RANGES {
	if (r.unavailable) return EMPTY_INTENSITY_RANGES
	return {
		intensityHrMin: r.hrMin ?? null,
		intensityHrMax: r.hrMax ?? null,
		intensityPowerMin: r.powerMin ?? null,
		intensityPowerMax: r.powerMax ?? null,
		intensityPaceMin: r.paceMin ?? null,
		intensityPaceMax: r.paceMax ?? null,
	}
}

function resolvedRangeFromIntensity(
	intensity: string | null,
	profile: DisciplineProfileForResolver,
): typeof EMPTY_INTENSITY_RANGES {
	if (!intensity) return EMPTY_INTENSITY_RANGES
	let target: IntensityTarget
	try {
		target = JSON.parse(intensity) as IntensityTarget
	} catch {
		return EMPTY_INTENSITY_RANGES
	}
	return mapResolvedIntensity(resolveIntensity(target, profile))
}

// Synchronous post-write hook: re-resolves cached intensity ranges for all
// of a user's cardio steps whenever their thresholds or zone system changes.
// SQLite + single-user hobby project → synchronous is acceptable here.
// In a multi-tenant/high-volume setup this would be enqueued as a background job.
export async function recomputeIntensityRanges(
	userId: string,
	discipline?: string,
) {
	const athleteProfile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: {
			disciplineProfiles: {
				where: discipline ? { discipline } : undefined,
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

	if (!athleteProfile) return

	// Find all workout steps for this user that are cardio steps with an intensity value
	const steps = await prisma.workoutStep.findMany({
		where: {
			kind: 'cardio',
			intensity: { not: null },
			block: {
				workout: {
					sessions: { some: { userId } },
				},
			},
			...(discipline ? { discipline } : {}),
		},
		select: {
			id: true,
			discipline: true,
			intensity: true,
		},
	})

	if (steps.length === 0) return

	const updates: Promise<unknown>[] = []
	for (const step of steps) {
		const profile = athleteProfile.disciplineProfiles.find(
			(p) => p.discipline === step.discipline,
		)
		if (!profile) continue

		const resolved = resolvedRangeFromIntensity(step.intensity, profile)
		updates.push(
			prisma.workoutStep.update({
				where: { id: step.id },
				data: resolved,
			}),
		)
	}

	await Promise.all(updates)
}

// Used when first writing a step — resolves intensity from the athlete's profile
// synchronously at write time (pre-populate cache).
export async function resolveStepIntensityForUser(
	userId: string,
	discipline: string,
	intensity: IntensityTarget,
): Promise<ReturnType<typeof resolvedRangeFromIntensity>> {
	const athleteProfile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: {
			disciplineProfiles: {
				where: { discipline },
				select: {
					lthr: true,
					maxHr: true,
					ftp: true,
					runPowerThresholdW: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
					zoneSystem: true,
					zoneOverrides: true,
				},
				take: 1,
			},
		},
	})

	const profile = athleteProfile?.disciplineProfiles[0]
	if (!profile) return EMPTY_INTENSITY_RANGES

	return mapResolvedIntensity(resolveIntensity(intensity, profile))
}

// Expose type for select queries that need step + resolved ranges
export type WorkoutStepSelect = Prisma.WorkoutStepSelect
