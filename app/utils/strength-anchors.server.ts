/**
 * The server half of the **exercise anchors**: read this athlete's
 * `ExerciseThreshold` rows, append new ones, and assemble what the estimator
 * reads.
 *
 * Split the way `strength-log.server.ts` is split from `strength-log.ts`
 * (ADR 0053 §2, ADR 0054 §4) — every rule about what a load *means*, what an
 * equation produces and how a reading is graded lives in the pure
 * `strength/anchors.ts` and `strength/one-rm.ts`. This file queries and writes.
 *
 * Four properties it exists to hold, none of which the pure layer can:
 *
 * **Append-only.** An anchor is never updated in place and never deleted. An
 * edit is a new row with a later `effectiveAt`, so a session from March still
 * reads against the anchor it was prescribed from after April's re-test. That is
 * the whole reason the as-of resolver exists, and the reason ADR 0054's
 * Consequences — which log `ThresholdEvent.effectiveAt` as written-and-never-read
 * — are not repeated here.
 *
 * **Ownership.** Every read and every write is scoped through
 * `AthleteProfile.userId`; an anchor is reachable only by its athlete.
 *
 * **The acceptance path re-runs the estimation.** The browser posts *which*
 * reading it is accepting, never the number: the engine is deterministic over
 * the same sets, so re-deriving is exact, and a value the engine would not
 * produce is refused with nothing written. `approveSeason`'s rule (ADR 0053 §2)
 * and `analyze.tsx`'s, on the strength side.
 *
 * **`athlete-stated` stores no grade.** The app does not grade a figure somebody
 * stated about themselves (ADR 0054), which the migration also enforces as
 * `protocol = 'athlete-stated' ⟹ confidence IS NULL`.
 */
import { prisma } from './db.server.ts'
import { type Anchor, type ResolveContext } from './strength/anchors.ts'
import {
	type EstimatorSet,
	type OneRmReading,
	estimateOneRm,
} from './strength/one-rm.ts'
import {
	type AnchorConfidence,
	type AnchorConstruct,
	type AnchorProtocol,
	type EstimatorName,
	type MovementPattern,
} from './strength-log.ts'
import { type LoadTarget, LoadTargetSchema } from './workout-schema.ts'

/**
 * **Which movements the corpus's rep↔load equations were actually fitted to.**
 *
 * Not a coverage gap to be filled in later by borrowing the bench press's curve:
 * Mayhew's own derivation is a bench press in 435 college students, Nuzzo 2024
 * needs *separate* `REPS ~ %1RM` tables for bench and leg press, and LeSuer 1997
 * found every equation significantly underestimated the **deadlift** — so `hinge`
 * is absent on evidence rather than on omission. Everything outside this list
 * refuses with `exercise-unmapped` and is pointed at a rep max instead.
 */
const VALIDATED_REP_LOAD_PATTERNS = [
	'squat',
	'horizontal-push',
] as const satisfies readonly MovementPattern[]

function hasValidatedRepLoadMapping(movementPattern: string | null): boolean {
	return (VALIDATED_REP_LOAD_PATTERNS as readonly string[]).includes(
		movementPattern ?? '',
	)
}

/** One stored `ExerciseThreshold`, as the pure layer's {@link Anchor} plus the
 * row's own identity — the id, when it was written, and the set it was read
 * from, so the surface can show a derivation after the fact. */
export type StoredAnchor = Anchor & {
	id: string
	createdAtISO: string
	sourceSetLogId: string | null
}

function toAnchor(row: {
	id: string
	construct: string
	valueKg: number
	reps: number | null
	protocol: string
	confidence: string | null
	effectiveAt: Date
	createdAt: Date
	sourceSetLogId: string | null
}): StoredAnchor {
	return {
		id: row.id,
		construct: row.construct as AnchorConstruct,
		valueKg: row.valueKg,
		reps: row.reps,
		protocol: row.protocol as AnchorProtocol,
		confidence: row.confidence as AnchorConfidence | null,
		effectiveAtISO: row.effectiveAt.toISOString(),
		createdAtISO: row.createdAt.toISOString(),
		sourceSetLogId: row.sourceSetLogId,
	}
}

