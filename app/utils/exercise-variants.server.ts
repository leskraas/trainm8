/**
 * **The write path for an `ExerciseVariant`** — and the one rule that makes the
 * progression key trustworthy from the writing end: a variant's `equipment` may
 * not change while a logged set references it.
 *
 * ## Why the refusal exists
 *
 * `(exerciseId, equipment)` is the key `ProgramLiftState`, the strength records
 * and the per-exercise history all partition on. Until the stamp existed, every
 * reader derived the second half at read time from `variant.equipment` — a plain
 * mutable `String` — so one statement was enough to rewrite an athlete's history:
 *
 *     UPDATE "ExerciseVariant" SET equipment = 'dumbbell'
 *      WHERE id = 'var_ex_bb_bench_press';
 *
 * Eight barbell bench sessions moved onto a dumbbell key and the records were
 * rekeyed with them, silently.
 *
 * ## Why the refusal is not the primary fix
 *
 * Because **it can be bypassed.** An import, a hand-written row, a `sqlite3`
 * session and a future writer that has not read this file all go around it. The
 * primary fix is the `ExerciseSetLog.equipment` stamp, which makes the key a fact
 * the set itself states, so nothing done to a variant afterwards can rekey it.
 * This check is the second line: it stops the *app* from writing a restatement
 * that no longer means anything, and says why.
 *
 * ## Why it is here and not a trigger
 *
 * A trigger is invisible in `schema.prisma`, so the constraint would be enforced
 * by something nobody reading the model can see. The rule is stated in the model's
 * own doc comment and enforced here, where a caller gets an answer it can show.
 *
 * ## What a caller is being told
 *
 * That **changing a variant's equipment is not an edit.** A barbell bench press
 * realized on dumbbells is a *different realization* of the movement, which means
 * a different variant — one more row, with its own history, progressing on its own
 * key. That is the correct write, and it is always available.
 *
 * And if the equipment of live sets ever genuinely must be restated — a corpus row
 * that was wrong from the day it shipped — that is a **one-time migration plus a
 * Load Recompute Notice**, so the athlete is told what moved and why. Never a
 * silent re-key.
 */
import { type PrismaClient } from '@prisma/client'

/** The subset of the client this writer needs. The `exerciseSetLog` half is not
 * incidental: the refusal is a question about logged sets, and a caller that
 * cannot ask it cannot write a variant. */
type VariantWriteClient = Pick<
	PrismaClient,
	'exerciseVariant' | 'exerciseSetLog'
>

/** Everything a variant states about itself, `id` excepted. The same object the
 * corpus seed builds, so there is one shape and not two. */
export type ExerciseVariantFacets = {
	exerciseId: string
	equipment: string
	angle: string | null
	displayName: string
	loadKind: string
	barKg: number | null
	perSideMultiplier: number
	isFixed: boolean
	isAssisting: boolean
	useBodyweightForBar: boolean
	isDefault: boolean
}

export type ExerciseVariantWriteResult =
	| { ok: true; id: string }
	/**
	 * **Refused, and the sentence says what to do instead.** Every field is here so
	 * the caller can name the row rather than describing the rule in the abstract:
	 * which variant, what it has said since it was written, what was posted, and how
	 * many logged sets are keyed on the answer.
	 */
	| {
			ok: false
			reason: 'equipment-is-a-different-realization'
			id: string
			recordedEquipment: string
			postedEquipment: string
			loggedSetCount: number
			explanation: string
	  }

/**
 * Write one variant — create it, or restate the facets of an existing one.
 *
 * Refuses exactly one write: a posted `equipment` that differs from the recorded
 * one on a variant an `ExerciseSetLog` references. Nothing else about a variant is
 * protected, because nothing else about it is a key: a display name, a bar weight,
 * a plate multiplier and a default flag are all corrigible facts about the same
 * realization, and correcting them is the whole reason a seed re-runs.
 *
 * A refusal writes **nothing at all** — not the equipment, and not the facets
 * standing beside it. A partial write would leave the row half-restated, which is
 * a worse answer than the refusal it is trying to soften.
 */
export async function saveExerciseVariant(
	client: VariantWriteClient,
	id: string,
	facets: ExerciseVariantFacets,
): Promise<ExerciseVariantWriteResult> {
	const recorded = await client.exerciseVariant.findUnique({
		where: { id },
		select: { equipment: true },
	})

	if (recorded && recorded.equipment !== facets.equipment) {
		// Asked only when the equipment actually differs, so the ordinary re-seed of
		// eight hundred rows pays for no extra query at all.
		const loggedSetCount = await client.exerciseSetLog.count({
			where: { variantId: id },
		})
		if (loggedSetCount > 0) {
			return {
				ok: false,
				reason: 'equipment-is-a-different-realization',
				id,
				recordedEquipment: recorded.equipment,
				postedEquipment: facets.equipment,
				loggedSetCount,
				explanation: `${loggedSetCount} logged ${
					loggedSetCount === 1 ? 'set was' : 'sets were'
				} lifted on this variant as ${recorded.equipment}, so it cannot be restated as ${facets.equipment}. That is not an edit — it is a different realization of the movement, which means a new variant with its own history. Restating the equipment of sets somebody already lifted takes a one-time migration and a Load Recompute Notice, never a quiet rewrite.`,
			}
		}
	}

	await client.exerciseVariant.upsert({
		where: { id },
		create: { id, ...facets },
		update: facets,
		select: { id: true },
	})
	return { ok: true, id }
}
