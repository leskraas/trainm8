import { prisma } from '../db.server.ts'

/**
 * **How a plan's week is laid** (ADR 0120 §3): from its first **Week Pattern**
 * with days when it has one; else by the generator, from its **Generation
 * Record**, when it has one; else it has nothing to lay. The pattern wins, so
 * once the athlete gives a generated plan days of their own, its weeks are laid
 * as every plan's are. The one reader of that rule, for the re-lay and the
 * horizon fill alike.
 */
export type PlanWeekSource =
	| { kind: 'pattern'; patternId: string }
	| { kind: 'generated' }
	| { kind: 'none' }

export async function readPlanWeekSource(
	outlineId: string,
): Promise<PlanWeekSource> {
	const [pattern, record] = await Promise.all([
		prisma.weekPattern.findFirst({
			where: { outlineId, days: { some: {} } },
			orderBy: { orderIndex: 'asc' },
			select: { id: true },
		}),
		prisma.generationRecord.findUnique({
			where: { outlineId },
			select: { outlineId: true },
		}),
	])
	if (pattern) return { kind: 'pattern', patternId: pattern.id }
	if (record) return { kind: 'generated' }
	return { kind: 'none' }
}
