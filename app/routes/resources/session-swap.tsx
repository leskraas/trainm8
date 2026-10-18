/**
 * **Bytt økt**'s picker (spec #558 S5, #579): Bibliotek read as a list to pick
 * today's session from. Its three parts are Bibliotek's own — the Catalogue,
 * the strength programs (one row per day) and the exercises — each read
 * through the same guard its own page uses, so the picker never offers what
 * Bibliotek would not show. Nothing here writes: the pick posts to Juster's
 * route (`resources/session-adjust.tsx`, `intent: swap`).
 *
 * A search narrows the part shown. The Catalogue lists today's sport first,
 * and caps the list, saying how many it holds; with no search, the exercises
 * are the lifts the athlete has put in a session, like Bibliotek's _Dine løft_.
 */
import { requireUserId } from '#app/utils/auth.server.ts'
import { listCatalogue } from '#app/utils/catalogue.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { searchExercises } from '#app/utils/exercise-search.ts'
import { SWAP_SOURCES, type SwapSource } from '#app/utils/juster.ts'
import { cardWorkoutSelect } from '../training/__catalogue-card.server.ts'
import { buildCatalogueCard } from '../training/__catalogue-card.ts'
import { readLibraryLifts } from '../training/__library-section.server.ts'
import { type Route } from './+types/session-swap.ts'

/** How many rows one part shows. */
const PICKER_CAP = 30

export type SwapPickRow = {
	id: string
	title: string
	/** The session as a Token Sentence, where it has one. */
	sentence: string | null
	/** `45 min`, `5 øvelser`: the lead figures. */
	figures: string[]
}

function readSource(raw: string | null): SwapSource {
	return (SWAP_SOURCES as readonly string[]).includes(raw ?? '')
		? (raw as SwapSource)
		: 'catalogue'
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const params = new URL(request.url).searchParams
	const from = readSource(params.get('from'))
	const q = (params.get('q') ?? '').trim()
	const discipline = params.get('discipline')

	const { rows, total } =
		from === 'catalogue'
			? await catalogueRows(userId, q, discipline)
			: from === 'program'
				? await programRows(q)
				: await exerciseRows(userId, q)
	return { from, q, rows, total }
}

async function cards(ids: string[]) {
	const trees = await prisma.workout.findMany({
		where: { id: { in: ids } },
		select: cardWorkoutSelect,
	})
	const byId = new Map(trees.map((tree) => [tree.id, tree]))
	return (id: string) => {
		const tree = byId.get(id) ?? null
		const card = buildCatalogueCard({ workout: tree, level: null })
		// A session of one timed step says nothing its minutes do not: the
		// sentence would only repeat the figure under it.
		const steps = tree?.blocks.flatMap((block) => block.steps) ?? []
		const oneTimedStep = steps.length === 1 && steps[0]!.kind !== 'strength'
		return oneTimedStep ? { ...card, sentence: null } : card
	}
}

async function catalogueRows(
	userId: string,
	q: string,
	discipline: string | null,
) {
	const entries = await listCatalogue({ viewerId: userId, q: q || undefined })
	// Today's sport first; the Catalogue's own order within each.
	const ordered = discipline
		? [
				...entries.filter((entry) => entry.workout.discipline === discipline),
				...entries.filter((entry) => entry.workout.discipline !== discipline),
			]
		: entries
	const page = ordered.slice(0, PICKER_CAP)
	const card = await cards(page.map((entry) => entry.workout.id))
	const rows: SwapPickRow[] = page.map((entry) => {
		const { sentence, figures } = card(entry.workout.id)
		return {
			id: entry.workout.id,
			title: entry.workout.title,
			sentence,
			figures,
		}
	})
	return { rows, total: entries.length }
}

async function programRows(q: string) {
	const days = await prisma.strengthProgramDay.findMany({
		where: { program: { authorship: 'system' } },
		orderBy: [{ program: { name: 'asc' } }, { orderIndex: 'asc' }],
		select: {
			id: true,
			workoutId: true,
			program: { select: { name: true } },
			workout: { select: { title: true } },
		},
	})
	const needle = q.toLocaleLowerCase('nb')
	const matching = needle
		? days.filter((day) =>
				`${day.program.name} ${day.workout.title}`
					.toLocaleLowerCase('nb')
					.includes(needle),
			)
		: days
	const page = matching.slice(0, PICKER_CAP)
	const card = await cards(page.map((day) => day.workoutId))
	const rows: SwapPickRow[] = page.map((day) => {
		const { sentence, figures } = card(day.workoutId)
		return { id: day.id, title: day.workout.title, sentence, figures }
	})
	return { rows, total: matching.length }
}

async function exerciseRows(userId: string, q: string) {
	if (!q) {
		const lifts = await readLibraryLifts(userId)
		const rows: SwapPickRow[] = lifts.map((lift) => ({
			id: lift.id,
			title: lift.name,
			sentence: null,
			figures: [],
		}))
		return { rows, total: rows.length }
	}
	// The bank Bibliotek's exercise list searches: trainm8's rows and the
	// athlete's own, by name and Norwegian alias.
	const bank = await prisma.exercise.findMany({
		where: { OR: [{ authorship: 'system' }, { createdByAthleteId: userId }] },
		select: {
			id: true,
			name: true,
			aliases: {
				where: { variantId: null },
				select: { text: true, locale: true },
				orderBy: { text: 'asc' },
			},
		},
		orderBy: [{ name: 'asc' }],
	})
	const hits = searchExercises(bank, q)
	const rows: SwapPickRow[] = hits
		.slice(0, PICKER_CAP)
		.map(({ exercise, alias }) => ({
			id: exercise.id,
			title: exercise.name,
			sentence: alias,
			figures: [],
		}))
	return { rows, total: hits.length }
}
