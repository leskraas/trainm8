export function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60

	if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`
	if (hours > 0) return `${hours} h`
	if (minutes > 0 && secs > 0) return `${minutes} min ${secs} s`
	if (minutes > 0) return `${minutes} min`
	return `${secs} s`
}

export function formatDistance(meters: number): string {
	if (meters >= 1000) {
		const km = meters / 1000
		return Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`
	}
	return `${meters} m`
}
