import { redirect } from 'react-router'
import { requireSimpleStartAthlete } from '#app/utils/first-run/plan.server.ts'
import { type Route } from './+types/index.ts'

/**
 * `/start` (#578): the start's entry is the level screen, _Hvor er du nå?_.
 * An athlete who already has a plan is sent to I dag, where their plan is.
 * The links into the start (I dag's empty state, Plan's invite) land here.
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireSimpleStartAthlete(request)
	throw redirect('/start/niva')
}
