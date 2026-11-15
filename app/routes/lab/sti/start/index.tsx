import { redirect } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { BASE } from '../__ui.tsx'
import { type Route } from './+types/index.ts'

/** `/start` picks up getting started where the athlete left it. */
export async function loader({ request }: Route.LoaderArgs) {
	const me = await runCapability(request, 'athlete', {})
	if (!me.ok) return redirect(`${BASE}/start/1`)
	const s = me.value.setup
	if (s.complete) return redirect(BASE)
	const step =
		s.next === 'connect' ? 6 : s.next === 'goal' ? 7 : s.next === 'plan' ? 7 : 1
	return redirect(`${BASE}/start/${step}`)
}
