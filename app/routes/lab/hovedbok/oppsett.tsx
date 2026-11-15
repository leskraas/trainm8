import { redirect } from 'react-router'
import { type AthleteOutput } from '#app/lab/engine/reads.types.ts'
import { type Route } from './+types/oppsett.ts'
import { cap } from './__engine.server.ts'
import { BASE } from './__ui.tsx'

/** The setup sheet lives at the top of an empty book; once there is a plan, its answers live in the settings. */
export async function loader({ request }: Route.LoaderArgs) {
	const me = await cap<AthleteOutput>(request, 'athlete')
	if (me.ok && me.value.setup.complete)
		throw redirect(`${BASE}/innstillinger/tilgjengelighet`)
	throw redirect(BASE)
}

export default function Oppsett() {
	return null
}
