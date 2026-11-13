/**
 * **Performance Result** reads — the athlete's own dated maximal performances,
 * and the one rung of the **Race Equivalence** ladder this repo can walk today
 * (research: `portable-intensity-anchors.md` §4.3, rung 1).
 *
 * The ladder's other four rungs — a result at another distance converted through
 * Riegel / Daniels–Gilbert / Critical Speed, a stored **Threshold** read as a
 * virtual race result, a mean-maximal-curve fit, and then nothing truthful to
 * say — are deliberately absent. Each needs an equivalence model shipped as
 * versioned reference data with its own confidence rule (ratio ≤ 2 high, ≤ 4
 * medium, > 4 low), and a resolution that cannot state which rung it came from
 * cannot be rendered honestly. So this module resolves rung 1 or nothing: a
 * `racePace` target with no result at that distance degrades to its bare
 * authored form, exactly as a `powerPct` target does without an FTP.
 */
import {
	originPlatformOf,
	type OriginPlatform,
} from '#app/integrations/shared/origin-platform.ts'
import { prisma } from './db.server.ts'
import {
	paceSecPerKm,
	raceAnchorForDistance,
} from './performance-result-entry.ts'
import { RACE_ANCHOR_DISTANCE_M, type RaceAnchor } from './workout-schema.ts'
import { type RaceAnchorPaces } from './zones/index.ts'

export { raceAnchorForDistance }

export type ResultRow = {
	id: string
	distanceM: number
	timeSec: number
	occurredAt: Date
	/** The Event this result was read from; null for a typed one. */
	eventId: string | null
	createdAt?: Date
	/** The result's binding set (ADR 0117 §4): its Recording's Origin Platform
	 * and aliases'. Empty for a typed result, which binds nothing. */
	origins: readonly OriginPlatform[]
}

/** The result a Race Anchor resolves against, and what it binds. */
export type ChosenResult = {
	id: string
	paceSecPerKm: number
	origins: readonly OriginPlatform[]
}

export type RaceAnchorChoices = Partial<Record<RaceAnchor, ChosenResult>>

/** Whether `row` is chosen over `held` at the same anchor: the newer day, and
 * on the same day the typed one (ADR 0117 §3: typing a time for a race the
 * watch also measured is a correction), then the later written. */
function preferred(row: ResultRow, held: ResultRow): boolean {
	const day = row.occurredAt.getTime() - held.occurredAt.getTime()
	if (day !== 0) return day > 0
	const typed = Number(row.eventId == null) - Number(held.eventId == null)
	if (typed !== 0) return typed > 0
	return (row.createdAt?.getTime() ?? 0) > (held.createdAt?.getTime() ?? 0)
}

/**
 * The result each **Race Anchor** resolves against — the **most recent** at
 * each distance, not the fastest — with its pace in seconds per km and its
 * binding set. The one place the choice is made: the targets, Planned TSS, the
 * Event page's line and _Løpsresultater_'s _I bruk_ all read it.
 *
 * Recency rather than best is the deliberate call: a prescription resolves
 * against what this athlete can do *now*, and a personal best from three
 * seasons ago would prescribe a target they cannot hold. The fastest-ever
 * reading is a **Personal Record**, which is a different question with its own
 * derivation (ADR 0021). A result at a distance that is no anchor resolves
 * nothing.
 */
export function raceAnchorChoicesFrom(
	rows: readonly ResultRow[],
): RaceAnchorChoices {
	const newest = new Map<RaceAnchor, ResultRow>()
	for (const row of rows) {
		const anchor = raceAnchorForDistance(row.distanceM)
		if (!anchor) continue
		const held = newest.get(anchor)
		if (!held || preferred(row, held)) newest.set(anchor, row)
	}
	const choices: RaceAnchorChoices = {}
	for (const [anchor, row] of newest) {
		const pace = paceSecPerKm(row.timeSec, row.distanceM)
		if (pace == null) continue
		choices[anchor] = { id: row.id, paceSecPerKm: pace, origins: row.origins }
	}
	return choices
}

