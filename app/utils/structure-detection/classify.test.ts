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

test('bike classifies on power against FTP, uncapped', () => {
	const bike: DisciplineProfileForResolver = {
		...RUN_PROFILE,
		ftp: 250,
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
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneSystem: 'daniels-pace-5',
		zoneOverrides: null,
	}
	expect(
		resolveClassifier('run', bare, streamWith({ pace: [300], heartrate: [140] })),
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
