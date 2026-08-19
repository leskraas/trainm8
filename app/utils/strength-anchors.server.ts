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
import {
	type RepLoadBasis,
	repLoadBasis,
} from './strength/anchors.constants.ts'
import { type Anchor, type ResolveContext } from './strength/anchors.ts'
import {
	type EstimatorSet,
	type OneRmReading,
	estimateOneRm,
	gradeDownForRepLoadBasis,
} from './strength/one-rm.ts'
import {
	type AnchorConfidence,
	type AnchorConstruct,
	type AnchorProtocol,
	type EstimatorName,
	ESTIMATOR_NAMES,
	formatKg,
	readStoredSetLoad,
} from './strength-log.ts'
import { type LoadTarget, LoadTargetSchema } from './workout-schema.ts'

/**
 * **Whether an anchor can still show where its number came from**, which is not
 * the same question as whether it has a source set id.
 *
 * `ExerciseThreshold` is append-only and `sourceSetLogId` is `SET NULL`: an
 * accepted estimate is *the athlete's own number*, so losing the set it was read
 * from must not lose the anchor. What it must lose is the **claim**. A row that
 * says *"Epley/Welday"* with nothing behind it is asserting a derivation it
 * cannot produce — the same shape of lie as a fabricated kilo (ADR 0008's
 * Unavailable Metric, one level down).
 *
 * - `shown` — the set is on file and the derivation can be displayed.
 * - `source-gone` — the protocol names a reading taken from a set, and that set
 *   is no longer on file. The value stands; the derivation is unavailable and the
 *   surface says so instead of naming an equation it cannot run again.
 * - `no-set` — the protocol never involved one (`athlete-stated`, `provider`), so
 *   there is nothing missing and nothing to explain.
 */
export type AnchorDerivation =
	| { kind: 'shown'; setLogId: string }
	| { kind: 'source-gone' }
	| { kind: 'no-set' }

/** The protocols that mean *"read off a set the athlete logged"*. Everything
 * else arrived by somebody stating a number. */
const PROTOCOLS_READ_FROM_A_SET: ReadonlySet<string> = new Set<AnchorProtocol>([
	'tested',
	...ESTIMATOR_NAMES,
	'rep-max-observed',
])

/**
 * What this anchor can honestly say about its own provenance.
 *
 * A pre-`SET NULL` row and a row whose set was deleted are indistinguishable by
 * design — the column keeps no tombstone — and they are the same statement
 * anyway: *the set is not on file*. Neither one licenses naming the equation as
 * though it could be re-run.
 */
export function anchorDerivation(anchor: {
	protocol: AnchorProtocol
	sourceSetLogId: string | null
}): AnchorDerivation {
	if (anchor.sourceSetLogId != null) {
		return { kind: 'shown', setLogId: anchor.sourceSetLogId }
	}
	return PROTOCOLS_READ_FROM_A_SET.has(anchor.protocol)
		? { kind: 'source-gone' }
		: { kind: 'no-set' }
}

/** One stored `ExerciseThreshold`, as the pure layer's {@link Anchor} plus the
 * row's own identity — the id, when it was written, and the set it was read
 * from, so the surface can show a derivation after the fact. */
