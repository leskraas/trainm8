/**
 * The **Home Place**'s storage (ADR 0115 §2): read, choose, remove. Choosing
 * upserts the one `HomePlace` row, rounded to 2 decimals here whatever the
 * form sent, and refuses a point outside the area Kartverket covers; _Fjern_
 * is one delete. Nothing here sees the search text that found the place.
 */
import { z } from 'zod/v4'
import { ensureAthleteProfile } from './athlete.server.ts'
import { prisma } from './db.server.ts'
import {
	type HomePlace,
	isInHomePlaceArea,
	roundedPoint,
} from './home-place.ts'

export { type HomePlace }

const text = z.string().trim().min(1).max(120)

/** A chosen place as the form posts it: Kartverket's match, sent back. */
export const HomePlaceInputSchema = z.object({
	name: text,
	kind: text,
	municipality: text,
	county: text,
	latitude: z.coerce.number(),
	longitude: z.coerce.number(),
})

const homePlaceSelect = {
	name: true,
	kind: true,
	municipality: true,
	county: true,
	latitude: true,
	longitude: true,
} as const

export async function readHomePlace(userId: string): Promise<HomePlace | null> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { homePlace: { select: homePlaceSelect } },
	})
	return profile?.homePlace ?? null
}

export type SetHomePlaceResult =
	| { ok: true; place: HomePlace }
	| { ok: false; reason: 'outside-area' }

/** Choose the athlete's Home Place, replacing any they had. */
export async function setHomePlace(
	userId: string,
	input: HomePlace,
): Promise<SetHomePlaceResult> {
	const point = roundedPoint(input)
	if (!isInHomePlaceArea(point)) return { ok: false, reason: 'outside-area' }
	const place: HomePlace = {
		name: input.name,
		kind: input.kind,
		municipality: input.municipality,
		county: input.county,
		...point,
	}
	await prisma.$transaction(async (db) => {
		const athleteProfileId = await ensureAthleteProfile(userId, db)
		await db.homePlace.upsert({
			where: { athleteProfileId },
			create: { athleteProfileId, ...place },
			update: place,
		})
	})
	return { ok: true, place }
}

/** _Fjern_: the athlete has no Home Place, and I dag no weather. */
export async function removeHomePlace(userId: string): Promise<void> {
	await prisma.homePlace.deleteMany({ where: { athleteProfile: { userId } } })
}
