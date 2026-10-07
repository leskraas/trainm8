// Switching a plan's philosophy, against the database (#505 stories 12–14):
// the preview read, and the apply. Both run `previewPhilosophySwitch` over the
// same stored rows, so what the athlete approved is what lands — the apply
// recomputes it inside its transaction rather than trusting a posted one.
//
// What stays, and why it is safe:
//   - **Lived weeks.** The edit keeps every phase behind the first unbegun week
//     and the weeks lived of the one it falls in (`philosophy.ts`).
//   - **The athlete's sessions.** After commit the plan's weeks from that week
//     on are laid again through the stamp, whose clearing is the gated
//     `clearPlanWeek`: only the machine's untrained sessions go, and a week
//     holding an adopted session keeps it and is not laid a second time beside
//     it. A session the athlete wrote is never the plan's to touch.
//   - **The edit, if laying fails.** Laying is after commit and contained, as
//     adding an Event's is (#505 S6): the plan already follows the new family,
//     and the week change goes on laying the horizon from the next close.

import { type Prisma } from '@prisma/client'
import { weekMonday } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { layEnduranceSegments } from './authoring.server.ts'
import { closePendingRounds, relayPlanFrom } from './open-ended.server.ts'
import {
	previewPhilosophySwitch,
	type PhilosophySwitchPreview,
	type PhilosophySwitchRefusal,
} from './philosophy.ts'
import { type PresetFamily } from './presets.ts'

export type SwitchPhilosophyResult =
	| PhilosophySwitchPreview
	| {
			ok: false
			/** Not this athlete's plan — or no plan at all. */
			reason: PhilosophySwitchRefusal | 'outline-not-found'
	  }

const switchOutlineSelect = {
	id: true,
	startWeekKey: true,
	family: true,
	event: { select: { startDate: true } },
	phases: {
		select: {
			id: true,
			orderIndex: true,
			name: true,
			weeks: true,
			rhythm: true,
			tapers: true,
		},
	},
	tracks: {
		select: {
			id: true,
			discipline: true,
			currency: true,
			anchors: { select: { fromWeekKey: true, value: true } },
			segments: {
				select: {
					id: true,
					kind: true,
					phaseId: true,
					ramp: true,
					boundaryStep: true,
					recoveryCut: true,
					taperCut: true,
					startWeekKey: true,
					weeks: true,
					goal: true,
					sessionsPerWeek: true,
					deloadCut: true,
					deloadWeeks: true,
					mix: { select: { zone: true, sessionsPerWeek: true } },
				},
			},
			overrides: { select: { weekKey: true, value: true } },
		},
	},
} satisfies Prisma.PlanOutlineSelect

/** The switch as it would land now, inside the caller's client. */
async function computeSwitch(
	db: Prisma.TransactionClient,
	userId: string,
	outlineId: string,
	family: PresetFamily,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<SwitchPhilosophyResult> {
	const outline = await db.planOutline.findFirst({
		where: { id: outlineId, athleteId: userId },
		select: switchOutlineSelect,
	})
	if (!outline) return { ok: false, reason: 'outline-not-found' }
	return previewPhilosophySwitch(
		{
			startWeekKey: outline.startWeekKey,
			family: outline.family,
			eventWeekKey: outline.event
				? weekMonday(outline.event.startDate, timezone)
				: null,
			phases: outline.phases,
			tracks: outline.tracks,
		},
		family,
		now,
		timezone,
	)
}

/**
 * What switching the plan to `family` would do from the first week not yet
 * begun — the preview (_Forhåndsvisning_) the athlete approves. Writes nothing.
 */
export async function readPhilosophySwitch(
	userId: string,
	outlineId: string,
	family: PresetFamily,
	now: Date = new Date(),
): Promise<SwitchPhilosophyResult> {
	const timezone = await getAthleteTimezone(userId)
	return computeSwitch(prisma, userId, outlineId, family, { now, timezone })
}

/**
 * Switch the plan to `family` (#505 stories 12–14): the edit the preview
 * shows, recomputed and written in one transaction, then the weeks from the
 * switch on laid again. Works for an open-ended plan and a plan toward an
 * Event alike; the latter still ends on the Event's week. Returns what was
 * applied — the same model the preview returned.
 */
export async function switchPhilosophy(
	userId: string,
	outlineId: string,
	family: PresetFamily,
	now: Date = new Date(),
): Promise<SwitchPhilosophyResult> {
	const timezone = await getAthleteTimezone(userId)
	const result = await prisma.$transaction(async (tx) => {
		const computed = await computeSwitch(tx, userId, outlineId, family, {
			now,
			timezone,
		})
		if (!computed.ok) return computed
		const { edit } = computed

		// The phases after the boundary go first (their segments and mixes by
		// cascade), so the kept ones are a prefix and the new ones append.
		await tx.planOutlinePhase.deleteMany({
			where: { outlineId, id: { in: edit.remove } },
		})
		for (const { phaseId, weeks } of edit.resize) {
			await tx.planOutlinePhase.update({
				where: { id: phaseId },
				data: { weeks },
			})
		}
		const kept = await tx.planOutlinePhase.count({ where: { outlineId } })
		const laid = []
		for (const [offset, phase] of edit.add.entries()) {
			const row = await tx.planOutlinePhase.create({
				data: {
					outlineId,
					orderIndex: kept + offset,
					name: phase.name,
					weeks: phase.weeks,
					rhythm: phase.rhythm,
					tapers: phase.tapers,
				},
				select: { id: true },
			})
			laid.push({
				phaseId: row.id,
				ramp: phase.ramp,
				boundaryStep: phase.boundaryStep,
				mix: phase.mix,
			})
		}
		await layEnduranceSegments(tx, outlineId, laid)
		await tx.planOutline.update({
			where: { id: outlineId },
			data: { family },
		})
		// A next round proposed on the old family is not this plan's any more.
		await closePendingRounds(tx, userId, outlineId, now)
		return computed
	})
	if (!result.ok) return result

	try {
		await relayPlanFrom(userId, outlineId, result.fromWeekKey, timezone, now)
	} catch (error) {
		console.error(
			'[philosophy] laying weeks after a philosophy switch failed',
			error,
		)
	}
	return result
}