/** The paces a `racePace` target resolves against, from the choices. */
export function pacesOf(choices: RaceAnchorChoices): RaceAnchorPaces {
	const paces: RaceAnchorPaces = {}
	for (const [anchor, chosen] of Object.entries(choices) as Array<
		[RaceAnchor, ChosenResult]
	>) {
		paces[anchor] = chosen.paceSecPerKm
	}
	return paces
}

/** A discipline's choices as the resolver profile carries them: the paces a
 * target resolves against, and the binding set of each (ADR 0117 §4). */
export function raceAnchorFields(choices: RaceAnchorChoices): {
	raceAnchorPaces: RaceAnchorPaces
	raceAnchorOrigins: Partial<Record<RaceAnchor, readonly OriginPlatform[]>>
} {
	const raceAnchorOrigins: Partial<
		Record<RaceAnchor, readonly OriginPlatform[]>
	> = {}
	for (const [anchor, chosen] of Object.entries(choices) as Array<
		[RaceAnchor, ChosenResult]
	>) {
		raceAnchorOrigins[anchor] = chosen.origins
	}
	return { raceAnchorPaces: pacesOf(choices), raceAnchorOrigins }
}

/** {@link raceAnchorChoicesFrom}, as the paces alone. */
export function raceAnchorPacesFrom(
	rows: readonly ResultRow[],
): RaceAnchorPaces {
	return pacesOf(raceAnchorChoicesFrom(rows))
}

/** The union of the binding sets of the results chosen at `anchors`. */
export function originsOfChoices(
	choices: RaceAnchorChoices,
	anchors: Iterable<RaceAnchor>,
): OriginPlatform[] {
	const origins = new Set<OriginPlatform>()
	for (const anchor of anchors) {
		for (const origin of choices[anchor]?.origins ?? []) origins.add(origin)
	}
	return [...origins]
}

const resultRowSelect = {
	id: true,
	discipline: true,
	distanceM: true,
	timeSec: true,
	occurredAt: true,
	eventId: true,
	createdAt: true,
	activityImport: {
		select: {
			originPlatform: true,
			aliases: { select: { originPlatform: true } },
		},
	},
} as const

/**
 * {@link raceAnchorChoicesFrom} for one athlete's stored results, per
 * discipline and in one query: each discipline's choices read off its own
 * results only, and a discipline with none gets `{}`. What
 * `getDisciplineThresholds` and Planned TSS both read, so a target on screen
 * and the stress it is planned with resolve against the same result.
 */
export async function raceAnchorChoicesByDiscipline(
	athleteProfileId: string,
	disciplines: readonly string[],
): Promise<Map<string, RaceAnchorChoices>> {
	const choices = new Map<string, RaceAnchorChoices>()
	if (disciplines.length === 0) return choices
	const rows = await prisma.performanceResult.findMany({
		where: {
			athleteProfileId,
			discipline: { in: [...disciplines] },
			distanceM: { in: Object.values(RACE_ANCHOR_DISTANCE_M) },
		},
		select: resultRowSelect,
		orderBy: { occurredAt: 'desc' },
	})
	const byDiscipline = new Map<string, ResultRow[]>()
	for (const { discipline, activityImport, ...row } of rows) {
		const result: ResultRow = {
			...row,
			origins: activityImport
				? [
						...new Set([
							originPlatformOf(activityImport.originPlatform),
							...activityImport.aliases.map((alias) =>
								originPlatformOf(alias.originPlatform),
							),
						]),
					]
				: [],
		}
		const held = byDiscipline.get(discipline)
		if (held) held.push(result)
		else byDiscipline.set(discipline, [result])
	}
	for (const discipline of disciplines) {
		choices.set(
			discipline,
			raceAnchorChoicesFrom(byDiscipline.get(discipline) ?? []),
		)
	}
	return choices
}

/** The choices for one athlete, by their user id; `{}` per discipline without
 * a profile. */
export async function raceAnchorChoicesForUser(
	userId: string,
	disciplines: readonly string[],
): Promise<Map<string, RaceAnchorChoices>> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { id: true },
	})
	if (!profile) {
		return new Map(disciplines.map((discipline) => [discipline, {}]))
	}
	return raceAnchorChoicesByDiscipline(profile.id, disciplines)
}
