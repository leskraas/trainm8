import { redirect } from 'react-router'
import { type Route } from './+types/$.ts'

/**
 * Any other address under `/start` (#578): the old first run's screens
 * (`/start/funn`, `/start/sporsmal`, `/start/plan`, `/start/uker`) are gone,
 * and a bookmark or a link to one leads into the new start at its first
 * screen. Their answers are not carried: the old questions were not these.
 */
export async function loader(_args: Route.LoaderArgs) {
	throw redirect('/start/niva')
}