export type StoredAnchor = Anchor & {
	id: string
	createdAtISO: string
	sourceSetLogId: string | null
	/** Whether that derivation is still showable — resolved here so no reader has
	 * to re-derive the rule, and so none of them can state a provenance the row
	 * cannot produce. */
	derivation: AnchorDerivation
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
		derivation: anchorDerivation({
			protocol: row.protocol as AnchorProtocol,
			sourceSetLogId: row.sourceSetLogId,
		}),
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
	/** How strong the equation's evidence is on **this** movement, so the reading
	 * can say which basis it used rather than presenting a borrowed curve as
	 * though it were a bench press. */
	repLoadBasis: RepLoadBasis
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
			// **Selected because a kilo is not a quantity until you know its kind.**
			// `effectiveKg` on a dip-belt bench is the athlete plus the belt; run
			// through an equation it proposed a 121.33 kg bar weight nobody had ever
			// touched, and the accept path wrote it. The kind rides along to
			// `estimateOneRm`, which asks `loadKindComparability` and refuses.
			load: true,
			effectiveKg: true,
			// **The witness the stored kilo is checked against.** A bodyweight-derived
			// bake is a function of the bodyweight *then*, so the check reads the number
			// standing beside the kilo and never the athlete's weight now.
			bodyweightKg: true,
			reps: true,
			completedAt: true,
			rir: true,
			toFailure: true,
		},
	})

	// **The pair is read, not believed** — one call to the published reader
	// (`readStoredSetLoad`), the same one the grid and the program fold use, rather
	// than a `loadKind` scraped out of the JSON beside an `effectiveKg` taken on
	// trust. That local scrape is how a hand-written `30 kg` load sitting beside
	// `effectiveKg: 300` printed *"Set used: 300 kg × 3"* on the propose screen and
	// then wrote a 330 kg anchor: the kind said `external`, so the estimator had no
	// reason to refuse, and nothing had ever asked whether the kilo followed from
	// the load.
	//
	// A **contradicted** row is dropped outright. An anchor is a number the athlete
	// will be prescribed against for months; deriving one from a kilo this app
	// cannot stand behind is worse than deriving nothing, and `estimateOneRm`'s own
	// refusals already say the honest thing when nothing qualifies. It is never
	// corrected here — ADR 0056 §3's bake is the record of what happened — and the
	// contradiction is stated where it can be acted on, on the log grid.
	const sets: EstimatorSet[] = rows.flatMap((row) => {
		const reading = readStoredSetLoad(row)
		if (reading.kind === 'contradicted') return []
		return [
			{
				setLogId: row.id,
				loadKg: reading.effectiveKg ?? 0,
				reps: row.reps ?? 0,
				performedAt: row.completedAt,
				rir: row.rir,
				toFailure: row.toFailure,
				loadKind: reading.load?.kind ?? null,
			},
		]
	})

	const basis = repLoadBasis(exercise.movementPattern)
	const reading = estimateOneRm({
		now: options.now,
		sets,
		...(options.estimator ? { estimator: options.estimator } : {}),
		hasValidatedRepLoadMapping: basis !== 'unmapped',
	})

	return {
		exerciseId: exercise.id,
		exerciseName: exercise.name,
		estimator: options.estimator ?? null,
		repLoadBasis: basis,
		reading: gradeDownForRepLoadBasis(reading, basis),
		currentAnchors: await listExerciseAnchors(userId, exerciseId),
	}
}

export type AcceptProposalInput = {
	userId: string
	exerciseId: string
	/**
	 * Which equation the athlete picked. **Attacker-controlled**, like every
	 * posted field: it is a member of `ESTIMATOR_NAMES` or the surface rejects the
	 * submission, and whichever member it is, it is the equation the server
	 * re-runs — so the posted value is checked against *that* equation's output
	 * and a value borrowed from another one is refused as `stale`. Picking a
	 * flattering equation is allowed and honest; the anchor then stores that
	 * equation as its `protocol` and says so on the screen.
	 */
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
 *
 * **The load-kind gate is re-run here too, because this is the path that writes.**
 * The re-derivation goes through the same `proposeExerciseOneRm`, so a posted
 * value read off a bodyweight-derived, assisted, per-hand or non-mass kilo comes
 * back as a refusal and nothing is written — a posted number cannot route around
 * the gate.
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
	// **Compared as the screen states them, not as either side rounds them.** The
	// estimator hands back the kilo it derived with every digit intact, so there
	// is no rounding step here to smuggle a number in through: the check is that
	// the reading the athlete accepted is the reading a fresh derivation produces,
	// and `formatKg` is the one rule for what "the same number" means.
	if (formatKg(input.postedValueKg) !== formatKg(reading.valueKg)) {
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
