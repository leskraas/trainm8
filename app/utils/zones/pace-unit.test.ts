import { expect, test } from 'vitest'
import { distanceDurationSec, paceInDistanceUnit } from './pace-unit.ts'
import {
	type DisciplineProfileForResolver,
	resolveIntensity,
} from './resolve.ts'

test('a swim pace target, authored in sec/km, reads as sec/100 m divided by ten', () => {
	// 1:40/100 m is stored as 1000 sec/km.
	expect(paceInDistanceUnit(1000, 'swim', 'secPerKm')).toBe(100)
	expect(distanceDurationSec(100, 1000, 'swim', 'secPerKm')).toBe(100)
	// 10 × 100 m @ 1:40/100 m is about 1000 s of work.
	expect(10 * distanceDurationSec(100, 1000, 'swim', 'secPerKm')).toBe(1000)
})

test('a swim CSS-relative target already resolves in sec/100 m', () => {
	expect(paceInDistanceUnit(100, 'swim', 'secPer100m')).toBe(100)
	expect(distanceDurationSec(100, 100, 'swim', 'secPer100m')).toBe(100)
	// No unit at all (the CSS fallback) is the discipline's own unit.
	expect(distanceDurationSec(2000, 90, 'swim', null)).toBe(20 * 90)
})

test('a run pace stays sec/km', () => {
	expect(paceInDistanceUnit(300, 'run', 'secPerKm')).toBe(300)
	expect(distanceDurationSec(5000, 300, 'run', 'secPerKm')).toBe(1500)
	expect(distanceDurationSec(10000, 301.5, 'run', null)).toBe(3015)
})

const swim: DisciplineProfileForResolver = {
	lthr: null,
	maxHr: null,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: 100,
	zoneSystem: 'css-5',
	zoneOverrides: null,
	raceAnchorPaces: { '5k': 240 },
}

test('the resolver names the unit its paces are in', () => {
	const unit = (target: Parameters<typeof resolveIntensity>[0]) =>
		resolveIntensity(target, swim).paceUnit
	// An authored pace, or one read off a per-km anchor, is per km on any
	// recipe, a CSS one included…
	expect(unit({ kind: 'pace', minSecPerKm: 1000 })).toBe('secPerKm')
	expect(unit({ kind: 'pacePct', minPct: 95 })).toBe('secPerKm')
	expect(unit({ kind: 'racePace', event: '5k' })).toBe('secPerKm')
	// …and a band's pace is in its anchor's unit.
	expect(unit({ kind: 'zoneLabel', label: 'Z3' })).toBe('secPer100m')
	// A target that resolves to no pace names no unit.
	expect(unit({ kind: 'hrBpm', min: 150 })).toBeUndefined()
})
