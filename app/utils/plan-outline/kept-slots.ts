/**
 * **The kept-slot rule** (ADR 0109 §6, ADR 0120 §4): a session the plan laid
 * and keeps through a re-lay (adopted, or trained) fills its weekday's slot for
 * its **Discipline**, so the re-lay places no second session beside it. Stated
 * once, and read by every re-lay: the stamp's and a generated plan's.
 */

/** A slot: the weekday (Monday-first) and the Discipline laid there. */
export function slotKey(weekday: number, discipline: string): string {
	return `${weekday}|${discipline}`
}

/**
 * The sessions of a week's laying still to lay once the kept sessions
 * (`kept`, counted per {@link slotKey}) have filled their slots. A lifting
 * slot falls on no weekday of its own (ADR 0104 §3), so a lift kept on a day
 * this laying puts no lift of its Discipline on still fills it.
 */
export function fillKeptSlots<
	T extends { weekday: number; discipline: string; kind?: string },
>(sessions: readonly T[], kept: ReadonlyMap<string, number>): T[] {
	const filled = new Map(kept)
	return sessions.filter((session) => {
		const slot =
			filled.get(slotKey(session.weekday, session.discipline)) ||
			session.kind !== 'lifting'
				? slotKey(session.weekday, session.discipline)
				: keptLiftElsewhere(filled, sessions, session.discipline)
		const taken = slot == null ? 0 : (filled.get(slot) ?? 0)
		if (slot != null && taken > 0) {
			filled.set(slot, taken - 1)
			return false
		}
		return true
	})
}

function keptLiftElsewhere(
	filled: ReadonlyMap<string, number>,
	sessions: ReadonlyArray<{ weekday: number; discipline: string }>,
	discipline: string,
): string | null {
	const laid = new Set(
		sessions
			.filter((session) => session.discipline === discipline)
			.map((session) => slotKey(session.weekday, discipline)),
	)
	for (const [slot, count] of filled) {
		if (count > 0 && slot.endsWith(`|${discipline}`) && !laid.has(slot)) {
			return slot
		}
	}
	return null
}
