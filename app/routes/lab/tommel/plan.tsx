import { useLoaderData } from 'react-router'
import {
	type PlanOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { type Route } from './+types/plan.ts'
import { athleteOrStart } from './__load.server.ts'
import { BackDown, usePullBack } from './__nav.tsx'
import { PlanSheet } from './__plansheet.tsx'

export const meta = () => [{ title: 'Planarket · Tommel' }]

export async function loader({ request }: Route.LoaderArgs) {
	await athleteOrStart(request)
	const [plan, week] = await Promise.all([
		runCapability(request, 'plan', {}),
		runCapability(request, 'week', {}),
	])
	if (!plan.ok) throw new Response(plan.message, { status: 500 })
	return {
		plan: (plan.value as PlanOutput).plan,
		week: week.ok ? (week.value as WeekOutput) : null,
	}
}

export default function Plan() {
	const { plan, week } = useLoaderData<typeof loader>()
	usePullBack()
	return (
		<main className="tm-page" aria-label="Planarket">
			<BackDown label="Lukk" />
			{plan ? (
				<PlanSheet plan={plan} week={week} />
			) : (
				<>
					<h1>Ingen plan ennå.</h1>
					<p className="tm-lead">
						Planen lages når du har svart på kortene i starten.
					</p>
				</>
			)}
		</main>
	)
}
