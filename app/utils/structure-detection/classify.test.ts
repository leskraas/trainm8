import { expect, test } from 'vitest'
import { type ActivityStream } from '../activity-stream.ts'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import { resolveClassifier } from './classify.ts'

// ── Zone classification (ADR 0035) ───────────────────────────────────────────
// The read-time inverse of the intensity resolver: place a measured value in its
// band on the discipline's anchor channel (bike→power, run→pace, HR fallback).
// The band index is internal (for the honesty gate); the stored target is the
// concrete measured metric, never a zone label.

const streamWith = (channels: Partial<ActivityStream>): ActivityStream => ({
	resolutionSec: 5,
	timeSec: [0, 5, 10],
	...channels,
})

const RUN_PROFILE: DisciplineProfileForResolver = {
	lthr: 160,
	maxHr: 190,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'daniels-pace-5',
	zoneOverrides: null,
}

test('run classifies on pace when the threshold pace is present, uncapped', () => {
	const c = resolveClassifier('run', RUN_PROFILE, streamWith({ pace: [300] }))!
	expect(c.channel).toBe('pace')
	expect(c.hrCapped).toBe(false)
	expect(c.inverted).toBe(true) // faster (smaller) pace is harder
	// 230 s/km is Daniels I (harder) vs 360 s/km E (easier): higher band index.
	expect(c.bandIndex(230)).toBeGreaterThan(c.bandIndex(360))
	expect(c.measuredTarget(230)).toEqual({ kind: 'pace', minSecPerKm: 230 })
})

test('run classifies on running power when a critical-power threshold is set, uncapped (ADR 0038)', () => {
	const runPower: DisciplineProfileForResolver = {
		...RUN_PROFILE,
		runPowerThresholdW: 250,
		zoneSystem: 'stryd-run-power-5',
	}
	const c = resolveClassifier(
		'run',
		runPower,
		streamWith({ power: [200], pace: [300] }),
	)!
	expect(c.channel).toBe('power')
	expect(c.hrCapped).toBe(false) // running power is direct, not a lagging proxy
	expect(c.inverted).toBe(false) // more power is harder
	// 300 W is Stryd Z5 (harder) vs 150 W Z1 (easier): higher band index.
	expect(c.bandIndex(300)).toBeGreaterThan(c.bandIndex(150))
	expect(c.measuredTarget(280)).toEqual({ kind: 'power', minW: 280 })
})

test('run prefers power over pace when both thresholds are set (power-first, ADR 0038)', () => {
	const both: DisciplineProfileForResolver = {
		...RUN_PROFILE,
		runPowerThresholdW: 250, // set alongside the threshold pace (240)
	}
	const c = resolveClassifier(
		'run',
		both,
		streamWith({ power: [200], pace: [300] }),
	)!
	expect(c.channel).toBe('power')
	expect(c.hrCapped).toBe(false)
})

test('run falls back to pace when a run-power threshold is set but the stream has no power', () => {
	const runPower: DisciplineProfileForResolver = {
		...RUN_PROFILE,
		runPowerThresholdW: 250,
	}
	const c = resolveClassifier('run', runPower, streamWith({ pace: [300] }))!
	expect(c.channel).toBe('pace')
	expect(c.hrCapped).toBe(false)
})

test('bike classifies on power against FTP, uncapped', () => {
	const bike: DisciplineProfileForResolver = {
		...RUN_PROFILE,
		ftp: 250,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: null,
		zoneSystem: 'coggan-power-7',
	}
	const c = resolveClassifier('bike', bike, streamWith({ power: [200] }))!
	expect(c.channel).toBe('power')
	expect(c.hrCapped).toBe(false)
	expect(c.inverted).toBe(false) // more power is harder
	expect(c.bandIndex(300)).toBeGreaterThan(c.bandIndex(150))
	expect(c.measuredTarget(280)).toEqual({ kind: 'power', minW: 280 })
})

test('a missing anchor threshold ladders to HR and caps the grade', () => {
	const noPaceThreshold: DisciplineProfileForResolver = {
		...RUN_PROFILE,
		thresholdPaceSecPerKm: null,
	}
	const c = resolveClassifier(
		'run',
		noPaceThreshold,
		streamWith({ pace: [300], heartrate: [140] }),
	)!
	expect(c.channel).toBe('heartrate')
	expect(c.hrCapped).toBe(true)
	expect(c.measuredTarget(168)).toEqual({ kind: 'hrBpm', min: 168 })
})

test('no anchor threshold and no HR fallback resolves to null', () => {
	const bare: DisciplineProfileForResolver = {
		lthr: null,
		maxHr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneSystem: 'daniels-pace-5',
		zoneOverrides: null,
	}
	expect(
		resolveClassifier(
			'run',
			bare,
			streamWith({ pace: [300], heartrate: [140] }),
		),
	).toBeNull()
})

test('the anchor channel must be present in the stream to classify on it', () => {
	// Threshold pace is set, but there is no pace channel — fall to HR.
	const c = resolveClassifier(
		'run',
		RUN_PROFILE,
		streamWith({ heartrate: [140] }),
	)!
	expect(c.channel).toBe('heartrate')
	expect(c.hrCapped).toBe(true)
})
