/**
 * A **Day Forecast** as the screen and the server share it (ADR 0114 §3), and
 * the glyph each symbol is drawn with. A runtime leaf: the `/` loader sends
 * these to I dag, and `__calm-today.ts` reads them there.
 */
import { type WeatherSymbol } from './symbol.ts'

/** One day's forecast at its Forecast Hour, from one forecast step. */
export type DayForecast = {
	/** The Forecast Hour, an ISO instant in UTC. */
	at: string
	symbol: WeatherSymbol
	/** Night or polar twilight at that step: the glyph is a moon. */
	night: boolean
	temperatureC: number
	/** Per hour: a six-hour step's amount is spread over its hours. */
	precipitationMm: number
}

/**
 * The monochrome glyphs a symbol is drawn with (design #433 §5): seven Tabler
 * glyphs and one Hugeicons partly-cloudy. A clear, fair or partly cloudy night
 * is a moon; anything falling keeps its precipitation's glyph by night too,
 * since the rain is what the athlete plans around. Sleet draws as rain; the
 * Norwegian word carries the difference.
 */
export const WEATHER_GLYPHS = [
	'sun',
	'moon',
	'partly-cloudy',
	'cloud',
	'cloud-rain',
	'cloud-snow',
	'cloud-storm',
	'cloud-fog',
] as const
export type WeatherGlyph = (typeof WEATHER_GLYPHS)[number]

export function weatherGlyph(
	symbol: WeatherSymbol,
	night: boolean,
): WeatherGlyph {
	if (symbol.endsWith('-and-thunder')) return 'cloud-storm'
	if (symbol.endsWith('snow')) return 'cloud-snow'
	if (symbol.endsWith('rain') || symbol.endsWith('sleet')) return 'cloud-rain'
	switch (symbol) {
		case 'clear-sky':
		case 'fair':
			return night ? 'moon' : 'sun'
		case 'partly-cloudy':
			return night ? 'moon' : 'partly-cloudy'
		case 'fog':
			return 'cloud-fog'
		default:
			return 'cloud'
	}
}
