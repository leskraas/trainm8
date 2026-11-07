/**
 * trainm8's own weather symbol (ADR 0113 §5): a closed English family enum
 * that MET Norway's `symbol_code` is read into once, at the edge, so MET's
 * vocabulary never becomes part of trainm8's interface. The glyph on I dag,
 * the Norwegian word in `labels.ts` and `get_today`'s `symbol` all read this.
 *
 * Showers fold into their precipitation (_regnbyger_ is rain), and day, night
 * and polar twilight are a flag beside the symbol rather than three symbols:
 * only the glyph cares (a moon instead of a sun).
 *
 * A runtime leaf: no server code, so the screen and the server share it.
 */

export const WEATHER_SYMBOLS = [
	'clear-sky',
	'fair',
	'partly-cloudy',
	'cloudy',
	'fog',
	'light-rain',
	'rain',
	'heavy-rain',
	'light-sleet',
	'sleet',
	'heavy-sleet',
	'light-snow',
	'snow',
	'heavy-snow',
	'light-rain-and-thunder',
	'rain-and-thunder',
	'heavy-rain-and-thunder',
	'light-sleet-and-thunder',
	'sleet-and-thunder',
	'heavy-sleet-and-thunder',
	'light-snow-and-thunder',
	'snow-and-thunder',
	'heavy-snow-and-thunder',
] as const

export type WeatherSymbol = (typeof WEATHER_SYMBOLS)[number]

export type ReadSymbol = {
	symbol: WeatherSymbol
	/** MET's `_night` (and polar twilight, which is night-dark): a moon, not a sun. */
	night: boolean
}

const PLAIN: Record<string, WeatherSymbol> = {
	clearsky: 'clear-sky',
	fair: 'fair',
	partlycloudy: 'partly-cloudy',
	cloudy: 'cloudy',
	fog: 'fog',
}

/**
 * MET's precipitation codes: `lightrain`, `heavysnowshowersandthunder`, and
 * MET's own two spellings with a doubled `s` (`lightssleetshowersandthunder`,
 * `lightssnowshowersandthunder`), which the optional `s` reads too.
 */
const PRECIPITATION_CODE =
	/^(lights?|heavy)?(rain|sleet|snow)(?:showers)?(andthunder)?$/

/**
 * Read one MET `symbol_code` (`partlycloudy_night`, `lightrain`) into
 * trainm8's symbol. Null for a code MET has not documented, which the caller
 * treats as no forecast rather than a guess.
 */
export function readMetSymbol(code: string): ReadSymbol | null {
	const [base = '', variant] = code.split('_')
	const night = variant === 'night' || variant === 'polartwilight'
	const plain = PLAIN[base]
	if (plain) return { symbol: plain, night }
	const match = PRECIPITATION_CODE.exec(base)
	if (!match) return null
	const [, intensity, precipitation, thunder] = match
	const prefix = intensity?.startsWith('light')
		? 'light-'
		: intensity === 'heavy'
			? 'heavy-'
			: ''
	const symbol = `${prefix}${precipitation}${thunder ? '-and-thunder' : ''}`
	return (WEATHER_SYMBOLS as readonly string[]).includes(symbol)
		? { symbol: symbol as WeatherSymbol, night }
		: null
}
