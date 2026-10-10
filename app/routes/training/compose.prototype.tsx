/**
 * PROTOTYPE — four ways to compose a session on a phone, switchable via
 * `?variant=A|B|C|D`, on the throwaway `/training/compose/prototype` route.
 *
 * The question: what is the best way to build a session as a sentence of
 * tokens — type it, tap it together, start from a suggestion, or a quick line
 * that steps up into a Drawer? Every variant writes into the same in-memory
 * week with the real cardio reader (`parseWorkoutSentence`), the real week sum
 * (`resources/week-sum` → `weekSumPreview`), and the same Angre toast. The
 * small counter under the list measures taps, keystrokes and seconds from the
 * moment a day is opened.
 *
 * Dev-gated like `/training/plan/prototype`: nothing here may exist in
 * production. Nothing is written to the database.
 *
 * Verdict: see the report in the PR description / commit message; fill in the
 * owner's pick here before deleting.
 *
 * THROWAWAY — do not ship.
 */
import { useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getExerciseCatalog } from '#app/utils/workout.server.ts'
import { type Route } from './+types/compose.prototype.ts'
import { ComposeStore, nextWeek } from './__prototype-compose-shared.tsx'
import {
	VariantA,
	VariantB,
	VariantC,
	VariantD,
} from './__prototype-compose-variants.tsx'
import { PrototypeSwitcher } from './__prototype-switcher.tsx'

const VARIANTS = [
	{ key: 'A', name: 'Skriv — linja i raden, levende brikker' },
	{ key: 'B', name: 'Bygg — brikker og steppere i en Drawer' },
	{ key: 'C', name: 'Forslag først — fire kilder, så juster' },
	{ key: 'D', name: 'Rask → Drawer — snap-punkt til grundig' },
]

function requireDevelopment() {
	if (process.env.NODE_ENV !== 'development') {
		throw new Response('Not found', { status: 404 })
	}
}

export async function loader({ request }: Route.LoaderArgs) {
	requireDevelopment()
	const userId = await requireUserId(request)
	const [timezone, exercises] = await Promise.all([
		getAthleteTimezone(userId),
		getExerciseCatalog(userId),
	])
	return {
		todayKey: localDate(new Date(), timezone),
		catalogue: exercises.map((e) => e.name),
	}
}

export default function ComposePrototype({ loaderData }: Route.ComponentProps) {
	const [params] = useSearchParams()
	const variant = params.get('variant') ?? 'A'
	return (
		<main className="mx-auto flex w-full max-w-[430px] flex-col pb-40">
			<header className="flex flex-col gap-0.5 px-4 py-3">
				<h1 className="text-heading">Neste uke</h1>
				<p className="text-footnote text-muted-foreground">
					Prototype · trykk + på en dag · ingenting lagres
				</p>
			</header>
			<ComposeStore
				// Re-mounted per variant, so each starts from an empty week.
				key={variant}
				days={nextWeek(loaderData.todayKey)}
				catalogue={loaderData.catalogue}
			>
				{variant === 'A' ? <VariantA /> : null}
				{variant === 'B' ? <VariantB /> : null}
				{variant === 'C' ? <VariantC /> : null}
				{variant === 'D' ? <VariantD /> : null}
			</ComposeStore>
			<PrototypeSwitcher variants={VARIANTS} current={variant} />
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
