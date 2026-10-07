// Who owns a **Workout Session**: the athlete or the machine (#505, ADR 0080).
//
// Ownership is the gate for every machine write. A session is the **athlete's**
// when they wrote it (`authored` **Session Source**) or took it over (**Session
// Adoption**, `adoptedAt`) and has not handed it back (**Session Release**, "lås
// opp", `releasedAt`); every other session is the **machine's** — whatever
// produced it, because the strength program writes `generated` too, so the gate
// is "athlete versus machine", never "which generator".
//
// The rule lives here once, in two readings that must not drift apart: a
// predicate for rows already read ({@link sessionOwner}) and a `where` fragment
// for queries that select or delete ({@link MACHINE_OWNED_SESSION}).

import { type Prisma } from '@prisma/client'

export type SessionOwner = 'athlete' | 'machine'

/** The three columns ownership is read from. Dates may arrive serialized. */
export type OwnershipFacts = {
	source: string
	adoptedAt: Date | string | null
	releasedAt: Date | string | null
}

/** Whose session this is: the athlete's own, or the machine's to change. */
export function sessionOwner({
	source,
	adoptedAt,
	releasedAt,
}: OwnershipFacts): SessionOwner {
	const theirs = source === 'authored' || adoptedAt != null
	return theirs && releasedAt == null ? 'athlete' : 'machine'
}

/**
 * The machine's sessions, as a `where` fragment — the same rule as
 * {@link sessionOwner}, for a query. Spread it into any machine write's
 * selection so the athlete's sessions are never in the set to begin with.
 *
 * It carries an `OR` (never theirs, or handed back), so a caller that needs an
 * `OR` of its own must put one of the two under `AND`.
 */
export const MACHINE_OWNED_SESSION = {
	OR: [
		{ source: { not: 'authored' }, adoptedAt: null },
		{ releasedAt: { not: null } },
	],
} satisfies Prisma.WorkoutSessionWhereInput