const anchorSelect = {
	id: true,
	construct: true,
	valueKg: true,
	reps: true,
	protocol: true,
	confidence: true,
	effectiveAt: true,
	createdAt: true,
	sourceSetLogId: true,
} as const

/**
 * Every anchor this athlete has on this lift, newest first — **including the
 * superseded ones**, because the history is the point of an append-only table
 * and "my squat 1RM went 120 → 130 → 140" is a thing the athlete is owed.
 */
export async function listExerciseAnchors(
	userId: string,
	exerciseId: string,
): Promise<StoredAnchor[]> {
	const rows = await prisma.exerciseThreshold.findMany({
		where: { exerciseId, athleteProfile: { userId } },
		orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
		select: anchorSelect,
	})
	return rows.map(toAnchor)
}

/**
 * The context `resolveLoadTarget` needs for one lift, on one day: this athlete's
 * anchors for it and their bodyweight.
 *
 * `asOf` is an **argument**, never a clock read here — resolving the load for a
 * session in March must read March's anchor, and passing `new Date()` for a past
 * session is exactly the bug the effective dating exists to prevent.
 */
export async function getAnchorContext(
	userId: string,
	exerciseId: string,
	asOf: Date,
): Promise<ResolveContext> {
	const [anchors, profile] = await Promise.all([
		listExerciseAnchors(userId, exerciseId),
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: { weightKg: true },
		}),
	])
	return {
		anchors,
		bodyweightKg: profile?.weightKg ?? null,
		asOfISO: asOf.toISOString(),
	}
}

export type RecordStatedAnchorInput = {
	userId: string
	exerciseId: string
	/** A hand-entered anchor is a `oneRm` or a `repMax`. An `estimatedOneRm` is a
	 * formula's output and cannot be typed: it would be a protocol claiming an
	 * equation nobody applied. */
	construct: Extract<AnchorConstruct, 'oneRm' | 'repMax'>
	valueKg: number
	/** Required on a `repMax` — the rep count *is* half of what the number means. */
	reps: number | null
	/** When the anchor became true. Defaults to now; a re-test the athlete did
	 * last week is dated last week, and the as-of resolver then reads it. */
	effectiveAt?: Date
}

export type RecordAnchorResult =
	| { ok: true; id: string }
	| {
			ok: false
			reason: 'no-profile' | 'unknown-exercise' | 'invalid' | 'duplicate'
	  }

/**
 * Append an anchor the athlete typed.
 *
 * The protocol is always `athlete-stated` and the confidence is always `null`:
 * this path takes a number on the athlete's word, and grading somebody's own
 * statement about themselves is the thing ADR 0054 forbids. A `tested` protocol
 * with a `high` grade is reachable only through
 * {@link acceptProposedExerciseOneRm}, where an actual logged single is the
 * evidence.
 */
export async function recordStatedAnchor(
	input: RecordStatedAnchorInput,
): Promise<RecordAnchorResult> {
	if (!Number.isFinite(input.valueKg) || input.valueKg <= 0) {
		return { ok: false, reason: 'invalid' }
	}
	// The migration's CHECK says `repMax ⟹ reps IS NOT NULL`; refusing here makes
	// it a stated answer rather than a constraint violation the surface has to
	// translate.
	if (input.construct === 'repMax') {
		if (input.reps == null || !Number.isInteger(input.reps) || input.reps < 1) {
			return { ok: false, reason: 'invalid' }
		}
	}

	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: input.userId },
		select: { id: true },
	})
	if (!profile) return { ok: false, reason: 'no-profile' }

	const exercise = await prisma.exercise.findUnique({
		where: { id: input.exerciseId },
		select: { id: true },
	})
	if (!exercise) return { ok: false, reason: 'unknown-exercise' }

	return appendAnchor({
		athleteProfileId: profile.id,
		exerciseId: input.exerciseId,
		construct: input.construct,
		valueKg: input.valueKg,
		reps: input.construct === 'repMax' ? input.reps : null,
		protocol: 'athlete-stated',
		confidence: null,
		effectiveAt: input.effectiveAt ?? new Date(),
		sourceSetLogId: null,
	})
}

