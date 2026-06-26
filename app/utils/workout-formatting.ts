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

/** Pace as `m:ss /km` (the unit runners read), from seconds-per-kilometre. */
export function formatPace(secPerKm: number): string {
	const total = Math.round(secPerKm)
	const minutes = Math.floor(total / 60)
	const seconds = total % 60
	return `${minutes}:${String(seconds).padStart(2, '0')} /km`
}

/** Speed as `km/h` (one decimal) from metres-per-second. */
export function formatSpeed(metersPerSec: number): string {
	return `${(metersPerSec * 3.6).toFixed(1)} km/h`
}
