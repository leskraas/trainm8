import { expect, test } from 'vitest'
import { originPlatformOf } from '#app/integrations/shared/origin-platform.ts'
import { sourceTerms } from './source-terms.ts'

// ADR 0098 §3, row by row.

test('Garmin data may be shown, with the Garmin attribution', () => {
	expect(sourceTerms(['garmin'], 'screen')).toEqual({
		allowed: true,
		attributions: ['garmin'],
	})
})

test('Garmin data reaches a model only with its Garmin credit', () => {
	expect(sourceTerms(['garmin'], 'model')).toEqual({
		allowed: true,
		attributions: ['garmin'],
	})
	expect(sourceTerms(['garmin', 'strava'], 'model')).toEqual({
		allowed: false,
		platforms: ['strava'],
	})
})

test('Polar data is shown crediting Polar, and closed to a model without its opt-in', () => {
	expect(sourceTerms(['polar'], 'screen')).toEqual({
		allowed: true,
		attributions: ['polar'],
	})
	expect(sourceTerms(['polar'], 'model')).toEqual({
		allowed: false,
		platforms: ['polar'],
	})
})

test('Polar data reaches a model once the athlete has opted in to Polar, with the Polar credit (#555)', () => {
	expect(sourceTerms(['polar'], 'model', { optIns: ['polar'] })).toEqual({
		allowed: true,
		attributions: ['polar'],
	})
	// The opt-in is Polar's alone: it opens nothing else in the binding set.
	expect(
		sourceTerms(['polar', 'strava'], 'model', { optIns: ['polar'] }),
	).toEqual({ allowed: false, platforms: ['strava'] })
	expect(sourceTerms(['polar', 'garmin'], 'model', { optIns: [] })).toEqual({
		allowed: false,
		platforms: ['polar'],
	})
})

test('an opt-in cannot open a platform whose terms bar a model whatever the athlete says', () => {
	for (const platform of [
		'strava',
		'apple-health',
		'health-connect',
		'unknown',
		'coros',
	] as const) {
		expect(sourceTerms([platform], 'model', { optIns: [platform] })).toEqual({
			allowed: false,
			platforms: [platform],
		})
	}
})

test('Strava data is shown and never reaches a model', () => {
	expect(sourceTerms(['strava'], 'screen')).toEqual({
		allowed: true,
		attributions: [],
	})
	expect(sourceTerms(['strava'], 'model')).toEqual({
		allowed: false,
		platforms: ['strava'],
	})
})

test("the athlete's own file and Intervals.icu's own activities are open everywhere, unattributed", () => {
	for (const surface of ['screen', 'model', 'export'] as const) {
		expect(sourceTerms(['upload', 'intervalsicu'], surface)).toEqual({
			allowed: true,
			attributions: [],
		})
	}
})

test('no rule, no model: unknown and unlisted platforms are closed to a model', () => {
	expect(sourceTerms(['unknown', 'coros', 'zwift'], 'model')).toEqual({
		allowed: false,
		platforms: ['coros', 'unknown', 'zwift'],
	})
	// A stored value this code does not know is read as `unknown`.
	expect(
		sourceTerms([originPlatformOf('some-future-vendor')], 'model'),
	).toEqual({
		allowed: false,
		platforms: ['unknown'],
	})
	expect(
		sourceTerms([originPlatformOf('some-future-vendor')], 'screen'),
	).toEqual({
		allowed: true,
		attributions: [],
	})
})

test('phone stores are closed to a model until the athlete names the AI', () => {
	expect(sourceTerms(['apple-health', 'health-connect'], 'model')).toEqual({
		allowed: false,
		platforms: ['apple-health', 'health-connect'],
	})
})

test('a derived value needs every platform behind it to allow the surface, and carries every attribution', () => {
	expect(
		sourceTerms(['upload', 'garmin', 'polar', 'garmin'], 'screen'),
	).toEqual({ allowed: true, attributions: ['garmin', 'polar'] })
	// One closed platform closes the whole value, naming only the closers.
	expect(sourceTerms(['upload', 'strava', 'intervalsicu'], 'model')).toEqual({
		allowed: false,
		platforms: ['strava'],
	})
})

test("the athlete's export is always allowed, and keeps the attributions", () => {
	expect(sourceTerms(['strava', 'garmin', 'unknown'], 'export')).toEqual({
		allowed: true,
		attributions: ['garmin'],
	})
})

test('an empty binding set — plan-side or athlete-entered — is open everywhere', () => {
	expect(sourceTerms([], 'model')).toEqual({ allowed: true, attributions: [] })
})
