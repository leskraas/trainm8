// Who owns a **Workout Session**: the athlete or the machine (#505, ADR 0080).
//
// Ownership is the gate for every machine write. A session is the **athlete's**
// when they wrote it (`authored` **Session Source**) or took it over (**Session
// Adoption**, `adoptedAt`); every other session is the **machine's** — whatever
// produced it, because the strength program writes `generated` too, so the gate
// is "athlete versus machine", never "which generator".
//
// The rule lives here once, in two readings that must not drift apart: a
// predicate for rows already read ({@link sessionOwner}) and a `where` fragment
// for queries that select or delete ({@link MACHINE_OWNED_SESSION}). Handing a
// session back to the app ("lås opp") changes both here and nowhere else.

import { type Prisma } from '@prisma/client'

export type SessionOwner = 'athlete' | 'machine'

/** The two columns ownership is read from. Dates may arrive serialized. */
export type OwnershipFacts = {
	source: string
	adoptedAt: Date | string | null
}

/** Whose session this is: the athlete's own, or the machine's to change. */
export function sessionOwner({
	source,
	adoptedAt,
}: OwnershipFacts): SessionOwner {
	return source === 'authored' || adoptedAt != null ? 'athlete' : 'machine'
}

/**
 * The machine's sessions, as a `where` fragment — the same rule as
 * {@link sessionOwner}, for a query. Spread it into any machine write's
 * selection so the athlete's sessions are never in the set to begin with.
 */
export const MACHINE_OWNED_SESSION = {
	source: { not: 'authored' },
	adoptedAt: null,
} satisfies Prisma.WorkoutSessionWhereInput
