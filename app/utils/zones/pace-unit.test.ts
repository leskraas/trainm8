import { expect, test } from 'vitest'
import { distanceDurationSec, paceInDistanceUnit } from './pace-unit.ts'
import { resolvedPaceUnit } from './resolve.ts'

test('a swim pace target, authored in sec/km, reads as sec/100 m divided by ten', () => {
	// 1:40/100 m is stored as 1000 sec/km.
	expect(paceInDistanceUnit(1000, 'swim', 'pace')).toBe(100)
	expect(distanceDurationSec(100, 1000, 'swim', 'pace')).toBe(100)
	// 10 × 100 m @ 1:40/100 m is about 1000 s of work.
	expect(10 * distanceDurationSec(100, 1000, 'swim', 'pace')).toBe(1000)
})

test('a swim CSS-relative target already resolves in sec/100 m', () => {
	expect(paceInDistanceUnit(100, 'swim', 'zoneLabel')).toBe(100)
	expect(distanceDurationSec(100, 100, 'swim', 'zoneLabel')).toBe(100)
	// No target at all (the CSS fallback) is sec/100 m too.
	expect(distanceDurationSec(2000, 90, 'swim', null)).toBe(20 * 90)
})

test('a run pace stays sec/km, whatever the target kind', () => {
	expect(paceInDistanceUnit(300, 'run', 'pace')).toBe(300)
	expect(distanceDurationSec(5000, 300, 'run', 'pace')).toBe(1500)
	expect(distanceDurationSec(10000, 301.5, 'run', 'zoneLabel')).toBe(3015)
})

test('the resolver names the unit its paces are in', () => {
	// An authored pace, or one read off a per-km anchor, is per km on any
	// recipe…
	expect(resolvedPaceUnit('pace', 'css')).toBe('secPerKm')
	expect(resolvedPaceUnit('pacePct', 'thresholdPace')).toBe('secPerKm')
	expect(resolvedPaceUnit('racePace', 'css')).toBe('secPerKm')
	// …and a band's pace is in its anchor's unit.
	expect(resolvedPaceUnit('zoneLabel', 'css')).toBe('secPer100m')
	expect(resolvedPaceUnit('lactate', 'thresholdPace')).toBe('secPerKm')
	expect(resolvedPaceUnit(null, 'css')).toBe('secPer100m')
})