/**
 * The one write. **`create`, never `update` and never `upsert`** — the unique
 * key `(athlete, exercise, construct, reps, effectiveAt)` would otherwise make
 * an upsert overwrite the anchor a past session still reads against.
 */
async function appendAnchor(data: {
	athleteProfileId: string
	exerciseId: string
	construct: AnchorConstruct
	valueKg: number
	reps: number | null
	protocol: AnchorProtocol
	confidence: AnchorConfidence | null
	effectiveAt: Date
	sourceSetLogId: string | null
}): Promise<RecordAnchorResult> {
	try {
		const row = await prisma.exerciseThreshold.create({
			data,
			select: { id: true },
		})
		return { ok: true, id: row.id }
	} catch {
		// The same anchor at the same instant — a double-tap, not a second number.
		// Saying so is honest; silently overwriting would break the append-only rule
		// in the one case it is hardest to notice.
		return { ok: false, reason: 'duplicate' }
	}
}

// ——— The proposal ————————————————————————————————————————————————————————

export type AnchorProposal = {
	exerciseId: string
	exerciseName: string
	/** The equation applied, so the surface can name it and offer the others. */
	estimator: EstimatorName | null
	reading: OneRmReading
	/** What this athlete already has on file for the lift, so the accept control
	 * can say *replace* rather than *use* — and so an accepted number is never
	 * presented as the app's first opinion. */
	currentAnchors: StoredAnchor[]
}

/**
 * Read a proposed 1RM off the sets this athlete already logged for this lift.
 *
 * **Writes nothing.** It is a proposal: derived-then-authored (ADR 0050), so the
 * number becomes the athlete's only when they accept it, and nothing re-reads
 * their history to move it underneath them afterwards.
 *
 * Returns `null` where the exercise does not exist or the athlete has no
 * profile — a 404 on the surface, distinct from every refusal, which is a real
 * answer about a real lift.
 */
export async function proposeExerciseOneRm(
	userId: string,
	exerciseId: string,
	options: { now: Date; estimator?: EstimatorName },
): Promise<AnchorProposal | null> {
	const exercise = await prisma.exercise.findUnique({
		where: { id: exerciseId },
		select: { id: true, name: true, movementPattern: true },
	})
	if (!exercise) return null

	const rows = await prisma.exerciseSetLog.findMany({
		where: {
			exerciseId,
			session: { userId },
			// A record is a record of **work**: warm-ups and abandoned sets are
			// dropped here rather than in the estimator, which is told it is being
			// handed qualifying sets.
			role: 'working',
			outcome: 'completed',
			reps: { not: null },
			effectiveKg: { not: null },
		},
		orderBy: { completedAt: 'desc' },
		take: 200,
		select: {
			id: true,
			effectiveKg: true,
			reps: true,
			completedAt: true,
			rir: true,
			toFailure: true,
		},
	})

	const sets: EstimatorSet[] = rows.map((row) => ({
		setLogId: row.id,
		loadKg: row.effectiveKg ?? 0,
		reps: row.reps ?? 0,
		performedAt: row.completedAt,
		rir: row.rir,
		toFailure: row.toFailure,
	}))

	const reading = estimateOneRm({
		now: options.now,
		sets,
		...(options.estimator ? { estimator: options.estimator } : {}),
		hasValidatedRepLoadMapping: hasValidatedRepLoadMapping(
			exercise.movementPattern,
		),
	})

	return {
		exerciseId: exercise.id,
		exerciseName: exercise.name,
		estimator: options.estimator ?? null,
		reading,
		currentAnchors: await listExerciseAnchors(userId, exerciseId),
	}
}

export type AcceptProposalInput = {
	userId: string
	exerciseId: string
	estimator?: EstimatorName
	/** The value the browser is accepting, in kilos. Checked against a fresh
	 * derivation and never trusted. */
	postedValueKg: number
	now: Date
}

export type AcceptProposalResult =
	| { ok: true; id: string; valueKg: number }
	| {
			ok: false
			reason: 'not-found' | 'no-profile' | 'refused' | 'stale' | 'duplicate'
	  }

/**
 * Accept a proposed anchor — after **re-deriving it server-side**.
 *
 * `stale` is the interesting refusal: the athlete's history moved between the
 * screen rendering and the tap, so the number on screen is not the number the
 * engine produces now. Writing the posted one anyway would store a figure no
 * derivation supports, which is precisely what the derivation panel promises
 * cannot happen.
 */
