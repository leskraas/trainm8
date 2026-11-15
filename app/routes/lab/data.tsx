import { readLabSnapshot } from '#app/lab/snapshot.server.ts'
import { type Route } from './+types/data.ts'

/** The signed-in athlete's Lab Snapshot as JSON (ADR 0125), for debugging. */
export async function loader({ request }: Route.LoaderArgs) {
	return Response.json(await readLabSnapshot(request))
}
