import { type Route } from './+types/oversikt.ts'
import { loadLandscape } from './__landscape.server.ts'
import { Landscape } from './__landscape.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	return loadLandscape(request)
}

export const meta = () => [{ title: 'Sti · Oversikten' }]

/** Oversikten: the whole path from far away. The same surface as Nærbildet. */
export default function Oversikten({ loaderData }: Route.ComponentProps) {
	return <Landscape data={loaderData} initialZoom="far" />
}
