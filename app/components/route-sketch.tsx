import { decodePolyline } from '#app/utils/polyline.ts'

/**
 * A self-contained SVG trace of a recorded route, drawn straight from an encoded
 * polyline — no map tiles, no network, no external dependency. Longitude is
 * scaled by cos(latitude) so the shape keeps a roughly correct aspect ratio, and
 * the viewBox matches the route's own proportions so it never looks stretched.
 * Renders nothing when the polyline is empty or degenerate.
 */
export function RouteSketch({
	polyline,
	className,
}: {
	polyline: string
	className?: string
}) {
	const coords = decodePolyline(polyline)
	if (coords.length < 2) return null

	const meanLat = coords.reduce((sum, [lat]) => sum + lat, 0) / coords.length
	const lngScale = Math.cos((meanLat * Math.PI) / 180)

	let minX = Infinity
	let maxX = -Infinity
	let minY = Infinity
	let maxY = -Infinity
	const projected = coords.map(([lat, lng]) => {
		const x = lng * lngScale
		const y = lat
		if (x < minX) minX = x
		if (x > maxX) maxX = x
		if (y < minY) minY = y
		if (y > maxY) maxY = y
		return { x, y }
	})

	const spanX = maxX - minX || 1e-6
	const spanY = maxY - minY || 1e-6
	const aspect = spanX / spanY
	const vbW = aspect >= 1 ? 100 : 100 * aspect
	const vbH = aspect >= 1 ? 100 / aspect : 100
	const PAD = 4

	const d = projected
		.map(({ x, y }, i) => {
			const px = PAD + ((x - minX) / spanX) * (vbW - 2 * PAD)
			// Flip Y: latitude grows northward, SVG y grows downward.
			const py = PAD + (1 - (y - minY) / spanY) * (vbH - 2 * PAD)
			return `${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`
		})
		.join(' ')

	return (
		<svg
			viewBox={`0 0 ${vbW.toFixed(2)} ${vbH.toFixed(2)}`}
			className={className}
			role="img"
			aria-label="Route map"
			preserveAspectRatio="xMidYMid meet"
		>
			<path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	)
}
