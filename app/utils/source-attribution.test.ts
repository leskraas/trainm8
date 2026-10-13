import { expect, test } from 'vitest'
import {
	derivedAttributionLines,
	recordingSource,
} from './source-attribution.ts'

// What a Recording says about where it came from (ADR 0098 §3): "Garmin
// [device model]" for Garmin, plain "Garmin" with no device, never the
// transport.

test('a Garmin recording names Garmin and the device model, and it is owed', () => {
	expect(
		recordingSource({
			originPlatform: 'garmin',
			deviceName: 'Garmin Forerunner 965',
		}),
	).toEqual({ text: 'Garmin Forerunner 965', owed: true })
})

test('an upload that Garmin data also delivered owes the Garmin credit (ADR 0096 §3)', () => {
	expect(
		recordingSource({
			originPlatform: 'upload',
			deviceName: 'Garmin Forerunner 965',
			aliasOrigins: ['garmin'],
		}),
	).toEqual({ text: 'Garmin Forerunner 965', owed: true })
})

test('an alias from a platform that owes nothing changes nothing', () => {
	expect(
		recordingSource({
			originPlatform: 'upload',
			deviceName: 'COROS PACE 3',
			aliasOrigins: ['intervalsicu'],
		}),
	).toEqual({ text: 'COROS PACE 3', owed: false })
})

test('a Garmin device named without the brand still reads "Garmin [device model]"', () => {
	expect(
		recordingSource({ originPlatform: 'garmin', deviceName: 'Edge 840' }),
	).toEqual({ text: 'Garmin Edge 840', owed: true })
	expect(
		recordingSource({
			originPlatform: 'garmin',
			deviceName: 'GARMIN fenix 8',
		}),
	).toEqual({ text: 'Garmin fenix 8', owed: true })
})

test('a brand joined to the model by an underscore or dash is not said twice', () => {
	expect(
		recordingSource({
			originPlatform: 'garmin',
			deviceName: 'Garmin_fēnix®8_Pro',
		}),
	).toEqual({ text: 'Garmin fēnix®8_Pro', owed: true })
	expect(
		recordingSource({ originPlatform: 'garmin', deviceName: 'garmin-edge' }),
	).toEqual({ text: 'Garmin edge', owed: true })
	// A name that only starts with the brand's letters is not the brand.
	expect(
		recordingSource({ originPlatform: 'garmin', deviceName: 'Garminator 2' }),
	).toEqual({ text: 'Garmin Garminator 2', owed: true })
})

test('a Garmin recording with no device says plain "Garmin"', () => {
	expect(
		recordingSource({ originPlatform: 'garmin', deviceName: null }),
	).toEqual({ text: 'Garmin', owed: true })
	expect(
		recordingSource({ originPlatform: 'garmin', deviceName: '  ' }),
	).toEqual({ text: 'Garmin', owed: true })
})

test('a Polar recording credits Polar', () => {
	expect(
		recordingSource({ originPlatform: 'polar', deviceName: 'Polar Grit X2' }),
	).toEqual({ text: 'Polar Grit X2', owed: true })
	expect(
		recordingSource({ originPlatform: 'polar', deviceName: null }),
	).toEqual({ text: 'Polar', owed: true })
})

test('other platforms name their device or the platform, unowed', () => {
	expect(
		recordingSource({ originPlatform: 'coros', deviceName: 'COROS PACE 3' }),
	).toEqual({ text: 'COROS PACE 3', owed: false })
	expect(
		recordingSource({ originPlatform: 'strava', deviceName: null }),
	).toEqual({ text: 'Strava', owed: false })
	expect(
		recordingSource({ originPlatform: 'upload', deviceName: null }),
	).toEqual({ text: 'Opplastet fil', owed: false })
	expect(
		recordingSource({ originPlatform: 'intervalsicu', deviceName: null }),
	).toEqual({ text: 'intervals.icu', owed: false })
})

test('an unknown origin with no device says nothing rather than guess', () => {
	expect(
		recordingSource({ originPlatform: 'unknown', deviceName: null }),
	).toBeNull()
	expect(
		recordingSource({ originPlatform: 'unknown', deviceName: 'Wahoo ELEMNT' }),
	).toEqual({ text: 'Wahoo ELEMNT', owed: false })
})

test("the derived-data line is Garmin's own words, once per owed platform", () => {
	expect(derivedAttributionLines(['garmin'])).toEqual([
		'Insights derived in part from Garmin device-sourced data.',
	])
	expect(derivedAttributionLines(['upload', 'strava'])).toEqual([])
	expect(derivedAttributionLines(['garmin', 'polar', 'garmin'])).toHaveLength(2)
})
