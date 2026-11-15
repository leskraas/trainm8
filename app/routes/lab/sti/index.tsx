import { useEffect, useState } from 'react'
import { type Route } from './+types/index.ts'
import { loadLandscape } from './__landscape.server.ts'
import { Landscape } from './__landscape.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	return loadLandscape(request)
}

export const meta = () => [{ title: 'Sti' }]

/** Nærbildet: the path up close, centred on today. */
export default function Naerbildet({ loaderData }: Route.ComponentProps) {
	const [zoom, setZoom] = useState<'near' | 'far' | null>(null)
	useEffect(() => {
		try {
			setZoom(sessionStorage.getItem('sti-zoom') === 'far' ? 'far' : 'near')
		} catch {
			setZoom('near')
		}
	}, [])
	return (
		<Landscape
			key={zoom ?? 'x'}
			data={loaderData}
			initialZoom={zoom ?? 'near'}
		/>
	)
}
