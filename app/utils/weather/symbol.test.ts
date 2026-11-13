import { expect, test } from 'vitest'
import { readMetSymbol, WEATHER_SYMBOLS } from './symbol.ts'

test('MET symbol codes read into trainm8’s families, night as a flag', () => {
	expect(readMetSymbol('clearsky_day')).toEqual({
		symbol: 'clear-sky',
		night: false,
	})
	expect(readMetSymbol('fair_night')).toEqual({ symbol: 'fair', night: true })
	expect(readMetSymbol('partlycloudy_polartwilight')).toEqual({
		symbol: 'partly-cloudy',
		night: true,
	})
	expect(readMetSymbol('cloudy')).toEqual({ symbol: 'cloudy', night: false })
	expect(readMetSymbol('fog')?.symbol).toBe('fog')
})

test('showers fold into their precipitation; intensity and thunder stay', () => {
	expect(readMetSymbol('lightrain')?.symbol).toBe('light-rain')
	expect(readMetSymbol('rainshowers_day')?.symbol).toBe('rain')
	expect(readMetSymbol('heavysleet')?.symbol).toBe('heavy-sleet')
	expect(readMetSymbol('heavysnowshowersandthunder_night')).toEqual({
		symbol: 'heavy-snow-and-thunder',
		night: true,
	})
	expect(readMetSymbol('rainandthunder')?.symbol).toBe('rain-and-thunder')
	// MET's own spellings with a doubled `s`.
	expect(readMetSymbol('lightssleetshowersandthunder_day')?.symbol).toBe(
		'light-sleet-and-thunder',
	)
	expect(readMetSymbol('lightssnowshowersandthunder_day')?.symbol).toBe(
		'light-snow-and-thunder',
	)
	expect(readMetSymbol('lightsnow')?.symbol).toBe('light-snow')
})

test('an undocumented code is no symbol, never a guess', () => {
	expect(readMetSymbol('hail')).toBeNull()
	expect(readMetSymbol('')).toBeNull()
})

test('every symbol is reachable from a MET code', () => {
	const codes = [
		'clearsky',
		'fair',
		'partlycloudy',
		'cloudy',
		'fog',
		...['rain', 'sleet', 'snow'].flatMap((p) =>
			['light', '', 'heavy'].flatMap((i) => [`${i}${p}`, `${i}${p}andthunder`]),
		),
	]
	const read = new Set(codes.map((code) => readMetSymbol(code)?.symbol))
	expect([...read].sort()).toEqual([...WEATHER_SYMBOLS].sort())
})