export async function acceptProposedExerciseOneRm(
	input: AcceptProposalInput,
): Promise<AcceptProposalResult> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: input.userId },
		select: { id: true },
	})
	if (!profile) return { ok: false, reason: 'no-profile' }

	const proposal = await proposeExerciseOneRm(input.userId, input.exerciseId, {
		now: input.now,
		...(input.estimator ? { estimator: input.estimator } : {}),
	})
	if (!proposal) return { ok: false, reason: 'not-found' }
	if (proposal.reading.kind === 'refusal')
		return { ok: false, reason: 'refused' }

	const reading = proposal.reading
	// Both sides are already rounded to the kilo's one decimal by the estimator,
	// so this is an equality and not a tolerance: a tolerance here would be a
	// window in which a posted number the engine never produced is stored.
	if (round(input.postedValueKg) !== reading.valueKg) {
		return { ok: false, reason: 'stale' }
	}

	const written = await appendAnchor({
		athleteProfileId: profile.id,
		exerciseId: input.exerciseId,
		construct: reading.construct,
		valueKg: reading.valueKg,
		// Required on an `estimatedOneRm` and harmless on the tested single: the
		// reps the reading was taken from are what makes it re-derivable.
		reps: reading.reps,
		protocol: reading.protocol,
		confidence: reading.confidence,
		effectiveAt: input.now,
		sourceSetLogId: reading.basis.source?.setLogId ?? null,
	})
	if (!written.ok) {
		return {
			ok: false,
			reason: written.reason === 'duplicate' ? 'duplicate' : 'not-found',
		}
	}
	// The stored value is the **re-derived** one, so what the caller confirms is
	// what the engine produced and not what the browser sent.
	return { ok: true, id: written.id, valueKg: reading.valueKg }
}

function round(kg: number): number {
	return Math.round(kg * 10) / 10
}

// ——— Where the lift is prescribed ————————————————————————————————————————

/** One authored set of a prescription, in the shape the notation reads. */
export type PrescribedSet = {
	kind: string
	reps: number | null
	durationSec: number | null
	load: LoadTarget | null
	weightKg: number | null
	pct1RM: number | null
}

export type ExercisePrescription = {
	sessionId: string
	sessionTitle: string
	/** The day the prescription is read **for** — the date its Load Targets
	 * resolve as-of, so a past session keeps its own anchor. */
	scheduledAtISO: string
	sets: PrescribedSet[]
}

function parseLoadTarget(raw: string | null): LoadTarget | null {
	if (!raw) return null
	try {
		const parsed = LoadTargetSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/**
 * This athlete's most recent sessions that prescribe this lift, newest first —
 * the demo of the whole slice: `5 × 5 @ 85 % 1RM` becomes kilos, or says plainly
 * that it cannot.
 */
export async function listExercisePrescriptions(
	userId: string,
	exerciseId: string,
	limit = 5,
): Promise<ExercisePrescription[]> {
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			workout: { blocks: { some: { steps: { some: { exerciseId } } } } },
		},
		orderBy: { scheduledAt: 'desc' },
		take: limit,
		select: {
			id: true,
			scheduledAt: true,
			workout: {
				select: {
					title: true,
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							steps: {
								orderBy: { orderIndex: 'asc' },
								where: { exerciseId },
								select: {
									sets: {
										orderBy: { orderIndex: 'asc' },
										select: {
											kind: true,
											reps: true,
											durationSec: true,
											load: true,
											weightKg: true,
											pct1RM: true,
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

	return sessions.map((session) => ({
		sessionId: session.id,
		sessionTitle: session.workout?.title ?? 'Session',
		scheduledAtISO: session.scheduledAt.toISOString(),
		sets: (session.workout?.blocks ?? [])
			.flatMap((block) => block.steps)
			.flatMap((step) => step.sets)
			.map((set) => ({
				kind: set.kind,
				reps: set.reps,
				durationSec: set.durationSec,
				load: parseLoadTarget(set.load),
				weightKg: set.weightKg,
				pct1RM: set.pct1RM,
			})),
	}))
}
