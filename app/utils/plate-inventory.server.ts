/**
 * **The gym profile** — reading and writing what plates, bars and dumbbells
 * *this* athlete's gym actually owns.
 *
 * The whole reason the entity exists: without it a plate line is a lie about
 * somebody else's rack, which is why ADR 0056 recorded the calculator as not
 * built. So there is deliberately **no seeded default inventory**. A gym nobody
 * has described is an absence the surface states, not a 20 kg bar with four 20s
 * a side that the athlete never claimed to own.
 *
 * Queries and writes; decides nothing. Every rule about what a rack can make
 * lives in the pure `strength/plates.ts`.
 */
import { prisma } from './db.server.ts'
import {
	type PlateInventory,
	type PlateOptions,
	PlateInventorySchema,
} from './strength/plates.ts'
import { type LoadValueKind } from './strength-log.ts'

/** The stored row with its JSON columns parsed — the shape a surface edits. */
export type GymProfile = {
	id: string
	name: string
	inventory: PlateInventory
}

/** Parse the three JSON columns, refusing rather than guessing: a column a hand
 * edit broke is an inventory this athlete has not stated, and inventing plates
 * from it would put a weight on the bar nobody owns. */
function parseInventory(row: {
	bars: string
	plates: string
	fixedDumbbellsKg: string | null
}): PlateInventory | null {
	try {
		const parsed = PlateInventorySchema.safeParse({
			bars: JSON.parse(row.bars),
			plates: JSON.parse(row.plates),
			fixedDumbbellsKg:
				row.fixedDumbbellsKg == null ? null : JSON.parse(row.fixedDumbbellsKg),
		})
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

const inventorySelect = {
	id: true,
	name: true,
	bars: true,
	plates: true,
	fixedDumbbellsKg: true,
	isDefault: true,
} as const

/**
 * This athlete's gym, or `null` where they have not described one.
 *
 * The default inventory wins; failing that, the first by name, so a single-gym
 * athlete never has to know the concept exists.
 */
export async function getGymProfile(
	userId: string,
): Promise<GymProfile | null> {
	const rows = await prisma.plateInventory.findMany({
		where: { athleteProfile: { userId } },
		orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
		select: inventorySelect,
	})
	for (const row of rows) {
		const inventory = parseInventory(row)
		if (inventory) return { id: row.id, name: row.name, inventory }
	}
	return null
}

/** One named gym by id, for the variant that names its own inventory. */
export async function getGymProfileById(
	userId: string,
	id: string,
): Promise<GymProfile | null> {
	const row = await prisma.plateInventory.findFirst({
		where: { id, athleteProfile: { userId } },
		select: inventorySelect,
	})
	if (!row) return null
	const inventory = parseInventory(row)
	return inventory ? { id: row.id, name: row.name, inventory } : null
}

export type SaveGymResult =
	| { ok: true; id: string }
	| { ok: false; reason: 'no-profile' }

/**
 * Write the gym whole.
 *
 * Written whole rather than diffed, because that is what the JSON columns are
 * for: the list is read only with its parent and never queried across athletes,
 * and a partial update of a bounded list is how a plate count drifts out of step
 * with what is on the wall.
 */
export async function saveGymProfile(input: {
	userId: string
	name?: string
	inventory: PlateInventory
}): Promise<SaveGymResult> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: input.userId },
		select: { id: true },
	})
	if (!profile) return { ok: false, reason: 'no-profile' }

	const name = input.name?.trim() || 'My gym'
	const data = {
		bars: JSON.stringify(input.inventory.bars),
		plates: JSON.stringify(input.inventory.plates),
		fixedDumbbellsKg:
			input.inventory.fixedDumbbellsKg == null
				? null
				: JSON.stringify(input.inventory.fixedDumbbellsKg),
	}
	const row = await prisma.plateInventory.upsert({
		where: { athleteProfileId_name: { athleteProfileId: profile.id, name } },
		create: { athleteProfileId: profile.id, name, isDefault: true, ...data },
		update: data,
		select: { id: true },
	})
	return { ok: true, id: row.id }
}

/**
 * The **Load Semantics** for one exercise, as {@link PlateOptions} plus the
 * inventory that applies — the variant's where it names one, this athlete's gym
 * otherwise.
 *
 * A variant that declares `isFixed` is quoted through as the `perSide` kind,
 * which is what the solver reads as *"pick a bell off the rack"*.
 */
export type ExercisePlateContext = {
	inventory: PlateInventory
	gymName: string
	options: PlateOptions
	/** The variant's own display name, where one is the referent. */
	variantName: string | null
}

export async function getExercisePlateContext(input: {
	userId: string
	exerciseId: string | null
	bodyweightKg: number | null
	/** Fallback gym, so a view resolving many exercises reads it once. */
	gym?: GymProfile | null
}): Promise<ExercisePlateContext | null> {
	const gym =
		input.gym !== undefined ? input.gym : await getGymProfile(input.userId)
	if (!gym) return null

	const variant = input.exerciseId
		? await prisma.exerciseVariant.findFirst({
				where: { exerciseId: input.exerciseId },
				orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
				select: {
					displayName: true,
					loadKind: true,
					barKg: true,
					perSideMultiplier: true,
					isFixed: true,
					isAssisting: true,
					useBodyweightForBar: true,
					inventoryProfileId: true,
				},
			})
		: null

	if (!variant) {
		// No variant on file is not an unknown movement — it is a barbell
		// assumption, and it is the same assumption the log grid's load picker
		// already opens on. Stated here once rather than implied in three places.
		return {
			inventory: gym.inventory,
			gymName: gym.name,
			options: { kind: 'external' },
			variantName: null,
		}
	}

	const named =
		variant.inventoryProfileId != null
			? await getGymProfileById(input.userId, variant.inventoryProfileId)
			: null
	const applied = named ?? gym
	const kind: LoadValueKind = variant.isFixed
		? 'perSide'
		: variant.isAssisting
			? 'assisted'
			: variant.useBodyweightForBar
				? 'bodyweightPlus'
				: ((variant.loadKind as LoadValueKind) ?? 'external')

	return {
		inventory: applied.inventory,
		gymName: applied.name,
		options: {
			kind,
			multiplier: variant.perSideMultiplier,
			...(variant.barKg != null ? { barKg: variant.barKg } : {}),
			bodyweightKg: input.bodyweightKg,
		},
		variantName: variant.displayName,
	}
}
