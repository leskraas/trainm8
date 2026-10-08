// The Sesong edits against the database (#505 stories 72–77): the preview
// read, and the apply. Both run `previewSeasonEdit` over the same stored rows,
// so what the athlete approved is what lands — the apply recomputes it inside
// its transaction rather than trusting a posted one, and refuses when it no
// longer matches the preview's digest (`preview-stale`), as the philosophy
// switch does.
//
// After commit, the weeks the edit changed are laid again through the gated
// `relayPlanFrom`: only the machine's untrained sessions go, a week holding
// the athlete's session is laid around it, and a session the athlete wrote is
// never the plan's to touch. Laying is contained — the edit already holds, and
// the week change goes on laying the horizon from the next close.

import { type Prisma } from '@prisma/client'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { readFirstUnbegunWeekKey } from '#app/utils/load/week-begun.server.ts'
import { relayPlanFrom } from './open-ended.server.ts'
import { outlinePreviewSelect } from './outline-preview.ts'
import {
	previewSeasonEdit,
	type SeasonEdit,
	type SeasonEditPreview,
	type SeasonEditRefusal,
} from './season-edit.ts'

export type ApplySeasonEditRefusal =
	| SeasonEditRefusal
	/** Not this athlete's plan — or no plan at all. */
	| 'outline-not-found'
	/** The edit would now differ from the preview the athlete confirmed. */
	| 'preview-stale'

export type SeasonEditServerResult =
	| SeasonEditPreview
	| { ok: false; reason: ApplySeasonEditRefusal }

type Db = Prisma.TransactionClient

async function computeEdit(
	db: Db,
	userId: string,
	outlineId: string,
	edit: SeasonEdit,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<SeasonEditServerResult> {
	const outline = await db.planOutline.findFirst({
		where: { id: outlineId, athleteId: userId },
		select: outlinePreviewSelect,
	})
	if (!outline) return { ok: false, reason: 'outline-not-found' }
	const firstUnbegun = await readFirstUnbegunWeekKey(userId, now, timezone, db)
	return previewSeasonEdit(
		{
			startWeekKey: outline.startWeekKey,
			phases: outline.phases,
			tracks: outline.tracks,
		},
		edit,
		firstUnbegun,
	)
}

/**
 * What `edit` would do to the plan — the preview (_Forhåndsvisning_) the
 * athlete approves. Writes nothing.
 */
export async function readSeasonEdit(
	userId: string,
	outlineId: string,
	edit: SeasonEdit,
	now: Date = new Date(),
): Promise<SeasonEditServerResult> {
	const timezone = await getAthleteTimezone(userId)
	return computeEdit(prisma, userId, outlineId, edit, { now, timezone })
}

/**
 * Apply `edit` (#505 stories 72–74): the write the preview shows, recomputed
 * and written in one transaction, then the weeks it changed laid again.
 * Returns what was applied — the same model the preview returned.
 *
 * `digest` is the preview's own, posted back by the confirm, and required:
 * every Sesong edit shows its preview first (#505 story 75). When the edit
 * recomputed now has another, nothing is written (`preview-stale`).
 */
export async function applySeasonEdit(
	userId: string,
	outlineId: string,
	edit: SeasonEdit,
	now: Date,
	{ digest }: { digest: string },
): Promise<SeasonEditServerResult> {
	const timezone = await getAthleteTimezone(userId)
	const result = await prisma.$transaction(async (tx) => {
		const computed = await computeEdit(tx, userId, outlineId, edit, {
			now,
			timezone,
		})
		if (!computed.ok) return computed
		if (computed.digest !== digest) {
			return { ok: false as const, reason: 'preview-stale' as const }
		}
		const { write } = computed
		switch (write.kind) {
			case 'week-target':
				if (write.value == null) {
					await tx.weekVolumeOverride.deleteMany({
						where: { trackId: write.trackId, weekKey: write.weekKey },
					})
					break
				}
				await tx.weekVolumeOverride.upsert({
					where: {
						trackId_weekKey: { trackId: write.trackId, weekKey: write.weekKey },
					},
					create: {
						trackId: write.trackId,
						weekKey: write.weekKey,
						value: write.value,
					},
					update: { value: write.value },
				})
				break
			case 'phase':
				await tx.planOutlinePhase.update({
					where: { id: write.phaseId },
					data: {
						name: write.name,
						weeks: write.weeks,
						rhythm: write.rhythm,
						tapers: write.tapers,
						recoveryWeekIndex: write.recoveryWeekIndex,
					},
				})
				break
			case 'easy-week':
				await tx.planOutlinePhase.update({
					where: { id: write.phaseId },
					data: { recoveryWeekIndex: write.recoveryWeekIndex },
				})
				break
		}
		return computed
	})
	if (!result.ok) return result

	const [fromWeekKey] = result.relayWeekKeys
	if (fromWeekKey) {
		try {
			await relayPlanFrom(userId, outlineId, fromWeekKey, timezone, now, {
				onlyWeekKeys: result.relayWeekKeys,
			})
		} catch (error) {
			console.error('[season-edit] laying weeks after an edit failed', error)
		}
	}
	return result
}
