/**
 * **Discipline Allocation**, redefined for the track model (#395, ADR 0106).
 *
 * The share is an **endurance mix**: each endurance discipline's share of the
 * window's resolvable endurance TSS. Strength (`sets`, ADR 0046 §2) and Simple
 * Activities (`other`, ADR 0015) never enter the denominator; they stand
 * **beside** the mix as session counts, so no percentage asserts an exchange
 * rate between sets and TSS (ADR 0043 §7). An endurance discipline that trained
 * but has no resolvable TSS is **Unavailable** (ADR 0031): a `null` share, never
 * a zero slice, and its sessions do not dilute the others.
 */
import { CARDIO_DISCIPLINES } from '../workout-schema.ts'

export type AllocationSession = {
	discipline: string
	/** The stored TSS; null where no formula resolved. Ignored off endurance. */
	tss: number | null
}

export type EndurancePart = {
	discipline: string
	sessions: number
	/** Resolvable TSS; null when none of its sessions resolved (Unavailable). */
	tss: number | null
	/** Share of the endurance total; null when Unavailable or the total is 0. */
	share: number | null
}

export type DisciplineAllocation = {
	/** Heaviest first; Unavailable parts last. */
	endurance: EndurancePart[]
	/** The denominator: resolvable endurance TSS only. */
	enduranceTss: number
	/** Strength and Simple Activities, beside the mix and never in it. */
	beside: Array<{ discipline: string; sessions: number }>
}

const isEndurance = (discipline: string) =>
	(CARDIO_DISCIPLINES as readonly string[]).includes(discipline)

export function buildDisciplineAllocation(
	sessions: readonly AllocationSession[],
): DisciplineAllocation {
	const endurance = new Map<string, { sessions: number; tss: number | null }>()
	const beside = new Map<string, number>()
	for (const session of sessions) {
		if (!isEndurance(session.discipline)) {
			beside.set(session.discipline, (beside.get(session.discipline) ?? 0) + 1)
			continue
		}
		const part = endurance.get(session.discipline) ?? { sessions: 0, tss: null }
		part.sessions += 1
		if (
			session.tss != null &&
			Number.isFinite(session.tss) &&
			session.tss >= 0
		) {
			part.tss = (part.tss ?? 0) + session.tss
		}
		endurance.set(session.discipline, part)
	}
	const enduranceTss = [...endurance.values()].reduce(
		(sum, part) => sum + (part.tss ?? 0),
		0,
	)
	const parts: EndurancePart[] = [...endurance.entries()].map(
		([discipline, part]) => ({
			discipline,
			sessions: part.sessions,
			tss: part.tss,
			share:
				part.tss == null || enduranceTss <= 0 ? null : part.tss / enduranceTss,
		}),
	)
	parts.sort(
		(a, b) =>
			(b.tss ?? -1) - (a.tss ?? -1) || a.discipline.localeCompare(b.discipline),
	)
	return {
		endurance: parts,
		enduranceTss,
		beside: [...beside.entries()]
			.map(([discipline, count]) => ({ discipline, sessions: count }))
			.sort((a, b) => a.discipline.localeCompare(b.discipline)),
	}
}
